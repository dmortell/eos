// The Racks tool's per-project device LIBRARY (`racks/{pid}_library`.templates) → cad's GLOBAL device templates
// (`settings/cadDeviceTemplates`, Phase 7: User "try importing racks library to global device templates"). Ids are
// stable (`lib-<legacy id>`), so importing again changes nothing; the same device in several projects' libraries
// (name + kind + U + ports) becomes one template. Pure; tested in legacyTemplates.test.ts.
import type { DeviceKind } from '../../domain/types'
import type { DeviceTemplate } from '../../domain/devices'

export interface LegacyLibraryTemplate {
	id: string; label?: string; type?: string; heightU?: number; portCount?: number
	portType?: string | null; widthMm?: number; depthMm?: number; maker?: string; model?: string
}

const KINDS: DeviceKind[] = ['panel', 'switch', 'server', 'manager', 'shelf', 'pdu', 'enclosure', 'other']
const PORT_TYPES = ['RJ45', 'LC', 'SC', 'SFP'] as const

export function templateFromLibrary(t: LegacyLibraryTemplate): DeviceTemplate | null {
	const name = (t.label ?? '').trim()
	if (!name || !(Number(t.heightU) > 0)) return null
	const raw = (t.type ?? 'other') as DeviceKind
	const kind: DeviceKind = KINDS.includes(raw) ? (raw === 'other' && /shel/i.test(name) ? 'shelf' : raw) : 'other'
	const ports = Math.max(0, Math.round(Number(t.portCount) || 0))
	const pt = PORT_TYPES.find((p) => p === t.portType)
	return {
		id: `lib-${t.id}`, name, kind, heightU: Math.round(Number(t.heightU)), portCount: ports,
		...(ports ? { portType: pt ?? 'RJ45' } : {}),
		...(kind === 'switch' ? { portNumbering: 'column' as const } : {}),
		face: kind === 'panel' ? 'both' : kind === 'pdu' ? 'rear' : 'front',
		...(t.widthMm ? { widthMm: t.widthMm } : {}), ...(t.depthMm ? { depthMm: t.depthMm } : {}),
		...(t.maker ? { maker: t.maker } : {}), ...(t.model ? { model: t.model } : {}),
	}
}

/** All projects' libraries → templates, one per distinct device; `existing` ids (already global) are skipped. */
export function templatesFromLibraries(libs: LegacyLibraryTemplate[][], existing: Iterable<string> = []): DeviceTemplate[] {
	const have = new Set(existing), seen = new Set<string>(), out: DeviceTemplate[] = []
	for (const lib of libs) for (const raw of lib) {
		const t = templateFromLibrary(raw)
		if (!t || have.has(t.id)) continue
		const key = `${t.name.toLowerCase()}|${t.kind}|${t.heightU}|${t.portCount}`
		if (seen.has(key)) continue
		seen.add(key)
		out.push(t)
	}
	return out
}
