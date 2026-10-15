// GROUPS (backlog "Group / ungroup", User 2026-10-05): drawn shapes with the same `groupId` select and move as one.
// Ctrl+G groups the selected shapes (any old groups they were in are dissolved into the new one), Ctrl+Shift+G
// ungroups. A click or window on one member selects the whole group. Pure: each returns the entities to write / delete.
import type { Id } from './types'
import type { Entity, Group } from './drawing'
import type { Shape } from './shapes'
import { newId } from './ids'

/** `ids` with every member of any group they touch (a click on one member selects the group). */
export function withGroups(shapes: Shape[], ids: Id[]): Id[] {
	const sel = new Set(ids), groups = new Set(shapes.filter((s) => sel.has(s.id) && s.groupId).map((s) => s.groupId!))
	if (!groups.size) return ids
	return [...new Set([...ids, ...shapes.filter((s) => s.groupId && groups.has(s.groupId)).map((s) => s.id)])]
}

/** Group the selected SHAPES (2 or more): a new group; groups they were in and that end up empty go. */
export function groupShapes(all: Entity[], ids: Id[]): { put: Entity[]; del: Id[]; group?: Id } {
	const sel = new Set(ids), shapes = all.filter((e): e is Shape => e.type === 'shape' && sel.has(e.id))
	if (shapes.length < 2) return { put: [], del: [] }
	const group: Group = { type: 'group', id: newId() }
	const put: Entity[] = [group, ...shapes.map((s) => ({ ...s, groupId: group.id }))]
	return { put, del: emptied(all, shapes), group: group.id }
}

/** Ungroup: the selected shapes leave their groups; groups left empty go. */
export function ungroupShapes(all: Entity[], ids: Id[]): { put: Entity[]; del: Id[] } {
	const sel = new Set(ids), shapes = all.filter((e): e is Shape => e.type === 'shape' && sel.has(e.id) && !!e.groupId)
	return { put: shapes.map(({ groupId: _g, ...s }) => s as Shape), del: emptied(all, shapes) }
}

/** The groups that have no member left once `leaving` are out of them. */
function emptied(all: Entity[], leaving: Shape[]): Id[] {
	const out = new Set(leaving.map((s) => s.id)), old = new Set(leaving.map((s) => s.groupId).filter((g): g is Id => !!g))
	return [...old].filter((g) => !all.some((e) => e.type === 'shape' && e.groupId === g && !out.has(e.id)))
}
