// The OUTLET tool (split out of tools.ts, 2026-10-05): each click places the NEXT outlet — label = the last one
// placed + 1 (ADR 0002) — with sticky defaults; on an elevation the click is its height too.
import type { Outlet, Pt } from '../domain/types'
import { placeAt, type Tool, type ToolCtx, type PointerIn } from './tools'
import { nextLabel, naturalCompare, portLabelsFor } from '../domain/labels'
import { newId } from '../domain/ids'

/** What the tool bar set for the next outlet (unset = like the last one). */
export interface OutletNext { ports?: number; tier?: Outlet['tier']; usage?: string; mount?: Outlet['mount']; cableType?: string; zoneId?: string; serverRoomId?: string }

/** Outlet: each click places the NEXT outlet (label = the last one placed + 1, ADR 0002) with sticky defaults. */
export class OutletTool implements Tool {
	readonly id = 'outlet'
	readonly cursor = 'crosshair'
	last: Outlet | null = null

	constructor(private next: () => OutletNext = () => ({})) {}

	/** A typed point: `@1200,0` places the next outlet 1.2 m along from the last one. */
	typed(p: Pt, c: ToolCtx): void { this.down({ p, shift: false, ctrl: false, alt: true }, c) }
	/** The last outlet placed, while still on its level (another floor numbers and fills in from its own outlets). */
	#lastHere(c: ToolCtx): Outlet | null {
		if (!this.last) return null
		const now = c.index.get(this.last.id)   // as it is NOW: edits made to it since are picked up (Q50)
		const l = now?.type === 'outlet' ? now : this.last
		return l.levelId === c.levelId ? l : null
	}
	lastPoint(c: ToolCtx): Pt | null { const l = this.#lastHere(c); return l?.at ? c.space.fromWorld({ ...l.at, z: l.z ?? 0 }) : null }

	down(e: PointerIn, c: ToolCtx): void {
		const prev = this.#lastHere(c) ?? lastOutletOn(c)
		const level = c.index.get(c.levelId)
		const used = new Set(c.index.outlets.filter((o) => o.levelId === c.levelId).map((o) => o.label))
		const bar = this.next()
		// W11: another usage continues ITS OWN series (the last outlet of that usage here), not the last outlet's — an ACS
		// outlet after the CAMs came out "CAM 1.03". A usage with none here yet starts "<usage> <floor>-001".
		const usage = bar.usage ?? prev?.usage ?? ''
		const like = prev && prev.usage === usage ? prev : lastOutletOn(c, usage)
		const num = level?.type === 'level' ? level.number : ''
		let label = like ? nextLabel(like.label) : usage && prev ? `${usage} ${num}-001` : `${num}-001`
		while (used.has(label)) label = nextLabel(label)   // never reuse a label already on this level
		const rooms = c.index.spaces.filter((s) => s.kind === 'server room' && s.levelId === c.levelId)
		// the tool bar's zone was picked on a level: on another floor it doesn't apply (zones are per level). Its server
		// room does: the bar lists every floor's rooms (with the floor), as floors are often served from another floor's
		// room (backlog W2: GF / L2 outlets with L1.20, the building's only room, came out with none)
		const onLevel = (id?: string) => (id && (c.index.get(id) as { levelId?: string } | undefined)?.levelId === c.levelId ? id : undefined)
		const nx = { ...bar, zoneId: onLevel(bar.zoneId), serverRoomId: bar.serverRoomId && c.index.get(bar.serverRoomId) ? bar.serverRoomId : undefined }
		const count = nx.ports ?? like?.ports.length ?? prev?.ports.length ?? 2
		// W11: height and tier by mount. The same mount as the last one keeps its height and tier (sticky); a new mount
		// starts from its own — ceiling: High at the level's clear height (no Z: `outletZ`); wall: the Usages tab's
		// "New wall outlets at" (300); floor / box: Low at 0; desk: as the last one.
		const mount = nx.mount ?? like?.mount ?? prev?.mount ?? 'box'   // the first outlet: a box at Z 0, no usage (User 2026-10-15)
		const same = like && like.mount === mount ? like : undefined
		const tier = nx.tier ?? same?.tier ?? (mount === 'ceiling' ? 'high' : mount === 'floor' || mount === 'box' ? 'low' : like?.tier ?? prev?.tier ?? 'low')
		const planZ = same ? same.z : mount === 'wall' ? c.settings?.defaults.wallOutletMm ?? 300 : mount === 'desk' ? like?.z ?? prev?.z : mount === 'ceiling' ? undefined : 0
		const { at, z } = placeAt(c, e, planZ ?? 0)
		const zz = c.space.spec.kind === 'plan' ? planZ : z
		// zone and server room: the tool bar's, else the last outlet's; the first outlet on a level takes the level's
		// server room when it has just one (backlog "Zones and server rooms when placing outlets")
		const zoneId = nx.zoneId ?? prev?.zoneId
		// …else the building's only server room, on whatever floor (Round 7, User 2026-10-16: 2F's first outlets, served
		// from IDF 1 on 1F, came out with none)
		const all = c.index.spaces.filter((s) => s.kind === 'server room')
		const only = rooms.length === 1 ? rooms[0].id : !rooms.length && all.length === 1 ? all[0].id : undefined
		const roomOf = (i: number) => nx.serverRoomId ?? (prev ? prev.ports[i]?.serverRoomId ?? prev.ports[0]?.serverRoomId : only)
		const o: Outlet = {
			type: 'outlet', id: newId(), levelId: c.levelId, label,
			tier, usage, mount,
			// in plan the height is by mount (above); on an elevation the click IS the height (an outlet placed on a wall)
			at, ...(zz !== undefined ? { z: zz } : {}),
			...(c.space.spec.kind !== 'plan' ? { inElevations: true } : {}),   // a plan outlet is a plan symbol: not in elevations
			...(zoneId ? { zoneId } : {}),
			ports: portLabelsFor(label, count, c.settings?.portSuffix ?? 'alpha', c.settings?.portSeparator ?? '.').map((l, i) => ({
				port: i + 1, label: l, cableType: nx.cableType ?? (like ?? prev)?.ports[i]?.cableType ?? c.settings?.defaults.outletCableType ?? 'cat6a',
				...(roomOf(i) ? { serverRoomId: roomOf(i) } : {}),
			})),
		}
		c.store.transact(`Place outlet ${label}`, (tx) => tx.put(o))
		this.last = o
		c.select([o.id])
	}
	move(): void {}
	up(): void {}
	cancel(): void {}
}

/** The level's last outlet by label — of one usage when `usage` is given. */
function lastOutletOn(c: ToolCtx, usage?: string): Outlet | undefined {
	return c.index.outlets.filter((o) => o.levelId === c.levelId && (usage === undefined || o.usage === usage)).sort((a, b) => naturalCompare(a.label, b.label)).at(-1)
}
