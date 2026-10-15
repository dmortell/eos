// PROJECT GROUPS (User 2026-10-16, src/lib/cad/docs/plan/multi-building-plan.md): several buildings are separate projects
// kept together by a GROUP — `projectGroups/{masterId}` = { name, ownerId, members, createdAt } — and, on each building's
// project, `masterId`, `groupName` and `buildingName`. A grouped project's `name` is "Group – Building", so every page
// that shows `name` (the legacy tools, Open Project, the title bar) reads right without knowing about groups; cad's
// {PROJECT} reads the group name and {BUILDING} the building. Only `masterId` and the names ever change: a building's
// data never moves, so grouping, ungrouping and moving are safe and reversible.
import { collection, deleteField, doc, getDoc, getDocs, query, setDoc, updateDoc, where, writeBatch } from 'firebase/firestore'
import { nanoid } from 'nanoid'
import { firestore } from './db.svelte'

export interface GroupedProject {
	id: string; name: string; masterId?: string; groupName?: string; buildingName?: string
	members?: string[]; ownerId?: string; deleted?: boolean; createdAt?: unknown; updatedAt?: unknown; deletedAt?: unknown; deletedBy?: unknown
}

/** "Project Tourney – building1"; no building → the group's name. */
export const fullName = (group: string, building?: string) => (building?.trim() ? `${group} – ${building.trim()}` : group)

/** The group's own name: the stored one, else what the full name starts with, else the name. */
export const groupOf = (p: Pick<GroupedProject, 'name' | 'groupName' | 'buildingName'>) => p.groupName ?? p.name

/** Projects in list order: each group together (by its name), its buildings by name; a lone project by its name. */
export function sortGrouped<T extends GroupedProject>(ps: T[]): T[] {
	const key = (p: T) => (p.masterId ? (p.groupName ?? p.name) : p.name).toLowerCase()
	return [...ps].sort((a, b) => key(a).localeCompare(key(b)) || (a.masterId ?? '').localeCompare(b.masterId ?? '') || (a.buildingName ?? '').localeCompare(b.buildingName ?? '', undefined, { numeric: true }))
}

const projects = () => collection(firestore, 'projects')
const slug = (s: string) => s.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'building'

/** The group's projects (active and archived). */
async function membersOf(masterId: string): Promise<GroupedProject[]> {
	const snap = await getDocs(query(projects(), where('masterId', '==', masterId)))
	return snap.docs.map((d) => ({ ...(d.data() as GroupedProject), id: d.id }))
}

/** The group doc's members: everyone on any of its buildings. */
async function refreshMembers(masterId: string): Promise<void> {
	const all = await membersOf(masterId)
	const members = [...new Set(all.flatMap((p) => p.members ?? []))]
	if (all.length) await updateDoc(doc(firestore, 'projectGroups', masterId), { members })
}

/** Make `p` the first building of a new group named after it (its own name stays the group's). */
async function startGroup(p: GroupedProject, building: string, uid: string | undefined): Promise<{ masterId: string; group: string }> {
	const masterId = nanoid(12), group = groupOf(p)
	await setDoc(doc(firestore, 'projectGroups', masterId), { name: group, ownerId: uid ?? p.ownerId ?? null, members: p.members ?? [], createdAt: new Date() })
	await updateDoc(doc(projects(), p.id), { masterId, groupName: group, buildingName: building.trim(), name: fullName(group, building), updatedAt: new Date() })
	return { masterId, group }
}

/** Add a building to `src`'s group (starting one when it has none — `srcBuilding` names `src`'s own building then): a new
 *  project with `src`'s details, members and cad settings copied (usages, cable types, label patterns, title block …;
 *  "Copy settings from…" brings them up to date later). Returns the new project's id. */
export async function addBuilding(src: GroupedProject, building: string, uid: string | undefined, srcBuilding?: string): Promise<string> {
	const g = src.masterId ? { masterId: src.masterId, group: groupOf(src) } : await startGroup(src, srcBuilding || src.buildingName || 'Building 1', uid)
	let id = `${src.id}-${slug(building)}`
	for (let n = 2; (await getDoc(doc(projects(), id))).exists(); n++) id = `${src.id}-${slug(building)}-${n}`
	const { id: _i, name: _n, buildingName: _b, createdAt: _c, updatedAt: _u, deleted: _d, deletedAt: _da, deletedBy: _db, ...details } = src
	const now = new Date()
	await setDoc(doc(projects(), id), { ...details, name: fullName(g.group, building), masterId: g.masterId, groupName: g.group, buildingName: building.trim(),
		members: src.members ?? [], ownerId: uid ?? src.ownerId ?? null, createdAt: now, updatedAt: now, deleted: false })
	await copyCadSettings(src.id, id, uid)
	await refreshMembers(g.masterId)
	return id
}

/** cad's project settings (one `settings` doc in cadEntities) from one project to another — Add building, and cad's
 *  Project › Copy settings from…. Returns false when the source has none. */
export async function copyCadSettings(fromPid: string, toPid: string, uid: string | undefined): Promise<boolean> {
	const src = await getDoc(doc(firestore, 'projects', fromPid, 'cadEntities', 'settings'))
	if (!src.exists()) return false
	const to = doc(firestore, 'projects', toPid, 'cadEntities', 'settings')
	const was = await getDoc(to)
	const rev = ((was.data()?.rev as number | undefined) ?? 0) + 1
	await setDoc(to, { ...src.data(), rev, updatedAt: Date.now(), updatedBy: uid ?? 'copy', client: 'copy-settings' })
	return true
}

/** Take a building out of its group: a project of its own, keeping its full name ("Group – Building", editable) and
 *  its building name ({BUILDING}). The group doc goes with its last building. */
export async function ungroup(p: GroupedProject): Promise<void> {
	if (!p.masterId) return
	const masterId = p.masterId
	await updateDoc(doc(projects(), p.id), { masterId: deleteField(), groupName: deleteField(), updatedAt: new Date() })
	const left = await membersOf(masterId)
	if (!left.length) {
		const b = writeBatch(firestore)
		b.delete(doc(firestore, 'projectGroups', masterId))
		await b.commit()
	} else await refreshMembers(masterId)
}

/** Put `p` into `target`'s group (starting one from `target` when it has none — `targetBuilding` names it then). `p`
 *  keeps its data and settings; its building name is `building`. Leaving an old group as ungroup does. */
export async function moveToGroup(p: GroupedProject, target: GroupedProject, building: string, uid: string | undefined, targetBuilding?: string): Promise<void> {
	if (p.masterId && p.masterId === target.masterId) return
	const old = p.masterId
	const g = target.masterId ? { masterId: target.masterId, group: groupOf(target) } : await startGroup(target, targetBuilding || target.buildingName || 'Building 1', uid)
	await updateDoc(doc(projects(), p.id), { masterId: g.masterId, groupName: g.group, buildingName: building.trim(), name: fullName(g.group, building), updatedAt: new Date() })
	await refreshMembers(g.masterId)
	if (old) {
		const left = await membersOf(old)
		if (!left.length) { const b = writeBatch(firestore); b.delete(doc(firestore, 'projectGroups', old)); await b.commit() }
		else await refreshMembers(old)
	}
}

/** Rename a group: its doc, and every building's group name and full name. */
export async function renameGroup(masterId: string, name: string): Promise<void> {
	const n = name.trim()
	if (!n) return
	const all = await membersOf(masterId), b = writeBatch(firestore), now = new Date()
	b.update(doc(firestore, 'projectGroups', masterId), { name: n })
	for (const p of all) b.update(doc(projects(), p.id), { groupName: n, name: fullName(n, p.buildingName), updatedAt: now })
	await b.commit()
}

/** The other buildings of `p`'s group (active), for the title bar's switcher and Copy settings from…. */
export async function buildingsOf(p: Pick<GroupedProject, 'id' | 'masterId'>): Promise<GroupedProject[]> {
	if (!p.masterId) return []
	return sortGrouped((await membersOf(p.masterId)).filter((x) => !x.deleted))
}

/** What the Projects page's group dialog does (routes/projects/GroupDialog.svelte). */
export type GroupAction = { kind: 'add' | 'move' | 'rename' | 'ungroup' | 'delete'; project: GroupedProject }
