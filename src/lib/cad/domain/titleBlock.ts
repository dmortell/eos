// TITLE BLOCK (Phase 4.2 — ported as it is from Pages' titleBlock.ts, User: "keep the pages titleblock model"): ONE
// template per project (`ProjectSettings.titleBlock`) — which fields the sheet's title block shows, in order, plus a
// logo text, logo images, the drawing office's block and the layout. Values are filled AUTOMATICALLY at render time
// from the project and the sheet (number, title, revision, date, scale, …); a 'custom' field shows the template's own
// fixed text (e.g. the client's name) on every sheet. Pure; tested in titleBlock.test.ts. Drawn by views/titleBlock.ts.

/** Auto-filled field keys and their default labels (a template may relabel them). */
export const TB_AUTO = {
	project: 'Project', title: 'Title', place: 'Location', number: 'Dwg №', rev: 'Rev', date: 'Date',
	scale: 'Scale', size: 'Size', drawn: 'Drawn',
	// the approvals and the site (backlog "Approvals and Site sections in the title block"): add them as fields in the
	// template (a template without them prints as before); Checked / Approved are set per sheet like Drawn, Site is the
	// template's own address
	checked: 'Checked', approved: 'Approved', site: 'Site',
	// the client's name, from the Project details (Site falls back on its address)
	client: 'Client',
} as const
export type TbAutoKey = keyof typeof TB_AUTO
export type TbField = { key: TbAutoKey | 'custom' | 'logo' | 'logoText' | 'company'; label: string; /** custom only: the fixed text */ value?: string; /** a full-width row (else a half-width cell) */ wide?: boolean
	/** key 'logo': which logo image this field shows (User 2026-10-05: logos are fields, placed and ordered like them) */
	logo?: 'company' | 'client' }
export const LOGO_LABEL = { company: 'Our logo', client: 'Client logo' } as const
/** The block's own items that are fields too (User 2026-10-05: the logo images, the logo text and the company block
 *  are dragged into place like the others); always in the list, full width — cleared, not removed. */
const FIXED: TbField[] = [
	{ key: 'logo', logo: 'company', label: LOGO_LABEL.company, wide: true }, { key: 'logo', logo: 'client', label: LOGO_LABEL.client, wide: true },
	{ key: 'logoText', label: 'Logo text', wide: true }, { key: 'company', label: 'Company', wide: true },
]
const sameItem = (a: TbField, b: TbField) => a.key === b.key && (a.key !== 'logo' || a.logo === b.logo)
/** Always in the list (no remove button): the two logo images, the logo text, the company block. */
export const isFixedField = (f: TbField) => FIXED.some((x) => sameItem(x, f))
/** The block's optional sections — each can be switched off project-wide (`hidden`). */
export type TbSection = 'logo' | 'company' | 'fields' | 'revisions'
/** One row of the revision table. */
export type TbRev = { code: string; date: string; note?: string; desc?: string }
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
	/** The site's address, for a Site field. */
	site?: string
	/** Where the block sits — a strip down the right (default), a band along the bottom, or a compact box in the
	 *  bottom-right corner over the drawing area. */
	layout?: TbLayout
}
/** A title-block logo: `src` = its file-storage URL (UploadThing or Firebase Storage, like Uploads; `key` = an UploadThing file's key), or —
 *  legacy / offline — an inline data URL; `h` = its printed height (mm). */
export type TbLogo = { src: string; h?: number; key?: string }
export type TbLayout = 'vertical' | 'horizontal' | 'compact'
/** The title block as one sheet shows it. `hidden` = this sheet hides the block (the project's `border` still
 *  applies). */
export type TbShown = { cells: TbCell[]; border?: boolean; hidden?: boolean
	/** The revision table, newest LAST (at most the last 5); absent when hidden or the sheet was never issued. */
	revisions?: TbRev[]
	layout?: TbLayout }

/** A sheet's shown block: the cells in order — the logo images, logo text and company block are cells too (placed
 *  like fields; their sections' switches are applied in fillTitleBlock) — and the revisions. "Fields" off hides the
 *  ordinary fields but keeps the block's own items. */
export function shownTitleBlock(t: TitleBlockTemplate | undefined, cells: TbCell[], revs: TbRev[] = []): TbShown {
	const off = new Set(t?.hidden ?? [])
	return {
		cells: off.has('fields') ? cells.filter((c) => c.image || c.kind) : cells,
		border: !!t?.border,
		...(off.has('revisions') || !revs.length ? {} : { revisions: revs.slice(-5) }),
		...(t?.layout && t.layout !== 'vertical' ? { layout: t.layout } : {}),
	}
}

/** The default title block (projects with no template of their own). Its "J" logo text is a placeholder kept for the
 *  projects that already print it (dropping it would mark every issued sheet "Changed since"); a NEW project's
 *  settings get the same block without it (`domain/settings.ts`, W10). */
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
export type TbCell = { label: string; value: string; wide: boolean; /** a logo field: its image instead of label + value */ image?: TbLogo
	/** the logo text (big, bold `value`) or the company block (`lines`: name bold, then address / contact) */
	kind?: 'logoText' | 'company'; lines?: string[] }

/** The template's cells for one sheet; an empty value shows as '—'. A missing template → the default. A logo with no
 *  image, an empty logo text or company block, or a switched-off section shows nothing (and takes no room). */
export function fillTitleBlock(t: TitleBlockTemplate | undefined, ctx: TbContext): TbCell[] {
	const off = new Set(t?.hidden ?? [])
	return withLogoFields(t).flatMap((f): TbCell[] => {
		if (f.key === 'logo') {   // its image (no label printed)
			const img = f.logo && t?.logos?.[f.logo]
			return img?.src && !off.has('logo') ? [{ label: f.label, value: '', wide: !!f.wide, image: img }] : []
		}
		if (f.key === 'logoText') {
			const text = (t ? t.logo : DEFAULT_TITLE_BLOCK.logo)?.trim()
			return text && !off.has('logo') ? [{ label: f.label, value: text, wide: true, kind: 'logoText' }] : []
		}
		if (f.key === 'company') {
			const c = t?.company, lines = [c?.name, c?.address, c?.contact].map((s) => s?.trim() ?? '').filter(Boolean)
			return lines.length && !off.has('company') ? [{ label: f.label, value: '', wide: true, kind: 'company', lines }] : []
		}
		return [{ label: f.label || (f.key === 'custom' ? '' : TB_AUTO[f.key]), value: (f.key === 'custom' ? f.value : ctx[f.key])?.trim() || '—', wide: !!f.wide }]
	})
}

/** The template's fields with the block's own items in them (logo images, logo text, company): any not yet placed
 *  (templates from before they were fields) come first, in the old order — logos, logo text, company — so an old
 *  title block keeps its top-to-bottom order until one is dragged. */
export function withLogoFields(t: TitleBlockTemplate | undefined): TbField[] {
	const fields = t?.fields?.length ? t.fields : DEFAULT_TITLE_BLOCK.fields
	return [...FIXED.filter((x) => !fields.some((f) => sameItem(f, x))).map((x) => ({ ...x })), ...fields]
}

/** The projects page's Project details that the title block falls back on (as the Sheets tool did): the client and
 *  the site address as auto fields, the author for a blank Drawn, the drawing office's block when the template has
 *  none of its own. Not stored in cad — the shell hands them in. */
export interface ProjectDetails { client?: string; address?: string; author?: string; companyName?: string; companyAddress?: string; companyContact?: string
	/** The projects page's logos: the client's (`logoUrl`) and the company's, with their heights in paper mm. */
	logoUrl?: string; companyLogoUrl?: string; logoHeightMm?: number; companyLogoHeightMm?: number }

/** The template with the Project details filled in where it leaves them blank: the company block (when the template
 *  has no name, address or contact) and the site address. A blank template becomes the default one. */
export function withDetails(t: TitleBlockTemplate | undefined, d: ProjectDetails | undefined): TitleBlockTemplate | undefined {
	if (!d) return t
	const own = t?.company, blankCo = ![own?.name, own?.address, own?.contact].some((s) => s?.trim())
	const company = { name: d.companyName?.trim(), address: d.companyAddress?.trim(), contact: d.companyContact?.trim() }
	const useCo = blankCo && Object.values(company).some(Boolean), useSite = !t?.site?.trim() && !!d.address?.trim()
	// a logo the template has no image for comes from the Project details (Q68)
	const logo = (own: TbLogo | undefined, url: string | undefined, h: number | undefined): TbLogo | undefined => (!own?.src && url?.trim() ? { src: url.trim(), h: h && h > 0 ? h : own?.h } : undefined)
	const co = logo(t?.logos?.company, d.companyLogoUrl, d.companyLogoHeightMm), cl = logo(t?.logos?.client, d.logoUrl, d.logoHeightMm)
	if (!useCo && !useSite && !co && !cl) return t
	return { ...(t ?? DEFAULT_TITLE_BLOCK), ...(useCo ? { company } : {}), ...(useSite ? { site: d.address!.trim() } : {}),
		...(co || cl ? { logos: { ...t?.logos, ...(co ? { company: co } : {}), ...(cl ? { client: cl } : {}) } } : {}) }
}

/** What a blank Drawn shows: the Project details' author — a name or an email as initials, initials as typed — else
 *  `issuer` (who issued the sheet's latest revision). */
export function drawnFallback(author: string | undefined, issuer?: string): string {
	const a = author?.trim() ?? ''
	return (a && (/[\s@]/.test(a) ? initialsOf(a) : a)) || issuer?.trim() || ''
}

/** Initials for "Drawn": "Dana Morgan" → "DM"; an email → its local part's first 3 letters ("DMO"). */
export function initialsOf(nameOrEmail: string | null | undefined): string {
	const s = (nameOrEmail ?? '').trim(); if (!s) return ''
	if (s.includes('@')) return s.split('@')[0].replace(/[^a-z]/gi, '').slice(0, 3).toUpperCase()
	return s.split(/\s+/).map((w) => w[0]).join('').slice(0, 3).toUpperCase()
}
