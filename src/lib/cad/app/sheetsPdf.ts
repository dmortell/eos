// "PDF" for one sheet or several (Phase 4.3): the sheets as the screen draws them, floorplans and logos embedded,
// downloaded as one file. Issuing (4.6) builds its package PDF the same way and uploads it instead.
import type { CadProject } from './project.svelte'
import type { Sheet } from '../domain/drawing'
import { sheetPages, pagesToPdf, browserImageLoader } from '../render/pdf'
import { download, fileSafe } from '../render/download'

export async function sheetsPdfBlob(project: CadProject, sheets: Sheet[]): Promise<{ blob: Blob; pages: number; unsupported: string[] }> {
	const pages = sheetPages(project.index, sheets, { underlay: project.pdf.placement, blocks: project.blockOf, projectName: project.name, template: project.settings?.titleBlock })
	const { pdf, unsupported } = await pagesToPdf(pages, browserImageLoader)
	return { blob: pdf.output('blob'), pages: pages.length, unsupported }
}

export async function downloadSheetsPdf(project: CadProject, sheets: Sheet[]): Promise<{ pages: number; unsupported: string[] }> {
	const r = await sheetsPdfBlob(project, sheets)
	const name = sheets.length === 1 ? `${sheets[0].number} ${sheets[0].title}` : `${project.name} sheets`
	download(r.blob, `${fileSafe(name)}.pdf`, 'application/pdf')
	return { pages: r.pages, unsupported: r.unsupported }
}

/** A short note for the status line about texts the PDF couldn't show (fonts). */
export const unsupportedNote = (u: string[]) => (u.length ? ` · ${u.length} text(s) left out (no Japanese font in the PDF yet): ${u.slice(0, 3).join(', ')}${u.length > 3 ? '…' : ''}` : '')
