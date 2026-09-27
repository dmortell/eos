// The SITE view's OpenStreetMap data (a test, Dave 2026-09-27): geocode the project address (Nominatim), fetch the
// buildings around it (Overpass API), and turn them into footprints in LOCAL METRES about the site point (x east,
// y north) with heights from their tags (OSM "Simple 3D Buildings": height / min_height, building:levels ×
// LEVEL_M, building:part pieces, roof shape / colour). Pure except the two fetches (injectable); tested in osm.test.ts.
// Data © OpenStreetMap contributors (ODbL) — the view shows the attribution.

export type Pt2 = [number, number]
export type OsmPlace = { lat: number; lon: number; name: string; osmType?: string; osmId?: number; cls?: string; type?: string }
export type OsmBuilding = {
	id: string                   // 'way/123' / 'relation/45'
	tags: Record<string, string>
	outer: Pt2[]                 // the footprint (local metres, x east / y north), open ring (no repeated end point)
	holes: Pt2[][]
	part: boolean                // a building:part (a piece of a building with its own height)
	minH: number; h: number      // metres above ground: bottom / top of the walls (the roof sits on top: roofH)
	roofH: number; roofShape: string
	levels?: number
	colour?: string; roofColour?: string
}
export const LEVEL_M = 3.2   // a storey when only building:levels is tagged
const DEFAULT_LEVELS = 3

const NOMINATIM = 'https://nominatim.openstreetmap.org/search'
const OVERPASS = 'https://overpass-api.de/api/interpreter'

/** Address → up to 5 matches (Nominatim). */
export async function geocode(q: string, fetchFn: typeof fetch = fetch): Promise<OsmPlace[]> {
	const u = `${NOMINATIM}?format=jsonv2&limit=5&q=${encodeURIComponent(q.trim())}`
	const r = await fetchFn(u, { headers: { 'Accept-Language': 'en,ja' } })
	if (!r.ok) throw new Error(`Address search failed (${r.status})`)
	const js = (await r.json()) as { lat: string; lon: string; display_name: string; osm_type?: string; osm_id?: number; category?: string; class?: string; type?: string }[]
	return js.map((p) => ({ lat: +p.lat, lon: +p.lon, name: p.display_name, osmType: p.osm_type, osmId: p.osm_id, cls: p.category ?? p.class, type: p.type }))
}

/** The Overpass query: buildings + building parts within `r` metres of the point, with their geometry — plus the
 *  geocoded element itself (`want`, e.g. relation/3816171), so THE building is there even when the area is huge. */
export const overpassQuery = (lat: number, lon: number, r = 250, want?: { osmType?: string; osmId?: number }) => {
	// a BOUNDING BOX (±r m), not `around:` — Overpass answers a bbox from its index far faster (around: on relations
	// with geometry timed out on every server in central Tokyo)
	const dLat = r / 110574, dLon = r / (111320 * Math.cos((lat * Math.PI) / 180)), f6 = (v: number) => v.toFixed(6)
	const a = `(${f6(lat - dLat)},${f6(lon - dLon)},${f6(lat + dLat)},${f6(lon + dLon)})`
	const own = want?.osmId && (want.osmType === 'way' || want.osmType === 'relation') ? `${want.osmType}(${want.osmId});` : ''
	return `[out:json][timeout:90];(way["building"]${a};relation["building"]${a};way["building:part"]${a};relation["building:part"]${a};${own});out geom tags;`
}

/** THE building only (no neighbours): the matched way / relation and the building:part pieces touching it — one small
 *  query, light on the busy public servers. */
export const overpassTargetQuery = (want: { osmType: string; osmId: number }) =>
	`[out:json][timeout:60];${want.osmType}(${want.osmId})->.b;.b out geom tags;(way["building:part"](around.b:0);relation["building:part"](around.b:0););out geom tags;`

/** `remark` = Overpass's note when it ran out of time / memory — the result is then PARTIAL. */
export type OverpassJson = { elements: OverpassEl[]; remark?: string }
type LL = { lat: number; lon: number }
export type OverpassEl = { type: 'way' | 'relation' | 'node'; id: number; tags?: Record<string, string>; geometry?: LL[]; members?: { type: string; role: string; geometry?: LL[] }[] }

/** The public Overpass servers, tried in turn — the main one is often busy (429 / 504). */
export const OVERPASS_SERVERS = [OVERPASS, 'https://overpass.private.coffee/api/interpreter', 'https://overpass.kumi.systems/api/interpreter']
export async function fetchBuildings(lat: number, lon: number, r = 250, fetchFn: typeof fetch = fetch, want?: { osmType?: string; osmId?: number }, neighbours = true): Promise<OverpassJson> {
	// no neighbours: the matched building by id (+ its parts); a match that isn't a way / relation (a point) → a tight radius
	const byId = !neighbours && want?.osmId && (want.osmType === 'way' || want.osmType === 'relation')
	const q = byId ? overpassTargetQuery({ osmType: want!.osmType!, osmId: want!.osmId! }) : overpassQuery(lat, lon, neighbours ? r : 40, want)
	const body = 'data=' + encodeURIComponent(q)
	let last = ''
	for (const url of OVERPASS_SERVERS) {
		try {
			// a hung server (dense city centres are slow) gives way to the next after 25 s
			const res = await fetchFn(url, { method: 'POST', body, headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(45000) })
			if (res.ok) return (await res.json()) as OverpassJson
			last = String(res.status)
			if (res.status !== 429 && res.status < 500) break   // a bad query won't work anywhere else either
		} catch (e) { last = (e as Error).message }   // a network error / CORS: the next server
	}
	throw new Error(`Building data request failed (${last}) — the OSM servers are busy`)
}

/** THE building from OSM's main API (`/api/0.6/{way|relation}/{id}/full`) — one element, fast and reliable even when the
 *  public Overpass servers are overloaded — converted to the Overpass shape (`geometry` / member geometries). */
export async function fetchTarget(want: { osmType: string; osmId: number }, fetchFn: typeof fetch = fetch): Promise<OverpassJson> {
	const r = await fetchFn(`https://api.openstreetmap.org/api/0.6/${want.osmType}/${want.osmId}/full.json`, { signal: AbortSignal.timeout(20000) })
	if (!r.ok) throw new Error(`The building's outline couldn't be loaded (${r.status})`)
	return osmApiToOverpass(await r.json(), want)
}
type OsmApiEl = { type: string; id: number; lat?: number; lon?: number; nodes?: number[]; members?: { type: string; ref: number; role: string }[]; tags?: Record<string, string> }
/** THE building's building:part pieces (Overpass, the main server only, a short timeout) — best effort: [] if busy. */
export async function fetchParts(want: { osmType: string; osmId: number }, fetchFn: typeof fetch = fetch): Promise<OverpassEl[]> {
	try {
		const res = await fetchFn(OVERPASS, { method: 'POST', body: 'data=' + encodeURIComponent(overpassTargetQuery(want)), headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, signal: AbortSignal.timeout(15000) })
		return res.ok ? ((await res.json()) as OverpassJson).elements.filter((e) => e.tags?.['building:part']) : []
	} catch { return [] }
}
/** OSM API `full` JSON → Overpass-style elements (the requested way / relation with its geometry). */
export function osmApiToOverpass(js: { elements: OsmApiEl[] }, want: { osmType: string; osmId: number }): OverpassJson {
	const nodes = new Map<number, LL>(), ways = new Map<number, OsmApiEl>()
	for (const e of js.elements) { if (e.type === 'node' && e.lat != null && e.lon != null) nodes.set(e.id, { lat: e.lat, lon: e.lon }); else if (e.type === 'way') ways.set(e.id, e) }
	const geomOf = (w?: OsmApiEl) => (w?.nodes ?? []).map((n) => nodes.get(n)).filter((p): p is LL => !!p)
	const el = js.elements.find((e) => e.type === want.osmType && e.id === want.osmId)
	if (!el) return { elements: [] }
	if (el.type === 'way') return { elements: [{ type: 'way', id: el.id, tags: el.tags, geometry: geomOf(el) }] }
	return { elements: [{ type: 'relation', id: el.id, tags: el.tags, members: (el.members ?? []).filter((m) => m.type === 'way').map((m) => ({ type: 'way', role: m.role, geometry: geomOf(ways.get(m.ref)) })) }] }
}

/** lat / lon → local metres about (lat0, lon0) (an equirectangular approximation — fine over a few hundred metres). */
export const toLocal = (lat0: number, lon0: number) => (p: LL): Pt2 => [(p.lon - lon0) * 111320 * Math.cos((lat0 * Math.PI) / 180), (p.lat - lat0) * 110574]

/** "45", "45 m", "45.5m", "150 ft" → metres; undefined if unreadable. */
export function parseLen(v?: string): number | undefined {
	if (!v) return undefined
	const m = /^\s*(-?[\d.]+)\s*(m|ft|')?\s*$/i.exec(v.replace(',', '.'))
	if (!m) return undefined
	const n = +m[1]; if (!Number.isFinite(n)) return undefined
	return m[2] && /ft|'/i.test(m[2]) ? n * 0.3048 : n
}

/** Wall bottom / top + roof height from the tags (Simple 3D Buildings). */
export function heightsOf(tags: Record<string, string>, part: boolean): { minH: number; h: number; roofH: number; levels?: number } {
	const lv = parseLen(tags['building:levels']), minLv = parseLen(tags['building:min_level'])
	const roofLv = parseLen(tags['roof:levels']) ?? 0
	const roofH = parseLen(tags['roof:height']) ?? (tags['roof:shape'] && tags['roof:shape'] !== 'flat' ? roofLv * LEVEL_M || 3 : 0)
	const total = parseLen(tags.height) ?? (lv != null ? (lv + roofLv) * LEVEL_M : part ? LEVEL_M : DEFAULT_LEVELS * LEVEL_M)
	const minH = parseLen(tags.min_height) ?? (minLv != null ? minLv * LEVEL_M : 0)
	const h = Math.max(minH + 0.5, total - roofH)
	return { minH, h, roofH: Math.max(0, total - h), levels: lv }
}

/** Join way pieces into closed rings (a multipolygon's outer / inner members are often split across ways). */
export function joinRings(pieces: LL[][]): LL[][] {
	const eq = (a: LL, b: LL) => Math.abs(a.lat - b.lat) < 1e-9 && Math.abs(a.lon - b.lon) < 1e-9
	const rest = pieces.filter((p) => p.length >= 2).map((p) => [...p]), rings: LL[][] = []
	while (rest.length) {
		let cur = rest.shift()!
		for (let guard = 0; !eq(cur[0], cur[cur.length - 1]) && guard < 1000; guard++) {
			const i = rest.findIndex((p) => eq(p[0], cur[cur.length - 1]) || eq(p[p.length - 1], cur[cur.length - 1]))
			if (i < 0) break
			const p = rest.splice(i, 1)[0]
			cur = cur.concat((eq(p[0], cur[cur.length - 1]) ? p : [...p].reverse()).slice(1))
		}
		if (cur.length >= 4 && eq(cur[0], cur[cur.length - 1])) rings.push(cur)
	}
	return rings
}

/** Overpass elements → buildings in local metres about the site point. */
export function toBuildings(js: OverpassJson, lat0: number, lon0: number): OsmBuilding[] {
	const L = toLocal(lat0, lon0), out: OsmBuilding[] = []
	const open = (r: LL[]): Pt2[] => { const pts = r.map(L); const a = pts[0], b = pts[pts.length - 1]; return a && b && a[0] === b[0] && a[1] === b[1] ? pts.slice(0, -1) : pts }
	for (const el of js.elements) {
		const tags = el.tags ?? {}, part = !!tags['building:part'] && !tags.building
		if (!tags.building && !tags['building:part']) continue
		let rings: { outer: LL[][]; inner: LL[][] }
		if (el.type === 'way' && el.geometry?.length) rings = { outer: [el.geometry], inner: [] }
		else if (el.type === 'relation' && el.members) {
			// a multipolygon: outer / inner rings; a type=building relation: its OUTLINE (its parts come as their own elements)
			const isOuter = tags.type === 'building' ? (role: string) => role === 'outline' : (role: string) => role !== 'inner' && role !== 'part'
			rings = { outer: joinRings(el.members.filter((m) => isOuter(m.role) && m.geometry).map((m) => m.geometry!)), inner: joinRings(el.members.filter((m) => m.role === 'inner' && m.geometry).map((m) => m.geometry!)) }
		}
		else continue
		const hs = heightsOf(tags, part)
		rings.outer.forEach((o, k) => {
			const outer = open(o); if (outer.length < 3) return
			out.push({ id: `${el.type}/${el.id}${rings.outer.length > 1 ? `#${k}` : ''}`, tags, outer, holes: rings.inner.map(open).filter((h) => h.length >= 3), part,
				...hs, roofShape: tags['roof:shape'] ?? 'flat', colour: tags['building:colour'], roofColour: tags['roof:colour'] })
		})
	}
	return out
}

/** Is point p inside ring r (even-odd)? */
export function inRing(p: Pt2, r: Pt2[]): boolean {
	let inside = false
	for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
		const [xi, yi] = r[i], [xj, yj] = r[j]
		if ((yi > p[1]) !== (yj > p[1]) && p[0] < ((xj - xi) * (p[1] - yi)) / (yj - yi) + xi) inside = !inside
	}
	return inside
}
export const centroid = (r: Pt2[]): Pt2 => { let x = 0, y = 0; for (const p of r) { x += p[0]; y += p[1] }; return [x / r.length, y / r.length] }

/** THE building at the site: the one Nominatim matched (same OSM id), else the one containing the site point, else the
 *  nearest within 80 m; null = none. Parts are never the target (they belong to it). */
export function pickTarget(bs: OsmBuilding[], place?: Pick<OsmPlace, 'osmType' | 'osmId'>): OsmBuilding | null {
	// canopies, roofs over entrances, carports … and slivers are never THE building (a station entrance's roof sat on the
	// Shin-Marunouchi Building's geocoded point)
	const MINOR = new Set(['roof', 'canopy', 'carport', 'entrance', 'kiosk', 'shed', 'hut', 'toilets', 'bridge'])
	const whole = bs.filter((b) => !b.part && !MINOR.has(b.tags.building) && area(b.outer) >= 40)
	if (place?.osmType && place.osmId) { const id = `${place.osmType}/${place.osmId}`; const hit = whole.find((b) => b.id === id || b.id.startsWith(id + '#')); if (hit) return hit }
	const inside = whole.filter((b) => inRing([0, 0], b.outer)).sort((a, b) => area(a.outer) - area(b.outer))[0]
	if (inside) return inside
	let best: OsmBuilding | null = null, bd = 80
	for (const b of whole) { const c = centroid(b.outer), d = Math.hypot(c[0], c[1]); if (d < bd) { bd = d; best = b } }
	return best
}
export const area = (r: Pt2[]): number => { let a = 0; for (let i = 0, j = r.length - 1; i < r.length; j = i++) a += (r[j][0] + r[i][0]) * (r[j][1] - r[i][1]); return Math.abs(a / 2) }

/** The building:part pieces that belong to the target (their centre inside its footprint). */
export const partsOf = (bs: OsmBuilding[], t: OsmBuilding): OsmBuilding[] => bs.filter((b) => b.part && inRing(centroid(b.outer), t.outer))

/** A few facts for the info card (only what's tagged). */
export function factsOf(b: OsmBuilding, parts: OsmBuilding[]): [string, string][] {
	const t = b.tags, top = Math.max(b.h + b.roofH, ...parts.map((p) => p.h + p.roofH))
	const addr = [t['addr:housenumber'], t['addr:street'], t['addr:city'] ?? t['addr:suburb'], t['addr:postcode']].filter(Boolean).join(' ')
	const lv = Math.max(b.levels ?? 0, ...parts.map((p) => p.levels ?? 0))
	const rows: [string, string | undefined][] = [
		['Name', t.name ?? t['name:en']], ['Address', addr || undefined], ['Use', t.building && t.building !== 'yes' ? t.building : undefined],
		['Height', `${Math.round(top * 10) / 10} m${t.height ? '' : ' (est.)'}`], ['Levels', lv ? String(lv) : undefined],
		['Underground levels', t['building:levels:underground']], ['Built', t.start_date], ['Architect', t.architect], ['Operator', t.operator],
		['Footprint', `${Math.round(area(b.outer))} m²`], ['Parts', parts.length ? String(parts.length) : undefined],
	]
	return rows.filter((r): r is [string, string] => !!r[1])
}
