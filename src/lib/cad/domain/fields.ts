// TEXT FIELDS LINKED TO DATA (backlog T092): a note or a block's text can show live values, filled when it's drawn
// (never stored), so legends and labels keep themselves up to date:
//   {PROJECT} the project's name · {LEVEL} the level it's on (a sheet: its viewports' levels) · {SHEET} / {SHEET_TITLE}
//   the sheet's number / title · {DATE} today · {COUNT:name} how many of a block (its name or id) are placed — inserts
//   and the outlets drawn with it — on that level (a sheet: on its viewports' levels).
// A field with no value here (no sheet in a plan) is left as written. Pure; tested in fields.test.ts.
import type { Id, Level } from './types'
import type { ProjectIndex } from './project'
import type { Sheet } from './drawing'
import { defaultOutletBlock, type Block } from './blocks'
import type { Prim } from '../views/display'

export const DATA_FIELDS = ['PROJECT', 'LEVEL', 'SHEET', 'SHEET_TITLE', 'DATE'] as const
const FIELD = /\{(PROJECT|LEVEL|SHEET|SHEET_TITLE|DATE)\}|\{COUNT:([^}]+)\}/g
/** Is this `{TAG}` a data field (not a block attribute an insert fills)? */
export const isDataField = (tag: string) => (DATA_FIELDS as readonly string[]).includes(tag) || tag.startsWith('COUNT:')

export interface FieldCtx { values: Partial<Record<(typeof DATA_FIELDS)[number], string>>; count: (name: string) => number }

/** What the fields read for a drawing of these levels (none = the whole project), on this sheet if any. */
export function fieldCtx(ix: ProjectIndex, o: { project?: string; levels?: Iterable<Id>; sheet?: Sheet; blocks?: (id: Id) => Block | undefined; today?: string }): FieldCtx {
	const levels = o.levels ? new Set(o.levels) : null
	const on = (levelId: Id | undefined) => !levels || (!!levelId && levels.has(levelId))
	const names = levels ? [...levels].map((id) => ix.get<Level>(id)).filter((l): l is Level => l?.type === 'level').sort((a, b) => a.order - b.order).map((l) => l.name) : []
	const d = new Date(), today = o.today ?? `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
	let placed: Map<Id, number> | null = null
	const counts = () => {
		if (placed) return placed
		placed = new Map()
		const add = (id: Id) => placed!.set(id, (placed!.get(id) ?? 0) + 1)
		for (const s of ix.shapes) if (s.geom.kind === 'insert' && on(s.levelId)) add(s.geom.blockId)
		for (const ot of ix.outlets) if (ot.at && on(ot.levelId)) add(ot.blockId ?? defaultOutletBlock(ot))
		return placed
	}
	return {
		values: {
			...(o.project ? { PROJECT: o.project } : {}), ...(names.length ? { LEVEL: names.join(', ') } : {}),
			...(o.sheet ? { SHEET: o.sheet.number, SHEET_TITLE: o.sheet.title } : {}), DATE: today,
		},
		count: (name) => {
			const want = name.trim().toLowerCase()
			let n = 0
			for (const [id, c] of counts()) if (id.toLowerCase() === want || o.blocks?.(id)?.name.trim().toLowerCase() === want) n += c
			return n
		},
	}
}

/** The text with its fields filled (ones with no value here stay as written). */
export function fillFields(text: string, ctx: FieldCtx): string {
	if (!text.includes('{')) return text
	return text.replace(FIELD, (m, tag: string | undefined, name: string | undefined) => (tag ? (ctx.values[tag as keyof FieldCtx['values']] ?? m) : String(ctx.count(name!))))
}

/** A view's texts with their fields filled — the last step of drawing a plan, elevation, section or sheet. */
export const withFields = (prims: Prim[], ctx: FieldCtx): Prim[] =>
	prims.map((p) => (p.k === 'text' && p.text.includes('{') ? { ...p, text: fillFields(p.text, ctx) } : p))
