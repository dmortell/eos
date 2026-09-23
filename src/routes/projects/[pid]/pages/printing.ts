// Print (R9 commit 4, review.md §R9) — split out of +page.svelte verbatim. On Ctrl+P / window.print(), an
// @media-print stylesheet shows ONLY the focused sheet's paper at TRUE size: it hides all UI + the
// selection highlight and pins the paper to the page. @page size + orientation come from the focused tab's
// paper; the paper is `zoom`ed by (96/25.4)/PAPER_PX_PER_MM so its px size (= mm × PAPER_PX_PER_MM) prints
// at true mm — content and titleblock scale together (CSS `zoom`, so text stays vector).
//
// `savedSel`/`PRINT_ID` are module-level here (not a per-instance concern the way B17 is about — a browser
// can only run ONE print operation at a time, so this singular state matches the singular action). The
// paper size/orientation is a PARAMETER, not read via closure: +page.svelte still owns `session`/`paperOf`
// (which viewport is focused, what paper it's on) — this module only knows the print MECHANICS.
import { flushSync } from 'svelte'
import { PAPER_SIZES, PAPER_PX_PER_MM, type PaperSize } from './constants'
import { selStore } from './selStore.svelte'
import type { Selection } from './ui/selection'

export const PRINT_ID = 'pages-print-style'

export function printCss(paper: { size: PaperSize; landscape: boolean }): string {
	const [lw, lh] = PAPER_SIZES[paper.size]
	const [mw, mh] = paper.landscape ? [lw, lh] : [lh, lw]
	const zoom = (96 / 25.4) / PAPER_PX_PER_MM
	return `@page { size: ${mw}mm ${mh}mm; margin: 0; }
@media print {
	html, body { margin:0 !important; padding:0 !important; background:#fff !important; }
	.canvas-content { transform: none !important; }   /* fixed positions to the page, not a transformed ancestor */
	body * { visibility: hidden !important; }
	.print-target, .print-target * { visibility: visible !important; }
	.print-target { position: fixed !important; left:0 !important; top:0 !important; zoom:${zoom}; margin:0 !important; box-shadow:none !important; background:#fff !important; }
	.print-target .vp { border: none !important; box-shadow: none !important; }
	.print-target .vp-tag, .print-target .vp-badge, .print-target .margin-guide { display: none !important; }
}`
}

let savedSel: Record<string, Selection> | null = null

export function applyPrint(paper: { size: PaperSize; landscape: boolean }): void {
	savedSel = selStore.snapshotAll()
	selStore.replaceAll({})   // selection is screen-only; clear so no highlight prints
	const style = document.getElementById(PRINT_ID); if (style) style.textContent = printCss(paper)   // size for the focused paper
	const target = document.querySelector('.pane.focused .paper')
		?? document.querySelector('.pane.focused .vp')
	target?.classList.add('print-target')
	flushSync()   // apply the cleared selection to the DOM before the print snapshot
}

export function removePrint(): void {
	document.querySelectorAll('.print-target').forEach(el => el.classList.remove('print-target'))
	if (savedSel) { selStore.replaceAll(savedSel); savedSel = null }
}
