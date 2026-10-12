// MARKDOWN NOTES (backlog "Markdown notes block"): a text whose `markdown` flag is on is laid out as headings, bullet /
// numbered lists, **bold** / *italic* and pipe tables, word-wrapped to the note's width. The layout is pure (text in,
// positioned text runs and table rules out, in the text's own units, y down, first baseline at y = 0); markdownPrims
// turns it into display prims, so the screen, PDF and DXF all draw it the way they draw any other text and line.
import type { Pt } from '../domain/types'
import type { Prim } from './display'

export type MdItem =
	| { k: 'text'; x: number; y: number; text: string; size: number; bold?: boolean; italic?: boolean }
	| { k: 'rule'; x0: number; y0: number; x1: number; y1: number }
export interface MdLayout { items: MdItem[]; width: number; height: number; lines: number }

interface Run { text: string; bold?: boolean; italic?: boolean }

const LINE = 1.3
const HEADING = [1.6, 1.35, 1.2, 1.1, 1.05, 1]
/** About how wide text draws (Latin ~0.6 of its size, bold a little more, CJK a full em). */
export const mdWidth = (t: string, size: number, bold = false) => [...t].reduce((a, ch) => a + (ch.charCodeAt(0) >= 0x2e80 ? 1 : bold ? 0.66 : 0.6) * size, 0)

/** **bold**, *italic*, ***both***, __bold__ and `code` (shown plain) in one line → runs. */
export function parseInline(s: string): Run[] {
	const out: Run[] = []
	const re = /\*\*\*(.+?)\*\*\*|\*\*(.+?)\*\*|__(.+?)__|\*([^\s*](?:[^*]*?[^\s*])?)\*|`([^`]+)`/g
	let last = 0
	for (const m of s.matchAll(re)) {
		if (m.index > last) out.push({ text: s.slice(last, m.index) })
		if (m[1] != null) out.push({ text: m[1], bold: true, italic: true })
		else if (m[2] != null || m[3] != null) out.push({ text: (m[2] ?? m[3])!, bold: true })
		else if (m[4] != null) out.push({ text: m[4], italic: true })
		else out.push({ text: m[5]! })
		last = m.index + m[0].length
	}
	if (last < s.length) out.push({ text: s.slice(last) })
	return out.map((r) => ({ ...r, text: r.text.replace(/\\([\\*_`|#])/g, '$1') })).filter((r) => r.text)
}

interface Tok extends Run { w: number; space: boolean }
const tokens = (runs: Run[], size: number): Tok[] =>
	runs.flatMap((r) => (r.text.match(/[⺀-￿]|[^\s⺀-￿]+|\s+/g) ?? []).map((t): Tok => ({ ...r, text: t, w: mdWidth(t, size, r.bold), space: /^\s+$/.test(t) })))

/** Tokens broken into lines that fit `width` (none = one line per call): at spaces and between CJK characters. */
function flow(runs: Run[], size: number, width?: number): Tok[][] {
	const lines: Tok[][] = []
	let cur: Tok[] = [], w = 0
	for (const t of tokens(runs, size)) {
		if (width != null && !t.space && cur.some((c) => !c.space) && w + t.w > width) { while (cur.at(-1)?.space) cur.pop(); lines.push(cur); cur = []; w = 0 }
		if (t.space && !cur.length) continue   // no space opening a line
		cur.push(t); w += t.w
	}
	while (cur.at(-1)?.space) cur.pop()
	lines.push(cur)
	return lines
}
const lineWidth = (l: Tok[]) => l.reduce((a, t) => a + t.w, 0)

/** One flowed line as text items (adjacent tokens of one look joined), starting at x. */
function emit(l: Tok[], x: number, y: number, size: number, forceBold = false): MdItem[] {
	const out: MdItem[] = []
	for (const t of l) {
		const bold = forceBold || !!t.bold, prev = out.at(-1)
		if (prev?.k === 'text' && !!prev.bold === bold && !!prev.italic === !!t.italic) { prev.text += t.text; x += t.w; continue }
		out.push({ k: 'text', x, y, text: t.text, size, ...(bold ? { bold } : {}), ...(t.italic ? { italic: true } : {}) })
		x += t.w
	}
	return out
}

const splitRow = (line: string): string[] => {
	const cells: string[] = []
	let cur = ''
	const s = line.trim().replace(/^\|/, '')
	for (let i = 0; i < s.length; i++) {
		if (s[i] === '\\' && s[i + 1] === '|') { cur += '|'; i++ } else if (s[i] === '|') { cells.push(cur.trim()); cur = '' } else cur += s[i]
	}
	if (cur.trim() || !/\|\s*$/.test(line)) cells.push(cur.trim())
	return cells
}
const isRule = (cells: string[]) => cells.length > 0 && cells.every((c) => /^:?-+:?$/.test(c))
const isRow = (line: string) => /^\s*\|/.test(line)

/** A table's rows → items starting at the baseline y; returns the items and the y the next block starts at. */
function table(rows: string[][], aligns: ('l' | 'c' | 'r')[], header: boolean, size: number, width: number | undefined, y: number): { items: MdItem[]; y: number; w: number } {
	const cols = Math.max(...rows.map((r) => r.length)), padX = size * 0.4, padY = size * 0.3
	const runs = rows.map((r, ri) => Array.from({ length: cols }, (_, c) => parseInline(r[c] ?? '').map((x) => (header && ri === 0 ? { ...x, bold: true } : x))))
	const natural = Array.from({ length: cols }, (_, c) => Math.max(size, ...runs.map((r) => Math.max(...flow(r[c], size).map(lineWidth)))) + 2 * padX)
	const least = Array.from({ length: cols }, (_, c) => Math.max(size, ...runs.map((r) => Math.max(0, ...tokens(r[c], size).filter((t) => !t.space).map((t) => t.w)))) + 2 * padX)
	let colW = natural
	const total = natural.reduce((a, b) => a + b, 0)
	if (width != null && total > width) {
		const sl = least.reduce((a, b) => a + b, 0), room = Math.max(0, width - sl), want = total - sl
		colW = natural.map((n, c) => least[c] + (want > 0 ? ((n - least[c]) * room) / want : 0))
	}
	const xs = [0]
	colW.forEach((w) => xs.push(xs.at(-1)! + w))
	const items: MdItem[] = []
	const top = y - size * 0.85
	let rowTop = top
	const tops = [top]
	runs.forEach((r, ri) => {
		const flowed = r.map((cell, c) => flow(cell, size, colW[c] - 2 * padX))
		const n = Math.max(...flowed.map((f) => f.length))
		flowed.forEach((f, c) => f.forEach((l, li) => {
			const lw = lineWidth(l), x = aligns[c] === 'r' ? xs[c + 1] - padX - lw : aligns[c] === 'c' ? xs[c] + (colW[c] - lw) / 2 : xs[c] + padX
			items.push(...emit(l, x, rowTop + padY + size * 0.85 + li * size * LINE, size))
		}))
		rowTop += n * size * LINE + 2 * padY
		tops.push(rowTop)
		void ri
	})
	for (const t of tops) items.push({ k: 'rule', x0: 0, y0: t, x1: xs.at(-1)!, y1: t })
	for (const x of xs) items.push({ k: 'rule', x0: x, y0: top, x1: x, y1: rowTop })
	return { items, y: rowTop + size * 0.85 + padY, w: xs.at(-1)! }
}

/** The layout of markdown `src` at text `size`, wrapped to `width` (none = lines as typed, tables at their natural width). */
export function layoutMarkdown(src: string, size: number, width?: number): MdLayout {
	const lines = src.replace(/\r\n?/g, '\n').replace(/\s+$/, '').split('\n')
	const items: MdItem[] = []
	let y = 0, w = 0, count = 0
	const push = (is: MdItem[]) => { for (const i of is) { items.push(i); w = Math.max(w, i.k === 'text' ? i.x + mdWidth(i.text, i.size, i.bold) : Math.max(i.x0, i.x1)) } }
	for (let i = 0; i < lines.length; i++) {
		const line = lines[i]
		if (!line.trim()) { y += size * LINE * 0.5; continue }
		// a pipe table: rows that start with |, a --- row after the first making it the header
		if (isRow(line)) {
			const raw: string[][] = []
			while (i < lines.length && isRow(lines[i])) raw.push(splitRow(lines[i++]))
			i--
			const sep = raw.length > 1 && isRule(raw[1]) ? raw[1] : null
			const aligns = Array.from({ length: Math.max(...raw.map((r) => r.length)) }, (_, c) => { const s = sep?.[c] ?? ''; return (s.startsWith(':') && s.endsWith(':') ? 'c' : s.endsWith(':') ? 'r' : 'l') as 'l' | 'c' | 'r' })
			const rows = sep ? [raw[0], ...raw.slice(2)] : raw.filter((r) => !isRule(r))
			const t = table(rows, aligns, !!sep, size, width, y)
			push(t.items); y = t.y; count += rows.length
			continue
		}
		const h = /^(#{1,6})\s+(.*?)\s*#*\s*$/.exec(line)
		if (h) {
			const hs = size * HEADING[h[1].length - 1]
			for (const l of flow(parseInline(h[2]), hs, width)) { push(emit(l, 0, y, hs, true)); y += hs * LINE; count++ }
			continue
		}
		const li = /^(\s*)([-*+•]|\d+[.)])\s+(.*)$/.exec(line)
		if (li) {
			const ind = Math.floor(li[1].replace(/\t/g, '  ').length / 2) * size * 1.5, numbered = /\d/.test(li[2])
			const mark = numbered ? li[2] : '•', gap = Math.max(size * 1.5, mdWidth(mark, size) + size * 0.5)
			const fl = flow(parseInline(li[3]), size, width != null ? Math.max(size * 2, width - ind - gap) : undefined)
			fl.forEach((l, n) => {
				if (!n) push([{ k: 'text', x: ind, y, text: mark, size }])
				push(emit(l, ind + gap, y, size)); y += size * LINE; count++
			})
			continue
		}
		for (const l of flow(parseInline(line), size, width)) { push(emit(l, 0, y, size)); y += size * LINE; count++ }
	}
	return { items, width: w, height: Math.max(0, y - size * 0.85 + size * 0.3), lines: Math.max(1, count) }
}

/** The display prims of a markdown text at `g.at` (drawing units; `k` = drawing mm per paper mm). `box` is the width
 *  and line count to put a background behind (the note's own width, else what the layout needs). */
export function markdownPrims(g: { at: Pt; text: string; sizeMm: number; rot?: number; width?: number; align?: 'left' | 'centre' | 'right' }, k: number, src: string): { prims: Prim[]; w: number; lines: number } {
	const size = g.sizeMm * k, lay = layoutMarkdown(g.text, size, g.width), W = g.width ?? lay.width
	const r = ((g.rot ?? 0) * Math.PI) / 180, c = Math.cos(r), s = Math.sin(r), x0 = g.align === 'centre' ? -W / 2 : g.align === 'right' ? -W : 0
	const at = (x: number, y: number): Pt => ({ x: g.at.x + (x0 + x) * c - y * s, y: g.at.y + (x0 + x) * s + y * c })
	const prims = lay.items.map((i): Prim => i.k === 'rule'
		? { k: 'line', pts: [at(i.x0, i.y0), at(i.x1, i.y1)], cls: 'leader', src }
		: { k: 'text', at: at(i.x, i.y), text: i.text, size: i.size, ...(g.rot ? { rot: g.rot } : {}), cls: `note${i.bold ? ' note-b' : ''}${i.italic ? ' note-i' : ''}`, src })
	return { prims, w: W, lines: lay.lines }
}
