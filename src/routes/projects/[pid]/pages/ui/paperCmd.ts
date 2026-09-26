// The command line on PAPER (editing-merge-plan.md §3.4, phase 4): with no viewport active on the focused sheet, the
// sheet's PaperPage registers this target, so ERASE / MOVE / COPY (+ multiple) / ARRAY (rectangular) / ALIGN / DIST /
// select-by-point work on the viewport FRAMES — through the same editing engine the mouse uses (ItemEditor over the
// frames source). User coords are paper MILLIMETRES, Y up from the sheet area's bottom-left (like CAD paper space);
// drawing coords are the sheet area's paper px (y down). What a frame can't do (ROTATE, SCALE, MIRROR, TRIM, drawing …)
// answers NOT_ON_PAPER.
import type { Pt, Ent } from './geometry'
import type { VpCommandTarget, Xf } from './cmdBus.svelte'

export const NOT_ON_PAPER = 'Not on paper — enter a viewport (double-click it)'

type FrameBox = { id: string; x: number; y: number; w: number; h: number }
export type PaperCmdHost = {
	/** Paper px per paper mm. */
	k: number
	/** The sheet area's height (paper px) — user y is measured up from its bottom. */
	height(): number
	frames(): FrameBox[]
	selected(): string[]
	select(ids: string[]): void
	/** The frame whose border / interior is at `d` (drawing px), topmost first, or null. */
	frameAt(d: Pt): string | null
	/** The engine: move the selection one step / copies per offset in one step (drawing px). */
	moveSel(dx: number, dy: number): boolean
	copySel(offs: [number, number][]): string[]
	/** Put frames at new positions as ONE step (ALIGN / DIST). */
	place(fs: { id: string; x: number; y: number }[]): void
	erase(): void
	/** The last pointer position over the sheet (drawing px). */
	cursor(): Pt | null
}

const rectOf = (f: FrameBox): Ent => ({ id: f.id, type: 'rect', a: [f.x, f.y], b: [f.x + f.w, f.y + f.h] })
const moved = (e: Ent, dx: number, dy: number): Ent => ({ ...e, a: [e.a![0] + dx, e.a![1] + dy], b: [e.b![0] + dx, e.b![1] + dy] })

export function paperCmdTarget(h: PaperCmdHost): VpCommandTarget {
	let last: Pt | null = null
	const toDraw = (u: Pt): Pt => [u[0] * h.k, h.height() - u[1] * h.k]
	const toUser = (d: Pt): Pt => [d[0] / h.k, (h.height() - d[1]) / h.k]
	const vec = (dx: number, dy: number): [number, number] => [dx * h.k, -dy * h.k]   // a user-mm vector → drawing px
	const rects = () => h.frames().map(rectOf)
	const sel = () => { const s = new Set(h.selected()); return rects().filter((r) => s.has(r.id)) }
	const moveOnly = (ops: Xf[]) => ops.every((o) => 'move' in o)
	return {
		drawing: () => false,
		lastPoint: () => last,
		acceptPoint: () => NOT_ON_PAPER,
		distance: () => NOT_ON_PAPER,
		finish: () => {}, cancel: () => {}, close: () => {}, undoPoint: () => {},
		selected: () => h.selected(),
		ents: (ids) => { const s = new Set(ids); return rects().filter((r) => s.has(r.id)) },
		visibleEnts: rects,
		pickableEnts: rects,
		paperMm: () => h.k,
		toDraw, toUser,
		move: (dx, dy) => { last = null; return h.moveSel(...vec(dx, dy)) ? null : 'Select viewports first (unlocked)' },
		rotate: () => NOT_ON_PAPER,
		scale: () => NOT_ON_PAPER,
		copyBy: (dx, dy) => (h.copySel([vec(dx, dy)]).length ? null : 'Select viewports first'),
		copyMany: (ops) => {
			if (!moveOnly(ops)) return NOT_ON_PAPER
			return h.copySel(ops.map((o) => vec(...(o as { move: Pt }).move))).length ? null : 'Select viewports first'
		},
		transform: (op) => ('move' in op ? (h.moveSel(...vec(...op.move)) ? null : 'Select viewports first') : NOT_ON_PAPER),
		explode: (ids) => ({ done: 0, skipped: ids.length }),
		bboxOf: (e) => { const [a, b] = [e.a!, e.b!]; return [Math.min(a[0], b[0]), Math.min(a[1], b[1]), Math.max(a[0], b[0]), Math.max(a[1], b[1])] },
		preview: (op) => ('move' in op ? sel().map((r) => moved(r, ...vec(...op.move))) : []),
		apply: (ch) => {   // ALIGN / DIST hand back moved rects; anything else (adds, deletes) isn't a paper edit
			const ids = new Set(h.frames().map((f) => f.id))
			const fs = (ch.update ?? []).filter((e) => ids.has(e.id) && e.a && e.b).map((e) => ({ id: e.id, x: Math.min(e.a![0], e.b![0]), y: Math.min(e.a![1], e.b![1]) }))
			if (fs.length) h.place(fs)
		},
		newEnt: () => { throw new Error(NOT_ON_PAPER) },
		selectAll: () => h.select(h.frames().map((f) => f.id)),
		deselect: () => h.select([]),
		select: (ids) => h.select(ids),
		reorder: () => {},
		erase: () => h.erase(),
		duplicate: () => (h.copySel([[5 * h.k, 5 * h.k]]).length ? null : 'Select viewports first'),
		group: () => NOT_ON_PAPER, ungroup: () => NOT_ON_PAPER,
		layerAt: () => null, selObjLayer: () => null,
		cursor: () => h.cursor(),
		zoomSelection: () => NOT_ON_PAPER,
		hasSelection: () => h.selected().length > 0,
		zoomWindow: () => {}, zoomPrev: () => NOT_ON_PAPER,
		drawPrompt: () => null,
		addRack: () => ({ err: NOT_ON_PAPER }),
		placeText: () => NOT_ON_PAPER,
		viewState: () => ({ view: { zoom: 1, x: 0, y: 0 }, scale: '' }),
		restoreView: () => {},
		svg: () => undefined,
		graphAudit: () => null,
		entAt: (u) => { last = u; return h.frameAt(toDraw(u)) },
	}
}
