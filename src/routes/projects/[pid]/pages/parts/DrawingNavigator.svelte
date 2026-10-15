<script lang="ts">
	// Left-sidebar DRAWING NAVIGATOR (Pages mockup) — modelled on the reference design:
	// a tree organised by LOCATION (Floors / Server Rooms / Data Center / Racks) whose
	// leaves are the drawings / views. Clicking a leaf opens it as a canvas tab. Mock data.
	//
	// TREE VIEWS (tree-views-plan.md, with `views`): the same models + sheets listed another way — "By place" (the
	// place tree; the only view where a drag re-files), a GROUP view (folders from the items' fields; dropping sheets
	// onto a group sets that field) or a team CUSTOM view (folders of references + smart folders; drag in / between /
	// reorder, Ctrl-drag copies). Rows act the same in every view (open, preview, ⋮, multi-select, rename, delete) —
	// a row's `ref` names the item when the row id is view-specific. A MODEL row always looks unlike a SHEET row (§3.5).
	import { Icon, DragReorder, listClick, selBlock } from '$lib'
	import { TreeDrag, type DropZone } from './treeDrag.svelte'
	import TagPicker from './TagPicker.svelte'
	import SmartFilterEditor from './SmartFilterEditor.svelte'
	import { LINK_TOOLS, type SheetLink } from '../store/schema'
	import { KIND_LABELS, type TreeViewsApi, type TreeView, type TreeFilter } from '../store/treeViews'
	import { mergeTags, withoutTags, hasTag } from '../store/tags'
	import { tick, untrack, type Snippet } from 'svelte'
	import { type NavKind as Kind, type NavNode as Node, NAV_TREE as TREE, NAV_PROJECT as PROJECT } from '../mock/data'

	let { onopen, onopenfloor, oncollapse, onselectnode, activeDoc = '', activeNode = '', tree = null, project = null, status = '', onaddbuilding, onmovefloor, onmovebuilding, reveal = [],
		placesMode = false, onseedplaces, onplaceadd, onplacerename, onplacemove, onplacedelete, onopenplace, onsheetadd, onsheetrename, onsheetdelete, onsheetduplicate, onsheetcopy, onsheetpaste, onlinksheet, onplaceimport, onplaceracks, onimportdrawing, onimportriser,
		views = null, onopenmodel, head }:
		{ onopen?: (d: { title: string; kind: Kind; preview: boolean; floor?: string; docId?: string }) => void; oncollapse?: () => void;
			/** The sidebar's tab strip (Drawings | Items), drawn in place of the DRAWINGS title. */
			head?: Snippet;
			/** A FLOOR row was clicked (preview) or double-clicked (kept): open that floor's model tab. */
			onopenfloor?: (floor: string, preview: boolean) => void;
			onselectnode?: (n: { id: string; label: string; kind: string; floorNumber?: number; building?: string }) => void;
			/** B18: the active tab's drawing id — a drawing row is highlighted by id, not by label */ activeDoc?: string; activeNode?: string;
			/** The REAL project tree (projectTree.ts, from Firestore) + its project label; null → the mock tree. */
			tree?: Node[] | null; project?: { id: string; label: string } | null;
			/** A line under the project label while the real tree loads / when the project isn't in Firestore. */
			status?: string;
			/** Real tree only: create a building (resolves false if the name is empty / taken), drag a floor into a
			 *  building, drag a building to reorder. Absent → no New-building button, no dragging (the mock tree). */
			onaddbuilding?: (name: string) => Promise<boolean>; onmovefloor?: (floorNumber: number, building: string) => void;
			onmovebuilding?: (name: string, target: string, after: boolean) => void;
			/** Node ids to open (e.g. the restored item's ancestors) — expanded once when they change. */
			reveal?: string[]
			/** drawings-plan phase 2: the tree is built from the project's PAGES places (store/placeTree.ts) — rows
			 *  marked `place` can be added / renamed / dragged anywhere / deleted. */
			placesMode?: boolean
			/** No places yet: offer to create them once from the project data (store/places.ts seedPlaces). */
			onseedplaces?: () => void
			/** New place under `parentId` (null = top level); returns its id so the row opens for renaming. */
			onplaceadd?: (parentId: string | null) => string | undefined
			onplacerename?: (id: string, name: string) => void
			onplacemove?: (id: string, targetId: string, zone: DropZone) => void
			/** Delete a place; returns an error message when it can't be deleted (it holds things). */
			onplacedelete?: (id: string) => string | null
			/** Places mode: open a place's MODEL tab (creating the model if it has none) — a floor place previews it
			 *  on click, any place opens it (kept) on double-click (drawings-plan phase 3). */
			onopenplace?: (id: string, preview: boolean) => void
			/** Places mode (drawings-plan phase 4): a new Pages sheet filed under a place — returns its tree row id
			 *  so it opens for renaming; rename / archive a sheet leaf. Sheets drag like places (`onplacemove`). */
			onsheetadd?: (placeId: string) => string | undefined
			onsheetrename?: (rowId: string, title: string) => void
			/** Delete a sheet (after the menu's click-again confirm; the toast offers Undo). */
			onsheetdelete?: (rowId: string) => void
			/** B5: a link sheet under a place, opening another tool at its floor / room. */
			onlinksheet?: (placeId: string, tool: SheetLink['tool']) => void
			/** B1: duplicate a sheet leaf (right after it). */
			onsheetduplicate?: (rowId: string) => void
			/** Copy a whole page (sheet row) to the clipboard / paste one into a place (place row). */
			onsheetcopy?: (rowId: string) => void; onsheetpaste?: (placeRowId: string) => void
			/** Import the place's outlets + trunks from the Outlets tool into its model (places with `outletsDoc`). */
			onplaceimport?: (placeId: string) => void
			/** G4: rebuild a rack-row place's model from the Racks tool (places with `racksRow`). */
			onplaceracks?: (placeId: string) => void
			/** Phase 8: make a Pages sheet from another tool's register drawing (a `d:<id>` leaf). */
			onimportdrawing?: (leafId: string) => void
			/** Phase 8: import a Risers-tool doc into the building model (a `riser:<id>` leaf). */
			onimportriser?: (riserId: string) => void
			/** Tree views (tree-views-plan): the switcher + group / custom view editing + tags; null = places only. */
			views?: TreeViewsApi | null
			/** A MODEL row (tree views) was clicked (preview) / double-clicked (kept). Absent → views.openModel. */
			onopenmodel?: (modelId: string, preview: boolean) => void } = $props()
	const TREE_NODES = $derived(tree ?? TREE)
	const PROJ = $derived(project ? { ...project, kind: 'project' } : PROJECT)
	// A floor row's model / tab name: the real tree carries it (`floor`, e.g. '33F'); the mock's label is it.
	const floorOf = (n: Node) => n.floor ?? n.label
	/** The current view's kind ('places' without views). */
	const vkind = $derived(placesMode && views ? views.current.kind : 'places')
	/** The ITEM a row shows (`s:<id>` / `m:<id>` / a place id) — a view can list one item on several rows. */
	const refOf = (n: Node) => n.ref ?? n.id

	// ── buildings (real tree): New building + drag floors between buildings / reorder buildings ──
	// One DragReorder over the building + floor rows ($lib, the Layers panel's helper): dropping a FLOOR on a
	// building moves it there, on another floor moves it into THAT floor's building; dropping a BUILDING on a
	// building reorders. Anything else is ignored. Index = position in the flattened tree (drop direction).
	const canDrag = $derived(!!tree && !!onmovefloor)
	const flat = $derived.by(() => { const out: Node[] = []; const walk = (ns: Node[]) => { for (const n of ns) { out.push(n); if (n.children) walk(n.children) } }; walk(TREE_NODES); return out })
	const byId = $derived(new Map(flat.map((n) => [n.id, n])))
	const nodeById = (id: string) => byId.get(id)
	const buildingOfNode = (n: Node): string | undefined => n.folder === 'building' ? n.label : TREE_NODES.find((b) => b.folder === 'building' && b.children?.some((c) => c.id === n.id))?.label
	const dr = new DragReorder((id, targetId, after) => {
		const a = nodeById(id), t = nodeById(targetId); if (!a || !t) return
		if (a.folder === 'floor' && a.floorNumber != null) { const b = buildingOfNode(t); if (b && b !== buildingOfNode(a)) onmovefloor?.(a.floorNumber, b) }
		else if (a.folder === 'building' && t.folder === 'building') onmovebuilding?.(a.label, t.label, after)
	}, (id) => flat.findIndex((n) => n.id === id))
	// B8 → multi-select for PLACES and SHEETS (and, in a tree view, MODELS) ($lib listClick): Ctrl/⌘-click toggles a
	// row, Shift-click selects the range from the last one (in the order shown); a plain click opens / selects as
	// before. Dragging any selected row moves the whole block (keeping its order; a row inside a selected place goes
	// with its place), and the ⋮ menu of a selected row acts on them all.
	let selRows = $state<string[]>([]), selAnchor: string | null = null
	const isSelRow = (n: Node) => !!placesMode && (!!n.place || (!!n.sheet && !!n.drawing) || (vkind !== 'places' && !!n.model))
	// another view → another set of rows: the selection starts over
	$effect(() => { void views?.current.id; untrack(() => { selRows = []; selAnchor = null; menu = null }) })
	const parentOf = $derived.by(() => { const m = new Map<string, string>(); const walk = (ns: Node[], p?: string) => { for (const n of ns) { if (p) m.set(n.id, p); if (n.children) walk(n.children, n.id) } }; walk(TREE_NODES); return m })
	const ancestors = (id: string) => { const out: string[] = []; for (let p = parentOf.get(id); p; p = parentOf.get(p)) out.push(p); return out }
	const parentNode = (n: Node) => { const p = parentOf.get(n.id); return p ? nodeById(p) : undefined }
	/** The selectable rows in the order SHOWN (collapsed branches skipped) — Shift ranges run over this. */
	const shownRows = $derived.by(() => { const out: string[] = []; const walk = (ns: Node[]) => { for (const n of ns) { if (search && !visible(n)) continue; if (isSelRow(n)) out.push(n.id); if (n.children && (openOf(n) || search)) walk(n.children) } }; walk(TREE_NODES); return out })
	const inMulti = (id: string) => selRows.length > 1 && selRows.includes(id)
	function rowSelClick(e: MouseEvent, n: Node): boolean {
		let cur = selRows
		if ((e.ctrlKey || e.metaKey || e.shiftKey) && !cur.length) {   // the open sheet / selected place joins the selection
			const open = shownRows.map((id) => nodeById(id)).find((x) => x && (x.sheet || x.model) && x.docId === activeDoc)?.id ?? (nodeById(activeNode)?.place ? activeNode : undefined)
			if (open) { cur = [open]; selAnchor ??= open }
		}
		const r = listClick(shownRows, cur, selAnchor, n.id, e)
		selRows = r.multi ? r.sel : []; selAnchor = r.anchor
		return r.multi
	}
	/** A drag / bulk action's rows: the selection (in shown order) when `id` is in it — minus rows whose place is also
	 *  in it (they move / go with it) — else just `id`. */
	function blockOf(id: string): string[] {
		const b = selBlock(shownRows, selRows, id)
		return b.filter((x) => !ancestors(x).some((a) => b.includes(a)))
	}
	/** The distinct SHEETS (refs `s:<id>`) among some rows. */
	const sheetRefsOf = (rows: string[]) => [...new Set(rows.map((id) => nodeById(id)).filter((x): x is Node => !!x?.sheet).map(refOf))]
	function moveRows(id: string, target: string, zone: DropZone) {
		const block = blockOf(id)
		if (block.includes(target) || ancestors(target).some((a) => block.includes(a))) return   // not into itself
		// after a row (a drop on a SHEET row's middle also lands after it): move the LAST first so each lands right
		// after the target, ahead of the ones already moved; 'into' a place appends, so it keeps the order as is
		const after = zone === 'after' || (zone === 'into' && !!nodeById(target)?.sheet)
		for (const x of after ? [...block].reverse() : block) onplacemove?.(x, target, zone)
	}
	// ── drops in a tree VIEW ──
	/** The group folder a drop on `t` lands in (it, or the group it's in). */
	const groupTarget = (t?: Node): Node | undefined => { let p = t; while (p && !p.vgroup) p = parentNode(p); return p }
	/** The PLAIN custom folder a row sits in (its id), else null (the pool, a smart folder). */
	const plainFolderOf = (n: Node) => { const p = parentNode(n); return p?.cfolder && !p.smart ? p.cfolder : null }
	function dropRows(id: string, target: string, zone: DropZone, copy: boolean) {
		if (vkind === 'places') { moveRows(id, target, zone); return }
		const a = nodeById(id), t = nodeById(target); if (!a || !t || !views) return
		if (vkind === 'group') {   // sheets onto a group take its fields (drop on "high-level" adds the tag)
			const g = groupTarget(t), refs = sheetRefsOf(blockOf(id))
			if (g?.vgroup && refs.length) views.groupDrop(refs, g.vgroup.path)
			return
		}
		if (a.cfolder) { if (t.cfolder && t.cfolder !== a.cfolder) views.folderMove(a.cfolder, t.cfolder, zone); return }   // reorder / nest folders
		// items: into a folder (its end), beside an item in a plain folder, or out to the pool (= out of their folders)
		const seen = new Set<string>()
		const refs = blockOf(id).map((x) => nodeById(x)).filter((x): x is Node => !!x && !!(x.sheet || x.model))
			.map((r) => ({ ref: refOf(r), from: plainFolderOf(r) })).filter((r) => !seen.has(`${r.ref}|${r.from}`) && !!seen.add(`${r.ref}|${r.from}`))
		if (!refs.length) return
		if (t.pool || parentNode(t)?.pool) { views.fileRefs({ refs, to: null, copy: false }); return }
		if (t.cfolder) { if (!t.smart) views.fileRefs({ refs, to: t.cfolder, copy }); return }
		const pf = parentNode(t); if (!pf?.cfolder || pf.smart) return
		views.fileRefs({ refs, to: pf.cfolder, target: refOf(t), zone: zone === 'into' ? 'after' : zone, copy })
	}
	const td = new TreeDrag(dropRows)
	$effect(() => { td.copyable = vkind === 'custom' })
	const dragProps = (n: Node) => {
		if (!placesMode) return canDrag && (n.folder === 'building' || (n.folder === 'floor' && n.floorNumber != null)) ? dr.row(n.id) : {}
		if (vkind === 'places') return (n.place || n.sheet) && onplacemove ? td.row(n.id) : {}
		if (!views || n.subhead) return {}
		if (vkind === 'group') return n.sheet ? td.row(n.id) : n.vgroup || n.model ? td.row(n.id, false) : {}
		return n.sheet || n.model || n.cfolder ? td.row(n.id) : n.pool ? td.row(n.id, false) : {}
	}
	/** How a row shows the drop that would happen on it now: into it (whole row) or a line before / after it. */
	function dropVis(n: Node): DropZone | null {
		if (!placesMode) return null
		const z = td.zoneOf(n.id)
		if (vkind === 'places') return z
		const d = td.dragId != null ? nodeById(td.dragId) : undefined; if (!d || td.overId == null) return null
		if (vkind === 'group') return groupTarget(nodeById(td.overId))?.id === n.id ? 'into' : null
		if (d.cfolder) return z && n.cfolder && n.cfolder !== d.cfolder ? z : null
		const over = nodeById(td.overId)
		const home = over && (over.cfolder || over.pool ? over : parentNode(over))
		if (home?.id === n.id && (n.pool || (n.cfolder && !n.smart)) && (over === n || n.pool)) return 'into'
		if (!z || !(n.sheet || n.model) || !plainFolderOf(n)) return null
		return z === 'into' ? 'after' : z
	}
	// the drop target highlights as a whole row (a floor goes INTO a building, not between rows; a place INTO a place)
	const dropInto = (n: Node) => placesMode ? dropVis(n) === 'into' : dr.dragId != null && (dr.isBefore(n.id) || dr.isAfter(n.id)) && nodeById(dr.dragId)?.folder === 'floor'
	const dropBefore = (n: Node) => placesMode ? dropVis(n) === 'before' : !dropInto(n) && dr.isBefore(n.id)
	const dropAfter = (n: Node) => placesMode ? dropVis(n) === 'after' : !dropInto(n) && dr.isAfter(n.id)
	// Which floor model a row opens: places carry it (`modelFloor`, null = none); the old trees open a 'floor' folder.
	const modelFloorOf = (n: Node): string | null => (n.modelFloor !== undefined ? n.modelFloor : n.folder === 'floor' ? floorOf(n) : null)
	const openModel = (n: Node, preview: boolean) => { if (!n.model) return; if (onopenmodel) onopenmodel(n.model, preview); else views?.openModel(n.model, preview) }
	/** tree-views-plan §3.5: the hover text says what a row opens. */
	const sheetTip = (n: Node) => n.link ? 'Link — opens another tool in a new tab' : `Sheet${n.number ? ` ${n.number}` : ''} — opens the paper layout`
	const MODEL_TIP = 'Model — opens in model space'

	// ── places: add / rename (inline) / delete (two-step) / seed (two-step) ──
	let renamingId = $state<string | null>(null), renameText = $state('')
	let delErr = $state<{ id: string; msg: string } | null>(null)
	let confirmSeed = $state(false)
	function expand(id: string) { const s2 = new Set(expanded); s2.add(id); expanded = s2; const c = new Set(collapsed); c.delete(id); collapsed = c }
	function addPlace(parentId: string | null) {
		const id = onplaceadd?.(parentId); if (!id) return
		if (parentId) expand(parentId)
		renamingId = id; renameText = 'New place'
	}
	function startRename(n: Node) { renamingId = n.id; renameText = n.label }
	function commitRename() { const id = renamingId; renamingId = null; if (id && renameText.trim()) onplacerename?.(id, renameText.trim()) }
	function addSheet(placeId: string) {
		const id = onsheetadd?.(placeId); if (!id) return
		expand(placeId)
		renamingId = id; renameText = 'New sheet'
	}
	// the inline rename box serves places, sheet leaves and custom folders; commit routes by row kind
	function commitAnyRename() {
		const id = renamingId; if (!id) return
		const n = nodeById(id)
		if (n?.sheet) { renamingId = null; if (renameText.trim()) onsheetrename?.(refOf(n), renameText.trim()) }
		else if (n?.cfolder) { renamingId = null; if (renameText.trim()) views?.folderRename(n.cfolder, renameText.trim()) }
		else commitRename()
	}
	// ── custom views: folders ──
	/** A new folder (smart = a saved filter) under a folder row (null = top level); opens it for naming / its filter. */
	async function addFolder(parent: Node | null, smart: boolean, at?: HTMLElement) {
		const rowId = views?.folderAdd(parent?.cfolder ?? null, smart); if (!rowId) return
		if (parent) expand(parent.id)
		if (smart) { await tick(); openFilter(rowId.slice(3), at ?? null) }
		else { renamingId = rowId; renameText = 'New folder' }
	}
	// ── the row ACTIONS menu (⋮, shown on hover / when the row is selected): a place's or a sheet's actions.
	// Items with `confirm` need a second click (the label changes); the menu is position:fixed so the tree's
	// scroll box can't clip it. ──
	type MenuItem = { key: string; label: string; icon: string; danger?: boolean; confirm?: string; run: () => void }
	let menu = $state<{ id: string; x: number; y: number } | null>(null)
	let menuConfirm = $state<string | null>(null)
	let menuAnchor: HTMLElement | null = null
	/** Delete every selected row: sheets first (the message offers Undo), then places deepest first (a place empties
	 *  as its selected contents go); a place that still holds things stays and says why. */
	function deleteSelected(block: string[]) {
		const rows = block.map((id) => nodeById(id)).filter((x): x is Node => !!x)
		for (const ref of sheetRefsOf(block)) onsheetdelete?.(ref)
		const errs: string[] = []
		for (const r of rows.filter((x) => x.place).sort((a, b) => ancestors(b.id).length - ancestors(a.id).length)) { const err = onplacedelete?.(r.id); if (err) errs.push(`${r.label}: ${err}`) }
		selRows = []
		delErr = errs.length ? { id: rows.find((x) => x.place)!.id, msg: errs.join(' · ') } : null
	}
	/** Custom views: "Remove from <folder>" / "Add to <folder>" for an item row. */
	function folderItems(n: Node): MenuItem[] {
		if (vkind !== 'custom' || !views) return []
		const out: MenuItem[] = [], ref = refOf(n), from = plainFolderOf(n)
		const fs = (views.current.folders ?? []).filter((f) => !f.filter)
		if (from) out.push({ key: 'unfile', label: `Remove from “${fs.find((f) => f.id === from)?.name ?? 'folder'}”`, icon: 'close', run: () => views?.fileRefs({ refs: [{ ref, from }], to: null, copy: false }) })
		for (const f of fs.filter((f) => !f.items.includes(ref)).slice(0, 8))
			out.push({ key: `to-${f.id}`, label: `Add to “${f.name}”`, icon: 'folderPlus', run: () => views?.fileRefs({ refs: [{ ref, from: null }], to: f.id, copy: true }) })
		return out
	}
	function menuItems(n: Node): MenuItem[] {
		const out: MenuItem[] = []
		if (inMulti(n.id)) {   // a row of a multi-selection: the actions on them all
			const block = blockOf(n.id), refs = sheetRefsOf(block), nDel = refs.length + block.filter((id) => nodeById(id)?.place).length
			if (views && refs.length) out.push({ key: 'tags', label: `Tags… (${refs.length} sheet${refs.length === 1 ? '' : 's'})`, icon: 'tag', run: () => openTags(refs) })
			if ((onsheetdelete || onplacedelete) && nDel) out.push({ key: 'delsel', label: `Delete ${nDel} selected`, icon: 'trash', danger: true, confirm: `Click again to delete ${nDel}`, run: () => deleteSelected(block) })
			out.push({ key: 'clearsel', label: 'Clear the selection', icon: 'close', run: () => { selRows = [] } })
			return out
		}
		if (n.cfolder) {   // a custom view's folder
			out.push({ key: 'folder', label: 'New folder inside', icon: 'folderPlus', run: () => addFolder(n, false) })
			out.push({ key: 'smart', label: 'New smart folder inside', icon: 'funnel', run: () => addFolder(n, true) })
			out.push({ key: 'rename', label: 'Rename', icon: 'edit', run: () => startRename(n) })
			if (n.smart) out.push({ key: 'filter', label: 'Edit the filter…', icon: 'funnel', run: () => openFilter(n.cfolder!, null) })
			out.push({ key: 'delete', label: 'Delete folder', icon: 'trash', danger: true, confirm: 'Click again — its drawings stay', run: () => views?.folderDelete(n.cfolder!) })
			return out
		}
		if (n.model) {
			out.push({ key: 'open', label: 'Open the model', icon: 'box', run: () => openModel(n, false) })
			return [...out, ...folderItems(n)]
		}
		if (n.drawing && !n.sheet) {   // another tool's register drawing (`d:<id>`)
			if (onimportdrawing && n.id.startsWith('d:')) out.push({ key: 'import', label: 'Import into Pages', icon: 'download', run: () => onimportdrawing?.(n.id) })
			if (onimportriser && n.id.startsWith('riser:')) out.push({ key: 'riser', label: 'Import into the building model', icon: 'download',
				confirm: 'Click again to import storeys, rooms, ladders + cables', run: () => onimportriser?.(n.id.slice('riser:'.length)) })
			return out
		}
		if (n.sheet) {
			const ref = refOf(n)
			if (onsheetrename) out.push({ key: 'rename', label: 'Rename', icon: 'edit', run: () => startRename(n) })
			if (views) out.push({ key: 'tags', label: 'Tags…', icon: 'tag', run: () => openTags([ref]) })
			if (onsheetduplicate) out.push({ key: 'dup', label: 'Duplicate', icon: 'copy', run: () => onsheetduplicate?.(ref) })
			if (onsheetcopy) out.push({ key: 'copy', label: 'Copy page (to paste in another project)', icon: 'copy', run: () => onsheetcopy?.(ref) })
			out.push(...folderItems(n))
			if (onsheetdelete) out.push({ key: 'delete', label: 'Delete', icon: 'trash', danger: true, confirm: 'Click again to delete (Undo on the message)', run: () => onsheetdelete?.(ref) })
			return out
		}
		if (!n.place) return out   // a group folder / the pool / a sub-heading
		if (onplaceimport && n.outletsDoc) out.push({ key: 'import', label: 'Import from Outlets tool', icon: 'download', confirm: 'Click again to import outlets + trunks', run: () => onplaceimport?.(n.id) })
		if (onplaceracks && n.racksRow) out.push({ key: 'racks', label: 'Import racks from the Racks tool', icon: 'download', confirm: 'Click again to rebuild its racks + devices', run: () => onplaceracks?.(n.id) })
		if (onsheetadd) out.push({ key: 'sheet', label: 'New sheet here', icon: 'fileText', run: () => addSheet(n.id) })
		if (onsheetpaste) out.push({ key: 'paste', label: 'Paste page here', icon: 'copy', run: () => onsheetpaste?.(n.id) })
		if (onlinksheet) for (const [tool, name] of Object.entries(LINK_TOOLS) as [SheetLink['tool'], string][])
			out.push({ key: `link-${tool}`, label: `New link to ${name}`, icon: 'link', run: () => onlinksheet?.(n.id, tool) })
		if (onplaceadd) out.push({ key: 'place', label: 'New place inside', icon: 'plus', run: () => addPlace(n.id) })
		if (onplacerename) out.push({ key: 'rename', label: 'Rename', icon: 'edit', run: () => startRename(n) })
		if (onplacedelete) out.push({ key: 'delete', label: 'Delete', icon: 'trash', danger: true, confirm: 'Click again to delete', run: () => {
			const err = onplacedelete?.(n.id) ?? null
			delErr = err ? { id: n.id, msg: err } : null
		} })
		return out
	}
	function openMenu(n: Node, btn: HTMLElement) {
		if (menu?.id === n.id) { menu = null; return }
		menuAnchor = btn
		const r = btn.getBoundingClientRect(), h = menuItems(n).length * 27 + 8, w = 220
		menu = { id: n.id, x: Math.max(4, r.right - w), y: r.bottom + h + 4 > innerHeight ? Math.max(4, r.top - h - 2) : r.bottom + 2 }
		menuConfirm = null; delErr = null
	}
	function pick(it: MenuItem) {
		if (it.confirm && menuConfirm !== it.key) { menuConfirm = it.key; return }
		menu = null; menuConfirm = null; it.run()
	}
	/** A popover's spot: under `el` (the ⋮ button / a header button), kept on screen. */
	function popAt(el: HTMLElement | null, w = 300, h = 360): { x: number; y: number } {
		const r = el?.getBoundingClientRect() ?? { left: 40, bottom: 120, right: 40 }
		return { x: Math.max(4, Math.min(r.left, innerWidth - w - 6)), y: Math.max(4, Math.min(r.bottom + 2, innerHeight - h - 6)) }
	}

	// ── tags (tree-views-plan §3.3): one sheet's or a multi-selection's, from the ⋮ menu ──
	let tagEdit = $state<{ refs: string[]; x: number; y: number } | null>(null)
	function openTags(refs: string[]) { tagEdit = { refs, ...popAt(menuAnchor, 300, 260) } }
	/** The bulk picker shows the UNION; a removed chip goes from every sheet, an added one (or `all`) goes onto all. */
	function applyTags(prev: string[], next: string[], all: string[] = []) {
		if (!tagEdit || !views) return
		const added = mergeTags(next.filter((t) => !hasTag(prev, t)), all), removed = prev.filter((t) => !hasTag(next, t))
		const patches = tagEdit.refs.map((ref) => { const cur = views!.tagsOf(ref); return { ref, cur, tags: mergeTags(withoutTags(cur, removed), added) } })
			.filter((p) => p.tags.length !== p.cur.length || p.tags.some((t, i) => t !== p.cur[i])).map(({ ref, tags }) => ({ ref, tags }))
		if (patches.length) views.setTags(patches)
	}
	// ── a smart folder's filter ──
	let filterEdit = $state<{ id: string; x: number; y: number } | null>(null)
	function openFilter(folderId: string, at: HTMLElement | null) { filterEdit = { id: folderId, ...popAt(at ?? menuAnchor ?? viewBtn ?? null, 300, 460) } }
	/** A smart folder still called "New smart folder" is named after its filter when saved. */
	function filterName(f: TreeFilter): string {
		const parts = [...(f.kinds ?? []).map((k) => KIND_LABELS[k] ?? k), ...(f.tags ?? []), ...(f.disciplines ?? []), ...(f.categories ?? [])]
		return parts.length ? parts.slice(0, 3).join(' · ') + (parts.length > 3 ? ' …' : '') : ''
	}
	function saveFilter(id: string, f: TreeFilter) {
		views?.setFolderFilter(id, f)
		const row = nodeById(`cf:${id}`), name = filterName(f)
		if (row?.label === 'New smart folder' && name) views?.folderRename(id, name)
		filterEdit = null
	}

	// ── the VIEW switcher (tree-views-plan §3.1) ──
	let viewMenu = $state<{ x: number; y: number } | null>(null)
	let viewBtn = $state<HTMLElement | null>(null)
	let vRenaming = $state<string | null>(null), vRenameText = $state(''), vNewName = $state<string | null>(null), vDelArm = $state<string | null>(null)
	const viewIcon = (v: TreeView) => (v.kind === 'places' ? 'home' : v.kind === 'custom' ? 'folder' : 'list')
	function openViewMenu() {
		if (viewMenu) { viewMenu = null; return }
		const r = viewBtn!.getBoundingClientRect()
		viewMenu = { x: r.left, y: r.bottom + 2 }; vRenaming = null; vNewName = null; vDelArm = null
	}
	function pickView(id: string) { viewMenu = null; views?.select(id) }
	function commitNewView() { const n = vNewName?.trim(); vNewName = null; viewMenu = null; if (n) views?.create(n) }
	function commitViewRename() { const id = vRenaming; vRenaming = null; if (id && vRenameText.trim()) views?.rename(id, vRenameText.trim()) }

	let naming = $state(false), newName = $state(''), nameErr = $state('')
	function focusSel(node: HTMLInputElement) { tick().then(() => { node.focus(); node.select() }) }
	async function commitBuilding() {
		const n = newName.trim(); if (!n) { naming = false; return }
		if (await onaddbuilding?.(n)) { naming = false; newName = ''; nameErr = '' } else nameErr = 'That name is empty or already used'
	}

	// Location hierarchy Project › Building › Floor › Zone › Room › Row, with drawing/view
	// leaves hung at the level they belong to. Folders expand; drawing leaves open a tab.
	// Buildings are the top level; the Project sits ABOVE the tree as a label (click → project props).
	const folderIcon: Record<string, string> = {
		project: 'folderOpen', building: 'home', floor: 'layers', zone: 'crop', room: 'server', row: 'rows', group: 'folder',
		place: 'mapPin', tag: 'tag', smart: 'funnel',
	}
	const drawingIcon: Record<Kind, string> = { plan: 'mapPin', sheet: 'fileText', elevation: 'box' }

	let expanded = $state(new Set<string>(['b-building1', 'f33', 'z3303']))
	// open the ancestors a caller asks for (buildings are open by default — un-collapse them too)
	$effect(() => {
		const ids = reveal; if (!ids.length) return
		untrack(() => {
			expanded = new Set([...expanded, ...ids.filter((i) => !i.startsWith('b:'))])
			const c = new Set(collapsed); for (const i of ids) c.delete(i); collapsed = c
		})
	})
	// Real tree: BUILDINGS start open (tracked as `collapsed` instead), so a building that appears later —
	// e.g. once the risers load and floors regroup — is open too. Everything else starts closed. In a tree view the
	// top-level folders start open (not the custom view's "Not in a folder" pool).
	let collapsed = $state(new Set<string>())
	const topIds = $derived(new Set(TREE_NODES.map((n) => n.id)))
	const openByDefault = (n: Node) => !!tree && (placesMode ? topIds.has(n.id) && (!!n.place || !!n.vgroup || !!n.cfolder) : n.folder === 'building')
	const openOf = (n: Node) => (openByDefault(n) ? !collapsed.has(n.id) : expanded.has(n.id))
	let search = $state('')
	function toggle(id: string) {
		const n = nodeById(id)
		if (n && openByDefault(n)) { const c = new Set(collapsed); c.has(id) ? c.delete(id) : c.add(id); collapsed = c; return }
		const s = new Set(expanded); s.has(id) ? s.delete(id) : s.add(id); expanded = s
	}
	const hit = (s: string) => !search || s.toLowerCase().includes(search.toLowerCase())
	// a node is shown if it (or any descendant) matches the search (a drawing number counts)
	function visible(n: Node): boolean { return !n.subhead && (hit(n.label) || (!!n.number && hit(n.number)) || (n.children?.some(visible) ?? false)) }
	/** A view folder (group / custom / pool) — a click opens / closes it; no Properties, no model. */
	const isViewFolder = (n: Node) => !!(n.vgroup || n.cfolder || n.pool)
</script>

<div class="dn">
	<div class="dn-head">
		{#if head}{@render head()}{:else}<span class="dn-title">DRAWINGS</span>{/if}
		<div class="dn-acts">
			<button title="Collapse" aria-label="Collapse panel" onclick={() => oncollapse?.()}><Icon name="chevronLeft" size={14} /></button>
		</div>
	</div>
	<div class="dn-search">
		<Icon name="search" size={12} />
		<input placeholder="Search drawings…" bind:value={search} />
	</div>
	<div class="dn-project-row">
		<button class="dn-project" class:active={activeNode === PROJ.id} onclick={() => onselectnode?.(PROJ)}
			title="Project properties">
			<Icon name="folderOpen" size={13} />
			<span class="dn-name" title={PROJ.label}>{PROJ.label}</span>
		</button>
		<!-- + beside the project: a new top-level place (places mode) / a new building (the old tree) -->
		{#if placesMode && onplaceadd && vkind === 'places'}
			<button class="dn-proj-add" title="New top-level place" aria-label="New place" onclick={() => addPlace(null)}><Icon name="plus" size={13} /></button>
		{:else if onaddbuilding && tree && !placesMode}
			<button class="dn-proj-add" title="New building" aria-label="New building" onclick={() => { naming = true; newName = ''; nameErr = '' }}><Icon name="plus" size={13} /></button>
		{/if}
	</div>
	<!-- the VIEW switcher: how the tree lists the models + sheets (per user; custom views are the team's) -->
	{#if placesMode && views}
		<div class="dn-viewbar">
			<button class="dn-view" bind:this={viewBtn} class:open={!!viewMenu} onclick={openViewMenu}
				title="How the tree lists the models and sheets{views.current.hint ? ` — ${views.current.hint}` : ''}">
				<Icon name={viewIcon(views.current)} size={12} /><span class="dn-view-name">{views.current.name}</span><Icon name="chevronDown" size={11} />
			</button>
			{#if vkind === 'custom'}
				<button class="dn-view-btn" title="New folder" aria-label="New folder" onclick={() => addFolder(null, false)}><Icon name="folderPlus" size={13} /></button>
				<button class="dn-view-btn" title="New smart folder (fills itself from a filter)" aria-label="New smart folder" onclick={(e) => addFolder(null, true, e.currentTarget)}><Icon name="funnel" size={13} /></button>
			{/if}
		</div>
	{/if}
	{#if status}<div class="dn-status">{status}</div>{/if}
	{#if onseedplaces && !placesMode}
		<div class="dn-seed">
			{#if confirmSeed}
				<span>Create this project's Pages places from its floors, zones, rooms and rows? This writes to the project once.</span>
				<div class="dn-seed-btns"><button class="primary" onclick={() => { confirmSeed = false; onseedplaces?.() }}>Create</button><button onclick={() => (confirmSeed = false)}>Cancel</button></div>
			{:else}
				<span>Pages places aren't set up for this project yet — the tree below comes from the other tools' data.</span>
				<div class="dn-seed-btns"><button class="primary" onclick={() => (confirmSeed = true)}>Set up places…</button></div>
			{/if}
		</div>
	{/if}
	{#if naming}
		<div class="dn-newb">
			<Icon name="home" size={13} />
			<input placeholder="Building name…" bind:value={newName} use:focusSel
				onkeydown={(e) => { if (e.key === 'Enter') { e.preventDefault(); commitBuilding() } else if (e.key === 'Escape') { naming = false } }}
				onblur={() => { if (!newName.trim()) naming = false }} />
		</div>
		{#if nameErr}<div class="dn-status err">{nameErr}</div>{/if}
	{/if}
	<div class="dn-tree">
		{#if vkind === 'group' && !TREE_NODES.length}
			<div class="dn-hint">Nothing in this view yet — give sheets a drawing type, tags or a category (Properties › DRAWING, ⋮ › Tags…, or File › Drawings…).</div>
		{:else if vkind === 'custom' && !views?.current.folders?.length}
			<div class="dn-hint">No folders yet — the folder button above adds one (the funnel a smart one that fills itself from a filter), then drag models and sheets in from “Not in a folder”. Ctrl-drag copies (an item can be in several folders).</div>
		{/if}
		{#each TREE_NODES as n (n.id)}{@render row(n, 0, undefined)}{/each}
	</div>
	{#if menu}
		{@const mn = nodeById(menu.id)}
		<!-- the backdrop is a real (unfocusable) close button behind the menu -->
		<button class="dn-menu-back" aria-label="Close menu" tabindex="-1" onclick={() => (menu = null)}></button>
		<div class="dn-menu" role="menu" tabindex="-1" style:left="{menu.x}px" style:top="{menu.y}px"
			onkeydown={(e) => { if (e.key === 'Escape') menu = null }}>
			{#each mn ? menuItems(mn) : [] as it (it.key)}
				<button role="menuitem" class:danger={it.danger} class:confirm={menuConfirm === it.key} onclick={() => pick(it)}>
					<Icon name={it.icon} size={13} /><span>{menuConfirm === it.key ? it.confirm : it.label}</span>
				</button>
			{/each}
		</div>
	{/if}
	{#if viewMenu && views}
		{@const custom = views.list.filter((v) => !v.builtin)}
		<button class="dn-menu-back" aria-label="Close menu" tabindex="-1" onclick={() => (viewMenu = null)}></button>
		<div class="dn-menu dn-vmenu" role="menu" tabindex="-1" style:left="{viewMenu.x}px" style:top="{viewMenu.y}px"
			onkeydown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); viewMenu = null } }}>
			<div class="dn-menu-sec">Views</div>
			{#each views.list.filter((v) => v.builtin) as v (v.id)}
				<button role="menuitemradio" aria-checked={v.id === views.current.id} class:cur={v.id === views.current.id} title={v.hint} onclick={() => pickView(v.id)}>
					<Icon name={viewIcon(v)} size={13} /><span>{v.name}</span>{#if v.id === views.current.id}<Icon name="check" size={12} />{/if}
				</button>
			{/each}
			{#if custom.length}<div class="dn-menu-sec">Team views <em>shared with the project</em></div>{/if}
			{#each custom as v (v.id)}
				{#if vRenaming === v.id}
					<input class="dn-vinput" bind:value={vRenameText} use:focusSel
						onkeydown={(e) => { e.stopPropagation(); if (e.key === 'Enter') commitViewRename(); else if (e.key === 'Escape') vRenaming = null }} onblur={commitViewRename} />
				{:else}
					<div class="dn-vitem">
						<button role="menuitemradio" aria-checked={v.id === views.current.id} class="grow" class:cur={v.id === views.current.id} onclick={() => pickView(v.id)}>
							<Icon name="folder" size={13} /><span>{v.name}</span>{#if v.id === views.current.id}<Icon name="check" size={12} />{/if}
						</button>
						<button class="mini" title="Rename the view" aria-label="Rename" onclick={() => { vRenaming = v.id; vRenameText = v.name; vDelArm = null }}><Icon name="edit" size={12} /></button>
						<button class="mini" class:armed={vDelArm === v.id} title={vDelArm === v.id ? 'Click again to delete it for the whole team (its drawings stay)' : 'Delete the view'} aria-label="Delete"
							onclick={() => { if (vDelArm !== v.id) { vDelArm = v.id; return } vDelArm = null; views?.remove(v.id) }}><Icon name="trash" size={12} /></button>
					</div>
				{/if}
			{/each}
			<div class="dn-menu-sep"></div>
			{#if vNewName !== null}
				<input class="dn-vinput" placeholder="New view's name…" bind:value={vNewName} use:focusSel
					onkeydown={(e) => { e.stopPropagation(); if (e.key === 'Enter') commitNewView(); else if (e.key === 'Escape') vNewName = null }} />
			{:else}
				<button role="menuitem" title="Your own folders — shared with everyone on the project" onclick={() => (vNewName = '')}><Icon name="plus" size={13} /><span>New view…</span></button>
			{/if}
		</div>
	{/if}
	{#if tagEdit && views}
		{@const cur = tagEdit.refs.map((r) => views.tagsOf(r))}
		{@const union = mergeTags([], cur.flat())}
		{@const counts = Object.fromEntries(union.map((t) => [t.toLowerCase(), cur.filter((ts) => hasTag(ts, t)).length]))}
		<button class="dn-menu-back" aria-label="Close" tabindex="-1" onclick={() => (tagEdit = null)}></button>
		<div class="dn-pop" role="dialog" aria-label="Tags" tabindex="-1" style:left="{tagEdit.x}px" style:top="{tagEdit.y}px"
			onkeydown={(e) => { if (e.key === 'Escape') { e.stopPropagation(); tagEdit = null } }}>
			<div class="dn-pop-head"><Icon name="tag" size={12} /> Tags — {tagEdit.refs.length === 1 ? 'this sheet' : `${tagEdit.refs.length} sheets`}</div>
			<TagPicker tags={union} pools={views.tagPools} {counts} total={tagEdit.refs.length} autofocus
				onchange={(next) => applyTags(union, next)} onall={(t) => applyTags(union, union, [t])} />
			<div class="dn-pop-note">Free text · suggestions come from the tags used in every project. {tagEdit.refs.length > 1 ? 'A dashed tag is on some of them (+ gives it to all).' : ''}</div>
			<div class="dn-pop-btns"><button onclick={() => (tagEdit = null)}>Done</button></div>
		</div>
	{/if}
	{#if filterEdit && views}
		{@const fid = filterEdit.id}
		<button class="dn-menu-back" aria-label="Close" tabindex="-1" onclick={() => (filterEdit = null)}></button>
		<div class="dn-popwrap" style:left="{filterEdit.x}px" style:top="{filterEdit.y}px">
			{#key fid}
				<SmartFilterEditor filter={views.folderFilter(fid)} tagPools={views.tagPools} options={views.filterOptions}
					onsave={(f) => saveFilter(fid, f)} oncancel={() => (filterEdit = null)} />
			{/key}
		</div>
	{/if}
</div>

<!-- a row's ⋮ actions button (visible on hover, when the row is selected, or while its menu is open) -->
{#snippet more(n: Node)}
	{#if menuItems(n).length}
		<button class="dn-more" class:open={menu?.id === n.id} title="Actions" aria-label="Actions" aria-haspopup="menu"
			onclick={(e) => { e.stopPropagation(); openMenu(n, e.currentTarget) }} ondblclick={(e) => e.stopPropagation()}><Icon name="ellipsisVertical" size={13} /></button>
	{/if}
{/snippet}

{#snippet renameBox()}
	<input class="dn-rename" bind:value={renameText} use:focusSel onclick={(e) => e.stopPropagation()} ondblclick={(e) => e.stopPropagation()}
		onkeydown={(e) => { e.stopPropagation(); if (e.key === 'Enter') { e.preventDefault(); commitAnyRename() } else if (e.key === 'Escape') renamingId = null }}
		onblur={commitAnyRename} />
{/snippet}

<!-- `floor` = the nearest floor ancestor's label: a drawing under it views that floor's model -->
{#snippet row(n: Node, depth: number, floor: string | undefined)}
	{#if n.subhead}
		<!-- a thin "Models" / "Sheets" sub-heading inside a grouped folder (not an item) -->
		{#if !search}<div class="dn-subhead" style:padding-left="{depth * 12 + 27}px">{n.label}</div>{/if}
	{:else if !search || visible(n)}
		{@const isOpen = openOf(n) || (!!search && (n.children?.length ?? 0) > 0)}
		{#if n.model}
			<!-- a MODEL (tree views): opens in model space — a cube, the model colour and a MODEL pill (tree-views-plan §3.5) -->
			<div class="dn-row leaf model" class:active={activeDoc === n.docId} class:multi={inMulti(n.id)} style:padding-left="{depth * 12 + 8}px" role="button" tabindex="0"
				{...dragProps(n)} class:drag-before={dropBefore(n)} class:drag-after={dropAfter(n) || dropInto(n)}
				title={inMulti(n.id) ? `${selRows.length} selected — drag them together · ⋮ for their actions` : MODEL_TIP}
				onclick={(e) => { if (!rowSelClick(e, n)) openModel(n, true) }}
				ondblclick={() => openModel(n, false)}
				onkeydown={(e) => { if (e.key === 'Enter') openModel(n, false) }}>
				<span class="dn-chev spacer"></span>
				<Icon name={n.modelKind === 'building' ? 'home' : 'box'} size={13} />
				<span class="dn-name">{n.label}</span>
				<span class="dn-pill" aria-hidden="true">MODEL</span>
				{@render more(n)}
			</div>
		{:else if n.drawing && n.sheet && placesMode}
			<!-- a stored Pages SHEET: opens a tab like any drawing; draggable between places, renamable, archivable -->
			<div class="dn-row leaf sheet" class:active={activeDoc === (n.docId ?? n.id)} class:multi={inMulti(n.id)} style:padding-left="{depth * 12 + 8}px" role="button" tabindex="0"
				{...dragProps(n)} class:drag-before={dropBefore(n)} class:drag-after={dropAfter(n) || dropInto(n)}
				title={inMulti(n.id) ? `${selRows.length} selected — drag to move them together · ⋮ for their actions` : sheetTip(n)}
				onclick={(e) => { if (!rowSelClick(e, n)) onopen?.({ title: n.label, kind: n.drawing!, preview: true, floor, docId: n.docId ?? n.id }) }}
				ondblclick={() => onopen?.({ title: n.label, kind: n.drawing!, preview: false, floor, docId: n.docId ?? n.id })}
				onkeydown={(e) => { if (e.key === 'Enter') onopen?.({ title: n.label, kind: n.drawing!, preview: false, floor, docId: n.docId ?? n.id }) }}>
				<span class="dn-chev spacer"></span>
				<Icon name={n.link ? 'link' : drawingIcon[n.drawing]} size={13} />
				{#if renamingId === n.id}
					{@render renameBox()}
				{:else}
					{#if n.number}<span class="dn-num">{n.number}</span>{/if}
					<span class="dn-name">{n.label}</span>
					{@render more(n)}
				{/if}
			</div>
		{:else if n.drawing}
			<!-- drawing leaf: opens a tab -->
			<!-- single-click = preview tab (italic, reused); double-click promotes it to a kept tab -->
			<!-- (a div, not a button, so it can hold the ⋮ actions button — e.g. "Import into Pages" for another tool's view) -->
			<div class="dn-row leaf" class:active={activeDoc === (n.docId ?? n.id)} style:padding-left="{depth * 12 + 8}px" role="button" tabindex="0"
				onclick={() => onopen?.({ title: n.label, kind: n.drawing!, preview: true, floor, docId: n.docId ?? n.id })}
				ondblclick={() => onopen?.({ title: n.label, kind: n.drawing!, preview: false, floor, docId: n.docId ?? n.id })}
				onkeydown={(e) => { if (e.key === 'Enter') onopen?.({ title: n.label, kind: n.drawing!, preview: false, floor, docId: n.docId ?? n.id }) }}>
				<span class="dn-chev spacer"></span>
				<Icon name={drawingIcon[n.drawing]} size={13} />
				<span class="dn-name" title={n.label}>{n.label}</span>
				{#if placesMode}{@render more(n)}{/if}
			</div>
		{:else}
			<!-- location folder: chevron toggles expand; the row selects it (props in right panel). A FLOOR row
			     also opens the floor's model tab — single click previews, double click keeps (like a drawing).
			     A tree view's folder (group / custom / the pool) just opens and closes. -->
			{@const hasModel = placesMode && !!n.place && !!(n.modelFloor || n.hasModel)}
			<div class="dn-row folder" class:view-folder={isViewFolder(n)} class:active={activeNode === n.id} class:multi={inMulti(n.id)} style:padding-left="{depth * 12 + 8}px"
				{...dragProps(n)} class:drop-into={dropInto(n)} class:drag-before={dropBefore(n)} class:drag-after={dropAfter(n)}
				title={inMulti(n.id) ? `${selRows.length} selected — drag to move them together · ⋮ to delete them` : n.smart ? 'Smart folder — fills itself from its filter (⋮ › Edit the filter…)' : n.pool ? 'Everything no folder holds — drag from here into a folder' : undefined}
				onclick={(e) => {
					if (isViewFolder(n)) { toggle(n.id); return }
					if (isSelRow(n) && rowSelClick(e, n)) return; onselectnode?.({ id: n.id, label: n.label, kind: n.place ? 'place' : n.folder ?? 'folder', floorNumber: n.floorNumber, building: n.building })
					if (n.place && onopenplace) { if (n.modelFloor || n.hasModel) onopenplace(n.id, true) } else { const mf = modelFloorOf(n); if (mf) onopenfloor?.(mf, true) } }}
				ondblclick={() => { if (isViewFolder(n)) return; if (n.place && onopenplace) onopenplace(n.id, false); else { const mf = modelFloorOf(n); if (mf) onopenfloor?.(mf, false) } }}
				role="button" tabindex="0" onkeydown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); if (isViewFolder(n)) toggle(n.id); else onselectnode?.({ id: n.id, label: n.label, kind: n.folder ?? 'folder' }) } }}>
				{#if n.children?.length}
					<button class="dn-chev" title="Expand/collapse" aria-label="Expand/collapse"
						onclick={(e) => { e.stopPropagation(); toggle(n.id) }}><Icon name={isOpen ? 'chevronDown' : 'chevronRight'} size={12} /></button>
				{:else}
					<span class="dn-chev spacer"></span>
				{/if}
				<Icon name={n.pool ? 'list' : folderIcon[n.folder ?? ''] ?? 'folder'} size={13} />
				{#if renamingId === n.id}
					{@render renameBox()}
				{:else}
					<span class="dn-name" title={n.meta ? `${n.label} · ${n.meta}` : n.label}>{n.label}</span>
					{#if n.meta}<span class="dn-meta">{n.meta}</span>{/if}
					{#if hasModel}
						<!-- this place has a model: the row opens it (model space) — say so, like a model row -->
						<button class="dn-pill btn" title="{MODEL_TIP} (a click on the row previews it)" onclick={(e) => { e.stopPropagation(); onopenplace?.(n.id, false) }} ondblclick={(e) => e.stopPropagation()}>MODEL</button>
					{/if}
					{#if placesMode && (n.place || n.cfolder)}{@render more(n)}{/if}
				{/if}
			</div>
			{#if delErr?.id === n.id}<div class="dn-status err" style:padding-left="{depth * 12 + 28}px">{delErr.msg}</div>{/if}
			{#if isOpen && n.children}
				{#each n.children as c (c.id)}{@render row(c, depth + 1, n.floor ?? (n.folder === 'floor' ? floorOf(n) : floor))}{/each}
			{/if}
		{/if}
	{/if}
{/snippet}

<style>
	.dn { flex:1; display:flex; flex-direction:column; min-height:0; }
	.dn-status { font-size:10px; color:var(--faint); padding:2px 12px 4px; }
	.dn-status.err { color:#f87171; }
	.dn-hint { font-size:11px; color:var(--faint); padding:6px 8px 8px; line-height:1.45; }
	.dn-hint :global(svg) { vertical-align:-1px; color:var(--muted); }
	.dn-newb { display:flex; align-items:center; gap:6px; margin:2px 6px 4px; padding:3px 6px; border:1px solid var(--accent); border-radius:5px; color:var(--muted); }
	.dn-newb input { flex:1; min-width:0; background:none; border:none; color:var(--text); font-size:12px; }
	.dn-newb input:focus { outline:none; }
	/* drag a floor INTO a building (whole-row highlight) / a building before / after another (a line) */
	.dn-row.drop-into { background:var(--active); outline:1px dashed var(--accent); outline-offset:-1px; }
	.dn-row.multi { background:color-mix(in srgb, var(--accent) 14%, transparent); }
	.dn-row.drag-before { box-shadow:inset 0 2px 0 var(--accent); }
	.dn-row.drag-after { box-shadow:inset 0 -2px 0 var(--accent); }
	.dn-seed { margin:2px 6px 6px; padding:6px 8px; border:1px dashed var(--accent); border-radius:6px; font-size:11px; color:var(--muted); display:flex; flex-direction:column; gap:6px; }
	.dn-seed-btns { display:flex; gap:6px; }
	.dn-seed button { font-size:11px; padding:3px 9px; border-radius:4px; border:1px solid var(--line); background:var(--panel2); color:var(--text); cursor:pointer; }
	.dn-seed button.primary { background:var(--accent); border-color:var(--accent); color:#fff; }
	.dn-rename { flex:1; min-width:0; font-size:12px; font-weight:600; background:var(--input); color:var(--text); border:1px solid var(--accent); border-radius:3px; padding:0 4px; }
	.dn-rename:focus { outline:none; }
	/* per-row place actions: shown on hover (and while a delete waits for its confirm click) */
	/* the ⋮ actions button: hidden until the row is hovered / selected / its menu is open */
	.dn-more { visibility:hidden; margin-left:auto; flex:none; display:inline-grid; place-items:center; width:18px; height:18px; border-radius:3px; border:none; background:none; color:var(--muted); cursor:pointer; }
	.dn-row:hover .dn-more, .dn-row.active .dn-more, .dn-more.open { visibility:visible; }
	.dn-more:hover, .dn-more.open { background:var(--line); color:var(--text); }
	.dn-menu-back { position:fixed; inset:0; z-index:150; background:none; border:none; cursor:default; }
	.dn-menu { position:fixed; z-index:151; width:220px; padding:4px; display:flex; flex-direction:column; background:var(--panel); border:1px solid var(--line); border-radius:7px; box-shadow:0 10px 30px #0008; }
	.dn-menu button { display:flex; align-items:center; gap:8px; width:100%; padding:5px 8px; border-radius:4px; border:none; background:none; color:var(--text); font-size:12px; text-align:left; cursor:pointer; }
	.dn-menu button > span { flex:1; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
	.dn-menu button:hover { background:var(--hover); }
	.dn-menu button :global(svg) { color:var(--muted); flex:none; }
	.dn-menu button.danger { color:#f87171; }
	.dn-menu button.danger :global(svg) { color:#f87171; }
	.dn-menu button.confirm { color:#fff; background:#dc2626; }
	.dn-menu button.confirm :global(svg) { color:#fff; }
	.dn-menu button:not(.danger).confirm { background:var(--accent); }
	.dn-menu-sec { font-size:9.5px; text-transform:uppercase; letter-spacing:.08em; color:var(--faint); padding:5px 8px 2px; }
	.dn-menu-sec em { font-style:normal; text-transform:none; letter-spacing:0; margin-left:4px; }
	.dn-menu-sep { height:1px; background:var(--line-soft); margin:4px 2px; }
	.dn-vmenu { width:250px; }
	.dn-vmenu button.cur { background:var(--active); }
	.dn-vmenu button.cur :global(svg) { color:var(--accent); }
	.dn-vitem { display:flex; align-items:center; gap:1px; }
	.dn-vitem .grow { flex:1; min-width:0; }
	.dn-vitem .mini { width:24px; flex:none; justify-content:center; padding:5px 0; visibility:hidden; }
	.dn-vitem:hover .mini, .dn-vitem .mini.armed { visibility:visible; }
	.dn-vitem .mini.armed { background:#dc2626; }
	.dn-vitem .mini.armed :global(svg) { color:#fff; }
	.dn-vinput { margin:2px 4px; padding:4px 6px; font-size:12px; background:var(--input); color:var(--text); border:1px solid var(--accent); border-radius:4px; }
	.dn-vinput:focus { outline:none; }
	/* the tags / smart-filter popovers (fixed, above the tree) */
	.dn-pop, .dn-popwrap { position:fixed; z-index:151; }
	.dn-pop { width:300px; padding:8px 10px 10px; display:flex; flex-direction:column; gap:6px; background:var(--panel); border:1px solid var(--line); border-radius:8px; box-shadow:0 12px 34px #0009; }
	.dn-pop-head { display:flex; align-items:center; gap:6px; font-size:12px; font-weight:600; color:var(--text); }
	.dn-pop-head :global(svg) { color:var(--accent); }
	.dn-pop-note { font-size:10px; color:var(--faint); line-height:1.4; }
	.dn-pop-btns { display:flex; justify-content:flex-end; }
	.dn-pop-btns button { font-size:11px; padding:3px 12px; border-radius:4px; border:1px solid var(--accent); background:var(--accent); color:#fff; cursor:pointer; }
	.dn-meta { margin-left:auto; padding-left:6px; font-size:10px; color:var(--faint); white-space:nowrap; }
	.dn-head { display:flex; align-items:center; justify-content:space-between; height:30px; padding:0 6px; border-bottom:1px solid var(--line-soft); }
	.dn-title { font-size:11px; text-transform:uppercase; letter-spacing:.08em; color:var(--muted); font-weight:600; }
	.dn-acts { display:flex; gap:1px; }
	.dn-acts button { display:inline-flex; align-items:center; justify-content:center; width:24px; height:22px; border-radius:4px; color:var(--muted); background:none; border:none; }
	.dn-acts button:hover { background:var(--hover); color:var(--text); }
	.dn-search { display:flex; align-items:center; gap:5px; margin:6px; background:var(--input); border:1px solid var(--line); border-radius:5px; padding:0 7px; }
	.dn-search :global(svg) { color:var(--faint); flex:0 0 auto; }
	.dn-search input { flex:1; min-width:0; background:none; border:none; color:var(--text); font-size:12px; padding:5px 0; }
	.dn-search input:focus { outline:none; }
	/* the view switcher ("By place ▾") + a custom view's New folder / New smart folder */
	.dn-viewbar { display:flex; align-items:center; gap:2px; margin:0 6px 3px; }
	.dn-view { flex:1; min-width:0; display:flex; align-items:center; gap:5px; padding:3px 7px; border-radius:5px; border:1px solid transparent; background:none; color:var(--muted); font-size:11px; cursor:pointer; text-align:left; }
	.dn-view:hover, .dn-view.open { background:var(--hover); border-color:var(--line); color:var(--text); }
	.dn-view :global(svg) { flex:none; }
	.dn-view-name { overflow:hidden; text-overflow:ellipsis; white-space:nowrap; font-weight:600; }
	.dn-view-btn { flex:none; display:grid; place-items:center; width:24px; height:22px; border-radius:4px; border:none; background:none; color:var(--muted); cursor:pointer; }
	.dn-view-btn:hover { background:var(--hover); color:var(--accent); }

	/* the project row: its button + the "+" (new top-level place / building) beside it */
	.dn-project-row { display:flex; align-items:center; gap:2px; margin:0 6px 2px; }
	.dn-proj-add { flex:none; display:grid; place-items:center; width:26px; align-self:stretch; border-radius:5px; border:1px solid var(--line); background:var(--panel2); color:var(--muted); cursor:pointer; }
	.dn-proj-add:hover { background:var(--hover); color:var(--accent); }
	.dn-project { flex:1; min-width:0; display:flex; align-items:center; gap:6px; padding:6px 8px; border-radius:5px;
		color:var(--text); background:var(--panel2); border:1px solid var(--line); text-align:left; cursor:pointer; }
	.dn-project:hover { background:var(--hover); }
	.dn-project.active { background:var(--active); box-shadow:inset 2px 0 0 var(--accent); }
	.dn-project :global(svg) { color:var(--accent); flex:0 0 auto; }
	.dn-project .dn-name { font-weight:600; }
	.dn-tree { flex:1; overflow-y:auto; padding:2px 4px 6px; scrollbar-width:thin; scrollbar-color:var(--line) transparent; }
	.dn-row { display:flex; align-items:center; gap:5px; width:100%; padding-top:4px; padding-bottom:4px; padding-right:6px;
		border-radius:5px; color:var(--text); background:none; border:none; text-align:left; cursor:pointer; user-select:none; }
	.dn-row:hover { background:var(--hover); }
	.dn-row.active { background:var(--active); box-shadow:inset 2px 0 0 var(--accent); }
	.dn-row :global(svg) { color:var(--muted); flex:0 0 auto; }
	.dn-row.active :global(svg) { color:var(--accent); }
	.dn-row.folder .dn-name { font-weight:600; }
	.dn-row.view-folder .dn-name { font-weight:500; }
	.dn-name { flex:1; min-width:0; font-size:12px; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
	.dn-chev { display:inline-flex; align-items:center; justify-content:center; width:14px; height:14px; flex:0 0 auto; color:var(--muted); padding:0; background:none; border:none; border-radius:3px; }
	button.dn-chev:hover { background:var(--line); color:var(--text); }
	.dn-chev.spacer { width:14px; }
	/* tree-views-plan §3.5 — MODEL rows (model space) never look like SHEET rows (paper): a cube in the model colour,
	   regular weight and a MODEL pill; sheets stay neutral with their drawing number as a monospace prefix */
	.dn-row.model .dn-name { color:var(--model); font-weight:400; }
	.dn-row.model :global(svg), .dn-row.model.active :global(svg) { color:var(--model); }
	.dn-row.model.active { box-shadow:inset 2px 0 0 var(--model); }
	.dn-pill { flex:none; font-size:8.5px; font-weight:700; letter-spacing:.07em; line-height:13px; padding:0 4px; border-radius:3px;
		color:var(--model); border:1px solid color-mix(in srgb, var(--model) 55%, transparent); background:color-mix(in srgb, var(--model) 10%, transparent); }
	.dn-pill.btn { cursor:pointer; font-family:inherit; }
	.dn-pill.btn:hover { background:color-mix(in srgb, var(--model) 25%, transparent); }
	.dn-row.model .dn-more { margin-left:0; }
	.dn-num { flex:none; font-family:Consolas,'Cascadia Mono',monospace; font-size:11px; color:var(--muted); }
	.dn-num::after { content:' ·'; color:var(--faint); }
	.dn-subhead { font-size:9.5px; text-transform:uppercase; letter-spacing:.08em; color:var(--faint); padding-top:4px; padding-bottom:1px; border-bottom:1px solid var(--line-soft); margin:0 6px 1px 0; }
</style>
