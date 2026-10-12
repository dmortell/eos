// Renumber (ADR 0002, Dave: high priority, "any shape with a label"): give a run of labelled things consecutive numbers
// in one number group, in the order picked, in reading order, or in their current label order. Outlets carry the
// change into their port labels; racks change their name; shapes their label.
import type { Id, Pt } from './types'
import type { Entity } from './drawing'
import { setNumber, splitGroups, readingOrder, naturalCompare, numberAt, type RenumberOpts } from './labels'
import { renameOutlet } from './ports'

/** The text Renumber changes: an outlet's label, a rack's name, a shape's label, a sheet's number. */
export function labelOf(e: Entity | undefined): string | undefined {
	if (!e) return undefined
	if (e.type === 'outlet') return e.label
	if (e.type === 'rack') return e.name
	if (e.type === 'shape') return e.label || undefined
	if (e.type === 'sheet') return e.number
	return undefined
}
export const renumberable = (e: Entity | undefined): boolean => labelOf(e) !== undefined

/** Where a thing is on its plan (reading order). Unplaced things go last. */
function atOf(e: Entity): Pt | undefined {
	if (e.type === 'outlet' || e.type === 'rack') return e.at
	if (e.type !== 'shape') return undefined
	const g = e.geom
	switch (g.kind) {
		case 'text': case 'insert': return g.at
		case 'rect': case 'circle': case 'arc': case 'image': return g.centre
		case 'path': return g.nodes[0]
		case 'polygon': case 'leader': case 'cloud': return g.pts[0]
		case 'dimension': return g.a
	}
}

export type RenumberOrder = 'pick' | 'reading' | 'label'

export function orderFor(items: Entity[], order: RenumberOrder): Entity[] {
	if (order === 'reading') return readingOrder(items, atOf)
	if (order === 'label') return [...items].sort((a, b) => naturalCompare(labelOf(a)!, labelOf(b)!))
	return items
}

/** The number groups of a label, for the "which number" picker: "L01.A.023" → ["01", "023"]. */
export const numberGroups = (label: string): string[] => splitGroups(label).filter((p) => p.digits).map((p) => p.text)

/**
 * The things renumbered, in the order given: start, start + step, … Only the ones whose text changes.
 * Every item takes the FORMAT of the first item of its type (Dave: "the label format should follow the first item"):
 * picking "A.037", then "A001" gives "A.038", not "A038". An outlet's port labels follow: a port label that starts
 * with the outlet's label gets the new label in front; any other (imported "01A.024A") has its matching number
 * changed.
 */
export function renumberEntities(items: Entity[], o: RenumberOpts): Entity[] {
	const step = o.step ?? 1, group = o.group ?? -1
	const template = new Map<string, string>()
	for (const e of items) if (!template.has(e.type) && labelOf(e) !== undefined) template.set(e.type, labelOf(e)!)
	return items.flatMap((e, i): Entity[] => {
		const old = labelOf(e)
		if (old === undefined) return []
		const label = setNumber(template.get(e.type)!, o.start + i * step, group, o.pad)
		if (label === old) return []
		if (e.type === 'outlet') return [{ ...e, label, ports: e.ports.map((p) => ({ ...p, label: portFollows(p.label, old, label, group) })) }]
		if (e.type === 'rack') return [{ ...e, name: label }]
		if (e.type === 'sheet') return [{ ...e, number: label }]
		return e.type === 'shape' ? [{ ...e, label }] : []
	})
}

/** Find / replace (backlog "Find/replace into the Renumber tool"): in the items' labels (an outlet's ports follow, as
 *  a rename) or — `ports` — in outlets' PORT labels only. Plain text replaces every match; `regex` takes a pattern,
 *  and `$1` … in the replacement. */
export interface ReplaceOpts { find: string; repl: string; regex?: boolean; ports?: boolean }

/** The items whose text changes, or why the pattern can't be used. */
export function replaceInLabels(items: Entity[], o: ReplaceOpts): Entity[] | { problem: string } {
	if (!o.find) return []
	let re: RegExp
	try { re = new RegExp(o.regex ? o.find : o.find.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g') }
	catch (e) { return { problem: `Not a valid pattern: ${(e as Error).message}` } }
	const sub = (t: string) => (o.regex ? t.replace(re, o.repl) : t.replace(re, () => o.repl))   // plain: "$" is just "$"
	return items.flatMap((e): Entity[] => {
		if (o.ports) {
			if (e.type !== 'outlet') return []
			const ports = e.ports.map((p) => ({ ...p, label: sub(p.label) }))
			return ports.some((p, i) => p.label !== e.ports[i].label) ? [{ ...e, ports }] : []
		}
		const old = labelOf(e)
		if (old === undefined) return []
		const label = sub(old)
		if (label === old) return []
		if (e.type === 'outlet') return [renameOutlet(e, label)]
		if (e.type === 'rack') return [{ ...e, name: label }]
		if (e.type === 'sheet') return [{ ...e, number: label }]
		return e.type === 'shape' ? [{ ...e, label }] : []
	})
}

/** A port label after its outlet went from `old` to `label`. */
export function portFollows(port: string, old: string, label: string, group: number): string {
	if (port.startsWith(old)) return label + port.slice(old.length)
	// "01A.024A" for outlet "A.024": the port's group with the outlet's old number changes to the new number
	const oldNum = numberGroups(old).at(group), newNum = numberGroups(label).at(group)
	if (oldNum === undefined || newNum === undefined) return port
	const parts = splitGroups(port), at = parts.findIndex((p) => p.digits && p.text === oldNum)
	if (at < 0) return port
	parts[at] = { text: newNum, digits: true }
	return parts.map((p) => p.text).join('')
}

/** The first label's number in that group: where "Renumber from here" starts by default. */
export const startOf = (items: Entity[], group = -1): number => numberAt(labelOf(items[0]) ?? '', group) ?? 1

/** New labels that someone else of the same type already has (outlets / racks / shapes), left out of the run. */
export function clashes(next: Entity[], all: Iterable<Entity>): string[] {
	const moving = new Set<Id>(next.map((e) => e.id))
	// outlet labels only need to differ on their own level (validate.ts); racks and shapes project-wide
	const scope = (e: Entity) => (e.type === 'outlet' ? `outlet:${e.levelId}` : e.type)
	const taken = new Map<string, Set<string>>()
	for (const e of all) {
		const l = labelOf(e)
		if (l === undefined || moving.has(e.id)) continue
		const k = scope(e)
		taken.set(k, (taken.get(k) ?? new Set()).add(l))
	}
	return next.map((e) => labelOf(e)!).filter((l, i) => taken.get(scope(next[i]))?.has(l))
}
