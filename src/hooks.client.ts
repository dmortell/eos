// Polyfill URL.parse for older Safari/WebKit (notably iPad/iOS before the 2024 update).
// pdfjs-dist calls the URL.parse() static method to validate the document URL and resolve the
// cMap/font base URLs inside getDocument(); without it, getDocument throws
// "URL.parse is not a function" and no PDF renders (uploads, sheets, outlets, …). Chrome's
// device-mode "iPad" uses the desktop engine, which has URL.parse — so it only fails on a real iPad.
//
// Mirror the spec: return a URL on success or null on failure (never throw), unlike `new URL`,
// which throws on invalid input.
if (typeof (URL as unknown as { parse?: unknown }).parse !== 'function') {
	;(URL as unknown as { parse: (u: string | URL, b?: string | URL) => URL | null }).parse = (
		url: string | URL,
		base?: string | URL,
	): URL | null => {
		try {
			return base === undefined || base === null ? new URL(url) : new URL(url, base)
		} catch {
			return null
		}
	}
}
