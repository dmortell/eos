import type { PrintSettings } from './types'
import { paperDimsMm } from './types'

const STYLE_ID = 'dynamic-print-page-style'

/**
 * Inject comprehensive print CSS (called before window.print).
 * containerSelector: CSS selector for the canvas container element.
 */
export function updatePrintStyles(settings: PrintSettings, containerSelector: string): void {
	const dims = paperDimsMm(settings)
	const { w, h } = dims
	const orientation = settings.orientation

	let style = document.getElementById(STYLE_ID) as HTMLStyleElement | null
	if (!style) {
		style = document.createElement('style')
		style.id = STYLE_ID
		document.head.appendChild(style)
	}

	// Use explicit mm dimensions — more reliable than named sizes in Chrome
	style.textContent = `@page { size: ${w}mm ${h}mm; margin: 0; }
@media print {
  html, body { width: ${w}mm; height: ${h}mm; margin: 0; padding: 0; overflow: hidden; }
  .titlebar-area, .sidebar-area, .print-hidden, [data-no-print] { display: none !important; }
  .panzoom { background-image: none !important; }
  ${containerSelector} {
    width: ${w}mm !important; height: ${h}mm !important;
    position: fixed !important; top: 0; left: 0;
    overflow: visible !important; background: white !important;
  }
}`
}

/** Remove injected print styles */
export function removePrintStyles(): void {
	document.getElementById(STYLE_ID)?.remove()
}

/**
 * Execute a print with proper @page + layout CSS injection.
 * containerSelector: CSS selector for the canvas container (e.g. '.print-canvas-container')
 */
export function triggerPrint(settings: PrintSettings, containerSelector = '.print-canvas-container'): void {
	updatePrintStyles(settings, containerSelector)

	const cleanup = () => {
		removePrintStyles()
		window.removeEventListener('afterprint', cleanup)
	}
	window.addEventListener('afterprint', cleanup)

	requestAnimationFrame(() => window.print())
}
