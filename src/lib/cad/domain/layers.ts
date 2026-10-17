// Layers (docs/plan/layers.md): ONE list — the system layers below (in code, in the plan's drawing order) plus the
// project's own `Layer` records. A record with a system layer's id restyles it (color, order). Every item is on a
// layer: its own `layerId` if that layer exists, else the default for its kind — so existing data needs no migration.
// Who sees what is NOT stored here: the eye / lock are per user (the workspace), a viewport's freeze is on the sheet.
import type { Id } from './types'
import type { Entity, Layer, Sheet } from './drawing'

/** `color` = the layer's color, applied to its items; `look` = a system layer's default: the color its items
 *  already draw in (shown on the swatch, NOT applied — forcing it would flatten colors that mean something: an
 *  unrouted backbone's red, a rack's ports and U numbers). */
export interface LayerInfo { id: Id; name: string; order: number; color?: string; look?: string; system: boolean; /** The lineweight (paper mm) and line type its items use when they set none ("By layer"). */ weightMm?: number; dash?: string; /** The panel heading it sits under (see `groupOf`). */ group?: string }

/** The system layers, bottom to top (the order the plan draws them; User: pairs together, Floorplans first). */
export const SYSTEM_LAYERS: LayerInfo[] = ([
	['sys:background', 'Floorplans', '#9ca3af'], ['sys:walls', 'Walls', '#475569'], ['sys:drawing', 'Drawing', '#0f172a'],
	['sys:racks', 'Racks', '#1e293b'], ['sys:cont-low', 'Trunks', '#0ea5e9'], ['sys:cont-high', 'Trunks high', '#f97316'],
	['sys:risers', 'Risers', '#be185d'], ['sys:backbone', 'Backbone', '#7c3aed'], ['sys:cords', 'Patch cords', '#3b82f6'], ['sys:port-labels', 'Port labels', '#0c4a6e'],
	['sys:outlets-low', 'Outlets', '#1d4ed8'], ['sys:outlets-high', 'Outlets high', '#1d4ed8'],
	['sys:notes', 'Notes', '#0f172a'], ['sys:sections', 'Sections', '#0f766e'],
	// the rack view's context (User 2026-10-09: its toggles): the room's floor / ceiling / slab lines, the other face
	['sys:room-lines', 'Room lines', '#64748b'], ['sys:other-face', 'Other face', '#94a3b8'],
] as const).map(([id, name, look], i): LayerInfo => ({ id, name, look, order: (i + 1) * 10, system: true }))
	// ROOMS (W30): room / EPS outlines and names on the plan, just above Walls — order 25, so no other layer's order moves
	.concat({ id: 'sys:rooms', name: 'Rooms', look: '#64748b', order: 25, system: true })
	.sort((a, b) => a.order - b.order)

/** Colors for new project layers, in turn (distinct from the system defaults where possible). */
export const LAYER_PALETTE = ['#dc2626', '#16a34a', '#9333ea', '#ea580c', '#0891b2', '#ca8a04', '#db2777', '#4f46e5', '#65a30d', '#0d9488']

/** The next palette color no project layer uses yet (round again when all are taken). */
export function nextLayerColour(records: Layer[]): string {
	const used = new Set(records.filter((r) => !r.id.startsWith('sys:')).map((r) => r.color))
	const own = records.filter((r) => !r.id.startsWith('sys:')).length
	return LAYER_PALETTE.find((c) => !used.has(c)) ?? LAYER_PALETTE[own % LAYER_PALETTE.length]
}

/** The project's layers: the system ones (restyled by a record with their id) and its own, by order. */
export function layersOf(records: Layer[]): LayerInfo[] {
	const own = new Map(records.map((r) => [r.id, r]))
	const look = (r: Layer) => ({ ...(r.color ? { color: r.color } : {}), ...(r.weightMm ? { weightMm: r.weightMm } : {}), ...(r.dash ? { dash: r.dash } : {}), ...(r.group ? { group: r.group } : {}) })
	const sys = SYSTEM_LAYERS.map((s) => { const r = own.get(s.id); return r ? { ...s, order: r.order, ...look(r) } : s })
	const custom = records.filter((r) => !r.id.startsWith('sys:')).map((r): LayerInfo => ({ id: r.id, name: r.name, order: r.order, ...look(r), system: false }))
	return [...sys, ...custom].sort((a, b) => a.order - b.order)
}

/** The layer an item is on when it names none. Undefined = on no layer (always shown: paper, title block …). */
export function defaultLayer(e: Entity): Id | undefined {
	switch (e.type) {
		case 'outlet': return e.tier === 'high' ? 'sys:outlets-high' : 'sys:outlets-low'
		case 'rack': case 'device': return 'sys:racks'
		case 'cord': return 'sys:cords'
		case 'link': return e.kind === 'horizontal' ? undefined : 'sys:backbone'
		case 'underlay': return 'sys:background'
		case 'section': return 'sys:sections'
		case 'space': return 'sys:rooms'
		case 'shape': {
			const r = e.role
			if (r?.kind === 'wall') return 'sys:walls'
			if (r?.kind === 'containment') return r.tier === 'high' ? 'sys:cont-high' : 'sys:cont-low'
			const g = e.geom.kind
			return g === 'text' || g === 'leader' || g === 'cloud' || g === 'legend' || g === 'changeList' ? 'sys:notes' : 'sys:drawing'
		}
		default: return undefined
	}
}

/** The layer an item is on: its own if that layer exists, else its kind's default. */
export function layerOf(e: Entity, known: Set<Id>): Id | undefined {
	const own = (e as { layerId?: Id }).layerId
	return own && known.has(own) ? own : defaultLayer(e)
}

/** The layer a drawn prim is on: its source's — except that a containment run's RISER parts sit on Risers. */
export function primLayer(cls: string, e: Entity | undefined, known: Set<Id>): Id | undefined {
	// a rack view's context: not pickable (no source), on their own layers so they can be hidden / frozen
	if (!e) { const c = cls.split(' '); return c.includes('room-line') ? 'sys:room-lines' : c.includes('device-other') || c.includes('device-other-label') ? 'sys:other-face' : undefined }
	if (e.type === 'shape' && e.role?.kind === 'containment' && !e.layerId && cls.startsWith('riser')) return 'sys:risers'
	// a device's port labels have their own layer (User 2026-10-07): hidden / frozen apart from the racks
	if (e.type === 'device' && cls.split(' ').includes('port-label')) return 'sys:port-labels'
	return layerOf(e, known)
}

/** Why a new item can't go on a layer (hidden / locked for this user), or null. */
export function layerBlock(id: Id | undefined, name: string, hidden: ReadonlySet<Id>, locked: ReadonlySet<Id>): string | null {
	if (!id) return null
	if (hidden.has(id)) return `The ${name} layer is hidden — show it to add to it`
	if (locked.has(id)) return `The ${name} layer is locked — unlock it to add to it`
	return null
}

/** The layer a drawing tool's new item lands on: lines on the current layer (else Drawing); walls, trunks, racks on
 *  their own system layer (User: the current layer doesn't take them). Undefined = not a drawing tool. */
export function toolLayer(toolId: string, current: Id | null, z: number): Id | undefined {
	switch (toolId) {
		case 'line': return current ?? 'sys:drawing'
		case 'wall': return 'sys:walls'
		case 'trunk': case 'conduit': return z > 0 ? 'sys:cont-high' : 'sys:cont-low'
		case 'rack': return 'sys:racks'
		default: return undefined
	}
}

/** What a drawing tool says after it adds shapes (User 2026-10-10: show which layer they went on), or null — none
 *  added, or only paper items (a sheet's shapes are on no layer). */
export function drawnOn(created: Entity[], layers: LayerInfo[]): string | null {
	const known = new Map(layers.map((l) => [l.id, l.name]))
	const names = new Set<string>()
	for (const e of created) {
		if (e.type !== 'shape' || e.sheetId) continue
		const id = layerOf(e, new Set(known.keys()))
		if (id) names.add(known.get(id) ?? id)
	}
	return names.size ? `Drawn on the ${[...names].join(', ')} layer${names.size > 1 ? 's' : ''}` : null
}

/** A drawing tool refused because its layer is hidden / locked for this user (the item would vanish, or be stuck). */
export function toolBlock(toolId: string, prefs: { current: Id | null; hidden: ReadonlySet<Id>; locked: ReadonlySet<Id> }, z: number, layers: Map<Id, LayerInfo>): string | null {
	const id = toolLayer(toolId, prefs.current && layers.has(prefs.current) ? prefs.current : null, z)
	return id ? layerBlock(id, layers.get(id)?.name ?? id, prefs.hidden, prefs.locked) : null
}

/** A NEW layer starts hidden in the drawings that already exist (User 2026-10-05): its id added to every viewport's
 *  frozen list, so issued / finished sheets don't change when something is drawn on it. Viewports made later show it.
 *  The sheets that change. */
export function freezeInExisting(sheets: Sheet[], layerId: Id): Sheet[] {
	return sheets.filter((s) => s.viewports.length).map((s) => ({
		...s, viewports: s.viewports.map((v) => (v.frozen?.includes(layerId) ? v : { ...v, frozen: [...(v.frozen ?? []), layerId] })),
	}))
}

/** The project layer called `name`, made when there's none yet (furniture goes on "Furniture", User 2026-10-14): its
 *  id, and what to write for a new one — the layer, and the sheets it starts hidden in (`freezeInExisting`). */
export function ensureLayer(name: string, records: Layer[], sheets: Sheet[], makeId: () => Id): { id: Id; puts: (Layer | Sheet)[] } {
	const found = records.find((r) => !r.id.startsWith('sys:') && r.name.trim().toLowerCase() === name.toLowerCase())
	if (found) return { id: found.id, puts: [] }
	const id = makeId(), order = Math.max(0, ...layersOf(records).map((l) => l.order)) + 10
	return { id, puts: [{ type: 'layer', id, name, order, color: nextLayerColour(records) }, ...freezeInExisting(sheets, id)] }
}

/** The heading a layer is filed under: its own group, else the part of its name before a "/" ("IDF1/Outlets" → IDF1). */
export function groupOf(l: Pick<LayerInfo, 'name' | 'group'>): string | undefined {
	if (l.group) return l.group
	const i = l.name.indexOf('/')
	return i > 0 && l.name.slice(0, i).trim() ? l.name.slice(0, i).trim() : undefined
}

/** The layers as the panel lists them: the ungrouped ones first, then each group (in order of its first layer), every
 *  list keeping the drawing order. */
export function groupLayers<T extends Pick<LayerInfo, 'name' | 'group'>>(ls: T[]): { name: string | null; layers: T[] }[] {
	const out: { name: string | null; layers: T[] }[] = [{ name: null, layers: [] }], by = new Map<string, T[]>()
	for (const l of ls) {
		const g = groupOf(l)
		if (!g) { out[0].layers.push(l); continue }
		let list = by.get(g)
		if (!list) { list = []; by.set(g, list); out.push({ name: g, layers: list }) }
		list.push(l)
	}
	return out.filter((g) => g.layers.length)
}

/** A saved set of shown layers (per user and project): the layers hidden when it was saved. */
export interface LayerPreset { name: string; hidden: Id[] }

/** Presets with one saved under `name` (replacing a same-named one, ignoring case), hidden = the current eye states. */
export function withPreset(presets: LayerPreset[], name: string, hidden: Iterable<Id>): LayerPreset[] {
	const key = name.trim().toLowerCase()
	const rest = presets.filter((p) => p.name.toLowerCase() !== key)
	return [...rest, { name: name.trim(), hidden: [...hidden] }]
}

/** The layers a row click on `id` acts on: every picked layer when `id` is one of several picked, else just `id`. */
export function targetIds(picked: ReadonlySet<Id>, id: Id): Id[] {
	return picked.size > 1 && picked.has(id) ? [...picked] : [id]
}

/** Ctrl-click: `id` added to / removed from the picked set. */
export function togglePick(picked: ReadonlySet<Id>, id: Id): Set<Id> {
	const s = new Set(picked)
	if (!s.delete(id)) s.add(id)
	return s
}

/** Shift-click: every layer between the anchor and `id` in the listed order (just `id` without a usable anchor). */
export function rangePick(order: readonly Id[], anchor: Id | null, id: Id): Set<Id> {
	const a = anchor ? order.indexOf(anchor) : -1, b = order.indexOf(id)
	if (a < 0 || b < 0) return new Set([id])
	return new Set(order.slice(Math.min(a, b), Math.max(a, b) + 1))
}
