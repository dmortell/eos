// One-shot import of a project's legacy tool docs into cad entities (ADR 0001: "importers are part of the plan").
// Pure: it takes the raw docs (however they were fetched) and returns entities plus an issues list. It never writes.
//
// Sources, by their doc-id conventions:
//   projects/{pid}                       floors[], name                          → building, levels, server rooms, areas
//   frames/{pid}_F{NN}                   zoneLocations, labelFormat, floorFormat, → zones, rooms, outlets (+ port labels),
//                                        bakedLabels, portAssignments,            links, reservations
//                                        portReservations, structuredLinks
//   racks/{pid}_F{NN}_R{X}               rows, racks, devices                    → rack rows, racks, devices
//   patching/{pid}_F{NN}_R{X}            connections, customCableTypes           → cords, cable types
//   outlets/{pid}_F{NN}[__{areaId}]      outlets, trunks, rackPlacements, file   → outlet positions, runs, rack placement,
//                                                                                   underlay
import type { Entity } from '../../domain/drawing'
import type { Id, Level, Space, ProjectSettings, Building } from '../../domain/types'
import type { Issue } from '../../domain/validate'
import { ImportCtx, floorOfDocId, type LegacySource } from './ctx'
import { importCabling } from './legacyCabling'
import { importOutletsDocs } from './legacyOutlets'

export type { LegacySource } from './ctx'
export { floorOfDocId } from './ctx'

/* eslint-disable @typescript-eslint/no-explicit-any -- legacy docs are untyped Firestore data */
export interface ImportResult {
	entities: Entity[]
	issues: Issue[]
	/** legacy key → new id, for re-runs and for checking. Keys: `level:33`, `location:<id>`, `device:<doc>:<id>`, … */
	ids: Record<string, Id>
}

/** Riser defaults (risers/parts/types DEFAULT_FLOOR_HEIGHTS) when no floor heights are known. */
export const DEFAULT_HEIGHTS = { slabMm: 200, raisedFloorMm: 300, clearHeightMm: 2600, plenumMm: 700 }

export function importLegacy(src: LegacySource, makeId?: () => string): ImportResult {
	const c = new ImportCtx(src, makeId)
	importPlaces(c)
	importCabling(c)
	importOutletsDocs(c)
	return { entities: c.entities, issues: c.issues, ids: c.ids }
}

function importPlaces(c: ImportCtx): void {
	const p = c.src.project ?? {}
	const building: Building = { type: 'building', id: c.id('building'), name: p.name ?? 'Building', order: 0 }
	c.add(building)

	// Every floor that any source mentions gets a level.
	const floors = new Set<number>((p.floors ?? []).map((f: any) => f.number))
	for (const group of [c.src.frames, c.src.racks, c.src.patching, c.src.outlets]) for (const id of Object.keys(group)) {
		const f = floorOfDocId(c.src.pid, id)
		if (f) floors.add(f.floor)
	}
	const typical = DEFAULT_HEIGHTS.raisedFloorMm + DEFAULT_HEIGHTS.clearHeightMm + DEFAULT_HEIGHTS.plenumMm + DEFAULT_HEIGHTS.slabMm
	for (const n of [...floors].sort((a, b) => a - b)) {
		const cfg = (p.floors ?? []).find((f: any) => f.number === n)
		const level: Level = {
			type: 'level', id: c.levelId(n), buildingId: building.id, number: n, name: cfg?.label ?? `${n}F`, order: n,
			elevationMm: (n - 1) * typical, heights: { ...DEFAULT_HEIGHTS },
		}
		c.add(level)
		for (const a of cfg?.areas ?? []) {
			const area: Space = { type: 'space', id: c.id(`area:${n}:${a.id}`), levelId: level.id, kind: 'area', name: a.label ?? a.id, order: 300 }
			c.add(area)
		}
		const count = cfg?.serverRoomCount ?? 0
		for (let i = 0; i < count; i++) c.serverRoom(n, String.fromCharCode(65 + i))
	}
	if (floors.size) c.issue(building.id, 'heights-defaulted', 'Level heights and elevations use defaults (no riser data imported yet) — check them in Properties')

	const settings: ProjectSettings = {
		type: 'settings', id: 'settings', portSuffix: 'alpha',
		usages: [
			{ id: 'desk', label: 'Desk', color: '#3b82f6' }, { id: 'AP', label: 'Wireless AP', color: '#10b981' },
			{ id: 'PR', label: 'Printer', color: '#f59e0b' }, { id: 'TV', label: 'TV / AV', color: '#8b5cf6' },
			{ id: 'N/A', label: 'Not used', color: '#9ca3af' },
		],
		cableTypes: [{ id: 'cat6a', label: 'Cat6A', media: 'copper', color: '#3b82f6' }, { id: 'cat6', label: 'Cat6', media: 'copper', color: '#2563eb' }, { id: 'os2', label: 'OS2 fibre', media: 'fibre', color: '#eab308' }],
		defaults: { outletCableType: 'cat6a', cordCableType: 'cat6a', cordColour: '#3b82f6', panelPorts: 24 },
	}
	c.add(settings)
}
