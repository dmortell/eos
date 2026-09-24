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
/** The block's optional sections — each can be switched off project-wide (`hidden`). */
export type TbSection = 'logo' | 'company' | 'fields'
export type TbCompany = { name?: string; address?: string; contact?: string }
export type TitleBlockTemplate = {
	logo?: string; fields: TbField[]
	/** The drawing office's block under the logo: name (bold), address, contact — one line each. */
	company?: TbCompany
	/** Sections switched off for every sheet of the project. */
	hidden?: TbSection[]
	/** Print a hairline border along the paper margin (else the margin is a screen-only guide). */
	border?: boolean
}
/** The title block as one sheet shows it (null = the sheet hides its title block). */
export type TbShown = { logo?: string; company?: string[]; cells: TbCell[]; border?: boolean }

/** A sheet's shown block: sections the template hides are dropped; empty company lines are skipped. */
export function shownTitleBlock(t: TitleBlockTemplate | undefined, cells: TbCell[]): TbShown {
	const off = new Set(t?.hidden ?? []), c = t?.company
	const company = [c?.name, c?.address, c?.contact].map((s) => s?.trim() ?? '').filter(Boolean)
	return {
		logo: off.has('logo') ? undefined : t ? t.logo : DEFAULT_TITLE_BLOCK.logo,
		company: off.has('company') || !company.length ? undefined : company,
		cells: off.has('fields') ? [] : cells,
		border: !!t?.border,
	}
}

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
