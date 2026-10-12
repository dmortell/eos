// LINKED SYMBOLS (backlog "Linked symbols"): an insert can point at a sheet or a web page. The link is stored on the
// insert itself (each marker has its own target, not the block). A badge shows on hover; a double-click opens it.
import type { Id } from './types'
import type { Sheet } from './drawing'

export type InsertLink = { kind: 'sheet'; sheetId: Id } | { kind: 'url'; url: string }

/** What a typed web address becomes, or null when it isn't one we open: http, https or mailto only (a `javascript:`
 *  or `data:` address would run code in the page that opens it). "example.com/x" gets https://. */
export function linkUrl(text: string): string | null {
	const t = text.trim()
	if (!t || /\s/.test(t)) return null
	const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(t)
	if (scheme && !/^(https?|mailto)$/i.test(scheme[1])) {
		// "host:8080/path" has a colon but is no scheme
		if (!/^[^/:]+:\d+(\/|$)/.test(t)) return null
	}
	const full = scheme && /^(https?|mailto)$/i.test(scheme[1]) ? t : `https://${t}`
	if (/^mailto:/i.test(full)) return full.length > 7 ? full : null
	try { const u = new URL(full); return u.hostname.includes('.') || u.hostname === 'localhost' ? u.href : null } catch { return null }
}

/** The badge's words: the sheet's number (and title), or the address without its scheme. */
export function linkLabel(link: InsertLink, sheetOf: (id: Id) => Sheet | undefined): string {
	if (link.kind === 'url') return link.url.replace(/^https?:\/\//i, '').replace(/\/$/, '')
	const s = sheetOf(link.sheetId)
	return s ? [s.number, s.title].filter(Boolean).join(' ') : '(sheet gone)'
}

/** Is the link still good (a sheet that was deleted is not)? */
export function linkLive(link: InsertLink, sheetOf: (id: Id) => Sheet | undefined): boolean {
	return link.kind === 'url' || !!sheetOf(link.sheetId)
}
