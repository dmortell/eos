// Shape CLIPBOARD + arrange helpers (moved out of +page.svelte). Pure; tested in clipboard.test.ts.
//   Clipboard   holds plain snapshots of copied shapes (persists across tabs); each paste of the same copy
//               lands a further offset away (stacking), with fresh ids and each copied GROUP given a new id.
//   arrange     draw order = array position (later = painted on top): front/back jump to the ends,
//               forward/backward step the selection past one non-selected neighbour.
//   setGroup    put shapes in one new group, or ungroup them.
import { translate, isNote, migrateNote, type Ent, type Pt } from './geometry'
import type { Obj } from '../3dview/types'

export class Clipboard {
	#items: Ent[] = []
	#objs: Obj[] = []
	#layers: ClipLayers = {}
	#pastes = 0
	/** The model the copy came from (unset = the system clipboard: another tab / project / the Sheets tool). */
	#src: string | undefined
	get empty() { return !this.#items.length && !this.#objs.length }
	get items(): readonly Ent[] { return this.#items }
	get objs(): readonly Obj[] { return this.#objs }
	/** Copy (pass PLAIN snapshots — `$state.snapshot` them first). `objs` = 3D model objects (walls, boxes, conduits…),
	 *  `layers` = their layers' names by id, so a paste into another model finds the matching layer. */
	copy(ents: Ent[], objs: Obj[] = [], layers: ClipLayers = {}, src?: string) { this.#items = ents; this.#objs = objs; this.#layers = layers; this.#src = src; this.#pastes = 0 }
	/** What the SYSTEM clipboard held (another tab / project): taken over unless it's what's already held (then the
	 *  paste stacking continues). */
	load(ents: Ent[], objs: Obj[] = [], layers: ClipLayers = {}) {
		if (clipText(ents, objs) !== clipText(this.#items, this.#objs)) this.copy(ents, objs, layers)
	}
	/** The shapes for the next paste, `stepMm` further along each time (the caller sizes it: 5 paper mm × the
	 *  viewport's scale N). */
	paste(stepMm: number, newId: () => string, target?: string): Ent[] { return this.pasteAll(stepMm, newId, target).ents }
	/** The shapes AND 3D objects for the next paste (fresh ids; attachments between copied things re-pointed).
	 *  Offset only when pasting back into the model it was copied from (`target` = that model: each paste steps further,
	 *  so copies don't land on the original); into any other model, tab or project it keeps its exact position.
	 *  `at` (paste at the cursor): the content's centre lands there instead (drawing coords; objects move in plan). */
	pasteAll(stepMm: number, newId: () => string, target?: string, at?: Pt): { ents: Ent[]; objs: Obj[]; layers: ClipLayers } {
		if (this.empty) return { ents: [], objs: [], layers: {} }
		this.#pastes++
		const entIds = new Map<string, string>(), c = at ? contentCentre(this.#items, this.#objs) : null
		const off: number | [number, number] = at && c ? [at[0] - c[0], at[1] - c[1]] : this.#src != null && target === this.#src ? stepMm * this.#pastes : 0
		const ents = pasteCopies(this.#items, off, newId).map((c, i) => (entIds.set(this.#items[i].id, c.id), c))
		return { ents, objs: pasteObjCopies(this.#objs, off, newId, entIds), layers: this.#layers }
	}
}
/** A copied 3D object's layer names, by layer id. */
export type ClipLayers = Record<string, string>

/** 3D objects for a paste: moved `off` mm in plan (x and y), fresh object ids, groups kept together under new group
 *  ids. A conduit end attached to a copied box / outlet follows the copy; attached to anything NOT copied it's let go
 *  (the copy would otherwise snap back onto the original). A device keeps its rack only if the rack came too. */
/** An offset: the same on both axes, or [dx, dy]. */
const ox = (o: number | [number, number]) => (typeof o === 'number' ? o : o[0]), oy = (o: number | [number, number]) => (typeof o === 'number' ? o : o[1])
export function pasteObjCopies(objs: readonly Obj[], off: number | [number, number], newId: () => string, entIds: Map<string, string> = new Map()): Obj[] {
	const ids = new Map(objs.filter((o) => o.id).map((o) => [o.id!, newId()])), gids = new Map<string, string>()
	return objs.map((o) => {
		const c = structuredClone(o) as Obj
		if (o.id) c.id = ids.get(o.id)
		if (c.groupId) { if (!gids.has(c.groupId)) gids.set(c.groupId, newId()); c.groupId = gids.get(c.groupId) }
		if (c.type === 'prism') { c.x += ox(off); c.y += oy(off) }
		else for (const n of c.nodes) {
			n.x += ox(off); n.y += oy(off)
			if (!n.conn) continue
			const to = n.conn.ent ? entIds.get(n.conn.ent) : n.conn.obj ? ids.get(n.conn.obj) : undefined
			if (to) n.conn = n.conn.ent ? { ent: to } : { ...n.conn, obj: to }
			else delete n.conn
		}
		if (c.device) { const r = ids.get(c.device.rackId); if (r) c.device = { ...c.device, rackId: r } }
		return c
	})
}
/** A pasted object's layer in the TARGET model: the same id if it has one, else the layer of the same name, else
 *  none (it falls back to the model's first layer). */
export function resolvePastedLayer(layer: string | undefined, names: ClipLayers, target: { id: string; name: string }[]): string | undefined {
	if (!layer || target.some((l) => l.id === layer)) return layer
	const n = names[layer]
	return n ? target.find((l) => l.name === n)?.id : undefined
}

// ── the SYSTEM clipboard: copied shapes also go out as marked JSON text, so another browser tab / project can
// paste them (its paste event reads them back) ──
const CLIP_MARK = 'eos-pages-shapes'
/** Shapes → clipboard text. */
export const clipText = (ents: readonly Ent[], objs: readonly Obj[] = [], layers: ClipLayers = {}) =>
	JSON.stringify(objs.length ? { [CLIP_MARK]: 1, ents, objs, layers } : { [CLIP_MARK]: 1, ents })
/** Clipboard text → shapes, or null when it isn't ours. */
export function fromClipText(text: string): Ent[] | null { return fromClipData(text)?.ents ?? null }
/** Clipboard text → shapes + 3D objects (+ their layer names), or null when it isn't ours. */
export function fromClipData(text: string): { ents: Ent[]; objs: Obj[]; layers: ClipLayers } | null {
	if (!text.includes(CLIP_MARK)) return null
	try {
		const o = JSON.parse(text); if (!o?.[CLIP_MARK] || !Array.isArray(o.ents)) return null
		const ents = (o.ents as Ent[]).filter((e) => e && typeof e.id === 'string' && typeof e.type === 'string').map(migrateNote)
		const objs = Array.isArray(o.objs) ? (o.objs as Obj[]).filter((x) => x && ['prism', 'wall', 'conduit'].includes(x.type)) : []
		return { ents, objs, layers: o.layers && typeof o.layers === 'object' ? o.layers : {} }
	} catch { return null }
}

// ── office apps (Word / Excel / Notepad): copied shapes also go out as readable text + HTML (a note's table as a real
// <table>, so Excel gets cells); our own shape data rides inside the HTML as a comment. Text from other apps pastes
// in as a text shape (one line) or a NOTE (several lines; tab-separated cells → a markdown table). ──
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
/** The readable content of shapes: texts, notes (markdown), dimension figures (their text / nothing), block labels. */
export function readable(ents: readonly Ent[]): { plain: string; html: string } {
	const plain: string[] = [], html: string[] = []
	for (const e of ents) {
		const t = e.type === 'text' ? e.text ?? '' : e.type === 'insert' ? e.attrs?.LABEL ?? '' : e.type === 'dim' && e.text ? e.text : ''
		if (!t.trim()) continue
		if (isNote(e)) {   // markdown → TSV lines for plain, <table>/<p> for HTML
			const rows: string[][] = []
			const flush = () => { if (!rows.length) return; html.push('<table border="1">' + rows.map((r) => '<tr>' + r.map((c) => `<td>${esc(c)}</td>`).join('') + '</tr>').join('') + '</table>'); rows.length = 0 }
			for (const ln of t.split('\n')) {
				const s = ln.trim()
				if (s.startsWith('|')) { const cells = s.replace(/^\||\|$/g, '').split('|').map((c) => c.trim()); if (!cells.every((c) => /^:?-{2,}:?$/.test(c))) { rows.push(cells); plain.push(cells.join('\t')) } continue }
				flush(); const txt = s.replace(/^#{1,3}\s+/, '').replace(/\*\*(.+?)\*\*/g, '$1'); plain.push(txt); if (txt) html.push(/^#/.test(s) ? `<p><b>${esc(txt)}</b></p>` : `<p>${esc(txt)}</p>`)
			}
			flush()
		} else { plain.push(t); html.push(`<p>${esc(t).replace(/\n/g, '<br>')}</p>`) }
	}
	return { plain: plain.join('\n'), html: html.join('') }
}
const HTML_MARK = 'eos-pages-shapes:'
/** UTF-8 safe base64 (btoa is Latin-1 only). */
function toB64(s: string): string { const u = new TextEncoder().encode(s); let b = ''; for (let i = 0; i < u.length; i += 0x8000) b += String.fromCharCode(...u.subarray(i, i + 0x8000)); return btoa(b) }
const fromB64 = (b: string) => new TextDecoder().decode(Uint8Array.from(atob(b), (c) => c.charCodeAt(0)))
/** Shapes → clipboard HTML: the readable part + our data hidden in a comment (base64 JSON). */
export function clipHtml(ents: readonly Ent[], objs: readonly Obj[] = [], layers: ClipLayers = {}): string {
	const b64 = toB64(clipText(ents, objs, layers))
	return `<!--${HTML_MARK}${b64}-->` + readable(ents).html
}
/** Clipboard HTML → our shapes, or null. */
export function fromClipHtml(html: string): Ent[] | null { return fromClipHtmlData(html)?.ents ?? null }
/** Clipboard HTML → our shapes + 3D objects, or null. */
export function fromClipHtmlData(html: string): ReturnType<typeof fromClipData> {
	const m = new RegExp(`<!--${HTML_MARK}([A-Za-z0-9+/=]+)-->`).exec(html); if (!m) return null
	try { return fromClipData(fromB64(m[1])) } catch { return null }
}
/** Text from another app → a text shape's text (one line) or a NOTE's markdown (tab-separated cells → a table). */
export function textToShape(text: string): { kind: 'text' | 'note'; text: string } | null {
	const lines = text.replace(/\r/g, '').split('\n'); while (lines.length && !lines[lines.length - 1].trim()) lines.pop()
	if (!lines.some((l) => l.trim())) return null
	if (lines.some((l) => l.includes('\t'))) {   // Excel / a table: the first row is the header
		const rows = lines.map((l) => l.split('\t').map((c) => c.trim().replace(/\|/g, '/')))
		const n = Math.max(...rows.map((r) => r.length)), row = (r: string[]) => '| ' + Array.from({ length: n }, (_, i) => r[i] ?? '').join(' | ') + ' |'
		return { kind: 'note', text: [row(rows[0]), '|' + ' --- |'.repeat(n), ...rows.slice(1).map(row)].join('\n') }
	}
	return lines.length === 1 ? { kind: 'text', text: lines[0].trim() } : { kind: 'note', text: lines.join('\n') }
}

/** Copies moved by `off` (x and y) with fresh ids; members of one copied group share one NEW group id. */
export function pasteCopies(items: Ent[], off: number | [number, number], newId: () => string): Ent[] {
	const gids = new Map<string, string>()
	return items.map((e) => {
		let gid = e.groupId
		if (gid) { if (!gids.has(gid)) gids.set(gid, newId()); gid = gids.get(gid) }
		return { ...translate(e, ox(off), oy(off)), id: newId(), groupId: gid }
	})
}

/** E12: the first label not in `taken` — a trailing number counts on (4A013 → 4A014, padding kept), anything
 *  else gets "-copy" (then "-copy2", …). A label nobody has is returned as is. */
export function nextFreeLabel(label: string, taken: Set<string>): string {
	if (!taken.has(label)) return label
	const m = /^(.*?)(\d+)(\D*)$/.exec(label)
	if (m) for (let n = Number(m[2]) + 1; ; n++) { const s = m[1] + String(n).padStart(m[2].length, '0') + m[3]; if (!taken.has(s)) return s }
	for (let i = 1; ; i++) { const s = `${label}-copy${i > 1 ? i : ''}`; if (!taken.has(s)) return s }
}
/** Copies of labelled blocks (an outlet's LABEL attribute) renamed so no two shapes share a label with
 *  `existing` (the shapes already in the model, originals included). Unlabelled copies pass through. */
export function relabelCopies(copies: Ent[], existing: Ent[]): Ent[] {
	const taken = new Set(existing.map((e) => e.attrs?.LABEL).filter((l): l is string => !!l))
	return copies.map((c) => {
		const l = c.attrs?.LABEL; if (!l) return c
		const n = nextFreeLabel(l, taken); taken.add(n)
		return n === l ? c : { ...c, attrs: { ...c.attrs, LABEL: n } }
	})
}

export type ArrangeOp = 'front' | 'back' | 'forward' | 'backward'
/** The shapes reordered for `op` on the selection `ids`; null when nothing selected is in the list. */
export function arrange(arr: Ent[], ids: string[], op: ArrangeOp): Ent[] | null {
	const s = new Set(ids)
	if (!ids.length || !arr.some((e) => s.has(e.id))) return null
	if (op === 'front' || op === 'back') {
		const moved = arr.filter((e) => s.has(e.id)), rest = arr.filter((e) => !s.has(e.id))
		return op === 'front' ? [...rest, ...moved] : [...moved, ...rest]
	}
	const next = [...arr]
	if (op === 'forward') { for (let i = next.length - 2; i >= 0; i--) if (s.has(next[i].id) && !s.has(next[i + 1].id)) [next[i], next[i + 1]] = [next[i + 1], next[i]] }
	else { for (let i = 1; i < next.length; i++) if (s.has(next[i].id) && !s.has(next[i - 1].id)) [next[i], next[i - 1]] = [next[i - 1], next[i]] }
	return next
}

/** The shapes with `ids` put in group `gid` (undefined = ungrouped). */
export const setGroup = (arr: Ent[], ids: string[], gid: string | undefined): Ent[] => {
	const s = new Set(ids)
	return arr.map((e) => (s.has(e.id) ? { ...e, groupId: gid } : e))
}
/** The centre of copied content's extent (drawing / plan coords): the shapes' points, else the objects' plan footprints. */
export function contentCentre(ents: readonly Ent[], objs: readonly Obj[]): Pt | null {
	const xs: number[] = [], ys: number[] = []
	const add = (p?: Pt) => { if (p) { xs.push(p[0]); ys.push(p[1]) } }
	for (const e of ents) { add(e.a); add(e.b); e.pts?.forEach(add) }
	if (!xs.length) for (const o of objs) { if (o.type === 'prism') { add([o.x, o.y]); add([o.x + o.w, o.y + o.d]) } else o.nodes.forEach((n) => add([n.x, n.y])) }
	return xs.length ? [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2] : null
}
