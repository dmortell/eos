// The rack BOM (Phase 3.6): racks, VCMs and their containment accessories by SKU — the Racks tool's Panduit
// row-builder rules (racks/parts/bom.ts), on cad's records:
//  - each rack / VCM: 1× its SKU (its catalogue product, else a description so it isn't missed);
//  - with row containment (HAC / CAC / combined) and a catalogue product: top caps, the family + color containment
//    kit (racks), blanking (PatchRunner VCMs);
//  - each contained row: one end-panel kit per side, from the first VCM that names one.
// Lines with the same SKU and role add up. The catalogue is passed in (domain code doesn't load it).
import type { Id, Rack, RackRow } from './types'
import type { ProjectIndex } from './project'
import type { CatalogProduct } from '$lib/catalog/types'
import { racksInOrder } from './devices'

export type RackBomGroup = 'Rack' | 'Rack accessory' | 'VCM' | 'VCM accessory' | 'Row accessory' | 'Desk / shelf'
export interface RackBomLine { sku: string; group: RackBomGroup; description: string; qty: number; note?: string; url?: string }

/** The family + color containment kit of a rack product (AR4P / R4P; 96-in R4P racks have their own). */
export function containmentKitSku(p: CatalogProduct | undefined, colour: string | undefined): string | null {
	if (!p) return null
	const white = (colour ?? p.color ?? 'Black').toLowerCase() === 'white'
	if (p.family === 'AR4P') return white ? 'AR4P-AC-KITWH' : 'AR4P-AC-KIT'
	if (p.family === 'R4P') {
		const tall = p.ru === 52 || /96/.test(p.sku)
		return tall ? (white ? 'R4P96-AC-KITWH' : 'R4P96-AC-KIT') : (white ? 'R4P-AC-KITWH' : 'R4P-AC-KIT')
	}
	return null
}

const GROUP_ORDER: Record<RackBomGroup, number> = { Rack: 0, 'Rack accessory': 1, VCM: 2, 'VCM accessory': 3, 'Row accessory': 4, 'Desk / shelf': 5 }

/** `row` = one row only (null = racks in no row): the BOM dialog's "by row" view. */
export function rackBom(ix: ProjectIndex, catalog: CatalogProduct[] = [], o: { row?: Id | null } = {}): RackBomLine[] {
	const inRow = (r: Rack) => o.row === undefined || (r.rowId ?? null) === o.row
	const byId = new Map(catalog.map((p) => [p.id, p]))
	const bySku = new Map(catalog.map((p) => [p.sku, p]))
	const lines = new Map<string, RackBomLine>()
	const add = (sku: string | null | undefined, group: RackBomGroup, note?: string, description?: string) => {
		if (!sku) return
		const k = `${sku}|${note ?? ''}`, p = bySku.get(sku)
		const l = lines.get(k)
		if (l) l.qty++
		else lines.set(k, { sku, group, description: description ?? p?.description ?? sku, qty: 1, ...(note ? { note } : {}), ...(p?.productUrl ? { url: p.productUrl } : {}) })
	}

	const rows = new Map<Id, RackRow>()
	for (const e of ix.byId.values()) if (e.type === 'rackRow') rows.set(e.id, e)
	const spaces = new Set(ix.racks.map((r) => r.spaceId))
	for (const sp of spaces) {
		for (const r of racksInOrder(ix, sp)) {
			if (!inRow(r)) continue
			// desks and shelves too (Dave: every rack), and each one's notes on its line
			if (r.kind === 'desk' || r.kind === 'shelf') { add(describe(r), 'Desk / shelf', ['no catalogue SKU', r.notes].filter(Boolean).join(' · ')); continue }
			const p = r.catalogId ? byId.get(r.catalogId) ?? bySku.get(r.catalogId) : undefined
			const vcm = r.kind === 'vcm'
			add(p?.sku ?? r.catalogId ?? describe(r), vcm ? 'VCM' : 'Rack', [p ? '' : 'no catalogue product — link one for accessories', r.notes].filter(Boolean).join(' · ') || undefined, p?.description ?? describe(r))
			const cont = (r.rowId && rows.get(r.rowId)?.containment) || 'none'
			if (cont === 'none' || !p) continue
			const hac = cont === 'hac' || cont === 'combined', cac = cont === 'cac' || cont === 'combined'
			if (vcm) {
				if (hac) add(p.hacTopCap, 'VCM accessory', 'HAC top cap')
				if (cac) add(p.cacTopCap, 'VCM accessory', 'CAC top cap')
				if (hac && p.family === 'PatchRunner 2' && p.hacBlankingAccessory) add(p.hacBlankingAccessory, 'VCM accessory', 'PR2V blanking (HAC)')
				if (p.family === 'PatchRunner 2 Enhanced' && p.hacBlankingAccessory) add(p.hacBlankingAccessory, 'VCM accessory', 'PE2V blanking')
			} else {
				if (hac) add(p.hacTopCap, 'Rack accessory', 'HAC top cap')
				if (cac) add(p.cacTopCap, 'Rack accessory', 'CAC top cap')
				add(containmentKitSku(p, r.color), 'Rack accessory', 'Containment kit')
			}
		}
	}
	for (const row of rows.values()) {
		if (o.row !== undefined && row.id !== o.row) continue
		const cont = row.containment ?? 'none'
		if (cont === 'none') continue
		const vcm = ix.racks.filter((r) => r.rowId === row.id && r.kind === 'vcm' && r.catalogId)
			.map((r) => byId.get(r.catalogId!) ?? bySku.get(r.catalogId!)).find((p) => p && (p.hacEndPanel || p.cacEndPanel))
		if (!vcm) continue
		if ((cont === 'hac' || cont === 'combined') && vcm.hacEndPanel) add(vcm.hacEndPanel, 'Row accessory', 'HAC end-panel kit (pair)')
		if ((cont === 'cac' || cont === 'combined') && vcm.cacEndPanel) add(vcm.cacEndPanel, 'Row accessory', 'CAC end-panel kit (pair)')
	}
	return [...lines.values()].sort((a, b) => GROUP_ORDER[a.group] - GROUP_ORDER[b.group] || a.sku.localeCompare(b.sku))
}

const describe = (r: Rack) => r.kind === 'desk' || r.kind === 'shelf' ? `${r.kind} ${r.widthMm}×${r.depthMm}` : `${r.kind === 'vcm' ? 'VCM' : r.kind} ${r.heightU}U ${r.widthMm}×${r.depthMm}`
