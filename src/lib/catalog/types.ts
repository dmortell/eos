/** Catalog product kinds — maps to how the product is used in layouts. */
export type ProductKind = 'rack' | 'vcm' | 'accessory' | 'device'

/**
 * A catalog product — shared across all projects.
 * Dimensions are canonical **millimetres**. Imports from inch-based catalogs
 * are converted at seed/import time (see panduitSeed.ts).
 */
export interface CatalogProduct {
	id: string                // unique id, conventionally `${maker-slug}-${sku}`
	maker: string             // 'Panduit', 'Chatsworth', user-defined
	sku: string
	kind: ProductKind
	family?: string           // 'AR4P', 'PatchRunner 2', 'PatchRunner 2 Enhanced'
	description: string
	ru?: number
	widthMm?: number
	depthMm?: number
	color?: string
	adjustable?: boolean
	minDepthMm?: number
	maxDepthMm?: number
	// ── Accessory relationships (SKU references) ──
	hacTopCap?: string
	cacTopCap?: string
	hacEndPanel?: string
	cacEndPanel?: string
	hacBlankingAccessory?: string
	cacBlankingAccessory?: string
	containmentKit?: { black?: string; white?: string }
	productUrl?: string
	tags?: string[]
	// ── Provenance ──
	seeded?: boolean          // true = shipped in code, false/undefined = user-added
	createdBy?: string        // uid of user that added a custom product
	createdInProject?: string // pid where the custom product was first added
}

/** Round inches to nearest mm (1 in = 25.4 mm). */
export function inToMm(v: number): number {
	return Math.round(v * 25.4)
}

/** Compose a deterministic product id from maker + sku. */
export function productId(maker: string, sku: string): string {
	return `${maker.toLowerCase().replace(/\s+/g, '-')}-${sku}`
}
