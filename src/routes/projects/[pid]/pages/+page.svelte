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
	import { goto, replaceState } from '$app/navigation'
	import PaperPage from './parts/PaperPage.svelte'
	import DrawingsDialog from './parts/DrawingsDialog.svelte'
	import Pane from './parts/Pane.svelte'
	import { newId } from './ids'
	import { viewState, type View3d } from './viewState.svelte'
	import { docs } from './doc.svelte'
	import { type Proj, type SheetFrame, type Kind, type Tab, type WorkPane, type View, type StripItem, type Workspace, SCALES, DIR_LABEL as PROJ_LABEL } from './types'
	import { PACKAGES, VERSIONS, REVISIONS, type PItem, PALETTE_ITEMS as paletteItems, navDrawingId } from './mock/data'
	import Viewport from './ui/Viewport.svelte'
	import type { VpOn, NavMode } from './ui/vpTypes'
	import type { Editor } from './ui/editor'
	import DrawingNavigator from './parts/DrawingNavigator.svelte'
	import LayersPanel from './parts/LayersPanel.svelte'
	import PropertiesPanel from './parts/PropertiesPanel.svelte'
	import { activeLayerIn, isLayerHidden, addLayer, layerUI } from './layers.svelte'
	import { fitFrame } from './ui/frameFit'
	import HistoryPanel from './parts/HistoryPanel.svelte'
	import StatusBar from './parts/StatusBar.svelte'
	import CommandLine from './parts/CommandLine.svelte'
	import HelpDialog from './parts/HelpDialog.svelte'
	import UploadPicker from './parts/UploadPicker.svelte'
	import NoteDialog from './parts/NoteDialog.svelte'
	import { textDialog } from './ui/textDialog.svelte'
	import { readingOrder } from './ui/frameNumber'
	import { fromClipData, fromClipHtmlData, textToShape } from './ui/clipboard'
	import { htmlToMarkdown } from './ui/htmlToMd'
	import { cmdBus } from './ui/cmdBus.svelte'
	import { openingSpec } from './ui/openingSpec.svelte'
	import { createUploadThing } from '../uploads/uploader'
	import { commandById, primaryName } from './ui/commands'
	import { CommandRunner } from './ui/commandRunner.svelte'
	import ViewGizmos from './parts/ViewGizmos.svelte'
	import Menubar from './parts/Menubar.svelte'
	import CommandPalette from './parts/CommandPalette.svelte'
	import OpenProjectDialog from './parts/OpenProjectDialog.svelte'
	import DrawingDefaultsDialog from './parts/DrawingDefaultsDialog.svelte'
	import { CanvasNav } from './canvasNav.svelte'
	import { PageActions, type ActiveView } from './pageActions'
	import { outletSticky, rememberOutlet, walk, incLabel } from './ui/outletPlace.svelte'
	import { outletRows, exportOutletSchedule } from './store/outletSchedule'
	import { isOutletEnt } from './store/allocate'
	import { panzoom } from './ui/panzoom'
	import { paperDims, scaleDenom, PAPER_PX_PER_MM, DEFAULT_MARGIN_MM, type PaperSize } from './constants'
	import { PRINT_ID, printCss, applyPrint, removePrint } from './printing'
	import type { Ent, ElevDir, Pt } from './ui/geometry'
	import { PLAN_CX, PLAN_CY, GROUND, frameOf, frameAxis, frameU, frameSetU } from './ui/geometry'
	import type { ViewCtx } from './ui/view'
	import { bbox as entBBox, onPlanPlane } from './ui/hit'
	import { models, modelById, floorModelId, FLOOR_MODEL_ID } from './3dview/models.svelte'
	import { nextFrameSeq } from './store/mappers'
	import { getContext, untrack } from 'svelte'
	import type { Firestore, Session as AuthSession } from '$lib'
	import { findNodePath } from './projectTree'
	import { PagesProject, sheetIdOf, SHEET } from './pagesProject.svelte'
	import { WorkspaceHistory } from './history.svelte'
	import { DocEdit } from './docEdit.svelte'
	import { clipOf, pasteClip, saveClip, loadClip, type FrameClip } from './ui/frameClip'
	import PrintBook, { type BookApi } from './parts/PrintBook.svelte'
	import BlocksPanel from './parts/BlocksPanel.svelte'
	import { blockFromShapes } from './ui/blocks'
	import { saveBlock, blockList, isDefaultBlock, deleteBlock } from './blocks.svelte'
	import { sheetLinkUrl } from './store/schema'
	import { modelForPlace } from './3dview/models.svelte'
	import { storeyMap } from './3dview/storeyMap'
	import { BASIS } from './3dview/types'
	import { objBounds, oclipOf, oclipWidth, oclipFrame, modelZRange } from './3dview/projection'
	import { devObliqueFrame } from './ui/devOblique'
	import { sectionTitle, sectionLinksOf, type SectionLink, type LinkSource } from './ui/sectionLine'
	import { sectionOClip, sectionClip, sectionDir, sectionAllHeights } from './ui/elevMarker'
	import { sectionSpec } from './ui/sectionSpec.svelte'
	import { deleteSection as deleteSectionIn, updateSection as updateSectionIn } from './ui/modelEdit'
	import SectionDeleteDialog from './parts/SectionDeleteDialog.svelte'
	import { modelVersionState, sheetEditedSinceIssue } from './store/versions'
	import type { TitleBlockTemplate } from './titleBlock'
	import { DEFAULT_YAW, DEFAULT_PITCH } from './3dview/projection'
	import type { Model, ModelId, Section, Clip, OClip } from './3dview/types'
	import { selStore } from './selStore.svelte'
	import { selOnly, selToggle, selClear, idsOfKind, singleOfKind, type Selection, type SelItem } from './ui/selection'

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
	// elevations pass through as their own kind (the Viewport projects each through its view frame, geometry ElevFrame).
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
	const envFor = (pane: { id: string; activeId: string }) => ({ acad: acadMode, navContent, navMode, blockId: placeBlock ?? undefined, grid: toggles.GRID, lwt: toggles.LWT, osnap: toggles.OSNAP, snap: toggles.SNAP, ortho: toggles.ORTHO, polar: toggles.POLAR, otrack: toggles.OTRACK, wire: toggles.WIRE, cen: toggles.CEN, snapStep, guideVert, canvasZoom: isModelLayout(pane) ? 1 : canvasViewOf(pane).zoom })   // B31: model space has no canvas zoom
	// R6: the Viewport's callback bundle is split in two. `vpView` → `VpOn` (view/camera events only —
	// still one `on` prop); `vpEditor` → `Editor` (document-mutating ops — entity array, undo-history
	// bracket, section-marker selection). PaperPage also uses `frame`; the plain Viewport ignores it.
	const vpView = (a: Tab, pane: { id: string; tool: string }): VpOn => ({
		activate: () => activateVp(a.id), deactivate: () => deactivateVp(a.id),
		view: (v: View) => setView(pane.id, a.id, projOf(pane, a), v),
		status: (t: string) => (statusText = t), coords: (x: number, y: number) => (worldXY = { x, y }),
		tool: (t: string) => (pane.tool = t), scale: (s: string) => setScale(a.id, s),
		orbit: (yaw: number, pitch: number) => setOrbit(pane.id, a.id, projOf(pane, a), yaw, pitch),
		openLink,
		dropFiles: (fs, at) => { activateVp(a.id); void insertFiles(fs, at) },
	})
	/** D4: a symbol's link — a URL opens in a new browser tab, a sheet id opens that sheet. */
	function openLink(link: string) {
		if (/^https?:\/\//i.test(link)) window.open(link, '_blank', 'noopener')
		else if (proj.store?.sheets.some((s) => s.id === link)) proj.openSheetById(link)
		else toast('The linked sheet no longer exists')
	}
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
				add: (e: Ent) => addEnt(a.id, e), update: (e: Ent) => updateEnt(a.id, e), updateMany: (es: Ent[]) => updateEnts(a.id, es),
				delete: (ids: string[]) => { deleteEnts(a.id, ids); selStore.set(viewId, selClear()) },
				copy: (ids: string[], objIds?: string[]) => copyEnts(a.id, ids, objIds),
				cut: (ids: string[], objIds?: string[]) => { cutEnts(a.id, ids, objIds); selStore.set(viewId, selClear()) },
				paste: () => selectPasted(viewId, pasteEnts(a.id)),
				group: (ids: string[]) => groupEnts(a.id, ids), ungroup: (ids: string[]) => ungroupEnts(a.id, ids),
				reorder: (ids: string[], op: 'front' | 'back' | 'forward' | 'backward') => reorderEnts(a.id, ids, op),
			},
			edit,
			sections: { dropDir: (id: string, dir: ElevDir) => dropSectionDir(id, dir), links: sectionLinks, openLink: openSectionLink, askDelete: askSectionDelete },
			sel: {
				get: () => selStore.of(viewId),
				only: (items: SelItem[]) => selStore.set(viewId, selOnly(items)),
				toggle: (items: SelItem[]) => selStore.set(viewId, selToggle(selStore.of(viewId), items)),
				clear: () => selStore.set(viewId, selClear()),
				delete: () => deleteSelAt(a.id, viewId, edit),
			},
		}
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
	// Iso ORBIT (yaw/pitch), per pane+tab so split 3D views orbit independently. Drag the iso view to rotate.
	// viewId = a tab id (→ its drawing's docId) or a sheet frame id (kept) — see the view-state KEYS note above.
	const orbitOf = (paneId: string, viewId: string, proj: Proj) => { const m = viewState.getView3d(paneId, didOf(viewId), proj); return { ...(viewState.getOrbit(paneId, didOf(viewId), proj) ?? { yaw: DEFAULT_YAW, pitch: DEFAULT_PITCH }), view3d: m, persp: m !== 'iso', wire: m === 'wire' } }
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
	/** The section a frame is linked to (its model's), else null (none / deleted / another model's). */
	function frameSection(f: SheetFrame, tabId?: string): Section | null {
		if (!f.section) return null
		const m = modelById(f.modelId ?? (tabId ? modelIdOf(tabId) : FLOOR_MODEL_ID))
		return m?.sections?.find((x) => x.id === f.section) ?? null
	}
	/** A frame's clip: a frame dropped from a SECTION follows that marker live (a line section / an elevation marker: the
	 *  axis box covering its region — what box-only code like the DXF export reads); else its own stored clip. */
	function liveClip(f: SheetFrame, tabId?: string): Clip | null {
		const s = frameSection(f, tabId)
		return s ? sectionClip(s) : f.clip
	}
	/** A frame's ORIENTED clip (phases 3–4): a frame linked to a section LINE or an ELEVATION MARKER reads its view LIVE —
	 *  every linked frame (any sheet) follows a move / turn / flip / width / depth change; unlinked (the marker gone, or
	 *  kept as a plain elevation) it keeps its last copy (`f.oclip`). null = no oriented view (a box section / a plain
	 *  frame). */
	function liveOClip(f: SheetFrame, tabId?: string): OClip | null {
		const s = frameSection(f, tabId)
		return (s && sectionOClip(s)) ?? f.oclip ?? null
	}
	/** A section-line / elevation-marker frame's ground-line title ("SECTION A–A′", "ELEVATION 1" or the marker's name);
	 *  undefined = the Viewport's own. */
	function frameViewTitle(f: SheetFrame, tabId?: string): string | undefined {
		const s = frameSection(f, tabId)
		return s && sectionOClip(s) ? sectionTitle(s).toUpperCase() : undefined
	}
	// Drop a section's view as a viewport FRAME LINKED to it (SheetFrame.section) on the current sheet: every call adds
	// ANOTHER one (Dave: a section usually drives several elevation viewports — on one sheet or many — each with its own
	// view-scoped annotations, freezes, scale, z band …; none of that lives on the section). A BOX drops direction `dir`
	// (its clip, live); a LINE / an ELEVATION MARKER ignores `dir` — its one view is its OClip (live, liveOClip), the
	// frame filed under the nearest ElevDir. The frame is sized to the view's proportions and fitted (scale + centred view).
	function dropSectionDir(id: string, dir: ElevDir) {
		const found = findSection(id); if (!found) return
		const sec = found.sec
		const oc = sectionOClip(sec), clip = sectionClip(sec)
		const view: ElevDir = sectionDir(sec, dir)
		const focusedTab = session.tabs.find((t) => t.id === session.panes[session.focused]?.activeId)
		const sheet = focusedTab?.kind === 'sheet' ? focusedTab : session.tabs.find((t) => t.kind === 'sheet')
		if (!sheet) { statusText = 'Open a sheet first to drop a section viewport'; return }
		openTab(sheet.id)
		ensureHist(sheet.id)
		const fid = newFrameId()
		const mdl = modelById(found.mid), ls = mdl?.layers ?? []
		// the frame takes the ELEVATION's proportions (along the view axis × the cut's height), not the plan box's
		// (the clip seen through the dir's frame: its oriented clip's width = the box's extent along the view axis). A line /
		// marker with no z band is as tall as the model.
		const zr = sectionAllHeights(sec) && mdl ? modelZRange(mdl.objects) : null
		const along = (oc ? oclipWidth(oc) : oclipWidth(oclipOf(clip, frameOf(dir)))) || 1
		const tall = (zr ? zr.z1 - Math.min(0, zr.z0) : Math.abs(clip.z1 - clip.z0)) || 1
		const W = 420, H = Math.max(120, Math.min(520, Math.round((W * tall) / along)))
		const n = framesOf(sheet.id).length, ox = 90 + (n % 5) * 24, oy = 90 + (n % 5) * 24
		const seq = nextFrameSeq(framesOf(sheet.id))
		// fit the cut into the frame (scale + centred view) — through the view frame the Viewport draws with (a line's:
		// its OClip's frame about the plan centre) — and LINK the frame to the section: editing the marker updates it live
		const vf = oc ? oclipFrame(oc, [PLAN_CX, PLAN_CY]) : null
		const fit = mdl ? fitFrame(mdl.objects, view, { w: W / PAPER_PX_PER_MM, h: H / PAPER_PX_PER_MM }, { clip, frame: vf, oclip: oc, visible: (o) => !isLayerHidden(ls, o.layer) }) : null
		setFrames(sheet.id, [...framesOf(sheet.id), { id: fid, x: ox, y: oy, w: W, h: H, border: 'solid', proj: view, scale: fit ? `1:${fit.n}` : scaleOf(sheet.id), clip: { ...clip }, ...(oc ? { oclip: oc } : {}), section: id, label: String(seq), seq, modelId: found.mid }])
		if (fit) for (const p of session.panes) setView(p.id, fid, view, fit.view)
		if (session.panes[session.focused]) { session.panes[session.focused].activeId = sheet.id; session.panes[session.focused].layout = 'sheet' }
		selStore.set(sheet.id, selOnly([{ kind: 'frame', id: fid }]))
		recordEdit(sheet.id, 'Drop section viewport')
	}
	// ── the frames a section drives (phase 3 / Dave: usually several, on several sheets) ──
	/** Every drawing to scan for linked frames: the loaded docs (with their stored sheet's number / title), and the
	 *  stored sheets not loaded yet. */
	function linkSources(): { loaded: LinkSource[]; stored: LinkSource[] } {
		const sheets = proj.store?.sheets ?? []
		const loaded = Object.values(docs.all()).map((d): LinkSource => {
			const sid = sheetIdOf(d.id), sh = sid ? sheets.find((x) => x.id === sid) : undefined
			return { did: d.id, ...(sid ? { sheetId: sid } : {}), title: sh?.title ?? session.tabs.find((t) => t.docId === d.id)?.title ?? d.title, number: sh?.drawingNumber, frames: d.frames }
		})
		const stored = sheets.map((sh): LinkSource => ({ did: SHEET + sh.id, sheetId: sh.id, title: sh.title, number: sh.drawingNumber, frames: sh.frames }))
		return { loaded, stored }
	}
	/** The sheet frames linked to section `id` (toolbar / Properties list; the delete ask). */
	function sectionLinks(id: string): SectionLink[] { const { loaded, stored } = linkSources(); return sectionLinksOf(id, loaded, stored) }
	/** Open a linked frame's sheet (a stored sheet loads first) with that frame selected on its paper. */
	async function openSectionLink(l: SectionLink) {
		if (l.sheetId && proj.store?.sheets.some((s) => s.id === l.sheetId)) proj.openSheetById(l.sheetId)
		else { const t = session.tabs.find((x) => x.docId === l.did); if (t) openTab(t.id); else { toast('That sheet isn’t open'); return } }
		await tick()
		const t = session.tabs.find((x) => x.docId === l.did); if (!t) return
		const p = session.panes[session.focused]; if (p) { p.activeId = t.id; p.layout = 'sheet' }
		selStore.set(t.id, selOnly([{ kind: 'frame', id: l.frameId }]))
	}
	/** Deleting a section that still drives viewports ASKS first (SectionDeleteDialog); false = nothing linked. */
	let secAsk = $state<{ id: string; title: string; links: SectionLink[] } | null>(null)
	function askSectionDelete(id: string): boolean {
		const links = sectionLinks(id), found = findSection(id); if (!links.length || !found) return false
		secAsk = { id, title: sectionTitle(found.sec), links }
		return true
	}
	/** The ask's answer, ONE undo step: the section goes, and its linked frames are either KEPT as plain elevations
	 *  (unlinked, still showing their last view: the box's clip / the line's OClip copied onto them) or DELETED too. */
	function finishSectionDelete(mode: 'keep' | 'delete') {
		const ask = secAsk; secAsk = null; if (!ask) return
		const found = findSection(ask.id), m = found && modelById(found.mid); if (!found || !m) return
		const sec = found.sec, clip = sectionClip(sec), oc = sectionOClip(sec)
		for (const sid of new Set(ask.links.flatMap((l) => (l.sheetId ? [l.sheetId] : [])))) proj.loadSheet(sid)   // their frames into the doc store (and the history)
		const tab = session.panes[session.focused]?.activeId ?? ''
		beginGesture()
		for (const did of new Set(ask.links.map((l) => l.did))) {
			const fs = docs.framesOf(did)
			const next = mode === 'delete' ? fs.filter((f) => f.section !== ask.id)
				: fs.map((f) => { if (f.section !== ask.id) return f; const { section: _s, ...rest } = f; return { ...rest, clip: { ...clip }, ...(oc ? { oclip: oc } : {}) } })
			if (mode === 'delete') for (const f of fs) if (f.section === ask.id) deactivateVp(f.id)
			docs.setFrames(did, readingOrder(next)); recordEdit(tab, 'Delete section')
		}
		deleteSectionIn(m, { begin: beginGesture, mark: (l?: string) => modelEdit(tab, l), end: endGesture }, ask.id)   // its end() closes the gesture: one step
		for (const vid of [activeSelViewId(), ...session.tabs.map((t) => t.id)]) if (vid && singleOfKind(selStore.of(vid), 'section')?.id === ask.id) selStore.set(vid, selClear())
		toast(mode === 'delete' ? `${sectionTitle(sec)} and its ${ask.links.length} viewport${ask.links.length === 1 ? '' : 's'} deleted` : `${sectionTitle(sec)} deleted — its viewports keep their last view`)
	}
	/** Properties › a section's field (name / depth / flip / z band): one undo step. */
	function updateSelSection(patch: Record<string, unknown>, label?: string) {
		const s = selSection; if (!s) return
		const m = modelById(s.mid), tab = session.panes[session.focused]?.activeId ?? ''
		if (m) updateSectionIn(m, { begin: beginGesture, mark: (l?: string) => modelEdit(tab, l), end: endGesture }, s.sec.id, patch, label)
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
	function setFrames(tabId: string, frames: SheetFrame[]) { docs.setFrames(didOf(tabId), readingOrder(frames)) }   // B4: numbered in reading order
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
		dropFiles: (fs, at) => { activateFrame(a.id, frame.id); void tick().then(() => insertFiles(fs, at)) },   // into THIS viewport's model
	})
	// Seed a sheet's DEFAULT viewport (fills the sheet, plan view) the first time PaperPage measures it —
	// this is the page's baseline, so it's not a recorded edit.
	function seedFrame(tabId: string, x: number, y: number, w: number, h: number) {
		if (framesOf(tabId).length || docs.get(didOf(tabId))?.seeded) return   // an EMPTIED sheet stays empty — only a new one gets the default viewport
		const id = newFrameId(), modelId = proj.newFrameModel(tabId)
		// fit the plan to the new viewport — its 3D objects AND its plan shapes / floorplan image (a zone's content
		// is often far from the drawing centre, so the sheet's default view would show it half off the frame)
		const mdl = modelById(modelId ?? modelIdOf(tabId) ?? FLOOR_MODEL_ID), ls = mdl?.layers ?? []
		const ctx: ViewCtx = { dir: 'plan', isPlan: true, isElev: false, isIso: false, elevDir: 'front', cx: PLAN_CX, cy: PLAN_CY, ground: GROUND, frameId: id, paperMm: scaleDenom(scaleOf(tabId)), mdl, yaw: 0, pitch: 0 }
		const extra = (mdl?.shapes ?? []).filter((e) => onPlanPlane(e) && (!e.space || e.space === 'model') && !isLayerHidden(ls, e.layer)).map((e) => entBBox(ctx, e))
		const fit = mdl ? fitFrame(mdl.objects, 'plan', { w: w / PAPER_PX_PER_MM, h: h / PAPER_PX_PER_MM }, { visible: (o) => !isLayerHidden(ls, o.layer), extra }) : null
		setFrames(tabId, [{ id, x: Math.round(x), y: Math.round(y), w: Math.round(w), h: Math.round(h), border: 'dashed', proj: 'plan', scale: fit ? `1:${fit.n}` : scaleOf(tabId), clip: null, label: '1', seq: 1, modelId }])
		if (fit) for (const p of session.panes) setView(p.id, id, 'plan', fit.view)
	}
	// A new viewport frame dragged on the paper (the Viewport tool): defaults to a plan view. Frame edits
	// (add / move / resize / delete / re-source) record on the page's per-doc history so Ctrl-Z works.
	function addFrame(tabId: string, x: number, y: number, w: number, h: number) {
		ensureHist(tabId)   // capture the pre-add baseline first
		const id = newFrameId(), seq = nextFrameSeq(framesOf(tabId))
		setFrames(tabId, [...framesOf(tabId), { id, x: Math.round(x), y: Math.round(y), w: Math.max(60, Math.round(w)), h: Math.max(60, Math.round(h)), border: 'solid', proj: 'plan', scale: scaleOf(tabId), clip: null, label: String(seq), seq, modelId: proj.newFrameModel(tabId) }])
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
		// a riser drawing with hidden floors fits its COLLAPSED extent (as drawn)
		const elev = f.proj !== 'plan' && f.proj !== 'iso'
		const sm = elev && f.storeys && mdl.storeys?.length ? storeyMap(mdl.storeys, f.storeys) : null, vs = elev ? BASIS[f.proj as ElevDir].vs : 1
		// an oblique view fits as drawn: a section LINE's (its live OClip, through the frame the Viewport uses — about the
		// plan centre), else a DEV console angle (ui/devOblique.ts) over the clip
		const clip = liveClip(f, a2.id), loc = elev ? liveOClip(f, a2.id) : null
		const dfr = loc ? oclipFrame(loc, [PLAN_CX, PLAN_CY]) : elev ? devObliqueFrame(f.id) : null
		const fit = fitFrame(mdl.objects, f.proj, { w: f.w / PAPER_PX_PER_MM, h: f.h / PAPER_PX_PER_MM },
			{ yaw: orb.yaw, pitch: orb.pitch, clip, frame: dfr, oclip: loc ?? (dfr && clip ? oclipOf(clip, dfr) : null), mapV: sm ? (v) => vs * sm.map(vs * v) : undefined,
				visible: (o) => !isLayerHidden(ls, o.layer) && !(o.layer && frozen.has(o.layer)) && !(sm && (() => { const b = objBounds(o); return sm.hidden(b.z0, b.z1) })()) })
		if (!fit) { statusText = 'Nothing visible to fit in this viewport'; return }
		ensureHist(a2.id); updateFrame(a2.id, f.id, { scale: `1:${fit.n}` }); commitFrame(a2.id, 'Fit viewport scale')
		setView(p.id, f.id, f.proj, fit.view)
	}
	// B2: copy / cut / paste / duplicate the selected viewport FRAME on paper (ui/frameClip.ts; the clipboard is in
	// localStorage, so it survives a reload and crosses sheets). Returns whether the key did anything.
	/** A frame's clip — with its CURRENT content view (focused pane) + orbit, so the copy opens looking at the same thing. */
	function frameClipOf(tabId: string, f: SheetFrame): FrameClip {
		const p = session.panes[session.focused], cl = clipOf([$state.snapshot(f) as SheetFrame], (mid) => $state.snapshot(entsForModel(mid)) as Ent[], modelIdOf(tabId))
		if (p) { const o = orbitOf(p.id, f.id, f.proj as Proj); cl.views = { [f.id]: { view: { ...viewOf(p.id, f.id, f.proj as Proj) }, yaw: o.yaw, pitch: o.pitch } } }
		return cl
	}
	/** Ctrl-drag on viewport frames (the editing engine asks): copies of them IN PLACE — their views, view-scoped notes
	 *  and numbering — returned so the engine drags the copies (the originals stay). Recorded with the drag's step. */
	function dupFramesInPlace(tabId: string, ids: string[]): SheetFrame[] {
		const fs = ids.map((id) => framesOf(tabId).find((x) => x.id === id)).filter((f): f is SheetFrame => !!f); if (!fs.length) return []
		const clips = fs.map((f) => frameClipOf(tabId, f))
		const clip: FrameClip = { frames: clips.flatMap((c) => c.frames), shapes: clips.flatMap((c) => c.shapes), views: Object.assign({}, ...clips.map((c) => c.views ?? {})) }
		const pasted = pasteClip(clip, (p) => newId(p), nextFrameSeq(framesOf(tabId)), 0)
		ensureHist(tabId)
		setFrames(tabId, [...framesOf(tabId), ...pasted.frames])
		for (const s of pasted.shapes) { const m = modelById(s.modelId); if (m) m.shapes = [...(m.shapes ?? []), s.ent] }
		applyClipViews(pasted)
		return pasted.frames
	}
	/** Ctrl RELEASED mid-drag: the in-place copies go again (with their view-scoped notes) — within the drag's step. */
	function removeFramesInPlace(tabId: string, ids: string[]) {
		const rm = new Set(ids), sp = new Set(ids.map((id) => `view:${id}`))
		setFrames(tabId, framesOf(tabId).filter((f) => !rm.has(f.id)))
		for (const m of models) if (m.shapes?.some((e) => e.space && sp.has(e.space))) m.shapes = m.shapes.filter((e) => !e.space || !sp.has(e.space))
	}
	/** A pasted clip's views → every pane's view state for the new frame ids. */
	function applyClipViews(c: FrameClip) {
		for (const fr of c.frames) { const v = c.views?.[fr.id]; if (!v) continue
			for (const p of session.panes) { setView(p.id, fr.id, fr.proj as Proj, v.view); if (v.yaw != null && v.pitch != null) setOrbit(p.id, fr.id, fr.proj as Proj, v.yaw, v.pitch) } }
	}
	function frameClipKey(tabId: string, k: 'c' | 'x' | 'v' | 'd'): boolean {
		// every selected frame (paper multi-select) — one clip, their relative layout kept
		const ids = new Set(idsOfKind(selStore.of(tabId), 'frame')), fs = framesOf(tabId).filter((f) => ids.has(f.id))
		const clip = (): FrameClip => { const cs = fs.map((f) => frameClipOf(tabId, f)); return { frames: cs.flatMap((c) => c.frames), shapes: cs.flatMap((c) => c.shapes), views: Object.assign({}, ...cs.map((c) => c.views ?? {})) } }
		if ((k === 'c' || k === 'x' || k === 'd') && !fs.length) return false
		const what = fs.length > 1 ? `${fs.length} viewports` : 'Viewport'
		if (k === 'c' || k === 'x') {
			const cl = clip(); saveClip(cl); navigator.clipboard?.writeText(JSON.stringify({ 'eos-pages-frames': 1, clip: cl })).catch(() => {}); toast(`${what} ${k === 'x' ? 'cut' : 'copied'}`)
			if (k === 'x') { ensureHist(tabId); setFrames(tabId, framesOf(tabId).filter((f) => !ids.has(f.id))); for (const id of ids) deactivateVp(id); recordEdit(tabId, `Cut ${what.toLowerCase()}`); selStore.set(tabId, selClear()) }
			return true
		}
		const src = k === 'd' ? clip() : loadClip(); if (!src) return false
		const pasted = pasteClip(src, (p) => newId(p), nextFrameSeq(framesOf(tabId)), Math.round(10 * PAPER_PX_PER_MM))
		ensureHist(tabId)
		setFrames(tabId, [...framesOf(tabId), ...pasted.frames])
		applyClipViews(pasted)
		let lost = 0
		for (const s of pasted.shapes) { const m = modelById(s.modelId); if (m) m.shapes = [...(m.shapes ?? []), s.ent]; else lost++ }
		for (const fr of pasted.frames) if (fr.modelId && !modelById(fr.modelId)) lost++
		recordEdit(tabId, `${k === 'd' ? 'Duplicate' : 'Paste'} ${pasted.frames.length > 1 ? pasted.frames.length + ' viewports' : 'viewport'}`)
		selStore.set(tabId, selOnly(pasted.frames.map((fr): SelItem => ({ kind: 'frame', id: fr.id }))))
		if (lost) toast('Pasted — its model isn’t in this project, so the frame shows “Missing model”')
		return true
	}
	/** J1 VP Lock: lock / unlock a layer in the active sheet frame only (one undo step, like VP Freeze). */
	function toggleVpLock(layerId: string) {
		const p = session.panes[session.focused], f = activeFrame; if (!p || !f) return
		ensureHist(p.activeId)
		const cur = f.vpLocked ?? [], on = cur.includes(layerId)
		updateFrame(p.activeId, f.id, { vpLocked: on ? cur.filter((x) => x !== layerId) : [...cur, layerId] })
		commitFrame(p.activeId, on ? 'VP unlock layer' : 'VP lock layer')
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
	/** The sheet frames the view tools (ViewCube, 3D popout, PERSPECTIVE, export, fit) act on: the ACTIVE viewport; else
	 *  the frames SELECTED on paper; else the sheet's only frame; else none (several frames, none picked — the tools
	 *  ask for one rather than guessing the first). */
	function targetFramesOf(tabId: string): SheetFrame[] {
		const fs = framesOf(tabId), av = activeVpOf(tabId)
		const act = av && av !== tabId ? fs.find((f) => f.id === av) : null; if (act) return [act]
		const sel = new Set(idsOfKind(selStore.of(tabId), 'frame')), picked = fs.filter((f) => sel.has(f.id))
		return picked.length ? picked : fs.length === 1 ? fs : []
	}
	function targetFrameOf(tabId: string): SheetFrame | null { return targetFramesOf(tabId)[0] ?? null }
	// The ViewCube reflects + re-aims a SHEET's target frame (above); a model-layout tab uses the per-pane viewState
	// projection as before.
	const gizmoProj = (pane: { id: string }, a: Tab | null): Proj => {
		if (a?.kind === 'sheet') return (targetFrameOf(a.id)?.proj ?? 'plan') as Proj
		return projOf(pane, a)
	}
	// A sheet viewport's DIRECTION change (ViewCube / 3D popout) is a PREVIEW until "Keep" (Dave 2026-09-26: a front view
	// accidentally left as 3D prints wrong). The original is remembered here; Revert — or leaving the viewport / the
	// sheet — puts it back. Keep makes it the viewport's direction (one undo step).
	let viewPreview = $state<Record<string, { tab: string; orig: Proj; label: string; wasActive: boolean }>>({})
	function revertView(frameId: string) {
		const p = viewPreview[frameId]; if (!p) return
		const { [frameId]: _, ...rest } = viewPreview; viewPreview = rest
		if (framesOf(p.tab).some((f) => f.id === frameId)) updateFrame(p.tab, frameId, { proj: p.orig, label: p.label })
	}
	function keepView(frameId: string) {
		const p = viewPreview[frameId]; if (!p) return
		const { [frameId]: _, ...rest } = viewPreview; viewPreview = rest
		recordEdit(p.tab, 'Change view direction')
	}
	$effect(() => {   // auto-revert: the viewport was left (deactivated), or its sheet isn't the focused tab any more
		const ids = Object.keys(viewPreview), focusedTab = session.panes[session.focused]?.activeId
		const act = ids.map((id) => isVpActive(id))
		untrack(() => ids.forEach((id, i) => {
			const p = viewPreview[id]; if (!p) return
			if (act[i] && !p.wasActive) viewPreview = { ...viewPreview, [id]: { ...p, wasActive: true } }
			else if ((p.wasActive && !act[i]) || focusedTab !== p.tab) revertView(id)
		}))
	})
	function gizmoSet(pane: { id: string }, a: Tab | null, proj: Proj) {
		if (a?.kind === 'sheet') {
			const fs = targetFramesOf(a.id)
			if (!fs.length) { toast('Select a viewport first — click its border (or double-click into it)'); return }
			for (const f of fs) {
				const av = f.id
				// a sheet viewport: a projection it has a view for keeps it; a new one opens CENTRED on the content at the
				// frame's own scale (carrying a focus point could land on empty space — Dave lost a copied viewport's front)
				if (proj !== 'iso' && !viewState.hasView(pane.id, didOf(av), proj)) centreFrameContent(pane.id, a.id, f, proj)
				if (!viewPreview[av]) viewPreview = { ...viewPreview, [av]: { tab: a.id, orig: f.proj as Proj, label: f.label, wasActive: isVpActive(av) } }
				updateFrame(a.id, av, f.seq != null ? { proj } : { proj, label: PROJ_LABEL[proj] })   // a numbered frame keeps its label
				if (viewPreview[av]?.orig === proj) { const { [av]: _, ...rest } = viewPreview; viewPreview = rest }   // back where it started
			}
		}
		else if (a) { carryFocus(pane.id, a.id, projOf(pane, a), proj, scaleDenom(scaleOf(a.id))); viewState.setProj(pane.id, didOf(a.id), proj) }
	}
	/** Centre a sheet frame's content for projection `proj` at the frame's own scale (its zoom kept): the model's
	 *  objects (+ in plan, its plan shapes / floorplan). */
	function centreFrameContent(paneId: string, tabId: string, f: SheetFrame, proj: Proj) {
		const mdl = modelById(f.modelId ?? modelIdOf(tabId)); if (!mdl) return
		const ls = mdl.layers ?? [], n = scaleDenom(f.scale ?? scaleOf(tabId))
		const ctx: ViewCtx = { dir: 'plan', isPlan: true, isElev: false, isIso: false, elevDir: 'front', cx: PLAN_CX, cy: PLAN_CY, ground: GROUND, frameId: f.id, paperMm: n, mdl, yaw: 0, pitch: 0 }
		const extra = proj === 'plan' ? (mdl.shapes ?? []).filter((e) => onPlanPlane(e) && (!e.space || e.space === 'model' || e.space === 'view:' + f.id) && !isLayerHidden(ls, e.layer)).map((e) => entBBox(ctx, e)) : []
		const loc = proj !== 'plan' && proj !== 'iso' ? liveOClip(f, tabId) : null   // a section line's view: as the Viewport draws it
		const fit = fitFrame(mdl.objects, proj, { w: f.w / PAPER_PX_PER_MM, h: f.h / PAPER_PX_PER_MM }, { clip: liveClip(f, tabId), frame: loc ? oclipFrame(loc, [PLAN_CX, PLAN_CY]) : null, oclip: loc, visible: (o) => !isLayerHidden(ls, o.layer), extra }); if (!fit) return
		const z = viewOf(paneId, f.id, f.proj as Proj).zoom || 1, k = (z * fit.n) / n   // fit's view is at 1:fit.n, zoom 1 → this frame's scale + zoom
		setView(paneId, f.id, proj, { zoom: z, x: PLAN_CX * (1 - z) + fit.view.x * k, y: PLAN_CY * (1 - z) + fit.view.y * k })   // view + z·(C + (P − C)/N) = C at the content's middle
	}
	// Keep your place across a view switch (plan ↔ elevations): the 3D point at the centre of the view you leave is
	// put at the centre of the one you open, at the same zoom. A view only knows two of the three coordinates, so the
	// third comes from the last focus of that viewport (e.g. plan → front keeps the height you last looked at in an
	// elevation). Iso keeps its own view. Drawing coords: plan = the model footprint (x, y); an elevation = (elevU of
	// its axis, GROUND − z). The view maps P to  view + zoom · (C + (P − C) / N)  about the plan centre C.
	const focusOf = new Map<string, { x?: number; y?: number; z?: number }>()
	function carryFocus(paneId: string, vid: string, from: Proj, to: Proj, n: number) {
		if (from === to || from === 'iso' || to === 'iso') return
		const d = 1 / (n || 1), v0 = viewOf(paneId, vid, from)
		const at = (vx: number, c: number) => c + ((c - vx) / v0.zoom - c) / d   // the drawing coord at the view centre
		const px = at(v0.x, PLAN_CX), py = at(v0.y, PLAN_CY), key = paneId + '|' + vid
		const f = { ...focusOf.get(key) }
		if (from === 'plan') { f.x = px; f.y = py }
		else {   // an elevation knows the plan coords its frame moves along (the on-axis one for the four dirs; both when oblique)
			const fr = frameOf(from as ElevDir), ax = frameAxis(fr), q = frameSetU(fr, [f.x ?? PLAN_CX, f.y ?? PLAN_CY], px)
			if (ax !== 1) f.x = q[0]; if (ax !== 0) f.y = q[1]; f.z = GROUND - py
		}
		focusOf.set(key, f)
		const v1 = viewOf(paneId, vid, to), put = (P: number | undefined, c: number, keep: number) => (P == null ? keep : c - v0.zoom * (c + d * (P - c)))
		if (to === 'plan') setView(paneId, vid, 'plan', { zoom: v0.zoom, x: put(f.x, PLAN_CX, v1.x), y: put(f.y, PLAN_CY, v1.y) })
		else {
			const fr = frameOf(to as ElevDir), ax = frameAxis(fr), known = (ax === 1 || f.x != null) && (ax === 0 || f.y != null)
			setView(paneId, vid, to, { zoom: v0.zoom, x: put(known ? frameU(fr, [f.x ?? PLAN_CX, f.y ?? PLAN_CY]) : undefined, PLAN_CX, v1.x), y: put(f.z == null ? undefined : GROUND - f.z, PLAN_CY, v1.y) })
		}
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
	let selFrameIds = $derived(active ? idsOfKind(selStore.of(active.id), 'frame') : [])   // several frames (paper multi-select)
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
	// an image imported without entering a viewport) the SELECTED (or only) frame's, else the first frame's model; else
	// the tab's own model; else the floor. Drawing needs an active viewport, so the fallbacks only bite for
	// viewport-less actions.
	function modelIdOf(tabId: string): ModelId {
		return targetFrameOf(tabId)?.modelId ?? framesOf(tabId)[0]?.modelId ?? session.tabs.find((t) => t.id === tabId)?.modelId ?? FLOOR_MODEL_ID
	}
	const mdlEntsOf = (mid: ModelId): Ent[] => modelById(mid)?.shapes ?? []
	/** F12: a conduit of a model by id (a fill-rate frame's content). */
	const conduitOf = (mid: ModelId | undefined, id: string) => { const o = modelById(mid ?? FLOOR_MODEL_ID)?.objects.find((x) => x.id === id); return o?.type === 'conduit' ? o : null }
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
	const activeObjIds = (): string[] => idsOfKind(selStore.of(activeSelViewId()), 'obj')
	/** Select what a paste added: its shapes, else its 3D objects (a selection holds one kind or the other). */
	function selectPasted(vid: string, p: { ents: Ent[]; objs: { id?: string }[] } | undefined) {
		if (p?.ents.length) selStore.set(vid, selOnly(p.ents.map((c): SelItem => ({ kind: 'ent', id: c.id }))))
		else if (p?.objs.length) selStore.set(vid, selOnly(p.objs.flatMap((o): SelItem[] => (o.id ? [{ kind: 'obj', id: o.id }] : []))))
	}
	// View (content pan/zoom) is keyed by PANE + view + PROJECTION, so a split pans each pane independently
	// AND each projection of a viewport (plan / front / … / 3D) remembers its own framing — flipping the
	// ViewCube restores that view's pan/zoom instead of carrying one framing across all directions.
	// Backed by viewState.svelte.ts (R2); `viewKey` re-exported there for anything that still needs the
	// raw key string.
	const viewOf = (paneId: string, viewId: string, proj: Proj) => viewState.getView(paneId, didOf(viewId), proj)
	// The global UNDO timeline + gesture folding (a drag / nudge burst = one step) — history.svelte.ts. The
	// aliases keep the call sites short: ensureHist before a mutation, recordEdit after it.
	const timeline = new WorkspaceHistory({
		markDirty: (id) => { const t = session.tabs.find((x) => x.id === id); if (t && !t.dirty) t.dirty = true },
		promoteTab: (id) => promoteTab(id),
	})
	const { ensure: ensureHist, addDoc: addDocToHistory, addModel: addModelToHistory, push: pushStep, beginGesture, endGesture,
		record: recordEdit, undo, redo, jump: jumpHistory } = timeline
	// The document-mutating operations (entities, clipboard, groups, draw order, model-object edits, layer delete,
	// delete-selection) live in docEdit.svelte.ts; destructured so the call sites stay short.
	const docEdit = new DocEdit({
		timeline, modelIdOf, activeMid, activeSelViewId, entsOf, deleteFrame: (t, f) => deleteFrame(t, f),
		focusedTabId: () => session.panes[session.focused]?.activeId,
		scaleN: () => propsScaleN, selModelObj: () => selModelObj, selModelObjs: () => selModelObjs,
		drawingDefaults: () => proj.store?.project?.drawingDefaults,
		askSectionDelete: (id) => askSectionDelete(id),
	})
	const { addEnt, updateEnt, updateEnts, deleteEnts, copyEnts, cutEnts, pasteEnts, groupEnts, ungroupEnts, reorderEnts, modelEdit,
		updateModelObj, updateModelObjs, deleteModelObj, addModelObj, updateModelSeg, layerItemCount, deleteLayerWithItems, deleteSelAt } = docEdit
	/** Ctrl+V (the browser's paste event — it reads the SYSTEM clipboard without a permission prompt): shapes copied in
	 *  another tab / project paste here; a pasted image (a screenshot) becomes an image shape; else our own copy. */
	/** Ctrl+Shift+V: the next paste centres on the cursor (the keydown sets it, the paste event uses it). */
	let pasteAtCursor = false, pasteAt: Pt | null = null
	function onPaste(e: ClipboardEvent) {
		const atCursor = pasteAtCursor; pasteAtCursor = false
		pasteAt = atCursor ? cmdBus.target?.cursor() ?? null : null
		if ((e.target as HTMLElement)?.closest?.('input, textarea, select, [contenteditable="true"]')) return
		const a = active; if (!a) return
		if (a.kind === 'sheet' && !activeVpOf(a.id)) {   // PAPER: viewport frames — from the system clipboard (another tab / browser), else ours
			const txt = e.clipboardData?.getData('text/plain') ?? ''
			if (txt.includes('eos-pages-frames')) { try { const o = JSON.parse(txt); if (o?.clip?.frames?.length) saveClip(o.clip) } catch { /* not ours */ } }
			if (frameClipKey(a.id, 'v')) e.preventDefault()
			return
		}
		const dt = e.clipboardData, plain = dt?.getData('text/plain') ?? '', html = dt?.getData('text/html') ?? ''
		const data = fromClipData(plain) ?? (html ? fromClipHtmlData(html) : null), ents = data && (data.ents.length || data.objs.length) ? data.ents : null
		const img = ents ? null : [...(dt?.files ?? [])].find((f) => f.type.startsWith('image/'))
		e.preventDefault()
		if (img) { void insertFiles([img], cmdBus.target?.cursor() ?? null); return }   // at the cursor, on the active layer
		if (data && ents) { docEdit.clipboard.load(data.ents, data.objs, data.layers); menuAction('Paste'); return }   // shapes and / or 3D objects
		// text from another app (Word / Excel / Notepad …): a text shape, or a NOTE keeping headings / bold / lists / tables
		const md = html ? htmlToMarkdown(new DOMParser().parseFromString(html, 'text/html')) : ''
		const shape = md && md.includes('\n') ? { kind: 'note' as const, text: md } : textToShape(md || plain)
		if (shape && cmdBus.target) { const err = cmdBus.target.placeText(shape.kind, shape.text); if (err) toast(err); return }
		menuAction('Paste')
	}
	$effect(() => { window.addEventListener('paste', onPaste); return () => window.removeEventListener('paste', onPaste) })
	// a file dropped OUTSIDE a viewport must not make the browser open it (navigating away from the workspace)
	$effect(() => {
		const stop = (e: DragEvent) => { if (e.dataTransfer?.types.includes('Files')) e.preventDefault() }
		window.addEventListener('dragover', stop); window.addEventListener('drop', stop)
		return () => { window.removeEventListener('dragover', stop); window.removeEventListener('drop', stop) }
	})
	// Pictures / PDFs from THIS COMPUTER — Insert › Image…, a paste (a screenshot …), a drag-and-drop from the OS: each
	// is uploaded to FILE STORAGE (UploadThing, the Uploads tool's route) and recorded in the project's Uploads (a
	// `files` doc, so it is listed there and in Insert › From Uploads…), then inserted on the ACTIVE layer, centred at
	// `at` (the drop point / the cursor) when given. Offline / a failed upload: a picture is kept in this page only.
	const { startUpload: uploadFile } = createUploadThing('floorplanUploader', {})
	const ctxDb = getContext('db') as Firestore | undefined
	/** A `files` doc id (the Uploads tool keys files by NAME, across projects): the name, else `name-2.ext`, … */
	async function freeFileName(name: string): Promise<string> {
		const db = ctxDb; if (!db) return name
		const dot = name.lastIndexOf('.'), base = dot > 0 ? name.slice(0, dot) : name, ext = dot > 0 ? name.slice(dot) : ''
		for (let i = 1; i < 50; i++) { const n = i === 1 ? name : `${base}-${i}${ext}`; if (!(await db.getOne('files', n).catch(() => null))) return n }
		return `${base}-${Date.now()}${ext}`
	}
	async function insertFiles(files: File[], at?: [number, number] | null) {
		const pid = page.params.pid ?? '', db = ctxDb
		for (const file of files.filter((f) => f.type.startsWith('image/') || /\.pdf$/i.test(f.name))) {
			const pdf = /\.pdf$/i.test(file.name)
			const raw = file.name && file.name !== 'image.png' ? file.name : `pasted-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, '-')}.png`
			toast(`Uploading ${raw}…`, { id: 'ins-file' })
			try {
				const name = await freeFileName(raw)
				const res = await uploadFile([new File([file], name, { type: file.type })])
				const r = res?.[0], url = r?.ufsUrl; if (!r || !url) throw new Error('no URL')
				await db?.save('files', { id: name, name, url, key: r.key, path: r.key, provider: 'uploadthing', size: file.size, projectId: pid, projectIds: [pid], uploadedAt: new Date(), ...(pdf ? { pageCount: 1 } : {}) })
				toast.dismiss('ins-file')
				await addUpload({ id: name, name, kind: pdf ? 'pdf' : 'image', url, pages: 1, projectId: pid, projectName: '', mine: true }, 1, at)
			} catch (err) {
				if (pdf) { toast.error(`Couldn't upload ${raw} (${err instanceof Error ? err.message : 'error'})`, { id: 'ins-file' }); continue }
				toast.warning(`Couldn't upload ${raw} (${err instanceof Error ? err.message : 'error'}) — kept in this page only`, { id: 'ins-file' })
				const fr = new FileReader(); fr.onload = () => addImage(String(fr.result)); fr.readAsDataURL(file)
			}
		}
	}
	function deleteSelection() { const a2 = active, vid = activeSelViewId(); if (a2 && vid) deleteSelAt(a2.id, vid, { begin: beginGesture, mark: (l?: string) => modelEdit(a2.id, l), end: endGesture }) }

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
	let activeModelSel = $derived([...idsOfKind(activeSel, 'obj'), ...idsOfKind(activeSel, 'guide'), ...idsOfKind(activeSel, 'node'), ...idsOfKind(activeSel, 'seg')])
	// K1: status-bar counts — outlets / conduits / racks in the selection, or the whole active model when nothing's selected.
	let sbCounts = $derived.by(() => {
		const m = modelById(activeMid())
		if (!m) return null
		const objIds = new Set(idsOfKind(activeSel, 'obj')), sel = selEnts.length > 0 || objIds.size > 0
		const ents = sel ? selEnts : (m.shapes ?? []), objs = sel ? m.objects.filter((o) => o.id && objIds.has(o.id)) : m.objects
		return { sel, outlets: ents.filter(isOutletEnt).length, conduits: objs.filter((o) => o.type === 'conduit').length, racks: objs.filter((o) => o.rack).length }
	})
	// The single selected 3D-model object (Properties panel edits it straight on the store, with undo).
	let selModelObj = $derived(activeModelSel.length === 1 ? (modelById(activeMid())?.objects.find(o => o.id === activeModelSel[0]) ?? null) : null)
	// Selecting a model object (plan / elevation / 3D pick) shows the Properties tab so its props are visible.
	$effect(() => { if (activeModelSel.length) { rightTab = 'props'; rightOpen = true } })
	// Selecting an entity likewise drops any tree-node selection (was `setSel`'s job pre-R3).
	$effect(() => { if (idsOfKind(activeSel, 'ent').length) session.treeNode = null })
	// Selecting a sheet viewport frame likewise shows its Properties.
	$effect(() => { if (selFrameIds.length) { rightTab = 'props'; rightOpen = true; session.treeNode = null } })
	// A selected SECTION marker (phase 3): its model + the section, for Properties (name / depth / flip / z band, the
	// viewports it drives); selecting one shows them.
	let selSectionId = $derived(singleOfKind(activeSel, 'section')?.id ?? null)
	let selSection = $derived(selSectionId ? findSection(selSectionId) : null)
	$effect(() => { if (selSectionId) { rightTab = 'props'; rightOpen = true; session.treeNode = null } })
	// Exit an image calibration mode when its image is no longer the (single) selection.
	$effect(() => { if (imgEdit.id && !(selEnts.length === 1 && selEnts[0].id === imgEdit.id)) clearImgMode() })
	// I4 / F8: several model objects selected (Ctrl/Shift-click) — edited together (docEdit.updateModelObjs).
	let selModelObjs = $derived.by(() => {
		const ids = new Set(idsOfKind(activeSel, 'obj')); if (ids.size < 2) return []
		return modelById(activeMid())?.objects.filter((o) => ids.has(o.id!)) ?? []
	})
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
		tick().then(() => { fitPane(0, { keepViews: true }); fitPane(1, { keepViews: true }) })   // both panes narrowed → refit their SHEETS (a model view keeps its pan / zoom)
	}
	function closePane(idx: number) {
		if (session.panes.length < 2 || idx === 0) return   // the left pane (p1) always remains; only the split closes
		session.panes = session.panes.filter((_, i) => i !== idx)
		session.focused = 0
		tick().then(() => fitPane(0, { keepViews: true }))
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
	let rightTab = $state<'layers' | 'props' | 'history' | 'blocks'>('layers')   // right sidebar tabs
	// D5: the block armed for placement (the Blocks panel); the focused pane's tool becomes 'Block' while armed
	let placeBlock = $state<string | null>(null)
	function armBlock(id: string | null) {
		placeBlock = id; navMode = null
		const p = session.panes[session.focused]; if (p) p.tool = id ? 'Block' : 'Select'
	}
	$effect(() => { if (placeBlock && session.panes.every((p) => p.tool !== 'Block')) untrack(() => (placeBlock = null)) })   // a tool pick / Esc disarms
	// E3: a WALK renumber from the selected outlet's label — the focused pane's tool becomes 'Renumber' until a tool
	// pick / Esc. Each click records its own step; when the walk ends they fold into one "Renumber" step
	// (history.squashSince) — unless an undo came in between, then they stay separate (never a corrupted step).
	let walkMark = 0
	function startWalk(label: string) {
		const p = session.panes[session.focused]; if (!p || !incLabel(label)) return
		walk.label = label; navMode = null; walkMark = timeline.mark(); p.tool = 'Renumber'
	}
	$effect(() => { if (walk.label !== null && session.panes.every((p) => p.tool !== 'Renumber')) untrack(() => { walk.label = null; timeline.squashSince(walkMark, 'Renumber') }) })
	/** D5: the selected shapes → a custom block in the global library. */
	function saveSelAsBlock(name: string) {
		if (!selEnts.length) return
		const { def } = blockFromShapes($state.snapshot(selEnts) as Ent[], newId('blk'), name)
		saveBlock(def)
		toast(`Saved block “${name}” — it's in the Blocks panel (Custom), for every project`)
	}

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
		else if (item === 'Cut') { const a = active, vid = activeSelViewId(); if (a) { cutEnts(a.id, activeEntIds(), activeObjIds()); selStore.set(vid, selClear()) } }
		else if (item === 'Copy') { const a = active; if (a) copyEnts(a.id, activeEntIds(), activeObjIds()) }
		else if (item === 'Paste') { const a = active, vid = activeSelViewId(), at = pasteAt; pasteAt = null; if (a && vid) selectPasted(vid, pasteEnts(a.id, at ?? undefined)) }
		else if (item === 'Delete') deleteSelection()
		else if (item === 'Image…') importImage((fs) => void insertFiles(fs))
		else if (item === 'From Uploads…') uploadPick = true
		else if (item === 'Outlet') { if (active) armBlock(outletSticky.block) }   // E1: the last-used outlet block, sticky ports / type / layer, next label
		// Insert › a drawing tool (Box = the Furniture tool): arms it in the focused pane, like the tool strip
		else if (MENU_TOOL[item] || TOOLS.some((t) => t.name === item)) { const p = session.panes[session.focused]; if (active && p) setPaneTool(p, MENU_TOOL[item] ?? item) }
		// Not-yet-implemented File items: tell the user instead of silently doing nothing (B8).
		else if (item === 'Open Project…') openProjectOpen = true
		else if (item === 'Drawing Defaults…') { if (proj.store) defaultsOpen = true; else toast('Drawing defaults are saved with the project — open a project first') }
		else if (item === 'Drawings…') { if (proj.hasPlaces) proj.drawingsOpen = true; else toast('Set up places first — drawings are managed per place') }
		else if (item === 'Export DXF…') exportActiveDxf()
		else if (item === 'Outlet Schedule…') {   // C2: the active model's outlets → Excel
			const m = modelById(activeMid()), rows = m ? outletRows(m, proj.allocatedOutlets) : []
			if (!rows.length) toast('No outlets in this model'); else exportOutletSchedule(rows, m!.name ?? 'model').then(() => toast(`Outlet schedule: ${rows.length} outlets`))
		}
		else if (item === 'Save') statusText = `Save isn't needed — edits save to the project as you go`
		// everything else is a mock no-op
	}
	// B7: a BOOK of sheets to print (the drawings dialog's selection), rendered by PrintBook
	let bookIds = $state<string[] | null>(null)
	const bookApi: BookApi = {
		page: (id) => {
			const ps = proj.store, sh = ps?.sheets.find((x) => x.id === id); if (!ps || !sh) return null
			const did = SHEET + id   // loaded before the book opens (openBook) — a $derived mustn't write state
			const p = docs.paperOf(did), dm = paperDims(p.size, p.landscape)
			return { id, did, title: sh.title, number: sh.drawingNumber, paper: p, w: dm.w, h: dm.h, link: sh.link ? sheetLinkUrl(ps.pid, sh.link) : undefined,
				modelId: sh.placeId ? modelForPlace(sh.placeId)?.id : undefined }
		},
		frames: (did) => docs.framesOf(did), scale: (did) => docs.scaleOf(did), tb: (did) => proj.titleBlockOf(did),
		entsForModel, conduitOf, view: (fid, pr) => viewState.getView('p1', fid, pr), orbit: (fid, pr) => orbitOf('p1', fid, pr),
		// a section-linked frame prints what it shows: its section's live clip / line view / title
		clip: (f) => liveClip(f), oclip: (f) => liveOClip(f), title: (f) => frameViewTitle(f),
	}
	function focusTool(t: string) { const p = session.panes[session.focused]; if (p) p.tool = t }
	// The COMMAND LINE (Kestrel's): draw commands arm the focused pane's tool; points / selection edits go to its
	// active viewport (ui/cmdBus); everything else lands here.
	let cmdLine: CommandLine | undefined = $state()
	let helpOpen = $state(false)   // the ? button / F1 / HELP (parts/HelpDialog)
	const namedViewKey = () => `eos.pages.views:${page.params.pid}:${active ? didOf(active.id) : ''}:${active ? (activeVpOf(active.id) ?? '') : ''}`
	let layIsoSaved: [string, boolean][] | null = null   // LAYISO → LAYUNISO: the visibility before isolating
	const cmdRunner = new CommandRunner({
		tool: (t) => { if (!active) return; if (placeBlock) armBlock(null); navMode = null; const tv = TOOL_VARIANT[t]; if (tv) tv.set(); focusTool(tv?.tool ?? t) },   // DOOR / WINDOW = the Opening tool with that type
		run: (id) => {
			const p = session.panes[session.focused]
			const toggle = (k: string) => { toggles[k] = !toggles[k]; statusText = `${k} ${toggles[k] ? 'on' : 'off'}` }
			const views: Record<string, Proj> = { plan: 'plan', front: 'front', rear: 'rear', left: 'left', right: 'right', iso: 'iso' }
			if (views[id]) {
				if (!p || !active) return 'Open a drawing first'
				// on a sheet only the ACTIVE viewport changes (never the first frame by default — that silently re-aims a drawing)
				if (active.kind === 'sheet' && !activeVpOf(active.id)) return 'Double-click a viewport on the sheet first (views change the active viewport)'
				gizmoSet(p, active, views[id]); return
			}
			const panel = { layers: 'layers', props: 'props', history: 'history', blockspanel: 'blocks', blocks: 'blocks' } as const
			if (id in panel) { rightTab = panel[id as keyof typeof panel]; rightOpen = true; return }
			const toggleKey: Record<string, string> = { grid: 'GRID', snap: 'SNAP', ortho: 'ORTHO', polar: 'POLAR', osnap: 'OSNAP', otrack: 'OTRACK', wire: 'WIRE', lwt: 'LWT' }
			if (toggleKey[id]) return toggle(toggleKey[id])
			switch (id) {
				case 'outlet': return menuAction('Outlet')
				case 'image': return menuAction('Image…')
				case 'fit': return navFit()
				case 'zoomin': return navZoom(1.25)
				case 'zoomout': return navZoom(0.8)
				case 'pan': navMode = 'pan'; return
				case 'orbit': navMode = 'orbit'; return
				case 'split': return splitVertical()
				case 'unsplit': return closePane(1)
				case 'undo': return undo()
				case 'redo': return redo()
				case 'dxfout': return menuAction('Export DXF…')
				case 'plot': return menuAction('Print…')
				case 'schedule': return menuAction('Outlet Schedule…')
				case 'drawings': return menuAction('Drawings…')
				case 'defaults': return menuAction('Drawing Defaults…')
				case 'save': statusText = `Save isn't needed — edits save to the project as you go`; return
				case 'new': return addTab()
				case 'open': openProjectOpen = true; return
				case 'help': helpOpen = true; return
			}
			return `${id}: not available yet`
		},
		newLayer: (name) => {
			const ls = modelById(activeMid())?.layers; if (!ls) return 'No model is open'
			const l = addLayer(ls); l.name = name.trim() || l.name
			return { name: l.name }
		},
		layerOp: (op, ids) => {
			const ls = modelById(activeMid())?.layers; if (!ls) return { err: 'No model is open' }
			const named = ids.map((id) => ls.find((l) => l.id === id)).filter((l): l is NonNullable<typeof l> => !!l)
			const names = named.map((l) => `“${l.name}”`).join(', ')
			const bg = (l: { group?: string }) => l.group === 'Background'
			switch (op) {
				case 'off': named.forEach((l) => (l.visible = false)); return `Layer ${names} is off${named.some((l) => l.id === layerUI.active) ? ' (it is the current layer)' : ''}`
				case 'frz':
					if (activeFrame) { for (const l of named) if (!(activeFrame.frozen ?? []).includes(l.id)) toggleVpFreeze(l.id); return `Layer ${names} frozen in this viewport` }
					named.forEach((l) => (l.visible = false)); return `Layer ${names} is off (no viewport is active — VP Freeze needs one)`
				case 'iso': layIsoSaved = ls.map((l) => [l.id, l.visible] as [string, boolean]); for (const l of ls) if (!bg(l)) l.visible = ids.includes(l.id); return `Isolated ${names} — LAYUNISO brings the others back`
				case 'uniso': { const s = layIsoSaved; if (!s) return { err: 'Nothing is isolated' }; for (const [id, v] of s) { const l = ls.find((x) => x.id === id); if (l) l.visible = v }; layIsoSaved = null; return 'Layers restored' }
				case 'on': ls.forEach((l) => (l.visible = true)); return 'Every layer is on'
			}
		},
		layers: () => (modelById(activeMid())?.layers ?? []).map((l) => ({ id: l.id, name: l.name })),
		blocks: () => blockList().map((b) => ({ id: b.id, name: b.name, custom: !isDefaultBlock(b.id) })),
		blockUsage: () => {
			const used = new Set<string>(), missing: { model: string; id: string; block?: string }[] = []
			const ms = models.filter((m) => !m.archived)
			for (const m of ms) for (const e of m.shapes ?? []) if (e.type === 'insert') {
				if (e.block) used.add(e.block)
				if (!blockList().some((b) => b.id === e.block)) missing.push({ model: m.name ?? m.id, id: e.id, block: e.block })
			}
			return { used, missing, models: ms.length }
		},
		deleteBlocks: (ids) => ids.forEach(deleteBlock),
		// VIEW: named views per project + drawing (+ the active viewport on a sheet), kept in this browser
		namedViews: () => { try { return JSON.parse(localStorage.getItem(namedViewKey()) ?? '{}') } catch { return {} } },
		saveNamedViews: (v) => { try { localStorage.setItem(namedViewKey(), JSON.stringify(v)) } catch { /* private mode */ } },
		perspective: (on) => {
			const p = session.panes[session.focused], a = p && session.tabs.find((t) => t.id === p.activeId); if (!p || !a) return 'No view'
			const vid = a.kind === 'sheet' ? targetFrameOf(a.id)?.id : a.id, pr = gizmoProj(p, a)
			if (!vid) return 'Select a viewport first — click its border (or double-click into it)'
			if (pr !== 'iso') return 'PERSPECTIVE works in the 3D view (switch to 3D first)'
			const next = on ?? viewState.getView3d(p.id, didOf(vid), pr) === 'iso'; viewState.setView3d(p.id, didOf(vid), pr, next ? 'persp' : 'iso'); return next
		},
		exportName: () => { const av = activeView(); return av && av !== 'no-frame' ? `${av.title} - ${PROJ_LABEL[av.dir]}` : (active?.title ?? 'drawing') },
		setCurrentLayer: (id) => {
			const l = modelById(activeMid())?.layers?.find((x) => x.id === id); if (!l) return 'That layer is not in this model'
			layerUI.active = id
			return { name: l.name }
		},
	})
	// The focused pane's ACTIVE VIEW: a sheet's target frame (active → selected → the only one; else its first), or a
	// model tab's own view.
	function activeView(): ActiveView | null | 'no-frame' {
		const p = session.panes[session.focused], a = active; if (!p || !a) return null
		if (a.kind === 'sheet') {
			const f = targetFrameOf(a.id) ?? framesOf(a.id)[0]
			if (!f) return 'no-frame'
			return { tabId: a.id, title: a.title, paneId: p.id, viewId: f.id, mid: f.modelId ?? modelIdOf(a.id), dir: f.proj, scale: f.scale, clip: liveClip(f, a.id), frozen: f.frozen, storeys: f.storeys, frameId: f.id }
		}
		return { tabId: a.id, title: a.title, paneId: p.id, viewId: a.id, mid: a.modelId ?? FLOOR_MODEL_ID, dir: projOf(p, a), scale: scaleOf(a.id), clip: null }
	}
	// File › Export… (DXF) and Insert › Image… — pageActions.ts
	let uploadPick = $state(false), uploadBusy = $state(false)   // Insert › From Uploads… (parts/UploadPicker)
	const { exportActiveDxf, addImage, importImage, addUpload } = new PageActions({
		activeView, orbitOf, entsForModel, addEnt: (t, e) => addEnt(t, e),
		activeLayerName: (mid) => activeLayerIn(modelById(mid)?.layers ?? [])?.name ?? '—',
	})
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
		if (proj.openRiser(d.docId, !!d.preview)) return   // a riser row → its imported building model (never the mock riser tab)
		if (proj.openLinkSheet(d.docId)) return   // B5: a link sheet opens its tool (a new browser tab)
		const sid = sheetIdOf(d.docId); if (sid) proj.loadSheet(sid)   // a stored Pages sheet: its paper + frames first
		// a stored sheet's tab (frames without their own model fall back to it) = its PLACE's model, never the
		// unsaved per-floor-name model of the old tree; a real floor of the old tree gets its own model + floorplan
		const sheetPlace = sid ? proj.store?.sheets.find((x) => x.id === sid)?.placeId : null
		const modelId = d.modelId ?? (sheetPlace ? proj.ensurePlaceModel(sheetPlace) : d.floor && proj.src?.project ? proj.realFloorModelId(d.floor) : floorModelId(d.floor))
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
	// The PROJECT side — Firestore data, places, stored models + sheets, title block, drawings dialog — lives in
	// pagesProject.svelte.ts; it reaches the workspace through this host.
	const proj = new PagesProject({
		db: ctxDb,
		auth: getContext('session') as AuthSession | undefined,
		pid: () => page.params.pid,
		session, openDrawing, closeTab, toast: (m) => toast(m), didOf, paperOf, framesOf, scaleOf,
		activeTabId: () => active?.id,
		ensureHist: () => ensureHist(), pushStep, addModelToHistory, amendModelHistory: timeline.amendModel, addDocToHistory,
	})
	// ── the last clicked tree item, per project, in localStorage — a location node (selected + its Properties;
	// a floor also reopens its model tab) or a drawing (reopened as a tab). Restored once, when the project's
	// real tree first loads; its ancestors are expanded so it's visible. ──
	const TREE_LS = 'eos.pages.treeItem'
	type TreeItem = { node?: string; doc?: string }
	function saveTreeItem(item: TreeItem) {
		const pid = page.params.pid; if (!pid) return
		try { const all = JSON.parse(localStorage.getItem(TREE_LS) || '{}'); all[pid] = item; localStorage.setItem(TREE_LS, JSON.stringify(all)) } catch { /* private mode */ }
		setUrlItem(item)
	}
	// SHARE: the selected tree item rides in the URL (?node=<place id> or ?doc=<drawing id>), so a copied link opens
	// the same place / drawing for someone else. A link's item wins over the one remembered in this browser.
	function setUrlItem(item: TreeItem) {
		try {
			const u = new URL(location.href); u.searchParams.delete('node'); u.searchParams.delete('doc')
			if (item.node) u.searchParams.set('node', item.node); else if (item.doc) u.searchParams.set('doc', item.doc)
			if (u.href !== location.href) replaceState(u, page.state)
		} catch { /* the router isn't ready yet */ }
	}
	const urlItem = (): TreeItem | undefined => { const n = page.url.searchParams.get('node'), d = page.url.searchParams.get('doc'); return n ? { node: n } : d ? { doc: d } : undefined }
	// the active tab's drawing follows into the URL too (a tab opened from the tab strip / another pane)
	$effect(() => { const d = active?.docId; if (d && restoredFor === page.params.pid) untrack(() => { const t = proj.realTree; if (urlItem()?.doc !== d && t && findNodePath(t.tree, { docId: d })) setUrlItem({ doc: d }) }) })   // only drawings the tree can reopen
	let treeReveal = $state<string[]>([])
	// The tree fills in over several snapshots (project doc first, then risers / drawings / racks rows), so the
	// restore RETRIES on each tree update until it finds the item — and gives up once the user clicks in the
	// tree themselves, or 15 s after the project started loading.
	let restoredFor = '', restoreStart = 0
	$effect(() => {
		const t = proj.realTree, pid = page.params.pid
		if (!t || !pid || restoredFor === pid) return
		untrack(() => {
			if (!restoreStart) restoreStart = Date.now()
			let item: TreeItem | undefined
			item = urlItem()   // a shared link first
			if (!item) try { item = JSON.parse(localStorage.getItem(TREE_LS) || '{}')[pid] } catch { /* private mode */ }
			if (!item || Date.now() - restoreStart > 15000) { restoredFor = pid; return }
			if (proj.store && proj.store.status !== 'ready') return   // wait for the stored models (a place's "has a model")
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
				if (n.place) { if (n.modelFloor || n.hasModel) proj.openPlaceModel(n.id, true) }
				else if (n.folder === 'floor' && n.floor) openFloorModel(n.floor, true)
			}
		})
	})
	// the navigator's clicks → remember them (drawings by their stable docId)
	// opening a DRAWING from the tree drops any place selection, so Properties shows the drawing's page
	function navOpen(d: { title: string; kind: Kind; preview: boolean; floor?: string; docId?: string }) { restoredFor = page.params.pid ?? ''; if (d.docId) saveTreeItem({ doc: d.docId }); session.treeNode = null; openDrawing(d) }
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
	let defaultsOpen = $state(false)   // D10: Format › Drawing Defaults…
	function openProject(id: string) { if (id && id !== page.params.pid) goto(`/projects/${id}/pages`) }
	// The palette path ('Hibiya · 30F · Zone …') names the floor → the drawing views that floor's model.
	const floorOfPath = (path?: string) => path?.split(' · ').find((seg) => /^\d+F$/.test(seg))
	function pickPalette(i: PItem) { if (i.kind !== 'place') openDrawing({ title: i.title, kind: i.kind, preview: false, floor: floorOfPath(i.path) }) }
	function onGlobalKey(e: KeyboardEvent) {
		const mod = e.ctrlKey || e.metaKey
		const tag = (e.target as HTMLElement)?.tagName
		if (tag === 'INPUT' || tag === 'SELECT' || tag === 'TEXTAREA') return   // don't hijack field editing
		if (mod && e.shiftKey && e.key.toLowerCase() === 'v') pasteAtCursor = true   // Ctrl+Shift+V: the paste EVENT follows — it lands at the cursor
		// Esc first drops a latched Pan (or an Orbit that's live in a 3D view) — unless a dialog is open; a latched
		// Orbit in a flat view does nothing, so it doesn't swallow the viewport's Esc ladder (cancel a draft first)
		const fp = session.panes[session.focused]
		const onCanvas = e.target === document.body || !!(e.target as Element)?.closest?.('.canvas')
		if (e.key === 'Escape' && (navMode === 'pan' || (navMode === 'orbit' && fp && activeProj(fp) === 'iso')) && !document.querySelector('[role="dialog"]')) {
			e.preventDefault(); e.stopPropagation(); navMode = null; return
		}
		if (mod && (e.key === 'k' || e.key === 'K')) {
			// Capture phase + stopImmediatePropagation so the app-wide Ctrl-K palette doesn't
			// also open on this page (it left a faded backdrop behind ours).
			e.preventDefault(); e.stopImmediatePropagation(); paletteOpen = true
		} else if (mod && !e.shiftKey && (e.key === 'o' || e.key === 'O')) { e.preventDefault(); openProjectOpen = true }   // File › Open Project…
		else if (e.key === 'F1') { e.preventDefault(); helpOpen = true }
		else if (e.key === 'F10') { e.preventDefault(); toggles.POLAR = !toggles.POLAR; statusText = `POLAR ${toggles.POLAR ? 'on' : 'off'}` }
		else if (e.key === 'F8') { e.preventDefault(); toggles.ORTHO = !toggles.ORTHO; statusText = `ORTHO ${toggles.ORTHO ? 'on' : 'off'}` }
		else if (e.key === 'F9') { e.preventDefault(); toggles.SNAP = !toggles.SNAP; statusText = `SNAP ${toggles.SNAP ? 'on' : 'off'}` }
		else if (mod && !e.shiftKey && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); undo() }
		else if (mod && ((e.shiftKey && (e.key === 'z' || e.key === 'Z')) || e.key === 'y' || e.key === 'Y')) { e.preventDefault(); redo() }
		// typing → the command line, wherever focus is (the tree / a button after a click) — text fields returned above
		else if (!mod && !e.altKey && e.key.length === 1 && /[A-Za-z0-9@,.<?_]/.test(e.key) && cmdLine && !document.querySelector('[role="dialog"]')
			&& !(e.target as HTMLElement)?.isContentEditable) {
			e.preventDefault(); e.stopPropagation(); cmdLine.type(e.key)
		}
		else if (!onCanvas) return   // the canvas keys below leave a focused sidebar / tree its own paging + keys
		else if (e.key === ' ' && !mod && !e.altKey && acadMode) { e.preventDefault(); e.stopPropagation(); cmdRunner.run('') }   // ACAD: Space = Enter (finish / repeat the last command)
		else if (!mod && !e.altKey && (e.key === '+' || e.key === '=' || e.key === '-' || e.key === 'Home')) {   // K2: zoom in / out / fit
			e.preventDefault()
			if (e.key === 'Home') navFit(); else navZoom(e.key === '-' ? 0.8 : 1.25)
		}
		else if ((e.key === 'PageUp' || e.key === 'PageDown') && !mod) {   // B10: page-pan the sheet (Shift = sideways), like the Sheets tool
			const p = session.panes[session.focused], el = canvasEls[session.focused]
			if (p && el && !isModelLayout(p)) {
				e.preventDefault()
				const d = (e.key === 'PageUp' ? 1 : -1) * 0.8 * (e.shiftKey ? el.clientWidth : el.clientHeight)
				canvasPan(p, e.shiftKey ? d : 0, e.shiftKey ? 0 : d)
			}
		}
		else if (mod && !e.shiftKey && active?.kind === 'sheet' && !activeVpOf(active.id) && ['c', 'x', 'd'].includes(e.key.toLowerCase())) {   // B2: frames on paper (Ctrl+V = the paste event, onPaste)
			if (frameClipKey(active.id, e.key.toLowerCase() as 'c' | 'x' | 'v' | 'd')) e.preventDefault()
		}
		else if ((e.key === 'Delete' || e.key === 'Backspace') && selFrameIds.length && active && (() => { const av = activeVpOf(active.id); return !av || (!selFrameIds.includes(av) && !selStore.of(av).length) })()) { e.preventDefault(); deleteSelAt(active.id, active.id, { begin: beginGesture, mark: (l?: string) => modelEdit(active!.id, l), end: endGesture }) }   // delete the selected viewport frame (paper space) — even while ANOTHER viewport is active (unless that one has its own selection)
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
		{ icon: 'radius', name: 'Arc' },        // runs the ARC command (pseudo-tool)
		{ icon: 'brickWall', name: 'Wall' },
		{ icon: 'box', name: 'Furniture' },     // THE box tool (a 3D model box; the old 2D 'Box' was merged into it, R4)
		{ icon: 'server', name: 'Rack' },       // runs the RACK command (a pseudo-tool: setPaneTool routes it)
		{ icon: 'route', name: 'Trunk' },
		{ icon: 'rows', name: 'Pipe' },
		{ icon: 'opening', name: 'Opening' },
		{ icon: 'doorOpen', name: 'Door' },     // the Opening tool with its type set (TOOL_VARIANT)
		{ icon: 'blinds', name: 'Window' },
		{ icon: 'opening', name: 'Hole' },
		{ icon: 'scan', name: 'Section' },
		{ icon: 'scan', name: 'Section box' },     // the Section tool with its form set (TOOL_VARIANT)
		{ icon: 'section', name: 'Section line' }, // phase 3: a cut line at any angle (A–A′)
		{ icon: 'elevmark', name: 'Elevation' },   // phase 4: an elevation marker (a point + the way it looks)
		{ icon: 'ruler', name: 'Dimension' },
		{ icon: 'paintbrush', name: 'Format painter' },   // runs MATCHPROP (pseudo-tool)
		{ icon: 'pencilRuler', name: 'Measure' },         // runs DIST: two clicks, nothing drawn (pseudo-tool)
		{ icon: 'k-text', name: 'Text' },
		{ icon: 'callout', name: 'Callout' },   // runs LEADER: an arrow to a note (pseudo-tool)
		{ icon: 'stickyNote', name: 'Note' },   // runs NOTE: a wrapped multi-line notes block (pseudo-tool)
		{ icon: 'crosshair', name: 'Guide' },   // drop an alignment guide (sets the depth plane across views)
		{ icon: 'moveHorizontal', name: 'Guide H' },
		{ icon: 'moveVertical', name: 'Guide V' },
		{ icon: 'panels', name: 'Viewport' },   // paper-space: drag on the sheet to add a viewport frame
	]
	const iconOf = (name: string) => TOOLS.find((t) => t.name === name)?.icon ?? 'square'
	// The tool strip, in sections (draw · building · services · annotate · modify / paper), groups related tools into
	// ONE button with a fly-out (hover to reveal): the button shows + re-activates the group's LAST-USED tool, the
	// fly-out switches variants. Singles render as-is.
	const STRIP: StripItem[] = [
		{ tool: 'Select' },
		{ sep: 'draw' },
		{ group: 'text', label: 'Text · callout · note', members: ['Text', 'Callout', 'Note'] },
		{ tool: 'Line' },
		{ group: 'shapes', label: 'Shapes', members: ['Rectangle', 'Ellipse', 'Arc'] },   // 2D draws
		{ sep: 'building' },
		{ group: 'conduits', label: 'Walls · trunks · pipes', members: ['Wall', 'Trunk', 'Pipe'] },   // node / segment graph tools
		{ group: 'openings', label: 'Openings', members: ['Door', 'Window', 'Hole'] },
		{ group: 'boxes', label: 'Boxes', members: ['Furniture', 'Rack'] },   // a Box, or a Rack (the RACK command)
		{ sep: 'annotate' },
		{ group: 'measure', label: 'Dimension · measure · guides', members: ['Dimension', 'Measure', 'Guide H', 'Guide V'] },
		{ group: 'sections', label: 'Sections · box / line', members: ['Section box', 'Section line'] },
		{ tool: 'Elevation' },
		{ sep: 'modify' },
		{ tool: 'Format painter' },
		{ tool: 'Viewport' },
	]
	// Strip entries that are a VARIANT of one real tool: the Opening tool with its type, the Guide tool with its axis.
	const TOOL_VARIANT: Record<string, { tool: string; set: () => void; is: () => boolean }> = {
		Door: { tool: 'Opening', set: () => openingSpec.setKind('door'), is: () => openingSpec.kind === 'door' },
		Window: { tool: 'Opening', set: () => openingSpec.setKind('window'), is: () => openingSpec.kind === 'window' },
		Hole: { tool: 'Opening', set: () => openingSpec.setKind('hole'), is: () => openingSpec.kind === 'hole' },
		'Guide H': { tool: 'Guide', set: () => (guideVert = false), is: () => !guideVert },
		'Guide V': { tool: 'Guide', set: () => (guideVert = true), is: () => guideVert },
		'Section box': { tool: 'Section', set: () => sectionSpec.setKind('box'), is: () => sectionSpec.kind === 'box' },
		'Section line': { tool: 'Section', set: () => sectionSpec.setKind('line'), is: () => sectionSpec.kind === 'line' },
	}
	const MENU_TOOL: Record<string, string> = { Box: 'Furniture', 'Horizontal guide': 'Guide H', 'Vertical guide': 'Guide V', Section: 'Section box' }   // Insert-menu names → tools
	const TOOL_LABEL: Record<string, string> = { 'Section box': 'Section box (drag a box; its arrows drop elevations)', 'Section line': 'Section line (A–A′ at any angle)', Elevation: 'Elevation marker (a point + the way it looks)', Furniture: 'Box', Hole: 'Rectangular hole', 'Guide H': 'Horizontal guide', 'Guide V': 'Vertical guide', Measure: 'Measure a distance', Callout: 'Callout (an arrow to a note)', Note: 'Note (multi-line text block)' }
	const toolIs = (tool: string, name: string) => { const tv = TOOL_VARIANT[name]; return tv ? tool === tv.tool && tv.is() : tool === name }
	const toolLabel = (name: string) => TOOL_LABEL[name] ?? name
	// Last-used tool per group (the button re-activates this on a plain click). Seeded to the first member.
	let groupTool = $state<Record<string, string>>({ text: 'Text', shapes: 'Rectangle', conduits: 'Wall', openings: 'Door', boxes: 'Furniture', measure: 'Dimension', sections: sectionSpec.kind === 'line' ? 'Section line' : 'Section box' })
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

	// ── canvas (paper-space) pan/zoom + Fit — canvasNav.svelte.ts ──
	const canvasNav = new CanvasNav({
		panes: () => session.panes, focused: () => session.focused, tabs: () => session.tabs, navContent: () => navContent,
		isModelLayout, activeVpOf, framesOf, projOf, canvasViewOf, setCanvasView, viewOf, setView, setOrbit,
		hasView: (paneId, viewId, pr) => viewState.hasView(paneId, didOf(viewId), pr),
		hasCanvas: (paneId, tabId) => viewState.hasCanvas(paneId, didOf(tabId), didOf(tabId)),
		paperDims: paperDimsOf, canvasEl: (i) => canvasEls[i],
	})
	const { canvasPan, canvasZoom, activeProj, navZoom, fitPane, navFit, refitAll } = canvasNav

	// Print mechanics live in printing.ts (R9 commit 4) — this effect just owns the FOCUSED PANE's paper
	// (session/paperOf, per-instance state printing.ts deliberately doesn't know about) and the
	// mount/unmount wiring. `onBeforePrint` is rebuilt each time the effect re-runs (whenever the focused
	// paper changes) so 'beforeprint' always reads the CURRENT focused pane's paper at the moment the
	// browser actually fires it, not whatever was focused when the listener was first registered.
	$effect(() => {
		let style = document.getElementById(PRINT_ID) as HTMLStyleElement | null
		if (!style) { style = document.createElement('style'); style.id = PRINT_ID; document.head.appendChild(style) }
		style.textContent = printCss(paperOf(session.panes[session.focused]?.activeId))   // refreshed for the focused paper at print time (applyPrint)
		const onBeforePrint = () => { if (!bookIds) applyPrint(paperOf(session.panes[session.focused]?.activeId)) }   // B7: a book prints itself
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
	let toggles = $state<Record<string, boolean>>({ GRID: true, SNAP: true, ORTHO: false, POLAR: false, OSNAP: true, OTRACK: true, WIRE: false, LWT: false, CEN: false })
	let snapStep = $state(10)   // SNAP grid spacing, model mm (status bar; was the fixed SNAP_STEP) — default 10 mm (Dave)
	// AutoCAD mode: wheel = zoom, draw = two clicks. Off = EOS: wheel = pan, draw = press-drag.
	let acadMode = $state(true)
	// Active-viewport content pan/zoom (Sheets-style): OFF by default, so wheel/drag over an
	// active viewport pans/zooms the CANVAS; toggle on to pan/zoom the model inside it.
	let navContent = $state(false)
	// The nav bar's latched Pan / Orbit tool: a left drag (or one finger) pans / orbits until Esc, a
	// right-click, picking a tool, or clicking the button again.
	let navMode = $state<NavMode>(null)
	function setNavMode(m: NavMode) { navMode = m }

	// Mock theme (scoped to .shell — demos both Kestrel looks, app untouched)
	let mockTheme = $state<'dark' | 'light'>('dark')

	// R9 workspace object (review.md §R9, eos-07's review of commit 1, point 3): small per-pane ACTIONS that
	// used to be built as one-off closures at each `<Pane>` call site (`onFocus={() => (session.focused =
	// pi)}` etc.) — now plain functions taking the pane/index explicitly, since Pane.svelte already has
	// `pane`/`pi` as its own props and can just call `ws.setFocused(pi)` itself.
	function setFocused(pi: number) { session.focused = pi }
	function toggleTabMenu(pi: number) { tabMenuPane = tabMenuPane === pi ? null : pi }
	/** Pseudo-tools that run a COMMAND instead of arming a draw tool (they draw / act through the command line). */
	const TOOL_CMD: Record<string, string> = { Rack: 'RACK', Arc: 'ARC', 'Format painter': 'MATCHPROP', Measure: 'DIST', Callout: 'LEADER', Note: 'NOTE' }
	function setPaneTool(pane: WorkPane, t: string) {
		if (TOOL_CMD[t]) { cmdRunner.run(TOOL_CMD[t]); return }
		const tv = TOOL_VARIANT[t]; if (tv) { tv.set(); t = tv.tool }
		pane.tool = t; navMode = null
	}
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
	// `acadMode`) are GETTERS instead, so reading `ws.statusText` tracks only
	// `statusText` — `ws` itself never changes identity, and every other `ws.x` read stays as narrow as
	// before this bundling. NOT the full B17 fix — the module-level singletons (models/layers/imgEdit/docs/
	// viewState/selStore) still leak across a project→project client-side navigation; that's Dave's call,
	// not started here.
	const workspace: Workspace = {
		get tabs() { return session.tabs }, kindIcon, STRIP, iconOf, toolIs, toolLabel,
		get acadMode() { return acadMode }, get statusText() { return statusText }, get navMode() { return navMode }, setNavMode, conduitOf,
		openTab, promoteTab, closeTab, addTab, pickFromMenu, splitVertical, closePane,
		setFocused, toggleTabMenu, setPaneTool, toggleLayout, setCanvasEl,
		activeVpOf, isVpActive, deactivateVp, onCanvasMove, canvasPan, canvasZoomFn: canvasZoom,
		framesOf, scaleOf, updateFrame, setScale, fitPane, canvasViewOf, entsOf, entsForModel, paperEditor,
		viewOf, envFor, orbitOf, setView3d: (paneId: string, viewId: string, proj: Proj, mode: View3d) => viewState.setView3d(paneId, didOf(viewId), proj, mode), vpFrameView, vpEditor, seedFrame, addFrame, commitFrame, dupFramesInPlace, removeFramesInPlace, liveClip, liveOClip, frameViewTitle, keepView, revertView, viewPreviewOn: (tabId: string) => { const es = Object.entries(viewPreview).filter(([, p]) => p.tab === tabId); return es.length ? { frameId: es[0][0], orig: es[0][1].orig, ids: es.map(([id]) => id) } : null }, targetFrameOf, paperOf, paperDimsOf,
		vpView, projOf, gizmoProj, gizmoSet, navZoom, navFit, titleBlockOf: proj.titleBlockOf,
	}
</script>

<!-- Title = the active drawing's name so Save-as-PDF gets a clean filename (no app name / hyphen). -->
<svelte:head><title>{active?.title ?? 'Pages'}</title></svelte:head>

<div class="shell" data-mock-theme={mockTheme}>
	<!-- inside .shell so the palette's CSS tokens (var(--panel)/--text/…) resolve -->
	{#if paletteOpen}<CommandPalette items={paletteItems} onpick={pickPalette} onclose={() => (paletteOpen = false)} />{/if}
	{#if proj.drawingsOpen && proj.store}
		<DrawingsDialog sheets={proj.store.sheets} places={proj.store.places} models={proj.storedModelInfo} projectName={proj.src?.project?.name ?? ''} packagesHref="/projects/{page.params.pid}/packages"
			onupdate={proj.updateSheets} onarchive={(ids) => void proj.removeSheets(ids)} onrestore={proj.restoreSheets} ondelete={proj.deleteSheet}
			onopen={proj.openSheetById} onmodelarchive={proj.setModelArchived} onopenmodel={proj.openModelById} onpackage={proj.saveAsPackage}
			onlistlegacy={proj.legacySheets} onimportlegacy={proj.importLegacySheet} onprint={(ids) => { for (const id of ids) proj.loadSheet(id); bookIds = ids; proj.drawingsOpen = false }}
			onclose={() => (proj.drawingsOpen = false)} />
	{/if}
	{#if bookIds}<PrintBook ids={bookIds} api={bookApi} onclose={() => (bookIds = null)} />{/if}
	{#if openProjectOpen}<OpenProjectDialog currentId={page.params.pid} onpick={openProject} onclose={() => (openProjectOpen = false)} />{/if}
	{#if uploadPick}
		<!-- Insert › From Uploads…: an uploaded PDF page / picture into the active drawing -->
		<div class="up-dlg-back" role="presentation" onclick={() => (uploadPick = false)}>
			<div class="up-dlg" role="dialog" aria-label="Insert from Uploads" tabindex="-1" onclick={(e) => e.stopPropagation()} onkeydown={(e) => { if (e.key === 'Escape') uploadPick = false }}>
				<div class="up-dlg-head">Insert from Uploads</div>
				<UploadPicker action="Insert" busy={uploadBusy} oncancel={() => (uploadPick = false)}
					onpick={async (f, pg) => { uploadBusy = true; try { if (await addUpload(f, pg)) uploadPick = false } finally { uploadBusy = false } }} />
			</div>
		</div>
	{/if}
	{#if secAsk}<SectionDeleteDialog title={secAsk.title} links={secAsk.links} onkeep={() => finishSectionDelete('keep')} ondelete={() => finishSectionDelete('delete')} onclose={() => (secAsk = null)} />{/if}
	{#if helpOpen}<HelpDialog onclose={() => (helpOpen = false)} onrun={(id) => { const c = commandById(id); if (c) cmdRunner.run(primaryName(c)) }} />{/if}
	{#if textDialog.req}{@const r = textDialog.req}{#key r}<NoteDialog text={r.text} plain={r.plain} width={r.width ?? 90} fontPt={r.fontPt ?? 8} onclose={() => textDialog.close()} onapply={(t) => { r.apply(t); textDialog.close() }} />{/key}{/if}
	{#if defaultsOpen && proj.store}<DrawingDefaultsDialog value={proj.store.project?.drawingDefaults} onchange={(d) => proj.store?.saveDrawingDefaults(d)} onclose={() => (defaultsOpen = false)} />{/if}
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
				<Icon name="search" size={14} /> <span>Search…</span> <span class="tb-kbd">⌃&thinsp;K</span>
			</button>
			<button class="tb-help" title="Help — shortcuts, how do I…, commands (F1)" aria-label="Help" onclick={() => (helpOpen = true)}><Icon name="help" size={19} /></button>
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
				<DrawingNavigator tree={proj.realTree?.tree ?? null} project={proj.realTree?.project ?? null} status={proj.navStatus}
					placesMode={proj.hasPlaces} onseedplaces={proj.canSeedPlaces ? proj.seedPlaces : undefined}
					onplaceadd={proj.onPlaceAdd} onplacerename={proj.onPlaceRename} onplacemove={proj.onPlaceMove} onplacedelete={proj.onPlaceDelete}
					onopenplace={proj.hasPlaces ? (id, preview) => { restoredFor = page.params.pid ?? ''; proj.openPlaceModel(id, preview) } : undefined}
					ondrawings={proj.hasPlaces ? () => (proj.drawingsOpen = true) : undefined}
					onimportdrawing={proj.hasPlaces ? (id) => void proj.importRegisterDrawing(id).then((notes) => { if (notes.length) toast(notes.join('\n')) }) : undefined}
					onimportriser={proj.hasPlaces ? (id) => void proj.importRisers(id).then((notes) => { if (notes.length) toast(notes.join('\n')) }) : undefined}
					onsheetadd={proj.hasPlaces ? proj.onSheetAdd : undefined} onplaceimport={proj.hasPlaces ? (id) => void proj.importPlaceOutlets(id) : undefined} onplaceracks={proj.hasPlaces ? proj.imports.importPlaceRacks : undefined}
					onsheetrename={(rowId, t) => proj.renameSheet(rowId.slice(2), t)} onsheetdelete={(rowId) => proj.removeSheets([rowId.slice(2)])} onsheetduplicate={(rowId) => proj.duplicateSheet(rowId.slice(2))} onsheetcopy={(rowId) => proj.copySheet(rowId.slice(2))} onsheetpaste={(placeId) => proj.pasteSheet(placeId)} onlinksheet={proj.hasPlaces ? proj.addLinkSheet : undefined}
					onaddbuilding={(n) => proj.src?.addBuilding(n).catch((e) => { toast(`Couldn't add the building: ${e?.message ?? e}`); return false }) ?? Promise.resolve(false)}
					onmovefloor={(f, b) => proj.src?.moveFloor(f, b).catch((e) => toast(`Couldn't move the floor: ${e?.message ?? e}`))}
					onmovebuilding={(n, t, after) => proj.src?.moveBuilding(n, t, after).catch((e) => toast(`Couldn't reorder: ${e?.message ?? e}`))}
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
						<button class:on={rightTab === 'blocks'} onclick={() => (rightTab = 'blocks')}>Blocks</button>
					</div>
				</div>
				{#if rightTab === 'blocks'}
					<BlocksPanel armed={placeBlock} onarm={armBlock} />
				{:else if rightTab === 'layers'}
					<LayersPanel layers={modelById(activeMid())?.layers ?? []} frozen={activeFrame?.frozen ?? (activeFrame ? [] : null)} onfreeze={toggleVpFreeze} vpLocked={activeFrame?.vpLocked ?? (activeFrame ? [] : null)} onvplock={toggleVpLock} countOf={layerItemCount} ondelete={deleteLayerWithItems} onpick={() => cmdRunner.run('LAYMCUR')} />
				{:else if rightTab === 'props'}
					<PropertiesPanel ents={selEnts} onupdate={(e) => { if (!active) return; const es = [e].flat(); updateEnts(active.id, es); if (es.length === 1) { rememberOutlet(es[0]); if (es[0].live) proj.resyncCalib(es[0].src) } }} onwalk={startWalk} modelNode={singleOfKind(activeSel, 'node')?.sub} modelSeg={singleOfKind(activeSel, 'seg')?.sub}
						onarrange={(op) => { if (active) reorderEnts(active.id, activeEntIds(), op) }}
						pageTitle={active?.title ?? ''} pageKind={active?.kind ?? ''}
						onpagetitle={(t) => { if (!active || !t.trim()) return; const sid = sheetIdOf(active.docId); if (sid) proj.renameSheet(sid, t); else active.title = t.trim() }} {activeLayer} node={session.treeNode} nodeInfo={proj.nodeInfo} onnodefield={proj.setNodeField}
						modelObj={selModelObj} modelObjs={selModelObjs} model={modelById(activeMid()) ?? null} onmodeladd={addModelObj} outletsFor={proj.outletsForRack} allocated={proj.allocatedOutlets}
						sheets={(proj.store?.sheets ?? []).filter((s) => s.status !== 'archived' && !s.link).map((s) => ({ id: s.id, title: s.title, number: s.drawingNumber }))} onopenlink={openLink} onsaveblock={saveSelAsBlock} onmodelsupdate={updateModelObjs} modelLayers={modelById(activeMid())?.layers ?? []} onmodelupdate={updateModelObj} onmodeldelete={deleteModelObj} onmodelseg={updateModelSeg}
						frameObj={selFrameObj} onframefit={fitSelectedFrame}
						frameObjs={active && selFrameIds.length > 1 ? framesOf(active.id).filter((f) => selFrameIds.includes(f.id)) : []}
						onframesupdate={(patch) => { if (!active || selFrameIds.length < 2) return; ensureHist(active.id); for (const id of selFrameIds) updateFrame(active.id, id, patch); commitFrame(active.id, `Edit ${selFrameIds.length} viewports`) }}
						frameSection={selFrameObj ? (() => { const s = frameSection(selFrameObj, active?.id); return s ? sectionTitle(s) : undefined })() : undefined}
						section={selSection?.sec ?? null} sectionLinks={selSection ? sectionLinks(selSection.sec.id) : []}
						onsectionupdate={updateSelSection} onsectionopen={openSectionLink}
						onsectiondrop={() => { const s = selSection?.sec; if (s) dropSectionDir(s.id, sectionDir(s)) }}
						onsectiondelete={() => { const s = selSection; if (!s || askSectionDelete(s.sec.id)) return; const m = modelById(s.mid), tab = session.panes[session.focused]?.activeId ?? ''
							if (m && deleteSectionIn(m, { begin: beginGesture, mark: (l?: string) => modelEdit(tab, l), end: endGesture }, s.sec.id)) { const vid = activeSelViewId(); if (vid) selStore.set(vid, selClear()) } }}
						heights={proj.buildingHeights} onheight={proj.setStoreyHeight} onheightall={proj.setAllStoreyHeights}
						frameStoreys={(selFrameObj ? modelById(selFrameObj.modelId ?? (active ? modelIdOf(active.id) : undefined))?.storeys ?? [] : []).map((s) => ({ id: s.id, name: s.name, z: s.z }))}
						frameConduits={(selFrameObj ? modelById(selFrameObj.modelId ?? (active ? modelIdOf(active.id) : undefined))?.objects ?? [] : []).filter((o) => o.type === 'conduit' && o.id).map((o, i) => ({ id: o.id!, name: o.label || `Conduit ${i + 1}` }))}
						sheetInfo={proj.activeSheetInfo} onsheetfield={proj.setSheetField}
						titleBlock={proj.store?.project?.titleBlock} ontitleblock={proj.store && proj.hasPlaces ? (t: TitleBlockTemplate) => proj.store!.saveTitleBlock(t) : undefined}
						modelList={models.map((m) => ({ id: m.id, name: m.name }))}
						activeFrameId={active && activeVpOf(active.id) !== active.id ? (activeVpOf(active.id) ?? undefined) : undefined} scaleN={propsScaleN}
						onframeupdate={(patch) => { if (active && selFrameId) { ensureHist(active.id); updateFrame(active.id, selFrameId, patch as Partial<SheetFrame>); commitFrame(active.id, 'Edit viewport') } }}
						onframedelete={() => { if (active) deleteSelAt(active.id, active.id, { begin: beginGesture, mark: (l?: string) => modelEdit(active!.id, l), end: endGesture }) }} />
				{:else}
					{@const hm = proj.historyModel}
					{@const hs = proj.historySheet}
					<HistoryPanel log={timeline.changeLog} onjump={jumpHistory} onundo={undo} onredo={redo}
						model={hm ? { id: hm.id, name: hm.name, version: hm.version, state: modelVersionState(hm) } : null} versions={proj.modelVersions}
						onsaveversion={(a) => { if (hm) void proj.saveModelVersion(hm.id, a) }}
						onrestoreversion={(v) => { if (hm) void proj.restoreModelVersion(hm.id, v) }}
						sheet={hs ? { title: hs.title, code: hs.latestRevisionCode, issuedAt: hs.latestIssuedAt, edited: sheetEditedSinceIssue(hs) } : null}
						problems={proj.issueProblems} revisions={proj.sheetRevisions}
						onissue={(a) => void proj.issueSheet(a)} onrevedit={proj.editRevision} onrevdelete={proj.deleteRevision} onrevcurrent={proj.setCurrentRevision} onopenmodel={(id) => { proj.openModelHistory(id); rightTab = 'history' }}
						onoverwritemodel={(id) => void proj.saveModelVersion(id, { major: true, note: '', overwrite: true })} />
				{/if}
			</aside>
		{:else}
			<button class="rail right" title="Show panel" onclick={() => (rightOpen = true)}>
				<Icon name="chevronLeft" size={13} /><Icon name="settings" size={15} />
			</button>
		{/if}
	</div>

	<CommandLine bind:this={cmdLine} runner={cmdRunner} spaceIsEnter={acadMode} />
	<!-- Status bar -->
	<StatusBar bind:toggles bind:snapStep bind:acadMode
		paperSize={paperOf(session.panes[session.focused]?.activeId).size} paperLandscape={paperOf(session.panes[session.focused]?.activeId).landscape}
		onpapersize={(s) => setPaper(session.panes[session.focused]?.activeId, { size: s })}
		onorient={(l) => setPaper(session.panes[session.focused]?.activeId, { landscape: l })}
		paperMargin={paperOf(session.panes[session.focused]?.activeId).margin ?? DEFAULT_MARGIN_MM}
		onmargin={(mm) => setPaper(session.panes[session.focused]?.activeId, { margin: mm })}
		coords={worldXY} counts={sbCounts} zoom={canvasNav.dispZoom} onzoom={navZoom} onfit={navFit} />
</div>

<style>
	.up-dlg-back { position:fixed; inset:0; z-index:120; background:#0006; display:flex; align-items:center; justify-content:center; }
	.up-dlg { width:min(340px, 92vw); background:var(--panel); border:1px solid var(--line); border-radius:10px; box-shadow:0 20px 60px #0009; padding:10px 8px 6px; }
	.up-dlg-head { font-size:13px; font-weight:600; color:var(--text); margin:0 6px 6px; }
	/* Number inputs: Chrome's spin arrows sit at the right, so the caret of an EMPTY right-aligned field hid against
	   them — a little right padding, and an empty field (placeholder showing) types from the left. */
	.shell :global(input[type='number']) { padding-right: 4px; }
	.shell :global(input[type='number']:placeholder-shown) { text-align: left; }
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
	.tb-kbd { font-size:10px; font-weight:600; color:var(--text); background:var(--hover); border:1px solid var(--muted); border-radius:3px; padding:0 5px; opacity:.85; }
	/* Help: a round badge with a BOLD "?" — the thin outline icon was hard to make out at title-bar size */
	/* Help: the outline ? icon, bigger and brighter than the other title-bar icons (it was hard to make out) */
	.titlebar .tb-help { display:inline-flex; align-items:center; justify-content:center; width:28px; height:26px; border-radius:5px;
		background:none; border:none; color:#e2e8f0; cursor:pointer; }
	.titlebar .tb-help :global(svg) { stroke-width:2.25; }
	.titlebar .tb-help:hover { background:var(--hover); color:#fff; }
	.shell[data-mock-theme='light'] .titlebar .tb-kbd { color:#e2e8f0; border-color:#94a3b8; background:#334155; }

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
