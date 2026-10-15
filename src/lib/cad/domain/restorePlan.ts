// What restoring a backup changes (ADR 0008 §4), worked out before anything is written: for the parts restored,
// live entities that differ from the backup are put back as they were, ones made since are removed, and deleted ones
// come back. A link or cord that crosses the edge of the parts comes back only if its outside end still exists and
// that port is free. Issues and sheets' revision lists are never rolled back.
import type { Entity } from './drawing'
import type { Id, Link, Cord, PortRef } from './types'
import { inParts, partsLabel, type Parts } from './backupParts'

export interface RestorePlan {
	put: Entity[]
	del: Id[]
	skipped: { id: Id; why: string }[]
	counts: { changed: number; added: number; removed: number; skipped: number }
}

/** Key order and `undefined` don't make two records different. */
function canon(v: unknown): string {
	if (Array.isArray(v)) return `[${v.map(canon).join(',')}]`
	if (v && typeof v === 'object') return `{${Object.keys(v).sort().filter((k) => (v as Record<string, unknown>)[k] !== undefined).map((k) => `${JSON.stringify(k)}:${canon((v as Record<string, unknown>)[k])}`).join(',')}}`
	return JSON.stringify(v)
}
export const sameEntity = (a: Entity, b: Entity) => canon(a) === canon(b)

/** Never rolled back: issues are the record of what went out. */
const KEEP_LIVE = new Set<Entity['type']>(['issue'])

export function restorePlan(live: Iterable<Entity>, backup: Iterable<Entity>, parts: Parts): RestorePlan {
	const liveAll = [...live], backAll = [...backup]
	const liveBy = new Map(liveAll.map((e) => [e.id, e])), backBy = new Map(backAll.map((e) => [e.id, e]))
	const liveIn = inParts(liveAll, parts), backIn = inParts(backAll, parts)

	const del: Id[] = []
	for (const id of liveIn.inside) {
		const e = liveBy.get(id)!
		if (KEEP_LIVE.has(e.type) || backIn.inside.has(id)) continue
		if (backBy.has(id)) continue          // in the backup but in another model then: moved since — left alone
		del.push(id)
	}
	const gone = new Set(del)

	// ports a crossing link or cord would come back into: taken by a live one that stays
	const taken = new Map<string, Id>()
	const key = (t: 'link' | 'cord', r: PortRef) => `${t}|${r.on}|${r.port}|${r.face ?? ''}`
	for (const e of liveAll) if ((e.type === 'link' || e.type === 'cord') && !gone.has(e.id)) for (const r of [e.a, e.b]) taken.set(key(e.type, r), e.id)
	const portExists = (r: PortRef) => {
		const e = liveBy.get(r.on)
		return e?.type === 'outlet' ? r.port >= 1 && r.port <= e.ports.length : e?.type === 'device' ? r.port >= 1 && r.port <= e.portCount : false
	}

	const put: Entity[] = [], skipped: RestorePlan['skipped'] = []
	let changed = 0, added = 0
	for (const id of backIn.inside) {
		let e = backBy.get(id)!
		if (KEEP_LIVE.has(e.type)) continue
		const was = liveBy.get(id)
		if (e.type === 'sheet' && was?.type === 'sheet') e = { ...e, revisions: was.revisions }   // revisions stay as issued
		const out = backIn.crossing.get(id)
		if (out) {
			const c = e as Link | Cord, end = c[out]
			const holder = taken.get(key(c.type, end))
			const why = !liveBy.has(end.on) ? `the ${c.type === 'link' && c.kind === 'horizontal' && out === 'b' ? 'outlet' : 'device'} at its other end is gone`
				: !portExists(end) ? 'the port at its other end is gone'
				: holder && holder !== id ? 'the port at its other end is in use' : ''
			if (why) { skipped.push({ id, why }); continue }
		}
		if (was && sameEntity(was, e)) continue
		put.push(e)
		if (was) changed++
		else added++
	}
	return { put, del, skipped, counts: { changed, added, removed: del.length, skipped: skipped.length } }
}

/** The preview's lines: "33F 3303: 214 changed, 12 added back, 30 removed" and one line per skipped link or cord. */
export function restoreSummary(plan: RestorePlan, backup: Iterable<Entity>, parts: Parts): { line: string; skipped: string[] } {
	const backAll = [...backup], by = new Map(backAll.map((e) => [e.id, e]))
	const c = plan.counts
	const bits = [c.changed && `${c.changed} changed`, c.added && `${c.added} added back`, c.removed && `${c.removed} removed`, c.skipped && `${c.skipped} skipped`].filter(Boolean)
	const name = (r: PortRef) => {
		const e = by.get(r.on) as { name?: string; label?: string } | undefined
		return `${e?.name ?? e?.label ?? r.on}:${r.port}`
	}
	const skipped = plan.skipped.map(({ id, why }) => {
		const e = by.get(id) as Link | Cord | undefined
		const what = e?.type === 'cord' ? 'Cord' : 'Link'
		return e ? `${what} ${name(e.a)} – ${name(e.b)}: ${why}` : `${id}: ${why}`
	})
	return { line: `${partsLabel(backAll, parts)}: ${bits.length ? bits.join(', ') : 'nothing to change'}`, skipped }
}

/** Only the project owner restores (User 2026-10-08); a project with no owner set lets anyone who can edit. */
export const canRestore = (ownerId: string | undefined, uid: string | undefined): boolean => !ownerId || (!!uid && ownerId === uid)

/** A stored backup is deleted by whoever made it or by the owner (ADR 0008 §8); with no owner set, by anyone. */
export const canDeleteBackup = (madeBy: string | undefined, ownerId: string | undefined, uid: string | undefined): boolean =>
	canRestore(ownerId, uid) || (!!uid && madeBy === uid)
