// The COMMAND PALETTE's search (backlog 34, Kestrel B2 — User 2026-11-24): Ctrl+K opens one box that finds both WHERE
// TO GO (what the Navigator's search finds: levels, views, sheets, their viewports, rooms, racks, devices, outlets) and
// WHAT TO DO (every menu command, by its menu path: "Cabling › New server room…"). Pure; tested in palette.test.ts.
import type { NavNode, FindItem } from './navTree'

/** A menu item as the palette lists it (from ui/cadMenus.ts `buildMenus`, flattened). */
export interface PaletteCmd { key: string; label: string; path: string; shortcut?: string; title?: string; run: () => void }

type Item = { label: string; key?: string; title?: string; disabled?: boolean; run?: () => void; children?: Item[] } | '-'

/** Every enabled menu command, its path through the menus ("Drawings › Sheets › New sheet"), in menu order. */
export function menuCommands(menus: { label: string; items: Item[] }[]): PaletteCmd[] {
	const out: PaletteCmd[] = []
	const walk = (items: Item[], trail: string[]) => {
		for (const it of items) {
			if (it === '-' || it.disabled) continue
			if (it.children) { walk(it.children, [...trail, it.label]); continue }
			if (!it.run) continue
			const path = [...trail, it.label].join(' › ')
			out.push({ key: `cmd:${path}`, label: it.label, path, ...(it.key ? { shortcut: it.key } : {}), ...(it.title ? { title: it.title } : {}), run: it.run })
		}
	}
	for (const m of menus) walk(m.items, [m.label])
	return out
}

/** How well text matches the words typed: every word somewhere in it (else 0); more for the first word starting the
 *  text or a word in it. */
export function matchScore(text: string, q: string): number {
	const t = text.toLowerCase(), words = q.trim().toLowerCase().split(/\s+/).filter(Boolean)
	if (!words.length || !words.every((w) => t.includes(w))) return 0
	const w0 = words[0]
	return t.startsWith(w0) ? 3 : new RegExp(`(^|[\\s›·(/-])${w0.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}`).test(t) ? 2 : 1
}

/** A place found, with where it sits in the Navigator ("Sheets › 1F › S006 IDF2 Rack Elevations" for a viewport). */
export interface PlaceHit { n: NavNode | FindItem; where: string }

/** The rows of a Navigator tree that open something AND match the search themselves (a match's parents, which the
 *  Navigator keeps for context, aren't hits), in tree order, each with its parents' labels; then the devices / outlets
 *  found (their own detail says where). */
export function placeHits(shown: NavNode[], finds: FindItem[], q: string): PlaceHit[] {
	const out: PlaceHit[] = []
	const hit = (n: NavNode) => matchScore(`${n.label} ${n.detail ?? ''}`, q) > 0
	const walk = (ns: NavNode[], trail: string[]) => { for (const n of ns) { if (n.open && hit(n)) out.push({ n, where: trail.join(' › ') }); walk(n.children ?? [], [...trail, n.label]) } }
	walk(shown, [])
	return [...out, ...finds.map((n) => ({ n, where: '' }))]
}

/** What the palette shows for a search: the places (in the Navigator's order) and the commands (best match first),
 *  each capped. An empty search shows nothing. */
export function paletteHits(q: string, places: PlaceHit[], cmds: PaletteCmd[], max = 8): { places: PlaceHit[]; cmds: PaletteCmd[] } {
	if (!q.trim()) return { places: [], cmds: [] }
	const ranked = cmds.map((c) => { const p = matchScore(c.path, q); return { c, s: p ? Math.max(p, matchScore(c.label, q) ? matchScore(c.label, q) + 1 : 0) : 0 } })
		.filter((x) => x.s > 0).sort((a, b) => b.s - a.s)
	return { places: places.slice(0, max), cmds: ranked.slice(0, max).map((x) => x.c) }
}
