/**
 * Structured cable links (labels v2 / §14 F-1).
 *
 * A StructuredLink is the explicit record of one rear-port termination:
 * panel port `a` → far end `b` (an outlet/location port, or another panel
 * port for rack ties). Stored on the per-floor frames doc as
 * `structuredLinks: Record<id, StructuredLink>`; Patching's circuit trace
 * (P-4) walks these by id. Bundles are ON HOLD (2026-08-16) — no bundle
 * fields yet.
 */
import type { BakedLabel } from './portmap'

export interface LinkEnd {
	deviceId: string
	/** 1-based port index on the device. */
	portIndex: number
}
export interface LocationEnd {
	locationId: string
	/** 1-based port index within the location. */
	port: number
}

export interface StructuredLink {
	id: string
	kind: 'outlet-run' | 'tie'
	/** Rear panel port. */
	a: LinkEnd
	/** Far end: an outlet/location port (outlet-run) or another panel port (tie). */
	b: LocationEnd | LinkEnd
	/** Structured cable type (e.g. 'cat6a', 'os2'); free string, '' = unspecified. */
	cableType?: string
	lengthM?: number
	status: 'design' | 'installed'
	notes?: string
}

export function isLocationEnd(b: StructuredLink['b']): b is LocationEnd {
	return (b as LocationEnd).locationId !== undefined
}

/** Deterministic id for a bootstrapped link — same doc → same ids on every client. */
export function linkIdFor(deviceId: string, portIndex: number): string {
	return `SL-${deviceId}-${portIndex}`
}

/**
 * Generate outlet-run links from the existing baked assignments (the implicit
 * links labels v2 already encodes). Idempotent + deterministic: existing link
 * records win, ids derive from the panel endpoint, devices that aren't in the
 * given list are skipped (other rooms surface when their docs are loaded).
 * Like the id repairs, callers persist on the next edit.
 */
export function bootstrapLinks(
	bakedLabels: Record<string, BakedLabel> | undefined | null,
	existing: Record<string, StructuredLink> | undefined | null,
	devices: { id: string }[],
): { links: Record<string, StructuredLink>; changed: boolean } {
	const links: Record<string, StructuredLink> = { ...(existing ?? {}) }
	const deviceIds = new Set(devices.map(d => d.id))
	/** Panel endpoints already covered by a link (any kind). */
	const covered = new Set(Object.values(links).map(l => `${l.a.deviceId}:${l.a.portIndex}`))
	let changed = false
	for (const [key, b] of Object.entries(bakedLabels ?? {})) {
		if (!b?.locationId || !b.port) continue
		const i = key.lastIndexOf(':')
		const deviceId = key.slice(0, i)
		const portIndex = Number(key.slice(i + 1))
		if (!deviceIds.has(deviceId) || covered.has(key)) continue
		const id = linkIdFor(deviceId, portIndex)
		links[id] = {
			id,
			kind: 'outlet-run',
			a: { deviceId, portIndex },
			b: { locationId: b.locationId, port: b.port },
			status: 'design',
		}
		covered.add(key)
		changed = true
	}
	return { links, changed }
}
