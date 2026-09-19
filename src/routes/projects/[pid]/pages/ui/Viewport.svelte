<script lang="ts">
	// Reusable viewport (kestrel-adoption mockup) with mock CAD drawing modeled on
	// KestrelCad2 (src/app.js acceptPoint / preview / prompts, src/model.js entity
	// types): click-to-place tools with a rubber-band preview, and Select-tool
	// hit-testing. Used inside a sheet's paper page (kind='floorplan') and as a
	// standalone model view (kind='model'). The parent owns the entities/selection
	// (so drawing persists per document, tool + selection per view). Fills its parent.
	import { Icon } from '$lib'
	import { tick } from 'svelte'
	import { panzoom } from './panzoom'
	import Handle from '../parts/Handle.svelte'
	import { BASE, HANDLE_PX } from '../constants'

	export type Pt = [number, number]
	// 'box' = a mock 3D cuboid: a,b are the footprint corners (plan), h is its height (mm).
	// It projects differently per view kind (plan footprint / elevation front / model oblique).
	export type Ent = { id: string; type: 'line' | 'rect' | 'circle' | 'ellipse' | 'dim' | 'text' | 'box'; a?: Pt; b?: Pt; c?: Pt; r?: number; h?: number; text?: string }
	export type View = { zoom: number; x: number; y: number }

	let { label = 'Viewport', scale = '', kind = 'floorplan', active = false, tool = 'Select', boxW, boxH, acad = true, navContent = false, grid = true, lwt = true, canvasZoom = 1, border = 'dashed',
		entities = [], sel = [], view = { zoom: 1, x: 0, y: 0 }, onactivate, ondeactivate, onadd, onupdate, onselect, onview }:
		{ label?: string; scale?: string; kind?: 'floorplan' | 'model' | 'elevation'; active?: boolean; tool?: string; boxW?: number; boxH?: number; acad?: boolean; navContent?: boolean; grid?: boolean; lwt?: boolean; canvasZoom?: number; border?: 'dashed' | 'solid' | 'none';
			entities?: Ent[]; sel?: string[]; view?: View; onactivate?: () => void; ondeactivate?: () => void; onadd?: (e: Ent) => void; onupdate?: (e: Ent) => void; onselect?: (ids: string[]) => void; onview?: (v: View) => void } = $props()

	const tagIcon: Record<string, string> = { floorplan: 'mapPin', model: 'box', elevation: 'server' }
	const DRAW = new Set(['Line', 'Rectangle', 'Ellipse', 'Dimension', 'Text', 'Box'])
	const DEFAULT_BOX_H = 45   // mock mm height for a freshly drawn cuboid
	// Body-hover cursor: 'move' over a shape (drag to move), else default; grips carry their own
	// crosshair (they render on top, so their cursor wins over the container's).
	let hoverBody = $state(false)
	let cursorStyle = $derived(!active ? 'pointer' : DRAW.has(tool) ? 'crosshair' : hoverBody ? 'move' : 'default')

	// ── background mock content ──
	const desks: { x: number; y: number }[] = []
	for (let c = 0; c < 4; c++) for (let r = 0; r < 5; r++) desks.push({ x: 54 + c * 82, y: 44 + r * 38 })
	const DW = 56, DH = 26
	const outlets = desks.map((d, i) => ({ x: d.x + DW / 2, y: d.y + DH + 7, k: i % 4 === 0 ? 'p' : i % 4 === 2 ? 'a' : 'n' }))
	const outletColor: Record<string, string> = { p: '#f97316', n: '#3b82f6', a: '#10b981' }
	const IX = 205, IY = 70, SX = 1.15, SY = 0.58
	const pt = (x: number, y: number, z: number) => `${IX + (x - z) * SX},${IY + (x + z) * SY - y * 1.1}`
	function boxF(x: number, z: number, w: number, d: number, h: number) {
		return {
			top: `${pt(x, h, z)} ${pt(x + w, h, z)} ${pt(x + w, h, z + d)} ${pt(x, h, z + d)}`,
			left: `${pt(x, 0, z)} ${pt(x, h, z)} ${pt(x, h, z + d)} ${pt(x, 0, z + d)}`,
			right: `${pt(x, 0, z + d)} ${pt(x, h, z + d)} ${pt(x + w, h, z + d)} ${pt(x + w, 0, z + d)}`,
		}
	}
	const racks = [boxF(20, 10, 26, 46, 60), boxF(60, 10, 26, 46, 60), boxF(100, 10, 26, 46, 60), boxF(20, 80, 26, 46, 42)]
	const floorGrid: string[] = []
	for (let i = 0; i <= 6; i++) { floorGrid.push(`${pt(i * 24, 0, 0)} ${pt(i * 24, 0, 144)}`); floorGrid.push(`${pt(0, 0, i * 24)} ${pt(144, 0, i * 24)}`) }

	// ── drawing (Kestrel-style) ──
	const INK = '#475569', SEL = '#0e7490'
	let svg: SVGSVGElement | undefined = $state()   // outer svg (viewBox space)
	let draft = $state<Pt[]>([])
	let cur = $state<Pt | null>(null)
	let seq = 0
	const uid = () => 'e' + Date.now().toString(36) + (seq++)
	const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1])
	const selSet = $derived(new Set(sel))

	// Coordinate mapping uses getBoundingClientRect, NOT getScreenCTM: getScreenCTM ignores CSS
	// transforms on HTML ancestors, so it's wrong whenever the canvas is zoomed (its scale lives
	// in a CSS transform above this SVG). getBoundingClientRect reflects every ancestor transform,
	// so mapping stays correct at any canvas/viewport zoom.
	//
	// A viewport is a fixed-SCALE window into model space (like an AutoCAD viewport): BASE px on
	// screen = 1 model unit at zoom 1, whatever the frame size — so resizing the frame reveals/
	// crops more model rather than rescaling the drawing. The viewBox is sized to the container
	// (÷ BASE) and centred on the plan (CX,CY); the parent passes boxW/boxH when it owns the size
	// (a paper viewport frame — reliable), else we measure via bind:clientWidth (standalone
	// viewports). The mock drawing (0..400 × 0..250) sits at that fixed scale.
	const CX = 200, CY = 125   // plan centre (BASE / HANDLE_PX come from ../constants)
	let vpW = $state(0), vpH = $state(0)
	let vbW = $derived(((boxW ?? vpW) || 400) / BASE), vbH = $derived(((boxH ?? vpH) || 250) / BASE)
	let minX = $derived(CX - vbW / 2), minY = $derived(CY - vbH / 2)
	// viewBox → screen mapping (aspect matches the frame, so no letterboxing).
	function vbMap(): { scale: number; left: number; top: number } | null {
		if (!svg) return null
		const r = svg.getBoundingClientRect()
		return { scale: r.width / vbW, left: r.left, top: r.top }   // px per model unit (incl. canvas zoom)
	}
	function clientToVB(cx: number, cy: number): Pt | null {
		const m = vbMap(); if (!m) return null
		return [minX + (cx - m.left) / m.scale, minY + (cy - m.top) / m.scale]
	}
	// Client px → drawing (view-local) coords, for placing/hit-testing.
	function toLocalXY(cx: number, cy: number): Pt | null {
		const v = clientToVB(cx, cy); if (!v) return null
		return [(v[0] - view.x) / view.zoom, (v[1] - view.y) / view.zoom]
	}
	function toLocal(e: MouseEvent): Pt | null { return toLocalXY(e.clientX, e.clientY) }
	// Drawing (view-local) coords → client px, for handle hit-testing.
	function localToClient(x: number, y: number): { x: number; y: number } | null {
		const m = vbMap(); if (!m) return null
		const vx = view.x + x * view.zoom, vy = view.y + y * view.zoom
		return { x: m.left + (vx - minX) * m.scale, y: m.top + (vy - minY) * m.scale }
	}
	// ── pan/zoom the viewport content (SVG group transform, in viewBox units) ──
	function onPan(dx: number, dy: number) {
		const m = vbMap(); if (!m) return
		onview?.({ zoom: view.zoom, x: view.x + dx / m.scale, y: view.y + dy / m.scale })
	}
	function onZoom(f: number, cx: number, cy: number) {
		const v = clientToVB(cx, cy); if (!v) return   // cursor in viewBox coords
		const nz = Math.min(8, Math.max(0.25, view.zoom * f)), r = nz / view.zoom
		onview?.({ zoom: nz, x: v[0] - (v[0] - view.x) * r, y: v[1] - (v[1] - view.y) * r })
	}
	// panzoom passes its node as a trailing arg (unused here)
	// Shift-constrain the drawing point relative to the start: rectangle → square, line/dim →
	// 15° angle increments (which includes ortho), circle → free radius.
	function constrainPt(a: Pt, p: Pt, shift: boolean): Pt {
		if (!shift) return p
		const dx = p[0] - a[0], dy = p[1] - a[1]
		if (tool === 'Rectangle' || tool === 'Ellipse' || tool === 'Box') {   // Shift → square bbox (a circle for the ellipse)
			const s = Math.max(Math.abs(dx), Math.abs(dy))
			return [a[0] + (dx < 0 ? -s : s), a[1] + (dy < 0 ? -s : s)]
		}
		if (tool === 'Line' || tool === 'Dimension') {
			const len = Math.hypot(dx, dy), step = Math.PI / 12   // 15°
			const ang = Math.round(Math.atan2(dy, dx) / step) * step
			return [a[0] + len * Math.cos(ang), a[1] + len * Math.sin(ang)]
		}
		return p
	}
	function place(a: Pt, b: Pt) {
		if (tool === 'Line') onadd?.({ id: uid(), type: 'line', a, b })
		else if (tool === 'Rectangle') onadd?.({ id: uid(), type: 'rect', a, b })
		else if (tool === 'Ellipse') onadd?.({ id: uid(), type: 'ellipse', a, b })
		else if (tool === 'Box') onadd?.({ id: uid(), type: 'box', a, b, h: DEFAULT_BOX_H })
		else if (tool === 'Dimension') onadd?.({ id: uid(), type: 'dim', a, b })
	}
	function onClick(e: MouseEvent) {
		e.stopPropagation()
		if (suppressClick) { suppressClick = false; return }   // this click just ended a drag
		if (!active) return   // paper space: enter with a double-click (see onDblclick)
		const p = toLocal(e); if (!p) return
		if (tool === 'Select') { onselect?.(hit(p)); return }
		if (tool === 'Text') { onadd?.({ id: uid(), type: 'text', a: p, text: 'TEXT' }); return }
		if (!acad) return   // EOS mode: shapes are drawn press-drag (onDown), not by clicking
		// AutoCAD mode: two clicks — first point, then the (Shift-constrained) opposite point.
		if (!draft.length) { draft = [p]; return }
		place(draft[0], constrainPt(draft[0], p, e.shiftKey))
		draft = []
	}
	let lastRaw: Pt | null = null   // last UNconstrained pointer during a draft (for re-constraining on Shift)
	function onMove(e: MouseEvent) {
		if (active && draft.length) { const p = toLocal(e); if (p) { lastRaw = p; cur = constrainPt(draft[0], p, e.shiftKey) } }
		// hover feedback for the Select tool: 'move' when over a shape body (a grip shows its own cursor)
		if (active && tool === 'Select' && !drag && !draft.length && !marquee) {
			const lp = toLocalXY(e.clientX, e.clientY)
			hoverBody = !!lp && hit(lp).length > 0
		} else hoverBody = false
	}
	// Re-apply the constraint the instant Shift changes (don't wait for a pointer move) — for
	// both an in-progress draw and an in-progress move/grip drag.
	function reconstrain(shift: boolean) {
		if (drag && lastDragRaw) onupdate?.(applyDrag(lastDragRaw, shift))
		else if (active && draft.length && lastRaw) cur = constrainPt(draft[0], lastRaw, shift)
	}
	// Double-click: outside a viewport → enter model space; inside an active viewport, on a
	// TEXT object → edit it in place.
	function onDblclick(e: MouseEvent) {
		e.stopPropagation()
		if (!active) { onactivate?.(); return }
		const p = toLocal(e); if (!p) return
		const ent = entities.find(x => x.id === hit(p)[0])
		if (ent?.type === 'text') startTextEdit(ent)
	}
	// ── edit text in place ──
	let editText = $state<{ id: string; x: number; y: number; fontPx: number; value: string } | null>(null)
	let textInput: HTMLTextAreaElement | undefined = $state()
	function startTextEdit(ent: Ent) {
		const m = vbMap(); const sp = localToClient(ent.a![0], ent.a![1]); const host = svg?.parentElement
		if (!m || !sp || !host) return
		const r = host.getBoundingClientRect(), fontPx = 11 * view.zoom * m.scale
		editText = { id: ent.id, x: sp.x - r.left, y: sp.y - r.top, fontPx, value: ent.text ?? '' }
		tick().then(() => { textInput?.focus(); textInput?.select() })
	}
	function commitText() {
		if (!editText) return
		const ent = entities.find(x => x.id === editText!.id)
		if (ent) onupdate?.({ ...ent, text: editText.value })
		editText = null
	}
	// Note: right-button is reserved for pan/zoom (incl. mid-draw, to reach a far
	// endpoint), so it must NOT cancel the draft. Esc cancels an in-progress draw.
	// Esc ladder (CAD-style): cancel an in-progress draw → clear selection → exit viewport.
	function onKey(e: KeyboardEvent) {
		if (!active) return
		if (e.key === 'Shift') { reconstrain(true); return }
		if (e.key !== 'Escape') return
		if (draft.length) draft = []
		else if (sel.length) onselect?.([])
		else ondeactivate?.()
	}

	// hit-test (topmost first)
	function segDist(p: Pt, a: Pt, b: Pt) {
		const dx = b[0] - a[0], dy = b[1] - a[1], L = dx * dx + dy * dy || 1
		let t = ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / L; t = Math.max(0, Math.min(1, t))
		return Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy))
	}
	function hitEnt(e: Ent, p: Pt, thr: number): boolean {
		if (e.type === 'line' || e.type === 'dim') return segDist(p, e.a!, e.b!) < thr
		if (e.type === 'rect' || e.type === 'box') { const x0 = Math.min(e.a![0], e.b![0]), y0 = Math.min(e.a![1], e.b![1]), x1 = Math.max(e.a![0], e.b![0]), y1 = Math.max(e.a![1], e.b![1]); return p[0] >= x0 - thr && p[0] <= x1 + thr && p[1] >= y0 - thr && p[1] <= y1 + thr }
		if (e.type === 'circle') return dist(e.c!, p) <= e.r! + thr
		if (e.type === 'ellipse') {
			const cx = (e.a![0] + e.b![0]) / 2, cy = (e.a![1] + e.b![1]) / 2
			const rx = Math.abs(e.b![0] - e.a![0]) / 2 + thr, ry = Math.abs(e.b![1] - e.a![1]) / 2 + thr
			const nx = (p[0] - cx) / (rx || 1), ny = (p[1] - cy) / (ry || 1)
			return nx * nx + ny * ny <= 1
		}
		if (e.type === 'text') return Math.abs(p[0] - e.a![0]) < 24 && Math.abs(p[1] - e.a![1]) < 10
		return false
	}
	function hit(p: Pt): string[] {
		for (let i = entities.length - 1; i >= 0; i--) if (hitEnt(entities[i], p, 8)) return [entities[i].id]
		return []
	}

	// ── editing handles (Kestrel-style grips) ──
	// Each selected entity shows square grips at its defining points. Dragging a grip edits
	// that point; dragging the body moves the whole entity. Grips render at a constant
	// screen size (÷ zoom) so they don't grow as the viewport zooms, like real CAD.
	type Grip = { x: number; y: number; apply: (p: Pt) => Ent }
	function gripsFor(e: Ent): Grip[] {
		if (e.type === 'line' || e.type === 'dim') return [
			{ x: e.a![0], y: e.a![1], apply: p => ({ ...e, a: p }) },
			{ x: e.b![0], y: e.b![1], apply: p => ({ ...e, b: p }) },
		]
		if (e.type === 'rect' || e.type === 'ellipse' || e.type === 'box') {   // 4 corner grips on the footprint/bbox
			const [ax, ay] = e.a!, [bx, by] = e.b!
			return [
				{ x: ax, y: ay, apply: p => ({ ...e, a: p }) },
				{ x: bx, y: by, apply: p => ({ ...e, b: p }) },
				{ x: ax, y: by, apply: p => ({ ...e, a: [p[0], e.a![1]] as Pt, b: [e.b![0], p[1]] as Pt }) },
				{ x: bx, y: ay, apply: p => ({ ...e, a: [e.a![0], p[1]] as Pt, b: [p[0], e.b![1]] as Pt }) },
			]
		}
		if (e.type === 'circle') return [
			{ x: e.c![0], y: e.c![1], apply: p => ({ ...e, c: p }) },                       // move centre
			{ x: e.c![0] + e.r!, y: e.c![1], apply: p => ({ ...e, r: Math.max(1, dist(e.c!, p)) }) }, // radius
		]
		if (e.type === 'text') return [{ x: e.a![0], y: e.a![1], apply: p => ({ ...e, a: p }) }]
		return []
	}
	function translate(e: Ent, dx: number, dy: number): Ent {
		const t = (p?: Pt): Pt | undefined => p ? [p[0] + dx, p[1] + dy] : p
		return { ...e, a: t(e.a), b: t(e.b), c: t(e.c) }
	}
	// Shift-constrain a grip drag: box corner → square about the opposite corner; line/dim
	// endpoint → 15° about the other end. (Circle radius left free.)
	function constrainGrip(base: Ent, gi: number, p: Pt, shift: boolean): Pt {
		if (!shift) return p
		if (base.type === 'rect' || base.type === 'ellipse' || base.type === 'box') {
			const [ax, ay] = base.a!, [bx, by] = base.b!
			const an: Pt = gi === 0 ? [bx, by] : gi === 1 ? [ax, ay] : gi === 2 ? [bx, ay] : [ax, by]
			const s = Math.max(Math.abs(p[0] - an[0]), Math.abs(p[1] - an[1]))
			return [an[0] + (p[0] < an[0] ? -s : s), an[1] + (p[1] < an[1] ? -s : s)]
		}
		if (base.type === 'line' || base.type === 'dim') {
			const an = gi === 0 ? base.b! : base.a!
			const dx = p[0] - an[0], dy = p[1] - an[1], len = Math.hypot(dx, dy), step = Math.PI / 12
			const ang = Math.round(Math.atan2(dy, dx) / step) * step
			return [an[0] + len * Math.cos(ang), an[1] + len * Math.sin(ang)]
		}
		return p
	}
	// Grips must be a CONSTANT screen size (Kestrel / Outlets), whatever the zoom. On-screen
	// px of a model-unit length = length · view.zoom · (BASE · canvasZoom); dividing by both
	// zooms cancels them so the grip is always HANDLE_PX px — the canvas CSS zoom included
	// (without canvasZoom the grips grew as you zoomed the canvas in).
	const gripSize = $derived(HANDLE_PX / BASE / view.zoom / (canvasZoom || 1))

	// What a press at these client coords would grab: a grip of a selected entity, or the
	// body of any entity (topmost). Drives the pointer-drag start (mouse-left / 1-finger
	// touch) — navigation is 2-finger, so a single finger is always free to edit.
	function pick(clientX: number, clientY: number): { kind: 'grip' | 'move'; id: string; gi: number } | null {
		for (const id of sel) {
			const ent = entities.find(x => x.id === id); if (!ent) continue
			const gs = gripsFor(ent)
			for (let i = 0; i < gs.length; i++) {
				const sp = localToClient(gs[i].x, gs[i].y); if (!sp) continue
				if (Math.hypot(sp.x - clientX, sp.y - clientY) < 14) return { kind: 'grip', id, gi: i }
			}
		}
		const lp = toLocalXY(clientX, clientY)
		if (lp) { const ids = hit(lp); if (ids.length) return { kind: 'move', id: ids[0], gi: -1 } }
		return null
	}

	// ── drag to move / edit ──
	let drag: { id: string; base: Ent; kind: 'grip' | 'move'; gi: number; start: Pt } | null = null
	let dragged = false        // true once the pointer actually moved during a drag
	let suppressClick = false  // swallow the click that ends a real drag (avoids re-select)
	// Track pressed pointers so a second finger (2-finger pan/zoom) aborts an entity drag —
	// otherwise finger 1 landing on a shape starts a move that the pan then drags around.
	const pointers = new Set<number>()
	function cancelPointerDrag() {
		if (drag) {
			if (dragged) onupdate?.(drag.base)   // revert any partial move/resize
			drag = null
			window.removeEventListener('pointermove', onDragMove)
			window.removeEventListener('pointerup', onDragUp)
		}
		if (marquee) {
			marquee = null
			window.removeEventListener('pointermove', onMarqueeMove)
			window.removeEventListener('pointerup', onMarqueeUp)
		}
		if (draft.length) {   // abort an in-progress press-drag draw
			draft = []; cur = null
			window.removeEventListener('pointermove', onDrawMove)
			window.removeEventListener('pointerup', onDrawUp)
		}
	}
	$effect(() => {
		const up = (e: PointerEvent) => pointers.delete(e.pointerId)
		window.addEventListener('pointerup', up)
		window.addEventListener('pointercancel', up)
		return () => { window.removeEventListener('pointerup', up); window.removeEventListener('pointercancel', up) }
	})
	function onDown(e: PointerEvent) {
		if (editText || !active || e.button !== 0) return   // ignore while editing text in place
		suppressClick = false   // clear any stale flag from a drag that never got its click
		pointers.add(e.pointerId)
		if (pointers.size > 1) { cancelPointerDrag(); return }   // 2nd finger → hand off to pan/zoom
		// EOS mode: shapes are drawn with a single press-drag-release (not two clicks).
		if (tool !== 'Select') {
			if (acad || tool === 'Text') return   // AutoCAD two-click / text single-click via onClick
			const dp = toLocalXY(e.clientX, e.clientY); if (!dp) return
			draft = [dp]; cur = dp
			try { (e.currentTarget as Element).setPointerCapture(e.pointerId) } catch { /* synthetic */ }
			e.preventDefault()
			window.addEventListener('pointermove', onDrawMove)
			window.addEventListener('pointerup', onDrawUp)
			return
		}
		const p = toLocalXY(e.clientX, e.clientY); if (!p) return
		const hitInfo = pick(e.clientX, e.clientY)
		if (!hitInfo) {
			// empty space → drag a Kestrel-style selection box (window / crossing)
			marquee = { a: p, b: p }
			try { (e.currentTarget as Element).setPointerCapture(e.pointerId) } catch { /* synthetic */ }
			e.preventDefault()
			window.addEventListener('pointermove', onMarqueeMove)
			window.addEventListener('pointerup', onMarqueeUp)
			return
		}
		const base = entities.find(x => x.id === hitInfo.id); if (!base) return
		if (!selSet.has(hitInfo.id)) onselect?.([hitInfo.id])
		drag = { id: hitInfo.id, base, kind: hitInfo.kind, gi: hitInfo.gi, start: p }
		dragged = false
		try { (e.currentTarget as Element).setPointerCapture(e.pointerId) } catch { /* synthetic events */ }
		e.preventDefault()
		window.addEventListener('pointermove', onDragMove)
		window.addEventListener('pointerup', onDragUp)
	}
	let lastDragRaw: Pt | null = null   // last UNconstrained pointer during a move/grip drag
	function applyDrag(p: Pt, shift: boolean): Ent {
		if (drag!.kind === 'grip') return gripsFor(drag!.base)[drag!.gi].apply(constrainGrip(drag!.base, drag!.gi, p, shift))
		let dx = p[0] - drag!.start[0], dy = p[1] - drag!.start[1]
		if (shift) { if (Math.abs(dx) >= Math.abs(dy)) dy = 0; else dx = 0 }   // ortho / axis-lock
		return translate(drag!.base, dx, dy)
	}
	function onDragMove(e: PointerEvent) {
		if (!drag) return
		const p = toLocalXY(e.clientX, e.clientY); if (!p) return
		dragged = true; lastDragRaw = p
		onupdate?.(applyDrag(p, e.shiftKey))
	}
	function onDragUp() {
		if (dragged) suppressClick = true
		drag = null
		window.removeEventListener('pointermove', onDragMove)
		window.removeEventListener('pointerup', onDragUp)
	}

	// ── press-drag draw (EOS mode): press = first point, drag (Shift-constrained) = preview,
	// release = second point. ──
	function onDrawMove(e: PointerEvent) {
		if (!draft.length) return
		const p = toLocalXY(e.clientX, e.clientY); if (!p) return
		lastRaw = p
		cur = constrainPt(draft[0], p, e.shiftKey)
	}
	function onDrawUp(e: PointerEvent) {
		window.removeEventListener('pointermove', onDrawMove)
		window.removeEventListener('pointerup', onDrawUp)
		const a = draft[0]; draft = []; cur = null
		if (!a) return
		const p = toLocalXY(e.clientX, e.clientY); if (!p) return
		const b = constrainPt(a, p, e.shiftKey)
		if (dist(a, b) < 2) return   // no drag → not a shape (ignore)
		place(a, b)
		suppressClick = true   // swallow the click that follows the release
	}

	// ── selection marquee (Kestrel/AutoCAD): drag L→R = window (enclose fully),
	// R→L = crossing (touch). bbox tests are enough for the mock. ──
	let marquee = $state<{ a: Pt; b: Pt } | null>(null)
	function bbox(e: Ent): [number, number, number, number] {
		if (e.type === 'circle') return [e.c![0] - e.r!, e.c![1] - e.r!, e.c![0] + e.r!, e.c![1] + e.r!]
		if (e.type === 'text') return [e.a![0], e.a![1] - 10, e.a![0] + 40, e.a![1]]
		const xs = [e.a![0], e.b![0]], ys = [e.a![1], e.b![1]]
		return [Math.min(...xs), Math.min(...ys), Math.max(...xs), Math.max(...ys)]
	}
	function onMarqueeMove(e: PointerEvent) {
		if (!marquee) return
		const p = toLocalXY(e.clientX, e.clientY); if (!p) return
		marquee = { a: marquee.a, b: p }
	}
	function onMarqueeUp() {
		window.removeEventListener('pointermove', onMarqueeMove)
		window.removeEventListener('pointerup', onMarqueeUp)
		const m = marquee; marquee = null
		if (!m) return
		const x0 = Math.min(m.a[0], m.b[0]), y0 = Math.min(m.a[1], m.b[1])
		const x1 = Math.max(m.a[0], m.b[0]), y1 = Math.max(m.a[1], m.b[1])
		if (x1 - x0 < 2 && y1 - y0 < 2) return   // tiny → treat as a click (let onClick clear)
		const crossing = m.b[0] < m.a[0]   // dragged right→left
		const ids = entities.filter(en => {
			const [bx0, by0, bx1, by1] = bbox(en)
			return crossing
				? bx0 <= x1 && bx1 >= x0 && by0 <= y1 && by1 >= y0        // intersects
				: bx0 >= x0 && bx1 <= x1 && by0 >= y0 && by1 <= y1        // fully enclosed
		}).map(en => en.id)
		onselect?.(ids)
		suppressClick = true   // don't let the ensuing click clear this selection
	}
	// ── box (mock 3D cuboid) projection ──
	// Footprint a..b in drawing coords + height h. Model view = oblique (cabinet) projection:
	// the top face is the footprint shifted up-right by h·ISO. Elevation = the front face
	// (footprint width × h). Plan = the footprint rectangle.
	const ISO = 0.6
	function boxFaces(e: Ent) {
		const x0 = Math.min(e.a![0], e.b![0]), y0 = Math.min(e.a![1], e.b![1])
		const x1 = Math.max(e.a![0], e.b![0]), y1 = Math.max(e.a![1], e.b![1])
		const h = e.h ?? DEFAULT_BOX_H, ox = h * ISO, oy = -h * ISO
		const P = (x: number, y: number) => `${x},${y}`
		return {
			x0, y0, x1, y1, h,
			top: `${P(x0 + ox, y0 + oy)} ${P(x1 + ox, y0 + oy)} ${P(x1 + ox, y1 + oy)} ${P(x0 + ox, y1 + oy)}`,
			right: `${P(x1, y0)} ${P(x1, y1)} ${P(x1 + ox, y1 + oy)} ${P(x1 + ox, y0 + oy)}`,
			back: `${P(x0, y0)} ${P(x1, y0)} ${P(x1 + ox, y0 + oy)} ${P(x0 + ox, y0 + oy)}`,
		}
	}

	// Kestrel-style prompt
	let prompt = $derived.by(() => {
		if (!active) return ''
		const n = draft.length
		switch (tool) {
			case 'Select': return 'Click an element'
			case 'Line': return n ? 'Specify end point' : 'Specify first point'
			case 'Rectangle': return n ? 'Specify opposite corner' : 'Specify first corner'
			case 'Ellipse': return n ? 'Specify opposite corner (Shift = circle)' : 'Specify first corner'
			case 'Box': return n ? 'Specify opposite corner (Shift = square footprint)' : 'Specify first corner'
			case 'Dimension': return n ? 'Specify second point' : 'Specify first point'
			case 'Text': return 'Click to place text'
			default: return tool + ' tool'
		}
	})
</script>

<svelte:window onkeydown={onKey} onkeyup={(e) => { if (active && e.key === 'Shift') reconstrain(false) }} />

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="vp" class:active bind:clientWidth={vpW} bind:clientHeight={vpH} role="button" tabindex="0" style:cursor={cursorStyle} style:border-style={active ? 'solid' : border}
	use:panzoom={{ enabled: () => active && navContent, wheelZoom: () => acad, onpan: onPan, onzoom: onZoom }}
	onclick={onClick} ondblclick={onDblclick} onpointerdown={onDown} onpointermove={onMove}
	onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); onactivate?.() } }}>

	<svg bind:this={svg} class="vp-svg {kind === 'model' || kind === 'elevation' ? 'model' : ''}" viewBox="{minX} {minY} {vbW} {vbH}" preserveAspectRatio="xMidYMid meet">
		<g transform="translate({view.x} {view.y}) scale({view.zoom})">
			<!-- background content -->
			{#if kind === 'model'}
				{#if grid}{#each floorGrid as g (g)}<polyline points={g} fill="none" stroke="#d5deea" stroke-width="0.7" />{/each}{/if}
				{#each racks as b (b.top)}
					<polygon points={b.left} fill="#8aa0bf" stroke="#5c7396" stroke-width="0.6" />
					<polygon points={b.right} fill="#6f88ab" stroke="#4a5f7d" stroke-width="0.6" />
					<polygon points={b.top} fill="#a9bcd6" stroke="#7f95b4" stroke-width="0.6" />
				{/each}
			{:else if kind === 'elevation'}
				<!-- flat elevation backdrop: a ground line + faint vertical station grid -->
				{#if grid}{#each Array(19) as _, i (i)}<line x1={8 + i * 20} y1="30" x2={8 + i * 20} y2="200" stroke="#e2e8f0" stroke-width="0.6" />{/each}{/if}
				<line x1="8" y1="200" x2="392" y2="200" stroke="#94a3b8" stroke-width="1.2" />
				<text x="12" y="214" font-size="8" fill="#64748b" font-weight="600">ELEVATION</text>
			{:else}
				<rect x="8" y="8" width="384" height="234" fill="#ffffff" stroke="#94a3b8" stroke-width="1.4" />
				{#if grid}
					{#each Array(19) as _, i (i)}<line x1={8 + i * 20} y1="8" x2={8 + i * 20} y2="242" stroke="#eef2f6" stroke-width="0.6" />{/each}
					{#each Array(12) as _, i (i)}<line x1="8" y1={8 + i * 20} x2="392" y2={8 + i * 20} stroke="#eef2f6" stroke-width="0.6" />{/each}
				{/if}
				<line x1="200" y1="8" x2="200" y2="150" stroke="#cbd5e1" stroke-width="1" />
				<line x1="8" y1="150" x2="392" y2="150" stroke="#cbd5e1" stroke-width="1" />
				{#each desks as d, i (i)}<rect x={d.x} y={d.y} width={DW} height={DH} rx="2" fill="#f1f5f9" stroke="#cbd5e1" stroke-width="0.7" />{/each}
				{#each outlets as o, i (i)}
					<circle cx={o.x} cy={o.y} r="5.5" fill={outletColor[o.k]} opacity="0.9" />
					<text x={o.x} y={o.y + 2.2} font-size="5.5" text-anchor="middle" fill="#fff" font-weight="700">{o.k === 'p' ? '4' : '6'}</text>
				{/each}
				<text x="24" y="230" font-size="9" fill="#64748b" font-weight="600">OFFICE — 33F</text>
			{/if}
			<!-- drawn entities + rubber-band preview (hide the text being edited in place) -->
			{#each entities as e (e.id)}{#if e.id !== editText?.id}{@render drawn(e, selSet.has(e.id))}{/if}{/each}
			{#if active && draft.length && cur}{@render preview(draft[0], cur)}{/if}
			<!-- editing handles: square grips at each selected entity's defining points -->
			{#if active && tool === 'Select'}
				{#each entities as e (e.id)}
					{#if selSet.has(e.id)}
						{#each gripsFor(e) as g}
							<Handle cx={g.x} cy={g.y} size={gripSize} cursor="crosshair" />
						{/each}
					{/if}
				{/each}
			{/if}
			<!-- Kestrel selection box: solid blue = window (enclose), dashed green = crossing -->
			{#if active && marquee}
				<rect class="marquee {marquee.b[0] < marquee.a[0] ? 'crossing' : 'window'}"
					x={Math.min(marquee.a[0], marquee.b[0])} y={Math.min(marquee.a[1], marquee.b[1])}
					width={Math.abs(marquee.b[0] - marquee.a[0])} height={Math.abs(marquee.b[1] - marquee.a[1])} />
			{/if}
		</g>
	</svg>

	<div class="vp-tag"><Icon name={tagIcon[kind]} size={10} /> {label}{#if scale}<span class="vp-scale">{scale}</span>{/if}</div>
	{#if active}
		<div class="vp-badge"><span class="vp-dot"></span>{tool} · {prompt} · {Math.round(view.zoom * 100)}%</div>
	{/if}
	<!-- Kestrel-style WCS orientation cube: an oblique reference cube with an X/Y/Z triad; the
	     face matching the current view (plan → top, elevation → front) is highlighted. -->
	<div class="vp-wcs" title="World coordinate system — {kind === 'floorplan' ? 'plan (top)' : kind === 'elevation' ? 'front elevation' : '3D model'} view">
		<svg viewBox="0 0 48 44" width="48" height="44">
			<polygon points="30,32 30,14 39,7 39,25" fill="#b2c3dc" stroke="#5c7396" stroke-width="0.8" />
			<polygon points="12,32 30,32 30,14 12,14" fill={kind === 'elevation' ? '#5ac6d2' : '#c8d5e8'} stroke="#5c7396" stroke-width="0.8" />
			<polygon points="12,14 30,14 39,7 21,7" fill={kind === 'floorplan' ? '#5ac6d2' : '#dce7f5'} stroke="#5c7396" stroke-width="0.8" />
			<!-- axis triad from the front-bottom-left corner -->
			<line x1="12" y1="32" x2="31" y2="32" stroke="#d9534f" stroke-width="1.2" />
			<line x1="12" y1="32" x2="12" y2="13" stroke="#5b8def" stroke-width="1.2" />
			<line x1="12" y1="32" x2="21" y2="25" stroke="#5cb85c" stroke-width="1.2" />
			<text x="33" y="35" font-size="6" fill="#d9534f" font-weight="700">x</text>
			<text x="7" y="12" font-size="6" fill="#5b8def" font-weight="700">z</text>
			<text x="22" y="26" font-size="6" fill="#4a9d4a" font-weight="700">y</text>
		</svg>
	</div>
	{#if editText}
		<textarea class="text-edit" bind:this={textInput} bind:value={editText.value} rows="1" spellcheck="false"
			style="left:{editText.x}px; top:{editText.y - editText.fontPx}px; font-size:{editText.fontPx}px; line-height:{editText.fontPx * 1.18}px"
			onpointerdown={(e) => e.stopPropagation()} onclick={(e) => e.stopPropagation()} ondblclick={(e) => e.stopPropagation()}
			onblur={commitText}
			onkeydown={(e) => { if (e.key === 'Escape') { e.preventDefault(); editText = null } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) { e.preventDefault(); commitText() } }}></textarea>
	{/if}
</div>

{#snippet drawn(e: Ent, seld: boolean)}
	{@const ink = seld ? SEL : INK}
	{@const w = lwt ? (seld ? 2 : 1.2) : 0.5}
	{#if e.type === 'line'}
		<line x1={e.a![0]} y1={e.a![1]} x2={e.b![0]} y2={e.b![1]} stroke={ink} stroke-width={w} />
	{:else if e.type === 'rect'}
		<rect x={Math.min(e.a![0], e.b![0])} y={Math.min(e.a![1], e.b![1])} width={Math.abs(e.b![0] - e.a![0])} height={Math.abs(e.b![1] - e.a![1])} fill="none" stroke={ink} stroke-width={w} />
	{:else if e.type === 'circle'}
		<circle cx={e.c![0]} cy={e.c![1]} r={e.r} fill="none" stroke={ink} stroke-width={w} />
	{:else if e.type === 'ellipse'}
		<ellipse cx={(e.a![0] + e.b![0]) / 2} cy={(e.a![1] + e.b![1]) / 2} rx={Math.abs(e.b![0] - e.a![0]) / 2} ry={Math.abs(e.b![1] - e.a![1]) / 2} fill="none" stroke={ink} stroke-width={w} />
	{:else if e.type === 'dim'}
		<line x1={e.a![0]} y1={e.a![1]} x2={e.b![0]} y2={e.b![1]} stroke={seld ? SEL : '#0e766e'} stroke-width={w} />
		<text x={(e.a![0] + e.b![0]) / 2} y={(e.a![1] + e.b![1]) / 2 - 3} font-size="9" fill={seld ? SEL : '#0e766e'} text-anchor="middle">{Math.round(dist(e.a!, e.b!))}</text>
	{:else if e.type === 'text'}
		<text x={e.a![0]} y={e.a![1]} font-size="11" fill={ink} font-weight="600">
			{#each (e.text ?? '').split('\n') as line, i (i)}<tspan x={e.a![0]} dy={i === 0 ? 0 : 13}>{line}</tspan>{/each}
		</text>
	{:else if e.type === 'box'}
		{@const f = boxFaces(e)}
		{#if kind === 'model'}
			<!-- oblique cuboid: base footprint, two side faces, then the raised top -->
			<rect x={f.x0} y={f.y0} width={f.x1 - f.x0} height={f.y1 - f.y0} fill="none" stroke={ink} stroke-width={w} stroke-dasharray="2 2" opacity="0.5" />
			<polygon points={f.right} fill="#c2d1e8" stroke={ink} stroke-width={w} />
			<polygon points={f.back} fill="#b2c3dc" stroke={ink} stroke-width={w} />
			<polygon points={f.top} fill="#dce7f5" stroke={ink} stroke-width={w} />
		{:else if kind === 'elevation'}
			<!-- front elevation face: footprint width × height, standing on the ground line (y=200) -->
			<rect x={f.x0} y={200 - f.h} width={f.x1 - f.x0} height={f.h} fill="#dce7f5" stroke={ink} stroke-width={w} />
		{:else}
			<!-- plan: footprint rectangle -->
			<rect x={f.x0} y={f.y0} width={f.x1 - f.x0} height={f.y1 - f.y0} fill="#dce7f533" stroke={ink} stroke-width={w} />
		{/if}
	{/if}
{/snippet}

{#snippet preview(a: Pt, p: Pt)}
	{#if tool === 'Line' || tool === 'Dimension'}
		<line x1={a[0]} y1={a[1]} x2={p[0]} y2={p[1]} stroke={SEL} stroke-width="1" stroke-dasharray="4 3" />
	{:else if tool === 'Rectangle'}
		<rect x={Math.min(a[0], p[0])} y={Math.min(a[1], p[1])} width={Math.abs(p[0] - a[0])} height={Math.abs(p[1] - a[1])} fill="none" stroke={SEL} stroke-width="1" stroke-dasharray="4 3" />
	{:else if tool === 'Ellipse'}
		<ellipse cx={(a[0] + p[0]) / 2} cy={(a[1] + p[1]) / 2} rx={Math.abs(p[0] - a[0]) / 2} ry={Math.abs(p[1] - a[1]) / 2} fill="none" stroke={SEL} stroke-width="1" stroke-dasharray="4 3" />
	{:else if tool === 'Box'}
		<rect x={Math.min(a[0], p[0])} y={Math.min(a[1], p[1])} width={Math.abs(p[0] - a[0])} height={Math.abs(p[1] - a[1])} fill="none" stroke={SEL} stroke-width="1" stroke-dasharray="4 3" />
	{/if}
{/snippet}

<style>
	.vp { position:relative; width:100%; height:100%; border:1.5px dashed #94a3b8; background:#fff; cursor:pointer; overflow:hidden; touch-action:none; }
	.vp:hover { border-color:#5ac6d2; }
	.vp.active { border:1.5px solid #157a8b; box-shadow:0 0 0 2px #5ac6d233; cursor:default; }
	.vp-svg { display:block; width:100%; height:100%; }
	.vp-svg.model { background:#eef3f8; }
	/* Lineweights stay constant as the viewport zooms (like Kestrel / real CAD):
	   the view <g> scales the geometry, non-scaling-stroke keeps stroke thickness
	   fixed on screen. Fills and text still scale with the drawing. */
	.vp-svg :where(line, rect, circle, ellipse, polyline, polygon, path) { vector-effect: non-scaling-stroke; }
	/* Kestrel/AutoCAD selection box: window (L→R) solid blue, crossing (R→L) dashed green. */
	.marquee { pointer-events:none; }
	.marquee.window { fill:#3b82f61f; stroke:#3b82f6; stroke-width:1; }
	.marquee.crossing { fill:#10b9811f; stroke:#10b981; stroke-width:1; stroke-dasharray:5 3; }
	.vp-tag {
		position:absolute; top:6px; left:6px; display:flex; align-items:center; gap:5px;
		font-size:9px; color:#475569; background:#ffffffcc; border:1px solid #e2e8f0; border-radius:3px; padding:2px 6px;
	}
	.vp-tag :global(svg) { color:#94a3b8; }
	.vp-scale { color:#94a3b8; font-family:Consolas,monospace; }
	.vp-badge {
		position:absolute; bottom:6px; left:6px; display:flex; align-items:center; gap:5px; font-size:8px; letter-spacing:.04em;
		color:#0e5866; background:#5ac6d222; border:1px solid #5ac6d2; border-radius:3px; padding:2px 6px;
	}
	.vp-dot { width:5px; height:5px; border-radius:50%; background:#157a8b; }
	.vp-wcs { position:absolute; top:5px; right:5px; padding:1px; background:#ffffffcc; border:1px solid #e2e8f0; border-radius:4px; pointer-events:none; }
	.vp-wcs :where(polygon, line) { vector-effect:non-scaling-stroke; }
	.text-edit { position:absolute; z-index:10; min-width:48px; min-height:1.2em; background:#fff; color:#111827; font-weight:600;
		border:1px solid #0e7490; border-radius:2px; padding:0 2px; font-family:inherit; resize:both; overflow:hidden; white-space:pre; }
	.text-edit:focus { outline:none; box-shadow:0 0 0 2px #0e749033; }
</style>
