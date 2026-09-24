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
	import { tick } from 'svelte'
	import { page } from '$app/state'
	import { goto } from '$app/navigation'
	import PaperPage from './parts/PaperPage.svelte'
	import Pane from './parts/Pane.svelte'
	import { newId } from './ids'
	import { viewState } from './viewState.svelte'
	import { docs } from './doc.svelte'
	import { type Proj, type SheetFrame, type Kind, type Tab, type WorkPane, type View, type StripItem, type Workspace, SCALES, DIR_LABEL as PROJ_LABEL } from './types'
	import { PACKAGES, VERSIONS, REVISIONS, type PItem, PALETTE_ITEMS as paletteItems, navDrawingId } from './mock/data'
	import Viewport from './ui/Viewport.svelte'
	import type { VpOn } from './ui/vpTypes'
	import type { Editor } from './ui/editor'
	import DrawingNavigator from './parts/DrawingNavigator.svelte'
	import LayersPanel from './parts/LayersPanel.svelte'
	import PropertiesPanel from './parts/PropertiesPanel.svelte'
	import { activeLayerIn, isLayerHidden } from './layers.svelte'
	import { fitFrame } from './ui/frameFit'
	import { internImage } from './imageStore'
	import HistoryPanel from './parts/HistoryPanel.svelte'
	import StatusBar from './parts/StatusBar.svelte'
	import ViewGizmos from './parts/ViewGizmos.svelte'
	import Menubar from './parts/Menubar.svelte'
	import CommandPalette from './parts/CommandPalette.svelte'
	import OpenProjectDialog from './parts/OpenProjectDialog.svelte'
	import { panzoom } from './ui/panzoom'
	import { paperDims, scaleDenom, PAPER_PX_PER_MM, DEFAULT_MARGIN_MM, clampViewZoom, clampCanvasZoom, type PaperSize } from './constants'
	import { PRINT_ID, printCss, applyPrint, removePrint } from './printing'
	import { translate, type Ent, type ElevDir } from './ui/geometry'
	import { models, modelById, floorModelId, ensureFloorModel, FLOOR_MODEL_ID, snapModels, setModels, upsertModel, removeModels, modelForPlace } from './3dview/models.svelte'
	import { emptyFloor } from './mock/models'
	import { docToModel, sheetToPage, pageToSheet, nextFrameSeq } from './store/mappers'
	import { floorplanPlacement, pdfSrc, PDF_SRC } from './ui/render/pdfRaster.svelte'
	import { startBlocks } from './blocks.svelte'
	import { importOutletsInto, outletsDocIdFor, type OutletsDoc } from './store/outletsImport'
	import { normFloors } from './projectTree'
	import type { PageDoc } from './doc.svelte'
	import { getContext, untrack } from 'svelte'
	import type { Firestore } from '$lib'
	import { ProjectSource } from './projectData.svelte'
	import { findNodePath } from './projectTree'
	import type { Session as AuthSession } from '$lib'
	import { PagesStore } from './store/pagesStore.svelte'
	import { buildPlaceTree } from './store/placeTree'
	import { addPlace, updatePlace, movePlace, removePlace } from './store/places'
	import { describePlace } from './store/placeProps'
	import type { DropZone } from './parts/treeDrag.svelte'
	import { DEFAULT_YAW, DEFAULT_PITCH } from './3dview/projection'
	import type { Model, ModelId, ModelKind, Section } from './3dview/types'
	import { selStore } from './selStore.svelte'
	import { selOnly, selToggle, selClear, idsOfKind, singleOfKind, type Selection, type SelItem } from './ui/selection'
	import { deleteModelSel as meDeleteModelSel, deleteGraphNode as meDeleteGraphNode, deleteSection as meDeleteSection } from './ui/modelEdit'

	// Which pane (if any) has its viewport activated — groundwork for editing/CAD
	// tools inside a sheet's viewport. Null = no active viewport.
	// Which TAB docs have their viewport activated (keyed by tab id, not pane) — so activation is
	// remembered when you switch away and back to a view. Selection is per-VIEWPORT (selStore, R3 2a).
	// B31: a tab shown in a MODEL-layout pane is model space — always active (see `modelLayoutIds`).
	const isVpActive = (id?: string) => !!id && (session.activeVps.has(id) || modelLayoutIds.has(id))
	function activateVp(id?: string) { if (!id) return; const s = new Set(session.activeVps); s.add(id); session.activeVps = s }
	function deactivateVp(id?: string) { if (!id || !session.activeVps.has(id)) return; const s = new Set(session.activeVps); s.delete(id); session.activeVps = s }

	// Canvas documents — the B1 "each tab owns its own view state" pattern (mock). `Kind`/`Tab`/`WorkPane`/
	// `View`/`StripItem` live in types.ts (R9, moved from here — B15 made that file the one owner of shared
	// Pages types; `Pane` itself is renamed `WorkPane` there so this file can import both the type and the
	// `Pane` COMPONENT without a name clash). `modelId` = which registry model a tab views (model-layout
	// tabs); a sheet's frames each carry their own `modelId`. Defaults to the floor model. (§5 model registry.)
	// SESSION (R2 commit 3, review.md §R2): every piece of per-BROWSER-TAB workspace state that isn't a
	// document (doc.svelte.ts) or a view's pan/zoom/orbit (viewState.svelte.ts) — grouped into one object
	// so `dropDoc` and (R3) the selection model have a single, obvious home to read/write. Was 8 separate
	// top-level `$state`s (`tabs`/`panes`/`focused`/`previewId`/`activeVps`/`selFrame`/`selSection`/
	// `treeNode`); this commit is a rename, not a behaviour change — every field keeps its old meaning:
	//  - `tabs`: open documents (shared; the same page can show in both split panes).
	//  - `panes`: 1 or 2 editor panes; each tracks its own active tab (VS Code-style split).
	//  - `focused`: which pane new tabs / sidebar actions target.
	//  - `previewId`: the single VSCode-style italic preview tab (single-click reuse; B6).
	//  - `activeVps`: which TAB/FRAME ids have their viewport activated (editing mode, not just viewing).
	//  - `treeNode`: a place/label picked in the left tree (project/building/floor/…), for its Properties.
	// (R3: `selSection` (2b) and `selFrame` (commit 3) both moved into `selStore` — a section marker or a
	// selected sheet viewport frame are just more Selection kinds now, not separate session fields. A frame
	// selection is keyed by the TAB id — a page-level editor (PaperPage's new `editor` prop), distinct from
	// each frame's own per-frame editor which is keyed by the FRAME id.)
	type Session = {
		tabs: Tab[]; panes: WorkPane[]; focused: number; previewId: string | null; activeVps: Set<string>
		treeNode: { id: string; label: string; kind: string; floorNumber?: number; building?: string } | null
	}
	let session = $state<Session>({
		// No tabs at start (Dave, 2026-09-23: the four mock demo tabs are gone) — open drawings / floors from the
		// project tree; an empty pane shows "No page open".
		tabs: [],
		panes: [{ id: 'p1', activeId: '', tool: 'Select', layout: 'sheet' }],
		focused: 0, previewId: null, activeVps: new Set<string>(),
		treeNode: null,
	})
	let seq = 0
	// B31: a pane shows MODEL space when its tab isn't a sheet, or is a sheet in Full-size layout. Model
	// space is always active (no double-click to enter, no Exit) and has no canvas transform — pan/zoom
	// act on the Viewport's own view. Only the paper layout keeps canvas pan/zoom + activation.
	// Same test as Pane.svelte's `modelLayout`.
	const isModelLayout = (p: { id: string; activeId: string }) => {
		const t = session.tabs.find((x) => x.id === p.activeId)
		return !!t && !(t.kind === 'sheet' && session.panes.find((x) => x.id === p.id)?.layout === 'sheet')
	}
	const modelLayoutIds = $derived(new Set(session.panes.filter(isModelLayout).map((p) => p.activeId)))
	const kindIcon: Record<Kind, string> = { plan: 'mapPin', sheet: 'fileText', elevation: 'server', model: 'box' }

	// Editor panes — 1 or 2 side by side (vertical split). Each pane views one open
	// tab; tabs are shared documents, so the same page can show in both panes and
	// each pane tracks its own active tab (VS Code-style split).
	// `layout` is PER-PANE ('sheet' = paper + frame, 'model' = drawing fills the pane) so toggling
	// Full-size (or a projection) in one split pane doesn't disturb the other pane's view.
	// Canvas (paper-space) pan/zoom is per PANE + TAB — switching tabs in a pane keeps each tab's own paper
	// position/zoom (was per-pane, so zooming one tab changed the next). Persisted per tab in localStorage
	// (a per-user UI convenience); the viewport CONTENT view (viewState.getView) is the document-side
	// pan/zoom. Backed by viewState.svelte.ts (R2) — same key shapes + localStorage, see that file.
	$effect(() => viewState.loadPersisted())
	// View-state KEYS (Dave, B18 follow-up): split SIDE (pane id — `p1` left, `p2` right, see splitVertical)
	// × DRAWING (`didOf` → the tab's stable docId; a sheet frame keeps its own frame id, already stable in
	// the drawing's doc) × view ORIENTATION (the projection, for pan/zoom/orbit). Keyed by the drawing — not
	// the session tab id — a closed-and-reopened drawing comes back with its views as they were.
	const canvasViewOf = (pane: { id: string; activeId: string }): View => viewState.getCanvas(pane.id, didOf(pane.activeId), didOf(pane.activeId))
	function setCanvasView(pane: { id: string; activeId: string }, v: View) { viewState.setCanvas(pane.id, didOf(pane.activeId), didOf(pane.activeId), v) }
	// Active PROJECTION keyed by PANE + tab, so each split pane is independent (plan in one, side in
	// the other) yet each pane remembers a view's projection when you switch tabs within it.
	function projOf(pane: { id: string }, a: Tab | null): Proj {
		if (!a) return 'plan'
		return viewState.getProj(pane.id, didOf(a.id)) ?? (a.kind === 'elevation' ? 'front' : a.kind === 'model' ? 'iso' : 'plan')
	}
	// Map a projection to the Viewport render kind (same names since the 'floorplan'→'plan' rename): plan, iso → oblique 3D, the four
	// elevations pass through as their own kind (the Viewport projects each per ELEV_BASIS).
	const projKind = (p: Proj) => p as 'plan' | 'iso' | 'front' | 'rear' | 'left' | 'right'
	// A drawing's DOCUMENT state (paper / scale / viewport frames) is keyed by a stable DRAWING id — the
	// tab's TITLE — not the ephemeral tab id, so closing a tab (or reusing the preview slot) never destroys
	// the page, and reopening the same drawing restores it (B6). Titles are unique (named drawings + the
	// `Untitled N` counter) and openDrawing already dedups by title. Session/VIEW state stays tab/pane-keyed.
	const didOf = (tabId?: string) => session.tabs.find((t) => t.id === tabId)?.docId ?? tabId ?? ''   // B18: by id, not title
	// Paper / scale / frames now live in the `docs` PageDoc store (doc.svelte.ts, R2 commit 2), keyed by
	// DRAWING id — thin accessors here resolve the tab id → drawing id first.
	const paperOf = (id?: string) => docs.paperOf(didOf(id))
	const paperDimsOf = (id?: string) => { const p = paperOf(id); return paperDims(p.size, p.landscape) }
	function setPaper(id: string | undefined, patch: Partial<{ size: PaperSize; landscape: boolean; margin: number }>) { docs.setPaper(id ? didOf(id) : undefined, patch) }
	// Per-drawing SCALE (mock — shown in the viewport tag + titleblock; chosen in the active-viewport bar,
	// like the Sheets tool's viewport scale). Keyed by drawing id (`Tab.docId`, B18) so it survives close/reopen.
	const scaleOf = (id?: string) => docs.scaleOf(didOf(id))   // model space is real mm; 1:100 fits the ~28 m demo plan
	const setScale = (id: string | undefined, s: string) => { if (id) docs.setScale(didOf(id), s) }
	// The drafting/interaction flags bundle passed to a pane's viewport (one prop instead of six).
	let guideVert = $state(false)   // the Guide tool's H/V pop-out base (touch has no Shift); Shift still flips it
	const envFor = (pane: { id: string; activeId: string }) => ({ acad: acadMode, navContent, grid: toggles.GRID, lwt: toggles.LWT, osnap: toggles.OSNAP, snap: toggles.SNAP, ortho: toggles.ORTHO, cen: toggles.CEN, snapStep, guideVert, canvasZoom: isModelLayout(pane) ? 1 : canvasViewOf(pane).zoom })   // B31: model space has no canvas zoom
	// R6: the Viewport's callback bundle is split in two. `vpView` → `VpOn` (view/camera events only —
	// still one `on` prop); `vpEditor` → `Editor` (document-mutating ops — entity array, undo-history
	// bracket, section-marker selection). PaperPage also uses `frame`; the plain Viewport ignores it.
	const vpView = (a: Tab, pane: { id: string; tool: string }): VpOn => ({
		activate: () => activateVp(a.id), deactivate: () => deactivateVp(a.id),
		view: (v: View) => setView(pane.id, a.id, projOf(pane, a), v),
		status: (t: string) => (statusText = t), coords: (x: number, y: number) => (worldXY = { x, y }),
		tool: (t: string) => (pane.tool = t), scale: (s: string) => setScale(a.id, s),
		orbit: (yaw: number, pitch: number) => setOrbit(pane.id, a.id, projOf(pane, a), yaw, pitch),
	})
	// R3 commits 2a+2b (review.md §R3): `sel` is the per-VIEWPORT Selection (selStore.svelte.ts, keyed by
	// `viewId` — a sheet FRAME id or a model-layout TAB id acting as its own viewport; NOT the document/tab
	// id `a.id`, which stays the key for `ents`/`edit` since entity CRUD is per-DOCUMENT, shared by every
	// frame of a sheet). Covers every kind now — section markers and wall/conduit nodes fold in here too
	// (`sections` keeps only `dropDir`, the one section action that isn't a selection). `deleteSelAt` (below)
	// is shared by `sel.delete()` here and the Edit-menu/keyboard `deleteSelection()`, so there is exactly
	// one dispatch for every kind, each still recording its own label ('Delete' / 'Delete node' / 'Delete section').
	const vpEditor = (a: Tab, viewId: string): Editor => {
		const edit = { begin: beginGesture, mark: (label?: string) => modelEdit(a.id, label), end: endGesture }
		return {
			ents: {
				add: (e: Ent) => addEnt(a.id, e), update: (e: Ent) => updateEnt(a.id, e),
				delete: (ids: string[]) => { deleteEnts(a.id, ids); selStore.set(viewId, selClear()) },
				copy: (ids: string[]) => copyEnts(a.id, ids),
				cut: (ids: string[]) => { cutEnts(a.id, ids); selStore.set(viewId, selClear()) },
				paste: () => { const copies = pasteEnts(a.id); if (copies?.length) selStore.set(viewId, selOnly(copies.map((c): SelItem => ({ kind: 'ent', id: c.id })))) },
				group: (ids: string[]) => groupEnts(a.id, ids), ungroup: (ids: string[]) => ungroupEnts(a.id, ids),
				reorder: (ids: string[], op: 'front' | 'back' | 'forward' | 'backward') => reorderEnts(a.id, ids, op),
			},
			edit,
			sections: { dropDir: (id: string, dir: ElevDir) => dropSectionDir(id, dir) },
			sel: {
				get: () => selStore.of(viewId),
				only: (items: SelItem[]) => selStore.set(viewId, selOnly(items)),
				toggle: (items: SelItem[]) => selStore.set(viewId, selToggle(selStore.of(viewId), items)),
				clear: () => selStore.set(viewId, selClear()),
				delete: () => deleteSelAt(a.id, viewId, edit),
			},
		}
	}
	// Delete whatever's selected at `viewId` — ent, obj/guide, a wall/conduit node (degree-based join/
	// prune), or a section marker (they're mutually exclusive today, so in practice exactly one branch
	// runs) — each recording its own label ('Delete' / 'Delete node' / 'Delete section'). Shared by
	// `editor.sel.delete()` (a Viewport's own Delete key) and the Edit-menu/global keyboard
	// `deleteSelection()` below, so there is exactly one dispatch for every kind.
	function deleteSelAt(tabId: string, viewId: string, edit: { begin(): void; mark(label?: string): void; end(debounceMs?: number): void }) {
		const s = selStore.of(viewId)
		const entIds = idsOfKind(s, 'ent'), objGuideIds = [...idsOfKind(s, 'obj'), ...idsOfKind(s, 'guide')]
		const nodeItem = singleOfKind(s, 'node'), sectionItem = singleOfKind(s, 'section'), frameItem = singleOfKind(s, 'frame')
		if (entIds.length) { deleteEnts(tabId, entIds); selStore.set(viewId, selClear()); return }
		if (objGuideIds.length) { const mdl = modelById(modelIdOf(tabId)); if (mdl) meDeleteModelSel(mdl, edit, objGuideIds); selStore.set(viewId, selClear()); return }
		if (nodeItem) {
			const mdl = modelById(modelIdOf(tabId))
			const removedObject = mdl ? meDeleteGraphNode(mdl, edit, { obj: nodeItem.id, node: nodeItem.sub! }, newId).removedObject : true
			// pre-R3 behaviour: a node delete that only joins/prunes segments (object survives) leaves the
			// PARENT OBJECT selected (grips shown) — only a fully-removed object clears the selection.
			selStore.set(viewId, removedObject ? selClear() : selOnly([{ kind: 'obj', id: nodeItem.id }]))
			return
		}
		if (sectionItem) { const mdl = modelById(modelIdOf(tabId)); if (mdl) meDeleteSection(mdl, edit, sectionItem.id); selStore.set(viewId, selClear()); return }
		// A frame (R3 commit 3) self-records its own undo step (deleteFrame → recordEdit) — no injected
		// `edit` scope needed, unlike the model-mutation kinds above.
		if (frameItem) { deleteFrame(tabId, frameItem.id); selStore.set(viewId, selClear()); return }
	}
	// PaperPage's page-level editor (R3 commit 3): `vpEditor(a, a.id)` handles the 'frame' kind exactly like
	// every other kind (a sheet tab never uses its own `a.id` as a per-frame viewId, so this slot is free)
	// — EXCEPT selecting a frame must also drop whatever the tab's currently ACTIVE frame has selected in
	// its own viewport (eos-f8's gate: frame selection is exclusive with the viewport selections). Frame
	// borders only render for INACTIVE frames, so this only ever matters when a DIFFERENT frame is active
	// elsewhere on the same sheet; deselecting a frame (clicking empty paper) does NOT reach into the active
	// viewport, so `clear`/`delete` are passed through unchanged.
	function paperEditor(a: Tab): Editor {
		const base = vpEditor(a, a.id)
		const clearActiveFrameSel = () => { const av = activeVpOf(a.id); if (av && av !== a.id) selStore.set(av, selClear()) }
		return {
			...base,
			sel: {
				...base.sel,
				only: (items: SelItem[]) => { clearActiveFrameSel(); base.sel.only(items) },
				toggle: (items: SelItem[]) => { clearActiveFrameSel(); base.sel.toggle(items) },
			},
		}
	}
	// A 3D-model edit (the Viewport mutated the shared `models` store) records a step on THIS doc's
	// timeline, gesture-folded like an entity edit — so Ctrl+Z restores the model too.
	function modelEdit(id: string, label = 'Edit model') { recordEdit(id, label) }
	// Iso ORBIT (yaw/pitch), per pane+tab so split 3D views orbit independently. Drag the iso view to rotate.
	// viewId = a tab id (→ its drawing's docId) or a sheet frame id (kept) — see the view-state KEYS note above.
	const orbitOf = (paneId: string, viewId: string, proj: Proj) => viewState.getOrbit(paneId, didOf(viewId), proj) ?? { yaw: DEFAULT_YAW, pitch: DEFAULT_PITCH }
	function setOrbit(paneId: string, viewId: string, proj: Proj, yaw: number, pitch: number) { viewState.setOrbit(paneId, didOf(viewId), proj, yaw, pitch) }
	// A SECTION is a plan marker (NOT a tab): a clip box + a primary sight direction + a name, stored in the
	// MODEL (`Model.sections`, B5) so it is model-scoped (a cut on one model's plan doesn't show on another)
	// and undoable (it rides `snapModels`). The Viewport creates / moves / re-aims / deletes markers as model
	// edits itself (it reads `mdl.sections`); the page keeps only the shared SELECTION and the sheet-side
	// action: each of the 4 arrows drops that direction's elevation as a viewport FRAME on the current sheet
	// (Dave, 2026-09-22). The 'sec' id prefix keeps them distinct from tab ids.
	// Locate a section (across models) by id → its model id + the section object. Ids are globally unique.
	function findSection(id: string): { mid: ModelId; sec: Section } | null {
		for (const m of models) { const sec = (m.sections ?? []).find((s) => s.id === id); if (sec) return { mid: m.id, sec } }
		return null
	}
	// Drop a section's elevation for a direction as a viewport FRAME on the current sheet (focused pane's
	// sheet, else the first sheet tab); focuses it + selects the new frame. Frame size starts at the clip aspect.
	function dropSectionDir(id: string, dir: ElevDir) {
		const found = findSection(id); if (!found) return
		const clip = found.sec.clip
		const focusedTab = session.tabs.find((t) => t.id === session.panes[session.focused]?.activeId)
		const sheet = focusedTab?.kind === 'sheet' ? focusedTab : session.tabs.find((t) => t.kind === 'sheet')
		if (!sheet) { statusText = 'Open a sheet first to drop a section viewport'; return }
		openTab(sheet.id)
		ensureHist(sheet.id)
		const fid = newFrameId()
		const cw = Math.abs(clip.x1 - clip.x0) || 1, ch = Math.abs(clip.y1 - clip.y0) || 1
		const W = 320, H = Math.max(120, Math.min(460, Math.round((W * ch) / cw)))
		const n = framesOf(sheet.id).length, ox = 90 + (n % 5) * 24, oy = 90 + (n % 5) * 24
		const seq = nextFrameSeq(framesOf(sheet.id))
		setFrames(sheet.id, [...framesOf(sheet.id), { id: fid, x: ox, y: oy, w: W, h: H, border: 'solid', proj: dir, scale: scaleOf(sheet.id), clip: { ...clip }, label: String(seq), seq, modelId: found.mid }])
		if (session.panes[session.focused]) { session.panes[session.focused].activeId = sheet.id; session.panes[session.focused].layout = 'sheet' }
		selStore.set(sheet.id, selOnly([{ kind: 'frame', id: fid }]))
		recordEdit(sheet.id, 'Drop section viewport')
	}

	// ── multi-viewport sheets (AutoCAD paper space) — a sheet's PAGE MODEL is an array of viewport FRAMES
	// (no special "primary"; the default page seeds one full-bleed frame). Each frame is a window onto the
	// shared model at its own projection + scale + clip + geometry; its view/orbit/activation are keyed by
	// the FRAME id (reusing viewState/activeVps), while entity editing targets the tab's shared
	// entities. Frames live per tab (surviving tab switches) and are undone/persisted with the page.
	// (Later the page model also carries the titleblock + page annotations.) A section can be dropped in.
	// Viewport frames = a sheet's page model → DOCUMENT state, keyed by drawing id (`Tab.docId`, B18) so they survive
	// closing/reopening the tab (B6). snapAllFrames/applyPtr operate on the whole map, so history is unaffected.
	const framesOf = (tabId: string) => docs.framesOf(didOf(tabId))
	function setFrames(tabId: string, frames: SheetFrame[]) { docs.setFrames(didOf(tabId), frames) }
	// ensureHist FIRST (review 2026-09-23): a frame drag streams geometry through here and only records its
	// step at the end, so without it the session's baseline ("Start") was captured AFTER the first move and
	// the first frame move / resize could never be undone.
	function updateFrame(tabId: string, id: string, patch: Partial<SheetFrame>) { ensureHist(tabId); setFrames(tabId, framesOf(tabId).map((f) => (f.id === id ? { ...f, ...patch } : f))) }
	const newFrameId = () => newId('vf')
	// Exactly one active viewport per sheet: activating a frame deactivates its siblings. Entering a frame
	// also drops its page-level (border) selection — a frame selection is NOT retained across activation
	// (Dave's call, R3 commit 3): the border-select and "inside, editing" states are visually and
	// interactionally distinct, so re-entering shows a clean canvas, not a stale selected-border outline
	// underneath. Symmetric with the paper-space dblclick-exit, which already cleared it the same way.
	function activateFrame(tabId: string, id: string) { for (const f of framesOf(tabId)) if (f.id !== id) deactivateVp(f.id); activateVp(id); selStore.set(tabId, selClear()) }
	// A per-frame VIEW bundle: entity editing keeps the TAB id (vpEditor is unchanged per frame — same
	// document, same editor); view / activation / scale / orbit use the FRAME id, so each viewport pans,
	// activates and re-aims independently.
	const vpFrameView = (a: Tab, pane: { id: string; tool: string }, frame: SheetFrame): VpOn => ({
		...vpView(a, pane),
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
		setFrames(tabId, [{ id: newFrameId(), x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), border: 'dashed', proj: 'plan', scale: scaleOf(tabId), clip: null, label: '1', seq: 1, modelId: newFrameModel(tabId) }])
	}
	// A new viewport frame dragged on the paper (the Viewport tool): defaults to a plan view. Frame edits
	// (add / move / resize / delete / re-source) record on the page's per-doc history so Ctrl-Z works.
	function addFrame(tabId: string, x: number, y: number, w: number, h: number) {
		ensureHist(tabId)   // capture the pre-add baseline first
		const id = newFrameId(), seq = nextFrameSeq(framesOf(tabId))
		setFrames(tabId, [...framesOf(tabId), { id, x: Math.round(x), y: Math.round(y), w: Math.max(60, Math.round(w)), h: Math.max(60, Math.round(h)), border: 'solid', proj: 'plan', scale: scaleOf(tabId), clip: null, label: String(seq), seq, modelId: newFrameModel(tabId) }])
		selStore.set(tabId, selOnly([{ kind: 'frame', id }]))
		recordEdit(tabId, 'Add viewport')
	}
	// Pure frame CRUD — no selection side effects (R3 commit 3: the caller clears/updates the page-level
	// selection, same pattern as deleteEnts/cutEnts since 2a).
	function deleteFrame(tabId: string, id: string) { ensureHist(tabId); setFrames(tabId, framesOf(tabId).filter((f) => f.id !== id)); deactivateVp(id); recordEdit(tabId, 'Delete viewport') }
	function commitFrame(tabId: string, label: string) { recordEdit(tabId, label) }   // one history step at a drag/edit end
	// VP Freeze: the focused pane's ACTIVE sheet frame (null in model space / on bare paper) — the viewport
	// whose `frozen` list the Layers panel's snowflake column edits.
	const activeFrame = $derived.by(() => {
		const p = session.panes[session.focused]; const t = p && session.tabs.find((x) => x.id === p.activeId)
		if (!p || t?.kind !== 'sheet' || p.layout !== 'sheet') return null
		const av = activeVpOf(t.id)
		return av ? framesOf(t.id).find((f) => f.id === av) ?? null : null
	})
	// XP19 "Fit": set the selected frame's scale so its whole (visible, unfrozen, clipped) model fits, and
	// centre it — the frame's scale is document state (undoable), its content view is the focused pane's.
	function fitSelectedFrame() {
		const a2 = active, p = session.panes[session.focused], f = selFrameObj; if (!a2 || !p || !f) return
		const mdl = modelById(f.modelId ?? a2.modelId ?? FLOOR_MODEL_ID); if (!mdl) return
		const ls = mdl.layers ?? [], frozen = new Set(f.frozen ?? [])
		const orb = orbitOf(p.id, f.id, f.proj)
		const fit = fitFrame(mdl.objects, f.proj, { w: f.w / PAPER_PX_PER_MM, h: f.h / PAPER_PX_PER_MM },
			{ yaw: orb.yaw, pitch: orb.pitch, clip: f.clip, visible: (o) => !isLayerHidden(ls, o.layer) && !(o.layer && frozen.has(o.layer)) })
		if (!fit) { statusText = 'Nothing visible to fit in this viewport'; return }
		ensureHist(a2.id); updateFrame(a2.id, f.id, { scale: `1:${fit.n}` }); commitFrame(a2.id, 'Fit viewport scale')
		setView(p.id, f.id, f.proj, fit.view)
	}
	function toggleVpFreeze(layerId: string) {
		const p = session.panes[session.focused], f = activeFrame; if (!p || !f) return
		ensureHist(p.activeId)
		const cur = f.frozen ?? [], on = cur.includes(layerId)
		updateFrame(p.activeId, f.id, { frozen: on ? cur.filter((x) => x !== layerId) : [...cur, layerId] })
		commitFrame(p.activeId, on ? 'VP thaw layer' : 'VP freeze layer')
	}
	// The active viewport in a tab: the tab id if active (model-layout tabs), else whichever sheet frame is.
	const activeVpOf = (tabId: string): string | null => (isVpActive(tabId) ? tabId : framesOf(tabId).find((f) => isVpActive(f.id))?.id ?? null)
	// The ViewCube reflects + re-aims a SHEET's active frame (or its first frame); a model-layout tab uses
	// the per-pane viewState projection as before.
	const gizmoProj = (pane: { id: string }, a: Tab | null): Proj => {
		if (a?.kind === 'sheet') { const av = activeVpOf(a.id); const f = (av ? framesOf(a.id).find((x) => x.id === av) : null) ?? framesOf(a.id)[0]; return (f?.proj ?? 'plan') as Proj }
		return projOf(pane, a)
	}
	function gizmoSet(pane: { id: string }, a: Tab | null, proj: Proj) {
		if (a?.kind === 'sheet') { const av = activeVpOf(a.id) ?? framesOf(a.id)[0]?.id; const f = framesOf(a.id).find((x) => x.id === av); if (av) updateFrame(a.id, av, f?.seq != null ? { proj } : { proj, label: PROJ_LABEL[proj] }) }   // a numbered frame keeps its label
		else if (a) viewState.setProj(pane.id, didOf(a.id), proj)
	}
	// Scale denominator of the viewport the Properties panel edits in: an active extra sheet frame's own
	// scale, else the tab's (the primary viewport's) — the same choice as the active-viewport bar (B19).
	let propsScaleN = $derived.by(() => {
		const t = active; if (!t) return 1
		const av = activeVpOf(t.id), f = av && av !== t.id ? framesOf(t.id).find((x) => x.id === av) : null
		return scaleDenom(f?.scale ?? scaleOf(t.id))
	})
	let canvasEls = $state<(HTMLElement | undefined)[]>([])   // each pane's .canvas, for navFit
	let splitFrac = $state(0.5)  // pane 0 width fraction when split
	let active = $derived(session.tabs.find(t => t.id === session.panes[session.focused]?.activeId) ?? null)
	// R3 commit 3: a selected sheet viewport frame lives in the page-level Selection (selStore, keyed by the
	// TAB id). `selFrameId` is read separately from `selFrameObj` (which re-derives on every frame geometry
	// edit too, via `framesOf(...).find(...)` returning a fresh reference) so the "show Properties" $effect
	// below fires only on an actual SELECTION change, matching the old `session.selFrame`-keyed effect.
	let selFrameId = $derived(active ? singleOfKind(selStore.of(active.id), 'frame')?.id ?? null : null)
	let selFrameObj = $derived.by(() => { const t = active; return t && selFrameId ? framesOf(t.id).find((f) => f.id === selFrameId) ?? null : null })

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
	// a view of a model that's missing (archived / unknown) shows no shapes — never another model's
	const entsForModel = (mid?: ModelId): Ent[] => (mid != null ? (modelById(mid)?.archived ? [] : modelById(mid)?.shapes ?? []) : modelById(FLOOR_MODEL_ID)?.shapes ?? [])
	// The model a tab's ACTIVE viewport edits: the active sheet frame's model; else (no active frame, e.g.
	// an image imported without entering a viewport) the FIRST frame's model; else the tab's own model; else
	// the floor. Drawing needs an active viewport, so the fallbacks only bite for viewport-less actions.
	function modelIdOf(tabId: string): ModelId {
		const av = activeVpOf(tabId)
		if (av && av !== tabId) { const f = framesOf(tabId).find((x) => x.id === av); if (f?.modelId != null) return f.modelId }
		return framesOf(tabId)[0]?.modelId ?? session.tabs.find((t) => t.id === tabId)?.modelId ?? FLOOR_MODEL_ID
	}
	const mdlEntsOf = (mid: ModelId): Ent[] => modelById(mid)?.shapes ?? []
	const setMdlEntsOf = (mid: ModelId, next: Ent[]) => { const m = modelById(mid); if (m) m.shapes = next }
	// The focused doc's active model (for selection / revisions / properties).
	const activeMid = () => modelIdOf(session.panes[session.focused]?.activeId ?? '')
	const mdlEnts = (): Ent[] => mdlEntsOf(activeMid())
	const entsOf = (id: string) => entsForModel(session.tabs.find((t) => t.id === id)?.modelId)   // a tab's model's ents (sheets pass per-frame)
	// R3 commit 2a: selection now lives in `selStore` (selStore.svelte.ts), keyed per VIEWPORT — a sheet
	// FRAME id, or a model-layout TAB id acting as its own viewport (same id `activeVpOf` resolves). A
	// caller that only has the TAB id (a menu action, the global keyboard handler — not a specific Viewport
	// instance) means "whichever viewport is currently active in this tab".
	const activeSelViewId = (): string | undefined => { const a = active; return a ? (activeVpOf(a.id) ?? a.id) : undefined }
	const activeEntIds = (): string[] => idsOfKind(selStore.of(activeSelViewId()), 'ent')
	// View (content pan/zoom) is keyed by PANE + view + PROJECTION, so a split pans each pane independently
	// AND each projection of a viewport (plan / front / … / 3D) remembers its own framing — flipping the
	// ViewCube restores that view's pan/zoom instead of carrying one framing across all directions.
	// Backed by viewState.svelte.ts (R2); `viewKey` re-exported there for anything that still needs the
	// raw key string.
	const viewOf = (paneId: string, viewId: string, proj: Proj) => viewState.getView(paneId, didOf(viewId), proj)
	// A GESTURE (a drag or a nudge burst) should be ONE undo/history step: while a gesture is open,
	// only the first mutation snapshots; the rest just update. Viewport signals begin/end.
	// P3 short term: after the first mutation, a gesture only flags `gestureDirty`; its final state is folded
	// into the step ONCE when the gesture ends (was a full snapshot of every model per pointer move).
	let gestureActive = false, gesturePushed = false, gestureDirty = false
	let gestureEndTimer: ReturnType<typeof setTimeout> | null = null
	function beginGesture() { if (gestureEndTimer) { clearTimeout(gestureEndTimer); gestureEndTimer = null } gestureActive = true; ensureHist() }
	function endGesture(debounceMs = 0) {
		const finish = () => { if (gestureDirty) updateStep(); gestureActive = false; gesturePushed = false; gestureDirty = false; gestureEndTimer = null }
		if (gestureEndTimer) { clearTimeout(gestureEndTimer); gestureEndTimer = null }
		if (debounceMs) gestureEndTimer = setTimeout(finish, debounceMs); else finish()
	}
	// recordEdit runs AFTER the mutation and snapshots the new state onto the doc's timeline. During a
	// gesture only the first mutation adds a step; the rest fold their final state into that step.
	function recordEdit(id: string, label: string) {
		promoteTab(id)
		if (gestureActive) { if (!gesturePushed) { pushStep(id, label); gesturePushed = true } else gestureDirty = true }
		else pushStep(id, label)
	}
	// R5: a new entity lands on the active layer if this model has it (else Annotations — activeLayerIn).
	function addEnt(id: string, e: Ent) { ensureHist(id); const mid = modelIdOf(id); const en = e.layer ? e : { ...e, layer: activeLayerIn(modelById(mid)?.layers ?? [])?.id }; setMdlEntsOf(mid, [...mdlEntsOf(mid), en]); recordEdit(id, 'Add ' + en.type) }
	function updateEnt(id: string, e: Ent) { ensureHist(id); const mid = modelIdOf(id); setMdlEntsOf(mid, mdlEntsOf(mid).map(x => x.id === e.id ? e : x)); recordEdit(id, 'Edit ' + e.type) }
	// Pure entity CRUD — no selection side effects (R3 2a moved those to the callers below, which know the
	// VIEWPORT id `deleteEnts`/`cutEnts` don't take).
	function deleteEnts(id: string, ids: string[]) {
		if (!ids.length) return
		ensureHist(id)
		const mid = modelIdOf(id), rm = new Set(ids)
		setMdlEntsOf(mid, mdlEntsOf(mid).filter(e => !rm.has(e.id)))
		recordEdit(id, 'Delete')
	}
	function deleteSelection() { const a2 = active, vid = activeSelViewId(); if (a2 && vid) deleteSelAt(a2.id, vid, { begin: beginGesture, mark: (l?: string) => modelEdit(a2.id, l), end: endGesture }) }

	// ── clipboard + grouping ──
	let clipboard: Ent[] = []   // snapshots; persists across tabs
	let pasteN = 0
	function copyEnts(id: string, ids: string[]) { const s = new Set(ids); clipboard = mdlEntsOf(modelIdOf(id)).filter(e => s.has(e.id)).map(e => $state.snapshot(e) as Ent); pasteN = 0 }
	function cutEnts(id: string, ids: string[]) { copyEnts(id, ids); deleteEnts(id, ids) }
	function pasteEnts(id?: string): Ent[] | undefined {
		if (!clipboard.length || !id) return
		pasteN++
		const off = 5 * propsScaleN * pasteN, gidMap = new Map<string, string>()   // B19: 5 PAPER mm per paste (model mm = paper mm × scale N), stacking
		const copies = clipboard.map(e => {
			let gid = e.groupId
			if (gid) { if (!gidMap.has(gid)) gidMap.set(gid, newId()); gid = gidMap.get(gid) }
			return { ...translate(e, off, off), id: newId(), groupId: gid }
		})
		beginGesture(); copies.forEach(c => addEnt(id, c)); endGesture()
		return copies
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
	// $state.raw (P3): steps are immutable plain snapshots, replaced wholesale — never deep-proxied.
	let hist = $state.raw<{ steps: HStep[]; ptr: number } | null>(null)
	let revisions = $state<{ name: string; note: string; snap: Snap; t: number }[]>([])
	const snapEnts = (): Snap => $state.snapshot(mdlEnts()) as Snap
	const snapAllFrames = (): Record<string, SheetFrame[]> => $state.snapshot(docs.allFrames()) as Record<string, SheetFrame[]>
	// Capture the baseline (pre-first-edit) state once, BEFORE anything is mutated.
	function ensureHist(_id?: string) {
		if (hist) return
		hist = { steps: [{ label: 'Start', t: Date.now(), model: snapModels(), frames: snapAllFrames() }], ptr: 0 }
	}
	// A model that enters the registry AFTER history began (created, or loaded from Firestore) joins every existing
	// step in its initial state, so undoing past its first edit returns it to that state (setModels restores by id).
	function addDocToHistory(did: string) {
		const h = hist; if (!h) return
		const frames = $state.snapshot(docs.framesOf(did)) as SheetFrame[]
		hist = { ...h, steps: h.steps.map((st) => (did in st.frames ? st : { ...st, frames: { ...st.frames, [did]: frames } })) }
	}
	function addModelToHistory(m: Model) {
		const h = hist; if (!h) return
		const snap = $state.snapshot(m) as Model
		hist = { ...h, steps: h.steps.map((s) => (s.model.some((x) => x.id === m.id) ? s : { ...s, model: [...s.model, snap] })) }
	}
	function pushStep(id: string, label: string) {
		const t = session.tabs.find(x => x.id === id); if (t && !t.dirty) t.dirty = true   // any edit marks its tab dirty
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
		docs.restoreFrames($state.snapshot(h.steps[h.ptr].frames) as Record<string, SheetFrame[]>)   // restore every tab's frames
	}
	// A gesture's deferred fold (P3) must land before the pointer moves, or it would overwrite the step undo lands on.
	function flushGesture() { if (gestureDirty) { updateStep(); gestureDirty = false } }
	function undo() { flushGesture(); const h = hist; if (!h || h.ptr <= 0) return; hist = { ...h, ptr: h.ptr - 1 }; applyPtr() }
	function redo() { flushGesture(); const h = hist; if (!h || h.ptr >= h.steps.length - 1) return; hist = { ...h, ptr: h.ptr + 1 }; applyPtr() }
	function jumpHistory(i: number) { flushGesture(); const h = hist; if (!h || i < 0 || i >= h.steps.length || i === h.ptr) return; hist = { ...h, ptr: i }; applyPtr() }
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
		const id = session.panes[session.focused]?.activeId; if (!id) return
		ensureHist(id)
		setMdlEntsOf(modelIdOf(id), $state.snapshot(snap) as Ent[])
		recordEdit(id, 'Restore revision')
	}
	function setView(paneId: string, viewId: string, proj: Proj, v: View) { viewState.setView(paneId, didOf(viewId), proj, v) }
	// R3 commits 2a+2b: the Properties panel shows whatever's selected in the ACTIVE viewport (whichever
	// frame/tab is active in the focused pane) — `activeSel` reads it once, `selEnts`/`selModelObj` below
	// both derive from it.
	let activeSel = $derived<Selection>(selStore.of(activeSelViewId()))
	let selEnts = $derived.by(() => {
		const ids = new Set(idsOfKind(activeSel, 'ent'))
		return ids.size ? mdlEnts().filter(e => ids.has(e.id)) : []
	})
	// obj + guide + node ids share one kind-space here, matching the pre-R3 `modelSel`: a selected GUIDE
	// also lands at length 1 below, and `.objects.find` naturally resolves to null for it (guides live in
	// `mdl.guides`, not `.objects`); a selected NODE's `.id` is its PARENT object's id, so this still
	// resolves to the parent's props — same behaviour as before, just sourced from the new Selection.
	let activeModelSel = $derived([...idsOfKind(activeSel, 'obj'), ...idsOfKind(activeSel, 'guide'), ...idsOfKind(activeSel, 'node')])
	// The single selected 3D-model object (Properties panel edits it straight on the store, with undo).
	let selModelObj = $derived(activeModelSel.length === 1 ? (modelById(activeMid())?.objects.find(o => o.id === activeModelSel[0]) ?? null) : null)
	// Selecting a model object (plan / elevation / 3D pick) shows the Properties tab so its props are visible.
	$effect(() => { if (activeModelSel.length) { rightTab = 'props'; rightOpen = true } })
	// Selecting an entity likewise drops any tree-node selection (was `setSel`'s job pre-R3).
	$effect(() => { if (idsOfKind(activeSel, 'ent').length) session.treeNode = null })
	// Selecting a sheet viewport frame likewise shows its Properties.
	$effect(() => { if (selFrameId) { rightTab = 'props'; rightOpen = true; session.treeNode = null } })
	// Exit an image calibration mode when its image is no longer the (single) selection.
	$effect(() => { if (imgEdit.id && !(selEnts.length === 1 && selEnts[0].id === imgEdit.id)) clearImgMode() })
	function updateModelObj(patch: Record<string, unknown>) {
		const o = selModelObj, id = session.panes[session.focused]?.activeId; if (!o || !id) return
		beginGesture(); Object.assign(o, patch); modelEdit(id); endGesture()   // one undo step (baseline pre-change)
	}
	function deleteModelObj() {
		const o = selModelObj, id = session.panes[session.focused]?.activeId, m = modelById(activeMid()); if (!o || !m || !id) return
		beginGesture(); m.objects = m.objects.filter(x => x.id !== o.id); modelEdit(id); endGesture()
		selStore.set(activeSelViewId(), selClear())
	}
	// Per-segment override edit (wall/conduit) with undo.
	function updateModelSeg(segIdx: number, patch: Record<string, unknown>) {
		const o = selModelObj as { segments?: Record<string, unknown>[] } | null, id = session.panes[session.focused]?.activeId
		if (!o?.segments?.[segIdx] || !id) return
		beginGesture(); Object.assign(o.segments[segIdx], patch); modelEdit(id); endGesture()
	}
	// Free only SESSION/VIEW state for a closed or reused TAB. DOCUMENT state (the `docs` PageDoc store,
	// keyed by DRAWING id) is KEPT — so closing a tab never destroys the page and reopening it restores the
	// frames/paper/scale (B6). Must run while the tab still exists in `tabs` (so framesOf resolves the did).
	function dropDoc(id: string) {
		const frameIds = framesOf(id).map((f) => f.id)
		const ids = new Set<string>([id, ...frameIds])            // this tab + its viewport frames
		selStore.drop([...ids])                                    // selection (per viewport + the page-level frame selection at `id`, since R3 2b/commit 3)
		// View state is NOT dropped any more: it is keyed by the drawing (docId), so reopening the drawing
		// restores its pan/zoom/orbit/projection/paper position (was keyed by the session tab id, freed here).
		deactivateVp(id); for (const fid of frameIds) deactivateVp(fid)   // reopened tab starts deactivated
	}

	function openTab(id: string, pane = session.focused) {
		const p = session.panes[pane]; if (!p) return
		p.activeId = id; session.focused = pane   // selection now lives per doc, so it's preserved
	}
	function addTab(kind: Kind = 'plan', title?: string, modelId?: ModelId, docId: string = newId('d')) {
		const id = newId('t'); ++seq   // seq only numbers 'Untitled N' now (tab ids are nanoid, B13)
		session.tabs = [...session.tabs, { id, docId, title: title ?? `Untitled ${seq}`, kind, dirty: false, modelId }]
		if (session.panes[session.focused]) session.panes[session.focused].activeId = id
	}
	function closeTab(id: string, e?: Event) {
		e?.stopPropagation()
		const i = session.tabs.findIndex(t => t.id === id); if (i < 0) return
		dropDoc(id)   // BEFORE removing the tab, so framesOf resolves its drawing id; document state is kept (B6)
		session.tabs = session.tabs.filter(t => t.id !== id)
		if (session.previewId === id) session.previewId = null
		// Point any pane that showed this tab at a neighbour, or '' → the "No page open"
		// empty state (don't auto-spawn an Untitled tab on the last close).
		const fallback = session.tabs[Math.max(0, i - 1)]?.id ?? ''
		for (const p of session.panes) if (p.activeId === id) p.activeId = fallback
	}
	// Vertical split: open a second pane showing a different tab; toggle focus if already split.
	function splitVertical() {
		if (session.panes.length >= 2) { session.focused = 1; return }
		// Mirror the current pane into the split: same active tab + layout, so it opens as a
		// duplicate view you then diverge (change projection/tab in one side).
		const src = session.panes[0]
		// Pane ids name the SIDE of the split: the left pane is always `p1` (it can't be closed) and the split
		// is always `p2`, so view state keyed by pane id stays with its side across re-splits.
		session.panes = [...session.panes, { id: 'p2', activeId: src.activeId, tool: 'Select', layout: src.layout }]
		session.focused = 1; splitFrac = 0.5
		tick().then(() => { fitPane(0); fitPane(1) })   // both panes narrowed → refit their sheets
	}
	function closePane(idx: number) {
		if (session.panes.length < 2 || idx === 0) return   // the left pane (p1) always remains; only the split closes
		session.panes = session.panes.filter((_, i) => i !== idx)
		session.focused = 0
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
		// Edit-menu clipboard/delete (B8) — act on the active VIEWPORT's selection (the Ctrl-key paths already work).
		else if (item === 'Cut') { const a = active, vid = activeSelViewId(); if (a) { cutEnts(a.id, activeEntIds()); selStore.set(vid, selClear()) } }
		else if (item === 'Copy') { const a = active; if (a) copyEnts(a.id, activeEntIds()) }
		else if (item === 'Paste') { const a = active, vid = activeSelViewId(); if (a) { const copies = pasteEnts(a.id); if (copies?.length) selStore.set(vid, selOnly(copies.map((c): SelItem => ({ kind: 'ent', id: c.id })))) } }
		else if (item === 'Delete') deleteSelection()
		else if (item === 'Image…') importImage()
		else if (item === 'Text') { if (active) focusTool('Text') }
		else if (item === 'Dimension') { if (active) focusTool('Dimension') }
		// Not-yet-implemented File items: tell the user instead of silently doing nothing (B8).
		else if (item === 'Open Project…') openProjectOpen = true
		else if (item === 'Save' || item === 'Export…') statusText = `${item.replace('…', '')} isn't wired up yet (mock)`
		// everything else is a mock no-op
	}
	function focusTool(t: string) { const p = session.panes[session.focused]; if (p) p.tool = t }
	// Import an IMAGE as a background: read it as a data-URL, size the placement rect to its aspect ratio,
	// and add it as an 'image' entity on the ACTIVE layer (select a Background layer first to group it).
	// P3 short term: a data-URL is interned (imageStore.ts) and the entity stores its short key, so the
	// bytes never enter the model / undo snapshots; a real backend would upload + store a fileId (X7).
	// Place an image (by data-URL or URL) as a background on the active layer, sized to its aspect ratio at
	// the plan centre; imports default to aspect-locked. Returns false if there's no drawing open.
	function addImage(src: string): boolean {
		const id = session.panes[session.focused]?.activeId
		if (!id) { toast('Open a drawing first, then Insert › Image…'); return false }
		const img = new Image()
		const place = (aspect: number) => {
			const cx = 14000, cy = 8750, w = 9000, h = w * aspect
			addEnt(id, { id: newId(), type: 'image', a: [Math.round(cx - w / 2), Math.round(cy - h / 2)], b: [Math.round(cx + w / 2), Math.round(cy + h / 2)], src: internImage(src), plane: 'plan', lockAspect: true })
			const mn = modelById(modelIdOf(id))?.name ?? 'the model'
			toast(`Image added to ${mn} on layer “${activeLayerIn(modelById(modelIdOf(id))?.layers ?? [])?.name ?? '—'}”. Set its scale/crop in Properties.`)
		}
		img.onload = () => place((img.naturalHeight || 700) / (img.naturalWidth || 1000))
		img.onerror = () => place(0.7)
		img.src = src
		return true
	}
	function importImage() {
		if (!session.panes[session.focused]?.activeId) { toast('Open a drawing first, then Insert › Image…'); return }
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
	function promoteTab(id: string) {
		const t = session.tabs.find(x => x.id === id)
		if (t?.preview) t.preview = false
		if (session.previewId === id) session.previewId = null
	}
	// `floor` (the navigator floor the drawing sits under, or a palette item's path) picks the model the
	// drawing views; without one it falls back to FLOOR_MODEL_ID as before.
	// B18: a drawing is identified by `docId` (its navigator node id; a palette item looks its id up by label,
	// else falls back to `title:<title>`), so re-opening finds the SAME drawing even if a tab was renamed.
	function openDrawing(d: { title: string; kind: Kind; preview?: boolean; floor?: string; docId?: string; modelId?: ModelId }) {
		const sid = sheetIdOf(d.docId); if (sid) loadSheet(sid)   // a stored Pages sheet: its paper + frames first
		// a stored sheet's tab (frames without their own model fall back to it) = its PLACE's model, never the
		// unsaved per-floor-name model of the old tree
		const sheetPlace = sid ? pagesStore?.sheets.find((x) => x.id === sid)?.placeId : null
		const modelId = d.modelId ?? (sheetPlace ? ensurePlaceModel(sheetPlace) : d.floor && projectSrc?.project ? realFloorModelId(d.floor) : floorModelId(d.floor))   // a real floor gets its own model + floorplan
		const docId = d.docId ?? navDrawingId(d.title) ?? `title:${d.title}`
		const existing = session.tabs.find(t => t.docId === docId)
		if (existing) { if (!d.preview) promoteTab(existing.id); openTab(existing.id); return }
		if (d.preview) {
			const pv = session.tabs.find(t => t.id === session.previewId)
			// Reuse the preview slot: free the OLD drawing's session/view state BEFORE retitling, so didOf
			// still resolves to the old drawing (else dropDoc would free the incoming drawing's state — B6).
			if (pv) { dropDoc(pv.id); pv.docId = docId; pv.title = d.title; pv.kind = d.kind; pv.modelId = modelId; openTab(pv.id); return }
			const id = newId('t'); ++seq
			session.tabs = [...session.tabs, { id, docId, title: d.title, kind: d.kind, dirty: false, preview: true, modelId }]
			session.previewId = id
			if (session.panes[session.focused]) session.panes[session.focused].activeId = id
		} else {
			addTab(d.kind, d.title, modelId, docId)
		}
	}
	// A floor in the navigator → its MODEL tab (model space, opening in plan; the ViewCube switches to 3D /
	// elevations). Single click previews, double click keeps — the same as a drawing.
	function openFloorModel(floor: string, preview: boolean) {
		openDrawing({ title: `${floor} · Model`, kind: 'model', preview, floor, docId: `floor:${floor}` })
		const p = session.panes[session.focused]
		if (p && !viewState.getProj(p.id, didOf(p.activeId))) viewState.setProj(p.id, didOf(p.activeId), 'plan')
	}
	// drawings-plan phase 3: a PLACE's model tab — its stored model (projects/{pid}/models, filed by placeId),
	// created and stored the first time it's opened. A floor place seeded from the old data also gets that
	// floor's calibrated floorplan as its underlay (once). An archived model opens as "Missing model".
	const MODEL_KINDS: ModelKind[] = ['floor', 'zone', 'room', 'building']
	// An open asked for before the store has loaded its models (the tree-item restore, a quick click) WAITS for
	// them — otherwise modelForPlace finds nothing yet and a duplicate model would be created and stored.
	let pendingPlaceOpen = $state<{ placeId: string; preview: boolean } | null>(null)
	$effect(() => {
		const want = pendingPlaceOpen; if (!want || pagesStore?.status !== 'ready') return
		untrack(() => { pendingPlaceOpen = null; openPlaceModel(want.placeId, want.preview) })
	})
	/** The model of a place: its stored one, else a new one created + stored now (callers check the store is
	 *  ready first). A floor place seeded from the old data also gets its floorplan underlay (once). */
	function ensurePlaceModel(placeId: string): ModelId | undefined {
		const ps = pagesStore, place = ps?.places.find((p) => p.id === placeId); if (!ps || !place || ps.status !== 'ready') return
		let m = modelForPlace(placeId)
		if (!m) {
			const kind = (MODEL_KINDS as string[]).includes(place.kind ?? '') ? (place.kind as ModelKind) : 'zone'
			const fresh: Model = { ...emptyFloor(newId('m'), place.name), placeId, kind }   // default layers (mock template until a project layer template exists)
			ps.saveModel(fresh)
			upsertModel(docToModel(fresh))
			addModelToHistory(fresh)
			m = modelById(fresh.id)
		}
		if (!m) return
		const l = place.legacy
		if (l?.floor != null && l.area == null && l.room == null && l.row == null) attachFloorplan(m.id, l.floor)
		else if (l?.area) { const od = outletsDocIdFor(ps.pid, l, normFloors(projectSrc?.project?.floors)); if (od) attachFloorplanFromDoc(m.id, od) }   // a zone: ITS plan
		return m.id
	}
	/** A zone model's floorplan: the file its own Outlets-tool doc shows. */
	function attachFloorplanFromDoc(id: ModelId, docId: string) {
		const m = modelById(id); if (!fdb || !m || floorplanShapeOf(m) || attaching.has(id)) return
		attaching.add(id)
		fdb.getOne('outlets', docId).then((d) => { const od = d as OutletsDoc | null; return od?.selectedFileId ? addFloorplanShape(id, od.selectedFileId, od.selectedPage ?? 1) : undefined })
			.catch(() => {}).finally(() => attaching.delete(id))
	}
	/** Import a place's outlets (block inserts) + trunks (conduits) from the Outlets tool into its model — one
	 *  undo step; importing again updates what was imported (drawings-plan §6). */
	async function importPlaceOutlets(placeId: string) {
		const ps = pagesStore, place = ps?.places.find((p) => p.id === placeId); if (!ps || !place || !fdb) return
		if (ps.status !== 'ready') { toast('Still loading — try again in a moment'); return }
		const docId = outletsDocIdFor(ps.pid, place.legacy, normFloors(projectSrc?.project?.floors)); if (!docId) return
		const doc = (await fdb.getOne('outlets', docId)) as OutletsDoc | null
		if (!doc || (!doc.outlets?.length && !doc.trunks?.length)) { toast(`Nothing to import from outlets/${docId}`); return }
		const mid = ensurePlaceModel(placeId); const m = mid ? modelById(mid) : undefined; if (!m) return
		ensureHist()
		const r = importOutletsInto($state.snapshot(m) as Model, doc)
		m.shapes = r.model.shapes; m.objects = r.model.objects; m.layers = r.model.layers
		pushStep(session.panes[session.focused]?.activeId ?? '', 'Import from Outlets tool')
		openPlaceModel(placeId, false)
		toast(`Imported into ${place.name}: ${r.added} new outlet${r.added === 1 ? '' : 's'}${r.updated ? `, ${r.updated} updated` : ''}, ${r.trunks} trunk${r.trunks === 1 ? '' : 's'}`)
	}
	function openPlaceModel(placeId: string, preview: boolean) {
		const ps = pagesStore, place = ps?.places.find((p) => p.id === placeId); if (!ps || !place) return
		if (ps.status !== 'ready') { pendingPlaceOpen = { placeId, preview }; return }
		const mid = ensurePlaceModel(placeId); if (!mid) return
		const m = modelById(mid); if (!m) return
		openDrawing({ title: `${place.name} · Model`, kind: 'model', preview, modelId: m.id, docId: `model:${m.id}` })
		const p = session.panes[session.focused]
		if (p && !viewState.getProj(p.id, didOf(p.activeId))) viewState.setProj(p.id, didOf(p.activeId), 'plan')
	}
	// The REAL project tree (projectTree.ts) from Firestore — docs/firestore-structure.md. One live source per
	// project id (re-created when Open Project navigates to another pid); the mock tree stays for a pid that
	// isn't in Firestore (the demo URL).
	const fdb = getContext('db') as Firestore | undefined
	let projectSrc = $state<ProjectSource | null>(null)
	// drawings-plan phase 2: the project's PAGES data (places now; sheets + models in phases 3–4), one store per
	// project id alongside the read-only ProjectSource.
	const auth = getContext('session') as AuthSession | undefined
	// the GLOBAL block library (blocks/{id}): subscribed once per session; missing default blocks are seeded
	$effect(() => { if (fdb) untrack(() => startBlocks(fdb)) })
	let pagesStore = $state<PagesStore | null>(null)
	$effect(() => {
		const pid = page.params.pid
		if (!fdb || !pid) return
		const src = new ProjectSource(fdb, pid)
		const stop = src.start()
		// stored models go into the editor's model registry from the SUBSCRIPTION callback (remote changes only)
		const ps = new PagesStore(fdb, pid, untrack(() => auth?.user?.email ?? ''), {
			onModels: (changed, removed) => {
				for (const d of changed) { const isNew = !modelById(d.id); const m = docToModel(d); upsertModel(m); if (isNew) addModelToHistory(m); if (m.underlays?.length) convertUnderlays(m.id) }
				removeModels(removed)
			},
			// a stored sheet changed elsewhere: refresh its open page doc + tab titles (echoes / pending edits never arrive here)
			onSheets: (changed) => {
				for (const sh of changed) {
					const did = `sheet:${sh.id}`
					if (docs.has(did)) docs.seed(did, sheetToPage(sh))
					for (const t of session.tabs) if (t.docId === did && t.title !== sh.title) t.title = sh.title
				}
			},
		})
		ps.start()
		untrack(() => { projectSrc = src; pagesStore = ps })
		return () => {
			stop()
			const ids = ps.models.map((m) => m.id)
			void ps.stop().then(() => removeModels(ids))   // save pending edits, then drop this project's models
			untrack(() => { if (projectSrc === src) projectSrc = null; if (pagesStore === ps) pagesStore = null })
		}
	})
	// ── Pages SHEETS (drawings-plan phase 4): a stored sheet opens as drawing id `sheet:<id>`; its paper / scale /
	// frames load into the PageDoc store once, and every change there is folded back into the stored doc. ──
	const SHEET = 'sheet:'
	const sheetIdOf = (docId?: string) => (docId?.startsWith(SHEET) ? docId.slice(SHEET.length) : null)
	const storedSheetOfTab = (tabId: string) => { const id = sheetIdOf(didOf(tabId)); return id ? pagesStore?.sheets.find((x) => x.id === id) ?? null : null }
	function loadSheet(id: string) {
		const sh = pagesStore?.sheets.find((x) => x.id === id), did = SHEET + id
		if (!sh || docs.has(did)) return
		docs.seed(did, sheetToPage(sh))
		addDocToHistory(did)
	}
	/** The model a NEW frame on this tab's sheet shows: the sheet's place model (created if needed). */
	const newFrameModel = (tabId: string): ModelId | undefined => { const sh = storedSheetOfTab(tabId); return sh?.placeId ? ensurePlaceModel(sh.placeId) : undefined }
	$effect(() => {
		const ps = pagesStore; if (!ps) return
		// depend on the WHOLE doc map (a sheet loaded later must re-run this); the store's sheet list is read
		// untracked — saveSheet replaces it, which would re-run this forever
		const all = docs.all()
		const list = untrack(() => ps.sheets)
		for (const sh of list) {
			const d = all[SHEET + sh.id]; if (!d) continue
			const snap = $state.snapshot(d) as PageDoc
			untrack(() => { const cur = ps.sheets.find((x) => x.id === sh.id); if (cur) ps.saveSheet(pageToSheet(cur, snap)) })
		}
	})
	function onSheetAdd(placeId: string): string | undefined {
		const ps = pagesStore; if (!ps || ps.status !== 'ready') return
		const sh = ps.createSheet({ title: 'New sheet', placeId })
		loadSheet(sh.id)
		openDrawing({ title: sh.title, kind: 'sheet', preview: false, docId: SHEET + sh.id })
		return `s:${sh.id}`
	}
	function renameSheet(id: string, title: string) {
		const ps = pagesStore, sh = ps?.sheets.find((x) => x.id === id); if (!ps || !sh || !title.trim()) return
		ps.saveSheet({ ...sh, title: title.trim() })
		for (const t of session.tabs) if (t.docId === SHEET + id) t.title = title.trim()
	}
	function archiveSheet(id: string) {
		const ps = pagesStore; if (!ps) return
		ps.setSheetStatus(id, 'archived')
		for (const t of [...session.tabs]) if (t.docId === SHEET + id) closeTab(t.id)
		toast('Sheet archived — it will be in the drawing manager\'s archived list')
	}
	/** A sheet dropped on the tree: onto a place = into it (last); before / after another sheet = beside it. */
	function moveSheetRow(sheetId: string, targetId: string, zone: DropZone) {
		const ps = pagesStore; if (!ps) return
		if (targetId.startsWith('s:')) {
			const target = ps.sheets.find((x) => x.id === targetId.slice(2)); if (!target) return
			const order = ps.sheetsIn(target.placeId).filter((x) => x.id !== sheetId)
			const i = order.findIndex((x) => x.id === target.id)
			ps.moveSheet(sheetId, target.placeId, zone === 'before' ? i : i + 1)
		} else if (ps.places.some((p) => p.id === targetId)) ps.moveSheet(sheetId, targetId, ps.sheetsIn(targetId).length)
	}
	// Save every STORED model when it changes (edits, undo/redo, floorplan attach). The saver debounces and skips
	// content it already has, so re-queueing unchanged models (or a remote change just applied) writes nothing.
	// The stored-id set is read untracked: saveModel updates the store's list, which must not re-run this.
	$effect(() => {
		const ps = pagesStore; if (!ps) return
		const stored = untrack(() => new Set(ps.models.map((m) => m.id)))
		for (const m of models) if (stored.has(m.id)) { const snap = $state.snapshot(m) as Model; untrack(() => ps.saveModel(snap)) }
	})
	// Once the project HAS Pages places, the navigator shows them (with the old tools' drawings hung on them by
	// their legacy links); until then it shows the tree derived from the other tools' data, plus "Set up places".
	const hasPlaces = $derived(!!pagesStore && pagesStore.places.length > 0)
	const realTree = $derived.by(() => {
		const src = projectSrc; if (src?.status !== 'ready') return null
		const t = src.tree; if (!t) return null
		if (!hasPlaces) return t
		return { project: t.project, tree: buildPlaceTree({ pid: src.pid, places: pagesStore!.places, drawings: src.drawings, risers: src.risers, floors: src.project?.floors, sheets: pagesStore!.sheets }) }
	})
	const canSeedPlaces = $derived(pagesStore?.status === 'ready' && !hasPlaces && projectSrc?.status === 'ready')
	function seedPlaces() {
		const src = projectSrc, ps = pagesStore; if (!src?.project || !ps) return
		if (ps.seedPlaces({ project: src.project, racks: src.racks, risers: src.risers, drawings: [] })) toast(`Places created (${ps.places.length}). The tree now shows them.`)
	}
	function onPlaceAdd(parentId: string | null): string | undefined {
		const ps = pagesStore; if (!ps) return
		const id = newId('pl')
		ps.savePlaces(addPlace(ps.places, { id, name: 'New place', parentId }))
		return id
	}
	function onPlaceRename(id: string, name: string) { const ps = pagesStore; if (ps) ps.savePlaces(updatePlace(ps.places, id, { name })) }
	function onPlaceMove(id: string, targetId: string, zone: DropZone) {
		const ps = pagesStore; if (!ps) return
		if (id.startsWith('s:')) { moveSheetRow(id.slice(2), targetId, zone); return }
		if (targetId.startsWith('s:')) return   // a place can't go under a sheet
		const next = movePlace(ps.places, id, targetId, zone)
		if (next) ps.savePlaces(next); else toast("A place can't move into itself")
	}
	// Delete only an EMPTY place (drawings-plan §4): no child places, sheets, models or hung drawings.
	function onPlaceDelete(id: string): string | null {
		const ps = pagesStore; if (!ps) return null
		const node = realTree ? findNodePath(realTree.tree, { id })?.node : undefined
		const drawings = (node?.children ?? []).filter((c) => c.drawing).length
		if (ps.sheetsIn(id, true).length) return 'It has sheets — move or archive them first'
		if (ps.models.some((m) => m.placeId === id)) return 'It has a model — move or archive it first'
		if (drawings) return `It holds ${drawings} drawing${drawings === 1 ? '' : 's'} from the other tools`
		const next = removePlace(ps.places, id)
		if (!next) return 'It has places inside — move or delete them first'
		ps.savePlaces(next)
		if (session.treeNode?.id === id) session.treeNode = null
		return null
	}
	const navStatus = $derived(projectSrc?.status === 'loading' ? 'Loading project…' : projectSrc?.status === 'missing' ? 'Not a Firestore project — showing the demo tree' : '')
	// A REAL floor's model: its own (named "33F — Hibiya", so it never picks up the demo 33F model) with the
	// floor's calibrated floorplan as its plan underlay (ProjectSource.floorplanOf → the outlets tool's file /
	// page). The underlay is attached once, asynchronously; the tab zooms to it on arrival (Viewport extents).
	// locked by default: clicking the plan mustn't grab it — unlock the layer to move / crop / recalibrate it
	const FLOORPLAN_LAYER = { id: 'floorplan', name: 'Floorplan', group: 'Background', color: '#94a3b8', swatch: 'color' as const, visible: true, locked: true }
	function realFloorModelId(floor: string): ModelId {
		const src = projectSrc!, id = ensureFloorModel(`${floor} — ${src.project?.name ?? src.pid}`)
		const n = parseInt(floor, 10)
		if (!isNaN(n)) attachFloorplan(id, n)
		return id
	}
	// ── a floor's FLOORPLAN is an image SHAPE (src `pdf:<fileId>#<page>`) on the model's Background "Floorplan"
	// layer — selectable / croppable / recalibratable like any image. Its placement is computed ONCE from the
	// Outlets / Uploads calibration of the page; later changes in Pages aren't synced back (drawings-plan). ──
	const floorplanShapeOf = (m: Model) => m.shapes?.find((e) => e.type === 'image' && e.src?.startsWith(PDF_SRC))
	const attaching = new Set<ModelId>()
	/** Give a model its floor's floorplan shape, once (no-op when it already has one). */
	function attachFloorplan(id: ModelId, n: number) {
		const src = projectSrc, m = modelById(id)
		if (!src || !m || floorplanShapeOf(m) || m.underlays?.length || attaching.has(id)) return
		attaching.add(id)
		src.floorplanOf(n).then((fp) => (fp ? addFloorplanShape(id, fp.fileId, fp.pageNum) : undefined))
			.catch(() => { /* no floorplan — the model stays empty */ }).finally(() => attaching.delete(id))
	}
	async function addFloorplanShape(id: ModelId, fileId: string, page: number) {
		const place = await floorplanPlacement(fileId, page)
		const mm = modelById(id)
		if (!place || !mm || floorplanShapeOf(mm)) return
		// the floorplan goes on its OWN Background layer (first in the list = drawn underneath), so the Layers
		// panel shows / hides / locks / VP-freezes it like any other layer
		if (!mm.layers?.some((l) => l.id === FLOORPLAN_LAYER.id)) mm.layers = [{ ...FLOORPLAN_LAYER }, ...(mm.layers ?? [])]
		const shape: Ent = { id: newId('e'), type: 'image', a: place.a, b: place.b, src: pdfSrc(fileId, page), layer: FLOORPLAN_LAYER.id, opacity: 0.6, lockAspect: true }
		if (place.crop) shape.crop = place.crop
		mm.shapes = [shape, ...(mm.shapes ?? [])]
	}
	/** A stored model from before floorplans were shapes: turn its plan underlays into floorplan shapes (once). */
	function convertUnderlays(id: ModelId) {
		const m = modelById(id), us = (m?.underlays ?? []).filter((u) => u.dir === 'plan' && u.fileId)
		if (!m || !us.length || attaching.has(id)) return
		attaching.add(id)
		Promise.all(us.map((u) => addFloorplanShape(id, u.fileId, u.pageNum ?? 1))).then(() => {
			const mm = modelById(id); if (!mm) return
			mm.underlays = []
			const l = mm.layers?.find((x) => x.id === FLOORPLAN_LAYER.id); if (l) l.locked = true
		}).catch(() => {}).finally(() => attaching.delete(id))
	}
	// The selected REAL tree node's properties (projectProps.ts) + saving an edit. A renamed building's node id
	// changes (`b:<name>`), so the selection follows it.
	const isPlaceNode = $derived(!!session.treeNode && hasPlaces && !!pagesStore?.places.some((p) => p.id === session.treeNode!.id))
	const nodeInfo = $derived(!session.treeNode ? null
		: isPlaceNode ? describePlace(pagesStore!.places, session.treeNode.id, realTree ? findNodePath(realTree.tree, { id: session.treeNode.id })?.node : undefined)
		: projectSrc?.status === 'ready' ? projectSrc.describe(session.treeNode.id) : null)
	async function setNodeField(key: string, value: string) {
		const n = session.treeNode, src = projectSrc; if (!n || !src) return
		if (isPlaceNode && pagesStore) {   // a Pages place: name / icon kind
			if (key !== 'name' && key !== 'kind') return
			if (key === 'name' && !value.trim()) { toast('A place needs a name'); return }
			pagesStore.savePlaces(updatePlace(pagesStore.places, n.id, { [key]: value }))
			if (key === 'name') session.treeNode = { ...n, label: value.trim() }
			return
		}
		try {
			const ok = await src.setField(n.id, key, value)
			if (!ok) { toast(key === 'name' && n.id.startsWith('b:') ? 'That building name is empty or already used' : 'Nothing to save'); return }
			if (n.id.startsWith('b:') && key === 'name') session.treeNode = { ...n, id: `b:${value.trim()}`, label: value.trim() }
		} catch (e) { toast(`Couldn't save: ${(e as Error)?.message ?? e}`) }
	}
	// ── the last clicked tree item, per project, in localStorage — a location node (selected + its Properties;
	// a floor also reopens its model tab) or a drawing (reopened as a tab). Restored once, when the project's
	// real tree first loads; its ancestors are expanded so it's visible. ──
	const TREE_LS = 'eos.pages.treeItem'
	type TreeItem = { node?: string; doc?: string }
	function saveTreeItem(item: TreeItem) {
		const pid = page.params.pid; if (!pid) return
		try { const all = JSON.parse(localStorage.getItem(TREE_LS) || '{}'); all[pid] = item; localStorage.setItem(TREE_LS, JSON.stringify(all)) } catch { /* private mode */ }
	}
	let treeReveal = $state<string[]>([])
	// The tree fills in over several snapshots (project doc first, then risers / drawings / racks rows), so the
	// restore RETRIES on each tree update until it finds the item — and gives up once the user clicks in the
	// tree themselves, or 15 s after the project started loading.
	let restoredFor = '', restoreStart = 0
	$effect(() => {
		const t = realTree, pid = page.params.pid
		if (!t || !pid || restoredFor === pid) return
		untrack(() => {
			if (!restoreStart) restoreStart = Date.now()
			let item: TreeItem | undefined
			try { item = JSON.parse(localStorage.getItem(TREE_LS) || '{}')[pid] } catch { /* private mode */ }
			if (!item || Date.now() - restoreStart > 15000) { restoredFor = pid; return }
			if (item.node === t.project.id) { restoredFor = pid; selectNode({ id: t.project.id, label: t.project.label, kind: 'project' }); return }
			const hit = findNodePath(t.tree, item.node ? { id: item.node } : { docId: item.doc })
			if (!hit) return   // not loaded yet — try again on the next tree update
			restoredFor = pid
			treeReveal = hit.ancestors.map((a) => a.id)
			const n = hit.node
			if (n.drawing) {
				const floor = [...hit.ancestors].reverse().find((a) => a.floor)?.floor
				openDrawing({ title: n.label, kind: n.drawing, preview: true, floor, docId: n.docId ?? n.id })
			} else {
				selectNode({ id: n.id, label: n.label, kind: n.place ? 'place' : n.folder ?? 'folder', floorNumber: n.floorNumber, building: n.building })
				if (n.place) { if (n.modelFloor) openPlaceModel(n.id, true) }
				else if (n.folder === 'floor' && n.floor) openFloorModel(n.floor, true)
			}
		})
	})
	// the navigator's clicks → remember them (drawings by their stable docId)
	function navOpen(d: { title: string; kind: Kind; preview: boolean; floor?: string; docId?: string }) { restoredFor = page.params.pid ?? ''; if (d.docId) saveTreeItem({ doc: d.docId }); openDrawing(d) }
	function navSelect(n: { id: string; label: string; kind: string; floorNumber?: number; building?: string }) { restoredFor = page.params.pid ?? ''; saveTreeItem({ node: n.id }); selectNode(n) }
	// A place/label in the tree (project, building, floor, …) → edit its props in the right panel.
	function selectNode(n: { id: string; label: string; kind: string; floorNumber?: number; building?: string }) {
		selStore.set(activeSelViewId(), selClear())   // clear entity selection so node props show
		session.treeNode = n; rightTab = 'props'; rightOpen = true
	}

	// ── top-bar drawing-set selectors + Ctrl-K command palette (mock data → mock/data.ts, R10) ──
	let pkg = $state('Detailed Design'), ver = $state('v3'), rev = $state('B')
	let paletteOpen = $state(false)
	// File › Open Project… (Ctrl+O): the Firestore project picker. Opening one navigates to its Pages tool.
	// (B17 / X4: the module-level stores are not yet per project — the mock tree/models are shared.)
	let openProjectOpen = $state(false)
	function openProject(id: string) { if (id && id !== page.params.pid) goto(`/projects/${id}/pages`) }
	// The palette path ('Hibiya · 30F · Zone …') names the floor → the drawing views that floor's model.
	const floorOfPath = (path?: string) => path?.split(' · ').find((seg) => /^\d+F$/.test(seg))
	function pickPalette(i: PItem) { if (i.kind !== 'place') openDrawing({ title: i.title, kind: i.kind, preview: false, floor: floorOfPath(i.path) }) }
	function onGlobalKey(e: KeyboardEvent) {
		const mod = e.ctrlKey || e.metaKey
		const tag = (e.target as HTMLElement)?.tagName
		if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return   // don't hijack field editing
		if (mod && (e.key === 'k' || e.key === 'K')) {
			// Capture phase + stopImmediatePropagation so the app-wide Ctrl-K palette doesn't
			// also open on this page (it left a faded backdrop behind ours).
			e.preventDefault(); e.stopImmediatePropagation(); paletteOpen = true
		} else if (mod && !e.shiftKey && (e.key === 'o' || e.key === 'O')) { e.preventDefault(); openProjectOpen = true }   // File › Open Project…
		else if (mod && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); undo() }
		else if (mod && ((e.shiftKey && (e.key === 'z' || e.key === 'Z')) || e.key === 'y' || e.key === 'Y')) { e.preventDefault(); redo() }
		else if ((e.key === 'Delete' || e.key === 'Backspace') && selFrameId && active && !activeVpOf(active.id)) { e.preventDefault(); deleteSelAt(active.id, active.id, { begin: beginGesture, mark: (l?: string) => modelEdit(active!.id, l), end: endGesture }) }   // delete the selected viewport frame (paper space)
	}
	$effect(() => {   // capture phase — beats the +layout command palette on the Ctrl-K shortcut
		window.addEventListener('keydown', onGlobalKey, true)
		return () => window.removeEventListener('keydown', onGlobalKey, true)
	})
	let activeLayer = $derived(activeLayerIn(modelById(activeMid())?.layers ?? [])?.name ?? '')   // the layer new entities land on (R5: in the focused model)

	// Canvas · tools + pointer + zoom
	const TOOLS = [
		{ icon: 'k-select', name: 'Select' },
		{ icon: 'k-line', name: 'Line' },
		{ icon: 'rectangle', name: 'Rectangle' },
		{ icon: 'circle', name: 'Ellipse' },
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
	const STRIP: StripItem[] = [
		{ tool: 'Select' },
		{ tool: 'Line' },
		{ group: 'shapes', label: 'Shapes', members: ['Rectangle', 'Ellipse'] },   // 2D/footprint draws
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
		const v = canvasViewOf(pane), nz = clampCanvasZoom(v.zoom * f), ratio = nz / v.zoom   // up to 2000%
		setCanvasView(pane, { x: mx - (mx - v.x) * ratio, y: my - (my - v.y) * ratio, zoom: nz })
	}
	// Nav toolbar / status zoom act on the active viewport if one is active, else the canvas.
	// Which zoom the wheel/nav actually acts on: the viewport CONTENT only when a viewport is active
	// AND "Pan content" is on; otherwise the canvas. (Was always reading the view zoom when active,
	// so the status bar stuck at 100% while the wheel zoomed the canvas.)
	// B28: the ACTIVE viewport id, keyed the same way `activeVps`/viewState use it — a sheet's active
	// FRAME id, or a model-layout tab's own id if IT is active (null if nothing is). `zoomsContent`/
	// `navZoom`/`dispZoom` used to test/index by `p.activeId` (the TAB id) directly, which is never in
	// `activeVps` for a sheet (frames activate by their OWN id, never the tab's) — so the content branch
	// was never taken on a sheet and `+`/`−`/the status readout always acted on the paper canvas, even
	// with "Pan content" on.
	const activeViewportId = (p: { id: string; activeId: string }) => activeVpOf(p.activeId)
	const zoomsContent = (p: { id: string; activeId: string }) => (navContent || isModelLayout(p)) && !!activeViewportId(p)   // B31: model space always zooms its content
	// The projection of whatever's ACTIVE in this pane: a sheet's active FRAME's own `.proj` (B28 — was
	// always `projOf` here, which only resolves a model-layout TAB's projection and silently ignored a
	// sheet frame's actual proj, e.g. reporting 'plan' while a 'front' elevation frame was active), else
	// (no frame active, or a model-layout tab) the tab's viewState-backed `projOf`. Mirrors `gizmoProj`'s
	// sheet-vs-model split but falls back to `projOf` instead of the first frame when nothing is active.
	const activeProj = (p: { id: string; activeId: string }): Proj => {
		const t = session.tabs.find((x) => x.id === p.activeId) ?? null
		if (t?.kind === 'sheet') { const av = activeViewportId(p); const f = av ? framesOf(p.activeId).find((x) => x.id === av) : null; if (f) return f.proj as Proj }
		return projOf(p, t)
	}
	let dispZoom = $derived.by(() => {
		const p = session.panes[session.focused]; if (!p) return 100
		const av = activeViewportId(p)
		return Math.round((zoomsContent(p) && av ? viewOf(p.id, av, activeProj(p)).zoom : canvasViewOf(p).zoom) * 100)
	})
	function navZoom(f: number) {
		const p = session.panes[session.focused]; if (!p) return
		const av = activeViewportId(p)
		if (zoomsContent(p) && av) { const pr = activeProj(p), v = viewOf(p.id, av, pr); setView(p.id, av, pr, { ...v, zoom: clampViewZoom(v.zoom * f) }) }
		else { const v = canvasViewOf(p); setCanvasView(p, { ...v, zoom: clampCanvasZoom(v.zoom * f) }) }
	}
	// Fit a specific pane: frame its sheet paper (centred, with margin) or reset a model view.
	function fitPane(idx: number, opts: { skipIfPersisted?: boolean; explicit?: boolean } = {}) {
		const p = session.panes[idx]; if (!p) return
		const pr = activeProj(p)
		const av = activeViewportId(p)   // B28: was `isVpActive(p.activeId)` — see activeViewportId's comment above
		// B28 follow-up (eos-07 caught in review): `av` is truthy whenever a sheet FRAME is active, active
		// regardless of "Pan content" — but `fitPane` also runs from AUTOMATIC refits (mount, split/unsplit
		// resize, the Full-size layout toggle), none of which should silently reset a sheet frame's pan/zoom
		// the way an intentional Fit can. Reset the VIEWPORT's own content when: it's a model-layout tab
		// (`av === p.activeId`, unconditional — matches every pre-B28 trigger exactly, that case never
		// touched a sheet); OR it's a sheet frame AND this is an EXPLICIT Fit (button/menu — `navFit` alone
		// passes `explicit`) AND "Pan content" is on. Every other case still fits the PAPER below, same as
		// pre-B28 always did for a sheet.
		// B30: Fit resets the 3D orbit of the SAME viewport whose content it resets — the model tab, or the
		// active sheet FRAME (was always the TAB id, so a sheet frame's orbit never reset and a dead
		// tab-id × frame-proj entry was written). A paper fit touches no orbit.
		// …and a reload's mount refit leaves a model tab's REMEMBERED view alone (viewState persists it).
		if (av && av === p.activeId && opts.skipIfPersisted && viewState.hasView(p.id, didOf(av), pr)) return
		if (av && (av === p.activeId || (opts.explicit && zoomsContent(p)))) { setOrbit(p.id, av, pr, DEFAULT_YAW, DEFAULT_PITCH); setView(p.id, av, pr, { zoom: 1, x: 0, y: 0 }); return }
		// B27: the mount-time refit used to unconditionally overwrite a sheet's REMEMBERED canvas position
		// (localStorage) with a fresh "fit to paper" — so a saved 48% zoom came back at 97% after every
		// reload. `refitAll` (mount only) passes `skipIfPersisted`; an explicit Fit (menu/button/ViewCube)
		// still always re-fits.
		if (opts.skipIfPersisted && p.activeId && viewState.hasCanvas(p.id, didOf(p.activeId), didOf(p.activeId))) return
		const a2 = session.tabs.find(t => t.id === p.activeId)
		const canvas = canvasEls[idx]
		if (a2?.kind === 'sheet' && p.layout === 'sheet' && canvas && canvas.clientWidth > 50) {
			const r = canvas.getBoundingClientRect(), pd = paperDimsOf(p.activeId)
			const z = Math.min(r.width / pd.w, r.height / pd.h) * 0.9
			setCanvasView(p, { zoom: z, x: (r.width - pd.w * z) / 2, y: (r.height - pd.h * z) / 2 })
		} else {
			setCanvasView(p, { zoom: 1, x: 0, y: 0 })
		}
	}
	function navFit() { fitPane(session.focused, { explicit: true }) }
	// Refit every pane after the paper size/orientation changes (each pane may show a sheet). `opts` is
	// forwarded to `fitPane` — the mount-time caller below passes `skipIfPersisted` (B27); any FUTURE
	// caller (e.g. after an explicit paper-size change) should NOT, so it always re-fits. Neither this nor
	// its callers pass `explicit` — an automatic refit must never reset a sheet frame's own pan/zoom.
	function refitAll(opts: { skipIfPersisted?: boolean } = {}) { tick().then(() => session.panes.forEach((_, i) => fitPane(i, opts))) }

	// Print mechanics live in printing.ts (R9 commit 4) — this effect just owns the FOCUSED PANE's paper
	// (session/paperOf, per-instance state printing.ts deliberately doesn't know about) and the
	// mount/unmount wiring. `onBeforePrint` is rebuilt each time the effect re-runs (whenever the focused
	// paper changes) so 'beforeprint' always reads the CURRENT focused pane's paper at the moment the
	// browser actually fires it, not whatever was focused when the listener was first registered.
	$effect(() => {
		let style = document.getElementById(PRINT_ID) as HTMLStyleElement | null
		if (!style) { style = document.createElement('style'); style.id = PRINT_ID; document.head.appendChild(style) }
		style.textContent = printCss(paperOf(session.panes[session.focused]?.activeId))   // refreshed for the focused paper at print time (applyPrint)
		const onBeforePrint = () => applyPrint(paperOf(session.panes[session.focused]?.activeId))
		window.addEventListener('beforeprint', onBeforePrint)
		window.addEventListener('afterprint', removePrint)
		return () => {
			window.removeEventListener('beforeprint', onBeforePrint)
			window.removeEventListener('afterprint', removePrint)
			removePrint()
			document.getElementById(PRINT_ID)?.remove()
		}
	})

	// Fit each pane once on mount (layout is now per-pane; a pane refits itself when ITS layout or
	// projection changes — see the Full-size button + ViewCube — so the other pane is undisturbed).
	let mounted = false
	$effect(() => { if (!mounted) { mounted = true; refitAll({ skipIfPersisted: true }) } })
	let toggles = $state<Record<string, boolean>>({ GRID: true, SNAP: true, ORTHO: false, OSNAP: true, LWT: false, CEN: false })
	let snapStep = $state(100)   // SNAP grid spacing, model mm (status bar; was the fixed SNAP_STEP)
	// AutoCAD mode: wheel = zoom, draw = two clicks. Off = EOS: wheel = pan, draw = press-drag.
	let acadMode = $state(true)
	// Active-viewport content pan/zoom (Sheets-style): OFF by default, so wheel/drag over an
	// active viewport pans/zooms the CANVAS; toggle on to pan/zoom the model inside it.
	let navContent = $state(false)

	// Mock theme (scoped to .shell — demos both Kestrel looks, app untouched)
	let mockTheme = $state<'dark' | 'light'>('dark')

	// R9 workspace object (review.md §R9, eos-07's review of commit 1, point 3): small per-pane ACTIONS that
	// used to be built as one-off closures at each `<Pane>` call site (`onFocus={() => (session.focused =
	// pi)}` etc.) — now plain functions taking the pane/index explicitly, since Pane.svelte already has
	// `pane`/`pi` as its own props and can just call `ws.setFocused(pi)` itself.
	function setFocused(pi: number) { session.focused = pi }
	function toggleTabMenu(pi: number) { tabMenuPane = tabMenuPane === pi ? null : pi }
	function setPaneTool(pane: WorkPane, t: string) { pane.tool = t }
	function toggleLayout(pane: WorkPane) { pane.layout = pane.layout === 'model' ? 'sheet' : 'model' }
	function setCanvasEl(pi: number, el: HTMLElement | undefined) { canvasEls[pi] = el }
	// Bundles +page.svelte's ~30 doc/view accessor FUNCTIONS + the pane actions above into ONE prop every
	// pane-level component takes, instead of each being its own prop (an R6-callback-bundle problem one
	// level down, per eos-07's review). Built ONCE as a plain `const` — NOT `$derived.by`, which eos-07
	// caught rebuilding the whole object (a new `ws` identity) on every `statusText` change (fires on every
	// tool prompt / hover, from the Viewport's `status` callback), invalidating every `ws.x` read in BOTH
	// panes: `ws.vpEditor(a, …)`/`ws.envFor(p)`/`ws.vpView(…)` etc. return NEW objects each rebuild, handing
	// Viewport/PaperPage fresh `editor`/`env`/`on` props on every pointer move for no reason — wasted work at
	// best, a re-fired effect/reset gesture at worst. The reassigned VALUE members (`tabs`, `statusText`,
	// `rev`, `revisions`, `acadMode`) are GETTERS instead, so reading `ws.statusText` tracks only
	// `statusText` — `ws` itself never changes identity, and every other `ws.x` read stays as narrow as
	// before this bundling. NOT the full B17 fix — the module-level singletons (models/layers/imgEdit/docs/
	// viewState/selStore) still leak across a project→project client-side navigation; that's Dave's call,
	// not started here.
	const workspace: Workspace = {
		get tabs() { return session.tabs }, kindIcon, STRIP, iconOf,
		get rev() { return rev }, get revisions() { return revisions }, get acadMode() { return acadMode }, get statusText() { return statusText },
		openTab, promoteTab, closeTab, addTab, pickFromMenu, splitVertical, closePane,
		setFocused, toggleTabMenu, setPaneTool, toggleLayout, setCanvasEl,
		activeVpOf, isVpActive, deactivateVp, onCanvasMove, canvasPan, canvasZoomFn: canvasZoom,
		framesOf, scaleOf, updateFrame, setScale, fitPane, canvasViewOf, entsOf, entsForModel, paperEditor,
		viewOf, envFor, orbitOf, vpFrameView, vpEditor, seedFrame, addFrame, commitFrame, paperOf, paperDimsOf,
		vpView, projOf, gizmoProj, gizmoSet, navZoom, navFit,
	}
</script>

<!-- Title = the active drawing's name so Save-as-PDF gets a clean filename (no app name / hyphen). -->
<svelte:head><title>{active?.title ?? 'Pages'}</title></svelte:head>

<div class="shell" data-mock-theme={mockTheme}>
	<!-- inside .shell so the palette's CSS tokens (var(--panel)/--text/…) resolve -->
	{#if paletteOpen}<CommandPalette items={paletteItems} onpick={pickPalette} onclose={() => (paletteOpen = false)} />{/if}
	{#if openProjectOpen}<OpenProjectDialog currentId={page.params.pid} onpick={openProject} onclose={() => (openProjectOpen = false)} />{/if}
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

	<!-- Body: left · editor-area (1–2 session.panes) · right -->
	<div class="body">

		<!-- Left sidebar: Drawing Navigator (location tree → drawings/views) -->
		{#if leftOpen}
			<aside class="side left">
				<DrawingNavigator tree={realTree?.tree ?? null} project={realTree?.project ?? null} status={navStatus}
					placesMode={hasPlaces} onseedplaces={canSeedPlaces ? seedPlaces : undefined}
					onplaceadd={onPlaceAdd} onplacerename={onPlaceRename} onplacemove={onPlaceMove} onplacedelete={onPlaceDelete}
					onopenplace={hasPlaces ? (id, preview) => { restoredFor = page.params.pid ?? ''; openPlaceModel(id, preview) } : undefined}
					onsheetadd={hasPlaces ? onSheetAdd : undefined} onplaceimport={hasPlaces ? (id) => void importPlaceOutlets(id) : undefined} onsheetrename={(rowId, t) => renameSheet(rowId.slice(2), t)} onsheetarchive={(rowId) => archiveSheet(rowId.slice(2))}
					onaddbuilding={(n) => projectSrc?.addBuilding(n).catch((e) => { toast(`Couldn't add the building: ${e?.message ?? e}`); return false }) ?? Promise.resolve(false)}
					onmovefloor={(f, b) => projectSrc?.moveFloor(f, b).catch((e) => toast(`Couldn't move the floor: ${e?.message ?? e}`))}
					onmovebuilding={(n, t, after) => projectSrc?.moveBuilding(n, t, after).catch((e) => toast(`Couldn't reorder: ${e?.message ?? e}`))}
					onopen={navOpen} onopenfloor={openFloorModel} oncollapse={() => (leftOpen = false)} onselectnode={navSelect} reveal={treeReveal}
					activeDoc={active?.docId ?? ''} activeNode={session.treeNode?.id ?? ''} />
			</aside>
		{:else}
			<button class="rail left" title="Show panel" onclick={() => (leftOpen = true)}>
				<Icon name="chevronRight" size={13} /><Icon name="layers" size={15} />
			</button>
		{/if}

		<!-- Editor area: one pane, or two split vertically -->
		<div class="editor-area" class:split={session.panes.length === 2}>
			{#each session.panes as p, pi (p.id)}
				<Pane pane={p} {pi} focused={session.focused === pi} {splitFrac} panesCount={session.panes.length}
					tabMenuOpen={tabMenuPane === pi}
					bind:navContent bind:guideVert bind:openGroup bind:groupTool
					ws={workspace} />
				{#if session.panes.length === 2 && pi === 0}
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
					<LayersPanel layers={modelById(activeMid())?.layers ?? []} frozen={activeFrame?.frozen ?? (activeFrame ? [] : null)} onfreeze={toggleVpFreeze} />
				{:else if rightTab === 'props'}
					<PropertiesPanel ents={selEnts} onupdate={(e) => { if (active) updateEnt(active.id, e) }}
						onarrange={(op) => { if (active) reorderEnts(active.id, activeEntIds(), op) }}
						pageTitle={active?.title ?? ''} pageKind={active?.kind ?? ''}
						onpagetitle={(t) => { if (!active || !t.trim()) return; const sid = sheetIdOf(active.docId); if (sid) renameSheet(sid, t); else active.title = t.trim() }} {activeLayer} node={session.treeNode} {nodeInfo} onnodefield={setNodeField}
						modelObj={selModelObj} modelLayers={modelById(activeMid())?.layers ?? []} onmodelupdate={updateModelObj} onmodeldelete={deleteModelObj} onmodelseg={updateModelSeg}
						frameObj={selFrameObj} onframefit={fitSelectedFrame}
						modelList={models.map((m) => ({ id: m.id, name: m.name }))}
						activeFrameId={active && activeVpOf(active.id) !== active.id ? (activeVpOf(active.id) ?? undefined) : undefined} scaleN={propsScaleN}
						onframeupdate={(patch) => { if (active && selFrameId) { ensureHist(active.id); updateFrame(active.id, selFrameId, patch as Partial<SheetFrame>); commitFrame(active.id, 'Edit viewport') } }}
						onframedelete={() => { if (active) deleteSelAt(active.id, active.id, { begin: beginGesture, mark: (l?: string) => modelEdit(active!.id, l), end: endGesture }) }} />
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
	<StatusBar bind:toggles bind:snapStep bind:acadMode
		paperSize={paperOf(session.panes[session.focused]?.activeId).size} paperLandscape={paperOf(session.panes[session.focused]?.activeId).landscape}
		onpapersize={(s) => setPaper(session.panes[session.focused]?.activeId, { size: s })}
		onorient={(l) => setPaper(session.panes[session.focused]?.activeId, { landscape: l })}
		paperMargin={paperOf(session.panes[session.focused]?.activeId).margin ?? DEFAULT_MARGIN_MM}
		onmargin={(mm) => setPaper(session.panes[session.focused]?.activeId, { margin: mm })}
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

	/* Body */
	.body { flex:1 1 auto; display:flex; min-height:0; }

	/* Editor area — 1 pane, or 2 split vertically with a draggable divider. Each pane's own layout
	   (tab bar / canvas / tool strip / …) is scoped inside parts/Pane.svelte (R9). */
	.editor-area { flex:1 1 auto; display:flex; min-width:0; }
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

	.rail { flex:0 0 auto; width:28px; display:flex; flex-direction:column; align-items:center; gap:10px; padding-top:8px;
		background:var(--panel); color:var(--muted); border:none; }
	.rail.left { border-right:1px solid var(--line); } .rail.right { border-left:1px solid var(--line); }
	.rail:hover { background:var(--hover); color:var(--text); }


</style>
