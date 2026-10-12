// SHEETS → PDF (Phase 4.3, Dave: the issued PDF is what goes out): each sheet's display list drawn with jspdf at true
// paper mm — vector lines and text, images (floorplans, logos) embedded. One code path for "PDF" and for issuing
// (4.6). Styles mirror Prims.svelte's classes. Screen-only things (the paper edge, the margin guide, hidden viewport
// frames, LOD that hides small text) follow the paper, not the screen.
//
// Fonts: jspdf's built-in fonts are Latin only. A few symbols are swapped for plain text (№ → No., … → ...); anything
// else outside Latin-1 (a Japanese address …) is drawn by the BROWSER's fonts as a ~300 dpi picture in its place
// (`rasterText`) — crisp on paper, not selectable. Embedding a CJK font instead would add 5–9 MB to every PDF; that's
// the upgrade if searchable Japanese text is ever needed. Without a rasteriser (tests) such text is reported.
import type { Prim, Bounds, Dash } from '../views/display'
import type { ProjectIndex } from '../domain/project'
import type { Sheet } from '../domain/drawing'
import { sheetDisplayList, paperSize, type SheetOpts } from '../views/sheet'
import { jsPDF, GState } from 'jspdf'

export interface PdfPage { w: number; h: number; prims: Prim[] }

/** Sheets as PDF pages: each its own paper size, drawn exactly as on screen (views/sheet.ts). */
export function sheetPages(ix: ProjectIndex, sheets: Sheet[], o: SheetOpts = {}): PdfPage[] {
	return sheets.map((s) => ({ ...paperSize(s), prims: sheetDisplayList(ix, s, o) }))
}
/** An image URL → a data URL jspdf can embed, with its natural size (null = skip it). */
export type ImageLoader = (url: string, kind: 'photo' | 'logo', gray?: boolean) => Promise<{ data: string; format: 'PNG' | 'JPEG'; w: number; h: number } | null>
/** Text the PDF's fonts can't show (Japanese …) drawn as a picture by the browser's fonts: a PNG and its size in mm,
 *  `ascent` = mm from the top of the picture to the baseline. */
export type TextRaster = (text: string, sizeMm: number, color: string, bold: boolean) => Promise<{ data: string; w: number; h: number; ascent: number } | null>

interface Style { stroke?: string; fill?: string; text?: string; width?: number; dash?: number[]; bold?: boolean; skip?: boolean; opacity?: number; /** the fill's own (else `opacity`) */ fillOpacity?: number }

const INK = '#334155'
/** Class → PDF style (later classes on a prim win). Widths in mm; hairlines are 0.15 mm. */
const STYLES: Record<string, Style> = {
	paper: { skip: true }, 'paper-margin': { skip: true }, 'viewport-hidden': { skip: true }, workplane: { skip: true }, draft: { skip: true },
	filled: { fill: '#e2e8f0' },
	'viewport-bg': { fill: '#ffffff', stroke: 'none' }, viewport: { stroke: '#64748b', width: 0.25, fill: 'none' },
	'viewport-label': { text: '#334155' },
	run: { stroke: '#0ea5e9', opacity: 0.55 }, 'run-high': { stroke: '#f97316', fill: '#f97316' }, centre: { opacity: 1 },
	'run-hit': { skip: true }, 'run-body': { stroke: '#0ea5e9', fill: '#0ea5e9', fillOpacity: 0.2, opacity: 1, width: 0.25 }, 'run-ceiling': { dash: [1.5, 1] }, 'run-primary': { width: 0.5, fillOpacity: 0.32 },
	wall: { stroke: '#475569', opacity: 0.8 }, riser: { stroke: '#be185d', fill: '#fce7f3' }, 'riser-label': { text: '#be185d' },
	rack: { stroke: '#1e293b', fill: 'none' }, 'rack-x': { stroke: '#94a3b8' }, 'rack-back': { stroke: '#1e293b', width: 0.6 }, 'rack-rails': { stroke: '#64748b', fill: 'none' },
	outlet: { stroke: '#1d4ed8', fill: '#3b82f6' }, 'outlet-high': { dash: [0.8, 0.5] },
	device: { stroke: '#334155', fill: '#cbd5e1' }, 'device-panel': { fill: '#e0f2fe' }, 'device-switch': { fill: '#dcfce7' },
	port: { stroke: '#94a3b8', fill: '#f8fafc' }, 'port-labelled': { fill: '#fef9c3' }, 'port-linked': { fill: '#e0f2fe', stroke: '#0284c7' }, 'port-patched': { stroke: '#16a34a' },
	'port-reserved': { fill: '#f5f3ff', stroke: '#8b5cf6' }, 'port-usage': { stroke: 'none', fillOpacity: 0.35 }, 'port-stale': { stroke: '#dc2626' }, 'port-mid': { stroke: '#334155' },
	'port-label': { text: '#0c4a6e' }, 'pdu-inlet': { stroke: '#7f1d1d', fill: '#dc2626' }, 'pdu-socket': { stroke: '#1f2937', fill: '#f8fafc' }, 'u-label': { text: '#94a3b8' }, 'u-clash': { text: '#dc2626', bold: true }, 'device-label': { text: '#1e293b', bold: true }, 'on-fill': { text: '#ffffff', bold: true }, 'cover-withdrawn': { text: '#b91c1c' }, 'on-ports-small': { text: '#0f172a', bold: true }, 'device-stale': { text: '#b91c1c' },
	cord: { width: 0.4, opacity: 0.85 }, 'cord-add': { dash: [1.5, 0.8] }, 'cord-replace': { dash: [2, 0.5, 0.5, 0.5, 0.5, 0.5] }, 'cord-remove': { dash: [0.5, 0.8], opacity: 0.5 },
	'device-other': { stroke: '#a1a1aa', dash: [1, 0.7], fill: 'none' }, 'device-other-label': { text: '#a1a1aa' },
	datum: { stroke: '#a1a1aa', dash: [1.5, 1] }, 'datum-ffl': { stroke: '#52525b', dash: [] }, 'datum-slab': { stroke: '#3f3f46', dash: [], width: 0.35 }, 'datum-label': { text: '#71717a' },
	'tb-frame': { stroke: '#64748b', fill: '#ffffff', width: 0.25 }, 'tb-rule': { stroke: '#cbd5e1' }, 'tb-border': { stroke: '#64748b', width: 0.25 },
	'tb-label': { text: '#94a3b8' }, 'tb-value': { text: '#1f2937', bold: true }, 'tb-logo': { text: '#1f2937', bold: true }, legend: { stroke: '#64748b', fill: '#ffffff', width: 0.25 }, 'legend-rule': { stroke: '#94a3b8' }, 'legend-title': { text: '#0f172a', bold: true }, 'legend-text': { text: '#1f2937' },
	'tb-company-name': { text: '#1f2937', bold: true }, 'tb-company': { text: '#475569' },
	label: { text: '#0f172a' },
	'section-line': { stroke: '#0f766e', width: 0.35, dash: [2, 0.8, 0.4, 0.8] }, 'section-arrow': { stroke: '#0f766e', fill: '#0f766e' }, 'section-label': { text: '#0f766e', bold: true },
	cut: { stroke: '#0f172a', fill: '#334155', width: 0.25 }, 'opening-pick': { skip: true },
	opening: { stroke: '#475569', width: 0.15 }, 'opening-swing': { stroke: '#475569', width: 0.13 }, 'rack-door': { stroke: '#475569', width: 0.13 }, 'opening-hole': { fill: '#ffffff', stroke: '#475569', width: 0.15 },
	'riser-slab': { fill: '#e7e5e4' }, 'riser-ffl': { stroke: '#57534e', width: 0.3 }, 'riser-ceiling': { stroke: '#a8a29e', width: 0.15, dash: [1.5, 1] },
	'riser-room': { stroke: '#2563eb', fill: '#eff6ff', width: 0.2 }, 'riser-eps': { stroke: '#0f766e', fill: '#f0fdfa', width: 0.2, dash: [1.2, 0.8] }, 'riser-shaft': { stroke: '#b45309', fill: '#fef3c7', width: 0.2 }, 'rv-label': { text: '#44403c' },
	backbone: { stroke: '#7c3aed', width: 0.35 }, 'backbone-none': { stroke: '#dc2626', width: 0.35, dash: [1.2, 1] }, 'backbone-label': { text: '#5b21b6' },
	note: { text: '#0f172a' }, 'note-bg': { stroke: 'none', fill: '#ffffff' }, 'shape-fill': { stroke: 'none' }, dim: { stroke: '#0f172a', width: 0.18 }, 'dim-tick': { width: 0.3 }, 'dim-text': { text: '#0f172a' }, leader: { stroke: '#0f172a', width: 0.2 }, 'leader-head': { fill: '#0f172a' }, ink: { fill: '#0f172a' }, 'image-frame': { skip: true }, 'line-tick': { width: 0.3 }, cloud: { stroke: '#dc2626', width: 0.3 },
}

/** Line types on paper (mm). */
const PDF_DASH: Record<Dash, number[]> = { dashed: [2, 1], dotted: [0.3, 0.8], dashdot: [3, 1, 0.3, 1] }

export function styleOf(cls: string): Style {
	return cls.split(/\s+/).reduce<Style>((s, c) => ({ ...s, ...STYLES[c] }), {})
}

/** Symbols the standard fonts lack → plain text; null when something else still can't be shown. */
const SWAP: Record<string, string> = { '№': 'No.', '…': '...', '↕': '', '→': '->', '←': '<-', '–': '-', '—': '-', '◆': '*', '⚠': '!', '×': 'x', '‘': "'", '’': "'", '“': '"', '”': '"' }
export function pdfText(t: string): { text: string; ok: boolean } {
	const out = [...t].map((ch) => SWAP[ch] ?? ch).join('')
	return { text: out, ok: [...out].every((ch) => ch.charCodeAt(0) <= 0xff) }
}

/** Which texts show on paper (the screen's LOD at roughly print resolution: 4 px per mm). */
const PAPER_K = 4
const shownOnPaper = (p: Prim) => p.k !== 'text' || ((p.minPx === undefined || p.size * PAPER_K >= p.minPx) && (p.maxPx === undefined || p.size * PAPER_K < p.maxPx))

const PT_PER_MM = 72 / 25.4

/** Draw pages into a new PDF. Returns the PDF and the texts that couldn't be shown (fonts). */
/** Monochrome: every line and text black; a fill light grey (paper and white stay white). */
const WHITE = /^(#fff(fff)?|white)$/i
function monoStyle(st: Style): Style {
	const ink = (c?: string) => (c && c !== 'none' ? '#000000' : c)
	return { ...st, stroke: ink(st.stroke), text: '#000000', ...(st.fill && st.fill !== 'none' && !WHITE.test(st.fill) ? { fill: '#d4d4d4' } : {}) }
}

export async function pagesToPdf(pages: PdfPage[], loadImage: ImageLoader, o: { compress?: boolean; rasterText?: TextRaster; /** all ink black, fills light grey, pictures grey (decision T121: cheap prints) */ mono?: boolean } = {}): Promise<{ pdf: jsPDF; unsupported: string[]; rasterised: string[] }> {
	const first = pages[0] ?? { w: 420, h: 297, prims: [] }
	const pdf = new jsPDF({ unit: 'mm', format: [first.w, first.h], orientation: first.w > first.h ? 'landscape' : 'portrait', compress: o.compress ?? true })
	const unsupported = new Set<string>(), rasterised = new Set<string>()
	const images = new Map<string, Awaited<ReturnType<ImageLoader>>>()
	const mono = !!o.mono
	const imgKey = (q: { url: string; gray?: boolean }) => (q.gray || mono ? `gray:${q.url}` : q.url)
	for (const p of pages) for (const q of p.prims) if (q.k === 'image' && !images.has(imgKey(q))) images.set(imgKey(q), await loadImage(q.url, q.fit ? 'logo' : 'photo', mono ? true : q.gray))
	// text the fonts can't show, drawn by the browser as pictures (one per distinct text / size / look)
	const rasters = new Map<string, Awaited<ReturnType<TextRaster>>>()
	const rasterKey = (p: Extract<Prim, { k: 'text' }>, st: Style) => `${p.text}|${p.size}|${st.text ?? ''}|${st.bold ? 1 : 0}`
	// the prim's own / layer color over its class style, as on screen: outline, text, a filled circle or outlet symbol
	const styleFor = (p: Exclude<Prim, { k: 'image' }>): Style => (mono ? monoStyle(colourStyle(p)) : colourStyle(p))
	const colourStyle = (p: Exclude<Prim, { k: 'image' }>): Style => {
		// a shape's own lineweight (mm, printed as set — backlog "True lineweights in print") and line type
		const st = { ...styleOf(p.cls), ...(p.weight ? { width: p.weight } : {}), ...(p.dash ? { dash: PDF_DASH[p.dash] } : {}) }
		if (!p.color) return st
		const fill = (p.k === 'circle' || (p.k === 'line' && (p.cls.startsWith('outlet') || p.cls.startsWith('run-body') || p.cls === 'note-bg' || p.cls === 'shape-fill' || p.cls === 'port-usage' || p.cls.endsWith(' ink')))) && p.fill
		return { ...st, ...(st.stroke !== 'none' ? { stroke: p.color } : {}), text: p.cls.includes('on-fill') ? st.text : p.color, ...(fill ? { fill: p.color } : {}) }
	}
	if (o.rasterText) for (const page of pages) for (const p of page.prims) {
		if (p.k !== 'text' || pdfText(p.text).ok || !shownOnPaper(p)) continue
		const st = styleFor(p), key = rasterKey(p, st)
		if (!rasters.has(key)) rasters.set(key, await o.rasterText(p.text, p.size, st.text ?? '#0f172a', !!st.bold))
	}

	pages.forEach((page, i) => {
		if (i > 0) pdf.addPage([page.w, page.h], page.w > page.h ? 'landscape' : 'portrait')
		let clip: Bounds | undefined, clipped = false
		const setClip = (b: Bounds | undefined) => {
			if (b === clip || (b && clip && b.x0 === clip.x0 && b.y0 === clip.y0 && b.x1 === clip.x1 && b.y1 === clip.y1)) return
			if (clipped) { pdf.restoreGraphicsState(); clipped = false }
			clip = b
			if (b) {
				pdf.saveGraphicsState(); clipped = true
				pdf.moveTo(b.x0, b.y0).lineTo(b.x1, b.y0).lineTo(b.x1, b.y1).lineTo(b.x0, b.y1).close()
				pdf.clip().discardPath()
			}
		}
		for (const p of page.prims) {
			if (!shownOnPaper(p)) continue
			const st = p.k === 'image' ? {} : styleFor(p)
			if (st.skip) continue
			setClip(p.clip)
			pdf.setGState(new GState({ opacity: st.fillOpacity ?? st.opacity ?? 1, 'stroke-opacity': st.opacity ?? 1 }))
			if (p.k === 'image') {
				const img = images.get(imgKey(p))
				if (!img) continue
				let { x, y, w, h } = p
				if (p.fit) { const s = Math.min(w / img.w, h / img.h); w = img.w * s; h = img.h * s; y = p.y + (p.h - h) / 2; if (p.fit === 'centre') x = p.x + (p.w - w) / 2 }
				pdf.setGState(new GState({ opacity: p.opacity ?? 1 }))
				pdf.addImage(img.data, img.format, x, y, w, h, undefined, 'FAST')
				continue
			}
			if (p.k === 'text') {
				const t = pdfText(p.text)
				if (!t.ok) {
					const r = rasters.get(rasterKey(p, st))
					if (!r) { unsupported.add(p.text); continue }
					const x = p.anchor === 'middle' ? p.at.x - r.w / 2 : p.anchor === 'end' ? p.at.x - r.w : p.at.x
					if (!p.rot) pdf.addImage(r.data, 'PNG', x, p.at.y - r.ascent, r.w, r.h, undefined, 'FAST')
					else {
						// turned text: jsPDF turns an image about its bottom-left corner, so put that corner where it lands when
						// the text turns about its own anchor (`rot` clockwise on paper, like pdf.text's angle −rot)
						const a = (p.rot * Math.PI) / 180, c = Math.cos(a), sn = Math.sin(a)
						const dx = x - p.at.x, dy = r.h - r.ascent   // the bottom-left corner from the anchor, unturned
						const bl = { x: p.at.x + dx * c - dy * sn, y: p.at.y + dx * sn + dy * c }
						pdf.addImage(r.data, 'PNG', bl.x, bl.y - r.h, r.w, r.h, undefined, 'FAST', -p.rot)
					}
					rasterised.add(p.text)
					continue
				}
				pdf.setFont('helvetica', st.bold ? 'bold' : 'normal')
				pdf.setFontSize(p.size * PT_PER_MM)
				pdf.setTextColor(st.text ?? '#0f172a')
				if (!p.rot) { pdf.text(t.text, p.at.x, p.at.y, { align: p.anchor === 'middle' ? 'center' : p.anchor === 'end' ? 'right' : 'left' }); continue }
				// turned text: jsPDF shifts x for `align` BEFORE turning, so a centred / right-aligned label lands off its
				// anchor; step back along the turned baseline ourselves and draw it left-aligned
				const back = p.anchor === 'middle' ? 0.5 : p.anchor === 'end' ? 1 : 0
				const a = (p.rot * Math.PI) / 180, wd = back ? pdf.getTextWidth(t.text) * back : 0
				pdf.text(t.text, p.at.x - wd * Math.cos(a), p.at.y - wd * Math.sin(a), { angle: -p.rot })
				continue
			}
			const stroke = st.stroke || INK
			pdf.setDrawColor(stroke === 'none' ? '#ffffff' : stroke)
			pdf.setLineDashPattern(st.dash ?? [], 0)
			if (p.k === 'circle') {
				pdf.setLineWidth(st.width ?? 0.15)
				const fill = p.fill ? st.fill ?? STYLES.filled.fill : undefined
				if (fill && fill !== 'none') pdf.setFillColor(fill)
				pdf.circle(p.c.x, p.c.y, p.r, fill && fill !== 'none' ? (stroke === 'none' ? 'F' : 'FD') : 'S')
				continue
			}
			// lines: a band at its real width (butt ends), else a hairline; closed + fill → a filled polygon
			pdf.setLineWidth(p.w ?? st.width ?? 0.15)
			pdf.setLineCap(p.w ? 'butt' : 'round')
			const [a, ...rest] = p.pts
			if (!a) continue
			pdf.moveTo(a.x, a.y)
			for (const q of rest) pdf.lineTo(q.x, q.y)
			if (p.closed) pdf.close()
			// holes (a ring of runs): more closed subpaths, filled even-odd so they stay clear
			const holes = p.closed ? p.holes ?? [] : []
			for (const [h, ...hr] of holes) { if (!h) continue; pdf.moveTo(h.x, h.y); for (const q of hr) pdf.lineTo(q.x, q.y); pdf.close() }
			const fill = p.closed && p.fill ? st.fill ?? STYLES.filled.fill : undefined
			if (fill && fill !== 'none') { pdf.setFillColor(fill); if (holes.length) { if (stroke === 'none') pdf.fillEvenOdd(); else pdf.fillStrokeEvenOdd() } else if (stroke === 'none') pdf.fill(); else pdf.fillStroke() }
			else pdf.stroke()
		}
		setClip(undefined)
	})
	return { pdf, unsupported: [...unsupported], rasterised: [...rasterised] }
}

/** The browser's text pictures: ~12 px per mm (≈ 300 dpi), the page's sans-serif (which has Japanese glyphs). */
export const browserTextRaster: TextRaster = async (text, sizeMm, color, bold) => {
	const PX = 12, px = Math.max(8, sizeMm * PX)
	const font = `${bold ? '600 ' : ''}${px}px ui-sans-serif, system-ui, "Hiragino Sans", "Yu Gothic", "Meiryo", sans-serif`
	const c = document.createElement('canvas'), g = c.getContext('2d')!
	g.font = font
	const m = g.measureText(text)
	const ascent = Math.ceil(m.actualBoundingBoxAscent || px * 0.88), descent = Math.ceil(m.actualBoundingBoxDescent || px * 0.22)
	c.width = Math.max(1, Math.ceil(m.width)); c.height = ascent + descent
	g.font = font; g.fillStyle = color; g.textBaseline = 'alphabetic'
	g.fillText(text, 0, ascent)
	const mm = sizeMm / px   // the font is `px` tall for `sizeMm` on paper
	return { data: c.toDataURL('image/png'), w: c.width * mm, h: c.height * mm, ascent: ascent * mm }
}

/** The browser's image loader: any URL (blob:, data:, file storage) → PNG / JPEG data through a canvas, so SVG logos
 *  and floorplan renders both embed. Floorplans go as JPEG (size), logos as PNG (transparency). */
export const browserImageLoader: ImageLoader = (url, kind, gray) => new Promise((resolve) => {
	const img = new Image()
	img.crossOrigin = 'anonymous'
	img.onload = () => {
		try {
			const c = document.createElement('canvas')
			c.width = img.naturalWidth || 1; c.height = img.naturalHeight || 1
			const g = c.getContext('2d')!
			if (kind === 'photo') { g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height) }
			if (gray) g.filter = 'grayscale(1)'   // the project's B/W floorplans
			g.drawImage(img, 0, 0)
			const format = kind === 'photo' ? 'JPEG' : 'PNG'
			resolve({ data: c.toDataURL(kind === 'photo' ? 'image/jpeg' : 'image/png', 0.85), format, w: c.width, h: c.height })
		} catch { resolve(null) }   // a cross-origin image without CORS can't be read back
	}
	img.onerror = () => resolve(null)
	img.src = url
})
