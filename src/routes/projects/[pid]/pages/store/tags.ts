// Drawing TAGS (tree-views-plan §3.3): free text on each sheet, with SUGGESTIONS from a global vocabulary (every
// tag ever used, across all projects — `settings/pagesTags`, store/globalTags.svelte.ts) merged with the project's
// own tags and a few defaults. Tags compare case-insensitively ("AV" = "av"); the first spelling wins. Plus the
// cheap AUTO-SUGGEST for a sheet's kind / category / tags (never applied by itself — Properties offers it).
// Pure; tested in tags.test.ts.
import type { SheetKind } from './schema'

/** Offered even before anyone has used them (tree-views-plan §3.3). */
export const DEFAULT_TAGS = ['high-level', 'low-level', 'AV', 'server-room', 'riser', 'rack']

/** A tag as stored: trimmed, inner whitespace collapsed ('' = not a tag). */
export const normTag = (t: string) => t.trim().replace(/\s+/g, ' ')
const key = (t: string) => normTag(t).toLowerCase()
export const hasTag = (tags: readonly string[], t: string) => tags.some((x) => key(x) === key(t))

/** `base` + the tags of `add` it doesn't have yet (case-insensitive; base spellings and order kept, blanks dropped). */
export function mergeTags(base: readonly string[], add: readonly string[]): string[] {
	const out: string[] = [], seen = new Set<string>()
	for (const t of [...base, ...add]) { const n = normTag(t), k = n.toLowerCase(); if (n && !seen.has(k)) { seen.add(k); out.push(n) } }
	return out
}
/** `tags` without `drop` (case-insensitive). */
export const withoutTags = (tags: readonly string[], drop: readonly string[]) => tags.filter((t) => !hasTag(drop, t))

/** What the picker offers for `q`: every pool's tags merged (first spelling wins), minus those already on the item,
 *  matching `q` anywhere (prefix matches first, then alphabetical); at most `max`. */
export function tagSuggestions(pools: readonly (readonly string[])[], q: string, exclude: readonly string[] = [], max = 8): string[] {
	const all = mergeTags([], pools.flat()).filter((t) => !hasTag(exclude, t))
	const k = key(q)
	const hits = k ? all.filter((t) => t.toLowerCase().includes(k)) : all
	const cmp = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
	return hits.sort((a, b) => Number(!a.toLowerCase().startsWith(k)) - Number(!b.toLowerCase().startsWith(k)) || cmp.compare(a, b)).slice(0, max)
}

// ── auto-suggest (tree-views-plan §3.3): proposes, never forces ──
export type SheetMetaHint = { kind?: SheetKind; category?: string; tags: string[] }
const ELEV_DIRS = new Set(['front', 'rear', 'left', 'right'])
/** A kind / category / tags a sheet probably wants, from its title and its viewports (only for fields it doesn't
 *  have yet): viewports looking at a rack row from the side → an elevation of racks; at a building → of risers; other
 *  side views → an elevation; plan views → a plan; "Outlets …" / "Trunks …" titles → those kinds; "high level" /
 *  "low level" / "AV" / "server room" in the title → those tags. */
export function suggestSheetMeta(s: { title: string; kind?: string; category?: string; tags?: string[]; frames: { direction: string; modelId?: string }[] },
	modelKind: (id: string) => string | undefined = () => undefined): SheetMetaHint {
	const out: SheetMetaHint = { tags: [] }
	const t = s.title ?? ''
	const elev = s.frames.filter((f) => ELEV_DIRS.has(f.direction))
	const mk = new Set(elev.map((f) => (f.modelId ? modelKind(f.modelId) : undefined)))
	let kind: SheetKind | undefined, category: string | undefined
	if (/outlet/i.test(t)) kind = 'outlets'
	else if (/trunk|containment|conduit/i.test(t)) kind = 'trunks'
	else if (/schedule/i.test(t)) kind = 'schedule'
	else if (/detail/i.test(t)) kind = 'detail'
	else if (elev.length && elev.length >= s.frames.length / 2) kind = 'elevation'
	else if (s.frames.some((f) => f.direction === 'plan')) kind = 'plan'
	else if (/elevation/i.test(t)) kind = 'elevation'
	if (elev.length && mk.has('rack')) category = 'racks'
	else if (elev.length && mk.has('building')) category = 'risers'
	else if (/riser/i.test(t)) category = 'risers'
	else if (/\brack/i.test(t)) category = 'racks'
	if (kind && !s.kind) out.kind = kind
	if (category && !s.category?.trim() && (s.kind ?? kind) === 'elevation') out.category = category
	const cur = s.tags ?? []
	const want: [RegExp, string][] = [[/high[\s-]?level|\bHL\b/i, 'high-level'], [/low[\s-]?level|\bLL\b/i, 'low-level'], [/\bAV\b/, 'AV'], [/server[\s-]?room/i, 'server-room']]
	for (const [re, tag] of want) if (re.test(t) && !hasTag(cur, tag)) out.tags.push(tag)
	return out
}
