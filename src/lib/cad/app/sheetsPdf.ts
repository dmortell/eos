// "PDF" for one sheet or several (Phase 4.3): the sheets as the screen draws them, floorplans and logos embedded,
// downloaded as one file. Issuing (4.6) builds its package PDF the same way and uploads it instead.
import type { CadProject } from './project.svelte'
import type { Sheet } from '../domain/drawing'
import { sheetPages, pagesToPdf, browserImageLoader, browserTextRaster } from '../render/pdf'
import { download, fileSafe } from '../render/download'

export async function sheetsPdfBlob(project: CadProject, sheets: Sheet[]): Promise<{ blob: Blob; pages: number; unsupported: string[]; rasterised: string[] }> {
	const pages = sheetPages(project.index, sheets, { underlay: project.pdf.placement, blocks: project.blockOf, projectName: project.name, template: project.settings?.titleBlock })
	const { pdf, unsupported, rasterised } = await pagesToPdf(pages, browserImageLoader, { rasterText: browserTextRaster })
	return { blob: pdf.output('blob'), pages: pages.length, unsupported, rasterised }
}

export async function downloadSheetsPdf(project: CadProject, sheets: Sheet[]): Promise<{ pages: number; unsupported: string[]; rasterised: string[] }> {
	const r = await sheetsPdfBlob(project, sheets)
	const name = sheets.length === 1 ? `${sheets[0].number} ${sheets[0].title}` : `${project.name} sheets`
	download(r.blob, `${fileSafe(name)}.pdf`, 'application/pdf')
	return { pages: r.pages, unsupported: r.unsupported, rasterised: r.rasterised }
}

/** A short note for the status line: texts drawn as pictures (Japanese …), and any that couldn't be drawn at all. */
export const unsupportedNote = (u: string[], rasterised: string[] = []) =>
	(rasterised.length ? ` · ${rasterised.length} Japanese text(s) drawn as pictures (not selectable)` : '') +
	(u.length ? ` · ${u.length} text(s) left out: ${u.slice(0, 3).join(', ')}${u.length > 3 ? '…' : ''}` : '')
