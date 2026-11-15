// Barcode walk-list helpers — pure, no DOM. See +page.svelte.

export type ScanItem = { label: string; value: string; photo?: boolean }

/** A scanned string as a MAC address (12 hex digits, upper case), or null when it is not one.
 *  Accepts the bare form (884F59CB74D9) and the usual separated forms (88:4F:…, 88-4F-…, 884F.59CB.74D9). */
export function parseMac(raw: string): string | null {
	const s = raw.trim()
	const ok =
		/^[0-9a-f]{12}$/i.test(s) ||
		/^([0-9a-f]{2}[:-]){5}[0-9a-f]{2}$/i.test(s) ||
		/^([0-9a-f]{4}\.){2}[0-9a-f]{4}$/i.test(s)
	return ok ? s.replace(/[^0-9a-f]/gi, '').toUpperCase() : null
}

export type Read = { rawValue: string; cornerPoints?: readonly { x: number; y: number }[] }

/** The MAC addresses read in one frame, top line of the label first, however the label is turned.
 *  A 1D barcode has no "up", only a reading direction (corner 0 → 1, along the label's text line);
 *  the label's down is that direction turned 90° clockwise (screen y points down).
 *  Cisco labels with a WLAN MAC print the wired MAC above it, so the first one is the wired MAC. */
export function macsInOrder(reads: readonly Read[]): string[] {
	const macs = reads
		.map(r => ({ mac: parseMac(r.rawValue), p: r.cornerPoints }))
		.filter((m): m is { mac: string; p: Read['cornerPoints'] } => !!m.mac)
	const c = macs.find(m => m.p && m.p.length >= 2)?.p
	const down = c ? { x: -(c[1].y - c[0].y), y: c[1].x - c[0].x } : { x: 0, y: 1 }
	const depth = (p: Read['cornerPoints']) =>
		p?.length ? p.reduce((s, q) => s + q.x * down.x + q.y * down.y, 0) / p.length : 0
	const ordered = macs.map(m => ({ mac: m.mac, d: depth(m.p) })).sort((a, b) => a.d - b.d).map(m => m.mac)
	return [...new Set(ordered)]
}

/** Labels from pasted text: one per line (a spreadsheet column), blanks dropped. */
export function parseLabels(text: string): string[] {
	return text.split(/\r?\n/).map(l => l.trim()).filter(Boolean)
}

/** The first row without a value at or after `from`, wrapping round; -1 when every row is filled. */
export function nextEmpty(items: ScanItem[], from: number): number {
	for (let k = 0; k < items.length; k++) {
		const i = (from + k) % items.length
		if (!items[i].value) return i
	}
	return -1
}

/** The whole list as CSV (label, MAC), with a header row. */
export function toCsv(items: ScanItem[]): string {
	const q = (s: string) => /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
	return ['Label,MAC', ...items.map(i => `${q(i.label)},${q(i.value)}`)].join('\r\n') + '\r\n'
}

/** The value column as text, one row per line, blank rows kept — pastes into a sheet beside the labels. */
export function valueColumn(items: ScanItem[]): string {
	return items.map(i => i.value).join('\n')
}
