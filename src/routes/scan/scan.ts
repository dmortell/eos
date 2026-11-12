// Barcode walk-list helpers — pure, no DOM. See +page.svelte.

export type ScanItem = { label: string; value: string }

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

/** The value column as text, one row per line, blank rows kept — pastes into a sheet beside the labels. */
export function valueColumn(items: ScanItem[]): string {
	return items.map(i => i.value).join('\n')
}
