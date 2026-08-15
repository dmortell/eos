/**
 * Labels v2 L4 — divergence detection + Sync-labels planning.
 *
 * Baked label strings (frames doc `bakedLabels`) are the truth once written;
 * locations renumber/edit freely underneath. This module computes what an
 * explicit "Sync labels" re-bake WOULD change — nothing here mutates state,
 * the editor applies a plan the user has reviewed.
 */
import { repairLocationIds, type BakedLabel } from './portmap'
import { renderLabel, templateForLegacyFormat } from './labelTemplate'
import type { LocationConfig, LabelFormat } from '../../routes/projects/[pid]/frames/parts/types'

export interface SyncRow {
	/** bakedLabels key: `deviceId:portIndex` */
	key: string
	deviceId: string
	portIndex: number
	deviceLabel: string
	rackLabel: string
	/** Device has labelsPrinted — re-baking desyncs physical labels. */
	printed: boolean
	oldLabel: string
	/** Re-baked label; null when it cannot be derived (orphaned/out-of-range). */
	newLabel: string | null
	reason: 'stale' | 'orphaned' | 'out-of-range' | 'ok'
	zone?: string
	locationNumber?: number
}

export interface SyncPlan {
	rows: SyncRow[]
	staleCount: number
	orphanCount: number
	/** Stale rows on printed panels — the loud-warning set. */
	printedStaleCount: number
}

/** Effective template for (re-)baking: explicit template else the legacy options. */
export function effectiveTemplate(labelFormat: Partial<LabelFormat> | null | undefined, floorFormat: string): string {
	return labelFormat?.template ?? templateForLegacyFormat({
		separator: (labelFormat?.separator as any) ?? 'legacy',
		includeZone: labelFormat?.includeZone ?? true,
		includeRoom: labelFormat?.includeRoom ?? false,
	}, floorFormat)
}

/** id → { zone, loc } lookup over repaired zoneLocations. */
function locationsById(zoneLocations: Record<string, LocationConfig[]> | undefined | null) {
	const repaired = repairLocationIds(zoneLocations).zoneLocations
	const map = new Map<string, { zone: string; loc: LocationConfig }>()
	for (const [zone, locs] of Object.entries(repaired)) {
		for (const loc of locs ?? []) if (loc.id) map.set(loc.id, { zone, loc })
	}
	return map
}

/**
 * Diff every structurally-linked baked label against what the current
 * location data + format would produce.
 */
export function buildSyncPlan(
	frameData: { zoneLocations?: Record<string, LocationConfig[]>; bakedLabels?: Record<string, BakedLabel>; labelFormat?: any } | null | undefined,
	devices: any[],
	racks: any[],
	floor: number,
	floorFormat: string = 'L01',
): SyncPlan {
	const rows: SyncRow[] = []
	const baked = frameData?.bakedLabels ?? {}
	const byId = locationsById(frameData?.zoneLocations)
	const template = effectiveTemplate(frameData?.labelFormat, floorFormat)
	const deviceById = new Map(devices.map(d => [d.id, d]))
	const rackById = new Map(racks.map(r => [r.id, r]))

	for (const [key, b] of Object.entries(baked)) {
		if (!b?.locationId || !b.port) continue // free-standing baked string — no structural link to sync
		const [deviceId, portStr] = key.split(':')
		const dev = deviceById.get(deviceId)
		if (!dev) continue // device gone/other room — surfaces when its room is open
		const base = {
			key, deviceId, portIndex: Number(portStr),
			deviceLabel: dev.label ?? deviceId,
			rackLabel: rackById.get(dev.rackId)?.label ?? dev.rackId,
			printed: !!dev.labelsPrinted,
			oldLabel: b.label,
		}
		const hit = byId.get(b.locationId)
		if (!hit) {
			rows.push({ ...base, newLabel: null, reason: 'orphaned' })
			continue
		}
		if (b.port > hit.loc.portCount) {
			rows.push({ ...base, newLabel: null, reason: 'out-of-range', zone: hit.zone, locationNumber: hit.loc.locationNumber })
			continue
		}
		const newLabel = renderLabel(template, {
			floor, zone: hit.zone, locationNumber: hit.loc.locationNumber,
			serverRoom: hit.loc.serverRoomAssignment[b.port - 1] || 'A',
			port: b.port, roomNumber: hit.loc.roomNumber, isHighLevel: hit.loc.isHighLevel ?? false,
		})
		rows.push({
			...base, newLabel,
			reason: newLabel === b.label ? 'ok' : 'stale',
			zone: hit.zone, locationNumber: hit.loc.locationNumber,
		})
	}

	rows.sort((a, b) => a.rackLabel.localeCompare(b.rackLabel) || a.deviceLabel.localeCompare(b.deviceLabel) || a.portIndex - b.portIndex)
	return {
		rows,
		staleCount: rows.filter(r => r.reason === 'stale').length,
		orphanCount: rows.filter(r => r.reason === 'orphaned' || r.reason === 'out-of-range').length,
		printedStaleCount: rows.filter(r => r.reason === 'stale' && r.printed).length,
	}
}

export interface UnbakedPorts {
	locationId: string
	zone: string
	locationNumber: number
	/** 1-based location ports with no baked panel position (post-install additions land here). */
	ports: number[]
}

/**
 * For locations that already have ≥1 baked port: which of their ports have
 * NO baked position yet (e.g. portCount was raised after installation)?
 * These may be assigned to ANY panel — they surface as a work list.
 */
export function unbakedLocationPorts(
	frameData: { zoneLocations?: Record<string, LocationConfig[]>; bakedLabels?: Record<string, BakedLabel> } | null | undefined,
): UnbakedPorts[] {
	const baked = frameData?.bakedLabels ?? {}
	const bakedPorts = new Map<string, Set<number>>()
	for (const b of Object.values(baked)) {
		if (!b?.locationId || !b.port) continue
		if (!bakedPorts.has(b.locationId)) bakedPorts.set(b.locationId, new Set())
		bakedPorts.get(b.locationId)!.add(b.port)
	}
	const out: UnbakedPorts[] = []
	for (const [id, { zone, loc }] of locationsById(frameData?.zoneLocations)) {
		const have = bakedPorts.get(id)
		if (!have?.size) continue
		const missing: number[] = []
		for (let p = 1; p <= loc.portCount; p++) if (!have.has(p)) missing.push(p)
		if (missing.length) out.push({ locationId: id, zone, locationNumber: loc.locationNumber, ports: missing })
	}
	return out.sort((a, b) => a.zone.localeCompare(b.zone) || a.locationNumber - b.locationNumber)
}
