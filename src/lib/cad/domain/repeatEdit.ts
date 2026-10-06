// F4 = REPEAT THE LAST DEVICE EDIT on the selected devices (Dave 2026-10-07, like Excel's F4): an edit made in device
// Properties (one device or several) is remembered as a field change; F4 applies the same change to whatever devices
// are selected now, one undo step. Not repeated: its name, its U (both are per device), and the printed-label record
// (it belongs to that panel's labels). A panel field change (tier, usages) is kept as the changed sub-fields only, so
// another panel keeps its own reservations / printed labels. Pure; tested in repeatEdit.test.ts.
import type { Device, Rack, Id } from './types'
import { placementProblem } from './devices'

export interface RepeatEdit { label: string; apply: (d: Device) => Partial<Device> }

const SKIP = new Set<keyof Device>(['id', 'type', 'name', 'u', 'rackId'] as (keyof Device)[])
const SKIP_PANEL = new Set(['labelsPrintedAt', 'printedLabels'])

/** What F4 can repeat from this edit (device before + the patch applied), or null when nothing in it carries over. */
export function repeatableEdit(before: Device, label: string, patch: Partial<Device>): RepeatEdit | null {
	const fields: Partial<Device> = {}
	let panel: Record<string, unknown> | null = null
	for (const [k, v] of Object.entries(patch) as [keyof Device, unknown][]) {
		if (SKIP.has(k)) continue
		if (k === 'panel') {
			const was = (before.panel ?? {}) as Record<string, unknown>, now = (v ?? {}) as Record<string, unknown>
			for (const pk of new Set([...Object.keys(was), ...Object.keys(now)])) {
				if (SKIP_PANEL.has(pk) || JSON.stringify(was[pk]) === JSON.stringify(now[pk])) continue
				;(panel ??= {})[pk] = now[pk]
			}
			continue
		}
		;(fields as Record<string, unknown>)[k] = v
	}
	if (!Object.keys(fields).length && !panel) return null
	const p = panel
	return { label, apply: (d) => ({ ...fields, ...(p && d.kind === 'panel' ? { panel: { tier: 'low' as const, ...d.panel, ...p } } : {}) }) }
}

/** The devices after repeating the edit: those it can't go on (an overlap, off the rack) are left out, with why. */
export function repeatOn(edit: RepeatEdit, devices: Device[], all: Device[], rackOf: (id: Id) => Rack | undefined): { next: Device[]; skipped: string[] } {
	const ids = new Set(devices.map((d) => d.id))
	const next: Device[] = [], skipped: string[] = []
	for (const d of devices) {
		const n = { ...d, ...edit.apply(d) }
		const rack = rackOf(d.rackId)
		const others = [...all.filter((x) => !ids.has(x.id)), ...next]
		const problem = rack ? placementProblem(n, rack, others) : null
		if (problem) skipped.push(`${d.name}: ${problem}`)
		else next.push(n)
	}
	return { next, skipped }
}
