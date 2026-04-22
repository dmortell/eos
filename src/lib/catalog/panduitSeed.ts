/**
 * Converts the raw inch-based Panduit CATALOG into mm-normalized CatalogProduct[].
 * Exports PANDUIT_SEED — the list used by the catalog service at runtime.
 */
import { PANDUIT_RAW } from './panduitRaw'
import { inToMm, productId, type CatalogProduct } from './types'

const MAKER = 'Panduit'

function urlFor(sku: string): string {
	return `https://www.panduit.com/PanProducts/${encodeURIComponent(sku)}`
}

function seedRacks(): CatalogProduct[] {
	return PANDUIT_RAW.racks.map(r => {
		// The rack's "family" is derived from the SKU prefix — AR4P* vs R4P*.
		const family = r.sku.startsWith('AR4P') ? 'AR4P' : r.sku.startsWith('R4P') ? 'R4P' : undefined
		const hasRailType = r.desc.includes('Cage Nut') ? 'cage-nut' : 'threaded-12-24'
		const tags = ['open-frame', '4-post', hasRailType]
		return {
			id: productId(MAKER, r.sku),
			maker: MAKER,
			sku: r.sku,
			kind: 'rack' as const,
			family,
			description: r.desc,
			ru: r.ru,
			widthMm: inToMm(r.width),
			depthMm: r.depth == null ? undefined : inToMm(r.depth),
			adjustable: r.adjustable,
			minDepthMm: 'min_depth' in r && r.min_depth != null ? inToMm(r.min_depth) : undefined,
			maxDepthMm: 'max_depth' in r && r.max_depth != null ? inToMm(r.max_depth) : undefined,
			color: r.color,
			hacTopCap: r.hac_topcap || undefined,
			cacTopCap: r.cac_topcap || undefined,
			productUrl: urlFor(r.sku),
			tags,
			seeded: true,
		}
	})
}

function seedVcms(): CatalogProduct[] {
	return PANDUIT_RAW.vcms.map(v => ({
		id: productId(MAKER, v.sku),
		maker: MAKER,
		sku: v.sku,
		kind: 'vcm' as const,
		family: v.family,
		description: v.name,
		ru: v.ru,
		widthMm: inToMm(v.width),
		depthMm: inToMm(v.depth),
		color: v.color,
		hacTopCap: v.top_cap_HAC || undefined,
		cacTopCap: v.top_cap_CAC || undefined,
		hacEndPanel: v.end_panel_HAC || undefined,
		cacEndPanel: v.end_panel_CAC || undefined,
		hacBlankingAccessory: v.PE2V_blanking_accessory_skus || v.PR2V_blanking_accessory_skus || undefined,
		cacBlankingAccessory: undefined,
		productUrl: urlFor(v.sku),
		tags: ['vertical-cable-manager', v.style.toLowerCase()],
		seeded: true,
	}))
}

function seedAccessories(): CatalogProduct[] {
	return PANDUIT_RAW.accessories.map(a => ({
		id: productId(MAKER, a.sku),
		maker: MAKER,
		sku: a.sku,
		kind: 'accessory' as const,
		description: a.desc,
		color: a.color,
		productUrl: urlFor(a.sku),
		seeded: true,
	}))
}

export const PANDUIT_SEED: CatalogProduct[] = [
	...seedRacks(),
	...seedVcms(),
	...seedAccessories(),
]

/** Exposed for compatibility rules (M3) and BOM (M4) */
export const PANDUIT_META = {
	ruOptions: PANDUIT_RAW.ruOptions,
	colors: PANDUIT_RAW.colors,
	depthsIn: PANDUIT_RAW.depths,
	depthsMm: PANDUIT_RAW.depths.map(inToMm),
	containmentTypes: PANDUIT_RAW.containmentTypes,
} as const
