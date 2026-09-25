// K3 NOTES block: a markdown subset laid out in PAPER mm (the note shape is annotative — the renderer scales by the
// view's paper mm). Supports `#` / `##` / `###` headings, `-` / `*` bullets, `1.` numbered lists, `| tables |` (a
// `|---|` row is the header separator), `**bold**` lines, blank-line paragraph gaps; text wraps to the width by a
// monospace estimate (0.6 em per char, as textBox). Pure.

export type NoteItem =
	| { kind: 'text'; x: number; y: number; text: string; size: number; bold?: boolean; anchor?: 'start' | 'middle' }
	| { kind: 'line'; a: [number, number]; b: [number, number] }
export type NoteLayout = { items: NoteItem[]; h: number }

const CW = 0.6, LH = 1.35, PAD = 1.5   // char width / line height (× size); inner padding (mm)
const strip = (s: string) => s.replace(/\*\*(.+?)\*\*/g, '$1')
const isBold = (s: string) => /^\*\*.+\*\*$/.test(s.trim())

/** Words → lines no longer than `max` chars (a long word is cut). */
export function wrap(text: string, max: number): string[] {
	const m = Math.max(1, Math.floor(max)), out: string[] = []
	let cur = ''
	for (let w of text.split(/\s+/).filter(Boolean)) {
		while (w.length > m) { if (cur) { out.push(cur); cur = '' } out.push(w.slice(0, m)); w = w.slice(m) }
		if (!cur) cur = w
		else if (cur.length + 1 + w.length <= m) cur += ' ' + w
		else { out.push(cur); cur = w }
	}
	if (cur) out.push(cur)
	return out.length ? out : ['']
}

/** Lay out `md` in a box `width` mm wide; `size` = the body text height (mm). */
export function layoutNote(md: string, width: number, size: number): NoteLayout {
	const items: NoteItem[] = [], inner = Math.max(5, width - 2 * PAD)
	let y = PAD
	const para = (raw: string, s: number, indent: number, bold?: boolean, bullet?: string) => {
		const lines = wrap(strip(raw), (inner - indent) / (CW * s))
		lines.forEach((ln, i) => {
			y += s * (i ? LH : 1.05)
			if (i === 0 && bullet) items.push({ kind: 'text', x: PAD + indent - s * 1.3, y, text: bullet, size: s, bold })
			items.push({ kind: 'text', x: PAD + indent, y, text: ln, size: s, bold })
		})
		y += s * (LH - 1)
	}
	const src = md.replace(/\r/g, '').split('\n')
	for (let i = 0; i < src.length; i++) {
		const line = src[i], t = line.trim()
		if (!t) { y += size * 0.6; continue }
		const h = /^(#{1,3})\s+(.*)$/.exec(t)
		if (h) { const k = h[1].length; para(h[2], size * (k === 1 ? 1.6 : k === 2 ? 1.3 : 1.12), 0, true); y += size * 0.2; continue }
		const b = /^[-*]\s+(.*)$/.exec(t)
		if (b) { para(b[1], size, size * 2.2, isBold(b[1]), '•'); continue }
		const n = /^(\d+)[.)]\s+(.*)$/.exec(t)
		if (n) { para(n[2], size, size * 2.6, isBold(n[2]), n[1] + '.'); continue }
		if (t.startsWith('|')) {   // a TABLE: this and the following | rows
			const rows: string[][] = []; let header = false
			for (; i < src.length && src[i].trim().startsWith('|'); i++) {
				const cells = src[i].trim().replace(/^\||\|$/g, '').split('|').map((c) => strip(c.trim()))
				if (cells.every((c) => /^:?-{2,}:?$/.test(c))) { header = rows.length === 1; continue }
				rows.push(cells)
			}
			i--
			const cols = Math.max(...rows.map((r) => r.length)), cp = size * 0.5
			let ws = Array.from({ length: cols }, (_, c) => Math.max(...rows.map((r) => (r[c] ?? '').length), 1) * CW * size + 2 * cp)
			const tot = ws.reduce((a, b2) => a + b2, 0); if (tot > inner) ws = ws.map((w) => (w * inner) / tot)
			const rh = size * LH + cp, x0 = PAD, y0 = y + size * 0.3
			rows.forEach((r, ri) => {
				let x = x0
				r.forEach((cell, c) => {
					const maxc = Math.max(1, Math.floor((ws[c] - 2 * cp) / (CW * size)))
					items.push({ kind: 'text', x: x + cp, y: y0 + ri * rh + cp + size, text: cell.length > maxc ? cell.slice(0, Math.max(1, maxc - 1)) + '…' : cell, size, bold: header && ri === 0 })
					x += ws[c]
				})
			})
			const x1 = x0 + ws.reduce((a, b2) => a + b2, 0), y1 = y0 + rows.length * rh
			for (let ri = 0; ri <= rows.length; ri++) items.push({ kind: 'line', a: [x0, y0 + ri * rh], b: [x1, y0 + ri * rh] })
			let x = x0; for (let c = 0; c <= cols; c++) { items.push({ kind: 'line', a: [x, y0], b: [x, y1] }); x += ws[c] ?? 0 }
			y = y1 + size * 0.5
			continue
		}
		para(t, size, 0, isBold(t))
	}
	return { items, h: y + PAD }
}
