import type { PrintSettings } from './types'
import { paperDimsMm } from './types'

/**
 * Execute a print with proper @page CSS injection.
 * Returns a cleanup function (also auto-cleans on afterprint).
 */
export function triggerPrint(settings: PrintSettings): void {
	const dims = paperDimsMm(settings)
	const style = document.createElement('style')
	style.id = 'print-page-style'
	style.textContent = `@page { size: ${dims.w}mm ${dims.h}mm; margin: 0; }`
	document.head.appendChild(style)

	const cleanup = () => {
		style.remove()
		window.removeEventListener('afterprint', cleanup)
	}
	window.addEventListener('afterprint', cleanup)

	// Small delay to ensure styles are applied
	requestAnimationFrame(() => window.print())
}
