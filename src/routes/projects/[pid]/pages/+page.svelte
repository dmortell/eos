<script lang="ts">
	// ── Kestrel-layout workspace MOCKUP (kestrel-adoption.md, feel/flow study) ──
	// Self-contained prototype: titlebar · menubar · canvas tabs · collapsible
	// left/right sidebars · status bar. No ribbon, no command history (later).
	// Everything is mock data + local state — nothing touches Firestore. Styled
	// with Kestrel's own tokens scoped to .shell, so it looks like Kestrel in
	// both light/dark regardless of the app theme (toggle in its titlebar).
	import { Icon } from '$lib'
	import { toast } from 'svelte-sonner'
	import { imgEdit, clearImgMode } from './imageEdit.svelte'
	import { flushSync, tick } from 'svelte'
	import { page } from '$app/state'
	import PaperPage, { type FrameSel } from './parts/PaperPage.svelte'
	import Viewport, { type SectionMarker } from './ui/Viewport.svelte'
	import DrawingNavigator from './parts/DrawingNavigator.svelte'
	import LayersPanel from './parts/LayersPanel.svelte'
	import PropertiesPanel from './parts/PropertiesPanel.svelte'
	import { layerUI, layerById, layers } from './layers.svelte'
	import HistoryPanel from './parts/HistoryPanel.svelte'
	import StatusBar from './parts/StatusBar.svelte'
	import ViewGizmos from './parts/ViewGizmos.svelte'
	import Menubar from './parts/Menubar.svelte'
	import CommandPalette from './parts/CommandPalette.svelte'
	import { panzoom } from './ui/panzoom'
	import { paperDims, PAPER_SIZES, PAPER_PX_PER_MM, type PaperSize } from './constants'
	import { translate, type Ent, type ElevDir } from './ui/geometry'
	import { models, modelById, FLOOR_MODEL_ID, modelSel, snapModels, setModels } from './3dview/models.svelte'
	import { DEFAULT_YAW, DEFAULT_PITCH } from './3dview/projection'
	import type { Model, Clip, Section } from './3dview/types'

	// Which pane (if any) has its viewport activated — groundwork for editing/CAD
	// tools inside a sheet's viewport. Null = no active viewport.
	// Which TAB docs have their viewport activated (keyed by tab id, not pane) — so activation is
	// remembered when you switch away and back to a view. Selection is already per-doc (docSel).
	let activeVps = $state(new Set<string>())
	const isVpActive = (id?: string) => !!id && activeVps.has(id)
	function activateVp(id?: string) { if (!id) return; const s = new Set(activeVps); s.add(id); activeVps = s }
	function deactivateVp(id?: string) { if (!id || !activeVps.has(id)) return; const s = new Set(activeVps); s.delete(id); activeVps = s }

	// Canvas documents — the B1 "each tab owns its own view state" pattern (mock).
	type Kind = 'plan' | 'sheet' | 'elevation' | 'model'
	// `modelId` = which registry model this tab views (model-layout tabs); a sheet's frames each carry their
	// own `modelId`. Defaults to the floor model. (§5 model registry.)
	type Tab = { id: string; title: string; kind: Kind; dirty: boolean; preview?: boolean; modelId?: number }
	let tabs = $state<Tab[]>([
		{ id: 't1', title: '3303 Floorplan', kind: 'plan', dirty: false, modelId: 1 },
		{ id: 't2', title: '3303 Outlets', kind: 'sheet', dirty: true, modelId: 1 },
		{ id: 't3', title: 'Rack A · Elevation', kind: 'elevation', dirty: false, modelId: 2 },
		{ id: 't4', title: 'Rack A · 3D Model', kind: 'model', dirty: false, modelId: 2 },
	])
	let seq = 4
	const kindIcon: Record<Kind, string> = { plan: 'mapPin', sheet: 'fileText', elevation: 'server', model: 'box' }

	// Editor panes — 1 or 2 side by side (vertical split). Each pane views one open
	// tab; tabs are shared documents, so the same page can show in both panes and
	// each pane tracks its own active tab (VS Code-style split).
	type View = { zoom: number; x: number; y: number }
	// Each pane (view) remembers its own tool + its own canvas (paper-space) pan/zoom.
	type Proj = 'plan' | 'front' | 'rear' | 'left' | 'right' | 'iso'
	// `layout` is PER-PANE ('sheet' = paper + frame, 'model' = drawing fills the pane) so toggling
	// Full-size (or a projection) in one split pane doesn't disturb the other pane's view.
	let panes = $state<{ id: string; activeId: string; tool: string; layout: 'model' | 'sheet' }[]>([{ id: 'p1', activeId: 't2', tool: 'Select', layout: 'sheet' }])
	// Canvas (paper-space) pan/zoom is per PANE + TAB — switching tabs in a pane keeps each tab's own paper
	// position/zoom (was per-pane, so zooming one tab changed the next). Persisted per tab in localStorage
	// (a per-user UI convenience); the viewport CONTENT view (docView) is the document-side pan/zoom.
	let docCanvasView = $state<Record<string, View>>({})   // live per pane+tab (split-independent)
	let cvCache = $state<Record<string, View>>({})          // per-tab localStorage seed (loaded once, client only)
	const CV_LS = 'eos.pages.canvasView'
	const cvKey = (paneId: string, tabId: string) => paneId + ':' + tabId
	$effect(() => { try { cvCache = JSON.parse(localStorage.getItem(CV_LS) || '{}') } catch { /* private mode */ } })
	const canvasViewOf = (pane: { id: string; activeId: string }): View => docCanvasView[cvKey(pane.id, pane.activeId)] ?? cvCache[pane.activeId] ?? { zoom: 1, x: 0, y: 0 }
	function setCanvasView(pane: { id: string; activeId: string }, v: View) {
		docCanvasView = { ...docCanvasView, [cvKey(pane.id, pane.activeId)]: v }
		cvCache = { ...cvCache, [pane.activeId]: v }
		try { localStorage.setItem(CV_LS, JSON.stringify(cvCache)) } catch { /* private mode */ }
	}
	// Active PROJECTION keyed by PANE + tab, so each split pane is independent (plan in one, side in
	// the other) yet each pane remembers a view's projection when you switch tabs within it.
	let docProj = $state<Record<string, Proj>>({})
	const projKey = (paneId: string, a: Tab) => `${paneId}:${a.id}`
	function projOf(pane: { id: string }, a: Tab | null): Proj {
		if (!a) return 'plan'
		return docProj[projKey(pane.id, a)] ?? (a.kind === 'elevation' ? 'front' : a.kind === 'model' ? 'iso' : 'plan')
	}
	// Map a projection to the Viewport render kind: plan → floorplan, iso → oblique 3D, the four
	// elevations pass through as their own kind (the Viewport projects each per ELEV_BASIS).
	const projKind = (p: Proj) => (p === 'plan' ? 'floorplan' : p) as 'floorplan' | 'iso' | 'front' | 'rear' | 'left' | 'right'
	// A drawing's DOCUMENT state (paper / scale / viewport frames) is keyed by a stable DRAWING id — the
	// tab's TITLE — not the ephemeral tab id, so closing a tab (or reusing the preview slot) never destroys
	// the page, and reopening the same drawing restores it (B6). Titles are unique (named drawings + the
	// `Untitled N` counter) and openDrawing already dedups by title. Session/VIEW state stays tab/pane-keyed.
	const didOf = (tabId?: string) => tabs.find((t) => t.id === tabId)?.title ?? tabId ?? ''
	// Paper size + orientation, per DRAWING (keyed by drawing id). Each sheet keeps its own paper.
	// Changing it just resizes the paper rect in place — no refit/jump.
	let docPaper = $state<Record<string, { size: PaperSize; landscape: boolean }>>({})
	const paperOf = (id?: string) => docPaper[didOf(id)] ?? { size: 'A3' as PaperSize, landscape: true }
	const paperDimsOf = (id?: string) => { const p = paperOf(id); return paperDims(p.size, p.landscape) }
	function setPaper(id: string | undefined, patch: Partial<{ size: PaperSize; landscape: boolean }>) {
		if (!id) return
		docPaper = { ...docPaper, [didOf(id)]: { ...paperOf(id), ...patch } }
	}
	// Per-drawing SCALE (mock — shown in the viewport tag + titleblock; chosen in the active-viewport bar,
	// like the Sheets tool's viewport scale). Keyed by drawing id (title) so it survives close/reopen.
	const SCALES = ['1:1', '1:2', '1:5', '1:10', '1:15', '1:20', '1:25', '1:50', '1:100', '1:150', '1:200', '1:500']
	let docScale = $state<Record<string, string>>({ '3303 Outlets': '1:25' })   // 3303 Outlets sheet defaults bigger (1:25)
	const scaleOf = (id?: string) => docScale[didOf(id)] ?? '1:100'   // model space is real mm; 1:100 fits the ~28 m demo plan
	const setScale = (id: string | undefined, s: string) => { if (id) docScale = { ...docScale, [didOf(id)]: s } }
	// The drafting/interaction flags bundle passed to a pane's viewport (one prop instead of six).
	let guideVert = $state(false)   // the Guide tool's H/V pop-out base (touch has no Shift); Shift still flips it
	const envFor = (pane: { id: string; activeId: string }) => ({ acad: acadMode, navContent, grid: toggles.GRID, lwt: toggles.LWT, osnap: toggles.OSNAP, snap: toggles.SNAP, ortho: toggles.ORTHO, cen: toggles.CEN, guideVert, canvasZoom: canvasViewOf(pane).zoom })
	// All the viewport event callbacks in ONE `on` object (was ~13 separate props). PaperPage also
	// uses `frame`; the plain Viewport ignores it.
	const vpOn = (a: Tab, pane: { id: string; tool: string }) => ({
		activate: () => activateVp(a.id), deactivate: () => deactivateVp(a.id),
		add: (e: Ent) => addEnt(a.id, e), update: (e: Ent) => updateEnt(a.id, e),
		delete: (ids: string[]) => deleteEnts(a.id, ids), select: (ids: string[]) => setSel(a.id, ids),
		view: (v: View) => setView(pane.id, a.id, projOf(pane, a), v), status: (t: string) => (statusText = t),
		coords: (x: number, y: number) => (worldXY = { x, y }), beginedit: beginGesture, endedit: endGesture,
		tool: (t: string) => (pane.tool = t), frame: onFrame as (f: unknown) => void,
		copy: (ids: string[]) => copyEnts(a.id, ids), cut: (ids: string[]) => cutEnts(a.id, ids), paste: () => pasteEnts(a.id),
		group: (ids: string[]) => groupEnts(a.id, ids), ungroup: (ids: string[]) => ungroupEnts(a.id, ids),
		reorder: (ids: string[], op: 'front' | 'back' | 'forward' | 'backward') => reorderEnts(a.id, ids, op),
		scale: (s: string) => setScale(a.id, s),
		modeledit: (label?: string) => modelEdit(a.id, label), section: (clip: Clip) => onSection(clip),
		orbit: (yaw: number, pitch: number) => setOrbit(pane.id, a.id, projOf(pane, a), yaw, pitch),
		sectionselect: (id: string | null) => selectSection(id),
		sectionmove: (id: string, clip: Clip) => moveSection(id, clip),
		sectionsetdir: (id: string, dir: ElevDir) => setSectionDir(id, dir),
		sectiondelete: (id: string) => deleteSection(id),
		sectiondropdir: (id: string, dir: ElevDir) => dropSectionDir(id, dir),
	})
	// A 3D-model edit (the Viewport mutated the shared `models` store) records a step on THIS doc's
	// timeline, gesture-folded like an entity edit — so Ctrl+Z restores the model too.
	function modelEdit(id: string, label = 'Edit model') { recordEdit(id, label) }
	// Iso ORBIT (yaw/pitch), per pane+tab so split 3D views orbit independently. Drag the iso view to rotate.
	let docOrbit = $state<Record<string, { yaw: number; pitch: number }>>({})
	const orbitOf = (paneId: string, viewId: string, proj: Proj) => docOrbit[vkey(paneId, viewId, proj)] ?? { yaw: DEFAULT_YAW, pitch: DEFAULT_PITCH }
	function setOrbit(paneId: string, viewId: string, proj: Proj, yaw: number, pitch: number) { docOrbit = { ...docOrbit, [vkey(paneId, viewId, proj)]: { yaw, pitch } } }
	// A SECTION is a plan marker (NOT a tab): a clip box + a primary sight direction + a name, stored in the
	// MODEL (`Model.sections`, B5) so it is model-scoped (a cut on one model's plan doesn't show on another)
	// and undoable (it rides `snapModels`). Its elevations are viewed by DROPPING viewport FRAMES onto the
	// current sheet — each of the 4 arrows drops that direction's elevation as a frame (Dave, 2026-09-22).
	// The 'sec' id keeps it distinct from tab ids.
	let selSection = $state<string | null>(null)   // the section marker selected on the plan (shows grips + toolbar)
	let secSeq = 0
	// Section markers live in the MODEL (B5): model-scoped (a cut on one model's plan doesn't show on
	// another) + undoable (they ride `snapModels`). These helpers mirror the entity helpers.
	const mdlSectionsOf = (mid: number): Section[] => modelById(mid)?.sections ?? []
	const setMdlSections = (mid: number, next: Section[]) => { const m = modelById(mid); if (m) m.sections = next }
	// A model's section markers in the SectionMarker shape the Viewport draws (name → label).
	const sectionsForModel = (mid?: number): SectionMarker[] => mdlSectionsOf(mid ?? FLOOR_MODEL_ID).map((s) => ({ id: s.id, clip: s.clip, dir: s.dir, label: s.name ?? 'Section' }))
	// Locate a section (across models) by id → its model id + the section object. Ids are globally unique.
	function findSection(id: string): { mid: number; sec: Section } | null {
		for (const m of models) { const sec = (m.sections ?? []).find((s) => s.id === id); if (sec) return { mid: m.id, sec } }
		return null
	}
	function onSection(clip: Clip) {
		const id = 'sec' + secSeq
		const tabId = panes[focused]?.activeId ?? '', mid = modelIdOf(tabId)
		ensureHist(tabId)
		setMdlSections(mid, [...mdlSectionsOf(mid), { id, clip, dir: 'front', name: `Section ${String.fromCharCode(65 + (secSeq++ % 26))}` }])
		selSection = id   // select the new marker (grips + toolbar); drop its elevations via the arrows
		recordEdit(tabId, 'Add section')
	}
	// Drop a section's elevation for a direction as a viewport FRAME on the current sheet (focused pane's
	// sheet, else the first sheet tab); focuses it + selects the new frame. Frame size starts at the clip aspect.
	function dropSectionDir(id: string, dir: ElevDir) {
		const found = findSection(id); if (!found) return
		const clip = found.sec.clip
		const focusedTab = tabs.find((t) => t.id === panes[focused]?.activeId)
		const sheet = focusedTab?.kind === 'sheet' ? focusedTab : tabs.find((t) => t.kind === 'sheet')
		if (!sheet) { statusText = 'Open a sheet first to drop a section viewport'; return }
		openTab(sheet.id)
		ensureHist(sheet.id)
		const fid = newFrameId()
		const cw = Math.abs(clip.x1 - clip.x0) || 1, ch = Math.abs(clip.y1 - clip.y0) || 1
		const W = 320, H = Math.max(120, Math.min(460, Math.round((W * ch) / cw)))
		const n = framesOf(sheet.id).length, ox = 90 + (n % 5) * 24, oy = 90 + (n % 5) * 24
		setFrames(sheet.id, [...framesOf(sheet.id), { id: fid, x: ox, y: oy, w: W, h: H, border: 'solid', proj: dir, scale: scaleOf(sheet.id), clip: { ...clip }, label: PROJ_LABEL[dir] ?? 'Section' }])
		if (panes[focused]) { panes[focused].activeId = sheet.id; panes[focused].layout = 'sheet' }
		selFrame = fid
		recordEdit(sheet.id, 'Drop section viewport')
	}
	// MOVE / RESIZE: mutate the marker in its model. The Viewport brackets a drag with beginedit (start) +
	// modeledit/endedit (release), so a whole drag folds into one undo step (see the section drag handlers).
	function moveSection(id: string, clip: Clip) {
		const found = findSection(id); if (!found) return
		setMdlSections(found.mid, mdlSectionsOf(found.mid).map((s) => s.id === id ? { ...s, clip } : s))
	}
	function selectSection(id: string | null) { selSection = id; if (id) setSel(active?.id ?? '', []) }   // section vs entity selection are exclusive
	function setSectionDir(id: string, dir: ElevDir) {
		const found = findSection(id); if (!found) return
		const tabId = panes[focused]?.activeId ?? ''
		ensureHist(tabId)
		setMdlSections(found.mid, mdlSectionsOf(found.mid).map((s) => s.id === id ? { ...s, dir } : s))
		recordEdit(tabId, 'Set section direction')
	}
	function deleteSection(id: string) {
		const found = findSection(id); if (!found) return
		const tabId = panes[focused]?.activeId ?? ''
		ensureHist(tabId)
		setMdlSections(found.mid, mdlSectionsOf(found.mid).filter((s) => s.id !== id))
		if (selSection === id) selSection = null
		recordEdit(tabId, 'Delete section')
	}

	// ── multi-viewport sheets (AutoCAD paper space) — a sheet's PAGE MODEL is an array of viewport FRAMES
	// (no special "primary"; the default page seeds one full-bleed frame). Each frame is a window onto the
	// shared model at its own projection + scale + clip + geometry; its view/orbit/activation are keyed by
	// the FRAME id (reusing docView/docOrbit/activeVps), while entity editing targets the tab's shared
	// entities. Frames live per tab (surviving tab switches) and are undone/persisted with the page.
	// (Later the page model also carries the titleblock + page annotations.) A section can be dropped in.
	type SheetFrame = { id: string; x: number; y: number; w: number; h: number; border: 'dashed' | 'solid' | 'none'; proj: Proj; scale: string; clip: Clip | null; label: string; modelId?: number }
	// Viewport frames = a sheet's page model → DOCUMENT state, keyed by drawing id (title) so they survive
	// closing/reopening the tab (B6). snapAllFrames/applyPtr operate on the whole map, so history is unaffected.
	let docFrames = $state<Record<string, SheetFrame[]>>({})
	const framesOf = (tabId: string) => docFrames[didOf(tabId)] ?? []
	function setFrames(tabId: string, frames: SheetFrame[]) { docFrames = { ...docFrames, [didOf(tabId)]: frames } }
	function updateFrame(tabId: string, id: string, patch: Partial<SheetFrame>) { setFrames(tabId, framesOf(tabId).map((f) => (f.id === id ? { ...f, ...patch } : f))) }
	let frameSeq = 0
	const newFrameId = () => 'vf' + ++frameSeq
	let selFrame = $state<string | null>(null)   // the viewport frame selected in paper space (move/resize/props)
	// Exactly one active viewport per sheet: activating a frame deactivates its siblings.
	function activateFrame(tabId: string, id: string) { for (const f of framesOf(tabId)) if (f.id !== id) deactivateVp(f.id); activateVp(id) }
	// A per-frame callback bundle: entity editing keeps the TAB id; view / activation / scale / orbit use
	// the FRAME id, so each viewport pans, activates and re-aims independently.
	const vpOnFrame = (a: Tab, pane: { id: string; tool: string }, frame: SheetFrame) => ({
		...vpOn(a, pane),
		view: (v: View) => setView(pane.id, frame.id, frame.proj, v),
		activate: () => activateFrame(a.id, frame.id),
		deactivate: () => deactivateVp(frame.id),
		scale: (s: string) => updateFrame(a.id, frame.id, { scale: s }),
		orbit: (yaw: number, pitch: number) => setOrbit(pane.id, frame.id, frame.proj, yaw, pitch),
	})
	// Seed a sheet's DEFAULT viewport (fills the sheet, plan view) the first time PaperPage measures it —
	// this is the page's baseline, so it's not a recorded edit.
	function seedFrame(tabId: string, x: number, y: number, w: number, h: number) {
		if (framesOf(tabId).length) return
		setFrames(tabId, [{ id: newFrameId(), x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), border: 'dashed', proj: 'plan', scale: scaleOf(tabId), clip: null, label: 'Plan' }])
	}
	// A new viewport frame dragged on the paper (the Viewport tool): defaults to a plan view. Frame edits
	// (add / move / resize / delete / re-source) record on the page's per-doc history so Ctrl-Z works.
	function addFrame(tabId: string, x: number, y: number, w: number, h: number) {
		ensureHist(tabId)   // capture the pre-add baseline first
		const id = newFrameId()
		setFrames(tabId, [...framesOf(tabId), { id, x: Math.round(x), y: Math.round(y), w: Math.max(60, Math.round(w)), h: Math.max(60, Math.round(h)), border: 'solid', proj: 'plan', scale: scaleOf(tabId), clip: null, label: 'Plan' }])
		selFrame = id
		recordEdit(tabId, 'Add viewport')
	}
	function deleteFrame(tabId: string, id: string) { ensureHist(tabId); setFrames(tabId, framesOf(tabId).filter((f) => f.id !== id)); if (selFrame === id) selFrame = null; deactivateVp(id); recordEdit(tabId, 'Delete viewport') }
	function commitFrame(tabId: string, label: string) { recordEdit(tabId, label) }   // one history step at a drag/edit end
	// The active viewport in a tab: the tab id if active (model-layout tabs), else whichever sheet frame is.
	const activeVpOf = (tabId: string): string | null => (isVpActive(tabId) ? tabId : framesOf(tabId).find((f) => isVpActive(f.id))?.id ?? null)
	// The ViewCube reflects + re-aims a SHEET's active frame (or its first frame); a model-layout tab uses
	// the per-pane docProj as before.
	const gizmoProj = (pane: { id: string }, a: Tab | null): Proj => {
		if (a?.kind === 'sheet') { const av = activeVpOf(a.id); const f = (av ? framesOf(a.id).find((x) => x.id === av) : null) ?? framesOf(a.id)[0]; return (f?.proj ?? 'plan') as Proj }
		return projOf(pane, a)
	}
	function gizmoSet(pane: { id: string }, a: Tab | null, proj: Proj) {
		if (a?.kind === 'sheet') { const av = activeVpOf(a.id) ?? framesOf(a.id)[0]?.id; if (av) updateFrame(a.id, av, { proj, label: PROJ_LABEL[proj] }) }
		else if (a) docProj = { ...docProj, [projKey(pane.id, a)]: proj }
	}
	const PROJ_LABEL: Record<Proj, string> = { plan: 'Plan', front: 'Front', rear: 'Rear', left: 'Left', right: 'Right', iso: '3D' }
	let selFrameObj = $derived.by(() => { const t = active; return t && selFrame ? framesOf(t.id).find((f) => f.id === selFrame) ?? null : null })
	let focused = $state(0)      // which pane new tabs / sidebar actions target
	let canvasEls = $state<(HTMLElement | undefined)[]>([])   // each pane's .canvas, for navFit
	let splitFrac = $state(0.5)  // pane 0 width fraction when split
	let paneSeq = 1
	let active = $derived(tabs.find(t => t.id === panes[focused]?.activeId) ?? null)

	// Per-DOCUMENT state (keyed by tab id): drawn entities, selection, and the
	// viewport's own pan/zoom — so all three persist across tab switches and show
	// wherever the doc is open. (Tool + canvas pan/zoom are per view, above.)
	// Starter docs hold only annotations now — the real 3D floor MODEL (walls / furniture / trunk,
	// see 3dview/) is what renders in every view. The old demo `box` Ent was retired once the model
	// landed (model-plan.md P1b); the Box tool stays for quick sketches, it's just no longer seeded.
	// Entities (2D annotations) live IN THE MODEL each viewport references (`Model.ents`). With the model
	// REGISTRY (§5) a viewport points at a model by id: a sheet FRAME carries `modelId`, a model-layout TAB
	// carries `modelId`, defaulting to the floor. Editing targets the ACTIVE viewport's model — so the CRUD
	// takes a tab id (the history key) and resolves the model from whatever viewport is active in it.
	const entsForModel = (mid?: number): Ent[] => (modelById(mid ?? FLOOR_MODEL_ID)?.ents ?? modelById(FLOOR_MODEL_ID)?.ents ?? [])
	// The model a tab's ACTIVE viewport edits: the active sheet frame's model; else (no active frame, e.g.
	// an image imported without entering a viewport) the FIRST frame's model; else the tab's own model; else
	// the floor. Drawing needs an active viewport, so the fallbacks only bite for viewport-less actions.
	function modelIdOf(tabId: string): number {
		const av = activeVpOf(tabId)
		if (av && av !== tabId) { const f = framesOf(tabId).find((x) => x.id === av); if (f?.modelId != null) return f.modelId }
		return framesOf(tabId)[0]?.modelId ?? tabs.find((t) => t.id === tabId)?.modelId ?? FLOOR_MODEL_ID
	}
	const mdlEntsOf = (mid: number): Ent[] => modelById(mid)?.ents ?? []
	const setMdlEntsOf = (mid: number, next: Ent[]) => { const m = modelById(mid); if (m) m.ents = next }
	// The focused doc's active model (for selection / revisions / properties).
	const activeMid = () => modelIdOf(panes[focused]?.activeId ?? '')
	const mdlEnts = (): Ent[] => mdlEntsOf(activeMid())
	let docSel = $state<Record<string, string[]>>({})
	let docView = $state<Record<string, View>>({})
	const entsOf = (id: string) => entsForModel(tabs.find((t) => t.id === id)?.modelId)   // a tab's model's ents (sheets pass per-frame)
	const selOf = (id: string) => docSel[id] ?? []
	// View (content pan/zoom) is keyed by PANE + view + PROJECTION, so a split pans each pane independently
	// AND each projection of a viewport (plan / front / … / 3D) remembers its own framing — flipping the
	// ViewCube restores that view's pan/zoom instead of carrying one framing across all directions.
	const vkey = (paneId: string, viewId: string, proj: Proj) => paneId + ':' + viewId + ':' + proj
	const viewOf = (paneId: string, viewId: string, proj: Proj) => docView[vkey(paneId, viewId, proj)] ?? { zoom: 1, x: 0, y: 0 }
	// A GESTURE (a drag or a nudge burst) should be ONE undo/history step: while a gesture is open,
	// only the first mutation snapshots; the rest just update. Viewport signals begin/end.
	let gestureActive = false, gesturePushed = false
	let gestureEndTimer: ReturnType<typeof setTimeout> | null = null
	function beginGesture() { if (gestureEndTimer) { clearTimeout(gestureEndTimer); gestureEndTimer = null } gestureActive = true; ensureHist() }
	function endGesture(debounceMs = 0) {
		const finish = () => { gestureActive = false; gesturePushed = false; gestureEndTimer = null }
		if (gestureEndTimer) { clearTimeout(gestureEndTimer); gestureEndTimer = null }
		if (debounceMs) gestureEndTimer = setTimeout(finish, debounceMs); else finish()
	}
	// recordEdit runs AFTER the mutation and snapshots the new state onto the doc's timeline. During a
	// gesture only the first mutation adds a step; the rest fold their final state into that step.
	function recordEdit(id: string, label: string) {
		promoteTab(id)
		if (gestureActive) { if (!gesturePushed) { pushStep(id, label); gesturePushed = true } else updateStep(id) }
		else pushStep(id, label)
	}
	function addEnt(id: string, e: Ent) { ensureHist(id); const mid = modelIdOf(id); const en = e.layer ? e : { ...e, layer: layerUI.active }; setMdlEntsOf(mid, [...mdlEntsOf(mid), en]); recordEdit(id, 'Add ' + en.type) }
	function updateEnt(id: string, e: Ent) { ensureHist(id); const mid = modelIdOf(id); setMdlEntsOf(mid, mdlEntsOf(mid).map(x => x.id === e.id ? e : x)); recordEdit(id, 'Edit ' + e.type) }
	function deleteEnts(id: string, ids: string[]) {
		if (!ids.length) return
		ensureHist(id)
		const mid = modelIdOf(id), rm = new Set(ids)
		setMdlEntsOf(mid, mdlEntsOf(mid).filter(e => !rm.has(e.id)))
		setSel(id, [])
		recordEdit(id, 'Delete')
	}
	function deleteSelection() { const a2 = active; if (a2) deleteEnts(a2.id, selOf(a2.id)) }

	// ── clipboard + grouping ──
	let clipboard: Ent[] = []   // snapshots; persists across tabs
	let pasteN = 0, entSeq = 0
	const newId = () => 'x' + Date.now().toString(36) + (entSeq++)
	function copyEnts(id: string, ids: string[]) { const s = new Set(ids); clipboard = mdlEntsOf(modelIdOf(id)).filter(e => s.has(e.id)).map(e => $state.snapshot(e) as Ent); pasteN = 0 }
	function cutEnts(id: string, ids: string[]) { copyEnts(id, ids); deleteEnts(id, ids) }
	function pasteEnts(id?: string) {
		if (!clipboard.length || !id) return
		pasteN++
		const off = 10 * pasteN, gidMap = new Map<string, string>()
		const copies = clipboard.map(e => {
			let gid = e.groupId
			if (gid) { if (!gidMap.has(gid)) gidMap.set(gid, newId()); gid = gidMap.get(gid) }
			return { ...translate(e, off, off), id: newId(), groupId: gid }
		})
		beginGesture(); copies.forEach(c => addEnt(id, c)); endGesture()
		setSel(id, copies.map(c => c.id))
	}
	function groupEnts(id: string, ids: string[]) {
		if (ids.length < 2) return
		ensureHist(id); const mid = modelIdOf(id), gid = newId(), s = new Set(ids)
		setMdlEntsOf(mid, mdlEntsOf(mid).map(e => s.has(e.id) ? { ...e, groupId: gid } : e))
		recordEdit(id, 'Group')
	}
	function ungroupEnts(id: string, ids: string[]) {
		ensureHist(id); const mid = modelIdOf(id), s = new Set(ids)
		setMdlEntsOf(mid, mdlEntsOf(mid).map(e => s.has(e.id) ? { ...e, groupId: undefined } : e))
		recordEdit(id, 'Ungroup')
	}
	// Draw order = array position (later = painted on top). Reorder the selection within the doc's
	// array; front/back jump to the ends, forward/backward step past one non-selected neighbour.
	function reorderEnts(id: string, ids: string[], op: 'front' | 'back' | 'forward' | 'backward') {
		const mid = modelIdOf(id), arr = mdlEntsOf(mid), s = new Set(ids)
		if (!ids.length || !arr.some(e => s.has(e.id))) return
		ensureHist(id)
		let next: Ent[]
		if (op === 'front' || op === 'back') {
			const moved = arr.filter(e => s.has(e.id)), rest = arr.filter(e => !s.has(e.id))
			next = op === 'front' ? [...rest, ...moved] : [...moved, ...rest]
		} else {
			next = [...arr]
			if (op === 'forward') { for (let i = next.length - 2; i >= 0; i--) if (s.has(next[i].id) && !s.has(next[i + 1].id)) [next[i], next[i + 1]] = [next[i + 1], next[i]] }
			else { for (let i = 1; i < next.length; i++) if (s.has(next[i].id) && !s.has(next[i - 1].id)) [next[i], next[i - 1]] = [next[i - 1], next[i]] }
		}
		setMdlEntsOf(mid, next)
		recordEdit(id, 'Reorder')
	}

	// ── undo / redo / history / revisions ──
	// Per-doc LINEAR timeline with a pointer (not two stacks) so the change log can show future
	// (undone) steps and jump to any point. steps[0] is the baseline; each step snapshots the doc's
	// entities AFTER that edit; ptr = the current step. Memory ≈ entities × up to 100 steps (mock; a
	// real tool should be command/inverse-op based).
	type Snap = Ent[]   // a revision snapshots the model's entities (shared across all views)
	// Each step also carries a snapshot of the shared 3D MODEL, so undo/redo restores model edits
	// (move/resize prisms) alongside entity edits on the same timeline. The model is global (shared
	// across docs), so it's captured on every step in whatever doc is active — a model edit made in
	// another tab isn't on this doc's timeline (a known mock limitation; a global model history is the
	// real fix). Entity-only edits capture the unchanged model, keeping ents + model consistent.
	// Entities + guides now live in the MODEL, so `model` (snapModels) captures them — no separate `snap`.
	// ONE global workspace timeline (B4). Entities/objects/guides/sections live in the shared models and
	// every step snapshots ALL models + ALL tabs' frames, so undo is a single linear stack (AutoCAD/Kestrel
	// style). Previously history was per-tab yet each step snapshotted all models, so an undo on one tab
	// silently reverted edits made on another. The `id` args below are kept only to mark that tab dirty.
	type HStep = { label: string; t: number; model: Model[]; frames: Record<string, SheetFrame[]> }
	let hist = $state<{ steps: HStep[]; ptr: number } | null>(null)
	let revisions = $state<{ name: string; note: string; snap: Snap; t: number }[]>([])
	const snapEnts = (): Snap => $state.snapshot(mdlEnts()) as Snap
	const snapAllFrames = (): Record<string, SheetFrame[]> => $state.snapshot(docFrames) as Record<string, SheetFrame[]>
	// Capture the baseline (pre-first-edit) state once, BEFORE anything is mutated.
	function ensureHist(_id?: string) {
		if (hist) return
		hist = { steps: [{ label: 'Start', t: Date.now(), model: snapModels(), frames: snapAllFrames() }], ptr: 0 }
	}
	function pushStep(id: string, label: string) {
		const t = tabs.find(x => x.id === id); if (t && !t.dirty) t.dirty = true   // any edit marks its tab dirty
		ensureHist(); const h = hist!
		const steps = h.steps.slice(0, h.ptr + 1)   // drop the redo tail (a new edit forks the future)
		steps.push({ label, t: Date.now(), model: snapModels(), frames: snapAllFrames() })
		while (steps.length > 100) steps.shift()
		hist = { steps, ptr: steps.length - 1 }
	}
	function updateStep(_id?: string) {   // fold a gesture's latest state into its already-open step
		const h = hist; if (!h) return
		const steps = h.steps.slice(); steps[h.ptr] = { ...steps[h.ptr], model: snapModels(), frames: snapAllFrames(), t: Date.now() }
		hist = { ...h, steps }
	}
	function applyPtr() {
		const h = hist; if (!h) return
		setModels(h.steps[h.ptr].model)   // restore all models (entities + guides + sections + 3D objects)
		docFrames = $state.snapshot(h.steps[h.ptr].frames) as Record<string, SheetFrame[]>   // restore every tab's frames
	}
	function undo() { const h = hist; if (!h || h.ptr <= 0) return; hist = { ...h, ptr: h.ptr - 1 }; applyPtr() }
	function redo() { const h = hist; if (!h || h.ptr >= h.steps.length - 1) return; hist = { ...h, ptr: h.ptr + 1 }; applyPtr() }
	function jumpHistory(i: number) { const h = hist; if (!h || i < 0 || i >= h.steps.length || i === h.ptr) return; hist = { ...h, ptr: i }; applyPtr() }
	// Workspace change log, newest first, tagged past / current / future (undone).
	let changeLog = $derived.by(() => {
		const h = hist
		if (!h) return [] as { label: string; t: number; i: number; kind: 'past' | 'current' | 'future' }[]
		return h.steps.map((s, i) => ({ label: s.label, t: s.t, i, kind: (i === h.ptr ? 'current' : i > h.ptr ? 'future' : 'past') as 'past' | 'current' | 'future' })).reverse()
	})
	// Absolute date for the titleblock — the latest revision's date, else today (mock).
	const fmtDate = (t?: number) => new Date(t ?? Date.now()).toLocaleDateString('en-GB', { day: '2-digit', month: 'short', year: 'numeric' })
	let revSeq = 0
	function makeRevision() {
		revisions = [{ name: 'Rev ' + String.fromCharCode(67 + revSeq++), note: '', snap: snapEnts(), t: Date.now() }, ...revisions]
	}
	// Restore only the CURRENT tab's doc from the revision (not every doc). $state.snapshot unwraps
	// the proxy (the snap lives inside the $state revisions array); structuredClone would throw on it.
	function restoreRevision(snap: Snap) {
		const id = panes[focused]?.activeId; if (!id) return
		ensureHist(id)
		setMdlEntsOf(modelIdOf(id), $state.snapshot(snap) as Ent[])
		recordEdit(id, 'Restore revision')
	}
	function setSel(id: string, ids: string[]) { docSel = { ...docSel, [id]: ids }; if (ids.length) treeNode = null }
	function setView(paneId: string, viewId: string, proj: Proj, v: View) { docView = { ...docView, [vkey(paneId, viewId, proj)]: v } }
	// Selected entities of the focused document (for the Properties panel).
	let selEnts = $derived.by(() => {
		const a = tabs.find(t => t.id === panes[focused]?.activeId); if (!a) return []
		const ids = new Set(docSel[a.id] ?? [])
		return mdlEnts().filter(e => ids.has(e.id))
	})
	// The single selected 3D-model object (Properties panel edits it straight on the store, with undo).
	let selModelObj = $derived(modelSel.length === 1 ? (modelById(activeMid())?.objects.find(o => o.id === modelSel[0]) ?? null) : null)
	// Selecting a model object (plan / elevation / 3D pick) shows the Properties tab so its props are visible.
	$effect(() => { if (modelSel.length) { rightTab = 'props'; rightOpen = true } })
	// Selecting a sheet viewport frame likewise shows its Properties.
	$effect(() => { if (selFrame) { rightTab = 'props'; rightOpen = true } })
	// Exit an image calibration mode when its image is no longer the (single) selection.
	$effect(() => { if (imgEdit.id && !(selEnts.length === 1 && selEnts[0].id === imgEdit.id)) clearImgMode() })
	function updateModelObj(patch: Record<string, unknown>) {
		const o = selModelObj, id = panes[focused]?.activeId; if (!o || !id) return
		beginGesture(); Object.assign(o, patch); modelEdit(id); endGesture()   // one undo step (baseline pre-change)
	}
	function deleteModelObj() {
		const o = selModelObj, id = panes[focused]?.activeId, m = modelById(activeMid()); if (!o || !m || !id) return
		beginGesture(); m.objects = m.objects.filter(x => x.id !== o.id); modelEdit(id); endGesture()
		modelSel.splice(0, modelSel.length)
	}
	// Per-segment override edit (wall/conduit) with undo.
	function updateModelSeg(segIdx: number, patch: Record<string, unknown>) {
		const o = selModelObj as { segments?: Record<string, unknown>[] } | null, id = panes[focused]?.activeId
		if (!o?.segments?.[segIdx] || !id) return
		beginGesture(); Object.assign(o.segments[segIdx], patch); modelEdit(id); endGesture()
	}
	// Free only SESSION/VIEW state for a closed or reused TAB. DOCUMENT state (docFrames/docPaper/docScale,
	// keyed by DRAWING id) is KEPT — so closing a tab never destroys the page and reopening it restores the
	// frames/paper/scale (B6). Must run while the tab still exists in `tabs` (so framesOf resolves the did).
	function dropDoc(id: string) {
		const frameIds = framesOf(id).map((f) => f.id)
		const ids = new Set<string>([id, ...frameIds])            // this tab + its viewport frames
		const mine = (k: string) => ids.has(k.split(':')[1])       // key's viewId segment (pane:viewId[:proj]) belongs here
		const ds = { ...docSel }; delete ds[id]; docSel = ds       // selection (entities per tab)
		const dv = { ...docView }; for (const k of Object.keys(dv)) if (k === id || mine(k)) delete dv[k]; docView = dv        // pan/zoom
		const dp = { ...docProj }; for (const k of Object.keys(dp)) if (k === id || mine(k)) delete dp[k]; docProj = dp        // per-pane projection
		const dorb = { ...docOrbit }; for (const k of Object.keys(dorb)) if (mine(k)) delete dorb[k]; docOrbit = dorb          // iso orbit
		if (selSection === id) selSection = null
		if (selFrame && ids.has(selFrame)) selFrame = null
		deactivateVp(id); for (const fid of frameIds) deactivateVp(fid)   // reopened tab starts deactivated
	}

	function openTab(id: string, pane = focused) {
		const p = panes[pane]; if (!p) return
		p.activeId = id; focused = pane   // selection now lives per doc, so it's preserved
	}
	function addTab(kind: Kind = 'plan', title?: string) {
		const id = 't' + ++seq
		tabs = [...tabs, { id, title: title ?? `Untitled ${seq}`, kind, dirty: false }]
		if (panes[focused]) panes[focused].activeId = id
	}
	function closeTab(id: string, e?: Event) {
		e?.stopPropagation()
		const i = tabs.findIndex(t => t.id === id); if (i < 0) return
		dropDoc(id)   // BEFORE removing the tab, so framesOf resolves its drawing id; document state is kept (B6)
		tabs = tabs.filter(t => t.id !== id)
		if (previewId === id) previewId = null
		// Point any pane that showed this tab at a neighbour, or '' → the "No page open"
		// empty state (don't auto-spawn an Untitled tab on the last close).
		const fallback = tabs[Math.max(0, i - 1)]?.id ?? ''
		for (const p of panes) if (p.activeId === id) p.activeId = fallback
	}
	// Vertical split: open a second pane showing a different tab; toggle focus if already split.
	function splitVertical() {
		if (panes.length >= 2) { focused = 1; return }
		// Mirror the current pane into the split: same active tab + layout, so it opens as a
		// duplicate view you then diverge (change projection/tab in one side).
		const src = panes[0]
		panes = [...panes, { id: 'p' + ++paneSeq, activeId: src.activeId, tool: 'Select', layout: src.layout }]
		focused = 1; splitFrac = 0.5
		tick().then(() => { fitPane(0); fitPane(1) })   // both panes narrowed → refit their sheets
	}
	function closePane(idx: number) {
		if (panes.length < 2) return
		panes = panes.filter((_, i) => i !== idx)
		focused = 0
		tick().then(() => fitPane(0))
	}
	function startSplitDrag(e: PointerEvent) {
		e.preventDefault()
		const area = (e.currentTarget as HTMLElement).parentElement!.getBoundingClientRect()
		const move = (ev: PointerEvent) => { splitFrac = Math.min(0.8, Math.max(0.2, (ev.clientX - area.left) / area.width)) }
		const up = () => { window.removeEventListener('pointermove', move); window.removeEventListener('pointerup', up) }
		window.addEventListener('pointermove', move); window.addEventListener('pointerup', up)
	}

	// Overflow "all pages" dropdown on the tab strip — reaches tabs scrolled off-screen.
	let tabMenuPane = $state<number | null>(null)
	function pickFromMenu(id: string, pane: number) {
		openTab(id, pane); tabMenuPane = null
		setTimeout(() => document.querySelectorAll('.pane')[pane]?.querySelector('.tab.active')?.scrollIntoView({ inline: 'nearest', block: 'nearest' }), 0)
	}

	// Sidebars
	let leftOpen = $state(true)
	let rightOpen = $state(true)
	let rightTab = $state<'layers' | 'props' | 'history'>('layers')   // right sidebar tabs

	// Menubar action (the menu lives in parts/Menubar.svelte)
	function menuAction(item: string) {
		if (item === 'New Page') addTab()
		else if (item === 'Toggle Left Panel') leftOpen = !leftOpen
		else if (item === 'Toggle Right Panel') rightOpen = !rightOpen
		else if (item === 'Fit') navFit()
		else if (item === 'Zoom In') navZoom(1.25)
		else if (item === 'Zoom Out') navZoom(0.8)
		else if (item === 'Split Editor') splitVertical()
		else if (item === 'Unsplit') closePane(1)
		else if (item === 'Print…') window.print()
		else if (item === 'Undo') undo()
		else if (item === 'Redo') redo()
		else if (item === 'Image…') importImage()
		else if (item === 'Text') { if (active) focusTool('Text') }
		else if (item === 'Dimension') { if (active) focusTool('Dimension') }
		// everything else is a mock no-op
	}
	function focusTool(t: string) { const p = panes[focused]; if (p) p.tool = t }
	// Import an IMAGE as a background: read it as a data-URL, size the placement rect to its aspect ratio,
	// and add it as an 'image' entity on the ACTIVE layer (select a Background layer first to group it).
	// Mock: the data-URL lives in the entity; a real backend would upload + store a fileId (§4).
	// Place an image (by data-URL or URL) as a background on the active layer, sized to its aspect ratio at
	// the plan centre; imports default to aspect-locked. Returns false if there's no drawing open.
	function addImage(src: string): boolean {
		const id = panes[focused]?.activeId
		if (!id) { toast('Open a drawing first, then Insert › Image…'); return false }
		const img = new Image()
		const place = (aspect: number) => {
			const cx = 14000, cy = 8750, w = 9000, h = w * aspect
			addEnt(id, { id: newId(), type: 'image', a: [Math.round(cx - w / 2), Math.round(cy - h / 2)], b: [Math.round(cx + w / 2), Math.round(cy + h / 2)], src, plane: 'plan', lockAspect: true })
			const mn = modelById(modelIdOf(id))?.name ?? 'the model'
			toast(`Image added to ${mn} on layer “${layerById(layerUI.active)?.name ?? '—'}”. Set its scale/crop in Properties.`)
		}
		img.onload = () => place((img.naturalHeight || 700) / (img.naturalWidth || 1000))
		img.onerror = () => place(0.7)
		img.src = src
		return true
	}
	function importImage() {
		if (!panes[focused]?.activeId) { toast('Open a drawing first, then Insert › Image…'); return }
		const input = document.createElement('input')
		input.type = 'file'; input.accept = 'image/*'
		input.onchange = () => {
			const file = input.files?.[0]; if (!file) return
			const reader = new FileReader()
			reader.onload = () => addImage(String(reader.result))
			reader.readAsDataURL(file)
		}
		input.click()
	}
	// DEV-only test hook: `window.__pagesAddImage('/trump-juvenile.jpg')` injects a real image into the
	// running app's model (the native file picker can't be automation-driven). Harmless; dev builds only.
	if (import.meta.env.DEV && typeof window !== 'undefined') (window as unknown as { __pagesAddImage?: (u: string) => void }).__pagesAddImage = (u: string) => addImage(u)

	// Drawing Navigator (left) → open the picked drawing/view as a tab (focus if already open).
	// VSCode-style preview tabs: a single click opens a shared, italic PREVIEW tab that the next
	// single click reuses; a double click (or editing the doc) PROMOTES it to a kept tab.
	let previewId = $state<string | null>(null)
	function promoteTab(id: string) {
		const t = tabs.find(x => x.id === id)
		if (t?.preview) t.preview = false
		if (previewId === id) previewId = null
	}
	function openDrawing(d: { title: string; kind: Kind; preview?: boolean }) {
		const existing = tabs.find(t => t.title === d.title)
		if (existing) { if (!d.preview) promoteTab(existing.id); openTab(existing.id); return }
		if (d.preview) {
			const pv = tabs.find(t => t.id === previewId)
			if (pv) { pv.title = d.title; pv.kind = d.kind; dropDoc(pv.id); openTab(pv.id); return }   // reuse the preview slot
			const id = 't' + ++seq
			tabs = [...tabs, { id, title: d.title, kind: d.kind, dirty: false, preview: true }]
			previewId = id
			if (panes[focused]) panes[focused].activeId = id
		} else {
			addTab(d.kind, d.title)
		}
	}
	// A place/label in the tree (project, building, floor, …) → edit its props in the right panel.
	let treeNode = $state<{ id: string; label: string; kind: string } | null>(null)
	function selectNode(n: { id: string; label: string; kind: string }) {
		if (active) setSel(active.id, [])   // clear entity selection so node props show
		treeNode = n; rightTab = 'props'; rightOpen = true
	}
	// A viewport FRAME selected in paper space (PaperPage) → edit its props in the panel.
	let viewportSel = $state<FrameSel | null>(null)
	function onFrame(f: FrameSel | null) {
		viewportSel = f
		if (f) { treeNode = null; rightTab = 'props'; rightOpen = true }   // most-recent selection wins
	}

	// ── top-bar drawing-set selectors (mock) + Ctrl-K command palette ──
	const PACKAGES = ['Concept Design', 'Schematic Design', 'Detailed Design', 'Shop Drawings', 'As Built']
	const VERSIONS = ['v3', 'v2', 'v1']
	const REVISIONS = ['A', 'B', 'C', 'D']
	let pkg = $state('Detailed Design'), ver = $state('v3'), rev = $state('B')
	let paletteOpen = $state(false)
	type PItem = { title: string; kind: 'plan' | 'sheet' | 'elevation' | 'place'; path?: string }
	const paletteItems: PItem[] = [
		{ title: '33F — Floorplan', kind: 'plan', path: 'Hibiya · 33F' },
		{ title: '33F — High Level Outlets', kind: 'sheet', path: 'Hibiya · 33F' },
		{ title: '33F — Low Level Outlets', kind: 'sheet', path: 'Hibiya · 33F' },
		{ title: '33F — Trunk Routes', kind: 'sheet', path: 'Hibiya · 33F' },
		{ title: 'Zone 3303 — Outlets', kind: 'sheet', path: 'Hibiya · 33F · Zone 3303' },
		{ title: 'IDF1 — Rack Elevation', kind: 'elevation', path: 'Hibiya · 33F · Zone 3303' },
		{ title: 'Zone 3303', kind: 'place', path: 'Hibiya · 33F' },
		{ title: 'IDF1', kind: 'place', path: 'Hibiya · 33F · Zone 3303' },
		{ title: '30F — Floorplan', kind: 'plan', path: 'Hibiya · 30F' },
		{ title: 'Office 1201 — Outlets', kind: 'sheet', path: 'Shinmaru · 18F' },
	]
	function pickPalette(i: PItem) { if (i.kind !== 'place') openDrawing({ title: i.title, kind: i.kind, preview: false }) }
	function onGlobalKey(e: KeyboardEvent) {
		const mod = e.ctrlKey || e.metaKey
		const tag = (e.target as HTMLElement)?.tagName
		if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return   // don't hijack field editing
		if (mod && (e.key === 'k' || e.key === 'K')) {
			// Capture phase + stopImmediatePropagation so the app-wide Ctrl-K palette doesn't
			// also open on this page (it left a faded backdrop behind ours).
			e.preventDefault(); e.stopImmediatePropagation(); paletteOpen = true
		} else if (mod && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); undo() }
		else if (mod && ((e.shiftKey && (e.key === 'z' || e.key === 'Z')) || e.key === 'y' || e.key === 'Y')) { e.preventDefault(); redo() }
		else if ((e.key === 'Delete' || e.key === 'Backspace') && selFrame && active && !activeVpOf(active.id)) { e.preventDefault(); deleteFrame(active.id, selFrame) }   // delete the selected viewport frame (paper space)
	}
	$effect(() => {   // capture phase — beats the +layout command palette on the Ctrl-K shortcut
		window.addEventListener('keydown', onGlobalKey, true)
		return () => window.removeEventListener('keydown', onGlobalKey, true)
	})
	let activeLayer = $derived(layerById(layerUI.active)?.name ?? '')   // the active layer's name (from the shared store)

	// Canvas · tools + pointer + zoom
	const TOOLS = [
		{ icon: 'k-select', name: 'Select' },
		{ icon: 'k-line', name: 'Line' },
		{ icon: 'rectangle', name: 'Rectangle' },
		{ icon: 'circle', name: 'Ellipse' },
		{ icon: 'box', name: 'Box' },
		{ icon: 'waypoints', name: 'Wall' },
		{ icon: 'square', name: 'Furniture' },
		{ icon: 'route', name: 'Trunk' },
		{ icon: 'rows', name: 'Pipe' },
		{ icon: 'rect', name: 'Opening' },
		{ icon: 'scan', name: 'Section' },
		{ icon: 'dimension', name: 'Dimension' },
		{ icon: 'k-text', name: 'Text' },
		{ icon: 'ruler', name: 'Guide' },       // drop an alignment guide (sets the depth plane across views)
		{ icon: 'panels', name: 'Viewport' },   // paper-space: drag on the sheet to add a viewport frame
	]
	const iconOf = (name: string) => TOOLS.find((t) => t.name === name)?.icon ?? 'square'
	// The tool strip groups related tools into ONE button with a fly-out (hover to reveal): the button
	// shows + re-activates the group's LAST-USED tool, the fly-out switches variants. Singles render as-is.
	type StripItem = { tool: string } | { group: string; label: string; members: string[] }
	const STRIP: StripItem[] = [
		{ tool: 'Select' },
		{ tool: 'Line' },
		{ group: 'shapes', label: 'Shapes', members: ['Rectangle', 'Ellipse', 'Box'] },   // 2D/footprint draws
		{ group: 'conduits', label: 'Conduits', members: ['Wall', 'Trunk', 'Pipe'] },      // node/segment graph tools
		{ tool: 'Furniture' },
		{ tool: 'Opening' },
		{ tool: 'Section' },
		{ tool: 'Dimension' },
		{ tool: 'Text' },
		{ group: 'guide', label: 'Guide', members: [] },   // special: fly-out picks H / V orientation (touch)
		{ tool: 'Viewport' },
	]
	// Last-used tool per group (the button re-activates this on a plain click). Seeded to the first member.
	let groupTool = $state<Record<string, string>>({ shapes: 'Rectangle', conduits: 'Wall' })
	// Which tool-group fly-out is TAP-opened (touch has no hover). Cleared by a press outside any `.grp`.
	let openGroup = $state<string | null>(null)
	$effect(() => {
		const h = (e: PointerEvent) => { if (!(e.target as Element)?.closest?.('.grp')) openGroup = null }
		window.addEventListener('pointerdown', h, true)
		return () => window.removeEventListener('pointerdown', h, true)
	})
	// World (model-unit) coords under the cursor, from the active viewport (status bar shows mm), and
	// the focused pane's tool prompt / inline-edit help (rendered at the pane bottom-centre).
	let worldXY = $state<{ x: number; y: number } | null>(null)
	let statusText = $state('')
	function onCanvasMove() { /* coords now come from the viewport via oncoords */ }

	// ── canvas (paper-space) pan/zoom — this pane+tab's canvas view, CSS transform ──
	function canvasPan(pane: { id: string; activeId: string }, dx: number, dy: number) {
		const v = canvasViewOf(pane); setCanvasView(pane, { ...v, x: v.x + dx, y: v.y + dy })
	}
	function canvasZoom(pane: { id: string; activeId: string }, el: HTMLElement, f: number, clientX: number, clientY: number) {
		const r = el.getBoundingClientRect(), mx = clientX - r.left, my = clientY - r.top
		const v = canvasViewOf(pane), nz = Math.min(20, Math.max(0.1, v.zoom * f)), ratio = nz / v.zoom   // up to 2000%
		setCanvasView(pane, { x: mx - (mx - v.x) * ratio, y: my - (my - v.y) * ratio, zoom: nz })
	}
	// Nav toolbar / status zoom act on the active viewport if one is active, else the canvas.
	// Which zoom the wheel/nav actually acts on: the viewport CONTENT only when a viewport is active
	// AND "Pan content" is on; otherwise the canvas. (Was always reading the view zoom when active,
	// so the status bar stuck at 100% while the wheel zoomed the canvas.)
	const zoomsContent = (id?: string) => isVpActive(id) && navContent
	// The projection of a pane's active CONTENT view (a model-layout tab; sheets zoom the canvas, not this).
	const activeProj = (p: { id: string; activeId: string }) => projOf(p, tabs.find((t) => t.id === p.activeId) ?? null)
	let dispZoom = $derived.by(() => {
		const p = panes[focused]; if (!p) return 100
		return Math.round((zoomsContent(p.activeId) ? viewOf(p.id, p.activeId, activeProj(p)).zoom : canvasViewOf(p).zoom) * 100)
	})
	function navZoom(f: number) {
		const p = panes[focused]; if (!p) return
		if (zoomsContent(p.activeId)) { const pr = activeProj(p), v = viewOf(p.id, p.activeId, pr); setView(p.id, p.activeId, pr, { ...v, zoom: Math.min(20, Math.max(0.25, v.zoom * f)) }) }
		else { const v = canvasViewOf(p); setCanvasView(p, { ...v, zoom: Math.min(20, Math.max(0.1, v.zoom * f)) }) }
	}
	// Fit a specific pane: frame its sheet paper (centred, with margin) or reset a model view.
	function fitPane(idx: number) {
		const p = panes[idx]; if (!p) return
		const pr = activeProj(p)
		if (p.activeId) setOrbit(p.id, p.activeId, pr, DEFAULT_YAW, DEFAULT_PITCH)   // Fit also resets the 3D orbit
		if (isVpActive(p.activeId)) { setView(p.id, p.activeId, pr, { zoom: 1, x: 0, y: 0 }); return }
		const a2 = tabs.find(t => t.id === p.activeId)
		const canvas = canvasEls[idx]
		if (a2?.kind === 'sheet' && p.layout === 'sheet' && canvas && canvas.clientWidth > 50) {
			const r = canvas.getBoundingClientRect(), pd = paperDimsOf(p.activeId)
			const z = Math.min(r.width / pd.w, r.height / pd.h) * 0.9
			setCanvasView(p, { zoom: z, x: (r.width - pd.w * z) / 2, y: (r.height - pd.h * z) / 2 })
		} else {
			setCanvasView(p, { zoom: 1, x: 0, y: 0 })
		}
	}
	function navFit() { fitPane(focused) }
	// Refit every pane after the paper size/orientation changes (each pane may show a sheet).
	function refitAll() { tick().then(() => panes.forEach((_, i) => fitPane(i))) }

	// ── Print — on Ctrl+P / window.print(), an @media-print stylesheet shows ONLY the focused
	// sheet's paper at TRUE size: it hides all UI + the selection highlight and pins the paper to
	// the page. @page size + orientation come from the focused tab's paper; the paper is `zoom`ed by
	// (96/25.4)/PAPER_PX_PER_MM so its px size (= mm × PAPER_PX_PER_MM) prints at true mm — content
	// and titleblock scale together (CSS `zoom`, so text stays vector). Built at print time since
	// paper is per-tab. (The printer's own paper must match for a physical printer.)
	let savedSel: Record<string, string[]> | null = null
	const PRINT_ID = 'pages-print-style'
	function printCss(): string {
		const p = paperOf(panes[focused]?.activeId), [lw, lh] = PAPER_SIZES[p.size]
		const [mw, mh] = p.landscape ? [lw, lh] : [lh, lw]
		const zoom = (96 / 25.4) / PAPER_PX_PER_MM
		return `@page { size: ${mw}mm ${mh}mm; margin: 0; }
@media print {
	html, body { margin:0 !important; padding:0 !important; background:#fff !important; }
	.canvas-content { transform: none !important; }   /* fixed positions to the page, not a transformed ancestor */
	body * { visibility: hidden !important; }
	.print-target, .print-target * { visibility: visible !important; }
	.print-target { position: fixed !important; left:0 !important; top:0 !important; zoom:${zoom}; margin:0 !important; box-shadow:none !important; background:#fff !important; }
	.print-target .vp { border: none !important; box-shadow: none !important; }
	.print-target .vp-tag, .print-target .vp-badge { display: none !important; }
}`
	}
	function applyPrint() {
		savedSel = { ...docSel }
		docSel = {}   // selection is screen-only; clear so no highlight prints
		const style = document.getElementById(PRINT_ID); if (style) style.textContent = printCss()   // size for the focused paper
		const target = document.querySelector('.pane.focused .paper')
			?? document.querySelector('.pane.focused .vp')
		target?.classList.add('print-target')
		flushSync()   // apply the cleared selection to the DOM before the print snapshot
	}
	function removePrint() {
		document.querySelectorAll('.print-target').forEach(el => el.classList.remove('print-target'))
		if (savedSel) { docSel = savedSel; savedSel = null }
	}
	$effect(() => {
		let style = document.getElementById(PRINT_ID) as HTMLStyleElement | null
		if (!style) { style = document.createElement('style'); style.id = PRINT_ID; document.head.appendChild(style) }
		style.textContent = printCss()   // refreshed for the focused paper at print time (applyPrint)
		window.addEventListener('beforeprint', applyPrint)
		window.addEventListener('afterprint', removePrint)
		return () => {
			window.removeEventListener('beforeprint', applyPrint)
			window.removeEventListener('afterprint', removePrint)
			removePrint()
			document.getElementById(PRINT_ID)?.remove()
		}
	})

	// Fit each pane once on mount (layout is now per-pane; a pane refits itself when ITS layout or
	// projection changes — see the Full-size button + ViewCube — so the other pane is undisturbed).
	let mounted = false
	$effect(() => { if (!mounted) { mounted = true; refitAll() } })
	let toggles = $state<Record<string, boolean>>({ GRID: true, SNAP: true, ORTHO: false, OSNAP: true, LWT: false, CEN: false })
	// AutoCAD mode: wheel = zoom, draw = two clicks. Off = EOS: wheel = pan, draw = press-drag.
	let acadMode = $state(true)
	// Active-viewport content pan/zoom (Sheets-style): OFF by default, so wheel/drag over an
	// active viewport pans/zooms the CANVAS; toggle on to pan/zoom the model inside it.
	let navContent = $state(false)

	// Mock theme (scoped to .shell — demos both Kestrel looks, app untouched)
	let mockTheme = $state<'dark' | 'light'>('dark')
</script>

<!-- Title = the active drawing's name so Save-as-PDF gets a clean filename (no app name / hyphen). -->
<svelte:head><title>{active?.title ?? 'Pages'}</title></svelte:head>

<div class="shell" data-mock-theme={mockTheme}>
	<!-- inside .shell so the palette's CSS tokens (var(--panel)/--text/…) resolve -->
	{#if paletteOpen}<CommandPalette items={paletteItems} onpick={pickPalette} onclose={() => (paletteOpen = false)} />{/if}
	{#if tabMenuPane !== null}<button class="menu-backdrop" aria-label="Close menu" onclick={() => (tabMenuPane = null)}></button>{/if}

	<!-- Titlebar -->
	<header class="titlebar">
		<div class="tb-left">
			<a href="/projects/{page.params.pid}" class="tb-icon" title="Back to project"><Icon name="chevronLeft" size={15} /></a>
			<a href="/" class="tb-icon" title="Home"><Icon name="home" size={15} /></a>
			<span class="brand">EOS <b>Pages</b></span>
			<span class="mock-badge">MOCKUP</span>
		</div>
		<!-- Package + Version are drawing-SET context (apply to everything) → titlebar. The per-
		     drawing REVISION lives with the drawing, in the History panel. -->
		<div class="tb-selectors">
			<label class="tbsel"><span>PACKAGE</span><select bind:value={pkg}>{#each PACKAGES as p (p)}<option>{p}</option>{/each}</select></label>
			<label class="tbsel"><span>VERSION</span><select bind:value={ver}>{#each VERSIONS as v (v)}<option>{v}</option>{/each}</select></label>
		</div>
		<div class="tb-right">
			<button class="tb-search" title="Search drawings (Ctrl+K)" onclick={() => (paletteOpen = true)}>
				<Icon name="search" size={14} /> <span>Search…</span> <span class="tb-kbd">⌃K</span>
			</button>
			<button class="tb-icon" title="Toggle light / dark" onclick={(e) => { e.stopPropagation(); mockTheme = mockTheme === 'dark' ? 'light' : 'dark' }}>
				<Icon name={mockTheme === 'dark' ? 'moon' : 'sun'} size={15} />
			</button>
		</div>
	</header>

	<!-- Menubar -->
	<Menubar onaction={menuAction} />

	<!-- Body: left · editor-area (1–2 panes) · right -->
	<div class="body">

		<!-- Left sidebar: Drawing Navigator (location tree → drawings/views) -->
		{#if leftOpen}
			<aside class="side left">
				<DrawingNavigator onopen={openDrawing} oncollapse={() => (leftOpen = false)} onselectnode={selectNode}
					activeTitle={active?.title ?? ''} activeNode={treeNode?.id ?? ''} />
			</aside>
		{:else}
			<button class="rail left" title="Show panel" onclick={() => (leftOpen = true)}>
				<Icon name="chevronRight" size={13} /><Icon name="layers" size={15} />
			</button>
		{/if}

		<!-- Editor area: one pane, or two split vertically -->
		<div class="editor-area" class:split={panes.length === 2}>
			{#each panes as p, pi (p.id)}
				{@const a = tabs.find(t => t.id === p.activeId) ?? null}
				<!-- svelte-ignore a11y_no_static_element_interactions -->
				<section class="pane" class:focused={focused === pi}
					style:flex={panes.length === 1 ? '1 1 0' : `${pi === 0 ? splitFrac : 1 - splitFrac} 1 0`}
					onpointerdown={() => (focused = pi)}>

					<!-- this pane's tab strip -->
					<div class="tabbar">
						<!-- svelte-ignore a11y_no_static_element_interactions -->
						<div class="tabs" onwheel={(e) => { if (e.deltaY) { e.currentTarget.scrollLeft += e.deltaY; e.preventDefault() } }}>
							{#each tabs as t (t.id)}
								<div class="tab" class:active={t.id === p.activeId} class:preview={t.preview} onclick={() => openTab(t.id, pi)}
									ondblclick={() => promoteTab(t.id)}
									role="button" tabindex="0" onkeydown={(e) => { if (e.key === 'Enter') openTab(t.id, pi) }}>
									<Icon name={kindIcon[t.kind]} size={12} />
									<span class="tab-name">{t.title}</span>
									{#if t.dirty}<span class="dirty">•</span>{/if}
									<button class="tab-x" title="Close" onclick={(e) => closeTab(t.id, e)}><Icon name="close" size={11} /></button>
								</div>
							{/each}
						</div>
						<div class="tabbar-right">
							<button class="strip-btn" title="New page" onclick={() => { focused = pi; addTab() }}><Icon name="plus" size={14} /></button>
							<button class="strip-btn" title="All pages" onclick={(e) => { e.stopPropagation(); focused = pi; tabMenuPane = tabMenuPane === pi ? null : pi }}><Icon name="chevronDown" size={14} /></button>
							{#if panes.length === 1}
								<button class="strip-btn" title="Split editor right" onclick={splitVertical}><Icon name="panels" size={14} /></button>
							{:else}
								<button class="strip-btn" title="Close this split" onclick={() => closePane(pi)}><Icon name="close" size={14} /></button>
							{/if}
							{#if tabMenuPane === pi}
								<div class="tab-menu">
									{#each tabs as t (t.id)}
										<button class="tab-menu-item" class:on={t.id === p.activeId} onclick={() => pickFromMenu(t.id, pi)}>
											<Icon name={kindIcon[t.kind]} size={13} /><span class="grow txt">{t.title}</span>{#if t.dirty}<span class="dirty">•</span>{/if}
										</button>
									{/each}
									<div class="tab-menu-sep"></div>
									<button class="tab-menu-item" onclick={() => { tabMenuPane = null; focused = pi; addTab() }}>
										<Icon name="plus" size={13} /><span class="grow txt">New page</span>
									</button>
								</div>
							{/if}
						</div>
					</div>

					<!-- this pane's canvas -->
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<main class="canvas" bind:this={canvasEls[pi]} onpointermove={onCanvasMove}
						ondblclick={(e) => { if (a && !(e.target as Element).closest?.('.paper, button, .glass-bar, .vp-active-bar, .navtools, .floattools')) { const av = activeVpOf(a.id); if (av) deactivateVp(av); selFrame = null } }}
						use:panzoom={{ enabled: () => !!a, wheelZoom: () => acadMode, onpan: (dx, dy) => canvasPan(p, dx, dy), onzoom: (f, x, y, node) => canvasZoom(p, node, f, x, y) }}>
						<div class="floattools glass-bar" class:dim={a && !isVpActive(a.id)}>
							{#each STRIP as s (('tool' in s) ? s.tool : s.group)}
								<!-- strip: single tool, or a grouped fly-out (hover to reveal variants) -->
									{#if 'tool' in s}
										<button class="tool" class:on={p.tool === s.tool} title={s.tool} onclick={() => (p.tool = s.tool)}><Icon name={iconOf(s.tool)} size={16} /></button>
									{:else if s.group === 'guide'}
										<!-- Guide: pick Horizontal / Vertical from the fly-out (touch has no Shift) -->
										<div class="grp">
											<button class="tool grp-btn" class:on={p.tool === 'Guide'} title="Guide — {guideVert ? 'vertical' : 'horizontal'}" onclick={() => { p.tool = 'Guide'; openGroup = 'guide' }}>
												<Icon name={guideVert ? 'moveVertical' : 'moveHorizontal'} size={16} /><span class="grp-caret"></span>
											</button>
											<div class="flyout" class:open={openGroup === 'guide'}>
												<button class="tool" class:on={p.tool === 'Guide' && !guideVert} title="Horizontal guide" onclick={() => { p.tool = 'Guide'; guideVert = false; openGroup = null }}><Icon name="moveHorizontal" size={16} /></button>
												<button class="tool" class:on={p.tool === 'Guide' && guideVert} title="Vertical guide" onclick={() => { p.tool = 'Guide'; guideVert = true; openGroup = null }}><Icon name="moveVertical" size={16} /></button>
											</div>
										</div>
									{:else}
										{@const inGrp = s.members.includes(p.tool)}
										{@const cur = inGrp ? p.tool : groupTool[s.group]}
										<div class="grp">
											<button class="tool grp-btn" class:on={inGrp} title="{s.label} — {cur}" onclick={() => { p.tool = cur; openGroup = s.group }}>
												<Icon name={iconOf(cur)} size={16} /><span class="grp-caret"></span>
											</button>
											<div class="flyout" class:open={openGroup === s.group}>
												{#each s.members as m (m)}
													<button class="tool" class:on={p.tool === m} title={m} onclick={() => { p.tool = m; groupTool = { ...groupTool, [s.group]: m }; openGroup = null }}><Icon name={iconOf(m)} size={16} /></button>
												{/each}
											</div>
										</div>
									{/if}
							{/each}
						</div>
						<!-- Pane-level exit: fixed on screen (outside the zoomed content), so a viewport
						     can always be left even when zoomed right in and its own corner is off-screen. -->
						{#if a && activeVpOf(a.id)}
							{@const avId = activeVpOf(a.id)!}
							{@const avFrame = avId === a.id ? null : framesOf(a.id).find((f) => f.id === avId)}
							{@const avScale = avFrame ? avFrame.scale : scaleOf(a.id)}
							<div class="vp-active-bar glass-bar">
								<button class="vab-btn" onclick={() => deactivateVp(avId)} title="Exit viewport (Esc)">
									<Icon name="chevronLeft" size={14} /> Exit
								</button>
								<button class="vab-btn" class:on={navContent} onclick={() => (navContent = !navContent)}
									title="Pan/zoom the model inside the viewport (off = pan/zoom the sheet)">
									<Icon name="pan" size={14} /> Pan content
								</button>
								<!-- viewport scale (like the Sheets tool's per-view scale) — the primary's tab scale, or the active extra frame's own scale -->
								<label class="vab-scale" title="Drawing scale">
									<select value={avScale} onchange={(e) => { const s = (e.currentTarget as HTMLSelectElement).value; if (avFrame) updateFrame(a.id, avId, { scale: s }); else setScale(a.id, s); }}>
										{#if !SCALES.includes(avScale)}<option value={avScale}>{avScale}</option>{/if}
										{#each SCALES as s (s)}<option value={s}>{s}</option>{/each}
									</select>
								</label>
								<!-- full-size: only the primary viewport fills the pane (an extra frame is a fixed window) -->
								{#if !avFrame}
									<button class="vab-btn" class:on={p.layout === 'model'} onclick={() => { p.layout = p.layout === 'model' ? 'sheet' : 'model'; tick().then(() => fitPane(pi)) }}
										title="Full-size: fill the pane with the drawing (off = the paper sheet)">
										<Icon name={p.layout === 'model' ? 'panels' : 'expand'} size={14} /> Full-size
									</button>
								{/if}
							</div>
						{/if}
						{#key p.activeId}
							{@const cv = canvasViewOf(p)}
							<div class="canvas-content" style:transform="translate({cv.x}px, {cv.y}px) scale({cv.zoom})">
								{#if a?.kind === 'sheet' && p.layout === 'sheet'}
									<PaperPage title={a.title} tool={p.tool} scale={framesOf(a.id)[0]?.scale ?? scaleOf(a.id)} env={envFor(p)} pw={paperDimsOf(a.id).w} ph={paperDimsOf(a.id).h}
										sizeLabel="{paperOf(a.id).size} {paperOf(a.id).landscape ? 'L' : 'P'}" rev={rev} revDate={fmtDate(revisions[0]?.t)}
										entities={entsOf(a.id)} sel={selOf(a.id)} focused={focused === pi}
										entsForModel={entsForModel} tabModelId={a.modelId ?? FLOOR_MODEL_ID}
										sectionsForModel={sectionsForModel} selSection={selSection}
										frames={framesOf(a.id)} selFrame={selFrame} frameKind={(pr) => projKind(pr as Proj)}
										isFrameActive={(id) => isVpActive(id)} frameView={(id, proj) => viewOf(p.id, id, proj as Proj)} frameEnv={envFor(p)}
										frameOrbit={(id, proj) => orbitOf(p.id, id, proj as Proj)} makeFrameOn={(f) => vpOnFrame(a, p, f as SheetFrame)}
										onseed={(x, y, w, h) => seedFrame(a.id, x, y, w, h)}
										onaddframe={(x, y, w, h) => addFrame(a.id, x, y, w, h)}
										onframegeom={(id, g) => updateFrame(a.id, id, g)}
										onframecommit={() => commitFrame(a.id, 'Move viewport')}
										onselectframe={(id) => { selFrame = id; if (id) { treeNode = null; rightTab = 'props'; rightOpen = true } }}
										ondeactivate={() => { const av = activeVpOf(a.id); if (av) deactivateVp(av) }} />
								{:else if a}
									<!-- svelte-ignore a11y_no_static_element_interactions a11y_click_events_have_key_events -->
									<div class="vp-fill" ondblclick={() => deactivateVp(a.id)}>
										<Viewport kind={projKind(projOf(p, a))} label={a.title} tool={p.tool} scale={scaleOf(a.id)} env={envFor(p)} on={vpOn(a, p)} modelId={a.modelId ?? FLOOR_MODEL_ID}
											entities={entsOf(a.id)} sel={selOf(a.id)} view={viewOf(p.id, a.id, projOf(p, a))} active={isVpActive(a.id)} focused={focused === pi} clip={null} yaw={orbitOf(p.id, a.id, projOf(p, a)).yaw} pitch={orbitOf(p.id, a.id, projOf(p, a)).pitch}
											sections={projOf(p, a) === 'plan' ? sectionsForModel(a.modelId) : []} selSection={selSection} />
									</div>
								{:else}
									<div class="canvas-center">
										<Icon name="fileText" size={22} />
										<div class="cc-title">No page open</div>
										<div class="cc-sub">Pick a drawing from the sidebar, or</div>
										<button class="cc-new" onpointerdown={(e) => e.stopPropagation()} onclick={() => { focused = pi; addTab() }}><Icon name="plus" size={13} /> New page</button>
									</div>
								{/if}
							</div>
						{/key}
						<!-- Model-layout tabs (e.g. "3303 Floorplan", "Rack A Elevation") show the model name at the
						     top-centre of the canvas. Sheet layout has the titleblock + per-viewport bar instead. -->
						{#if a && !(a.kind === 'sheet' && p.layout === 'sheet')}
							<div class="model-name">{a.title}</div>
						{/if}
						<div class="navtools glass-bar">
							<button class="tool" title="Zoom in" onclick={() => navZoom(1.25)}><Icon name="zoomin" size={16} /></button>
							<button class="tool" title="Zoom out" onclick={() => navZoom(0.8)}><Icon name="zoomout" size={16} /></button>
							<button class="tool" title="Fit" onclick={() => navFit()}><Icon name="fit" size={16} /></button>
							<button class="tool" title="Pan (right-drag)"><Icon name="pan" size={16} /></button>
							{#if a && gizmoProj(p, a) === 'iso'}
								<button class="tool" title="Orbit — drag in the 3D view (Shift = 15° snap)"><Icon name="rotate3d" size={16} /></button>
							{/if}
						</div>
						{#if a}
							<!-- fixed-size view gizmos (ViewCube + WCS axes), screen space so they don't zoom -->
							<!-- ViewCube re-orients the view's content in place (the sheet's paper viewport too) — it
							     no longer flips a sheet to fullscreen. Use the Full-size button for that. -->
							{@const gvp = activeVpOf(a.id) ?? a.id}
							{@const gorb = orbitOf(p.id, gvp, gizmoProj(p, a))}
							<ViewGizmos projection={gizmoProj(p, a)} yaw={gorb.yaw} pitch={gorb.pitch}
								onset={(proj) => gizmoSet(p, a, proj)} />
						{/if}
						<!-- tool prompt / inline-edit help, pinned to the pane bottom-centre (screen space) -->
						{#if focused === pi && statusText}<div class="pane-status">{statusText}</div>{/if}
					</main>
				</section>
				{#if panes.length === 2 && pi === 0}
					<!-- svelte-ignore a11y_no_static_element_interactions -->
					<div class="vsplitter" title="Drag to resize" onpointerdown={startSplitDrag}></div>
				{/if}
			{/each}
		</div>

		<!-- Right sidebar -->
		{#if rightOpen}
			<aside class="side right">
				<div class="side-head">
					<button class="side-collapse" title="Collapse" onclick={() => (rightOpen = false)}><Icon name="chevronRight" size={13} /></button>
					<div class="side-tabs rt">
						<button class:on={rightTab === 'layers'} onclick={() => (rightTab = 'layers')}>Layers</button>
						<button class:on={rightTab === 'props'} onclick={() => (rightTab = 'props')}>Props</button>
						<button class:on={rightTab === 'history'} onclick={() => (rightTab = 'history')}>History</button>
					</div>
				</div>
				{#if rightTab === 'layers'}
					<LayersPanel />
				{:else if rightTab === 'props'}
					<PropertiesPanel ents={selEnts} onupdate={(e) => { if (active) updateEnt(active.id, e) }}
						onarrange={(op) => { if (active) reorderEnts(active.id, selOf(active.id), op) }}
						pageTitle={active?.title ?? ''} pageKind={active?.kind ?? ''} {activeLayer} node={treeNode} viewport={viewportSel}
						modelObj={selModelObj} modelLayers={modelById(activeMid())?.layers ?? []} onmodelupdate={updateModelObj} onmodeldelete={deleteModelObj} onmodelseg={updateModelSeg}
						frameObj={selFrameObj}
						modelList={models.map((m) => ({ id: m.id, name: m.name }))}
						activeFrameId={active && activeVpOf(active.id) !== active.id ? (activeVpOf(active.id) ?? undefined) : undefined}
						onframeupdate={(patch) => { if (active && selFrame) { ensureHist(active.id); updateFrame(active.id, selFrame, patch as Partial<SheetFrame>); commitFrame(active.id, 'Edit viewport') } }}
						onframedelete={() => { if (active && selFrame) deleteFrame(active.id, selFrame) }} />
				{:else}
					<HistoryPanel log={changeLog} {revisions}
						onnote={(i, note) => (revisions[i].note = note)} onjump={jumpHistory}
						onundo={undo} onredo={redo} onnewrevision={makeRevision} onrestore={(s) => restoreRevision(s as Snap)} />
				{/if}
			</aside>
		{:else}
			<button class="rail right" title="Show panel" onclick={() => (rightOpen = true)}>
				<Icon name="chevronLeft" size={13} /><Icon name="settings" size={15} />
			</button>
		{/if}
	</div>

	<!-- Status bar -->
	<StatusBar bind:toggles bind:acadMode
		paperSize={paperOf(panes[focused]?.activeId).size} paperLandscape={paperOf(panes[focused]?.activeId).landscape}
		onpapersize={(s) => setPaper(panes[focused]?.activeId, { size: s })}
		onorient={(l) => setPaper(panes[focused]?.activeId, { landscape: l })}
		coords={worldXY} zoom={dispZoom} onzoom={navZoom} onfit={navFit} />
</div>

<style>
	/* Kestrel design tokens (scoped) — dark default, light override. */
	.shell {
		--bg:#18212d; --title:#131b26; --panel:#1b2532; --panel2:#202c3a; --tabbar:#212c3a;
		--canvas:#121c29; --hover:#2c3b4d; --active:#244852; --accent:#5ac6d2; --accent-dim:#304d58;
		--text:#dce4ed; --muted:#8b9aab; --faint:#63768b; --line:#344151; --line-soft:#2a3645; --input:#17212e;
		--danger:#ed8d92;
		height:100dvh; display:flex; flex-direction:column; overflow:hidden;
		background:var(--bg); color:var(--text);
		font-family:'Inter','Segoe UI',system-ui,-apple-system,sans-serif; font-size:12px;
	}
	.shell[data-mock-theme='light'] {
		--bg:#e3e9ef; --title:#f7f9fb; --panel:#f5f7fa; --panel2:#edf1f6; --tabbar:#f3f6f9;
		--canvas:#edf2f6; --hover:#e3ebf3; --active:#d6eef2; --accent:#157a8b; --accent-dim:#b9dce4;
		--text:#23374a; --muted:#697e91; --faint:#8191a2; --line:#ced8e2; --line-soft:#e0e6ed; --input:#fff;
		--danger:#bd4951;
	}
	.shell :global(button) { cursor:pointer; color:inherit; }

	/* Titlebar */
	.titlebar { height:36px; flex:0 0 auto; display:flex; align-items:center; justify-content:space-between;
		background:var(--title); border-bottom:1px solid var(--line-soft); padding:0 8px; }
	.tb-left, .tb-right { display:flex; align-items:center; gap:4px; }
	.tb-icon { display:inline-flex; align-items:center; justify-content:center; width:26px; height:24px;
		border-radius:4px; color:var(--muted); }
	.tb-icon:hover { background:var(--hover); color:var(--text); }
	.brand { margin-left:6px; letter-spacing:.02em; color:var(--muted); }
	.brand b { color:var(--text); font-weight:600; }
	.mock-badge { margin-left:8px; font-size:8px; letter-spacing:.1em; color:var(--accent);
		border:1px solid var(--accent-dim); border-radius:3px; padding:1px 5px; }
	/* Drawing-set selectors (package / version / revision) */
	.tb-selectors { display:flex; align-items:center; gap:10px; }
	.tbsel { display:flex; flex-direction:column; gap:1px; }
	.tbsel span { font-size:7px; letter-spacing:.1em; color:var(--faint); padding-left:2px; }
	.tbsel select { background:var(--panel); color:var(--text); border:1px solid var(--line-soft); border-radius:5px;
		padding:2px 6px; font-size:12px; font-weight:600; }
	.tbsel select:hover { border-color:var(--line); }
	.tbsel select:focus { outline:none; border-color:var(--accent); }
	.tb-search { display:flex; align-items:center; gap:6px; padding:4px 9px; border-radius:6px; color:var(--muted);
		background:var(--panel); border:1px solid var(--line-soft); font-size:12px; }
	.tb-search:hover { background:var(--hover); color:var(--text); }
	.tb-search span:first-of-type { min-width:66px; text-align:left; }
	.tb-kbd { font-size:9px; color:var(--faint); border:1px solid var(--line); border-radius:3px; padding:0 4px; }

	/* Light mode: keep the titlebar dark (like EOS's slate-800 header), with
	   light text for contrast. Status bar deliberately left as the theme default. */
	.shell[data-mock-theme='light'] .titlebar { background:#1e293b; border-bottom-color:#0f172a; }
	.shell[data-mock-theme='light'] .titlebar .tb-icon { color:#94a3b8; }
	.shell[data-mock-theme='light'] .titlebar .tb-icon:hover { background:#334155; color:#fff; }
	.shell[data-mock-theme='light'] .titlebar .brand { color:#94a3b8; }
	.shell[data-mock-theme='light'] .titlebar .brand b { color:#f1f5f9; }
	.shell[data-mock-theme='light'] .titlebar .mock-badge { color:#5ac6d2; border-color:#3b556b; }
	.shell[data-mock-theme='light'] .titlebar .tbsel span { color:#64748b; }
	.shell[data-mock-theme='light'] .titlebar .tbsel select,
	.shell[data-mock-theme='light'] .titlebar .tb-search { background:#334155; color:#e2e8f0; border-color:#475569; }

	/* Menubar */
	.menu-backdrop { position:fixed; inset:0; z-index:40; background:none; border:none; }

	/* Tab bar */
	.tabbar { height:34px; flex:0 0 auto; display:flex; align-items:center; justify-content:space-between;
		background:var(--tabbar); border-bottom:1px solid var(--line); padding:0 6px; }
	.tabs { flex:1 1 auto; min-width:0; display:flex; align-items:stretch; gap:2px; height:100%;
		overflow-x:auto; scrollbar-width:none; -ms-overflow-style:none; }
	.tabs::-webkit-scrollbar { display:none; }
	.tab { position:relative; display:flex; align-items:center; gap:6px; padding:0 8px 0 10px; height:100%;
		border:none; background:none; color:var(--muted); border-top:2px solid transparent; white-space:nowrap;
		cursor:pointer; user-select:none; }
	.tab:hover { background:var(--hover); color:var(--text); }
	.tab.active { color:var(--text); background:var(--bg); border-top-color:var(--accent-dim); }
	/* The active tab's accent reads bright in the focused pane, dimmed in the other —
	   so focus shows through the tab indicator itself (no strip-wide bar over it). */
	.pane.focused .tab.active { border-top-color:var(--accent); }
	.tab-name { font-size:12px; }
	/* VSCode-style preview tab: italic label until promoted (double-click / edit). */
	.tab.preview .tab-name { font-style:italic; }
	.dirty { color:var(--accent); font-size:14px; line-height:0; }
	.tab-x { display:inline-flex; align-items:center; justify-content:center; width:16px; height:16px; border-radius:3px; color:var(--faint); background:none; border:none; }
	.tab-x:hover { background:var(--line); color:var(--text); }
	.tabbar-right { position:relative; z-index:46; flex:0 0 auto; display:flex; align-items:center; gap:1px; padding:0 2px; border-left:1px solid var(--line-soft); }
	.strip-btn { display:inline-flex; align-items:center; justify-content:center; width:26px; height:24px; border-radius:4px; color:var(--muted); background:none; border:none; }
	.strip-btn:hover { background:var(--hover); color:var(--text); }
	.tab-menu { position:absolute; top:100%; right:0; z-index:50; margin-top:2px; min-width:190px; max-height:60vh; overflow-y:auto;
		background:var(--panel); border:1px solid var(--line); border-radius:6px; box-shadow:0 15px 40px #0006; padding:4px; }
	.tab-menu-item { display:flex; align-items:center; gap:7px; width:100%; padding:5px 8px; border-radius:4px; color:var(--text); background:none; border:none; font-size:12px; text-align:left; }
	.tab-menu-item:hover { background:var(--hover); }
	.tab-menu-item.on { background:var(--active); }
	.tab-menu-sep { height:1px; background:var(--line-soft); margin:4px 6px; }

	/* Body */
	.body { flex:1 1 auto; display:flex; min-height:0; }

	/* Editor area — 1 pane, or 2 split vertically with a draggable divider */
	.editor-area { flex:1 1 auto; display:flex; min-width:0; }
	.pane { display:flex; flex-direction:column; min-width:0; min-height:0; }
	.vsplitter { flex:0 0 auto; width:5px; cursor:col-resize; background:var(--line); }
	.vsplitter:hover { background:var(--accent-dim); }

	/* Sidebars */
	.side { flex:0 0 auto; display:flex; flex-direction:column; background:var(--panel); min-height:0; }
	.side.left { width:220px; border-right:1px solid var(--line); }
	.side.right { width:250px; border-left:1px solid var(--line); }
	.side-head { display:flex; align-items:center; gap:6px; height:30px; padding:0 6px; border-bottom:1px solid var(--line-soft); }
	.side-tabs { display:flex; gap:2px; flex:1; }
	.side-tabs button { padding:3px 8px; font-size:11px; border-radius:4px; color:var(--muted); background:none; border:none; }
	.side-tabs button.on { background:var(--active); color:var(--text); }
	.side-collapse { display:inline-flex; align-items:center; justify-content:center; width:22px; height:22px; border-radius:4px; color:var(--muted); background:none; border:none; }
	.side-collapse:hover { background:var(--hover); color:var(--text); }
	.side-body { flex:1; overflow-y:auto; padding:5px; scrollbar-width:thin; scrollbar-color:var(--line) transparent; }
	.side-body::-webkit-scrollbar { width:9px; }
	.side-body::-webkit-scrollbar-track { background:transparent; }
	.side-body::-webkit-scrollbar-thumb { background:var(--line); border-radius:6px; border:3px solid transparent; background-clip:padding-box; }
	.side-body:hover::-webkit-scrollbar-thumb { background:var(--faint); background-clip:padding-box; }

	.grow { flex:1; } .txt { text-align:left; background:none; border:none; color:inherit; font-size:12px; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }

	.rail { flex:0 0 auto; width:28px; display:flex; flex-direction:column; align-items:center; gap:10px; padding-top:8px;
		background:var(--panel); color:var(--muted); border:none; }
	.rail.left { border-right:1px solid var(--line); } .rail.right { border-left:1px solid var(--line); }
	.rail:hover { background:var(--hover); color:var(--text); }

	/* Canvas */
	.canvas { position:relative; flex:1 1 auto; min-width:0; min-height:0; background:var(--canvas);
		background-image:radial-gradient(var(--line) 1px, transparent 1px); background-size:22px 22px;
		display:flex; align-items:center; justify-content:center; overflow:hidden;
		user-select:none; -webkit-user-select:none; }
	.canvas-center { display:flex; flex-direction:column; align-items:center; gap:6px; color:var(--faint); pointer-events:none; }
	.canvas-center :global(svg) { color:var(--faint); margin-bottom:2px; }
	.cc-title { font-size:15px; color:var(--muted); font-weight:600; }
	.cc-sub { font-size:12px; color:var(--faint); }
	.cc-new { pointer-events:auto; margin-top:6px; display:inline-flex; align-items:center; gap:6px; padding:6px 12px;
		font-size:12px; border-radius:6px; color:var(--text); background:var(--panel2); border:1px solid var(--line); }
	.cc-new:hover { background:var(--hover); border-color:var(--accent-dim); }
	.glass-bar { position:absolute; display:flex; gap:2px; padding:4px; border-radius:8px;
		background:color-mix(in srgb, var(--panel) 82%, transparent); border:1px solid var(--line-soft);
		backdrop-filter:blur(9px); -webkit-backdrop-filter:blur(9px); box-shadow:0 8px 30px #0004; }
	.canvas-content { position:absolute; inset:0; transform-origin:0 0; }
	.vp-fill { position:absolute; inset:0; padding:14px; }
	/* Tools/nav sit above the paper/viewport regardless of DOM order. */
	.floattools, .navtools { z-index:5; }
	.floattools { top:12px; left:12px; flex-direction:column; transition:opacity .15s; }
	.floattools.dim { opacity:.4; }
	.floattools.dim:hover { opacity:.85; }
	.navtools { bottom:12px; right:12px; flex-direction:column; }
	/* Pane-level status/help chip — screen space, so it stays put & readable at any zoom. */
	.pane-status { position:absolute; bottom:12px; left:50%; transform:translateX(-50%); z-index:6; white-space:nowrap;
		font-size:11px; color:var(--text); background:color-mix(in srgb, var(--panel) 88%, transparent);
		border:1px solid var(--line-soft); border-radius:6px; padding:3px 12px; pointer-events:none;
		backdrop-filter:blur(8px); -webkit-backdrop-filter:blur(8px); box-shadow:0 4px 16px #0004; }
	/* Model name/id, top-centre of a model-layout canvas (screen space, non-interactive). */
	.model-name { position:absolute; top:10px; left:50%; transform:translateX(-50%); z-index:6; white-space:nowrap;
		font-size:12px; font-weight:600; letter-spacing:.02em; color:var(--muted); pointer-events:none; user-select:none; }
	.vp-active-bar { top:12px; left:50%; transform:translateX(-50%); z-index:6; align-items:center; gap:2px; padding:3px; }
	.vab-btn { display:inline-flex; align-items:center; gap:5px; padding:5px 11px; min-height:30px; border-radius:6px;
		font-size:12px; font-weight:600; color:var(--muted); background:none; border:none; }
	.vab-btn:hover { background:var(--hover); color:var(--text); }
	.vab-btn.on { background:var(--active); color:var(--accent); }
	.vab-scale select { background:var(--panel2); color:var(--text); border:1px solid var(--line); border-radius:5px; padding:3px 6px; font-size:12px; font-weight:600; }
	.vab-scale select:focus { outline:none; border-color:var(--accent); }
	.tool { display:inline-flex; align-items:center; justify-content:center; width:30px; height:30px; border-radius:6px; color:var(--muted); background:none; border:none; }
	.tool:hover { background:var(--hover); color:var(--text); }
	.tool.on { background:var(--active); color:var(--accent); }
	/* Grouped tool: a button that re-activates the group's last-used tool + a hover fly-out of variants. */
	.grp { position:relative; display:flex; }
	.grp-btn { position:relative; }
	/* corner triangle marking a group (▟), lower-right of the icon */
	.grp-caret { position:absolute; right:3px; bottom:3px; width:0; height:0; border-left:4px solid transparent; border-top:4px solid transparent; border-right:4px solid currentColor; opacity:.55; }
	.flyout { position:absolute; left:100%; top:-4px; margin-left:6px; display:none; flex-direction:row; gap:2px; padding:4px;
		border-radius:8px; background:color-mix(in srgb, var(--panel) 92%, transparent); border:1px solid var(--line-soft);
		backdrop-filter:blur(9px); -webkit-backdrop-filter:blur(9px); box-shadow:0 8px 30px #0005; z-index:10; }
	/* invisible bridge over the gap so moving onto the fly-out doesn't drop the hover */
	.flyout::before { content:''; position:absolute; left:-8px; top:0; bottom:0; width:8px; }
	.grp:hover .flyout, .flyout.open { display:flex; }   /* hover (mouse) or tap-open (touch) */

</style>
