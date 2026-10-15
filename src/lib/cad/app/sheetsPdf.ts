// "PDF" for one sheet or several (Phase 4.3): the sheets as the screen draws them, floorplans and logos embedded,
// downloaded as one file. Issuing (4.6) builds its package PDF the same way and uploads it instead.
import type { CadProject } from './project.svelte'
import type { Sheet } from '../domain/drawing'
import { sheetPages, pagesToPdf, browserTextRaster } from '../render/pdf'
import { fileSafe, saveFile, type FileParts } from '../render/download'
import { placeUnderlays, pictureLoader } from './issue'
import { panelPages } from '../views/panelSheets'
import type { Device } from '../domain/types'
import { projectPdfFont } from './pdfFonts'

export async function sheetsPdfBlob(project: CadProject, sheets: Sheet[], mono = false, title?: string): Promise<{ blob: Blob; pages: number; unsupported: string[]; rasterised: string[] }> {
	await placeUnderlays(project, sheets)   // a sheet not on screen may not have its floorplan rendered yet
	const pages = sheetPages(project.index, sheets, { underlay: project.pdf.placement, blocks: project.blockOf, ...project.sheetBase, cords: project.settings?.cordRoute, gray: !!project.settings?.grayFloorplans })
	const { pdf, unsupported, rasterised } = await pagesToPdf(pages, pictureLoader(project), { rasterText: browserTextRaster, mono, font: await projectPdfFont(project.settings) })
	if (title) pdf.setProperties({ title })   // a viewer's tab / window shows it
	return { blob: pdf.output('blob'), pages: pages.length, unsupported, rasterised }
}

/** A sheets PDF's own name and its parts for the project's file-name pattern (render/download.ts patternName). */
export function sheetsPdfName(project: CadProject, sheets: Sheet[], mono = false): { suggested: string; parts: FileParts } {
	const one = sheets.length === 1 ? sheets[0] : undefined
	const suggested = `${fileSafe(`${one ? `${one.number} ${one.title}` : `${project.name} sheets`}${mono ? ' (mono)' : ''}`)}.pdf`
	return { suggested, parts: one ? { what: `${one.number} ${one.title}${mono ? ' mono' : ''}`, revision: one.revisions?.at(-1)?.code } : { what: `Sheets${mono ? ' mono' : ''}` } }
}

export async function downloadSheetsPdf(project: CadProject, sheets: Sheet[], mono = false): Promise<{ pages: number; unsupported: string[]; rasterised: string[] } | null> {
	const r = await sheetsPdfBlob(project, sheets, mono)
	const { suggested, parts } = sheetsPdfName(project, sheets, mono)
	if (!await saveFile(r.blob, suggested, 'application/pdf', parts)) return null
	return { pages: r.pages, unsupported: r.unsupported, rasterised: r.rasterised }
}

/** A room's patch panels with their port labels as a PDF for the installer (views/panelSheets.ts). Returns the
 *  panels printed (to offer "Mark printed"). */
export async function downloadPanelSheets(project: CadProject, room: { id: string; name: string }): Promise<{ pages: number; panels: Device[]; unsupported: string[]; rasterised: string[] } | null> {
	const d = new Date(), date = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
	const { pages, panels } = panelPages(project.index, room.id, { title: `Panel labels — ${project.name} · ${room.name}`, date })
	if (!pages.length) return { pages: 0, panels, unsupported: [], rasterised: [] }
	const { pdf, unsupported, rasterised } = await pagesToPdf(pages, pictureLoader(project), { rasterText: browserTextRaster, font: await projectPdfFont(project.settings) })
	if (!await saveFile(pdf.output('blob'), `${fileSafe(`${project.name} ${room.name} panels`)}.pdf`, 'application/pdf', { what: 'Panel labels', scope: room.name })) return null
	return { pages: pages.length, panels, unsupported, rasterised }
}

/** A short note for the status line: texts drawn as pictures (Japanese …), and any that couldn't be drawn at all. */
export const unsupportedNote = (u: string[], rasterised: string[] = []) =>
	(rasterised.length ? ` · ${rasterised.length} Japanese text(s) drawn as pictures (not selectable)` : '') +
	(u.length ? ` · ${u.length} text(s) left out: ${u.slice(0, 3).join(', ')}${u.length > 3 ? '…' : ''}` : '')
