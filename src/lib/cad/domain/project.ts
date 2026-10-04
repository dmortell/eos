// A read-only index over a project's entities, for reports, grids and generators: lookups by id and type, which link
// reaches each port, and the label a port shows. Build it from the store's records; it never changes them.
import type { Entity, Layer } from './drawing'
import type { Id, Outlet, Device, Rack, Link, Cord, Level, Space, PortRef } from './types'
import type { Shape } from './shapes'
import { naturalCompare } from './labels'

export const portKey = (r: PortRef) => `${r.on}:${r.port}:${r.face ?? ''}`
const portKeyAnyFace = (r: PortRef) => `${r.on}:${r.port}:`

export class ProjectIndex {
	readonly byId = new Map<Id, Entity>()
	readonly outlets: Outlet[] = []
	readonly devices: Device[] = []
	readonly racks: Rack[] = []
	readonly links: Link[] = []
	readonly cords: Cord[] = []
	readonly levels: Level[] = []
	readonly spaces: Space[] = []
	readonly shapes: Shape[] = []
	readonly layers: Layer[] = []
	#linkAt = new Map<string, Link>()

	constructor(entities: Iterable<Entity>) {
		for (const e of entities) {
			this.byId.set(e.id, e)
			switch (e.type) {
				case 'outlet': this.outlets.push(e); break
				case 'device': this.devices.push(e); break
				case 'rack': this.racks.push(e); break
				case 'link': this.links.push(e); break
				case 'cord': this.cords.push(e); break
				case 'level': this.levels.push(e); break
				case 'space': this.spaces.push(e); break
				case 'shape': this.shapes.push(e); break
				case 'layer': this.layers.push(e); break
			}
		}
		for (const l of this.links) for (const end of [l.a, l.b]) {
			this.#linkAt.set(portKey(end), l)
			if (end.face) this.#linkAt.set(portKeyAnyFace(end), l)
		}
	}

	get<T extends Entity = Entity>(id: Id | undefined): T | undefined { return id ? (this.byId.get(id) as T | undefined) : undefined }
	nameOf(id: Id | undefined): string { const e = this.get(id) as { name?: string; label?: string } | undefined; return e?.name ?? e?.label ?? '' }

	/** The link plugged into a port (either end), if any. */
	linkAt(r: PortRef): Link | undefined { return this.#linkAt.get(portKey(r)) ?? this.#linkAt.get(portKeyAnyFace(r)) }

	/** The far end of the link at a port. */
	farEnd(r: PortRef): PortRef | undefined {
		const l = this.linkAt(r)
		if (!l) return undefined
		return l.a.on === r.on && l.a.port === r.port ? l.b : l.a
	}

	/**
	 * The label a port SHOWS (ADR 0002). An outlet port: its own label. A device port linked to an outlet: that outlet
	 * port's label. Any other device port: its `portLabels` text. Unlabelled: ''.
	 */
	portLabel(r: PortRef): string {
		const e = this.byId.get(r.on)
		if (e?.type === 'outlet') return e.ports[r.port - 1]?.label ?? ''
		if (e?.type !== 'device') return ''
		const far = this.farEnd(r), fe = far && this.byId.get(far.on)
		if (fe?.type === 'outlet') return fe.ports[far!.port - 1]?.label ?? ''
		const own = e.portLabels?.[String(r.port)]
		if (own) return own
		const l = this.linkAt(r)
		return l?.kind === 'tie' ? this.#tieLabel(l) : ''
	}

	/** A tie with no labels of its own: "RackA~RackB:NN" at both ends — the racks in name order, numbered per pair by
	 *  the first rack's device and port. Made once per index (it never changes). */
	#ties: Map<Id, string> | null = null
	#tieLabel(l: Link): string {
		if (!this.#ties) {
			this.#ties = new Map()
			const rackOf = (on: Id) => { const d = this.byId.get(on); return d?.type === 'device' ? this.byId.get(d.rackId) : undefined }
			const pairs = new Map<string, { id: Id; key: string; a: string; b: string }[]>()
			for (const t of this.links) {
				if (t.kind !== 'tie') continue
				const ra = rackOf(t.a.on), rb = rackOf(t.b.on)
				if (ra?.type !== 'rack' || rb?.type !== 'rack') continue
				const first = naturalCompare(ra.name, rb.name) <= 0, [A, B] = first ? [ra.name, rb.name] : [rb.name, ra.name], end = first ? t.a : t.b
				const k = `${A}~${B}`
				if (!pairs.has(k)) pairs.set(k, [])
				pairs.get(k)!.push({ id: t.id, key: `${this.nameOf(end.on)}\u0000${String(end.port).padStart(4, '0')}`, a: A, b: B })
			}
			for (const list of pairs.values()) list.sort((x, y) => naturalCompare(x.key, y.key)).forEach((x, i) => this.#ties!.set(x.id, `${x.a}~${x.b}:${String(i + 1).padStart(2, '0')}`))
		}
		return this.#ties.get(l.id) ?? ''
	}

	/** "Rack A01 · Panel 3 : 17" — where a device port is, for schedules. */
	portPlace(r: PortRef): string {
		const e = this.byId.get(r.on)
		if (e?.type === 'outlet') return `${e.label} : ${r.port}`
		if (e?.type !== 'device') return '?'
		return `${this.nameOf(e.rackId)} · ${e.name} : ${r.port}${r.face ? ` (${r.face})` : ''}`
	}

	devicesIn(rackId: Id): Device[] { return this.devices.filter((d) => d.rackId === rackId).sort((a, b) => b.u - a.u) }
}
