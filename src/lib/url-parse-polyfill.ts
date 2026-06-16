// Polyfill URL.parse for older Safari/WebKit (iPad/iOS before the 2024 update). Imported on the
// main thread AND inside the pdfjs web worker (a separate global that needs its own polyfill).
// pdfjs-dist calls the URL.parse() static method to validate/resolve URLs; without it, getDocument
// (main thread) and the worker's document parse throw "URL.parse is not a function" and no PDF
// renders. Chrome device-mode "iPad" uses the desktop engine (which has URL.parse), so it only
// failed on real hardware. Mirror the spec: return a URL on success or null on failure (never
// throw, unlike `new URL`).
if (typeof (URL as unknown as { parse?: unknown }).parse !== 'function') {
	;(URL as unknown as { parse: (u: string | URL, b?: string | URL | null) => URL | null }).parse = (
		url: string | URL,
		base?: string | URL | null,
	): URL | null => {
		try {
			return base === undefined || base === null ? new URL(url) : new URL(url, base)
		} catch {
			return null
		}
	}
}
