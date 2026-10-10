// Patch cords drawn ALONG THE CABLE CHANNELS in a rack-row view (backlog "Cords drawn along the cable channels", Dave
// 2026-10-06: high priority, a toggle beside the straight / sagging cords). Ported from the legacy patching tool
// (`patching/parts/cableUtils.ts` computeRoute) into view mm (y = −height):
//  - each end drops just below its port, then runs sideways to the channel on ITS side of the rack (along the panel
//    edges, clear of the ports);
//  - same rack, ports on opposite sides: across through the horizontal MANAGER nearest the middle of the two ports
//    (no manager: down the first port's side channel);
//  - different racks: out on the side facing the other rack — through the manager nearest the port first when the
//    port is on the far side — across at mid-height, and into the other rack the same way.
// Unlike the legacy one, each cord gets its own LANE (a few mm apart) in the channels and managers, so parallel cords
// don't draw on top of each other. Pure; tested in cordRoute.test.ts.
import type { Pt } from '../domain/types'

/** A port as drawn: its cell centre and half-height, and the rack it's in. */
export interface CordEnd { x: number; y: number; hh: number; rack: RackFrame }
/** A rack's frame along the view: its centre x, how far its channels sit from the centre, and its managers' middles (y). */
export interface RackFrame { id: string; mid: number; chan: number; managers: number[] }

const DROP = 6        // mm below the port cell before turning
const LANE = 3.5      // mm between neighbouring cords in a channel / manager
const LANES = 5

export function channelRoute(a: CordEnd, b: CordEnd, lane = 0): Pt[] {
	const off = (lane % LANES) * LANE
	// the drop under a port is half the lane step (Dave: on a 48-port 1U panel it ran over the port below — hard to click)
	const ya = a.y + a.hh + (DROP + off) / 2, yb = b.y + b.hh + (DROP + off) / 2
	const left = (p: CordEnd) => p.x < p.rack.mid
	const ch = (r: RackFrame, l: boolean) => (l ? r.mid - r.chan - off : r.mid + r.chan + off)
	/** The manager nearest y (its middle, shifted by the lane), or null. */
	const mgr = (r: RackFrame, y: number) => (r.managers.length ? r.managers.reduce((m, v) => (Math.abs(v - y) < Math.abs(m - y) ? v : m)) + off : null)
	const pts: Pt[] = [{ x: a.x, y: a.y }, { x: a.x, y: ya }]
	if (a.rack.id === b.rack.id) {
		const my = left(a) !== left(b) ? mgr(a.rack, (a.y + b.y) / 2) : null
		if (my !== null) pts.push({ x: ch(a.rack, left(a)), y: ya }, { x: ch(a.rack, left(a)), y: my }, { x: ch(a.rack, left(b)), y: my }, { x: ch(a.rack, left(b)), y: yb })
		else pts.push({ x: ch(a.rack, left(a)), y: ya }, { x: ch(a.rack, left(a)), y: yb })
	} else {
		const aFirst = a.rack.mid < b.rack.mid               // a's rack is left of b's
		const exitLeft = !aFirst, enterLeft = aFirst          // a leaves on the side facing b; b is entered from the side facing a
		const ty = (a.y + b.y) / 2 + off                      // across at mid-height
		const ma = left(a) !== exitLeft ? mgr(a.rack, a.y) : null
		if (ma !== null) pts.push({ x: ch(a.rack, left(a)), y: ya }, { x: ch(a.rack, left(a)), y: ma }, { x: ch(a.rack, exitLeft), y: ma })
		else pts.push({ x: ch(a.rack, exitLeft), y: ya })
		pts.push({ x: ch(a.rack, exitLeft), y: ty }, { x: ch(b.rack, enterLeft), y: ty })
		const mb = left(b) !== enterLeft ? mgr(b.rack, b.y) : null
		if (mb !== null) pts.push({ x: ch(b.rack, enterLeft), y: mb }, { x: ch(b.rack, left(b)), y: mb }, { x: ch(b.rack, left(b)), y: yb })
		else pts.push({ x: ch(b.rack, enterLeft), y: yb })
	}
	pts.push({ x: b.x, y: yb }, { x: b.x, y: b.y })
	// drop repeated points (a zero-length step when a corner coincides)
	return pts.filter((p, i) => i === 0 || p.x !== pts[i - 1].x || p.y !== pts[i - 1].y)
}
