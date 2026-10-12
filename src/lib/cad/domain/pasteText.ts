// TEXT TO AND FROM OFFICE APPS (backlog "Text to and from office apps"): what Ctrl+V does with text copied in another
// app (Word, Excel, a browser) and what Ctrl+C leaves for them. Pure.
import type { Entity } from './types'

/** What a paste of foreign text becomes: a note, as markdown when it was a table. */
export interface PastedText { text: string; markdown: boolean }

const cell = (s: string) => s.replace(/\r?\n/g, ' ').replace(/\|/g, '\\|').trim()
/** Rows of cells → a markdown pipe table (the first row is the header). */
export function toMarkdownTable(rows: string[][]): string {
	const cols = Math.max(...rows.map((r) => r.length))
	const line = (r: string[]) => `| ${Array.from({ length: cols }, (_, c) => cell(r[c] ?? '')).join(' | ')} |`
	return [line(rows[0]), `|${' --- |'.repeat(cols)}`, ...rows.slice(1).map(line)].join('\n')
}

/** Tab-separated text (Excel / Sheets), with "quoted cells" that may hold tabs and newlines → rows. */
export function parseTsv(text: string): string[][] {
	const rows: string[][] = []
	let row: string[] = [], cur = '', quoted = false
	const s = text.replace(/\r\n?/g, '\n').replace(/\n+$/, '')
	for (let i = 0; i < s.length; i++) {
		const ch = s[i]
		if (quoted) {
			if (ch === '"' && s[i + 1] === '"') { cur += '"'; i++ } else if (ch === '"') quoted = false
			else cur += ch
		} else if (ch === '"' && !cur) quoted = true
		else if (ch === '\t') { row.push(cur); cur = '' }
		else if (ch === '\n') { row.push(cur); rows.push(row); row = []; cur = '' }
		else cur += ch
	}
	row.push(cur); rows.push(row)
	return rows
}

const ENT: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
const plain = (h: string) => h.replace(/<br\s*\/?>/gi, ' ').replace(/<[^>]*>/g, '').replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (m, e: string) => {
	if (e[0] === '#') { const n = e[1].toLowerCase() === 'x' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10); return Number.isFinite(n) ? String.fromCodePoint(n) : m }
	return ENT[e.toLowerCase()] ?? m
}).replace(/\s+/g, ' ').trim()
/** The first <table> of an HTML clipboard (Word, a web page, Excel) → rows of cells, or null. */
export function htmlTable(html: string): string[][] | null {
	const t = /<table[\s\S]*?<\/table>/i.exec(html)?.[0]
	if (!t) return null
	const rows = [...t.matchAll(/<tr[\s\S]*?<\/tr>/gi)].map((r) => [...r[0].matchAll(/<t[dh][^>]*>([\s\S]*?)<\/t[dh]>/gi)].map((c) => plain(c[1])))
	return rows.filter((r) => r.length).length ? rows.filter((r) => r.length) : null
}

/** The note that pasted text makes: an HTML table or tab-separated cells → a markdown table; anything else as typed. Null = empty. */
export function pastedNote(text: string, html = ''): PastedText | null {
	const rows = html ? htmlTable(html) : null
	if (rows && (rows.length > 1 || rows[0].length > 1)) return { text: toMarkdownTable(rows), markdown: true }
	const t = text.replace(/\r\n?/g, '\n').replace(/\s+$/, '')
	if (!t.trim()) return null
	if (t.includes('\t')) {
		const tsv = parseTsv(t)
		if (tsv.length > 0 && tsv.some((r) => r.length > 1)) return { text: toMarkdownTable(tsv), markdown: true }
	}
	return { text: t, markdown: false }
}

/** Ctrl+C: the words of the copied items, one per line (texts and callouts as typed, else a label / name), for other apps. */
export function readableClip(items: Entity[]): string {
	const out: string[] = []
	for (const e of items) {
		const x = e as unknown as Record<string, unknown> & { geom?: { kind?: string; text?: string } }
		const t = x.type === 'shape' ? (x.geom?.kind === 'text' || x.geom?.kind === 'leader' ? x.geom.text : (x.label as string | undefined)) : ((x.label ?? x.name) as string | undefined)
		if (typeof t === 'string' && t.trim()) out.push(t.trim())
	}
	return out.join('\n')
}
