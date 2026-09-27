// Tree VIEWS (tree-views-plan.md): the navigator lists the project's models + sheets in other shapes than the place
// tree. The ITEMS never move — a view only decides how they're LISTED:
//   places  today's tree (store/placeTree.ts) — the only view where a drag re-files
//   group   folders built from the items' fields (kind › floor, discipline › kind …); an item with no value for a
//           level goes under "(no …)"; dropping onto a group SETS that field (drop on "High level" adds the tag)
//   custom  the team's own folders of REFERENCES (an item can be in several — like playlists) + SMART folders
//           (a saved filter that fills itself); stored in the project's Pages doc (`pages.treeViews`)
// Models and sheets are both items; in a grouped folder the models come first, under a "Models" sub-heading
// (tree-views-plan §3.5). Pure; tested in treeViews.test.ts.
import type { NavKind, NavNode } from '../mock/data'
import { ancestorsOf, childrenOf } from './places'
import { SHEET_KINDS, type CustomFolderDoc, type GroupKey, type PagesSheetDoc, type Place, type TreeFilter, type TreeViewDoc } from './schema'
import { hasTag, mergeTags } from './tags'

export type { GroupKey, TreeFilter, CustomFolderDoc, TreeViewDoc }
/** A view as the navigator uses it: 'places' (today's tree), a built-in group template, or a stored one. */
export type TreeView = Omit<TreeViewDoc, 'kind'> & { kind: 'places' | 'group' | 'custom'; builtin?: boolean; hint?: string }

export const PLACES_VIEW = 'places'
/** The one-click templates (tree-views-plan §3.2). Not stored — code. */
export const BUILTIN_VIEWS: TreeView[] = [
	{ id: PLACES_VIEW, name: 'By place', kind: 'places', builtin: true, hint: 'Building › floor › zone — dragging re-files' },
	{ id: 'tpl:type', name: 'By drawing type', kind: 'group', levels: ['kind', 'floor'], builtin: true, hint: 'Outlets › 33F, 34F … · Trunks › … · Models › …' },
	{ id: 'tpl:level', name: 'Outlets / trunks by level', kind: 'group', levels: ['kind', 'tag', 'floor'], filter: { kinds: ['outlets', 'trunks'] }, tagSet: ['high-level', 'low-level'], builtin: true,
		hint: 'Outlets › high-level › 33F — tag sheets high-level / low-level' },
	{ id: 'tpl:elev', name: 'Elevations by category', kind: 'group', levels: ['category', 'place'], filter: { kinds: ['elevation', 'rack', 'riser'] }, builtin: true,
		hint: 'Racks › …, Risers › …, AV rooms › … — set an elevation sheet’s Category' },
	{ id: 'tpl:disc', name: 'By discipline', kind: 'group', levels: ['discipline', 'kind'], builtin: true, hint: 'Electrical › Outlets … · AV › …' },
]
/** The built-ins, then the project's stored views. */
export const allViews = (stored: readonly TreeViewDoc[] | undefined): TreeView[] => [...BUILTIN_VIEWS, ...(stored ?? [])]
/** A view by id — an unknown id (deleted by a teammate) falls back to "By place". */
export const viewById = (stored: readonly TreeViewDoc[] | undefined, id: string | null | undefined): TreeView =>
	allViews(stored).find((v) => v.id === id) ?? BUILTIN_VIEWS[0]

export const KIND_LABELS: Record<string, string> = {
	model: 'Models', plan: 'Plans', outlets: 'Outlets', trunks: 'Trunks', elevation: 'Elevations', rack: 'Racks', riser: 'Risers',
	schematic: 'Schematics', detail: 'Details', schedule: 'Schedules',
}
export const LEVEL_LABELS: Record<GroupKey, string> = { building: 'Building', floor: 'Floor', zone: 'Zone', place: 'Place', kind: 'Drawing type', discipline: 'Discipline', tag: 'Tag', category: 'Category' }
/** The "(none)" folder's label per level. */
const NONE_LABEL: Record<GroupKey, string> = { building: '(no building)', floor: '(no floor)', zone: '(no zone)', place: '(project level)', kind: '(no type)', discipline: '(no discipline)', tag: '(no tag)', category: '(no category)' }
/** The navigator's folder icon per level (DrawingNavigator folderIcon). */
const FOLDER_OF: Record<GroupKey, string> = { building: 'building', floor: 'floor', zone: 'zone', place: 'place', kind: 'group', discipline: 'group', tag: 'tag', category: 'group' }

// ── the items ──
export type Loc = { id: string; name: string; order: number }
/** One model or sheet, with everything a view groups / filters by. */
export type TreeItem = {
	/** `s:<sheetId>` / `m:<modelId>` — what custom folders store. */
	ref: string
	type: 'sheet' | 'model'
	label: string
	/** The drawing id it opens under (`sheet:<id>` / `model:<id>`). */
	docId: string
	number?: string; link?: boolean; modelId?: string
	/** A model's own kind ('floor', 'building', 'rack' …) — picks its icon. */
	modelKind?: string
	placeId: string | null
	/** A sheet's kind; a model's is 'model'. */
	kind?: string
	discipline?: string; category?: string
	tags: string[]
	building?: Loc; floor?: Loc; zone?: Loc
	place?: Loc & { path: string }
	/** Its place and every ancestor place (a `places` filter matches any). */
	within: string[]
}
export type ModelLite = { id: string; name: string; placeId?: string | null; kind?: string; archived?: boolean }

const isFloorPlace = (p: Place) => p.kind === 'floor' || (!p.kind && p.legacy?.floor != null && p.legacy.area == null && p.legacy.room == null && p.legacy.row == null)

/** The live sheets + models as tree items (archived ones left out), located in the place tree. */
export function treeItems(sheets: readonly PagesSheetDoc[], models: readonly ModelLite[], places: Place[]): TreeItem[] {
	const order = new Map<string, number>()   // depth-first position = the order "By place" shows them
	const walk = (parentId: string | null) => { for (const p of childrenOf(places, parentId)) { if (order.has(p.id)) continue; order.set(p.id, order.size); walk(p.id) } }
	walk(null)
	const loc = (p: Place): Loc => ({ id: p.id, name: p.name, order: order.get(p.id) ?? Number.MAX_SAFE_INTEGER })
	const locate = (placeId: string | null | undefined): Pick<TreeItem, 'building' | 'floor' | 'zone' | 'place' | 'within' | 'placeId'> => {
		const me = placeId ? places.find((p) => p.id === placeId) : undefined
		if (!me) return { placeId: null, within: [] }
		const chain = [...ancestorsOf(places, me.id), me]
		const last = (f: (p: Place) => boolean) => { const p = [...chain].reverse().find(f); return p ? loc(p) : undefined }
		return { placeId: me.id, within: chain.map((p) => p.id), building: last((p) => p.kind === 'building'), floor: last(isFloorPlace), zone: last((p) => p.kind === 'zone'),
			place: { ...loc(me), path: chain.map((p) => p.name).join(' › ') } }
	}
	const out: TreeItem[] = []
	for (const m of models) {
		if (m.archived) continue
		out.push({ ref: `m:${m.id}`, type: 'model', label: m.name || 'Model', docId: `model:${m.id}`, modelId: m.id, ...(m.kind ? { modelKind: m.kind } : {}), kind: 'model', tags: [], ...locate(m.placeId) })
	}
	for (const s of sheets) {
		if (s.status === 'archived') continue
		out.push({ ref: `s:${s.id}`, type: 'sheet', label: s.title || 'Untitled sheet', docId: `sheet:${s.id}`, ...(s.drawingNumber ? { number: s.drawingNumber } : {}), ...(s.link ? { link: true } : {}),
			...(s.kind ? { kind: s.kind } : {}), ...(s.discipline?.trim() ? { discipline: s.discipline.trim() } : {}), ...(s.category?.trim() ? { category: s.category.trim() } : {}),
			tags: mergeTags([], s.tags ?? []), ...locate(s.placeId) })
	}
	return out
}

// ── filters ──
const anyOf = (want: readonly string[] | undefined, have: readonly string[]) => !want?.length || have.some((h) => want.some((w) => w.toLowerCase() === h.toLowerCase()))
/** Any-of within a field, all-of across fields; a filter field the item has no value for fails. */
export function matchesFilter(it: TreeItem, f: TreeFilter | undefined): boolean {
	if (!f) return true
	return anyOf(f.kinds, it.kind ? [it.kind] : []) && anyOf(f.tags, it.tags) && anyOf(f.disciplines, it.discipline ? [it.discipline] : [])
		&& anyOf(f.categories, it.category ? [it.category] : []) && (!f.places?.length || f.places.some((p) => it.within.includes(p)))
}
export const isEmptyFilter = (f: TreeFilter | undefined) => !f || !(f.kinds?.length || f.tags?.length || f.disciplines?.length || f.categories?.length || f.places?.length)

// ── rows ──
const cmp = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' })
/** Models by place order then name; sheets by drawing number (natural, blanks last) then title. */
const byModel = (a: TreeItem, b: TreeItem) => (a.place?.order ?? Infinity) - (b.place?.order ?? Infinity) || cmp.compare(a.label, b.label)
const bySheet = (a: TreeItem, b: TreeItem) => (!a.number !== !b.number ? (a.number ? -1 : 1) : cmp.compare(a.number ?? '', b.number ?? '')) || cmp.compare(a.label, b.label)

/** An item's row under `parentId` (row ids are unique per position; `ref` names the item). */
export function itemRow(it: TreeItem, parentId: string): NavNode {
	const id = `${parentId}/${it.ref}`
	if (it.type === 'model') return { id, ref: it.ref, label: it.label, model: it.modelId, docId: it.docId, ...(it.modelKind ? { modelKind: it.modelKind } : {}) }
	return { id, ref: it.ref, label: it.label, drawing: 'sheet' as NavKind, docId: it.docId, sheet: true, ...(it.link ? { link: true } : {}), ...(it.number ? { number: it.number } : {}) }
}
/** A folder's item rows: models first (sorted), then sheets (sorted); with both, each under a thin sub-heading. */
export function itemRows(items: readonly TreeItem[], parentId: string): NavNode[] {
	const ms = items.filter((i) => i.type === 'model').sort(byModel), ss = items.filter((i) => i.type === 'sheet').sort(bySheet)
	if (ms.length && ss.length) return [
		{ id: `${parentId}/:models`, label: 'Models', subhead: true }, ...ms.map((i) => itemRow(i, parentId)),
		{ id: `${parentId}/:sheets`, label: 'Sheets', subhead: true }, ...ss.map((i) => itemRow(i, parentId)),
	]
	return [...ms, ...ss].map((i) => itemRow(i, parentId))
}

type Val = { value: string; label: string; order: number }
/** An item's value(s) at a level ([] = none). The 'tag' level gives one per tag (only `tagSet`'s when set). */
function valuesOf(it: TreeItem, level: GroupKey, tagSet?: readonly string[]): Val[] {
	const at = (l?: Loc & { path?: string }): Val[] => (l ? [{ value: l.id, label: l.path ?? l.name, order: l.order }] : [])
	switch (level) {
		case 'building': return at(it.building)
		case 'floor': return at(it.floor)
		case 'zone': return at(it.zone)
		case 'place': return at(it.place)
		case 'kind': {
			if (!it.kind) return []
			const i = (SHEET_KINDS as string[]).indexOf(it.kind)
			return [{ value: it.kind, label: KIND_LABELS[it.kind] ?? it.kind, order: it.kind === 'model' ? -1 : i < 0 ? 999 : i }]
		}
		case 'discipline': return it.discipline ? [{ value: it.discipline, label: it.discipline, order: 0 }] : []
		case 'category': return it.category ? [{ value: it.category, label: it.category, order: 0 }] : []
		case 'tag': return it.tags.filter((t) => !tagSet?.length || hasTag(tagSet, t)).map((t) => {
			const i = tagSet?.findIndex((x) => x.toLowerCase() === t.toLowerCase()) ?? -1
			return { value: t, label: t, order: i < 0 ? 0 : i }
		})
	}
}

/** The GROUP view's tree: the filtered items in nested folders, one level per `view.levels` entry (value order:
 *  place levels in the place tree's order, kinds in SHEET_KINDS order with Models first, the rest alphabetical;
 *  "(no …)" last). Each folder carries its level / value path (`vgroup`) and its item count (`meta`). */
export function buildGroupedTree(items: readonly TreeItem[], view: Pick<TreeView, 'id' | 'levels' | 'filter' | 'tagSet'>): NavNode[] {
	const levels = view.levels ?? []
	const rec = (its: readonly TreeItem[], depth: number, parentId: string, path: { level: string; value: string }[]): NavNode[] => {
		if (depth >= levels.length) return itemRows(its, parentId)
		const level = levels[depth]
		const buckets = new Map<string, Val & { items: TreeItem[] }>()   // key: the value, case-folded
		for (const it of its) {
			const vs = valuesOf(it, level, view.tagSet)
			for (const v of vs.length ? vs : [{ value: '', label: NONE_LABEL[level], order: Infinity }]) {
				const k = v.value.toLowerCase(), b = buckets.get(k)
				if (!b) buckets.set(k, { ...v, items: [it] }); else if (!b.items.includes(it)) b.items.push(it)
			}
		}
		const sorted = [...buckets.values()].sort((a, b) => (!a.value !== !b.value ? (a.value ? -1 : 1) : a.order - b.order || cmp.compare(a.label, b.label)))
		return sorted.map((b) => {
			const id = `${parentId}/${level}:${b.value || '-'}`, p = [...path, { level, value: b.value }]
			return { id, label: b.label, folder: FOLDER_OF[level], vgroup: { level, value: b.value, path: p }, meta: String(b.items.length), children: rec(b.items, depth + 1, id, p) }
		})
	}
	return rec(items.filter((it) => matchesFilter(it, view.filter)), 0, `v:${view.id}`, [])
}

/** Which registry fields a drop onto a group folder SETS (tree-views-plan §3.6): its path's kind / discipline / category
 *  (a "(no …)" discipline / category clears it) and tags (added). Place levels never change — only "By place" re-files.
 *  null = nothing to change. */
export function groupPatch(path: readonly { level: string; value: string }[], cur: Pick<PagesSheetDoc, 'kind' | 'discipline' | 'category' | 'tags'>): Partial<Pick<PagesSheetDoc, 'kind' | 'discipline' | 'category' | 'tags'>> | null {
	const out: Partial<Pick<PagesSheetDoc, 'kind' | 'discipline' | 'category' | 'tags'>> = {}
	for (const { level, value } of path) {
		if (level === 'kind') { if (value && value !== 'model' && value !== cur.kind) out.kind = value as PagesSheetDoc['kind'] }
		else if (level === 'discipline') { if ((cur.discipline ?? '') !== value) out.discipline = value }
		else if (level === 'category') { if ((cur.category ?? '') !== value) out.category = value }
		else if (level === 'tag' && value) { const base = out.tags ?? cur.tags ?? []; if (!hasTag(base, value)) out.tags = mergeTags(base, [value]) }
	}
	return Object.keys(out).length ? out : null
}

// ── custom views ──
export const POOL_ID = 'cf:*pool'
export const folderChildren = (fs: readonly CustomFolderDoc[], parentId: string | null): CustomFolderDoc[] =>
	fs.filter((f) => f.parentId === parentId).sort((a, b) => a.order - b.order)

/** The CUSTOM view's tree: its folders (sub-folders first, then the items — a plain folder in its stored order, a
 *  smart folder its matches, models first) and, last, "Not in a folder": every item no plain folder holds (drag from
 *  there to file it). References to deleted items are skipped. */
export function buildCustomTree(items: readonly TreeItem[], view: Pick<TreeView, 'folders'>): NavNode[] {
	const fs = view.folders ?? [], byRef = new Map(items.map((i) => [i.ref, i]))
	const seen = new Set<string>()
	const node = (f: CustomFolderDoc): NavNode => {
		seen.add(f.id)
		const id = `cf:${f.id}`
		const subs = folderChildren(fs, f.id).filter((c) => !seen.has(c.id)).map(node)
		const its = f.filter ? items.filter((i) => matchesFilter(i, f.filter)) : f.items.map((r) => byRef.get(r)).filter((i): i is TreeItem => !!i)
		return { id, label: f.name, folder: f.filter ? 'smart' : 'group', cfolder: f.id, ...(f.filter ? { smart: true } : {}), meta: String(its.length),
			children: [...subs, ...(f.filter ? itemRows(its, id) : its.map((i) => itemRow(i, id)))] }
	}
	const out = folderChildren(fs, null).map(node)
	const filed = new Set(fs.filter((f) => !f.filter).flatMap((f) => f.items))
	const loose = items.filter((i) => !filed.has(i.ref))
	out.push({ id: POOL_ID, label: 'Not in a folder', folder: 'group', pool: true, meta: String(loose.length), children: itemRows(loose, POOL_ID) })
	return out
}

/** A new, empty custom view. */
export const newCustomView = (id: string, name: string, by = '', at = ''): TreeViewDoc => ({ id, name, kind: 'custom', folders: [], ...(by ? { createdBy: by } : {}), ...(at ? { updatedAt: at } : {}) })

/** Renumber the children of `parentId` in the given id order. */
function reorder(fs: CustomFolderDoc[], parentId: string | null, ids: string[]): CustomFolderDoc[] {
	const pos = new Map(ids.map((id, i) => [id, i]))
	return fs.map((f) => (f.parentId === parentId && pos.has(f.id) ? { ...f, order: pos.get(f.id)! } : f))
}
function descendants(fs: readonly CustomFolderDoc[], id: string): Set<string> {
	const out = new Set<string>(), stack = [id]
	while (stack.length) { const cur = stack.pop()!; for (const f of fs) if (f.parentId === cur && !out.has(f.id)) { out.add(f.id); stack.push(f.id) } }
	return out
}
/** A new folder (caller-minted id) as the last child of `parentId`; `filter` makes it a smart folder. */
export function addFolder(fs: readonly CustomFolderDoc[], a: { id: string; name: string; parentId: string | null; filter?: TreeFilter }): CustomFolderDoc[] {
	const f: CustomFolderDoc = { id: a.id, name: a.name.trim() || 'New folder', parentId: a.parentId, order: folderChildren(fs, a.parentId).length, items: [] }
	if (a.filter) f.filter = a.filter
	return [...fs, f]
}
export const renameFolder = (fs: readonly CustomFolderDoc[], id: string, name: string): CustomFolderDoc[] =>
	fs.map((f) => (f.id === id && name.trim() ? { ...f, name: name.trim() } : f))
/** Set (or with undefined, drop) a folder's smart filter. A folder turned smart keeps its items for if it's turned back. */
export const setFolderFilter = (fs: readonly CustomFolderDoc[], id: string, filter: TreeFilter | undefined): CustomFolderDoc[] =>
	fs.map((f) => { if (f.id !== id) return f; const { filter: _old, ...rest } = f; return filter ? { ...rest, filter } : rest })
/** Delete a folder with its sub-folders (the items themselves are untouched — folders only hold references). */
export function removeFolder(fs: readonly CustomFolderDoc[], id: string): CustomFolderDoc[] {
	const me = fs.find((f) => f.id === id); if (!me) return [...fs]
	const gone = descendants(fs, id); gone.add(id)
	const rest = fs.filter((f) => !gone.has(f.id))
	return reorder(rest, me.parentId, folderChildren(rest, me.parentId).map((f) => f.id))
}
/** Move a folder before / after / into another (null = impossible: onto itself or into its own sub-folders). */
export function moveFolder(fs: readonly CustomFolderDoc[], id: string, targetId: string, zone: 'before' | 'into' | 'after'): CustomFolderDoc[] | null {
	const me = fs.find((f) => f.id === id), target = fs.find((f) => f.id === targetId)
	if (!me || !target || id === targetId || descendants(fs, id).has(targetId)) return null
	const parentId = zone === 'into' ? target.id : target.parentId
	let next = fs.map((f) => (f.id === id ? { ...f, parentId } : f))
	const sibs = folderChildren(next, parentId).filter((f) => f.id !== id).map((f) => f.id)
	if (zone === 'into') sibs.push(id)
	else sibs.splice(sibs.indexOf(targetId) + (zone === 'after' ? 1 : 0), 0, id)
	next = reorder(next, parentId, sibs)
	if (me.parentId !== parentId) next = reorder(next, me.parentId, folderChildren(next, me.parentId).map((f) => f.id))
	return next
}
/** File `refs` in folder `to` — before / after `target` (one of its items) or at its end; unless `copy`, folder `from`
 *  loses them (a move; `from` = `to` reorders). A smart folder takes nothing (null). */
export function dropRefs(fs: readonly CustomFolderDoc[], a: { refs: readonly string[]; to: string; from?: string | null; target?: string | null; zone?: 'before' | 'into' | 'after'; copy?: boolean }): CustomFolderDoc[] | null {
	const dest = fs.find((f) => f.id === a.to); if (!dest || dest.filter || !a.refs.length) return null
	const refs = [...new Set(a.refs)]
	let next = [...fs]
	if (a.from && a.from !== a.to && !a.copy) next = next.map((f) => (f.id === a.from ? { ...f, items: f.items.filter((r) => !refs.includes(r)) } : f))
	const rest = dest.items.filter((r) => !refs.includes(r))
	let at = rest.length
	if (a.target && !refs.includes(a.target)) { const i = rest.indexOf(a.target); if (i >= 0) at = a.zone === 'before' ? i : i + 1 }
	const items = [...rest.slice(0, at), ...refs, ...rest.slice(at)]
	return next.map((f) => (f.id === a.to ? { ...f, items } : f))
}
/** Take `refs` out of a folder. */
export const removeRefs = (fs: readonly CustomFolderDoc[], folderId: string, refs: readonly string[]): CustomFolderDoc[] =>
	fs.map((f) => (f.id === folderId ? { ...f, items: f.items.filter((r) => !refs.includes(r)) } : f))

/** What the navigator needs to show + edit tree views (built by pagesProject.svelte.ts; reactive getters). */
export type TreeViewsApi = {
	/** Every view (built-ins first) and the one this user is looking at. */
	readonly list: TreeView[]
	readonly current: TreeView
	select: (id: string) => void
	/** A new (empty) custom view, shown at once. */
	create: (name: string) => void
	rename: (id: string, name: string) => void
	remove: (id: string) => void
	openModel: (modelId: string, preview: boolean) => void
	/** A group view: sheets dropped onto a group take its fields (groupPatch). */
	groupDrop: (sheetRefs: string[], path: { level: string; value: string }[]) => void
	/** A custom view: a new folder (smart = with a filter) under a folder (null = top); returns its ROW id. */
	folderAdd: (parentId: string | null, smart: boolean) => string | undefined
	folderRename: (id: string, name: string) => void
	folderDelete: (id: string) => void
	folderMove: (id: string, targetId: string, zone: 'before' | 'into' | 'after') => void
	/** File items (each from its folder, null = not from one) into folder `to` next to `target` (a ref) — or, `to` null,
	 *  take them out of their folders. `copy` keeps them where they were too. */
	fileRefs: (a: { refs: { ref: string; from: string | null }[]; to: string | null; target?: string | null; zone?: 'before' | 'into' | 'after'; copy: boolean }) => void
	folderFilter: (id: string) => TreeFilter | undefined
	setFolderFilter: (id: string, f: TreeFilter | undefined) => void
	/** A sheet's tags (by ref `s:<id>`) and bulk set; the tag suggestion pools (global, project, defaults). */
	tagsOf: (ref: string) => string[]
	setTags: (patches: { ref: string; tags: string[] }[]) => void
	readonly tagPools: string[][]
	/** A smart folder's filter choices. */
	readonly filterOptions: { disciplines: string[]; categories: string[]; places: { id: string; path: string }[] }
}
