/**
 * Bill of Materials engine — derives purchasable line items from rows/racks
 * and the product catalog. Ports the Panduit row-builder rules:
 *  - Each rack contributes 1× its SKU.
 *  - With containment on, each rack contributes a HAC/CAC top cap and a
 *    family-specific containment kit (rack-color dependent).
 *  - Each VCM contributes 1× its SKU + HAC/CAC top cap + blanking accessory.
 *  - Each row with containment adds one HAC and/or one CAC end-panel kit.
 *
 * Results are aggregated by SKU so the same accessory ordered by multiple
 * racks shows as a single line with summed quantity.
 */
import type { RackConfig, RackRow } from './types'
import type { CatalogProduct } from '$lib/catalog/types'

export type BOMGroup = 'Rack' | 'VCM' | 'Rack Accessory' | 'VCM Accessory' | 'Row Accessory'

export interface BOMLine {
	sku: string
	group: BOMGroup
	description: string
	qty: number
	note?: string
	rowLabel?: string
	productUrl?: string
}

/** Row-family containment kit — data-driven from catalog family + color. */
export function containmentKitSku(product: CatalogProduct | null, color: string | undefined): string | null {
	const isWhite = (color ?? product?.color ?? 'Black').toLowerCase() === 'white'
	if (!product) return null
	if (product.family === 'AR4P') return isWhite ? 'AR4P-AC-KITWH' : 'AR4P-AC-KIT'
	if (product.family === 'R4P') {
		const is96 = product.ru === 52 || /96/.test(product.sku)
		return is96
			? (isWhite ? 'R4P96-AC-KITWH' : 'R4P96-AC-KIT')
			: (isWhite ? 'R4P-AC-KITWH' : 'R4P-AC-KIT')
	}
	return null
}

function describe(sku: string | null | undefined, catalog: Map<string, CatalogProduct>, maker = 'Panduit'): string {
	if (!sku) return ''
	// Try catalog lookup by maker-sku slug
	const id = `${maker.toLowerCase().replace(/\s+/g, '-')}-${sku}`
	return catalog.get(id)?.description ?? sku
}

function productUrl(sku: string | null | undefined, catalog: Map<string, CatalogProduct>, maker = 'Panduit'): string | undefined {
	if (!sku) return undefined
	const id = `${maker.toLowerCase().replace(/\s+/g, '-')}-${sku}`
	return catalog.get(id)?.productUrl
}

/** Group identical SKUs (same note) into one line with summed qty. */
function aggregate(lines: BOMLine[]): BOMLine[] {
	const byKey = new Map<string, BOMLine>()
	for (const line of lines) {
		const key = `${line.rowLabel ?? ''}|${line.sku}|${line.note ?? ''}`
		const existing = byKey.get(key)
		if (existing) existing.qty += line.qty
		else byKey.set(key, { ...line })
	}
	return [...byKey.values()].sort((a, b) => {
		const ga = groupOrder(a.group), gb = groupOrder(b.group)
		if (ga !== gb) return ga - gb
		return a.sku.localeCompare(b.sku)
	})
}

function groupOrder(g: BOMGroup): number {
	return { 'Rack': 0, 'Rack Accessory': 1, 'VCM': 2, 'VCM Accessory': 3, 'Row Accessory': 4 }[g] ?? 9
}

/**
 * Build the BOM for a single row. Returns aggregated lines.
 * `catalog` may be empty — descriptions/URLs just fall back to SKU.
 */
export function computeRowBOM(row: RackRow, allRacks: RackConfig[], catalog: CatalogProduct[]): BOMLine[] {
	const byId = new Map(catalog.map(p => [p.id, p]))
	const rowRacks = allRacks.filter(r => r.rowId === row.id).sort((a, b) => a.order - b.order)
	const containment = row.defaults?.containment ?? 'none'
	const needsHac = containment === 'hac' || containment === 'combined'
	const needsCac = containment === 'cac' || containment === 'combined'
	const lines: BOMLine[] = []

	const add = (sku: string | null | undefined, group: BOMGroup, opts: { note?: string; description?: string; rackLabel?: string } = {}) => {
		if (!sku) return
		lines.push({
			sku,
			group,
			description: opts.description ?? describe(sku, byId),
			qty: 1,
			note: opts.note,
			rowLabel: row.label,
			productUrl: productUrl(sku, byId),
		})
	}

	for (const rack of rowRacks) {
		const product = rack.productRef ? byId.get(rack.productRef) ?? null : null
		const isVcm = rack.type === 'vcm'

		// The rack / VCM itself — always emit, even without a catalog SKU, so
		// pre-catalog racks remain visible in the BOM. The user can link a SKU
		// later via the Catalog tab to unlock accessory emission.
		const fallbackSku = rack.sku || rack.model || rack.label
		const fallbackDesc = product?.description
			?? (rack.maker && rack.model ? `${rack.maker} ${rack.model}` : `${rack.widthMm}×${rack.depthMm}mm ${isVcm ? 'VCM' : 'rack'}`)
		const noteSuffix = rack.sku ? '' : ' — no catalog SKU'
		add(fallbackSku, isVcm ? 'VCM' : 'Rack', {
			description: fallbackDesc,
			note: (rack.notes ?? '') + noteSuffix || undefined,
			rackLabel: rack.label,
		})

		// Accessories require a catalog link (for family/color-dependent kits)
		// or a stored containmentCapability. Unlinked racks skip this block.
		if (containment === 'none') continue
		if (!product && !rack.containmentCapability) continue

		if (isVcm) {
			if (needsHac) add(product?.hacTopCap ?? rack.containmentCapability?.hacTopCap, 'VCM Accessory', { note: 'HAC top cap' })
			if (needsCac) add(product?.cacTopCap ?? rack.containmentCapability?.cacTopCap, 'VCM Accessory', { note: 'CAC top cap' })
			// Blanking: PR2V only when HAC; PE2V always with containment on
			const isPE2V = product?.family === 'PatchRunner 2 Enhanced'
			const isPR2V = product?.family === 'PatchRunner 2'
			if (needsHac && isPR2V && product?.hacBlankingAccessory) add(product.hacBlankingAccessory, 'VCM Accessory', { note: 'PR2V blanking (HAC)' })
			if (isPE2V && product?.hacBlankingAccessory) add(product.hacBlankingAccessory, 'VCM Accessory', { note: 'PE2V blanking' })
		} else {
			// Rack top caps
			if (needsHac) add(product?.hacTopCap ?? rack.containmentCapability?.hacTopCap, 'Rack Accessory', { note: 'HAC top cap' })
			if (needsCac) add(product?.cacTopCap ?? rack.containmentCapability?.cacTopCap, 'Rack Accessory', { note: 'CAC top cap' })
			// Containment kit (family + color dependent)
			const kit = containmentKitSku(product, rack.color)
			if (kit) add(kit, 'Rack Accessory', { note: 'Containment kit' })
		}
	}

	// Row-level end-panel kit (one per containment side)
	if (containment !== 'none') {
		// Use the first VCM with end-panel info to derive the kit SKU
		const vcmWithKit = rowRacks
			.filter(r => r.type === 'vcm' && r.productRef)
			.map(r => byId.get(r.productRef!))
			.find(p => p && (p.hacEndPanel || p.cacEndPanel))
		if (vcmWithKit) {
			if (needsHac && vcmWithKit.hacEndPanel) add(vcmWithKit.hacEndPanel, 'Row Accessory', { note: 'HAC end-panel kit (pair)' })
			if (needsCac && vcmWithKit.cacEndPanel) add(vcmWithKit.cacEndPanel, 'Row Accessory', { note: 'CAC end-panel kit (pair)' })
		}
	}

	return aggregate(lines)
}

/** Union BOM over every row, preserving row attribution. */
export function computeProjectBOM(rows: RackRow[], racks: RackConfig[], catalog: CatalogProduct[]): BOMLine[] {
	return rows.flatMap(r => computeRowBOM(r, racks, catalog))
}

/** Consolidated BOM — same as project BOM but aggregated across rows. */
export function computeConsolidatedBOM(rows: RackRow[], racks: RackConfig[], catalog: CatalogProduct[]): BOMLine[] {
	const all = computeProjectBOM(rows, racks, catalog)
	// Drop rowLabel for aggregation; keep unique note to distinguish accessory roles
	const stripped = all.map(l => ({ ...l, rowLabel: undefined }))
	return aggregate(stripped)
}
