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
	#lastHere(c: ToolCtx): Outlet | null { return this.last?.levelId === c.levelId ? this.last : null }
	lastPoint(c: ToolCtx): Pt | null { const l = this.#lastHere(c); return l?.at ? c.space.fromWorld({ ...l.at, z: l.z ?? 0 }) : null }

	down(e: PointerIn, c: ToolCtx): void {
		const prev = this.#lastHere(c) ?? lastOutletOn(c)
		const level = c.index.get(c.levelId)
		const used = new Set(c.index.outlets.filter((o) => o.levelId === c.levelId).map((o) => o.label))
		let label = prev ? nextLabel(prev.label) : `${level?.type === 'level' ? level.number : ''}-001`
		while (used.has(label)) label = nextLabel(label)   // never reuse a label already on this level
		const nx = this.next(), count = nx.ports ?? prev?.ports.length ?? 2
		// zone and server room: the tool bar's, else the last outlet's; the first outlet on a level takes the level's
		// server room when it has just one (backlog "Zones and server rooms when placing outlets")
		const rooms = c.index.spaces.filter((s) => s.kind === 'server room' && s.levelId === c.levelId)
		const zoneId = nx.zoneId ?? prev?.zoneId
		const roomOf = (i: number) => nx.serverRoomId ?? (prev ? prev.ports[i]?.serverRoomId ?? prev.ports[0]?.serverRoomId : rooms.length === 1 ? rooms[0].id : undefined)
		const o: Outlet = {
			type: 'outlet', id: newId(), levelId: c.levelId, label,
			tier: nx.tier ?? prev?.tier ?? 'low', usage: nx.usage ?? prev?.usage ?? 'desk', mount: nx.mount ?? prev?.mount ?? 'floor',
			// in plan the height is sticky; on an elevation the click IS the height (an outlet placed on a wall elevation)
			...placeAt(c, e, prev?.z ?? 0),
			...(c.space.spec.kind !== 'plan' ? { inElevations: true } : {}),   // a plan outlet is a plan symbol: not in elevations
			...(zoneId ? { zoneId } : {}),
			ports: portLabelsFor(label, count, c.settings?.portSuffix ?? 'alpha', c.settings?.portSeparator ?? '.').map((l, i) => ({
				port: i + 1, label: l, cableType: nx.cableType ?? prev?.ports[i]?.cableType ?? c.settings?.defaults.outletCableType ?? 'cat6a',
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

function lastOutletOn(c: ToolCtx): Outlet | undefined {
	return c.index.outlets.filter((o) => o.levelId === c.levelId).sort((a, b) => naturalCompare(a.label, b.label)).at(-1)
}
