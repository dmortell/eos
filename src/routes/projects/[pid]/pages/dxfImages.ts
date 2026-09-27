// O15: the BROWSER side of the DXF export's images — rasterise an image shape into a sidecar file (a PDF page via
// the shared page renderer, a picture fetched from its URL / interned data-URL), cropped + resampled to its
// placement (exportDxf imageCut), greyscale baked in; then zip the .dxf with its sidecars (jszip, already a
// dependency) and download. The heavy modules (PDF renderer, jszip) load on first use.
import type { Ent } from './ui/geometry'
import { imageSrc } from './imageStore'
import { imageCut, type DxfFile } from './exportDxf'

const KEEP = new Set(['image/png', 'image/jpeg'])   // formats every CAD app reads; anything else is re-encoded as PNG

/** The image shape's bytes for the DXF sidecar, or null if its source can't be read. */
export async function rasterForDxf(e: Ent): Promise<{ data: Uint8Array; ext: string; w: number; h: number } | null> {
	const src = e.src ?? ''
	let url = ''
	if (src.startsWith('pdf:')) {
		const { parsePdfSrc, renderPdfPage } = await import('./ui/render/pdfRaster.svelte')
		const p = parsePdfSrc(src); if (!p) return null
		url = (await renderPdfPage(p.fileId, p.page)).url
	} else url = imageSrc(src)
	if (!url) return null
	const blob = await (await fetch(url)).blob()
	const bmp = await createImageBitmap(blob)
	try {
		const cut = imageCut(e, bmp.width, bmp.height)
		if (cut.whole && !e.grey && KEEP.has(blob.type)) return { data: new Uint8Array(await blob.arrayBuffer()), ext: blob.type === 'image/png' ? 'png' : 'jpg', w: bmp.width, h: bmp.height }
		const cv = document.createElement('canvas')
		cv.width = cut.dw; cv.height = cut.dh
		const g = cv.getContext('2d'); if (!g) return null
		if (e.grey) g.filter = 'grayscale(1)'   // I7 — as the viewport shows it (no-op where canvas filters are unsupported)
		g.drawImage(bmp, cut.sx, cut.sy, cut.sw, cut.sh, 0, 0, cut.dw, cut.dh)
		const png = await new Promise<Blob | null>((res) => cv.toBlob(res, 'image/png'))
		return png ? { data: new Uint8Array(await png.arrayBuffer()), ext: 'png', w: cut.dw, h: cut.dh } : null
	} finally { bmp.close() }
}

/** The .dxf + its sidecar images as one ZIP (flat: the DXF references them by bare file name). */
export async function zipDxf(dxfName: string, text: string, files: DxfFile[]): Promise<Uint8Array> {
	const JSZip = (await import('jszip')).default
	const zip = new JSZip()
	zip.file(dxfName, text)
	for (const f of files) zip.file(f.name, f.data)
	return zip.generateAsync({ type: 'uint8array', compression: 'DEFLATE' })
}

/** Download bytes as a file. */
export function downloadBytes(data: Uint8Array | string, filename: string, type: string) {
	const url = URL.createObjectURL(new Blob([data as BlobPart], { type }))
	const a = document.createElement('a')
	a.href = url; a.download = filename; a.click()
	setTimeout(() => URL.revokeObjectURL(url), 1000)
}
