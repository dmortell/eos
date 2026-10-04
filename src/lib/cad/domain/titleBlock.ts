// TITLE BLOCK (Phase 4.2 — ported as it is from Pages' titleBlock.ts, Dave: "keep the pages titleblock model"): ONE
// template per project (`ProjectSettings.titleBlock`) — which fields the sheet's title block shows, in order, plus a
// logo text, logo images, the drawing office's block and the layout. Values are filled AUTOMATICALLY at render time
// from the project and the sheet (number, title, revision, date, scale, …); a 'custom' field shows the template's own
// fixed text (e.g. the client's name) on every sheet. Pure; tested in titleBlock.test.ts. Drawn by views/titleBlock.ts.

/** Auto-filled field keys and their default labels (a template may relabel them). */
export const TB_AUTO = {
	project: 'Project', title: 'Title', place: 'Location', number: 'Dwg №', rev: 'Rev', date: 'Date',
	scale: 'Scale', size: 'Size', drawn: 'Drawn',
} as const
export type TbAutoKey = keyof typeof TB_AUTO
export type TbField = { key: TbAutoKey | 'custom' | 'logo'; label: string; /** custom only: the fixed text */ value?: string; /** a full-width row (else a half-width cell) */ wide?: boolean
	/** key 'logo': which logo image this field shows (Dave 2026-10-05: logos are fields, placed and ordered like them) */
	logo?: 'company' | 'client' }
export const LOGO_LABEL = { company: 'Our logo', client: 'Client logo' } as const
/** The block's optional sections — each can be switched off project-wide (`hidden`). */
export type TbSection = 'logo' | 'company' | 'fields' | 'revisions'
/** One row of the revision table. */
export type TbRev = { code: string; date: string; note?: string }
export type TbCompany = { name?: string; address?: string; contact?: string }
export type TitleBlockTemplate = {
	logo?: string; fields: TbField[]
	/** The drawing office's block under the logo: name (bold), address, contact — one line each. */
	company?: TbCompany
	/** Sections switched off for every sheet of the project. */
	hidden?: TbSection[]
	/** Print a hairline border along the paper margin (else the margin is a screen-only guide). */
	border?: boolean
	/** Logo IMAGES (file-storage URLs, or small inline data URLs) — the drawing office's and the client's — each drawn
	 *  `h` paper mm high. Shown in the logo section, instead of / beside the logo text. */
	logos?: { company?: TbLogo; client?: TbLogo }
	/** Where the block sits — a strip down the right (default), a band along the bottom, or a compact box in the
	 *  bottom-right corner over the drawing area. */
	layout?: TbLayout
}
/** A title-block logo: `src` = its file-storage URL (UploadThing, like Uploads; `key` = the stored file's key), or —
 *  legacy / offline — an inline data URL; `h` = its printed height (mm). */
export type TbLogo = { src: string; h?: number; key?: string }
export type TbLayout = 'vertical' | 'horizontal' | 'compact'
/** The title block as one sheet shows it. `hidden` = this sheet hides the block (the project's `border` still
 *  applies). */
export type TbShown = { logo?: string; company?: string[]; cells: TbCell[]; border?: boolean; hidden?: boolean
	/** The revision table, newest LAST (at most the last 5); absent when hidden or the sheet was never issued. */
	revisions?: TbRev[]
	/** The logo images (in the logo section). */ logos?: TbLogo[]
	layout?: TbLayout }

/** A sheet's shown block: sections the template hides are dropped; empty company lines are skipped. */
export function shownTitleBlock(t: TitleBlockTemplate | undefined, cells: TbCell[], revs: TbRev[] = []): TbShown {
	const off = new Set(t?.hidden ?? []), c = t?.company
	const company = [c?.name, c?.address, c?.contact].map((s) => s?.trim() ?? '').filter(Boolean)
	return {
		logo: off.has('logo') ? undefined : t ? t.logo : DEFAULT_TITLE_BLOCK.logo,
		company: off.has('company') || !company.length ? undefined : company,
		cells: off.has('fields') ? [] : cells,
		border: !!t?.border,
		...(off.has('revisions') || !revs.length ? {} : { revisions: revs.slice(-5) }),
		// the logo IMAGES are fields now (withLogoFields): the logo section keeps the logo text only
		...(t?.layout && t.layout !== 'vertical' ? { layout: t.layout } : {}),
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
export type TbCell = { label: string; value: string; wide: boolean; /** a logo field: its image instead of label + value */ image?: TbLogo }

/** The template's cells for one sheet; an empty value shows as '—'. A missing template → the default. */
export function fillTitleBlock(t: TitleBlockTemplate | undefined, ctx: TbContext): TbCell[] {
	return withLogoFields(t).flatMap((f): TbCell[] => {
		if (f.key === 'logo') {   // its image (no label printed); a logo field with no image set shows nothing
			const img = f.logo && t?.logos?.[f.logo]
			return img?.src ? [{ label: f.label, value: '', wide: !!f.wide, image: img }] : []
		}
		return [{ label: f.label || (f.key === 'custom' ? '' : TB_AUTO[f.key]), value: (f.key === 'custom' ? f.value : ctx[f.key])?.trim() || '—', wide: !!f.wide }]
	})
}

/** The template's fields with its logo images as fields: a logo that's set but not yet in the list (templates from
 *  before logos were fields) comes first, full width — so old title blocks look the same until a logo is moved. */
export function withLogoFields(t: TitleBlockTemplate | undefined): TbField[] {
	const fields = t?.fields?.length ? t.fields : DEFAULT_TITLE_BLOCK.fields
	const missing = (['company', 'client'] as const).filter((k) => t?.logos?.[k]?.src && !fields.some((f) => f.key === 'logo' && f.logo === k))
	return [...missing.map((k): TbField => ({ key: 'logo', logo: k, label: LOGO_LABEL[k], wide: true })), ...fields]
}

/** Initials for "Drawn": "David Mortell" → "DM"; an email → its local part's first 3 letters ("DMO"). */
export function initialsOf(nameOrEmail: string | null | undefined): string {
	const s = (nameOrEmail ?? '').trim(); if (!s) return ''
	if (s.includes('@')) return s.split('@')[0].replace(/[^a-z]/gi, '').slice(0, 3).toUpperCase()
	return s.split(/\s+/).map((w) => w[0]).join('').slice(0, 3).toUpperCase()
}
