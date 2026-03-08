# Print Preview Implementation Plan

## Overview
Add print preview to the outlets canvas — paper underlay, size/orientation controls, pan-to-align, and proper CSS `@page` setup. Reference: `inv2026-06/src/lib/cad/parts/CadCanvas.svelte`.

---

## 1. Paper Underlay Rect

- Render a white `<rect>` at the bottom of the SVG (before floorplan) representing the physical paper
- Paper dimensions in mm (converted to px via calibration):
  - **A3**: 420 × 297 (landscape) / 297 × 420 (portrait)
  - **A4**: 297 × 210 (landscape) / 210 × 297 (portrait)
- Default margins: 10mm all sides (configurable later)
- Inner margin rect shown as thin dashed line
- Paper rect has white fill + light gray border

## 2. State & Storage

```typescript
interface PrintSettings {
  paperSize: 'A3' | 'A4'
  orientation: 'landscape' | 'portrait'
  drawingOffset: Point      // mm — how far drawing is shifted relative to paper origin
  scale: number             // drawing scale ratio denominator (100 = 1:100)
  showPaper: boolean        // toggle paper underlay visibility
  margins: number           // mm, uniform
}
```

- **Persist in Firestore** on the floor's OutletsData (shared by all users)
- Default: A3 landscape, scale 100 (1:100), offset {0,0}, margins 10

## 3. Toolbar Controls

Add **Preview** button in toolbar top-right, beside existing **View** button. Clicking opens a dropdown/popover:

```
[Paper: A3 ▾] [Landscape | Portrait]
[Scale: 1:100 ▾] [Fit]
[⎙ Print]
```

- **Paper size** dropdown: A3, A4
- **Orientation** toggle buttons
- **Scale** dropdown: 1:50, 1:100, 1:200, Fit to page
- **Print button** triggers print flow

## 4. Drawing Alignment (Option C — Pan-to-Align)

When paper is visible (`showPaper = true`):
- Paper rect is rendered at a **fixed position** in the SVG coordinate space
- The existing pan/zoom moves the drawing as usual — the user pans until the floorplan sits where they want on the paper
- A **"Set Position"** button captures the current pan offset as `drawingOffset` and saves to Firestore
- On load, `drawingOffset` restores the pan so the drawing is positioned on the paper as last saved
- No new drag handlers needed — reuses existing pan behavior entirely

Paper position in SVG: fixed at the calibration origin (0, 0) in mm coords, rendered via `toPx()`. The drawing naturally moves around it when panning.

## 5. Legend Position Fix

Current issue: legend position drifts when zooming because it's stored in screen-relative coords.

Fix:
- Store `legendPos` in **mm** (real-world coordinates), same as outlets/trunks
- Convert to px only at render time via `toPx()`
- Drag updates convert px delta back to mm delta
- This makes legend position zoom-independent and printable at correct location

## 6. Scale Options

The "scale" controls how the calibrated drawing maps to paper mm:

| Option | Meaning |
|--------|---------|
| **Fit to page** | Auto-compute scale so drawing extents fit within margins |
| **1:50** | 1mm on paper = 50mm real world |
| **1:100** | 1mm on paper = 100mm real world |
| **1:200** | 1mm on paper = 200mm real world |

Implementation:
- `paperScale = 1 / ratio` (e.g., 1:100 → paperScale = 0.01)
- At print time, the SVG viewBox is set so that paper mm map 1:1 to physical page mm
- Drawing content is scaled by `paperScale` within that viewBox
- "Fit" calculates: `min((paperW - 2*margin) / drawingExtentW, (paperH - 2*margin) / drawingExtentH)`

## 7. Print Event Handlers

### `beforeprint` (window event)
1. Set `printing = true`
2. Inject dynamic `<style>` with `@page { size: ${paperSize} ${orientation}; margin: 0; }`
3. Set SVG `viewBox` to paper dimensions in mm (so 1 SVG unit = 1mm on paper)
4. Apply drawing transform: `translate(drawingOffset) scale(paperScale)`
5. Hide: toolbar, sidebar, status bar, titlebar, properties panel, grid, paper outline, node handles, selection highlights

### `afterprint` (window event)
1. Set `printing = false`
2. Remove injected `<style>` element
3. Restore original SVG viewBox and transform
4. Re-show all hidden UI elements

Both attached via `$effect` with cleanup:
```typescript
$effect(() => {
  const onBefore = () => { /* ... */ }
  const onAfter = () => { /* ... */ }
  window.addEventListener('beforeprint', onBefore)
  window.addEventListener('afterprint', onAfter)
  return () => {
    window.removeEventListener('beforeprint', onBefore)
    window.removeEventListener('afterprint', onAfter)
  }
})
```

## 8. CSS Print Styles

```css
@media print {
  /* Hide all UI chrome */
  .toolbar, .sidebar, .statusbar, .titlebar,
  .properties-panel, [data-no-print] { display: none !important; }

  /* Canvas fills the page */
  .canvas-container {
    position: fixed !important; inset: 0;
    width: 100vw !important; height: 100vh !important;
    overflow: visible !important;
  }

  /* Remove background grid */
  .panzoom { background-image: none !important; }
}
```

The dynamic `@page` rule (injected in beforeprint) handles paper size/orientation.

## 9. Implementation Order

1. **PrintSettings type** + add to OutletsData, Firestore persistence
2. **Legend fix** — change to mm-based coords
3. **Paper rect rendering** — white rect + margin rect in SVG
4. **Toolbar Preview button + dropdown** — paper size, orientation, scale controls
5. **Pan-to-align** — "Set Position" captures drawingOffset
6. **Scale transform** — apply paperScale to drawing group
7. **Print event handlers** — beforeprint/afterprint with viewBox swap
8. **CSS print styles** — hide UI, remove grid

## Files to Modify

| File | Changes |
|------|---------|
| `parts/types.ts` | `PrintSettings` interface, add to `OutletsData` |
| `OutletCanvas.svelte` | Paper rect, Preview toolbar button/dropdown, print handlers, CSS |
| `Outlets.svelte` | Persist PrintSettings to Firestore, pass as prop |



How to align drawing with paper:
  The way it works now with Option C:
  1. Click Preview in the toolbar — the paper rect appears at the calibration origin (0,0 in mm space)
  2. The paper's drawingOffset defaults to {x: 0, y: 0} — meaning the paper's top-left corner sits at the mm origin
  3. Pan the canvas (right-click drag or middle-click drag, as usual) to move the drawing around until your floorplan sits where you want it on the paper
  4. The paper stays fixed in mm-world space while you pan — so you're effectively sliding the drawing over the paper

  However — I realize there's a problem with my current approach. The paper is rendered via toPx() which means it moves with the drawing when you pan (since toPx maps mm→page pixels, and the whole
  page moves with pan). The paper needs to stay screen-fixed while the drawing pans.

  Actually, let me reconsider. The drawingOffset in the print settings defines where the paper sits in the mm coordinate system. So instead of panning the drawing over a fixed paper, you just set the
   drawingOffset to position the paper over your drawing area. The simplest approach: the paper position is the drawingOffset and you change it in the Preview dropdown (or we could add a "Set to
  current view" button that computes the offset from the current pan position).

  Let me add a "Set to View" button that captures the current visible area center as the paper offset




  1. PrintToolbar colors — Changed all purple (bg-purple-100, text-purple-700, bg-purple-600) to blue/slate (bg-blue-100, text-blue-700, bg-blue-600).

  2. Legend fix — Now uses real-world mm coordinates:
  - legendPos is interpreted as mm coordinates (was screen pixels)
  - Position computed via toPx() like outlets and trunks
  - All dimensions use / sf (scaleFactor) instead of / zoom
  - Legend has fixed mm size: 60mm × 34mm, with 2.8mm font
  - Drag converts screen pixel deltas to mm deltas via calibration.scaleFactor
  - Zooming in/out now correctly keeps legend in place and scales it with the drawing

  3. Drawing-to-paper alignment:
  - Click Preview → paper rect appears at the drawing origin
  - Pan the drawing (right-click drag) until your floorplan is positioned where you want it on the paper
  - Click "Align to View" in the Preview dropdown — this captures the current viewport's top-left corner position and sets it as the paper's drawingOffset, snapping the paper to match your current view
  - The offset is saved to Firestore so all users see the same alignment
  - Change paper size, orientation, or scale and re-align as needed


  ● But wait — the paper size changes with zoom (because of * zoom in paperScreenRect). That's wrong for a screen-fixed paper. The paper screen size should also be fixed. Actually no — the paper
  represents a real-world area, so when you zoom in on the drawing, the paper should also get bigger (it covers more screen pixels). That's correct.

  But there's a subtler issue: when the user zooms, the paper size changes but position stays fixed, so it'll misalign. Let me handle zoom by scaling the paper size but keeping the anchor point.

  Actually, let me simplify the whole approach:

  The paper rect tracks a fixed screen position and a fixed screen size. Both only update on "Align to View" or when paper settings change. Zoom changes should scale the paper proportionally around its anchor.

  Let me simplify — store the paper anchor in container-relative fractional position rather than pixels, so it's zoom-independent:

  Actually, this is getting too complicated. Let me use the simplest possible approach: the paper is always centered in the container. No positioning complexity. The user pans the drawing to position it under the centered paper. "Align to View" is not needed — the paper is always centered.




  Legend fix: Position is now mm-based via toPx(legendPos) — stays anchored to the same spot on the drawing when you zoom. Sizes still use / zoom so text remains readable at any zoom level. Drag converts screen pixel deltas to mm.

  Paper overlay: Now renders as an HTML div outside the pan/zoom transform, always centered in the container. It stays fixed on screen while you pan the drawing underneath it. The blue outline shows what area will be printed.

  Workflow to align drawing to paper:
  1. Click Preview — blue paper outline appears centered on screen
  2. Pan the drawing (right-click drag) — the drawing moves under the fixed paper frame
  3. Position your floorplan area inside the paper outline
  4. Click "Align to View" — saves the current alignment to Firestore so it persists
  5. Click Print — triggers window.print() with correct @page size


  CadCanvas.svelte uses this:

```ts
	// Print viewBox: maps world coordinates to paper area when printing
	printViewBox = $derived.by(() => {
		if (!this.printing) return ''
		const { width, height } = this.paperDimensions
		return `0 0 ${width * this.paperScale} ${height * this.paperScale}`
	})

	private savedView: { x: number; y: number; zoom: number } | null = null
	setPrinting = (): void => {
		this.savedView = { x: this.x, y: this.y, zoom: this.zoom }
		this.printing = true
		// Set zoom so scale(zoom/paperScale) = scale(1) for 1:1 world-to-viewBox mapping
		this.x = 0
		this.y = 0
		this.zoom = this.paperScale
		this.updatePrintStyles()
	}

	clrPrinting = (): void => {
		this.printing = false
		if (this.savedView) { this.x = this.savedView.x; this.y = this.savedView.y; this.zoom = this.savedView.zoom; this.savedView = null }
	}

	private updatePrintStyles(): void {
		const id = 'dynamic-print-page-style'
		let style = document.getElementById(id) as HTMLStyleElement
		if (!style) { style = document.createElement('style'); style.id = id; document.head.appendChild(style) }
		const { width, height } = this.paperDimensions
		const orientation = this.landscape ? 'landscape' : 'portrait'
		style.textContent = `@page { size: ${this.paperSize} ${orientation}; margin: 0; }
      @media print { html, body { width:${width}mm; height:${height}mm; margin:0; padding:0; overflow:hidden; }
      .cad-view { height:${height}mm !important; width:${width}mm !important; }
      .ruler,.toolbar,.statusbar,.sidebar,.gui,[data-no-print] { display:none !important; }
      #canvas { width:${width}mm !important; height:${height}mm !important; position:fixed; top:0; left:0; }
    }`
	}
```



  $lib/ui/print/print-handler.ts — Rewrote to inject comprehensive print CSS following the CadCanvas pattern:
  - updatePrintStyles() injects @page { size: A3 landscape; margin: 0 } plus @media print rules that set html, body to exact mm dimensions, hide UI chrome (.titlebar-area, .sidebar-area,
  .print-hidden, [data-no-print]), and size the container element to exact paper mm with position: fixed; top: 0; left: 0
  - removePrintStyles() cleans up the injected style
  - triggerPrint() now calls updatePrintStyles() before printing

  OutletCanvas.svelte — Fixed the beforeprint/afterprint handlers:
  - Added getPaperScale() — computes calibration.scaleFactor / effectiveScale, which is the zoom level where 1 PDF pixel maps to the correct mm on paper
  - beforeprint: injects full print CSS via updatePrintStyles(), sets zoom = paperScale and positions vx/vy so drawingOffset maps to container origin (0,0)
  - afterprint: removes injected styles via removePrintStyles(), restores saved view
  - Toolbar now has data-no-print attribute for reliable hiding
  - Removed redundant static print CSS (container sizing) — now handled by dynamic injection
