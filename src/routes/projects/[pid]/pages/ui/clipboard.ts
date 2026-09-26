// Shape CLIPBOARD + arrange helpers (moved out of +page.svelte). Pure; tested in clipboard.test.ts.
//   Clipboard   holds plain snapshots of copied shapes (persists across tabs); each paste of the same copy
//               lands a further offset away (stacking), with fresh ids and each copied GROUP given a new id.
//   arrange     draw order = array position (later = painted on top): front/back jump to the ends,
//               forward/backward step the selection past one non-selected neighbour.
//   setGroup    put shapes in one new group, or ungroup them.
import { translate, isNote, migrateNote, type Ent } from './geometry'

export class Clipboard {
	#items: Ent[] = []
	#pastes = 0
	get empty() { return !this.#items.length }
	get items(): readonly Ent[] { return this.#items }
	/** Copy (pass PLAIN snapshots — `$state.snapshot` them first). */
	copy(ents: Ent[]) { this.#items = ents; this.#pastes = 0 }
	/** Shapes from the SYSTEM clipboard (another tab / project): taken over unless they're what's already held (then
	 *  the paste stacking continues). */
	load(ents: Ent[]) { if (clipText(ents) !== clipText(this.#items)) this.copy(ents) }
	/** The shapes for the next paste, `stepMm` further along each time (the caller sizes it: 5 paper mm × the
	 *  viewport's scale N). */
	paste(stepMm: number, newId: () => string): Ent[] {
		if (!this.#items.length) return []
		this.#pastes++
		return pasteCopies(this.#items, stepMm * this.#pastes, newId)
	}
}

// ── the SYSTEM clipboard: copied shapes also go out as marked JSON text, so another browser tab / project can
// paste them (its paste event reads them back) ──
const CLIP_MARK = 'eos-pages-shapes'
/** Shapes → clipboard text. */
export const clipText = (ents: readonly Ent[]) => JSON.stringify({ [CLIP_MARK]: 1, ents })
/** Clipboard text → shapes, or null when it isn't ours. */
export function fromClipText(text: string): Ent[] | null {
	if (!text.includes(CLIP_MARK)) return null
	try { const o = JSON.parse(text); return o?.[CLIP_MARK] && Array.isArray(o.ents) ? (o.ents as Ent[]).filter((e) => e && typeof e.id === 'string' && typeof e.type === 'string').map(migrateNote) : null } catch { return null }
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
export function clipHtml(ents: readonly Ent[]): string {
	const b64 = toB64(clipText(ents))
	return `<!--${HTML_MARK}${b64}-->` + readable(ents).html
}
/** Clipboard HTML → our shapes, or null. */
export function fromClipHtml(html: string): Ent[] | null {
	const m = new RegExp(`<!--${HTML_MARK}([A-Za-z0-9+/=]+)-->`).exec(html); if (!m) return null
	try { return fromClipText(fromB64(m[1])) } catch { return null }
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
export function pasteCopies(items: Ent[], off: number, newId: () => string): Ent[] {
	const gids = new Map<string, string>()
	return items.map((e) => {
		let gid = e.groupId
		if (gid) { if (!gids.has(gid)) gids.set(gid, newId()); gid = gids.get(gid) }
		return { ...translate(e, off, off), id: newId(), groupId: gid }
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
