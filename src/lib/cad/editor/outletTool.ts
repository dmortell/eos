// The OUTLET tool (split out of tools.ts, 2026-10-05): each click places the NEXT outlet — label = the last one
// placed + 1 (ADR 0002) — with sticky defaults; on an elevation the click is its height too.
import type { Outlet, Pt } from '../domain/types'
import { placeAt, type Tool, type ToolCtx, type PointerIn } from './tools'
import { nextLabel, naturalCompare, portLabelsFor } from '../domain/labels'
import { newId } from '../domain/ids'

/** Outlet: each click places the NEXT outlet (label = the last one placed + 1, ADR 0002) with sticky defaults. */
export class OutletTool implements Tool {
	readonly id = 'outlet'
	readonly cursor = 'crosshair'
	last: Outlet | null = null

	/** `next` = what the tool bar set for the next outlet (unset = like the last one). */
	constructor(private next: () => { ports?: number; tier?: Outlet['tier']; usage?: string; mount?: Outlet['mount']; cableType?: string } = () => ({})) {}

	/** A typed point: `@1200,0` places the next outlet 1.2 m along from the last one. */
	typed(p: Pt, c: ToolCtx): void { this.down({ p, shift: false, ctrl: false, alt: true }, c) }
	lastPoint(c: ToolCtx): Pt | null { return this.last?.at ? c.space.fromWorld({ ...this.last.at, z: this.last.z ?? 0 }) : null }

	down(e: PointerIn, c: ToolCtx): void {
		const prev = this.last ?? lastOutletOn(c)
		const level = c.index.get(c.levelId)
		const used = new Set(c.index.outlets.filter((o) => o.levelId === c.levelId).map((o) => o.label))
		let label = prev ? nextLabel(prev.label) : `${level?.type === 'level' ? level.number : ''}-001`
		while (used.has(label)) label = nextLabel(label)   // never reuse a label already on this level
		const nx = this.next(), count = nx.ports ?? prev?.ports.length ?? 2
		const o: Outlet = {
			type: 'outlet', id: newId(), levelId: c.levelId, label,
			tier: nx.tier ?? prev?.tier ?? 'low', usage: nx.usage ?? prev?.usage ?? 'desk', mount: nx.mount ?? prev?.mount ?? 'floor',
			// in plan the height is sticky; on an elevation the click IS the height (an outlet placed on a wall elevation)
			...placeAt(c, e, prev?.z ?? 0),
			...(prev?.zoneId ? { zoneId: prev.zoneId } : {}),
			ports: portLabelsFor(label, count, c.settings?.portSuffix ?? 'alpha', c.settings?.portSeparator ?? '.').map((l, i) => ({
				port: i + 1, label: l, cableType: nx.cableType ?? prev?.ports[i]?.cableType ?? c.settings?.defaults.outletCableType ?? 'cat6a',
				...(prev?.ports[i]?.serverRoomId ? { serverRoomId: prev.ports[i].serverRoomId } : {}),
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
