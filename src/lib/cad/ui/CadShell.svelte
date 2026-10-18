<!-- The cad workspace for one project: levels on the left, the plan in the middle, Properties on the right, the
     outlets grid below. Owns the CadProject + Workspace for its lifetime (created here, destroyed on unmount). -->
<script lang="ts">
	import WindowBody from './WindowBody.svelte'
	import OpenProjectDialog from './OpenProjectDialog.svelte'
	import BackupDialog from './BackupDialog.svelte'
	import BackupsDialog from './BackupsDialog.svelte'
	import LegacyDrawingsDialog from './LegacyDrawingsDialog.svelte'
	import { backupsCol, loadBackup, type BackupHead } from '../app/backups'
	import { doc, getDoc } from 'firebase/firestore'
	import type { ProjectFile } from '../persist/file'
	import type { ProjectDetails } from '../domain/titleBlock'
	import RestoreNotice from './RestoreNotice.svelte'
	import { canRestore } from '../domain/restorePlan'
	import { outletsOntoDesks } from '../domain/outletArray'
	import { drawnOn, layersOf, layerOf } from '../domain/layers'
	import SplitBar from './SplitBar.svelte'
	import { shellKey, ARROWS, KEYS } from './shellKeys'
	import { newSheetIn, sheetsPdf, sheetsPdfTab, viewPdfTab, repeatDeviceEdit, selectedText as selectedTextOf, activeSheets, viewTitle, viewExists, toggleDrafting as toggleDraftingOf } from '../app/shellActions'
	import { onDestroy, onMount, setContext, tick, untrack } from 'svelte'
	import { page } from '$app/state'
	import { replaceState, goto } from '$app/navigation'
	import { readViewState, writeViewState, paneLevelsOf } from '../app/urlState'
	import { firestore } from '$lib/db.svelte'
	import { CadProject } from '../app/project.svelte'
	import { Workspace, toolWorksIn, TOOL_VIEWS, type ToolId } from '../app/workspace.svelte'
	import { deleteSelected as deleteSelectedOf, orderKey as orderKeyOf, groupKey as groupKeyOf } from '../app/selectionActions'
	import { HINT, HINT_PLACE } from './toolHints'
	import ViewCanvas from './ViewCanvas.svelte'
	import { PLAN, specKey, isPaperSpec, isPaperKind, type ViewSpec } from '../views/space'
	import type { CalibMode } from '../editor/calibrateTool'
	import type { Level, Pt, Underlay } from '../domain/types'
	import ImportPanel from './ImportPanel.svelte'
	import CatalogueDialog from './CatalogueDialog.svelte'
	import SettingsDialog, { type SettingsTab, type DetailsTabs } from './SettingsDialog.svelte'
	import ResizeHandle from './ResizeHandle.svelte'
	import { Panels } from '../app/panels.svelte'
	import { Icon } from '$lib'
	import { clipboardEvents } from '../app/clipboardEvents'
	import { PictureUploads, firestorePictureDeps } from '../app/pictureUploads.svelte'
	import ToolOptions from './ToolOptions.svelte'
	import Exports from './Exports.svelte'
	import TablesPanel from './TablesPanel.svelte'
	import TabStrip from './TabStrip.svelte'
	import { Tabs, levelBound, viewKey as viewKeyOf, type TabView } from '../app/tabs.svelte'
	import type { NavNode } from '../domain/navTree'
	import CadWindow from './CadWindow.svelte'
	import MenuBar from './MenuBar.svelte'
	import HelpDialog from './HelpDialog.svelte'
	import { setFileNamer, setFilePatterner, patternName, type FileParts, type SaveAction } from '../render/download'
	import FileNameDialog from './FileNameDialog.svelte'
	import TextDialog from './TextDialog.svelte'
	import { tipsDue } from './tipsStart'
	import ImagePickDialog from './ImagePickDialog.svelte'
	import { pictureRef, issueNumbers } from '../domain/issue'
	import { issueStatesOf } from '../app/issueStates.svelte'
	import type { Sheet, DesignChange } from '../domain/drawing'
	import { recordEdits } from '../app/editHistory'
	import HistoryDialog from './HistoryDialog.svelte'
	import UploadsDialog from './UploadsDialog.svelte'
	import { buildMenus, selectionMenu, tabMenuOf, type MenuItem } from './cadMenus'
	import { renameLevel as renameLevelOf, deleteLevel as deleteLevelOf, addServerRoom, allocateLevel } from '../app/navActions'
	import { portMapPick } from '../domain/portMap'
	import ContextMenu from './ContextMenu.svelte'
	import { longPress } from './longPress'
	import { WindowLayout, WIN_TITLES, type WinId } from '../app/windows.svelte'
	import ToolStrip from './ToolStrip.svelte'
	import ToolPalette from './ToolPalette.svelte'
	import type { ShapeOpts } from '../editor/shapeTool'
	import { TOOL_GROUPS } from './toolGroups'
	import StatusBar from './StatusBar.svelte'
	import AskBox from './AskBox.svelte'
	import PatchPreview from './PatchPreview.svelte'
	import { addBuilding, buildingsOf, type GroupedProject } from '$lib/projectGroups'
	import { fromDoc, type StoredDoc } from '../persist/docs'

	/** `projectDetails`: open the project's details dialog (the route has it — it's the projects page's). `detailsTabs`: the
	 *  same form as Project settings' Details · Company · Members tabs (User 2026-10-16) — then the menu opens those. */
	let { pid, user, userName = '', projectName, ownerId, projectDetails, details, detailsTabs }: { pid: string; user: string; userName?: string; projectName: string; ownerId?: string; projectDetails?: () => void; details?: ProjectDetails; detailsTabs?: DetailsTabs } = $props()

	// Created once per mount (the route keys this component by pid).
	// svelte-ignore state_referenced_locally
	const project = new CadProject(pid, firestore, user, () => ({ name: projectName, ownerId, userName, details }))
	// image shapes' pictures, resolved for every canvas (ui/Prims.svelte)
	setContext('cad-picture', (ref: string) => project.pdf.picture(ref))
	// ── project groups (User 2026-10-16): this project's other buildings — open one, add one, copy one's settings ──
	type ProjDoc = GroupedProject & ProjectDetails
	let buildings = $state<{ id: string; label: string; current: boolean }[]>([])
	$effect(() => {
		const d = details as ProjDoc | undefined
		if (!d?.masterId) { buildings = []; return }
		let stale = false   // details changed again before the answer came: a later lookup's answer wins
		void buildingsOf({ id: pid, masterId: d.masterId }).then((bs) => { if (!stale) buildings = bs.map((b) => ({ id: b.id, label: b.buildingName || b.name, current: b.id === pid })) })
		return () => { stale = true }
	})
	function addBuildingCmd() {
		const d = details as ProjDoc | undefined
		if (!d) return
		ws.askInDialog({ title: 'Add a building', label: 'The new building’s name', value: '', ok: 'Add building',
			hint: `A project of its own in ${d.masterId ? `the ${d.groupName ?? d.name} group` : `a group with this project (this one becomes “${d.buildingName || 'Building 1'}”)`}: details, members and settings copied, floors and drawings empty. It opens when made.` },
			(name) => { void addBuilding({ ...d, id: pid }, name, user, d.masterId ? undefined : d.buildingName || 'Building 1').then((id) => goto(`/projects/${id}/cad`)).catch((e) => (project.error = `Add building failed: ${(e as Error).message}`)) })
	}
	/** Another building's settings into this one — one undo step (the store's own transaction, so it syncs like any edit). */
	async function copySettingsFrom(id: string) {
		const src = await getDoc(doc(firestore, 'projects', id, 'cadEntities', 'settings'))
		const parsed = src.exists() ? fromDoc(src.data() as StoredDoc) : null
		const from = buildings.find((b) => b.id === id)?.label ?? id
		if (!parsed) { ws.say(`${from} has no settings to copy`); return }
		project.store.transact(`Copy settings from ${from}`, (tx) => tx.put(parsed.entity))
		ws.say(`Settings copied from ${from} (usages, cable types, label patterns, title block, files …) · Ctrl+Z undoes`)
	}
	const ws = new Workspace()
	ws.toolDefaults = () => project.settings?.toolDefaults   // Properties › Use as default
	ws.newCordStatus = () => project.settings?.newCordStatus ?? 'add'
	// every export asks for its file name first (User 2026-10-15): filled from the project's pattern (Settings › Files),
	// else the export's own name; the Save as dialog (User: a dialog, not the status bar) — Enter saves, Esc cancels
	// Help › Tips opens by itself once a day, on the next tip, until its "Show at start" is unticked (User 2026-10-15)
	onMount(() => { if (tipsDue()) layout.open('tips') })
	let saveAs = $state<{ name: string; ext: string; type: string; sheetIds?: string[]; done: (n: string | { name: string; action: SaveAction } | null) => void } | null>(null)
	// a sheet PDF's Save as: its sheets' states are worked out while it's open, and those changed since their release
	// offer Bump version… (design log step 3)
	$effect(() => { if (saveAs?.sheetIds?.length) return issueStatesOf(project).want() })
	const saveBump = $derived.by(() => {
		const ids = saveAs?.sheetIds
		if (!ids?.length) return undefined
		const st = issueStatesOf(project)
		const changed = ids.map((id) => project.index.get(id)).filter((s): s is Sheet => s?.type === 'sheet' && st.of(s) === 'changed')
		if (!changed.length) return undefined
		const one = changed.length === 1 ? changed[0] : null
		return { text: `${one ? `${one.number} has` : `${changed.length} sheets have`} changed since ${one ? `revision ${one.revisions?.at(-1)?.code}` : 'their release'}.`, run: () => ws.bumpVersion(changed.map((s) => s.id)) }
	})
	/** The name from the project's pattern, else the suggested one. {version}: the release this file belongs to, else the
	 *  project's latest ("03"; none released: left out). */
	function patterned(suggested: string, parts: FileParts | undefined, ext: string): string {
		const latest = Math.max(0, ...issueNumbers(project.store.ofType('issue')).values())
		const all = parts && { ...parts, version: parts.version ?? (latest ? String(latest).padStart(2, '0') : undefined) }
		return (all ? patternName(project.settings?.fileNamePattern, project.name, all, ext) : null) ?? suggested
	}
	$effect(() => {
		const offNamer = setFileNamer((suggested, parts, ext, type) => new Promise((done) => {
			saveAs?.done(null)
			saveAs = { name: patterned(suggested, parts, ext), ext, type, sheetIds: parts?.sheetIds, done: (n) => { saveAs = null; done(n) } }
		}))
		const offPatterner = setFilePatterner(patterned)
		// only ours: a newer page (hot reload) keeps its own
		return () => { offNamer(); offPatterner() }
	})
	// a refused edit while someone else's restore runs says why
	project.store.onRefuse = (reason) => ws.say(reason)
	// the edit history (design log step 4): this tab's edits, while the project's switch is on
	$effect(() => recordEdits(project, (m) => ws.say(m), () => ws.workingOn))
	/** The status bar's "Working on 3" chip (step 5): the change this tab's edits are tagged with. */
	const working = $derived.by(() => {
		const c = ws.workingOn ? project.index.getOf('change', ws.workingOn) : undefined
		if (c?.type !== 'change') return undefined
		const off = !project.settings?.editHistory
		return { text: `Working on ${c.n}: ${c.what}`, title: `Edits are tagged with change ${c.n}${off ? ' — but the edit history is off (Settings › Files), so nothing is kept' : ' in the edit history'}. Click: open the change.`,
			open: () => ws.select([c.id]), stop: () => { ws.workingOn = null } }
	})
	const panels = new Panels()
	/** The windows (UX review S2): Navigator, Properties, Layers, Blocks, Racks, Cables — docked, floating or closed. */
	const layout = new WindowLayout()
	let helpOpen = $state<false | 'help' | 'keys'>(false)
	let imagePickOpen = $state(false), uploadsOpen = $state(false)
	let legacyOpen = $state(false)
	let openProjectOpen = $state(false), backupOpen = $state<false | 'download' | 'restore'>(false), backupsOpen = $state(false), historyOpen = $state(false)
	/** A stored backup to restore (Project › Backups… › Restore…). */
	let restoreSource = $state.raw<{ file: ProjectFile; name: string } | undefined>()
	let exportsRef: Exports | undefined = $state()
	/** The drawing area: floating windows sit in it, its edges dock them. */
	let planEl: HTMLElement | undefined = $state()
	/** The tools float over the drawing in a palette (tool strip options 2 + 4, User 2026-10-15), else sit in the top bar;
	 *  kept in this browser. */
	const TOOLS_FLOAT_KEY = 'cad-tools-float'
	let toolsFloat = $state((() => { try { return localStorage.getItem(TOOLS_FLOAT_KEY) === 'float' } catch { return false } })())   // the top bar by default (User 2026-10-15)
	function setToolsFloat(on: boolean) { toolsFloat = on; try { localStorage.setItem(TOOLS_FLOAT_KEY, on ? 'float' : 'bar') } catch { /* storage blocked */ } }
	// Title block…: the Sheets tab, scrolled to its Title block section (Round 8: it opened on the categories, the block
	// below the fold)
	function openTitleBlock() { openSettings('sheets'); void tick().then(() => tick()).then(() => document.getElementById('settings-title-block')?.scrollIntoView({ block: 'start' })) }
	async function restoreBackup(id: string) {
		try {
			const head = (await getDoc(doc(backupsCol(project), id))).data() as BackupHead | undefined
			if (!head) { ws.say('That backup has been deleted'); return }
			restoreSource = { file: await loadBackup(project, head), name: head.name }
			backupOpen = 'restore'
		} catch (e) { ws.say(`Could not open the backup: ${(e as Error).message}`) }
	}
	// svelte-ignore state_referenced_locally
	ws.layers.load(pid)
	function openInTab(v: { levelId?: string; spec: ViewSpec }) { if (v.levelId && project.index.get(v.levelId)) ws.levelId = v.levelId; setPane(activePane, $state.snapshot(v.spec) as ViewSpec, 'keep') }
	/** A level / sheet picked in the app-wide palette (Ctrl+K elsewhere, the title bar's search): `search` is the cad URL's
	 *  query (`?v=plan&level=…` / `?v=sheet.…`); opened in a tab like any other jump, not by re-reading the URL (Q45). */
	function openFromPalette(search: string) {
		const st = readViewState(new URLSearchParams(search)), spec = st.panes?.[0]
		if (spec) ws.openInTab({ levelId: st.levelId ?? undefined, spec })
	}
	onMount(() => {
		const h = (e: Event) => openFromPalette(String((e as CustomEvent<string>).detail ?? ''))
		window.addEventListener('cad-open', h)
		return () => window.removeEventListener('cad-open', h)
	})
	onDestroy(() => project.destroy())

	// the view state comes back from the URL on a refresh (User): each pane's level and view, the active pane — read
	// from the ADDRESS BAR: page.url still holds the URL the page loaded with (our replaceState doesn't move it), so a
	// remount (a hot reload) went back to that first view (User 2026-10-14: "why did hmr revert to S001?")
	const fromUrl = readViewState(new URL(typeof location === 'undefined' ? page.url.href : location.href).searchParams)
	ws.paneLevels = paneLevelsOf(fromUrl)
	ws.pane = fromUrl.active ?? 0

	/** One or two panes side by side, each a view of its own level; the active one takes keys, and its
	 *  level is `ws.levelId`. */
	let panes = $state<ViewSpec[]>(fromUrl.panes ?? [PLAN])
	const activePane = $derived(ws.pane)
	/** The drawing tabs (UX review D1): one list for both panes; each pane shows one. */
	// svelte-ignore state_referenced_locally
	const tabs = new Tabs(pid)
	// svelte-ignore state_referenced_locally
	panes.forEach((v, i) => tabs.ensure(i, { levelId: ws.paneLevels[i] ?? undefined, spec: v }))
	let canvases = $state<(ViewCanvas | undefined)[]>([])
	const canvas = $derived(canvases[activePane])
	/** Points in the run / line the active pane is drawing (0 = none). */
	const pathPending = $derived(canvas?.pathPending() ?? 0)
	const level = $derived(project.levels.find((l) => l.id === ws.levelId))
	/** The level each pane draws: its own, else (gone, not loaded yet) the active pane's. */
	const paneLevelIds = $derived(panes.map((_, i) => (project.levels.some((l) => l.id === ws.paneLevels[i]) ? ws.paneLevels[i]! : level?.id)))
	/** A level from a tab / history that still exists, for pane `i`. */
	const setPaneLevel = (i: number, id: string | undefined) => { if (id && project.index.get(id)) ws.paneLevels[i] = id }
	let panesEl: HTMLDivElement | undefined = $state()


	function toggleSplit() {
		canvas?.cancel()
		if (panes.length === 2) { panes = [panes[activePane]]; ws.setPaneCount(1) }
		else { ws.setPaneCount(2); panes = [panes[0], panes[0].kind === 'plan' ? { kind: 'elevation', dir: 'front' } : PLAN]; ws.pane = 0 }
	}
	/** Show a view in a pane. The selection follows (UX09): what neither pane draws any more is let go, so Properties
	 *  always describes something you can see. */
	/** `how`: 'go' = the pane's tab changes view (its old view goes on the tab's Back list); 'open' / 'keep' = the
	 *  Navigator / a link: the view's tab, else the preview tab (keep: a kept tab); 'nav' / 'show' = the tab is set. */
	function setPane(i: number, s: ViewSpec, how: 'go' | 'nav' | 'open' | 'keep' | 'show' = 'go') {
		canvases[i]?.cancel()
		ws.vpEdit = null   // another view: no longer editing inside a viewport
		const view: TabView = { levelId: ws.paneLevels[i] ?? undefined, spec: $state.snapshot(s) as ViewSpec }
		if (how === 'go') tabs.go(i, view)
		else if (how === 'open' || how === 'keep') tabs.open(i, view, how === 'keep', project.rev)
		panes[i] = s
		void tick().then(() => {
			// a server room or a row picked in the Navigator / Racks window has Properties but isn't drawn: it stays
			const listed = (id: string) => { const t = project.index.get(id)?.type; return t === 'space' || t === 'rackRow' }
			const keep = ws.selection.filter((id) => listed(id) || canvases.some((c) => c?.draws(id)))
			if (keep.length !== ws.selection.length) ws.select(keep)
		})
	}
	const viewName = (v: ViewSpec | undefined) => viewTitle(project, v), exists = (v: ViewSpec) => viewExists(project, v)
	/** Back / forward inside the pane's tab (UX12 → D1, Alt+← / Alt+→). */
	function navPane(i: number, dir: -1 | 1) {
		const v = tabs.nav(i, dir, (x) => exists(x.spec))
		if (!v) return
		setPaneLevel(i, v.levelId)
		setPane(i, $state.snapshot(v.spec) as ViewSpec, 'nav')
	}
	const navOf = (i: number) => { const t = tabs.of(i); return { back: viewName(t?.back.at(-1)?.spec), fwd: viewName(t?.fwd.at(-1)?.spec), go: (d: -1 | 1) => navPane(i, d) } }
	/** Show a tab in a pane (its level first — that pane's only). */
	function showTab(id: string, i = activePane) {
		const t = tabs.get(id)
		if (!t) return
		tabs.paneTab[i] = id
		tabs.save()
		setPaneLevel(i, t.view.levelId)
		setPane(i, $state.snapshot(t.view.spec) as ViewSpec, 'show')
	}
	/** Close a tab: the panes that showed it show the tab beside it, or (none left) the open level's plan. */
	function closeTab(id: string) {
		const before = [...tabs.paneTab]
		tabs.close(id)
		before.forEach((p, i) => { if (p === id && i < panes.length) { const next = tabs.paneTab[i]; if (next) showTab(next, i); else setPane(i, PLAN) } })
	}
	// what a pane shows is what its tab holds (a level picked elsewhere changes the tab's view, without history) — each
	// pane's own level: a click in the other pane changes nothing here
	$effect(() => {
		panes.forEach((v, i) => { const view = { levelId: ws.paneLevels[i] ?? undefined, spec: $state.snapshot(v) as ViewSpec }; untrack(() => tabs.sync(i, view)) })
	})
	// something someone else deleted leaves the selection (and its open text box): no "3 selected" of things gone
	$effect(() => project.store.subscribe((c) => {
		if (c.source !== 'remote') return
		const gone = new Set(c.ops.filter((o) => o.before && !o.after).map((o) => o.id))
		if (!gone.size) return
		untrack(() => {
			if (ws.selection.some((id) => gone.has(id))) ws.select(ws.selection.filter((id) => !gone.has(id)))
			if (ws.textEdit && gone.has(ws.textEdit)) ws.textEdit = null
		})
	}))
	// an edit made (here, by this user) while a preview tab is on show keeps that tab — not someone else's change
	$effect(() => project.store.subscribe((c) => {
		if (c.source !== 'local') return
		untrack(() => { const t = tabs.of(activePane); if (t?.preview) tabs.keep(t.id) })
	}))
	// a drawing tool's new shapes: say which layer they went on (User 2026-10-10) — not paste / copy, which keep theirs
	$effect(() => project.store.subscribe((c) => {
		if (c.source !== 'local' || ['select', 'move', 'copy', 'array', 'rotate', 'mirror', 'match'].includes(ws.toolId)) return
		const made = c.ops.filter((o) => !o.before && o.after).map((o) => o.after!)
		const info = layersOf(project.index.layers), msg = drawnOn(made, info)
		// drawn onto a layer this user has HIDDEN (an outlet going to "Outlets high", say): it would just vanish — that
		// layer is shown again, and the toast says so (/cad/agent gotcha 1)
		const known = new Set(info.map((l) => l.id)), hid = [...new Set(made.map((e) => layerOf(e, known)).filter((id): id is string => !!id && ws.layers.hidden.has(id)))]
		if (hid.length) {
			untrack(() => { for (const id of hid) ws.layers.toggleHidden(id) })
			ws.notify(`${hid.map((id) => info.find((l) => l.id === id)?.name ?? id).join(', ')} ${hid.length === 1 ? 'was' : 'were'} hidden — shown again, so you see what you drew`)
			return
		}
		// the Layer chip already says it when a layer is picked: only a shape that went somewhere ELSE is news (Q55)
		const cur = ws.layers.current ? info.find((l) => l.id === ws.layers.current)?.name : undefined
		if (msg && msg !== (cur ? `Drawn on the ${cur} layer` : null)) ws.notify(msg)   // a toast: the status line keeps the hint / the tool's own message (User 2026-10-12)
	}))
	/** The tab menu (a right-click on a tab). */
	let tabMenu = $state<{ id: string; x: number; y: number } | null>(null)
	const tabMenuItems = $derived(tabMenu ? tabMenuOf(tabMenu.id, {
		preview: !!tabs.get(tabMenu.id)?.preview, isSheet: tabs.get(tabMenu.id)?.view.spec.kind === 'sheet', split: panes.length === 2,
		keep: (id) => tabs.keep(id), close: closeTab,
		closeOthers: (id) => { tabs.closeOthers(id); panes.forEach((_, i) => showTab(id, i)) },
		closeRight: (id) => { tabs.closeRight(id); panes.forEach((_, i) => { const p = tabs.paneTab[i]; if (p) showTab(p, i) }) },
		otherPane: (id) => showTab(id, 1 - activePane),
		toSheet: (id) => { showTab(id); void tick().then(() => canvas?.toSheet('new')) },
	}) : [])
	/** A pane showing a sheet (or section) that was deleted goes back to the plan… */
	const gonePanes = $derived.by((): string => {
		void project.rev
		if (!project.loaded) return ''
		return panes.flatMap((s, i) => (s.kind === 'sheet' ? !project.store.get(s.sheetId) : s.kind === 'section' ? !project.store.get(s.sectionId) : false) ? [i] : []).join(',')
	})
	$effect(() => { const g = gonePanes; if (g) untrack(() => { for (const i of g.split(',')) setPane(+i, PLAN) }) })
	// …and a tab of a floor whose model was deleted closes (User 2026-10-16: "(level gone) plan" tabs stayed). Worked
	// out as "is anything gone", so the effect runs when that changes, not on every edit (hacky-code review)
	const tabKept = (v: TabView) => exists(v.spec) && !(levelBound(v) && v.levelId && project.store.get(v.levelId)?.type !== 'level')
	const tabsGone = $derived.by(() => { void project.rev; return project.loaded && tabs.list.some((t) => !tabKept(t.view)) })
	$effect(() => { if (tabsGone) untrack(() => tabs.prune(tabKept)) })
	/** A level from the list: its model. A pane showing something that isn't this level's (a sheet, the riser view,
	 *  another floor's racks) goes to the level's plan (User: clicking a level with S001 open did nothing visible). */
	function openLevel(id: string) {
		if (id !== ws.levelId && panes[activePane].kind === 'plan') tabs.go(activePane, { levelId: id, spec: PLAN })
		ws.levelId = id
		ws.select([])
		const p = panes[activePane]
		const elsewhere = p.kind === 'sheet' || p.kind === 'riser' || isPaperSpec(p) || (p.kind === 'row' && project.index.get(p.spaceId)?.type === 'space' && (project.index.get(p.spaceId) as { levelId: string }).levelId !== id)
		if (elsewhere) setPane(activePane, PLAN)
	}
	/** The port map (port-map-plan.md): the selected panels / switches drawn in the active pane (a tab); its Excel — of
	 *  the open map's devices when nothing is selected. */
	function portMapView() {
		const ids = portMapPick(project.index, ws.selection, ws.portSel?.on)
		if (!ids.length) { ws.say('Port map: select the panels or switches first (in a rack view), or their rack'); return }
		setPane(activePane, { kind: 'portmap', deviceIds: ids }, 'open')
	}
	function portMapExcel() {
		const p = panes[activePane]
		exportsRef?.portMap(p.kind === 'portmap' && !ws.selection.length ? p.deviceIds : undefined)
	}
	/** After undo / redo: select what changed; an edit on another level opens that level first (User), unless a sheet
	 *  or the riser view (no one level) is showing. */
	function showHistory(ids: string[]) {
		const e = ids.length ? project.store.get(ids[0]) : undefined
		const on = e?.type === 'device' ? (project.store.get(e.rackId) as { levelId?: string } | undefined)?.levelId : (e as { levelId?: string } | undefined)?.levelId
		if (on && on !== ws.levelId && activeKind !== 'sheet' && activeKind !== 'riser' && !isPaperKind(activeKind) && project.levels.some((l) => l.id === on)) {
			// the other pane already shows that level: work there instead of turning this pane to it (review follow-up)
			const other = panes.findIndex((p, i) => i !== activePane && ws.paneLevels[i] === on && p.kind !== 'sheet' && p.kind !== 'riser' && !isPaperSpec(p))
			if (other >= 0) ws.pane = other
			else openLevel(on)
		}
		ws.select(ids)
	}
	/** The room the patch list's "This room" means: the open rack view's, else the selected rack's / device's / cord's. */
	const patchRoom = $derived.by(() => {
		const p = panes[activePane]
		if (p?.kind === 'row') return p.spaceId
		const s = project.index.get(ws.selection[0]), e = s?.type === 'cord' ? project.index.get(s.a.on) : s   // a cord picked in the list keeps its room
		const r = e?.type === 'device' ? project.index.get(e.rackId) : e
		return r?.type === 'rack' ? r.spaceId : undefined
	})
	/** The kind of view in the active pane — which tools can be used (TOOL_VIEWS). */
	/** Editing inside a sheet viewport (UX review S5): the tools are its view's (plan, elevation, rack row …). */
	const vpEditKind = $derived.by(() => {
		const e = ws.vpEdit, sh = e ? project.index.get(e.sheetId) : undefined
		return sh?.type === 'sheet' ? (sh.viewports.find((v) => v.id === e!.vpId)?.view.spec.kind ?? null) : null
	})
	const activeKind = $derived(vpEditKind ?? panes[activePane]?.kind ?? 'plan')
	/** A library window whose tool can't work in this view steps aside until it can (review R50); it stays open. */
	const offHere = (id: string) => (id === 'blocks' && !toolWorksIn('insert', activeKind, !!vpEditKind)) || (id === 'devices' && !toolWorksIn('device', activeKind, !!vpEditKind))
	/** What a new viewport shows (the Viewport tool): the other pane's view, else the last plan / elevation / rack view
	 *  looked at. Snapshots: the store freezes what it's given, and a $state proxy can't be frozen. */
	type ModelView = { levelId: string; spec: Exclude<ViewSpec, { kind: 'sheet' }> }
	let lastModel: ModelView | null = null
	$effect(() => { const p = panes[activePane], lv = ws.levelId; if (p && p.kind !== 'sheet' && lv) lastModel = { levelId: lv, spec: $state.snapshot(p) as ModelView['spec'] } })
	function viewportView() {
		const o = 1 - activePane, other = panes.length === 2 ? panes[o] : undefined, lv = paneLevelIds[o]
		return other && other.kind !== 'sheet' && lv ? { levelId: lv, spec: $state.snapshot(other) as ModelView['spec'] } : lastModel
	}
	// this page's actions for the workspace, given once (hacky-code review #8); taken back when it goes
	const detachShell = ws.attachShell({
		remove: () => deleteSelected(), align: (how) => canvas?.align(how), selectSimilar: () => canvas?.selectSimilar(), viewportView,
		openTitleBlock, openSettings: (t) => openSettings(t), openLog: () => openTable('log'), openWindow: (id) => layout.open(id),
		releaseSheets: () => { openTable('sheets'); ws.sheetsAsk = 'release' },
		startRenumber: () => { if (ws.toolId !== 'renumber') pickTool('renumber', true) },
		restoreBackup: (id) => void restoreBackup(id),
		applyLinks: (label, add, remove) => project.applyLinks(label, add, remove),
		openView: (s) => setPane(activePane, s), openLevel: (id) => openLevel(id), openInTab,
	})
	onDestroy(detachShell)
	// switching to a view the current tool doesn't work in drops back to Select
	$effect(() => { if (!toolWorksIn(untrack(() => ws.toolId), activeKind, !!vpEditKind)) untrack(() => setTool('select')) })

	// ...and goes back into it on every change (replaceState: no history entries, SvelteKit's router stays in charge)
	// Compared with the ADDRESS BAR (location), not page.url: after a replaceState page.url can lag, and a switch back
	// to what the stale copy said was skipped (User: plan → sheet sometimes left v=plan).
	$effect(() => {
		const state = { levelId: ws.levelId, panes: $state.snapshot(panes) as ViewSpec[], active: activePane, paneLevels: panes.map((_, i) => ws.paneLevels[i] ?? null) }
		const url = new URL(location.href)
		const next = writeViewState(url.searchParams, state)
		if (next.toString() === url.searchParams.toString()) return
		url.search = next.toString()
		try { replaceState(url, untrack(() => page.state)) } catch { /* the router isn't ready on the very first run */ }
	})

	// `?rack=<id>` (a link to one rack): once loaded, its room's rack view, zoomed to it and selected; the link's
	// param is then dropped so a refresh keeps whatever you did next
	let rackLink = page.url.searchParams.get('rack')
	$effect(() => {
		if (!rackLink || !project.loaded) return
		const r = project.store.get(rackLink)
		rackLink = null
		const url = new URL(location.href)
		url.searchParams.delete('rack')
		try { replaceState(url, untrack(() => page.state)) } catch { /* the router isn't ready */ }
		if (r?.type !== 'rack') { ws.say('The rack in that link is not in this project'); return }
		untrack(() => { const spec: ViewSpec = { kind: 'row', spaceId: r.spaceId, face: 'front' }; ws.focusOn(r.id, spec, r.levelId); ws.levelId = r.levelId; setPane(activePane, spec); ws.select([r.id]) })
	})

	/** Open the first level once levels arrive (and if the open one disappears); a pane whose level went shows the
	 *  active pane's. */
	// (it runs when the levels or the pane count change; the level ids it fixes are read untracked — an effect that
	// tracks what it writes, hacky-code review)
	$effect(() => {
		const lv = project.levels, n = panes.length, ok = (id: string | null) => lv.some((l) => l.id === id)
		if (!lv.length) return
		untrack(() => {
			if (!ok(ws.levelId)) ws.levelId = lv[0].id
			for (let i = 0; i < n; i++) if (!ok(ws.paneLevels[i])) ws.paneLevels[i] = ws.levelId
		})
	})


	/** The status bar's hint: the tool's, or (Select) the selected viewport's ways of working. */
	/** The options row's chips (review R53). */
	const toolName = $derived(TOOL_GROUPS.flatMap((g) => g.tools).find((t) => t.id === ws.toolId)?.label.replace(/ \(.*\)$/, '') ?? ws.toolId)
	const layerList = $derived(layersOf(project.index.layers).filter((l) => !l.system || ['sys:drawing', 'sys:walls'].includes(l.id)).sort((a, b) => a.order - b.order))
	const hint = $derived((ws.toolId === 'rack' && ws.rackTool.target ? HINT_PLACE : HINT[ws.toolId] ?? ''))


	type BottomTab = 'outlets' | 'patch' | 'sheets' | 'links' | 'log'
	let bottom = $state<BottomTab>('outlets')
	/** The bottom panel follows the view (UX10): sheet → Sheets, rack view → Patch list, else Outlets — unless you picked
	 *  a tab yourself in that kind of view (remembered per kind in this browser, over a refresh — User 2026-10-10). */
	const BOTTOM_FOR: Partial<Record<ViewSpec['kind'], BottomTab>> = { sheet: 'sheets', row: 'patch' }
	const TABLES: BottomTab[] = ['outlets', 'patch', 'sheets', 'links', 'log']
	const pickedFor = (k: ViewSpec['kind']) => { const t = panels.tableFor[k] as BottomTab | undefined; return t && TABLES.includes(t) ? t : undefined }
	$effect(() => { const k = activeKind; untrack(() => (bottom = pickedFor(k) ?? BOTTOM_FOR[k] ?? 'outlets')) })
	function pickBottom(t: BottomTab) { bottom = t; panels.tableFor[activeKind] = t; panels.save() }
	/** Project settings (one dialog, tabs): the menu entries open it on their tab. Hidden, not closed, while a floorplan
	 *  is calibrated on the plan (its Origin / Scale / Crop), so it comes back as it was when the Calibrate tool ends. */
	let settingsOpen = $state(false), settingsTab = $state<SettingsTab>('floors'), calibrating = $state(false)
	/** Cabling › Product catalogue… */
	let catalogueOpen = $state(false)
	function openSettings(t: SettingsTab) { settingsTab = t; settingsOpen = true }
	$effect(() => { if (calibrating && ws.toolId !== 'calibrate') calibrating = false })
	// an offer to put something back (ws.offerRevert, backlog W1) belongs to where it was made: it closes when the view,
	// the level or the dialog changes (it once stayed over other views and a later Enter reverted a crop)
	const askCtx = $derived(`${settingsOpen}|${calibrating}|${ws.levelId}|${activePane}|${specKey(panes[activePane])}`)
	let revertOf: object | null = null, revertCtx = ''
	$effect(() => {
		const q = ws.confirm, k = askCtx
		if (!q?.revert) { revertOf = null; return }
		if (q !== revertOf) { revertOf = q; revertCtx = k }
		else if (k !== revertCtx) ws.confirm = null
	})

	// Blocks opens with the Insert tool, unless you closed it this session (Racks no longer opens by itself in a rack
	// view, UX review L1: the Navigator lists each room's racks; Window › Racks for its tools)
	$effect(() => { if (ws.toolId === 'insert') untrack(() => layout.open('blocks', false)) })
	// the Device library opens with the Device tool — floating at the drawing's right edge, not over the first rack — and
	// goes again when the tool ends, if the tool opened it (R7-12, User 2026-10-16: it covered R01 and stayed open)
	let devicesByTool = false
	$effect(() => {
		const on = ws.toolId === 'device'
		untrack(() => {
			if (on && !layout.shown('devices')) {
				layout.open('devices', false)
				if (!layout.shown('devices')) return
				devicesByTool = true
				const w = layout.wins.devices
				if (!w.dock && planEl) layout.float('devices', Math.max(12, planEl.clientWidth - w.w - 12), 36)
			} else if (!on && devicesByTool) { devicesByTool = false; layout.shut('devices') }
		})
	})
	// floating windows stay reachable when the browser window (or the drawing area) shrinks (User)
	$effect(() => {
		const el = planEl
		if (!el) return
		const ro = new ResizeObserver(() => layout.clampAll(el.clientWidth, el.clientHeight))
		ro.observe(el)
		return () => ro.disconnect()
	})
	const tablesShown = $derived(panels.shown.bottom && !layout.allHidden)
	/** The tables in the strip under the drawing (not floating or maximised); folded, the strip is just their bar. */
	const tablesDocked = $derived(tablesShown && !panels.tables.float && !panels.tables.max)
	/** Closed, their bar of tabs stays under the drawing (User 2026-10-10) — not when every window is hidden. */
	const tablesBar = $derived(!panels.shown.bottom && !layout.allHidden)
	const tablesRow = $derived(tablesDocked ? (panels.tables.folded ? 29 : panels.size.bottom) : tablesBar ? 29 : 0)
	// a docked library window keeps its place where its tool doesn't work (a note instead of its list), so the windows
	// around it don't jump and the Navigator doesn't scroll (User 2026-10-15: Blocks came and went with rack views)
	const docked = (side: 'left' | 'right') => layout.docked(side)
	const dockW = (side: 'left' | 'right') => (docked(side).length ? panels.size[side] : 0)
	const sheetsAll = $derived(activeSheets(project))
	/** A Navigator row: its view in the active pane (its level first); a rack zooms to itself; a sheet / rack / section is
	 *  selected. The spec is copied: the tree's comes from frozen store data. */
	function navOpen(n: NavNode, keep = false) {
		const o = n.open
		if (!o) return
		if (o.levelId && o.levelId !== ws.levelId) ws.levelId = o.levelId
		setPane(activePane, $state.snapshot(o.spec) as ViewSpec, keep ? 'keep' : 'open')
		if (n.kind === 'rack' && n.id) ws.focusOn(n.id, o.spec, o.levelId)
		if (n.select) ws.select([n.select])
		if (n.kind === 'space') ws.reveal++   // a room drawn on the plan: pan it into view, selected
	}
	function openTable(t: BottomTab) { panels.shown.bottom = true; panels.save(); pickBottom(t) }
	// project actions (app/shellActions.ts)
	const newSheet = () => setPane(activePane, { kind: 'sheet', sheetId: newSheetIn(project, ws) }, 'keep')
	const pdfSheet = (id: string) => { const sh = project.index.get(id); if (sh?.type === 'sheet') void sheetsPdf(project, ws, [sh]) }
	const pdfAllSheets = () => void sheetsPdf(project, ws, sheetsAll)
	/** The sheet open in the active pane (File / Sheets › PDF of this sheet). */
	const openSheetId = $derived.by(() => { const p = panes[activePane]; return p?.kind === 'sheet' ? p.sheetId : undefined })
	/** Ctrl+P and the print button (User 2026-10-15): the open sheet as a PDF, else every sheet. */
	/** Print (Ctrl+P, the printer button, its ▾ — User 2026-10-15): on a sheet, that sheet; on a model view, the whole view
	 *  alone on A3 (or what's on screen); "all": every sheet. Each opens the PDF in a new browser tab. */
	function printWhat(which: 'this' | 'all' | 'view' | 'screen') {
		const p = panes[activePane], lv = paneLevelIds[activePane] ?? ws.levelId
		if ((which === 'view' || which === 'screen') && p && p.kind !== 'sheet' && lv) {
			viewPdfTab(project, ws, { levelId: lv, spec: $state.snapshot(p) as Exclude<ViewSpec, { kind: 'sheet' }> }, which === 'screen' ? canvas?.visibleBounds() : undefined)
			return
		}
		const sh = openSheetId ? project.index.get(openSheetId) : undefined
		if (which === 'this' && sh?.type === 'sheet') sheetsPdfTab(project, ws, [sh])
		else if (sheetsAll.length) sheetsPdfTab(project, ws, sheetsAll)
		else ws.say('No sheets yet — Drawings › New sheet')
	}
	const printPdf = () => printWhat(openSheetId ? 'this' : 'view')
	/** R / Shift+R, the ↻ ↺ buttons, Modify and the right-click menu (User 2026-10-15): the selection turned 90°. */
	const turn90 = (dir: 1 | -1) => { const why = canvas?.turn90(dir); if (why) ws.say(why) }
	const printItems = $derived<MenuItem[]>(openSheetId
		? [{ label: 'This sheet', key: KEYS.print, run: () => printWhat('this') }, { label: `All sheets (${sheetsAll.length})`, run: () => printWhat('all') }]
		: [{ label: 'Whole view (A3)', key: KEYS.print, run: () => printWhat('view') }, { label: 'On screen (A3)', run: () => printWhat('screen') }, '-', { label: `All sheets (${sheetsAll.length})`, disabled: !sheetsAll.length, run: () => printWhat('all') }])
	/** The print button's ▾ (User 2026-10-15): This sheet / All sheets. */
	let printMenu = $state<{ x: number; y: number } | null>(null)
	const selectedText = $derived(selectedTextOf(project, ws))
	function zoomSel() { if (!canvas?.zoomToSelection()) ws.say('Nothing selected is drawn in this view') }
	// a row picked in a table: the active view pans it into view when it's off-screen (R52); only the pick re-runs this
	$effect(() => { if (ws.reveal) untrack(() => void tick().then(() => canvas?.revealSelection())) })
	const toggleDrafting = (k: 'snap' | 'osnap' | 'showGrid') => toggleDraftingOf(ws, k)
	/** The menu bar (UX review S4): rebuilt when what it shows changes (ticks, what's possible). */
	const menus = $derived(buildMenus({
		outletSchedule: (all) => exportsRef?.outletSchedule(all), frameSheets: (all) => exportsRef?.frameSheets(all), panelLabels: (all) => exportsRef?.panelLabels(all), dxf: () => exportsRef?.dxf(), pdfAllSheets, hasSheets: sheetsAll.length > 0, pdfThisSheet: () => openSheetId && pdfSheet(openSheetId), onSheet: !!openSheetId, uploads: () => (uploadsOpen = true), surveys: () => window.open(`/survey?project=${pid}`, '_blank', 'noopener'), monoPdf: ws.monoPdf, toggleMonoPdf: ws.toggleMonoPdf, copyView: () => { void canvas?.copyPicture().then((m) => ws.say(m)) }, openProject: () => (openProjectOpen = true),
		backup: (m) => { restoreSource = undefined; backupOpen = m }, legacyDrawings: () => (legacyOpen = true), backups: () => (backupsOpen = true), history: () => (historyOpen = true), canRestore: canRestore(project.ownerId, project.user),
		undo: () => showHistory(project.undo()), redo: () => showHistory(project.redo()), canUndo: project.canUndo, canRedo: project.canRedo,
		copy: () => document.execCommand('copy'), cut: () => document.execCommand('cut'),
		paste: () => { navigator.clipboard.readText().then((t) => { if (!clipboard.pasteText(t)) ws.say('Nothing to paste — copy items (Ctrl+C) or text from another app first') }, () => ws.say('The browser didn’t let the page read the clipboard — use Ctrl+V')) },
		buildings, addBuilding: addBuildingCmd, openBuilding: (id) => { window.location.href = `/projects/${id}/cad` }, copySettingsFrom: (id) => void copySettingsFrom(id),
		remove: deleteSelected, turn90, hasSelection: ws.selection.length > 0 || !!ws.portSel || !!ws.openingSel,
		selectAll: () => canvas?.selectAll(), selectSimilar: () => canvas?.selectSimilar(),
		group: () => groupKey(false), ungroup: () => groupKey(true), order: orderKey,
		find: () => { layout.open('navigator'); ws.navSearch++ }, fit: () => canvas?.zoomExtents(), zoomSel, split: panes.length === 2, toggleSplit,
		tables: tablesShown, toggleTables: () => panels.toggle('bottom'), hideAll: layout.allHidden, toggleHideAll: () => (layout.allHidden = !layout.allHidden),
		back: () => navPane(activePane, -1), forward: () => navPane(activePane, 1), canBack: (tabs.of(activePane)?.back.length ?? 0) > 0, canFwd: (tabs.of(activePane)?.fwd.length ?? 0) > 0,
		fill: ws.showFill, toggleFill: () => (ws.showFill = !ws.showFill), isPlan: activeKind === 'plan', fillHere: activeKind === 'plan' || activeKind === 'elevation' || activeKind === 'section',
		drafting: ws.drafting, toggleDrafting,
		tool: pickTool, toolVariant: pickItem, toolOk: (id) => toolWorksIn(id, activeKind, !!vpEditKind), openTable, sheetsTab: (w) => { openTable('sheets'); ws.sheetsAsk = w },
		cordBom: () => exportsRef?.openCordBom(), cordLabels: () => exportsRef?.openCordLabels(), portMap: portMapExcel, portMapView, cableSchedule: () => exportsRef?.openCables(), bom: () => exportsRef?.openBom(), catalogue: () => (catalogueOpen = true), serverRoom: () => addServerRoom(project, ws, ws.levelId), allocate: () => { allocateLevel(project, ws, ws.levelId); openTable('outlets') },
		newSheet, sheetFromView: () => canvas?.toSheet('new'), canSheetFromView: activeKind !== 'sheet', titleBlock: openTitleBlock, image: () => (imagePickOpen = true),
		floors: () => openSettings('floors'), settings: () => openSettings('usages'), projectDetails: detailsTabs ? () => openSettings('details') : projectDetails, newProject: () => goto('/projects?new=1'),
		hasLevel: !!level, renameLevel: () => { if (level) { layout.open('navigator'); renameLevelOf(project, ws, level.id) } }, deleteLevel: () => level && deleteLevelOf(project, ws, level.id),
		win: { shown: (id) => layout.shown(id) && !offHere(id), toggle: (id) => {
			// asked for where it can't work: open it anyway, to show in the next view it can (Round 8: it said "comes back with the
			// plan" but wasn't open, so it didn't)
			if (offHere(id)) { if (!layout.wins[id as WinId].open) layout.open(id as WinId); ws.say(`${WIN_TITLES[id as WinId]} shows in ${id === 'devices' ? 'a rack view' : 'a plan, elevation or section'} — not in this view`) } else layout.toggle(id)
		}, reset: () => layout.reset() },
		help: (keys) => (helpOpen = keys ? 'keys' : 'help'), walkthrough: () => layout.open('walkthrough'), tips: () => layout.open('tips'), toolsFloat, toggleToolsFloat: () => setToolsFloat(!toolsFloat),
	}))

	/** The right-click menu on the selection (UX21): its commands, with their keys. */
	const contextItems = $derived(ws.contextMenu ? selectionMenu(ws.selection.map((id) => project.index.get(id)), {
		editLabel: (id) => ws.editText(id), remove: deleteSelected, similar: () => canvas?.selectSimilar(), match: () => setTool('match'), turn90,
		group: groupKey, order: orderKey, properties: () => layout.open('properties'),
		ports: portActions(), desks: outletsOntoDesksCmd,
	}) : [])
	/** Right-click › Copy outlets onto the other desks (W13): one undo step, the new outlets picked. */
	function outletsOntoDesksCmd() {
		const r = outletsOntoDesks(project.index, ws.selection)
		if ('problem' in r) { ws.say(r.problem); return }
		const n = r.put.filter((e) => e.type === 'outlet').length
		project.store.transact(`Outlets onto ${r.desks} desks`, (tx) => { for (const e of r.put) tx.put(e) })
		ws.select(r.select)
		ws.say(`${n} outlet${n === 1 ? '' : 's'} onto ${r.desks} desk${r.desks === 1 ? '' : 's'}, numbered on`)
	}
	/** Right-click on selected ports: Patch to… / Link to… (a panel's) at the top of the menu. */
	function portActions() {
		const s = ws.portSel, d = s ? project.index.get(s.on) : undefined
		if (!s || d?.type !== 'device') return undefined
		return { n: s.ports.length, patch: () => ws.patchFrom(s), ...(d.kind === 'panel' ? { interconnect: () => ws.interconnectFrom(s) } : {}) }
	}

	/** The cord defaults come from the project's settings on load (and when they change there), then stay as last
	 *  chosen — Patch to… / P / drag-to-patch use them without the Cord tool being picked first. */
	$effect(() => { const d = project.settings?.defaults; untrack(() => ws.seedCordDefaults(d)) })
	// Planning / Surveying (a project setting): what the cord tool's new cords start as
	/** Help › a tool's button: in a view it doesn't work in, say so (it used to drop back to Select silently). */
	function helpTool(id: ToolId) { pickTool(id) }
	/** A tool picked (the strip, Help): in a view it doesn't work in, the pane goes to this level's PLAN when the tool
	 *  works there and the tool is armed (/cad/agent gotcha 2: it only said where it works); otherwise it says where. */
	/** The Shape / Box tools' kind as a flyout variant (Rectangle / Polygon / Ellipse / Arc; Box / Cylinder / Polygon box). */
	const toolVariant = (t: ToolId) => (t === 'shape' ? ws.shapeOpts.kind : t === 'box' ? ws.boxOpts.kind : t === 'section' ? ws.sectionMode : undefined)
	/** A pick from the tools: a variant sets that tool's kind first. */
	function pickItem(id: ToolId, variant?: string) {
		if (variant && id === 'shape') ws.shapeOpts = { ...ws.shapeOpts, kind: variant as ShapeOpts['kind'] }
		if (variant && id === 'box') ws.boxOpts = { ...ws.boxOpts, kind: variant as ShapeOpts['kind'] }
		if (variant && id === 'section') ws.sectionMode = variant === 'room' ? 'room' : 'line'
		if (ws.toolId !== id) pickTool(id)
	}
	function pickTool(id: ToolId, keep = false) {
		if (toolWorksIn(id, activeKind, !!vpEditKind)) { setTool(id, keep); return }
		const n = TOOL_GROUPS.flatMap((g) => g.tools).find((t) => t.id === id)?.label.replace(/ \(.*\)$/, '') ?? id
		if (level && TOOL_VIEWS[id].includes('plan')) {
			setPane(activePane, PLAN)
			void tick().then(() => { setTool(id, keep); ws.say(`${n}: on the ${level.name} plan (it doesn’t work in that view)`) })
			return
		}
		ws.say(`The ${n} tool works in ${TOOL_VIEWS[id].join(', ')} views — open one to use it`)
	}
	function setTool(id: ToolId, keep = false) {
		canvas?.cancel()
		if (id === 'renumber' && !keep) ws.select([])   // a fresh pick: the click order is the numbering order (Properties › Renumber keeps the selection as the first picks)
		if (id === 'match') { const one = ws.selection.length === 1 ? project.index.get(ws.selection[0]) : undefined; ws.matchTool.source = one?.type === 'shape' ? one.id : null }
		if (id === 'rack') { ws.rackTool.target = null; ws.rackTool.product = null }   // the Rack button draws new racks (like the last); Place in the list sets a target, the catalogue a product
		if (id === 'device' && !ws.deviceTemplate) ws.deviceTemplate = project.deviceTemplates[0] ?? null
		ws.setTool(id, level)
	}


	/** Start typing a point while a drawing tool is active: the point box opens with what was typed. */
	function typePoint(first: string) {
		ws.askText(canvas?.typingLabel() ?? 'Point — x,y (or x..y) · @dx,dy · a length, Tab, an angle', first, (text) => {
			const err = canvas?.typed(text) ?? null
			if (err) ws.say(err)
		})
	}

	function deleteSelected() { deleteSelectedOf(project, ws) }
	function orderKey(how: 'forward' | 'backward' | 'front' | 'back') { orderKeyOf(project, ws, how) }
	function groupKey(ungroup: boolean) { groupKeyOf(project, ws, ungroup) }
	/** The keys (ui/shellKeys.ts). */
	const onKey = (e: KeyboardEvent) => shellKey(e, {
		project, ws, layout, panels, tabs, canvas: () => canvas, activePane: () => activePane, typePoint, showHistory, groupKey, orderKey,
		repeatDeviceEdit: () => repeatDeviceEdit(project, ws), help: (keys) => (helpOpen = keys ? 'keys' : 'help'),
		closeTab, showTab: (id) => showTab(id), navPane, toggleDrafting, deleteSelected, setTool, zoomSel, openProject: () => (openProjectOpen = true), print: printPdf, turn90,
		flipFace: () => {
			const s = panes[activePane]
			if (s.kind !== 'row') return false
			setPane(activePane, { ...s, face: s.face === 'front' ? 'rear' : 'front' })
			return true
		},
	})
	// ── calibrating a floorplan in place (backlog "Calibrate an image in place"): Project settings › Plans & floorplans ›
	// Origin / Scale / Crop arm the Calibrate tool on that level's plan; it writes the page's calibration in its FILE
	// (Uploads' format) — not in the drawing's undo, so each change offers "Undo" (or "Keep") ──
	ws.calibIO = {
		calib: (u) => project.pdf.calib[`${u.fileId}#${u.page ?? 1}`],
		write: (u, field, value, what) => {
			const page = u.page ?? 1
			const key = `${u.fileId}#${page}`
			// a new origin moves the floorplan on the plan: the view moves with it once it's redrawn (User 2026-10-16: the
			// plan jumped a second after the click, and the crop's corners were then clicked in the wrong place)
			const follow = (to: unknown) => { const c = project.pdf.calib[key]; if (field === 'origin' && c && to && typeof to === 'object') originFollow = { key, from: { ...c.origin }, to: to as Pt } }
			const save = () => { follow(value); return project.setPageCalib(u.fileId, page, field, value).then(
				(was) => ws.offerRevert(`${what} — saved in the floorplan's file (Uploads and every project using it).`, 'Undo',
					() => { follow(was ?? { x: 0, y: 0 }); void project.setPageCalib(u.fileId, page, field, was).then(() => ws.say('Undone — the floorplan is as it was'), (e) => (project.error = `Couldn't undo it: ${(e as Error).message}`)) }),
				(e) => (project.error = `Couldn't save the calibration: ${(e as Error).message}`)) }
			// the calibration is the FILE's: another project using the same floorplan moves with it — ask first
			project.fileProjects(u.fileId).then((pids) => {
				const others = pids.filter((p) => p !== project.pid).length
				if (others) ws.ask2(`This floorplan file is also used by ${others} other project${others === 1 ? '' : 's'} — its ${field} changes there too.`, `Change it (${others + 1} projects)`, () => void save())
				else void save()
			}, () => void save())
		},
	}
	/** A new origin waiting to be drawn: when the page is redrawn with it, the view pans by as much as the floorplan moved,
	 *  so it stays where it was on screen. */
	let originFollow = $state<{ key: string; from: Pt; to: Pt } | null>(null)
	$effect(() => {
		const f = originFollow
		if (!f) return
		const c = project.pdf.calib[f.key]
		if (!c || c.origin.x !== f.to.x || c.origin.y !== f.to.y) return
		untrack(() => { originFollow = null; canvas?.panModel(-(f.to.x - f.from.x) * c.sf, -(f.to.y - f.from.y) * c.sf) })
	})
	const CALIB_SAY: Record<CalibMode, string> = {
		origin: 'Click the point on the floorplan that is 0, 0 (a grid corner, a column) — Esc stops',
		scale: 'Click one end of a distance you know on the floorplan (a grid spacing, a dimension) — Esc stops',
		crop: 'Click one corner of the part of the floorplan to keep — Esc stops',
	}
	function oncalibrate(u: Underlay, mode: CalibMode, lead = '') {
		calibrating = true
		if (u.levelId !== ws.levelId) openLevel(u.levelId)
		if (panes[activePane].kind !== 'plan') setPane(activePane, PLAN)
		ws.calibTarget = { underlay: u, mode }
		setTool('calibrate')
		ws.say(lead + CALIB_SAY[mode])
	}
	// ── "Set up each floor" (W6): Origin then Crop for every floorplan in turn, lowest floor first, without going back
	// to the dialog; the floor below's floorplan in red underneath (Compare, screen only) to check they line up. Esc stops
	// the pass; picking another tool too. ──
	let setupSteps: { u: Underlay; mode: CalibMode; ghost?: string; n: number; of: number }[] = []
	let setupWas: { on: boolean; with: Record<string, string> } | null = null
	function setupStep() {
		const s = setupSteps.shift()
		if (!s) { endSetup(); ws.say('Every floor is set up — check them in Project › Floors…'); return }
		ws.compareWith = s.ghost ? { [s.u.id]: s.ghost } : {}
		ws.compareOn = !!s.ghost
		oncalibrate(s.u, s.mode, `${project.index.nameOf(s.u.levelId)} (${s.n} of ${s.of}): ${s.ghost ? 'red = the floor below · ' : ''}`)
	}
	function endSetup() {
		setupSteps = []
		if (setupWas) { ws.compareOn = setupWas.on; ws.compareWith = setupWas.with; setupWas = null }
	}
	function setupFloors(us: Underlay[]) {
		const lv = (u: Underlay) => project.index.getOf('level', u.levelId)
		const order = [...us].sort((a, b) => (lv(a)?.number ?? 0) - (lv(b)?.number ?? 0))
		setupWas = { on: ws.compareOn, with: ws.compareWith }
		setupSteps = order.flatMap((u, i) => {
			const below = order.slice(0, i).reverse().find((b) => (lv(b)?.number ?? 0) < (lv(u)?.number ?? 0))
			return (['origin', 'crop'] as const).map((mode) => ({ u, mode, ghost: below?.fileId, n: i + 1, of: order.length }))
		})
		setupStep()
	}
	// the next step starts at once (not after a tick): the Calibrate tool stays on, so the dialog stays out of the way
	ws.onCalibDone = (ok) => { if (!setupWas) return; if (ok) setupStep(); else { endSetup(); ws.say('Floor setup stopped') } }
	// another tool picked mid-pass: the pass stops (the tool change ended calibrating)
	$effect(() => { if (!calibrating) untrack(() => { if (setupWas && ws.toolId !== 'calibrate') endSetup() }) })
	/** A picture pasted (backlog "Paste a screenshot or picture"): stored like Draw › Image's uploads (the project's
	 *  files, listed in Uploads) and the Image tool armed with it at once — drag its box where it goes while it uploads
	 *  ("Uploading picture…" by Saved). The same picture pasted again is the same file: uploaded once. */
	const pictures = new PictureUploads(firestorePictureDeps(project.db, project.pid, () => project.settings?.fileStorage, project.pdf.showPicture))
	/** Measure the picked picture's width ÷ height (a PDF page: as rendered) and keep it on the pick: its box then keeps it. */
	async function measurePick(fileId: string, page?: number) {
		try {
			const url = await project.pdf.pictureReady(pictureRef(fileId, page ?? 1))
			if (!url) return
			const img = new Image()
			img.src = url
			await img.decode()
			if (img.naturalWidth && img.naturalHeight && ws.imagePick?.fileId === fileId && ws.imagePick.page === page) ws.imagePick = { ...ws.imagePick, ratio: img.naturalWidth / img.naturalHeight }
		} catch { /* no ratio: the box is as dragged, and keeps ITS shape when resized */ }
	}
	async function pastePicture(file: File) {
		if (!toolWorksIn('image', activeKind, !!vpEditKind)) { ws.say('Paste a picture into a plan, an elevation, a section or a sheet'); return }
		const d = new Date(), two = (n: number) => String(n).padStart(2, '0')
		const ext = file.type.split('/')[1]?.replace('jpeg', 'jpg') || 'png'
		const name = `Pasted ${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())} ${two(d.getHours())}.${two(d.getMinutes())}.${two(d.getSeconds())}.${ext}`
		try {
			const r = await pictures.add(file, name)
			ws.imagePick = { fileId: r.fileId, name: r.fileId }
			void measurePick(r.fileId)
			setTool('image')
			ws.say(r.fresh ? `Pasted picture: drag its box where it goes now — it uploads meanwhile (to Uploads as “${r.fileId}”) · Esc to leave it out`
				: `Pasted picture — already in Uploads as “${r.fileId}” (not uploaded again): drag its box where it goes · Esc to leave it out`)
			r.done.catch((e) => { project.error = `Couldn't upload the pasted picture “${r.fileId}”: ${(e as Error).message} — any you placed show only here; Undo removes them` })
		} catch (e) { project.error = `Couldn't paste the picture: ${(e as Error).message}` }
	}
	const clipboard = clipboardEvents({ project, ws, target: () => canvas?.pasteTarget(), inRow: () => activeKind === 'row', image: (f) => void pastePicture(f), note: (t) => !!canvas?.pasteNote(t), cursor: () => canvas?.pasteCursor() ?? null })


</script>

<svelte:window onkeydown={(e) => { clipboard.key(e); onKey(e) }} onkeyup={(e) => { if (ARROWS[e.key]) canvas?.endNudge() }} oncopy={clipboard.copy} oncut={clipboard.cut} onpaste={clipboard.paste} />

<!-- a long press (touch / pen) anywhere is a right-click on what it's on: every right-click menu works on a tablet -->
<div class="shell bg-zinc-50 text-sm" use:longPress style:grid-template-columns="{dockW('left')}px minmax(0, 1fr) {dockW('right')}px"
	style:grid-template-rows="1.75rem 2.25rem 1.75rem minmax(0, 1fr) {tablesRow}px 1.6rem">
	<MenuBar {menus}>
		{#snippet right()}
			<span class="saved text-xs">
				{#if pictures.pending}<span class="uploading" title="A pasted picture is uploading — you can place it meanwhile"><span class="spin"></span>Uploading picture{pictures.pending > 1 ? `s (${pictures.pending})` : ''}…</span>{/if}
				<!-- an error beside the save state, not instead of it, until ✕ (or, a saving error, the next good write) — Review 2 Q29 -->
				{#if project.error}<span class="err" role="alert">{project.error}<button class="err-x" title="Dismiss" aria-label="Dismiss the message" onclick={() => (project.error = null)}>✕</button></span>{/if}
				{#if !project.loaded}Loading…
				{:else if project.pendingWrites}Saving…{:else}Saved{/if}
			</span>
		{/snippet}
	</MenuBar>

	<!-- tools and their options -->
	<div class="bar flex items-center gap-1 border-b border-[var(--cad-line)] bg-[var(--cad-panel)] px-2">
		<!-- the Navigator on / off at the top left (R7-7, User 2026-10-16: no sign where the tree went) -->
		<button class="ib {layout.shown('navigator') ? 'on' : ''}" onclick={() => { if (layout.allHidden) { layout.allHidden = false; if (!layout.wins.navigator.open) layout.open('navigator') } else layout.toggle('navigator') }} title="{layout.shown('navigator') ? 'Hide' : 'Show'} the Navigator (the project tree)"><Icon name="listTree" size={15} /></button>
		<span class="mx-1 h-5 w-px bg-zinc-200"></span>
		{#if !toolsFloat}<ToolStrip tool={ws.toolId} kind={activeKind} onSheet={!!vpEditKind} variantOf={toolVariant} onTool={pickItem} />{/if}
		<span class="ml-auto"></span>
		<button class="ib" disabled={!project.canUndo} onclick={() => showHistory(project.undo())} title="Undo ({KEYS.undo}) — selects what came back or changed (on its level)"><Icon name="undo" size={15} /></button>
		<button class="ib" disabled={!project.canRedo} onclick={() => showHistory(project.redo())} title="Redo ({KEYS.redo}) — selects what it changed (on its level)"><Icon name="redo" size={15} /></button>
		<button class="ib" disabled={!openSheetId && panes[activePane]?.kind === 'sheet'} onclick={printPdf} title={openSheetId ? `Print: this sheet as a PDF in a new browser tab (${KEYS.print}) — ▾ for all sheets` : `Print: this whole view on A3 as a PDF in a new browser tab (${KEYS.print}) — ▾ for what's on screen, or all sheets`}><Icon name="print" size={15} /></button>
		<button class="ib caret" aria-label="Print options" title="Print: this sheet / whole view / on screen / all sheets" onclick={(e) => { const r = e.currentTarget.getBoundingClientRect(); printMenu = { x: r.left, y: r.bottom } }}>▾</button>
		<button class="ib" disabled={!ws.selection.length} onclick={() => turn90(-1)} title="Turn the selection 90° left (Shift+R)"><Icon name="rotateLeft" size={15} /></button>
		<button class="ib" disabled={!ws.selection.length} onclick={() => turn90(1)} title="Turn the selection 90° right (R)"><Icon name="rotateRight" size={15} /></button>
		<button class="ib" disabled={!ws.selection.length && !ws.portSel && !ws.openingSel} onclick={deleteSelected} title="Delete the selection (Delete key) — asks first when more goes with it; Undo brings it back"><Icon name="trash" size={15} /></button>
		<span class="mx-1 h-5 w-px bg-zinc-200"></span>
		<button class="ib {panes.length === 2 ? 'on' : ''}" onclick={toggleSplit} title="Two views side by side (plan + elevation, or two levels) — each pane has its own view and level"><Icon name="columns" size={15} /></button>
		<button class="ib {tablesShown ? '' : 'dim'}" onclick={() => panels.toggle('bottom')} title="{tablesShown ? 'Hide' : 'Show'} the tables (outlets, patch list, sheets, links) — Ctrl+,"><Icon name="panelBottom" size={15} /></button>
		<button class="ib {layout.allHidden ? 'on' : ''}" onclick={() => (layout.allHidden = !layout.allHidden)} title="{layout.allHidden ? 'Show' : 'Hide'} every window and the tables — Ctrl+."><Icon name="eyeSlash" size={15} /></button>
	</div>

	<div class="opts flex items-center gap-2 border-b border-[var(--cad-line)] bg-[var(--cad-panel)] px-2">
		<!-- always on show (review R53): the active tool, the layer new items go on, and editing inside a viewport -->
		<span class="chip tool" title="The active tool (Esc: back to Select)">{toolName}</span>
		<!-- R7-7: Hide all windows had no sign it was on -->
		{#if layout.allHidden}<button class="chip hidden-on" title="Every window and the tables are hidden (View › Hide all windows, Ctrl+.)" onclick={() => (layout.allHidden = false)}>Windows hidden · Show <kbd>Ctrl+.</kbd></button>{/if}
		<label class="chip" title="The layer new lines, notes and blocks go on (walls, runs, outlets and racks go on their own)">Layer
			<select value={ws.layers.current ?? ''} onchange={(e) => ws.layers.setCurrent(e.currentTarget.value || null)}>
				<option value="">by kind</option>
				{#each layerList as l (l.id)}<option value={l.id}>{l.name}</option>{/each}
			</select>
		</label>
		{#if ws.vpEdit}<button class="chip vp" title="Leave the viewport (Esc, or a double-click outside it)" onclick={() => canvas?.leaveViewport()}>Editing in a viewport ✕</button>{/if}
		<ToolOptions {project} {ws} {level} kind={activeKind} guidesKey={canvas?.guidesKey()} />
		<!-- V as a button (Round 7, User: "is the V command easy to find?" — it was only in the hint line) -->
		{#if (ws.toolId === 'trunk' || ws.toolId === 'conduit') && activeKind === 'plan'}
			<button class="chip" disabled={!pathPending} title={pathPending ? 'A riser from the last point to another floor (V); that floor’s plan opens and the run carries on from the riser' : 'Click where the run starts first'} onclick={() => canvas?.riserPath()}>Riser to floor… <kbd>V</kbd></button>
		{/if}
		{#if ws.touchInput && pathPending}
			<!-- no Enter / Esc on a touch screen: finish or drop the run being drawn (a double-tap finishes too) -->
			<button class="chip" title="Finish this run or line (a double-tap does too)" onclick={() => canvas?.finishPath()}>Finish</button>
			<button class="chip" title="Drop it — nothing is drawn" onclick={() => canvas?.cancelPath()}>Cancel</button>
		{/if}
		{#if hint}<span class="hint" title={hint}>{hint}</span>{/if}
	</div>

	{#snippet winBody(id: WinId)}
		{#if offHere(id)}<p class="offhere">Not used in this view — back with a view it works in.</p>{:else}
		<WindowBody {id} {project} {ws} {level} {projectName} current={{ levelId: ws.levelId ?? undefined, spec: panes[activePane] }} tabbed={new Set(tabs.list.map((t) => viewKeyOf(t.view)))}
			on={{ navOpen, floors: () => openSettings('floors'), settings: () => openSettings('usages'), newSheet, pdfAll: pdfAllSheets, pdf: pdfSheet,
				insert: (b) => { if (b) { ws.insertBlock = b; setTool('insert') } else setTool('select') }, view: (s) => setPane(activePane, s) }} />
		{/if}
	{/snippet}

	{#snippet tables(closed = false)}
		<TablesPanel {project} {ws} {panels} {level} {projectName} roomId={patchRoom} inRoomView={panes[activePane]?.kind === 'row'}
			tab={bottom} onpick={pickBottom} onview={(s) => setPane(activePane, s)} area={planEl} {closed} />
	{/snippet}


	<!-- docked windows: the left and right columns (today's side panels), stacked -->
	{#each ['left', 'right'] as const as side (side)}
		<aside class="dock dock-{side}" class:gone={!docked(side).length}>
			<ResizeHandle bind:value={panels.size[side]} side={side === 'left' ? 'right' : 'left'} min={170} max={560} onend={panels.save} />
			{#each docked(side) as id (id)}<CadWindow {layout} {id} area={planEl}>{@render winBody(id)}</CadWindow>{/each}
		</aside>
	{/each}

	<!-- the drawing: one or two panes, floating windows over it -->
	<main class="plan relative" bind:this={planEl}>
		{#if toolsFloat}<ToolPalette tool={ws.toolId} kind={activeKind} onSheet={!!vpEditKind} variantOf={toolVariant} onTool={pickItem} ondock={() => setToolsFloat(false)} />{/if}
		<TabStrip {tabs} {project} panes={panes.length} {activePane} onshow={(id) => showTab(id)} onclose={closeTab} onmenu={(id, x, y) => (tabMenu = { id, x, y })} />
		<AskBox {ws} onanswer={() => canvas?.refresh()} />
		<PatchPreview {ws} />
		{#if project.loaded && !project.levels.length}
			<ImportPanel {project} projectName={(details as { masterId?: string } | undefined)?.masterId && details?.buildingName ? `${projectName} – ${details.buildingName}` : projectName} onsetup={() => { settingsTab = 'floors'; settingsOpen = true }} />
		{:else if level}
			<div class="panes" bind:this={panesEl}>
				{#each panes as spec, i (i)}
					{#if i === 1}
						<!-- the bar between split views: drag to share the width (double-click: half and half) -->
						<SplitBar {panels} container={panesEl} />
					{/if}
					<div class="pane" style:flex={panes.length === 2 ? `${i === 0 ? panels.split : 1 - panels.split} 1 0` : undefined}>
						<!-- each pane its own level; the other's work plane shows only when both are on the same one -->
						<ViewCanvas bind:this={canvases[i]} {project} {ws} levelId={paneLevelIds[i] ?? level.id} {spec}
							other={panes.length === 2 && paneLevelIds[1 - i] === paneLevelIds[i] ? panes[1 - i] : undefined} active={activePane === i}
							onspec={(s) => setPane(i, s)} onfocus={() => (ws.pane = i)} nav={navOf(i)} />
					</div>
				{/each}
			</div>
		{/if}
		{#each layout.floating().filter((id) => !offHere(id)) as id (id)}<CadWindow {layout} {id} area={planEl}>{@render winBody(id)}</CadWindow>{/each}
		{#if tablesShown && (panels.tables.float || panels.tables.max)}{@render tables()}{/if}
		<!-- a window dragged to an edge docks there on release -->
		{#if layout.dropSide}<div class="drop drop-{layout.dropSide}"></div>{/if}
		{#if ws.toast}<div class="toast" role="status">{ws.toast}</div>{/if}
	</main>

	{#if catalogueOpen}<CatalogueDialog {project} onclose={() => (catalogueOpen = false)} ondraw={(p, name) => { catalogueOpen = false; if (panes[activePane].kind !== 'plan') setPane(activePane, PLAN); ws.drawProduct(p); ws.say(`Rack tool: each click on the plan draws a ${name} — Esc stops`) }} />{/if}
	{#if settingsOpen}<SettingsDialog {project} {ws} bind:tab={settingsTab} hidden={calibrating} onclose={() => { settingsOpen = false; calibrating = false }} {oncalibrate} onsetupfloors={setupFloors} {projectDetails} {detailsTabs} />{/if}
	{#if imagePickOpen}<ImagePickDialog {project} onclose={() => (imagePickOpen = false)} onpick={(p) => { imagePickOpen = false; ws.imagePick = p; void measurePick(p.fileId, p.page); setTool('image'); ws.say(`${p.name}: drag its box on the ${activeKind === 'sheet' ? 'sheet' : 'plan'}`) }} />{/if}
	{#if uploadsOpen}<UploadsDialog {pid} projectName={project.name} onclose={() => (uploadsOpen = false)} />{/if}
	{#if openProjectOpen}<OpenProjectDialog currentId={pid} onpick={(id) => { if (id !== pid) void goto(`/projects/${id}/cad`) }} onclose={() => (openProjectOpen = false)} />{/if}
	<RestoreNotice {project} />
	{#if backupsOpen}<BackupsDialog {project} onclose={() => (backupsOpen = false)} say={(m) => ws.say(m)} onrestore={(src) => { restoreSource = src; backupOpen = 'restore' }} />{/if}
	{#if historyOpen}<HistoryDialog {project} {ws} onclose={() => (historyOpen = false)} />{/if}
	{#if backupOpen}<BackupDialog {project} mode={backupOpen} source={backupOpen === 'restore' ? restoreSource : undefined} onclose={() => { backupOpen = false; restoreSource = undefined }} say={(m) => ws.say(m)} />{/if}
	{#if legacyOpen}<LegacyDrawingsDialog {project} onclose={() => (legacyOpen = false)} say={(m) => ws.say(m)} />{/if}
	{#if saveAs}<FileNameDialog name={saveAs.name} ext={saveAs.ext} type={saveAs.type} ondone={saveAs.done} bump={saveBump} />{/if}
	{#if ws.textAsk}{@const q = ws.textAsk}<TextDialog title={q.title} label={q.label} value={q.value} hint={q.hint} ok={q.ok} ondone={(t) => { const apply = q.apply; ws.textAsk = null; if (t != null) apply(t) }} />{/if}
	{#if helpOpen}<HelpDialog start={helpOpen === 'help' ? undefined : helpOpen} hints={HINT} onclose={() => (helpOpen = false)} ontool={helpTool} />{/if}
	{#if tabMenu}<ContextMenu x={tabMenu.x} y={tabMenu.y} items={tabMenuItems} onclose={() => (tabMenu = null)} />{/if}
	{#if ws.contextMenu}<ContextMenu x={ws.contextMenu.x} y={ws.contextMenu.y} items={contextItems} onclose={() => (ws.contextMenu = null)} />{/if}
	{#if printMenu}<ContextMenu x={printMenu.x} y={printMenu.y} items={printItems} onclose={() => (printMenu = null)} />{/if}
	<Exports bind:this={exportsRef} {project} {ws} {level} {projectName} roomId={patchRoom} />

	<!-- the tables docked under the drawing (floating / maximised they sit in the drawing area, above) -->
	<section class="grid-panel relative border-t border-[var(--cad-line)] bg-[var(--cad-panel)]" class:gone={!tablesDocked && !tablesBar}>
		{#if tablesDocked}
			<ResizeHandle orientation="horizontal" bind:value={panels.size.bottom} side="top" min={80} max={700} onend={panels.save} />
			{@render tables()}
		{:else if tablesBar}{@render tables(true)}{/if}
	</section>

	<StatusBar {ws} info={canvas?.info()} hint="" onfit={() => canvas?.zoomExtents()} onanswer={() => canvas?.refresh()} selected={selectedText} onzoomsel={zoomSel} {working} />
</div>

<style>
	.offhere { margin: 8px 10px; font-size: 11px; color: var(--cad-faint); }
	.err { display: inline-flex; align-items: center; gap: 2px; margin-right: 8px; color: #dc2626; }
	.err-x { display: inline-flex; align-items: center; justify-content: center; min-width: 18px; min-height: 18px; border-radius: 3px; color: inherit; }
	.err-x:hover { background: #fee2e2; }
	/* Color tokens for cad's panels, lists and dialogs: today's light colors, or the app theme's when one is set
	   (kestrel.css --t-*), so Kestrel Dark stays readable. The drawing canvas keeps its own (white, like paper). */
	.shell {
		--cad-panel: var(--t-surface, white);
		--cad-subtle: var(--t-surface2, #fafafa);
		--cad-hover: var(--t-hover, #f4f4f5);
		--cad-strong: var(--t-surface3, #e4e4e7);
		--cad-line: var(--t-edge, #e4e4e7);
		--cad-input: var(--t-input, white);
		--cad-text: var(--t-ink, #18181b);
		--cad-muted: var(--t-ink2, #71717a);
		--cad-faint: var(--t-ink3, #a1a1aa);
		--cad-sel: var(--t-sel, #dbeafe);
		--cad-pick: #fef3c7;
		--cad-link: #1d4ed8;
		--cad-sel-line: #93c5fd;   /* the border of a selected / "on" control */
		--cad-sel-text: #1e3a8a;   /* its text on --cad-sel */
		--cad-feature: #eff6ff;    /* a featured card (Help) */
	}
	:global(:root[data-theme='kestrel-dark']) .shell { --cad-pick: #3a3320; --cad-link: #79b8ff; --cad-sel-line: #3b6aa8; --cad-sel-text: #cfe3ff; --cad-feature: #1c2a3f; }
	/* Layout lives here, not in Tailwind arbitrary classes: the panel sizes belong to the component. */
	.shell {
		display: grid;
		height: calc(100dvh - 28px);   /* the page's title bar is 28px: no gap under the status bar (User) */
		/* column / row sizes come from Panels (resizable, hideable) */
		grid-template-areas: 'menu menu menu' 'bar bar bar' 'opts opts opts' 'dleft plan dright' 'dleft grid dright' 'status status status';
	}
	.bar { grid-area: bar; }
	.opts { grid-area: opts; min-width: 0; overflow: hidden; white-space: nowrap; }
	.opts .chip { display: inline-flex; align-items: center; gap: 4px; flex: none; padding: 0 6px; border-radius: 4px; font-size: 11px; color: var(--cad-text); background: var(--cad-subtle, #f4f4f5); border: 1px solid var(--cad-line, #e4e4e7); white-space: nowrap; }
	.opts .chip.tool { font-weight: 600; }
	.opts .chip select { font-size: 11px; border: 0; background: transparent; color: inherit; }
	.opts .chip.vp { background: #fef3c7; border-color: #f59e0b; }
	.opts .chip.hidden-on { background: #fef3c7; border-color: #f59e0b; cursor: pointer; }
	.opts .hint { color: var(--cad-muted, #71717a); font-size: 11px; overflow: hidden; text-overflow: ellipsis; }
	.dock { position: relative; min-height: 0; display: flex; flex-direction: column; background: var(--cad-panel); overflow: hidden; }
	.dock-left { grid-area: dleft; border-right: 1px solid var(--cad-line); }
	.dock-right { grid-area: dright; border-left: 1px solid var(--cad-line); }
	.plan { grid-area: plan; min-height: 0; min-width: 0; display: flex; flex-direction: column; }
	.grid-panel { grid-area: grid; min-height: 0; min-width: 0; display: flex; }
	/* a drag on a panel's blank space doesn't select its text (User) — tables still do, for copying (fields always do) */
	.dock, .grid-panel { user-select: none; -webkit-user-select: none; }
	/* a selected row, the same in every table (UX review V2): the drawing's selection blue, a bar on its left */
	.shell :global(tr.row-sel) { background: var(--cad-sel, #dbeafe) !important; box-shadow: inset 3px 0 0 #2563eb; }
	:global(:root[data-theme='kestrel-dark']) .shell :global(tr.row-sel) { background: var(--cad-sel) !important; }
	.dock :global(table), .grid-panel :global(table) { user-select: text; -webkit-user-select: text; }
	/* on a touch screen a long press is a right-click (ui/longPress.ts): not the system's word selection / callout too */
	@media (hover: none) {
		.shell { -webkit-touch-callout: none; }
		.dock :global(table), .grid-panel :global(table) { user-select: none; -webkit-user-select: none; }
		.shell :global(input), .shell :global(textarea) { user-select: text; -webkit-user-select: text; }
	}
	.gone { display: none !important; }
	/* one or two views side by side */
	.panes { display: flex; flex: 1; min-height: 0; background: var(--cad-line); }
	.ib { display: inline-flex; align-items: center; justify-content: center; width: 26px; height: 26px; border-radius: 5px; color: var(--cad-muted); }
	.ib.caret { width: 14px; margin-left: -4px; font-size: 10px; }
	.ib:hover:not(:disabled) { background: var(--cad-hover); color: var(--cad-text); }
	.ib:disabled { opacity: 0.35; }
	.ib.on { background: var(--cad-sel, #dbeafe); color: var(--cad-link, #1d4ed8); }
	.ib.dim { color: var(--cad-faint); }
	.saved { margin-left: 8px; min-width: 3.5rem; text-align: right; }
	.uploading { display: inline-flex; align-items: center; gap: 4px; margin-right: 8px; color: var(--cad-link, #2563eb); }
	.spin { width: 10px; height: 10px; border: 2px solid currentColor; border-right-color: transparent; border-radius: 50%; animation: spin 0.8s linear infinite; }
	@keyframes spin { to { transform: rotate(360deg); } }
	.drop { position: absolute; top: 0; bottom: 0; width: 6px; background: #3b82f6; opacity: 0.6; z-index: 60; pointer-events: none; }
	.drop-left { left: 0; }
	.drop-right { right: 0; }
	.pane { flex: 1 1 0; min-width: 0; position: relative; }
	.toast { position: absolute; left: 50%; bottom: 12px; transform: translateX(-50%); z-index: 30; padding: 4px 10px; border-radius: 6px; font-size: 12px; color: var(--cad-text); background: var(--cad-panel); border: 1px solid var(--cad-line); box-shadow: 0 2px 8px rgb(0 0 0 / 0.15); pointer-events: none; }
</style>
