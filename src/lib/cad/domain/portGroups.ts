// LABELLED PORT RANGES on a panel (User 2026-10-10: a 1U 48-port panel at P3A U41 — its top 24 ports tie to R301,
// its bottom 24 to R302, each half with its own label). A port in a range is labelled "<range label>:NN", NN counted
// from the range's first port: the 25th port of a panel whose bottom half is "P3A-R302" is "P3A-R302:01". The label
// shows at both ends of the port's tie / backbone (ProjectIndex.portLabel). A range with no label of its own takes it
// from its cables — "<this rack>-<the rack they go to>" — worked out each time (User split before linking and got
// "P3A-R301-A"). Pure; tested in portGroups.test.ts.
import type { Device, PortGroup } from './types'
import type { ProjectIndex } from './project'

/** The range a port is in, and its number within it (1-based). */
export function groupOf(d: Device, port: number): { g: PortGroup; n: number } | undefined {
	const g = d.panel?.groups?.find((x) => port >= x.from && port <= x.to)
	return g ? { g, n: port - g.from + 1 } : undefined
}

/** Each index's worked-out range labels, by device and range (the index never changes once built). */
const made = new WeakMap<ProjectIndex, Map<string, string>>()

/** A range's label: its own, else from its cables — "P3A-R301" when they all go to one other rack — else the panel's
 *  name with the range's letter (P3A-41-A). */
export function rangeLabel(ix: ProjectIndex, d: Device, g: PortGroup): string {
	if (g.label) return g.label
	let byIx = made.get(ix)
	if (!byIx) made.set(ix, (byIx = new Map()))
	const key = `${d.id}:${g.from}-${g.to}`, hit = byIx.get(key)
	if (hit !== undefined) return hit
	const far = new Set<string>()
	for (let p = g.from; p <= g.to; p++) {
		const f = ix.farEnd({ on: d.id, port: p }), fd = f && ix.get(f.on)
		if (fd?.type === 'device' && fd.rackId !== d.rackId) far.add(ix.nameOf(fd.rackId))
	}
	const i = Math.max(0, (d.panel?.groups ?? []).findIndex((x) => x.from === g.from && x.to === g.to))
	const label = far.size === 1 ? `${ix.nameOf(d.rackId)}-${[...far][0]}` : `${d.name}-${String.fromCharCode(65 + i)}`
	byIx.set(key, label)
	return label
}

/** "P3A-R302:01" — the label a port in a range shows, or '' (not in one). */
export function groupPortLabel(ix: ProjectIndex, d: Device, port: number): string {
	const at = groupOf(d, port)
	return at ? `${rangeLabel(ix, d, at.g)}:${String(at.n).padStart(2, '0')}` : ''
}

/** Why these ranges can't be saved (a range off the panel, back to front or overlapping another), or null. */
export function groupsProblem(groups: PortGroup[], portCount: number): string | null {
	for (const g of groups) {
		if (!Number.isInteger(g.from) || !Number.isInteger(g.to) || g.from < 1 || g.to > portCount) return `Ports ${g.from}–${g.to} aren't on this ${portCount}-port panel`
		if (g.from > g.to) return `Ports ${g.from}–${g.to}: the first port comes after the last`
	}
	const s = [...groups].sort((a, b) => a.from - b.from)
	for (let i = 1; i < s.length; i++) if (s[i].from <= s[i - 1].to) return `Ports ${s[i].from}–${s[i - 1].to} are in two ranges`
	return null
}

/** The panel split into `parts` equal ranges (a 48-port panel in two: 1–24, 25–48), labelled from their cables. */
export function splitPanel(d: Device, parts: number): PortGroup[] {
	const size = Math.ceil(d.portCount / parts)
	return Array.from({ length: parts }, (_, i) => ({ from: i * size + 1, to: Math.min(d.portCount, (i + 1) * size) })).filter((g) => g.from <= g.to)
}
