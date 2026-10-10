// Labels are plain text (ADR 0002). This module is the text tooling around them:
//  - nextLabel:        "33-009" → "33-010" (the next new outlet, auto-number on any labelled shape)
//  - portLabelsFor:    an outlet label → its port labels (33-001 → 33-001.A, 33-001.B)
//  - renumber:         rewrite one number in a sequence of labels, keeping prefix / suffix / padding
//  - renumberOutlets:  the same for outlets, carrying the change into each port's label
// A "number group" is a maximal run of digits; labels are split into text and digit groups, and only the chosen group
// changes. Group indexes count from the START (0 = first); negative counts from the end (-1 = last, the default).
import type { Outlet } from './types'

interface Part { text: string; digits: boolean }

export function splitGroups(label: string): Part[] {
	return (label.match(/\d+|\D+/g) ?? []).map((text) => ({ text, digits: /^\d/.test(text) }))
}

const digitIndexes = (parts: Part[]) => parts.flatMap((p, i) => (p.digits ? [i] : []))

/** Resolve a group index (negative = from the end) to a part index, or -1. */
function partAt(parts: Part[], group: number): number {
	const ix = digitIndexes(parts)
	const g = group < 0 ? ix.length + group : group
	return g >= 0 && g < ix.length ? ix[g] : -1
}

/** The value of a number group, or undefined when the label has no such group. */
export function numberAt(label: string, group = -1): number | undefined {
	const parts = splitGroups(label), i = partAt(parts, group)
	return i < 0 ? undefined : Number(parts[i].text)
}

/** Replace a number group, keeping its zero-padding width (unless `pad` is given). No group = unchanged. */
export function setNumber(label: string, n: number, group = -1, pad?: number): string {
	const parts = splitGroups(label), i = partAt(parts, group)
	if (i < 0) return label
	parts[i] = { text: String(n).padStart(pad ?? parts[i].text.length, '0'), digits: true }
	return parts.map((p) => p.text).join('')
}

/** The label after `label`: its last number + `step`. A label with no number gets "1" appended (after a space-free join). */
export function nextLabel(label: string, step = 1): string {
	const n = numberAt(label)
	return n === undefined ? `${label}1` : setNumber(label, n + step)
}

/** How port labels follow the outlet label: letters or numbers, after a separator ('.', '-' or none): 201.A, 201A,
 *  201-A, 201.1, 201-1. A project setting (ProjectSettings.portSuffix / portSeparator). */
export type PortSep = '.' | '-' | ''
export const PORT_FORMATS: { style: 'alpha' | 'numeric'; sep: PortSep }[] = [
	{ style: 'alpha', sep: '.' }, { style: 'alpha', sep: '' }, { style: 'alpha', sep: '-' },
	{ style: 'numeric', sep: '.' }, { style: 'numeric', sep: '-' },
]
const suffix = (style: 'alpha' | 'numeric', n: number) => (style === 'numeric' ? String(n) : alpha(n))

/** Port labels for an outlet label: alpha (.A .B …) or numeric (.1 .2 …), after `sep`. */
export function portLabelsFor(outletLabel: string, count: number, style: 'alpha' | 'numeric' = 'alpha', sep: PortSep = '.'): string[] {
	return Array.from({ length: count }, (_, i) => `${outletLabel}${sep}${suffix(style, i + 1)}`)
}

/**
 * Port labels in a new format. Only labels that are the outlet label + a generated suffix (in ANY of the formats) are
 * rewritten — imported or hand-made labels (01A.024A, L01.A.001-A01 …) are left as they are. Null = nothing changes.
 */
export function reformatPorts<T extends { label: string; ports: { port: number; label: string }[] }>(o: T, style: 'alpha' | 'numeric', sep: PortSep): T | null {
	let changed = false
	const ports = o.ports.map((p) => {
		const generated = PORT_FORMATS.some((f) => p.label === `${o.label}${f.sep}${suffix(f.style, p.port)}`)
		const next = `${o.label}${sep}${suffix(style, p.port)}`
		if (!generated || p.label === next) return p
		changed = true
		return { ...p, label: next }
	})
	return changed ? { ...o, ports } : null
}

/** Port labels made again from the outlet's own label, for the ports that don't contain it (Dave 2026-10-10: Journey
 *  outlets renumbered to 245… kept ports "056.A"; a panel showed 056). Ports that carry the label in any form —
 *  "L30.A.001-A01" on outlet 001 — are left alone. Null = none to change. */
export function portsFromLabel<T extends { label: string; ports: { port: number; label: string }[] }>(o: T, style: 'alpha' | 'numeric', sep: PortSep): T | null {
	if (!o.label || o.ports.every((p) => p.label.includes(o.label))) return null
	return { ...o, ports: o.ports.map((p) => (p.label.includes(o.label) ? p : { ...p, label: `${o.label}${sep}${suffix(style, p.port)}` })) }
}

function alpha(n: number): string {
	let s = ''
	for (let v = n; v > 0; v = Math.floor((v - 1) / 26)) s = String.fromCharCode(65 + ((v - 1) % 26)) + s
	return s
}

export interface RenumberOpts {
	start: number
	step?: number
	/** Which number group to change (default -1 = the last). */
	group?: number
	/** Force a padding width (default: keep each label's own). */
	pad?: number
}

/** Renumber labels IN THE ORDER GIVEN (pick order, or a sort the caller chose): start, start+step, … */
export function renumber(labels: string[], o: RenumberOpts): string[] {
	const step = o.step ?? 1
	return labels.map((l, i) => setNumber(l, o.start + i * step, o.group ?? -1, o.pad))
}

/**
 * Renumber outlets in the order given, and carry each change into its ports' labels: in a port label the group that
 * matches the outlet's OLD number (same position from the start, else the first group with the same digits) changes
 * the same way. So "33-001" → "33-005" also turns "33-001.A" into "33-005.A", and an outlet "L01.A.023" turns its
 * port "L01.A.023-B07" into "L01.A.024-B07" without touching the floor "01" or the port "07".
 */
export function renumberOutlets(outlets: Outlet[], o: RenumberOpts): Outlet[] {
	const group = o.group ?? -1
	return outlets.map((out, i) => {
		const n = o.start + i * (o.step ?? 1)
		const parts = splitGroups(out.label), pi = partAt(parts, group)
		if (pi < 0) return out
		const oldText = parts[pi].text
		const gIndex = digitIndexes(parts).indexOf(pi)
		const label = setNumber(out.label, n, group, o.pad)
		const newText = splitGroups(label)[pi].text
		const ports = out.ports.map((p) => ({ ...p, label: replaceMatchingGroup(p.label, oldText, newText, gIndex) }))
		return { ...out, label, ports }
	})
}

function replaceMatchingGroup(label: string, oldText: string, newText: string, gIndex: number): string {
	const parts = splitGroups(label), ix = digitIndexes(parts)
	let i = gIndex < ix.length && parts[ix[gIndex]].text === oldText ? ix[gIndex] : -1
	if (i < 0) i = ix.find((k) => parts[k].text === oldText) ?? -1
	if (i < 0) return label
	parts[i] = { text: newText, digits: true }
	return parts.map((p) => p.text).join('')
}

/** Natural sort ("A.2" before "A.10") — for grids and for "renumber in current order". */
export const naturalCompare = (a: string, b: string): number => a.localeCompare(b, undefined, { numeric: true, sensitivity: 'base' })

/** Reading order for "renumber by position": rows top to bottom (within `rowTol` mm), then left to right. */
export function readingOrder<T>(items: T[], at: (t: T) => { x: number; y: number } | undefined, rowTol = 500): T[] {
	const placed = items.filter((t) => at(t)).sort((a, b) => at(a)!.y - at(b)!.y)
	const rows: T[][] = []
	for (const t of placed) {
		const row = rows[rows.length - 1]
		if (row && Math.abs(at(t)!.y - at(row[0])!.y) <= rowTol) row.push(t)
		else rows.push([t])
	}
	return [...rows.flatMap((r) => r.sort((a, b) => at(a)!.x - at(b)!.x)), ...items.filter((t) => !at(t))]
}
