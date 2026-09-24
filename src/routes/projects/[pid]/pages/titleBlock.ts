// TITLE BLOCK (drawings-plan §2.1, phase 5): ONE template per project (`projects/{pid}.pages.titleBlock`) —
// which fields the sheet's title block shows, in order, plus a logo text. Values are filled AUTOMATICALLY
// at render time from the project and the sheet's registry entry (number, title, revision, date, scale, …);
// a 'custom' field shows the template's own fixed text (e.g. the client's name) on every sheet.
// Pure; tested in titleBlock.test.ts.

/** Auto-filled field keys and their default labels (a template may relabel them). */
export const TB_AUTO = {
	project: 'Project', title: 'Title', place: 'Location', number: 'Dwg №', rev: 'Rev', date: 'Date',
	scale: 'Scale', size: 'Size', drawn: 'Drawn',
} as const
export type TbAutoKey = keyof typeof TB_AUTO
export type TbField = { key: TbAutoKey | 'custom'; label: string; /** custom only: the fixed text */ value?: string; /** a full-width row (else a half-width cell) */ wide?: boolean }
export type TitleBlockTemplate = { logo?: string; fields: TbField[] }

export const DEFAULT_TITLE_BLOCK: TitleBlockTemplate = {
	logo: 'J',
	fields: [
		{ key: 'project', label: 'Project', wide: true },
		{ key: 'title', label: 'Title', wide: true },
		{ key: 'scale', label: 'Scale' }, { key: 'size', label: 'Size' },
		{ key: 'rev', label: 'Rev' }, { key: 'date', label: 'Date' },
		{ key: 'drawn', label: 'Drawn' }, { key: 'number', label: 'Dwg №' },
	],
}

/** Everything the auto fields can show, gathered by the caller for one sheet. */
export type TbContext = Partial<Record<TbAutoKey, string>>
export type TbCell = { label: string; value: string; wide: boolean }

/** The template's cells for one sheet; an empty value shows as '—'. A missing template → the default. */
export function fillTitleBlock(t: TitleBlockTemplate | undefined, ctx: TbContext): TbCell[] {
	return (t?.fields?.length ? t.fields : DEFAULT_TITLE_BLOCK.fields).map((f) => ({
		label: f.label || (f.key === 'custom' ? '' : TB_AUTO[f.key]),
		value: (f.key === 'custom' ? f.value : ctx[f.key])?.trim() || '—',
		wide: !!f.wide,
	}))
}

/** Initials for "Drawn": "David Mortell" → "DM"; an email → its local part's first 3 letters ("DMO"). */
export function initialsOf(nameOrEmail: string | null | undefined): string {
	const s = (nameOrEmail ?? '').trim(); if (!s) return ''
	if (s.includes('@')) return s.split('@')[0].replace(/[^a-z]/gi, '').slice(0, 3).toUpperCase()
	return s.split(/\s+/).map((w) => w[0]).join('').slice(0, 3).toUpperCase()
}
