/**
 * Compatibility engine — rule-driven, data-driven (no maker-specific code here).
 *
 * Row compatibility is treated as a *soft* hint: mismatches surface as warnings
 * but never block edits. This matches the project decision that rows may
 * become heterogeneous after per-rack tweaks.
 */
import type { RackConfig, RackRow, RowContainment } from './types'
import type { CatalogProduct } from '$lib/catalog/types'

export interface CompatResult {
	ok: boolean
	reasons: string[]
}

/** Field-level check — a loose predicate helper. */
function check(ok: boolean, reason: string, reasons: string[]): boolean {
	if (!ok) reasons.push(reason)
	return ok
}

/**
 * Does a rack (or catalog-product-shaped spec) match the row defaults?
 * Missing row defaults are treated as "no constraint" (always compatible).
 */
export function isRackCompatibleWithRow(
	spec: {
		heightU?: number
		color?: string
		depthMm?: number
		adjustable?: boolean
		minDepthMm?: number
		maxDepthMm?: number
	},
	row: RackRow,
): CompatResult {
	const reasons: string[] = []
	const d = row.defaults ?? {}

	if (d.heightU != null && spec.heightU != null) {
		check(spec.heightU === d.heightU, `RU ${spec.heightU} ≠ row RU ${d.heightU}`, reasons)
	}
	if (d.color && spec.color) {
		check(spec.color === d.color, `color ${spec.color} ≠ row color ${d.color}`, reasons)
	}
	if (d.depthMm != null) {
		if (spec.adjustable && spec.minDepthMm != null && spec.maxDepthMm != null) {
			check(
				d.depthMm >= spec.minDepthMm && d.depthMm <= spec.maxDepthMm,
				`row depth ${d.depthMm}mm outside adjustable range ${spec.minDepthMm}–${spec.maxDepthMm}mm`,
				reasons,
			)
		} else if (spec.depthMm != null) {
			check(spec.depthMm === d.depthMm, `depth ${spec.depthMm}mm ≠ row depth ${d.depthMm}mm`, reasons)
		}
	}

	// Containment — if the row requires it, the rack must expose the right top caps.
	// We evaluate this from CatalogProduct in isProductCompatibleWithRow; on a
	// RackConfig we use containmentCapability if present.
	return { ok: reasons.length === 0, reasons }
}

/** Apply the same check to a catalog product (rack or vcm). */
export function isProductCompatibleWithRow(p: CatalogProduct, row: RackRow): CompatResult {
	const isVcm = p.kind === 'vcm'
	// VCM depth is independent of rack-row depth (Panduit convention: VCMs
	// are shallower than racks and front-aligned). Skip the depth check.
	const base = isRackCompatibleWithRow(
		{
			heightU: p.ru,
			color: p.color,
			depthMm: isVcm ? undefined : p.depthMm,
			adjustable: p.adjustable,
			minDepthMm: p.minDepthMm,
			maxDepthMm: p.maxDepthMm,
		},
		row,
	)

	const reasons = [...base.reasons]
	const c = row.defaults?.containment
	if (c && c !== 'none') {
		const needsHac = c === 'hac' || c === 'combined'
		const needsCac = c === 'cac' || c === 'combined'
		if (p.kind === 'rack') {
			if (needsHac) check(!!p.hacTopCap, `no HAC top cap for ${p.sku}`, reasons)
			if (needsCac) check(!!p.cacTopCap, `no CAC top cap for ${p.sku}`, reasons)
			if (needsCac && !p.adjustable && p.depthMm) {
				// Panduit convention: fixed-depth racks (R4P family) are CAC-incompatible
				check(false, `${p.sku} fixed-depth — CAC requires adjustable rack`, reasons)
			}
		} else if (isVcm) {
			if (needsHac) check(!!p.hacTopCap && !!p.hacEndPanel, `${p.sku} missing HAC kit`, reasons)
			if (needsCac) check(!!p.cacTopCap && !!p.cacEndPanel, `${p.sku} missing CAC kit`, reasons)
			// Panduit PE2V family cannot support HAC at 30" (762mm) row depth
			if (needsHac && p.family === 'PatchRunner 2 Enhanced' && row.defaults?.depthMm === 762) {
				check(false, `${p.sku} (PE2V) not HAC-capable at 30" row depth`, reasons)
			}
		}
	}

	return { ok: reasons.length === 0, reasons }
}

/**
 * Given the racks currently in a row, which containment types should be
 * disabled because at least one rack cannot support them?
 */
export function rowContainmentRules(racks: RackConfig[]): {
	disableHac: boolean
	disableCac: boolean
	reasons: string[]
} {
	const reasons = new Set<string>()
	let disableHac = false
	let disableCac = false

	for (const r of racks) {
		const cap = r.containmentCapability
		if (!cap) continue
		if (!cap.hacTopCap) {
			disableHac = true
			reasons.add(`${r.label} lacks HAC top cap`)
		}
		if (!cap.cacTopCap) {
			disableCac = true
			reasons.add(`${r.label} lacks CAC top cap`)
		}
		if (r.adjustable === false && r.depthMm && !cap.cacTopCap) {
			disableCac = true
			reasons.add(`${r.label} fixed-depth — CAC unavailable`)
		}
	}

	return { disableHac, disableCac, reasons: [...reasons] }
}

/** A single field mismatch between a rack and its row. */
export interface HomogeneityMismatch {
	rackId: string
	rackLabel: string
	field: 'heightU' | 'color' | 'depthMm'
	rackValue: unknown
	rowValue: unknown
}

/** Are all racks in this row uniform with respect to row.defaults? */
export function rowHomogeneity(
	row: RackRow,
	racks: RackConfig[],
): { homogeneous: boolean; mismatches: HomogeneityMismatch[] } {
	const d = row.defaults
	if (!d) return { homogeneous: true, mismatches: [] }

	const mismatches: HomogeneityMismatch[] = []
	for (const r of racks.filter(x => x.rowId === row.id)) {
		if (d.heightU != null && r.heightU !== d.heightU) {
			mismatches.push({ rackId: r.id, rackLabel: r.label, field: 'heightU', rackValue: r.heightU, rowValue: d.heightU })
		}
		if (d.color && r.color && r.color !== d.color) {
			mismatches.push({ rackId: r.id, rackLabel: r.label, field: 'color', rackValue: r.color, rowValue: d.color })
		}
		if (d.depthMm != null && r.depthMm !== d.depthMm) {
			// Adjustable racks with room for the row depth don't count as mismatches
			const withinRange =
				r.adjustable &&
				r.minDepthMm != null && r.maxDepthMm != null &&
				d.depthMm >= r.minDepthMm && d.depthMm <= r.maxDepthMm
			if (!withinRange) {
				mismatches.push({ rackId: r.id, rackLabel: r.label, field: 'depthMm', rackValue: r.depthMm, rowValue: d.depthMm })
			}
		}
	}

	return { homogeneous: mismatches.length === 0, mismatches }
}

/** All containment values — used by UI dropdowns. */
export const CONTAINMENT_OPTIONS: { value: RowContainment; label: string }[] = [
	{ value: 'none', label: 'None' },
	{ value: 'hac', label: 'Hot-Aisle (HAC)' },
	{ value: 'cac', label: 'Cold-Aisle (CAC)' },
	{ value: 'combined', label: 'Combined HAC+CAC' },
]
