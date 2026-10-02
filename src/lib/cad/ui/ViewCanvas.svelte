<!-- One view surface: a plan or an elevation of the open level (switch with the buttons at the top left). It generates
     the view's display list, draws it, and routes input — left button → the active tool (points in VIEW mm; the view
     space turns them into model points), right / middle drag → pan, a right CLICK → the tool's finish, wheel → zoom.
     With a second pane open, each shows the other's work plane (ADR 0006): the plan shows the elevation's work depth
     as a dashed line, an elevation shows the work height. -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { ToolCtx, PointerIn } from '../editor/tools'
	import type { Bounds, Prim } from '../views/display'
	import type { Pt } from '../domain/types'
	import { TOL_PX } from '../editor/tools'
	import { planDisplayList } from '../views/plan'
	import { elevationDisplayList } from '../views/elevation'
	import { rackRowDisplayList, rowHit, type RowSpec } from '../views/rackRow'
	import { pickAt } from '../editor/pick'
	import { primBounds, unionBounds } from '../views/display'
	import { spaceOf, specKey, specLabel, PLAN, type ViewSpec, type WorkPlane } from '../views/space'
	import { snapAt, snapToPrims } from '../editor/snap'
	import { parseTyped } from '../editor/input'
	import { toModel, zoomAt, panBy, fit, type Camera } from '../editor/camera'
	import Prims from './Prims.svelte'

	let { project, ws, levelId, spec, other, active = true, onspec, onfocus }: {
		project: CadProject; ws: Workspace; levelId: string; spec: ViewSpec
		/** The other pane's view, when split — to show its work plane here. */
		other?: ViewSpec
		active?: boolean
		onspec: (s: ViewSpec) => void
		onfocus?: () => void
	} = $props()

	const PLOT_SCALE = 100
	const FACES = ['front', 'rear'] as const
	const VIEWS: ViewSpec[] = [PLAN, { kind: 'elevation', dir: 'front' }, { kind: 'elevation', dir: 'rear' }, { kind: 'elevation', dir: 'left' }, { kind: 'elevation', dir: 'right' }]

	let svg: SVGSVGElement | undefined = $state()
	let w = $state(800), h = $state(600)
	let cam = $state<Camera>({ x: 0, y: 0, k: 0.05 })
	let marquee = $state<Bounds | null>(null)
	/** Bumped after every tool event, so the preview (which reads the tool's own fields) is recomputed. */
	let tick = $state(0)
	let fittedFor: string | null = null

	const space = $derived(spaceOf(spec))
	const prims = $derived(spec.kind === 'plan'
		? planDisplayList(project.index, levelId, { scale: PLOT_SCALE, underlay: project.pdf.placement, blocks: project.blockOf })
		: spec.kind === 'row'
			? rackRowDisplayList(project.index, spec)
			: elevationDisplayList(project.index, levelId, space, { scale: PLOT_SCALE }))
	const selected = $derived(new Set(ws.selection))

	/** The middle of the level's content in plan — the default work depth of an elevation (ADR 0006). */
	const centre = $derived.by((): Pt => {
		const b = unionBounds(planDisplayList(project.index, levelId, { scale: PLOT_SCALE }).map(primBounds))
		return b ? { x: (b.x0 + b.x1) / 2, y: (b.y0 + b.y1) / 2 } : { x: 0, y: 0 }
	})
	const work = $derived.by((): WorkPlane => ({ z: ws.opts.z, depth: ws.depth ?? depthAt(spec.kind === 'plan' ? other : spec) }))
	function depthAt(s?: ViewSpec): number { return s && s.kind === 'elevation' ? spaceOf(s).depthOf({ ...centre, z: 0 }) : 0 }

	/** The OTHER pane's work plane, drawn here: a depth line in plan, a height line in an elevation. */
	/** The selected ports (rack rows), drawn over their cells. */
	const portHighlight = $derived.by((): Prim[] => {
		const s = ws.portSel
		if (spec.kind !== 'row' || !s) return []
		const want = new Set(s.ports.map(String))
		return prims.flatMap((p) => (p.k === 'line' && p.src === s.on && p.sub && want.has(p.sub) && p.cls.startsWith('port') ? [{ ...p, cls: 'port-sel', src: undefined }] : []))
	})
	const linked = $derived.by((): Prim[] => {
		if (!other || !prims.length) return []
		const b = unionBounds(prims.map(primBounds))!
		if (spec.kind === 'plan' && other.kind === 'elevation') {
			const f = spaceOf(other).frame!, d = ws.depth ?? depthAt(other), L = Math.hypot(b.x1 - b.x0, b.y1 - b.y0)
			const c = { x: f.o.x + f.n.x * d, y: f.o.y + f.n.y * d }
			return [{ k: 'line', pts: [{ x: c.x - f.t.x * L, y: c.y - f.t.y * L }, { x: c.x + f.t.x * L, y: c.y + f.t.y * L }], cls: 'workplane' }]
		}
		if (spec.kind === 'elevation' && other.kind === 'plan') return [{ k: 'line', pts: [{ x: b.x0, y: -ws.opts.z }, { x: b.x1, y: -ws.opts.z }], cls: 'workplane' }]
		return []
	})
	const preview = $derived.by((): Prim[] => { void tick; void ws.selection; void project.rev; void cam.k; return active ? (ws.tool.preview?.(ctx()) ?? []) : [] })

	/** Fit the view the first time it has something to show — again when the floorplan image arrives, and when the
	 *  pane changes size a lot (split / unsplit). */
	$effect(() => {
		const ps = prims, key = `${levelId}:${specKey(spec)}:${ps.some((p) => p.k === 'image')}:${Math.round(w / 200)}`
		if (fittedFor === key || !ps.length || !w) return
		const b = unionBounds(ps.map(primBounds))
		if (b) { cam = fit(b, w, h); fittedFor = key }
	})

	function focusRack(p: Pt): void {
		const racks = prims.filter((x) => x.k === 'line' && x.cls === 'rack')
		const id = pickAt(racks, p, TOL_PX / cam.k)
		const b = id ? unionBounds(prims.filter((x) => x.src === id).map(primBounds)) : null
		if (b) cam = fit(b, w, h)
		else zoomExtents()
	}

	export function zoomExtents(): void {
		const b = unionBounds(prims.map(primBounds))
		if (b) cam = fit(b, w, h)
	}

	function ctx(): ToolCtx {
		const tol = TOL_PX / cam.k
		return {
			store: project.store, index: project.index, levelId, settings: project.settings, opts: ws.opts, space, work,
			prims: () => prims, tol: () => tol,
			snap: (p, alt, skip) => spec.kind === 'plan'
				? snapAt(project.index, levelId, p, tol * 1.5, { skip, noGrid: alt })
				: snapToPrims(prims, p, tol * 1.5, { skip, noGrid: alt }),
			selection: ws.selection, select: ws.select, setMarquee: (b) => { marquee = b }, ask: ws.ask, say: ws.say,
			...(spec.kind === 'row' ? { rowHit: (p: Pt) => rowHit(project.index, spec as RowSpec, p), portSel: () => ws.portSel, selectPorts: ws.selectPorts } : {}),
		}
	}

	function local(e: PointerEvent | WheelEvent | MouseEvent) {
		const r = svg!.getBoundingClientRect()
		return { x: e.clientX - r.left, y: e.clientY - r.top }
	}
	const input = (e: PointerEvent | MouseEvent, count = 1): PointerIn => ({ p: toModel(cam, local(e)), shift: e.shiftKey, ctrl: e.ctrlKey || e.metaKey, alt: e.altKey, count })

	/** Click counting: a pointerdown's `detail` is always 0 (Pointer Events spec), so double-clicks are found here —
	 *  a second press within 400 ms and 5 px of the first. */
	let lastPress: { t: number; x: number; y: number; n: number } | null = null
	function pressCount(e: PointerEvent): number {
		const s = local(e), now = performance.now()
		const n = lastPress && now - lastPress.t < 400 && Math.hypot(s.x - lastPress.x, s.y - lastPress.y) < 5 ? lastPress.n + 1 : 1
		lastPress = { t: now, ...s, n }
		return n
	}

	let panning = $state<{ x: number; y: number; moved: boolean; button: number } | null>(null)
	/** The last pointer position in view mm — where a typed distance points. */
	let cursor: Pt | null = null
	let toolDown = false

	function onDown(e: PointerEvent) {
		onfocus?.()
		svg!.setPointerCapture(e.pointerId)
		if (e.button === 1 || e.button === 2) { panning = { ...local(e), moved: false, button: e.button }; return }
		if (e.button !== 0) return
		const count = pressCount(e)
		// Rack rows: double-click a rack to focus it (fit), double-click empty space to see the whole row again
		if (spec.kind === 'row' && count >= 2 && ws.toolId === 'select') { focusRack(input(e).p); return }
		toolDown = true
		ws.tool.down(input(e, count), ctx()); tick++
	}
	function onMove(e: PointerEvent) {
		if (panning) {
			const s = local(e)
			if (panning.moved || Math.hypot(s.x - panning.x, s.y - panning.y) > 3) { cam = panBy(cam, s.x - panning.x, s.y - panning.y); panning = { ...panning, ...s, moved: true } }
			return
		}
		if (!active) return
		cursor = input(e).p
		if (toolDown) ws.tool.move(input(e), ctx())
		else ws.tool.hover?.(input(e), ctx())
		tick++
	}
	function onUp(e: PointerEvent) {
		if (panning) {
			const click = !panning.moved && panning.button === 2
			panning = null
			if (click) { ws.tool.finish?.(ctx()); tick++ }   // a right CLICK (no drag) finishes what's being drawn
			return
		}
		if (toolDown) { toolDown = false; ws.tool.up(input(e), ctx()); tick++ }
	}

	/** The wheel needs a non-passive listener to stop the page scrolling. */
	$effect(() => {
		const el = svg
		if (!el) return
		const onWheel = (e: WheelEvent) => { e.preventDefault(); cam = zoomAt(cam, local(e), Math.exp(-e.deltaY * 0.0015)) }
		el.addEventListener('wheel', onWheel, { passive: false })
		return () => el.removeEventListener('wheel', onWheel)
	})

	/** Keys for the active tool (Enter, Backspace, R …); true = handled. */
	export function key(e: KeyboardEvent): boolean {
		const done = ws.tool.key?.(e, ctx()) ?? false
		if (done) tick++
		return done
	}
	/** A typed point for the active tool (x,y · @dx,dy · @d<a · distance towards the cursor). Returns an error to show. */
	export function typed(text: string): string | null {
		const tool = ws.tool
		if (!tool.typed) return 'This tool takes no typed points'
		const r = parseTyped(text, tool.lastPoint?.(ctx()) ?? null, cursor)
		if (r.kind === 'error') return r.message
		tool.typed(r.p, ctx()); tick++
		return null
	}
	export const takesTyping = () => !!ws.tool.typed

	export function cancel(): void { ws.tool.cancel(ctx()); toolDown = false; tick++ }
	export function refresh(): void { tick++ }
	export const isElevation = () => spec.kind === 'elevation'
</script>

<div class="surface" class:active bind:clientWidth={w} bind:clientHeight={h}>
	<svg bind:this={svg} width={w} height={h} role="application" aria-label={specLabel(spec)}
		style:cursor={panning?.moved ? 'grabbing' : ws.tool.cursor}
		onpointerdown={onDown} onpointermove={onMove} onpointerup={onUp} onpointercancel={onUp}
		oncontextmenu={(e) => e.preventDefault()}>
		<g transform="translate({cam.x} {cam.y}) scale({cam.k})">
			<Prims {prims} {selected} k={cam.k} />
			<Prims prims={linked} selected={new Set()} />
			<Prims prims={portHighlight} selected={new Set()} />
			<Prims prims={preview} selected={new Set()} />
			{#if marquee}
				<rect x={marquee.x0} y={marquee.y0} width={marquee.x1 - marquee.x0} height={marquee.y1 - marquee.y0}
					class="marquee" vector-effect="non-scaling-stroke" />
			{/if}
		</g>
	</svg>
	<div class="views">
		{#each VIEWS as v (specKey(v))}
			<button class:on={specKey(v) === specKey(spec)} onclick={() => { onfocus?.(); onspec(v) }}>{specLabel(v)}</button>
		{/each}
		{#if spec.kind === 'row'}
			{@const row = spec}
			<span class="sep"></span>
			<span class="room">{project.index.nameOf(row.spaceId)}</span>
			{#each FACES as f (f)}
				<button class:on={row.face === f} onclick={() => { onfocus?.(); onspec({ ...row, face: f }) }}>Racks {f}</button>
			{/each}
		{/if}
	</div>
	<div class="scale">1:{PLOT_SCALE} · {Math.round(1 / cam.k)} mm/px{#if spec.kind === 'elevation'} · work depth {Math.round(work.depth)}{/if}</div>
</div>

<style>
	.surface { position: relative; width: 100%; height: 100%; overflow: hidden; background: white; }
	.surface.active { box-shadow: inset 0 0 0 1px #93c5fd; }
	.views { position: absolute; top: 4px; left: 6px; display: flex; gap: 2px; }
	.views button { font-size: 11px; padding: 0 6px; border-radius: 4px; background: rgba(255, 255, 255, 0.85); border: 1px solid #e4e4e7; color: #52525b; }
	.views button.on { background: #2563eb; border-color: #2563eb; color: white; }
	.views .sep { width: 1px; background: #d4d4d8; margin: 0 4px; }
	.views .room { font-size: 11px; color: #52525b; padding: 0 2px; align-self: center; }
	.scale { position: absolute; bottom: 4px; left: 8px; font-size: 10px; color: #a1a1aa; pointer-events: none; }
	.marquee { fill: rgba(59, 130, 246, 0.08); stroke: #3b82f6; stroke-dasharray: 4 3; }
</style>
