<!-- One view surface: a plan or an elevation of the open level (switch with the buttons at the top left). It generates
     the view's display list, draws it, and routes input — left button → the active tool (points in VIEW mm; the view
     space turns them into model points), right / middle drag → pan, a right CLICK → the same as Esc, wheel → zoom.
     With a second pane open, each shows the other's work plane (ADR 0006): the plan shows the elevation's work depth
     as a dashed line, an elevation shows the work height. -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import { toolWorksIn, type Workspace } from '../app/workspace.svelte'
	import type { ToolCtx, PointerIn } from '../editor/tools'
	import type { Bounds, Prim } from '../views/display'
	import type { Pt } from '../domain/types'
	import { TOL_PX } from '../editor/tools'
	import { planDisplayList } from '../views/plan'
	import { elevationDisplayList } from '../views/elevation'
	import { untrack } from 'svelte'
	import { traceCircuit } from '../domain/cords'
	import { rackRowDisplayList, rowHit, type RowSpec } from '../views/rackRow'
	import { sheetDisplayList } from '../views/sheet'
	import { applyLayers, layerMap } from '../views/layers'
	import { toolBlock } from '../domain/layers'
	import { riserDisplayList } from '../views/riser'
	import { sectionDisplayList, sectionSpace, sectionsOn } from '../views/section'
	import type { SectionCut } from '../domain/drawing'
	import type { Sheet } from '../domain/drawing'
	import { pickAt } from '../editor/pick'
	import { primBounds, unionBounds } from '../views/display'
	import { spaceOf, specKey, specLabel, PLAN, type ViewSpec, type WorkPlane } from '../views/space'
	import { snapAt, snapToPrims } from '../editor/snap'
	import { parseTyped } from '../editor/input'
	import { toModel, zoomAt, panBy, fit, MIN_K, type Camera } from '../editor/camera'
	import Prims from './Prims.svelte'
	import { fillTone, FILL_LIMIT_PCT } from '../domain/fill'

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
	const VIEWS: ViewSpec[] = [PLAN, { kind: 'elevation', dir: 'front' }, { kind: 'elevation', dir: 'rear' }, { kind: 'elevation', dir: 'left' }, { kind: 'elevation', dir: 'right' }, { kind: 'riser' }]

	let svg: SVGSVGElement | undefined = $state()
	let w = $state(800), h = $state(600)
	let cam = $state<Camera>({ x: 0, y: 0, k: 0.05 })
	let marquee = $state<Bounds | null>(null)
	/** Bumped after every tool event, so the preview (which reads the tool's own fields) is recomputed. */
	let tick = $state(0)
	let fittedFor: string | null = null

	const section = $derived(spec.kind === 'section' ? (project.index.get(spec.sectionId) as SectionCut | undefined) : undefined)
	const space = $derived(section ? sectionSpace(section) : spaceOf(spec))
	const sections = $derived(sectionsOn(project.index, levelId))
	const sheet = $derived(spec.kind === 'sheet' ? (project.index.get(spec.sheetId) as Sheet | undefined) : undefined)
	const raw = $derived(spec.kind === 'plan'
		? planDisplayList(project.index, levelId, { scale: PLOT_SCALE, underlay: project.pdf.placement, blocks: project.blockOf })
		: spec.kind === 'row'
			? rackRowDisplayList(project.index, spec)
			: spec.kind === 'sheet'
				? (sheet ? sheetDisplayList(project.index, sheet, { underlay: project.pdf.placement, blocks: project.blockOf, projectName: project.name, template: project.settings?.titleBlock, routes: project.routes }) : [])
				: spec.kind === 'riser'
					? riserDisplayList(project.index, { scale: PLOT_SCALE, routes: project.routes, hideEmpty: spec.hideEmpty })
					: spec.kind === 'section'
						? (section ? sectionDisplayList(project.index, section, { scale: PLOT_SCALE }) : [])
						: elevationDisplayList(project.index, levelId, space, { scale: PLOT_SCALE }))
	// the user's eye / lock (a sheet has its viewports' freeze instead, applied inside sheetDisplayList)
	const layered = $derived(spec.kind === 'sheet' ? { draw: raw, pick: raw } : applyLayers(raw, project.index, { hidden: ws.layers.hidden, locked: ws.layers.locked, sort: spec.kind === 'plan' }))
	const prims = $derived(layered.draw)
	// on a sheet only the selected VIEWPORT is highlighted (the sheet's paper and other windows share its id)
	const selected = $derived(spec.kind === 'sheet' ? new Set<string>() : new Set(ws.selection))
	const vpHighlight = $derived.by((): Prim[] => {
		if (spec.kind !== 'sheet' || !ws.viewportId || !ws.selection.includes(spec.sheetId)) return []
		const frame = prims.find((p) => p.k === 'line' && p.sub === ws.viewportId && p.cls.startsWith('viewport'))
		if (!frame || frame.k !== 'line') return []
		// corner grips (resize) on an unlocked viewport, a constant size on screen
		const locked = sheet?.viewports.find((v) => v.id === ws.viewportId)?.locked, g = 4 / cam.k
		const grips: Prim[] = locked ? [] : frame.pts.map((q) => ({ k: 'line', pts: [{ x: q.x - g, y: q.y - g }, { x: q.x + g, y: q.y - g }, { x: q.x + g, y: q.y + g }, { x: q.x - g, y: q.y + g }], closed: true, fill: true, cls: 'grip' }))
		return [{ ...frame, cls: 'viewport sel', src: undefined }, ...grips]
	})

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
	/** The circuit of a selected cord or single port (rack rows): its cords and ports drawn highlighted. */
	const traceHighlight = $derived.by((): Prim[] => {
		if (spec.kind !== 'row') return []
		const one = ws.selection.length === 1 ? project.index.get(ws.selection[0]) : undefined
		const start = one?.type === 'cord' ? { on: one.a.on, port: one.a.port } : ws.portSel?.ports.length === 1 ? { on: ws.portSel.on, port: ws.portSel.ports[0] } : null
		if (!start) return []
		const steps = traceCircuit(project.index, start)
		if (steps.length < 2) return []
		const cords = new Set(steps.flatMap((s) => (s.via?.kind === 'cord' ? [s.via.id] : [])))
		const ports = new Set(steps.map((s) => `${s.ref.on}:${s.ref.port}`))
		return prims.flatMap((p) => p.k !== 'line' ? [] :
			p.src && cords.has(p.src) ? [{ ...p, cls: 'trace-cord', src: undefined, color: undefined }] :   // no inline colour: the trace look wins
			p.src && p.sub && p.cls.startsWith('port') && ports.has(`${p.src}:${p.sub}`) ? [{ ...p, cls: 'trace-port', src: undefined }] : [])
	})
	/** Fill overlay (Phase 5.3, plan): each run segment with cables in it as a band in its fill tone, with its %. */
	const fillOverlay = $derived.by((): Prim[] => {
		if (spec.kind !== 'plan' || !ws.showFill) return []
		const out: Prim[] = []
		for (const f of project.fills.values()) {
			const s = project.index.get(f.shape)
			if (s?.type !== 'shape' || s.geom.kind !== 'path') continue
			const g = s.geom, sg = g.segs.find((x) => x.id === f.seg), a = g.nodes.find((n) => n.id === sg?.a), b = g.nodes.find((n) => n.id === sg?.b)
			if (!a || !b || (a.levelId ?? s.levelId) !== levelId || Math.hypot(b.x - a.x, b.y - a.y) < 0.5) continue
			const tone = fillTone(f.pct), w = (sg?.section ?? s.section)?.w ?? 100
			out.push({ k: 'line', pts: [a, b], w: Math.max(w, 150), cls: `fill-band fill-${tone}` })
			out.push({ k: 'text', at: { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 }, text: Number.isFinite(f.pct) ? `${Math.round(f.pct)}%` : 'no size', size: 2.2 * PLOT_SCALE, anchor: 'middle', cls: `fill-label fill-${tone}` })
		}
		return out
	})
	/** The cable routes (Phase 5) of the selected outlets / links / panel ports, drawn over the runs they use (plan). */
	const routeHighlight = $derived.by((): Prim[] => {
		if (spec.kind !== 'plan') return []
		const ix = project.index, links = new Set<string>()
		for (const id of ws.selection) {
			const e = ix.get(id)
			if (e?.type === 'outlet') for (const p of e.ports) { const l = ix.linkAt({ on: e.id, port: p.port }); if (l) links.add(l.id) }
			else if (e?.type === 'link') links.add(e.id)
		}
		if (ws.portSel) for (const n of ws.portSel.ports) { const l = ix.linkAt({ on: ws.portSel.on, port: n }); if (l) links.add(l.id) }
		const out: Prim[] = []
		for (const id of links) for (const r of project.routes.get(id)?.segs ?? []) {
			const s = ix.get(r.shape)
			if (s?.type !== 'shape' || s.geom.kind !== 'path') continue
			const g = s.geom, sg = g.segs.find((x) => x.id === r.seg), a = g.nodes.find((n) => n.id === sg?.a), b = g.nodes.find((n) => n.id === sg?.b)
			if (!a || !b || ![a.levelId ?? s.levelId, b.levelId ?? s.levelId].includes(levelId)) continue
			out.push(Math.hypot(b.x - a.x, b.y - a.y) < 0.5 ? { k: 'circle', c: a, r: 150, cls: 'trace-route' } : { k: 'line', pts: [a, b], cls: 'trace-route' })
		}
		return out
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

	/** Each view (level + plan / elevation / rack row) keeps its own pan and zoom: switching away and back restores it. */
	const cams = new Map<string, { cam: Camera; fitted: string | null }>()
	let hiddenUntilFit = $state(false)
	let viewKey = ''

	// Cameras survive a refresh (Dave): every view's pan / zoom is kept in localStorage per project. A restored view is
	// never auto-fitted again (Fit / Home still fits it). Storage that's blocked or full just means fitting as before.
	const camsKey = () => `cad-cams:${project.pid}`
	const RESTORED = 'restored'
	const readCams = (): Record<string, Camera> => { try { return JSON.parse(localStorage.getItem(camsKey()) ?? '{}') } catch { return {} } }
	// a camera stuck at the smallest zoom is a bad saved fit, not a choice: that view fits again
	for (const [k, c] of Object.entries(readCams())) if (c && Number.isFinite(c.k) && c.k > MIN_K * 1.5) cams.set(k, { cam: c, fitted: RESTORED })
	let saveTimer: ReturnType<typeof setTimeout> | undefined
	$effect(() => {
		const c = cam
		untrack(() => {
			if (!viewKey || hiddenUntilFit) return
			const vk = viewKey
			clearTimeout(saveTimer)
			saveTimer = setTimeout(() => {
				try { localStorage.setItem(camsKey(), JSON.stringify({ ...readCams(), [vk]: { x: c.x, y: c.y, k: c.k } })) } catch { /* storage blocked / full */ }
			}, 400)
		})
	})

	/** A plan whose floorplan is still rendering: its first fit waits for it (Dave: fitting to the outlets first and
	 *  again when the PDF arrived made the view jump). A floorplan that fails to load doesn't hold it up. */
	const floorplanPending = $derived(spec.kind === 'plan' && (!project.levelLoaded(levelId) ||
		[...project.index.byId.values()].some((u) => u.type === 'underlay' && u.levelId === levelId && !project.pdf.placement(u) && !project.pdf.problems[`${u.fileId}#${u.page ?? 1}`])))

	/** Fit a view the first time it has something to show — again when the floorplan image arrives, and when the
	 *  pane changes size a lot (split / unsplit). A view seen before gets its own camera back instead. */
	$effect(() => {
		const ps = prims, vk = `${levelId}:${specKey(spec)}`, key = `${vk}:${ps.some((p) => p.k === 'image')}:${Math.round(w / 200)}`
		// a view not fitted yet stays hidden until its floorplan is in, then fits once
		const seen = untrack(() => cams.has(vk) || (viewKey === vk && fittedFor !== null))
		if (floorplanPending && !seen) { hiddenUntilFit = true; return }
		hiddenUntilFit = false
		untrack(() => {
			if (vk !== viewKey) {
				if (viewKey) cams.set(viewKey, { cam, fitted: fittedFor })
				viewKey = vk
				const saved = cams.get(vk)
				// a view with no camera of its own starts unfitted — not with the last view's flag (a new sheet opened from a
				// plan whose camera was RESTORED kept that flag, never fitted, and showed the paper as a speck)
				if (saved) { cam = saved.cam; fittedFor = saved.fitted }
				else fittedFor = null
			}
			// no fit before the pane has BOTH sizes: a fit into a 0-high pane clamps to the smallest zoom (a new sheet
			// came up as a speck in the corner, and that camera was then saved and restored)
			if (fittedFor === key || fittedFor === RESTORED || !ps.length || !w || !h) return
			const b = unionBounds(ps.map(primBounds))
			if (b) { cam = fit(b, w, h); fittedFor = key }
		})
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
			layerId: ws.layers.current && project.index.get(ws.layers.current)?.type === 'layer' && !ws.layers.current.startsWith('sys:') ? ws.layers.current : null,
			prims: () => layered.pick, tol: () => tol,
			snap: (p, alt, skip) => spec.kind === 'plan'
				? snapAt(project.index, levelId, p, tol * 1.5, { skip, noGrid: alt })
				: snapToPrims(prims, p, tol * 1.5, { skip, noGrid: alt }),
			selection: ws.selection, select: ws.select, setMarquee: (b) => { marquee = b }, ask: ws.ask, askText: ws.askText, say: ws.say,
			...(spec.kind === 'sheet' ? { selectViewport: ws.selectViewport, viewportId: () => ws.viewportId } : {}),
			selectOpening: ws.selectOpening, openingId: () => ws.openingSel?.openingId ?? null,
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
	/** The last pointer position in view mm — where a typed distance points, and the readout in the corner. */
	let cursor = $state<Pt | null>(null)
	let toolDown = false

	function onDown(e: PointerEvent) {
		onfocus?.()
		svg!.setPointerCapture(e.pointerId)
		if (e.button === 1 || e.button === 2) { panning = { ...local(e), moved: false, button: e.button }; return }
		if (e.button !== 0) return
		// a tool that doesn't belong in this view does nothing here (split view: both panes share the tool)
		if (!toolWorksIn(ws.toolId, spec.kind)) { ws.say(`The ${ws.toolId} tool doesn't work in this view`); return }
		const count = pressCount(e)
		// Rack rows: double-click a rack to focus it (fit), double-click empty space to see the whole row again
		if (spec.kind === 'row' && count >= 2 && ws.toolId === 'select') { focusRack(input(e).p); return }
		const why = spec.kind === 'sheet' ? null : toolBlock(ws.toolId, ws.layers, ws.opts.z, layerMap(project.index))
		if (why) { ws.say(why); return }
		toolDown = true
		ws.tool.down(input(e, count), ctx()); tick++
	}
	function onMove(e: PointerEvent) {
		if (panning) {
			const s = local(e)
			if (panning.moved || Math.hypot(s.x - panning.x, s.y - panning.y) > 3) { cam = panBy(cam, s.x - panning.x, s.y - panning.y); panning = { ...panning, ...s, moved: true } }
			return
		}
		cursor = input(e).p
		if (!active) return
		if (toolDown) ws.tool.move(input(e), ctx())
		else ws.tool.hover?.(input(e), ctx())
		tick++
	}
	function onUp(e: PointerEvent) {
		if (panning) {
			const click = !panning.moved && panning.button === 2
			panning = null
			// a right CLICK (no drag) = Esc (Dave): the first ends what's being drawn (a run with 2+ points is kept, a
			// half-made one dropped, an armed bulk patch / interconnect let go) and stays in the tool; the next, with
			// nothing in progress, goes back to Select; in Select it clears the selection
			if (click) {
				const handled = ws.tool.key?.({ key: 'Escape' } as KeyboardEvent, ctx()) ?? false
				if (!handled) {
					if (ws.toolId === 'select') ws.select([])
					else { ws.tool.cancel(ctx()); ws.toolId = 'select' }
				}
				tick++
			}
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
		const r = parseTyped(text, tool.lastPoint?.(ctx()) ?? null, cursor, spec.kind === 'elevation')
		if (r.kind === 'error') return r.message
		tool.typed(r.p, ctx()); tick++
		return null
	}
	export const takesTyping = () => !!ws.tool.typed

	/** Page Up / Down: one screen up or down (sideways = left / right), with a little overlap. */
	export function page(dir: 1 | -1, sideways: boolean): void {
		cam = sideways ? panBy(cam, -dir * w * 0.9, 0) : panBy(cam, 0, -dir * h * 0.9)
	}
	export function cancel(): void { ws.tool.cancel(ctx()); toolDown = false; tick++ }
	export function refresh(): void { tick++ }
	export const isElevation = () => spec.kind === 'elevation'
</script>

<div class="surface" class:active bind:clientWidth={w} bind:clientHeight={h}>
	<svg bind:this={svg} width={w} height={h} role="application" aria-label={specLabel(spec)}
		style:cursor={panning?.moved ? 'grabbing' : ws.tool.cursor}
		onpointerdown={onDown} onpointermove={onMove} onpointerup={onUp} onpointercancel={onUp}
		oncontextmenu={(e) => e.preventDefault()}>
		<g transform="translate({cam.x} {cam.y}) scale({cam.k})" visibility={hiddenUntilFit ? 'hidden' : undefined}>
			<Prims {prims} {selected} k={cam.k} />
			<Prims prims={linked} selected={new Set()} />
			<Prims prims={traceHighlight} selected={new Set()} />
			<Prims prims={fillOverlay} selected={new Set()} />
			<Prims prims={routeHighlight} selected={new Set()} />
			<Prims prims={vpHighlight} selected={new Set()} />
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
		{#if sections.length || section}
			<span class="sep"></span>
			<select class="secs" class:on={!!section} value={section?.id ?? ''} title="Sections on this level (draw one with the Section tool on the plan)"
				onchange={(e) => { onfocus?.(); if (e.currentTarget.value) onspec({ kind: 'section', sectionId: e.currentTarget.value }) }}>
				<option value="">Section…</option>
				{#each sections as s (s.id)}<option value={s.id}>Section {s.name}</option>{/each}
			</select>
		{/if}
		{#if spec.kind === 'riser'}
			<span class="sep"></span>
			<button class:on={!!spec.hideEmpty} title="Squeeze the floors that have no server room into break marks" onclick={() => { onfocus?.(); onspec({ kind: 'riser', ...(spec.hideEmpty ? {} : { hideEmpty: true }) }) }}>Hide empty floors</button>
		{/if}
		{#if spec.kind === 'plan'}
			<span class="sep"></span>
			<button class:on={ws.showFill} title="Colour runs by how full they are from the cables routed through them (limit {FILL_LIMIT_PCT}%: amber from {FILL_LIMIT_PCT * 0.75}%, red over)" onclick={() => (ws.showFill = !ws.showFill)}>Fill</button>
		{/if}
		{#if spec.kind === 'row'}
			{@const row = spec}
			<span class="sep"></span>
			<span class="room">{project.index.nameOf(row.spaceId)}</span>
			{#each FACES as f (f)}
				<button class:on={row.face === f} onclick={() => { onfocus?.(); onspec({ ...row, face: f }) }}>Racks {f}</button>
			{/each}
		{/if}
		{#if sheet}
			<span class="sep"></span>
			<span class="room">{sheet.number} {sheet.title} · {sheet.paper.size} {sheet.paper.orientation}</span>
		{/if}
	</div>
	{#if hiddenUntilFit}<div class="loading">Loading floorplan…</div>{/if}
	<div class="scale">
		<!-- the cursor in the view's own terms: plan / sheet x, y (y down); elevations, sections and rack rows x, z (up) -->
		{#if cursor}{@const up = spec.kind === 'elevation' || spec.kind === 'section' || spec.kind === 'row'}X {Math.round(cursor.x)} · {up ? 'Z' : 'Y'} {Math.round(up ? -cursor.y : cursor.y)} · {/if}
		{spec.kind === 'sheet' ? 'paper mm' : `1:${PLOT_SCALE}`} · {Math.round(1 / cam.k)} mm/px{#if spec.kind === 'elevation'} · work depth {Math.round(work.depth)}{/if}
	</div>
</div>

<style>
	.surface { position: relative; width: 100%; height: 100%; overflow: hidden; background: white; }
	.surface.active { box-shadow: inset 0 0 0 1px #93c5fd; }
	.views { position: absolute; top: 4px; left: 6px; display: flex; gap: 2px; }
	.views button { font-size: 11px; padding: 0 6px; border-radius: 4px; background: rgba(255, 255, 255, 0.85); border: 1px solid #e4e4e7; color: #52525b; }
	.views button.on { background: #2563eb; border-color: #2563eb; color: white; }
	.views .secs { font-size: 11px; padding: 0 2px; border-radius: 4px; background: rgba(255, 255, 255, 0.85); border: 1px solid #e4e4e7; color: #52525b; }
	.views .secs.on { background: #2563eb; border-color: #2563eb; color: white; }
	.views .sep { width: 1px; background: #d4d4d8; margin: 0 4px; }
	.views .room { font-size: 11px; color: #52525b; padding: 0 2px; align-self: center; }
	.loading { position: absolute; top: 45%; left: 0; right: 0; text-align: center; font-size: 12px; color: #a1a1aa; pointer-events: none; }
	.scale { position: absolute; bottom: 4px; left: 8px; font-size: 10px; color: #a1a1aa; pointer-events: none; }
	.marquee { fill: rgba(59, 130, 246, 0.08); stroke: #3b82f6; stroke-dasharray: 4 3; }
</style>
