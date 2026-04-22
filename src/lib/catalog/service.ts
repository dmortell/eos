/**
 * Catalog service — merges the in-code Panduit seed with Firestore-stored
 * custom products. Seeded products are read-only; custom products can be
 * added, edited, and deleted via the returned helpers.
 *
 * Scope: single global `catalog` collection shared across all projects.
 */
import type { Firestore } from '$lib/db.svelte'
import { PANDUIT_SEED } from './panduitSeed'
import { productId, type CatalogProduct } from './types'

function mergeCatalog(customs: CatalogProduct[]): CatalogProduct[] {
	// Customs override seeded items with the same id. Extra customs are appended.
	const byId = new Map<string, CatalogProduct>()
	for (const p of PANDUIT_SEED) byId.set(p.id, p)
	for (const p of customs) byId.set(p.id, { ...p, seeded: false })
	return Array.from(byId.values())
}

/**
 * Subscribe to the global catalog — delivers merged seed + customs on every
 * Firestore change. Returns an unsubscribe function.
 */
export function subscribeCatalog(
	db: Firestore,
	callback: (products: CatalogProduct[]) => void,
): () => void {
	// Deliver seed-only result immediately so UI never shows empty catalog
	callback(mergeCatalog([]))
	const unsub = db.subscribeMany('catalog', (docs) => {
		const customs = (docs as unknown as CatalogProduct[]).filter(d => !!d.id && !!d.maker && !!d.sku)
		callback(mergeCatalog(customs))
	})
	return unsub
}

/**
 * Upsert a custom product into the global catalog.
 * For seeded product ids, this creates a Firestore override.
 */
export async function saveCustomProduct(
	db: Firestore,
	product: Omit<CatalogProduct, 'seeded'>,
	createdBy?: string,
	createdInProject?: string,
): Promise<void> {
	const id = product.id || productId(product.maker, product.sku)
	await db.save('catalog', {
		...product,
		id,
		createdBy,
		createdInProject,
	})
}

export async function deleteCustomProduct(db: Firestore, id: string): Promise<void> {
	await db.delete('catalog', id)
}

/** Build a RackConfig template from a catalog rack/vcm product. */
export function rackFromCatalog(product: CatalogProduct): {
	sku: string
	productRef: string
	widthMm: number
	depthMm: number
	color?: string
	adjustable?: boolean
	minDepthMm?: number
	maxDepthMm?: number
	maker: string
	model: string
	heightU: number
	containmentCapability?: {
		hacTopCap?: string
		cacTopCap?: string
	}
} {
	if (product.kind !== 'rack' && product.kind !== 'vcm') {
		throw new Error(`Cannot build rack from product kind ${product.kind}`)
	}
	return {
		sku: product.sku,
		productRef: product.id,
		widthMm: product.widthMm ?? 600,
		depthMm: product.depthMm ?? product.minDepthMm ?? 914, // fallback 36"
		color: product.color,
		adjustable: product.adjustable,
		minDepthMm: product.minDepthMm,
		maxDepthMm: product.maxDepthMm,
		maker: product.maker,
		model: product.sku,
		heightU: product.ru ?? 45,
		containmentCapability: (product.hacTopCap || product.cacTopCap)
			? { hacTopCap: product.hacTopCap, cacTopCap: product.cacTopCap }
			: undefined,
	}
}
