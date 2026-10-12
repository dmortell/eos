// The path tool (ADR 0006 / 0007): one tool, four presets — a plain LINE, a TRUNK, a CONDUIT or a WALL are the same
// path with a different section and role. Click points at work Z; R = Rise / drop (a vertical segment at the last
// point, the run carries on at the new Z); Enter / double-click finishes; Backspace drops the last point; Esc finishes
// (or cancels with < 2 points) and stays in the tool; a second Esc goes back to Select. A right-click = Esc. Snapping onto an outlet or rack ATTACHES the node so it follows it.
import type { Id, Pt } from '../domain/types'
import type { Prim } from '../views/display'
import type { Section } from '../domain/shapes'
import type { Tool, ToolCtx, PointerIn } from './tools'
import { snapMark } from './tools'
import type { Snap } from './snap'
import { makePath, toWall, toContainment } from '../domain/make'
import { angleStep } from './constrain'
import { newId } from '../domain/ids'
import { placeNote } from './noteTool'
import { splitRunsAt, runZAt } from '../domain/pathEdit'

export type PathKind = 'line' | 'trunk' | 'conduit' | 'wall'

interface Pick { x: number; y: number; z: number; attach?: Id; levelId?: Id }

export class PathTool implements Tool {
	readonly cursor = 'crosshair'
	pts: Pick[] = []
	#hover: Snap | null = null

	constructor(readonly id: PathKind) {}

	/** Picks are MODEL points: a plan click lands at the work Z, an elevation click on the work plane (its height is the
	 *  click), so the same tool draws runs in either view — on an elevation a drop is simply drawn. */
	down(e: PointerIn, c: ToolCtx): void {
		const s = this.#pick(e, c)
		// back on the first point (3+ points): CLOSE the run (a room's walls, a loop of trunk)
		const first = this.pts.length >= 3 ? c.space.fromWorld(this.pts[0]) : null
		if (first && Math.hypot(e.p.x - first.x, e.p.y - first.y) <= c.tol() * 1.5) { this.finish(c, true); return }
		this.#add(s.p, c, s.attach)
		if ((e.count ?? 1) >= 2) this.finish(c)
	}
	/** The snapped point — or, with Shift, the cursor turned to 15° steps from the last point (no object snap). */
	#pick(e: PointerIn, c: ToolCtx): Snap {
		const last = e.shift ? this.lastPoint(c) : null
		return last ? { p: angleStep(last, e.p), kind: 'grid' } : c.snap(e.p, e.alt)
	}

	/** A typed point (no snap) — like a click there. */
	typed(p: Pt, c: ToolCtx): void { this.#add(p, c) }
	lastPoint(c: ToolCtx): Pt | null { const l = this.pts.at(-1); return l ? c.space.fromWorld(l) : null }

	#add(view: Pt, c: ToolCtx, attach?: Id): void {
		const w = c.space.toWorld(view, c.work)
		const p = { x: round(w.x), y: round(w.y), z: round(w.z) }
		const last = this.pts.at(-1)
		if (!last || last.x !== p.x || last.y !== p.y || last.z !== p.z) this.pts.push({ ...p, ...(attach ? { attach } : {}) })
	}
	move(e: PointerIn, c: ToolCtx): void { this.hover(e, c) }
	up(): void {}
	hover(e: PointerIn, c: ToolCtx): void { this.#hover = this.#pick(e, c) }

	key(e: KeyboardEvent, c: ToolCtx): boolean {
		if (e.key === 'Enter') { this.finish(c); return true }
		if (e.key.toLowerCase() === 'c' && this.pts.length >= 3) { this.finish(c, true); return true }   // close it
		if (e.key === 'Backspace' && this.pts.length) { this.pts.pop(); return true }   // none: it deletes the selection
		if (e.key.toLowerCase() === 'r' && this.pts.length) {
			c.ask('Rise / drop to Z (mm above FFL)', c.opts.z, (z) => this.riseTo(z, c))
			return true
		}
		if (e.key.toLowerCase() === 'v' && this.pts.length && this.id !== 'wall') {
			const here = c.index.get(c.levelId)
			c.ask('Riser to level number', here?.type === 'level' ? here.number + 1 : 0, (n) => this.riserTo(n, c))
			return true
		}
		// Esc with nothing drawn yet is not ours: the shell then goes back to Select
		if (e.key === 'Escape') { if (!this.pts.length) return false; if (this.pts.length >= 2) this.finish(c); else this.cancel(); return true }
		return false
	}

	/** A riser: a vertical segment from the last point to FFL of another level, then the run ends there (carry on
	 *  from that node on the other level's plan with Ctrl-drag). Unknown level numbers do nothing. */
	riserTo(levelNumber: number, c: ToolCtx): void {
		const last = this.pts.at(-1)
		// a floor with area plans (33F 3303 / 33F 3307) has several levels of one number: the main plan wins, then by order
		const lv = c.index.levels.filter((l) => l.number === levelNumber && l.id !== c.levelId).sort((a, b) => Number(!!a.area) - Number(!!b.area) || a.order - b.order)[0]
		if (!last || !lv) return
		this.pts.push({ x: last.x, y: last.y, z: 0, levelId: lv.id })
		this.finish(c)
	}

	/** A vertical segment at the last point; the run carries on at the new Z. */
	riseTo(z: number, c: ToolCtx): void {
		const last = this.pts.at(-1)
		if (!last || z === last.z) return
		this.pts.push({ x: last.x, y: last.y, z })
		c.opts.z = z
	}

	/** `close` = one more segment back to the first point (3+ points). */
	finish(c: ToolCtx, close = false): void {
		if (this.pts.length < 2) { this.cancel(); return }
		const pts = this.pts
		this.pts = []
		// a LINE on a sheet (backlog "Any annotation can belong to a viewport"): on the paper — or, started inside a
		// viewport, tied to it in its view mm, so it moves / copies / goes with it, like notes
		if (c.space.spec.kind === 'sheet') {
			const at = placeNote(c, pts.map((p) => ({ x: p.x, y: p.y })))
			if (!at) return
			const s = makePath(at.owner as never, at.pts.map((p) => ({ ...p, z: 0 })), { closed: close && pts.length >= 3 })
			c.store.transact('Draw line', (tx) => tx.put(s))
			c.select([s.id])
			return
		}
		// a trunk / conduit started or ended ON another run at another height: a drop / rise to it at that end, so they meet
		const joins = (this.id === 'trunk' || this.id === 'conduit') && !close
		if (joins && c.space.spec.kind === 'plan') {   // (an elevation draws heights as meant)
			const runs = c.store.ofType('shape')
			const dropAt = (p: Pick) => { const z = p.levelId ? null : runZAt(runs, c.levelId, p, p.z); return z !== null && Math.abs(z - p.z) >= 1 ? { x: p.x, y: p.y, z } : null }
			const last = dropAt(pts[pts.length - 1]), first = dropAt(pts[0])
			if (last) pts.push(last)
			if (first) pts.unshift(first)
		}
		const line = makePath({ levelId: c.levelId }, pts)
		// carry each pick's attachment onto its node
		if (line.geom.kind === 'path') line.geom.nodes.forEach((n, i) => { if (pts[i].attach) n.attach = pts[i].attach; if (pts[i].levelId) n.levelId = pts[i].levelId })
		if (close && pts.length >= 3 && line.geom.kind === 'path') {
			const ns = line.geom.nodes
			line.geom.segs.push({ id: newId(), a: ns[ns.length - 1].id, b: ns[0].id })
		}
		// a LINE drawn on an elevation / section lies on its plane and belongs to that view only (shapes.ts ownFrame)
		const spec = c.space.spec, onView = this.id === 'line' && c.space.frame && (spec.kind === 'elevation' || spec.kind === 'section')
			? { plane: { kind: 'vertical' as const, frame: c.space.frame, depth: Math.round(c.work.depth) } } : {}
		const shape = this.id === 'line' ? { ...line, ...onView, ...(c.layerId ? { layerId: c.layerId } : {}) }
			: this.id === 'wall' ? toWall(line, c.opts.w, c.opts.h)
			: toContainment(line, this.#section(c), { tier: Math.max(...pts.map((p) => p.z)) > 0 ? 'high' : 'low', form: this.id === 'conduit' ? 'conduit' : 'trunk' })
		// a trunk / conduit drawn from / to the middle of another run's segment: that run gets a node there (they join)
		const ends = joins ? [pts[0], pts[pts.length - 1]].filter((p) => !p.levelId) : []
		const split = ends.length ? splitRunsAt(c.store.ofType('shape'), c.levelId, ends) : []
		c.store.transact(`Draw ${this.id}`, (tx) => { tx.put(shape); split.forEach((x) => tx.put(x)) })
		c.select([shape.id])
		if (split.length) c.say?.(`Joined to ${split.map((x) => x.label || 'a run').join(', ')} (a node added there)`)
	}

	cancel(): void { this.pts = []; this.#hover = null }

	#section(c: ToolCtx): Section {
		return this.id === 'conduit' ? { w: c.opts.w, h: c.opts.w, round: true, anchor: 'centre' } : { w: c.opts.w, h: c.opts.h }
	}

	/** Drawn in the VIEW: the picks projected into it, plus the rubber band to the cursor. */
	preview(c: ToolCtx): Prim[] {
		const out: Prim[] = []
		const view = this.pts.map((p) => c.space.fromWorld(p))
		const pts: Pt[] = [...view]
		if (this.#hover && pts.length) pts.push(this.#hover.p)
		const w = this.id === 'line' ? undefined : c.opts.w
		if (pts.length >= 2) out.push({ k: 'line', pts, ...(w ? { w } : {}), cls: `draft ${this.id}` })
		for (let i = 1; i < view.length; i++) {
			const a = view[i - 1], b = view[i]
			if (a.x === b.x && a.y === b.y) out.push({ k: 'circle', c: a, r: (w ?? 100) / 2, cls: 'draft riser' })
		}
		if (this.#hover && this.#hover.kind !== 'grid') out.push(snapMark(this.#hover, c.tol()))
		return out
	}
}

const round = (v: number) => Math.round(v * 10) / 10
