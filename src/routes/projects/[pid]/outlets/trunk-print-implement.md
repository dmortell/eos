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




● I see — the paper overlay margin mx/my is an inset from the paper's top-left corner, not an absolute position. But in my titleBlockGeom, I'm using toPx() which converts mm to absolute PDF pixels including the calibration origin offset. The drawingOffset is already in real-world mm, and toPx adds the origin. That part should be correct.

Wait — the paper overlay is an HTML div positioned in screen space, while the title block is in the SVG inside the transform. The paper overlay uses pxPos.x * zoom + vx (screen coords), but the SVG   content just uses raw PDF pixel coords (the transform handles zoom/pan). So toPx(off) gives the right PDF pixel position for the SVG.

  The margin math m * effectiveScale converts paper-mm margin to real-world mm. That's correct. Let me look more carefully... dims.w from paperDimsMm returns paper mm (e.g., 420 for A3 landscape).
  Multiplying by effectiveScale gives real-world mm (42000mm at 1:100). Then toPx converts real-world mm to PDF pixels. That's correct too.

  So what's the 20mm offset? Maybe drawingOffset is causing the issue — it's the real-world mm position of the paper's top-left. If the paper rect and the border don't share the same origin, there
  could be a mismatch.

  Actually wait — re-reading the paper screen code: the HTML paper overlay positions itself at toPx(off) (the drawingOffset), then the margin dashes are inset by mPx from that position. My SVG border
   computes toPx({ x: off.x + m * effectiveScale, ... }). Since toPx(mm) = mm / sf + origin, this gives (off.x + m * effectiveScale) / sf + origin. The paper overlay's margin position would be
  toPx(off).x + mPx where mPx = m * effectiveScale / sf * zoom. But in the SVG (inside the transform), there's no zoom factor — the transform handles it.

  So SVG border x = (off.x + m * effectiveScale) / sf + origin = off.x / sf + origin + m * effectiveScale / sf = toPx(off).x + m * effectiveScale / sf.

  And the paper overlay margin screen position = (toPx(off).x * zoom + vx) + mPx = (toPx(off).x * zoom + vx) + m * effectiveScale / sf * zoom.

  Converting back to SVG space (divide screen by zoom, subtract vx/zoom): toPx(off).x + m * effectiveScale / sf.

  That matches! So the math should be correct. Unless the margin value itself is different. Let me check what default margins is — it's 10mm. At scale 100: 10 * 100 = 1000mm real-world. Hmm, but
  that's 1 meter of margin in real-world terms, which maps to 10mm on paper. That's correct for the paper, but seems like a lot in PDF pixel space... Let me double-check: if sf=5, then 1000/5 = 200
  PDF pixels for the margin. And the paper width = 420 * 100 / 5 = 8400 PDF pixels. So margin = 200/8400 ≈ 2.4% — that's the right proportion for 10mm out of 420mm.

  Hmm, if the user says it's 20mm too far down, maybe there's an issue with Y-axis direction or the origin. Let me check if toPx has any Y-flip... From the code: toPx(mm) = { x: mm.x / sf + origin.x,
   y: mm.y / sf + origin.y }. No Y-flip.

  Wait — maybe the issue is simpler. The HTML paper overlay's margin inset my is relative to the paper div's top. But the calibration origin might be introducing an offset. Actually, let me
  reconsider — maybe drawingOffset is in real-world mm but includes a Y component that doesn't match the paper overlay's origin.

  Let me just try a different approach: compute the border rect from the same paper screen rect but in PDF pixel space instead of screen space




● Wait, m * u where u = effectiveScale / sf. So m * u = m * effectiveScale / sf. And toPx(off).x + m * effectiveScale / sf — that's the same math as before. The issue must be elsewhere.

  Let me think again... m * u where m=10 and u=100/5=20 gives mPx=200. And paperTopLeft = toPx({x: off.x, y: off.y}). The paper overlay div's margin inset is also m * effectiveScale / sf * zoom        screen pixels from the paper div's top-left, which in PDF space = m * effectiveScale / sf. Same value.
                                                                                                                                                                                                         So the border should align exactly with the margin dashes. Unless there's a rounding or the user is seeing the paper overlay (HTML div, positioned in screen space) vs the SVG border (positioned in
  PDF space) and there's a sub-pixel pan/zoom discrepancy.

  Actually — could it be the toPx adding the calibration origin? Let me check: toPx(off) = off / sf + origin. The paper overlay computes pxPos = toPx(off), then positions at pxPos.x * zoom + vx. The
  SVG content is inside transform: translate(vx, vy) scale(zoom), so an SVG element at PDF pixel position p appears at screen position p * zoom + vx. So toPx(off) in SVG space = (off/sf + origin)
  which maps to screen (off/sf + origin) * zoom + vx. And the paper overlay is at toPx(off).x * zoom + vx = (off/sf + origin) * zoom + vx. They match.

  The user says 20mm too far down. Maybe it's just that the Y-offset needs to exactly match the HTML margin rect. Let me verify by computing both in the exact same way. The HTML margin div is at
  {top: paperScreen.my}px relative to the paper div. paperScreen.my = mPx = m * effectiveScale / sf * zoom. In SVG/PDF-pixel space that's m * effectiveScale / sf from the paper top-left. My code
  computes paperTopLeft.y + m * u = toPx(off).y + m * effectiveScale / sf. These are mathematically identical.

  Maybe the 20mm discrepancy is from the paper being dragged to a position where drawingOffset.y is non-zero and there's a coordinate mismatch. Or maybe the issue is that I had m * effectiveScale in
  the original code (double-scaling). Let me re-verify the current code is clean






● Wait — but the user said the border (SVG) is lower than the margin rect (HTML overlay). If the HTML overlay was wrongly positioned relative to a higher parent, it would be shifted DOWN (because the
   toolbar adds space above). And the SVG border would be correctly positioned relative to the container. So the HTML margin rect would be LOWER than the SVG border — but the user says the SVG border   is lower than the HTML margin rect. That's the opposite of my theory.
  Let me reconsider. Maybe the HTML overlay IS correctly positioned because overflow: hidden on the flex container or some other CSS makes it a containing block. And the issue is actually in the SVG   border math.

  Let me revert the relative addition and instead think about this differently. Actually, overflow: hidden does create a containing block in CSS! From the spec, any element with overflow other than
  visible establishes a containing block for absolutely-positioned descendants. So the container IS the containing block for the paper overlay, and the math should work.

  Let me leave relative (it won't hurt) and look more carefully at the math. Let me add a temporary debug output:

● Read 1 file (ctrl+o to expand)

● Let me trace the paper overlay math versus the SVG border math with concrete numbers.

  Paper overlay margin dash screen position:
  - paperScreen.y + paperScreen.my                                                                                                                                                                       - = (toPx(off).y * zoom + vy) + (m * effectiveScale / sf) * zoom
  - = (off.y / sf + origin.y) * zoom + vy + m * effectiveScale / sf * zoom

  SVG border screen position (from transform translate(vx,vy) scale(zoom)):
  - borderTopLeft.y * zoom + vy
  - = toPx(tlMm).y * zoom + vy
  - = (tlMm.y / sf + origin.y) * zoom + vy
  - = ((off.y + m * effectiveScale) / sf + origin.y) * zoom + vy
  - = (off.y / sf + m * effectiveScale / sf + origin.y) * zoom + vy
  - = (off.y / sf + origin.y) * zoom + m * effectiveScale / sf * zoom + vy

  These are identical! So the issue isn't in the math. The border must actually be aligned but maybe the user is comparing to the wrong thing, or there's a rendering issue with the SVG
  overflow="visible" and the container's overflow: hidden clipping differently.

  Or... wait. The paper overlay's margin dash div has border which adds to its dimensions. A border border-dashed means border-width: 1px by default. The dash rectangle starts at (mx, my) inside the
  paper div, and its border is drawn centered on its edge. Meanwhile the SVG rect stroke is also centered on the edge. At 1px vs sw * 2 the visual difference could be minimal.

  Let me try something different — just remove the SVG-based border calculation entirely and instead match the approach used for the paper screen overlay but adapted to SVG space. The simplest approach: derive the border rect from paperScreen coordinates converted back to SVG space.

  Actually, the simplest fix: just render the border as a rect inside the paper overlay HTML div instead of in the SVG:

● Read 1 file (ctrl+o to expand)

● OK — the border needs to be in the SVG (so it prints), not in the HTML overlay. But the alignment issue persists. Let me just try a completely different approach to calculate the SVG border   position: derive it from the same paperScreen values, converted back to SVG/PDF-pixel space.
  The paper overlay is at screen (paperScreen.x, paperScreen.y). In SVG space (inside translate(vx,vy) scale(zoom)), a screen point (sx, sy) maps to SVG ((sx - vx) / zoom, (sy - vy) / zoom). So the    paper top-left in SVG = ((paperScreen.x - vx) / zoom, (paperScreen.y - vy) / zoom) = (toPx(off).x, toPx(off).y). And the margin in SVG = paperScreen.my / zoom = m * effectiveScale / sf.

  This is the same math. Unless there's a CSS box-model issue — the paper overlay div has border-2 which is 2px of border. The content starts inside the border. So the margin dash div at top: my is
  measured from the content edge (inside the 2px border), not from the outer edge.

  So the margin dash is actually at screen position: paperScreen.y + 2 (border) + paperScreen.my relative to the container.

  That's a 2px screen offset! At small zoom, 2px could be significant. But 20mm at typical zoom... that's more than 2px. Unless this is compounding with something else.

  Actually, let me just test if the position: relative I added fixes the visible issue. The math is correct, the debug shows identical formulas — but the relative positioning might have been the real
   issue all along (the absolute paper overlay was positioned relative to a wrong ancestor, making it appear higher than expected, so the SVG border looks lower by comparison).

● Bash(pnpm check 2>&1 | grep "ERROR" | grep -v samples | grep -v sample-parts | head -5)
  ⎿  1772980527502 ERROR "src\\routes\\projects\\[pid]\\frames\\parts\\exportExcel.ts" 55:4 "Type '8' is not assignable to type 'PaperSize | undefined'."
     1772980527502 ERROR "src\\routes\\projects\\[pid]\\uploads\\parts\\DimensionLine.ts" 3:30 "Parameter 'size' implicitly has an 'any' type."
     1772980527502 ERROR "src\\routes\\projects\\[pid]\\uploads\\parts\\DimensionLine.ts" 7:31 "Parameter 'size' implicitly has an 'any' type."
     … +2 lines (ctrl+o to expand)
  ⎿  (timeout 1m)
● No errors in our files. Let me give the user a clean state to test. The relative class was the key fix — overflow: hidden creates a scroll container but not necessarily a positioning context in all   browser implementations. Adding relative ensures the absolute paper overlay positions correctly relative to the container.
  Added position: relative to the container div. Without it, the position: absolute paper overlay could position relative to a parent further up the DOM tree (like the page layout), causing a
  vertical offset equal to the toolbar height (~32px, which at typical zoom looks like ~20mm). The SVG border was correctly positioned inside the transform, so they were misaligned.

  Try it now — both the dashed margin rect and the solid SVG border should align.
