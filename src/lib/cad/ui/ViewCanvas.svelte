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
	import { sheetDisplayList, nextScale, viewViewport, blankSheet } from '../views/sheet'
	import { newId } from '../domain/ids'
	import { applyLayers, layerMap } from '../views/layers'
	import { Nudge } from '../editor/nudge'
	import { toolBlock } from '../domain/layers'
	import { riserDisplayList } from '../views/riser'
	import { sectionDisplayList, sectionSpace, sectionsOn } from '../views/section'
	import type { SectionCut } from '../domain/drawing'
	import type { Sheet, Entity } from '../domain/drawing'
	import { similarTo } from '../domain/similar'
	import { pickAt } from '../editor/pick'
	import { primBounds, unionBounds, PLOT_SCALE as PLOT } from '../views/display'
	import { spaceOf, specKey, specLabel, type ViewSpec, type WorkPlane } from '../views/space'
	import { snapAt, snapToPrims, type Snap } from '../editor/snap'
	import { parseTyped } from '../editor/input'
	import { toModel, zoomAt, panBy, fit, MIN_K, type Camera } from '../editor/camera'
	import TextEditBox from './TextEditBox.svelte'
	import ViewStrip, { type PaneNav } from './ViewStrip.svelte'
	import Prims from './Prims.svelte'
	import { fillTone } from '../domain/fill'

	let { project, ws, levelId, spec, other, active = true, onspec, onfocus, nav }: {
		project: CadProject; ws: Workspace; levelId: string; spec: ViewSpec
		/** Back / forward through this pane's views (UX12). */
		nav?: PaneNav
		/** The other pane's view, when split — to show its work plane here. */
		other?: ViewSpec
		active?: boolean
		onspec: (s: ViewSpec) => void
		onfocus?: () => void
	} = $props()

	const PLOT_SCALE = PLOT
	/** Screen mm per CSS px (96 dpi): zoom 100% = the drawing at its printed size (1:100, or the paper itself). */
	const PX_MM = 25.4 / 96

	let svg: SVGSVGElement | undefined = $state()
	let w = $state(800), h = $state(600)
	let cam = $state<Camera>({ x: 0, y: 0, k: 0.05 })
	let marquee = $state<Bounds | null>(null)
	/** The box is dragged right → left: a crossing selection (dashed green, like other CAD). */
	let crossing = $state(false)
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
						? (section ? sectionDisplayList(project.index, section, { scale: PLOT_SCALE, blocks: project.blockOf }) : [])
						: elevationDisplayList(project.index, levelId, space, { scale: PLOT_SCALE, blocks: project.blockOf }))
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
	/** Views whose restored camera has been checked for showing the content (once per view per session). */
	const checkedRestore = new Set<string>()
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
		void ws.focus   // a focus asked for after the view switched (Find a device) fits it too
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
			// asked to show one thing (a `?rack=` link): fit to it instead, once it's drawn here
			const want = ws.focus, fb = want && w && h ? unionBounds(ps.filter((p) => p.src === want).map(primBounds)) : null
			if (fb) { cam = fit(fb, w, h); fittedFor = RESTORED; ws.focus = null; return }   // RESTORED: no re-fit over it
			if (!ps.length || !w || !h) return
			const b = contentBounds(ps)
			// a restored camera that shows none of the content (UX13: a rack view opened cut off) fits once instead
			if (fittedFor === RESTORED && b && !checkedRestore.has(vk)) {
				checkedRestore.add(vk)
				const v = { x0: -cam.x / cam.k, y0: -cam.y / cam.k, x1: (w - cam.x) / cam.k, y1: (h - cam.y) / cam.k }
				if (v.x1 < b.x0 || v.x0 > b.x1 || v.y1 < b.y0 || v.y0 > b.y1) { cam = fit(b, w, h); return }
			}
			if (fittedFor === key || fittedFor === RESTORED) return
			if (b) { cam = fit(b, w, h); fittedFor = key }
		})
	})

	/** The project's sheets, for "To sheet…". */
	const sheetsList = $derived([...project.index.byId.values()].filter((e): e is Sheet => e.type === 'sheet' && e.status !== 'archived').sort((a, b) => a.order - b.order))
	/** Put this view on a sheet (backlog "A sheet from the current view"): a viewport centred on what the pane shows, at
	 *  the largest standard scale it fits at, on a new sheet or `sheetId`; one undo step. The sheet opens in this pane
	 *  with the new viewport selected. */
	export function toSheet(target: string): void {
		if (!target || spec.kind === 'sheet' || !w || !h) return
		const visible = { x0: -cam.x / cam.k, y0: -cam.y / cam.k, x1: (w - cam.x) / cam.k, y1: (h - cam.y) / cam.k }
		const base = target === 'new' ? blankSheet(sheetsList, newId()) : (project.index.get(target) as Sheet | undefined)
		if (base?.type !== 'sheet') return
		const opts = { projectName: project.name, template: project.settings?.titleBlock }
		const vp = viewViewport(project.index, base, { levelId, spec: $state.snapshot(spec) as Exclude<ViewSpec, { kind: 'sheet' }> }, visible, newId(), opts)   // plain data: the store freezes it (a $state proxy can't be)
		const next = { ...base, viewports: [...base.viewports, vp] }
		project.store.transact(target === 'new' ? `New sheet ${next.number} from this view` : `View onto ${next.number}`, (tx) => tx.put(next))
		onspec({ kind: 'sheet', sheetId: next.id })
		ws.select([next.id])
		ws.selectViewport(vp.id)
		ws.say(`${specLabel(spec)} on ${next.number} at 1:${vp.scale} — drag the viewport into place, resize it by a corner`)
	}

	function focusRack(p: Pt): void {
		const racks = prims.filter((x) => x.k === 'line' && x.cls === 'rack')
		const id = pickAt(racks, p, TOL_PX / cam.k)
		const b = id ? unionBounds(prims.filter((x) => x.src === id).map(primBounds)) : null
		if (b) cam = fit(b, w, h)
		else zoomExtents()
	}

	export function zoomExtents(): void {
		const b = contentBounds(prims)
		if (b) cam = fit(b, w, h)
	}
	/** What Fit fits (UX13): the content, not the storey datum lines — a rack view / elevation shrank to fit the slab,
	 *  ceiling and SSL lines drawn wide either side. */
	function contentBounds(ps: Prim[]): Bounds | undefined {
		const core = ps.filter((p) => p.k === 'image' || !p.cls.startsWith('datum'))
		return unionBounds((core.length ? core : ps).map(primBounds))
	}
	/** Does this view draw `id`? (The selection follows the view, UX09.) */
	export function draws(id: string): boolean {
		return id === (spec.kind === 'sheet' ? spec.sheetId : '') || layered.pick.some((p) => p.src === id)
	}

	/** Where a paste goes (domain/clipboard): a plan takes plan items, a sheet notes, a rack row devices (into the rack
	 *  under the mouse). Null = this view takes none (or no rack under the mouse). */
	export function pasteTarget(): { kind: 'level' | 'sheet' | 'rack'; id: string } | null {
		if (spec.kind === 'row') { const r = cursor && rowHit(project.index, spec, cursor)?.rack; return r ? { kind: 'rack', id: r.id } : null }
		return spec.kind === 'plan' ? { kind: 'level', id: levelId } : spec.kind === 'sheet' ? { kind: 'sheet', id: spec.sheetId } : null
	}
	/** What this view shows that can be picked (visible, unlocked layers) — devices in a rack row, notes on a sheet (not
	 *  the sheet itself). */
	function pickable(): Entity[] {
		const out = new Map<string, Entity>()
		for (const p of layered.pick) {
			const e = p.src && p.k !== 'image' ? project.index.get(p.src) : undefined
			if (e && (spec.kind === 'row' ? e.type === 'device' : spec.kind === 'sheet' ? e.type === 'shape' : e.type !== 'sheet')) out.set(e.id, e)
		}
		return [...out.values()]
	}
	/** Ctrl+A: everything this view shows that can be picked. */
	export function selectAll(): void { ws.select(pickable().map((e) => e.id)) }
	/** Select similar: what this view shows of the same kind as the selection (domain/similar.ts). */
	export function selectSimilar(): void {
		const ids = similarTo(ws.selection.map((id) => project.index.get(id)).filter((e): e is Entity => !!e), pickable())
		if (!ids.length) { ws.say('Nothing like the selection in this view'); return }
		ws.select(ids)
		ws.say(`Selected ${ids.length} similar item${ids.length === 1 ? '' : 's'} in this view`)
	}
	const nudger = new Nudge()
	/** An arrow key: the selection moves 50 mm (`big`: 500 mm; Dave: 1 mm was too small) in this view; on a sheet's
	 *  paper 1 / 10 mm; a rack row moves devices 1 U. */
	export function nudge(dx: number, dy: number, big: boolean): void {
		const step = spec.kind === 'row' ? 1 : spec.kind === 'sheet' ? (big ? 10 : 1) : big ? 500 : 50
		const why = nudger.press(project.store, ws.selection, { x: dx * step, y: dy * step }, space)
		if (why) ws.say(why)
	}
	export function endNudge(): void { nudger.end() }

	function ctx(): ToolCtx {
		const tol = TOL_PX / cam.k
		return {
			store: project.store, index: project.index, levelId, settings: project.settings, opts: ws.opts, space, work,
			// the current layer for new lines: a project layer that exists, or a system one other than Drawing (their default)
			layerId: ws.layers.current && ws.layers.current !== 'sys:drawing' && (ws.layers.current.startsWith('sys:') || project.index.get(ws.layers.current)?.type === 'layer') ? ws.layers.current : null,
			prims: () => layered.pick, tol: () => tol,
			snap: (p, alt, skip, dragged) => {
				const d = ws.drafting, o = { skip, noGrid: alt || !d.snap, grid: d.grid, noObjects: !d.osnap }
				const sn = spec.kind === 'plan' ? snapAt(project.index, levelId, p, tol * 1.5, o) : snapToPrims(prims, p, tol * 1.5, o)
				// nodes being dragged snap onto the skipped runs' OTHER nodes too (dropped there, they join them); the dragged
				// nodes themselves, and the midpoints of segments they move, would snap to the cursor
				if (!dragged || !skip) return sn
				let best = sn, bestD = sn.kind === 'grid' ? tol * 1.5 : Math.hypot(sn.p.x - p.x, sn.p.y - p.y)
				const offer = (q: Pt, s: Snap) => { const d = Math.hypot(q.x - p.x, q.y - p.y); if (d <= bestD) { best = s; bestD = d } }
				for (const id of Array.isArray(skip) ? skip : [skip]) {
					const own = project.index.get(id)
					if (own?.type !== 'shape' || own.geom.kind !== 'path') continue
					const byId = new Map(own.geom.nodes.map((n) => [n.id, n]))
					for (const n of own.geom.nodes) if (!dragged.includes(n.id)) { const q = space.fromWorld(n); offer(q, { p: q, kind: 'node', z: n.z }) }
					for (const g of own.geom.segs) {
						const a = byId.get(g.a), b = byId.get(g.b)
						if (!a || !b || dragged.includes(a.id) || dragged.includes(b.id)) continue
						const qa = space.fromWorld(a), qb = space.fromWorld(b), q = { x: (qa.x + qb.x) / 2, y: (qa.y + qb.y) / 2 }
						if (qa.x !== qb.x || qa.y !== qb.y) offer(q, { p: q, kind: 'mid' })
					}
				}
				return best
			},
			grid: ws.drafting.snap ? ws.drafting.grid : 0,
			selection: ws.selection, select: ws.select, setMarquee: (b, x) => { marquee = b; crossing = !!x }, ask: ws.ask, askText: ws.askText, say: ws.say,
			...(spec.kind === 'sheet' ? { selectViewport: ws.selectViewport, viewportId: () => ws.viewportId } : {}),
			selectOpening: ws.selectOpening, openingId: () => ws.openingSel?.openingId ?? null,
			pathSel: () => ws.pathSel, selectPath: ws.selectPath, editText: ws.editText,
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
		const s = local(e), now = e.timeStamp   // when the press HAPPENED: a slow render after the first click (selecting an outlet) delays handling the second past 400 ms
		const n = lastPress && now - lastPress.t < 400 && Math.hypot(s.x - lastPress.x, s.y - lastPress.y) < 5 ? lastPress.n + 1 : 1
		lastPress = { t: now, ...s, n }
		return n
	}

	let panning = $state<{ x: number; y: number; moved: boolean; button: number } | null>(null)
	/** The last pointer position in view mm — where a typed distance points, and the readout in the corner. */
	let cursor = $state<Pt | null>(null)
	let toolDown = false
	/** The tool's cursor for what's under the pointer (Select: crosshair on a grip, move on what moves). */
	const cursorCss = $derived.by(() => { void tick; return ws.tool.cursorNow?.() ?? ws.tool.cursor })
	/** Length · angle · Δ in the status bar while drawing a run / line (from its last point) or dragging (from where the
	 *  drag started) — backlog "Length / angle readout" (Dave: in the status bar, not at the cursor). */
	const readout = $derived.by(() => {
		void tick
		const t = ws.tool, from = t.dragFrom?.() ?? (['line', 'trunk', 'conduit', 'wall'].includes(ws.toolId) ? t.lastPoint?.(ctx()) : null)
		if (!cursor || !from) return null
		const dx = cursor.x - from.x, dy = cursor.y - from.y, up = spec.kind !== 'plan' && spec.kind !== 'sheet'
		const deg = Math.round(((Math.atan2(-dy, dx) * 180) / Math.PI + 360) % 360 * 10) / 10   // anticlockwise from →, up the screen positive
		const r = (v: number) => (spec.kind === 'sheet' ? Math.round(v * 10) / 10 : Math.round(v))
		return `L ${r(Math.hypot(dx, dy))} · ∠ ${deg}° · ΔX ${r(dx)} · ${up ? 'ΔZ' : 'ΔY'} ${r(up ? -dy : dy)}`
	})

	// the status bar's readout (UX05): the active pane reports the cursor in its own terms (plan / sheet x, y with y down;
	// elevations, sections and rack rows x, z up), the length · angle while drawing, the scale and the zoom
	$effect(() => {
		if (!active) return
		const up = spec.kind === 'elevation' || spec.kind === 'section' || spec.kind === 'row'
		ws.viewInfo = {
			xy: cursor ? `X ${Math.round(cursor.x)} · ${up ? 'Z' : 'Y'} ${Math.round(up ? -cursor.y : cursor.y)}` : null,
			readout, scale: spec.kind === 'sheet' ? 'paper mm' : `1:${PLOT_SCALE}`,
			zoom: Math.round(cam.k * PX_MM * (spec.kind === 'sheet' ? 1 : PLOT_SCALE) * 100), mmPerPx: Math.round(1 / cam.k),
			...(spec.kind === 'elevation' ? { extra: `work depth ${Math.round(work.depth)}` } : {}),
		}
	})
	/** The drawn grid (GRID, UX05): lines every grid step, coarsened ×10 until they're at least 8 px apart; every 5th
	 *  darker. Model views only (a sheet's paper has its margins; a rack view its Us). */
	const gridLines = $derived.by(() => {
		const d = ws.drafting
		if (!d.showGrid || spec.kind === 'sheet' || spec.kind === 'row' || !w || !h) return []
		let step = Math.max(1, d.grid || 10)
		while (step * cam.k < 8) step *= 10
		const x0 = -cam.x / cam.k, y0 = -cam.y / cam.k, x1 = (w - cam.x) / cam.k, y1 = (h - cam.y) / cam.k, out: { a: Pt; b: Pt; major: boolean }[] = []
		for (let x = Math.ceil(x0 / step) * step; x <= x1; x += step) out.push({ a: { x, y: y0 }, b: { x, y: y1 }, major: Math.round(x / step) % 5 === 0 })
		for (let y = Math.ceil(y0 / step) * step; y <= y1; y += step) out.push({ a: { x: x0, y }, b: { x: x1, y }, major: Math.round(y / step) % 5 === 0 })
		return out
	})

	function onDown(e: PointerEvent) {
		onfocus?.()
		try { svg!.setPointerCapture(e.pointerId) } catch { /* a synthetic pointer (tests, automation) has none */ }
		if (e.button === 1 || e.button === 2) { panning = { ...local(e), moved: false, button: e.button }; return }
		if (e.button !== 0) return
		// a tool that doesn't belong in this view does nothing here (split view: both panes share the tool)
		if (!toolWorksIn(ws.toolId, spec.kind)) { ws.say(`The ${ws.toolId} tool doesn't work in this view`); return }
		const count = pressCount(e)
		if (count >= 2) e.preventDefault()   // no word selection / focus change from a double-click (it closed the in-place edit box)
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

	/** Alt+wheel over the selected, unlocked viewport: the next standard scale (T126). False = not over one. */
	function rescaleViewport(dir: 1 | -1, p: Pt): boolean {
		const vp = sheet?.viewports.find((v) => v.id === ws.viewportId)
		if (!sheet || !vp || vp.locked || p.x < vp.rect.x || p.x > vp.rect.x + vp.rect.w || p.y < vp.rect.y || p.y > vp.rect.y + vp.rect.h) return false
		const scale = nextScale(vp.scale, dir), s = sheet
		if (scale !== vp.scale) project.store.transact(`Viewport scale 1:${scale}`, (tx) => tx.put({ ...s, viewports: s.viewports.map((v) => (v.id === vp.id ? { ...v, scale } : v)) }))
		ws.say(`1:${scale} — Alt+wheel changes the viewport's scale, Alt-drag pans its view`)
		return true
	}
	/** The wheel needs a non-passive listener to stop the page scrolling. */
	$effect(() => {
		const el = svg
		if (!el) return
		const onWheel = (e: WheelEvent) => {
			e.preventDefault()
			if (!(e.altKey && rescaleViewport(e.deltaY < 0 ? -1 : 1, toModel(cam, local(e))))) cam = zoomAt(cam, local(e), Math.exp(-e.deltaY * 0.0015))
		}
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
		style:cursor={panning?.moved ? 'grabbing' : cursorCss}
		onpointerdown={onDown} onpointermove={onMove} onpointerup={onUp} onpointercancel={onUp} onpointerleave={() => { ws.tool.unhover?.(); cursor = null; tick++ }}
		oncontextmenu={(e) => e.preventDefault()}>
		<g transform="translate({cam.x} {cam.y}) scale({cam.k})" visibility={hiddenUntilFit ? 'hidden' : undefined}>
			{#each gridLines as g, i (i)}<line class="gridline" class:major={g.major} x1={g.a.x} y1={g.a.y} x2={g.b.x} y2={g.b.y} vector-effect="non-scaling-stroke" />{/each}
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
					class="marquee" class:crossing vector-effect="non-scaling-stroke" />
			{/if}
		</g>
	</svg>
	<ViewStrip {project} {ws} {spec} {levelId} {sections} {section} {sheet} {sheetsList} {onspec} {onfocus} {toSheet} {nav} />
	{#if hiddenUntilFit}<div class="loading">Loading floorplan…</div>{/if}
	{#if ws.textEdit && active}{#key ws.textEdit}<TextEditBox {project} {ws} {space} {cam} {prims} />{/key}{/if}
</div>

<style>
	.surface { position: relative; width: 100%; height: 100%; overflow: hidden; background: white; }
	/* the drawing's words aren't page text: a double-click mustn't select them (it took the focus from the in-place edit box) */
	.surface svg { user-select: none; -webkit-user-select: none; }
	.surface.active { box-shadow: inset 0 0 0 1px #93c5fd; }
	.loading { position: absolute; top: 45%; left: 0; right: 0; text-align: center; font-size: 12px; color: #a1a1aa; pointer-events: none; }
	.gridline { stroke: #e4e4e7; stroke-width: 0.5; }
	.gridline.major { stroke: #d4d4d8; stroke-width: 0.8; }
	.marquee { fill: rgba(59, 130, 246, 0.08); stroke: #3b82f6; }
	.marquee.crossing { fill: rgba(16, 185, 129, 0.08); stroke: #10b981; stroke-dasharray: 4 3; }
</style>
