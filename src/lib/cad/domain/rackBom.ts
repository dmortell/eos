// The rack BOM (Phase 3.6): racks, VCMs and their containment accessories by SKU — the Racks tool's Panduit
// row-builder rules (racks/parts/bom.ts), on cad's records:
//  - each rack / VCM: 1× its SKU (its catalogue product, else a description so it isn't missed);
//  - with row containment (HAC / CAC / combined) and a catalogue product: top caps, the family + color containment
//    kit (racks), blanking (PatchRunner VCMs);
//  - each contained row: one end-panel kit per side, from the first VCM that names one.
// Lines with the same SKU and role add up. A rack with no catalogue product is listed by its maker / model when it has
// them (the Racks tool's rule), else by kind and size. The BOM can be for chosen rooms (on any levels). The catalogue
// is passed in (domain code doesn't load it).
import type { Id, Rack, RackRow, Space } from './types'
import type { ProjectIndex } from './project'
import type { CatalogProduct } from '$lib/catalog/types'
import { racksInOrder } from './devices'
import { naturalCompare } from './labels'

export type RackBomGroup = 'Rack' | 'Rack accessory' | 'VCM' | 'VCM accessory' | 'Row accessory' | 'Desk / shelf'
export interface RackBomLine { sku: string; group: RackBomGroup; description: string; qty: number; note?: string; url?: string }

/** A rack color that orders the white kit: the word (catalogue colors), or a light, unsaturated hex from the Color picker
 *  (Review 2 Q1: `#ffffff` racks got the black kit). */
export function isWhite(c: string): boolean {
	const t = c.trim().toLowerCase()
	if (t === 'white' || t === 'wh') return true
	const m = /^#([0-9a-f]{3}|[0-9a-f]{6})$/.exec(t)
	if (!m) return false
	const h = m[1].length === 3 ? [...m[1]].map((x) => x + x).join('') : m[1]
	const [r, g, b] = [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16))
	return Math.min(r, g, b) >= 200 && Math.max(r, g, b) - Math.min(r, g, b) <= 40
}

/** The family + color containment kit of a rack product (AR4P / R4P; 96-in R4P racks have their own). */
export function containmentKitSku(p: CatalogProduct | undefined, colour: string | undefined): string | null {
	if (!p) return null
	const white = isWhite(colour ?? p.color ?? 'Black')
	if (p.family === 'AR4P') return white ? 'AR4P-AC-KITWH' : 'AR4P-AC-KIT'
	if (p.family === 'R4P') {
		const tall = p.ru === 52 || /96/.test(p.sku)
		return tall ? (white ? 'R4P96-AC-KITWH' : 'R4P96-AC-KIT') : (white ? 'R4P-AC-KITWH' : 'R4P-AC-KIT')
	}
	return null
}

const GROUP_ORDER: Record<RackBomGroup, number> = { Rack: 0, 'Rack accessory': 1, VCM: 2, 'VCM accessory': 3, 'Row accessory': 4, 'Desk / shelf': 5 }

/** `row` = one row only (null = racks in no row): the BOM dialog's "by row" view; `rooms` = only the racks in these
 *  rooms (absent = every room). */
export function rackBom(ix: ProjectIndex, catalog: CatalogProduct[] = [], o: { row?: Id | null; rooms?: Id[] } = {}): RackBomLine[] {
	const inRow = (r: Rack) => o.row === undefined || (r.rowId ?? null) === o.row
	const inRoom = (spaceId: Id) => !o.rooms || o.rooms.includes(spaceId)
	const byId = new Map(catalog.map((p) => [p.id, p]))
	const bySku = new Map(catalog.map((p) => [p.sku, p]))
	const lines = new Map<string, RackBomLine>()
	const add = (sku: string | null | undefined, group: RackBomGroup, note?: string, description?: string) => {
		if (!sku) return
		const k = `${sku}|${note ?? ''}|${description ?? ''}`, p = bySku.get(sku)
		const l = lines.get(k)
		if (l) l.qty++
		else lines.set(k, { sku, group, description: description ?? p?.description ?? sku, qty: 1, ...(note ? { note } : {}), ...(p?.productUrl ? { url: p.productUrl } : {}) })
	}

	const rows = new Map<Id, RackRow>()
	for (const e of ix.byId.values()) if (e.type === 'rackRow') rows.set(e.id, e)
	const spaces = new Set(ix.racks.map((r) => r.spaceId).filter(inRoom))
	for (const sp of spaces) {
		for (const r of racksInOrder(ix, sp)) {
			if (!inRow(r)) continue
			// desks and shelves too (User: every rack), and each one's notes on its line
			if (r.kind === 'desk' || r.kind === 'shelf') { add(skuOf(r), 'Desk / shelf', ['no catalogue SKU', r.notes].filter(Boolean).join(' · '), descriptionOf(r)); continue }
			const p = r.catalogId ? byId.get(r.catalogId) ?? bySku.get(r.catalogId) : undefined
			const vcm = r.kind === 'vcm'
			add(p?.sku ?? r.catalogId ?? skuOf(r), vcm ? 'VCM' : 'Rack', [p ? '' : 'no catalogue product — link one for accessories', r.notes].filter(Boolean).join(' · ') || undefined, p?.description ?? descriptionOf(r))
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
		if ((o.row !== undefined && row.id !== o.row) || !inRoom(row.spaceId)) continue
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
/** "Maker model" of a rack, a device (either may be blank; '' = neither). */
/** What a rack drawn from a catalogue product is (backlog "Catalogue"): a VCM, a cabinet (an enclosure in its
 *  description), a 2-post, else a 4-post rack — its RU, width and depth (or the usual ones), its SKU as maker / model,
 *  the catalogue id (the rack BOM's accessories) and its spec sheet. */
export function rackFromProduct(p: CatalogProduct): Pick<Rack, 'kind' | 'heightU' | 'widthMm' | 'depthMm' | 'catalogId' | 'maker' | 'model' | 'productUrl'> {
	const kind: Rack['kind'] = p.kind === 'vcm' ? 'vcm' : /cabinet|enclosure/i.test(p.description) ? 'cabinet' : /2[\s-]?post/i.test(`${p.description} ${p.family ?? ''}`) ? '2-post' : '4-post'
	return { kind, heightU: p.ru ?? 42, widthMm: p.widthMm ?? (kind === 'vcm' ? 250 : 600), depthMm: p.depthMm ?? (kind === 'vcm' ? 600 : 1000), catalogId: p.id, maker: p.maker, model: p.sku, ...(p.productUrl ? { productUrl: p.productUrl } : {}) }
}

export const makerModel = (x: { maker?: string; model?: string }) => [x.maker, x.model].map((s) => s?.trim()).filter(Boolean).join(' ')
/** A rack with no catalogue product: its model is its SKU, "maker model (kind size)" its description. */
const skuOf = (r: Rack) => r.model?.trim() || describe(r)
const descriptionOf = (r: Rack) => (makerModel(r) ? `${makerModel(r)} (${describe(r)})` : describe(r))

/** The rooms a rack BOM can be for: those with racks, grouped by level (levels in order, rooms by name). */
export function bomRooms(ix: ProjectIndex): { levelId: Id; level: string; rooms: { id: Id; name: string; racks: number }[] }[] {
	const count = new Map<Id, number>(), levelOf = new Map<Id, Id>()
	for (const r of ix.racks) { count.set(r.spaceId, (count.get(r.spaceId) ?? 0) + 1); if (!levelOf.has(r.spaceId)) levelOf.set(r.spaceId, ix.get<Space>(r.spaceId)?.levelId ?? r.levelId) }
	return [...ix.levels].sort((a, b) => a.order - b.order).flatMap((lv) => {
		const rooms = [...count.keys()].filter((id) => levelOf.get(id) === lv.id)
			.map((id) => ({ id, name: ix.get<Space>(id)?.name || '(room gone)', racks: count.get(id)! })).sort((a, b) => naturalCompare(a.name, b.name))
		return rooms.length ? [{ levelId: lv.id, level: lv.name, rooms }] : []
	})
}
