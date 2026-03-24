# Survey Photo Album — Implementation Plan

## Status: Phase 1-6 Complete

Core survey tool + project linking + floorplan photo mapping + barcode scanning + photo annotations + export/sharing all built and working.

## Current File Structure

```
src/routes/survey/
├── +page.svelte              # Entry: view router, SvelteKit history, ?project= param
├── implement.md              # This plan
├── survey.svelte.ts          # Firestore CRUD + subscribeProjects/subscribeProjectSurveys/subscribeByShareToken
├── types.ts                  # Survey, SurveyPhoto (with pin/barcode/annotation fields), AnnotationData
├── export.ts                 # PDF and ZIP export utilities (jspdf, jszip)
├── parts/
│   ├── SurveyHome.svelte     # Survey list + create + project filter chips
│   ├── SurveyDetail.svelte   # Tabs: Photos | Floorplans, edit/delete/share/export PDF/ZIP
│   ├── SurveyDialog.svelte   # Shared create/edit dialog with project picker
│   ├── Camera.svelte         # Native camera via <input capture>
│   ├── PhotoEditor.svelte    # Post-capture: title, description, voice, barcode scan, upload
│   ├── PhotoView.svelte      # Full-screen viewer with swipe, edit, annotate, delete
│   ├── PhotoGrid.svelte      # Responsive thumbnail grid
│   ├── VoiceInput.svelte     # Input + mic button (Web Speech API, ja locale)
│   ├── FloorplanTab.svelte   # Upload/list/delete floorplans, tap to open FloorplanView
│   ├── FloorplanView.svelte  # Interactive floorplan with pan/zoom, photo pins, place mode
│   ├── FloorplanMinimap.svelte # Small floorplan thumbnail in PhotoView
│   ├── BarcodeScanner.svelte # html5-qrcode barcode/QR scanner overlay
│   ├── AnnotationOverlay.svelte # SVG drawing overlay (freehand, arrow, rect, text)
│   └── ShareDialog.svelte    # Public toggle + copy link
├── share/
│   ├── +layout@.svelte       # Layout reset (bypasses auth gate)
│   └── [token]/
│       ├── +page.server.ts   # Server-side load via firebase-admin (no auth required)
│       └── +page.svelte      # Public read-only album view
```

---

## Phase 2: Project Linking

### Goal
Link each survey to an EOS project so surveys appear in project context.

### Data Changes

Add to `Survey` interface:
```ts
projectId?: string    // projects collection doc ID (e.g. "acme-hqfit-4821")
projectName?: string  // denormalized for display without join
```

### UI Changes

**SurveyDialog.svelte** — Add optional project picker:
- Subscribe to `projects` collection via `db.subscribeMany('projects', ...)`
- `<Select>` dropdown showing project names, with "No project" option
- Selected projectId + projectName saved to survey doc
- Show project badge on survey cards in SurveyHome

**SurveyHome.svelte** — Filter by project:
- "All" | "My Projects" | specific project filter chips
- Group surveys by project when unfiltered

**Projects integration** — Add survey link to project tool list:
- In `src/routes/projects/[pid]/+page.svelte`, add a "Surveys" tool card
- Links to `/survey?project={pid}` (filtered view)
- Or later: move to `/projects/[pid]/survey/`

### Firestore Queries
- `subscribeSurveys` gains optional `projectId` filter
- `subscribeWhere('surveys', 'projectId', pid, ...)` for project-scoped views

---

## Phase 3: Floorplan Photo Mapping

### Goal
Pin photos to locations on floorplans. Tap a pin to see photos. See a minimap in photo viewer.

### Data Changes

Add to `SurveyPhoto`:
```ts
floorplanId?: string   // which floorplan this photo is pinned to
pinX?: number          // 0-1 normalized x position on floorplan
pinY?: number          // 0-1 normalized y position on floorplan
direction?: number     // 0-359 compass heading (degrees, 0=north)
```

### New Components

**`FloorplanView.svelte`** — Interactive floorplan with photo pins:
- Displays floorplan image (or PDF first page rendered via PdfState)
- Pan/zoom using the existing CSS transform pattern from racks/frames tools
- Photo pins rendered as SVG markers at `(pinX%, pinY%)` positions
- Each pin: colored dot with direction arrow, shows photo count badge if stacked
- **Tap a pin** → popup/drawer showing the photo(s) at that location
- **Tap empty space** → enters "place mode": shows bottom drawer with unplaced photos
- **Place mode**: select a photo from drawer, tap floorplan to set position
- Direction arrow: small wedge/cone icon showing camera direction

**`FloorplanMinimap.svelte`** — Small floorplan preview in PhotoView:
- Thumbnail of the floorplan (150×100px) in corner of PhotoView
- Red dot showing current photo's position
- Direction cone showing which way camera pointed
- Tap minimap → opens FloorplanView centered on that pin

**`PinPlaceDialog.svelte`** — Bottom drawer for placing photos:
- Shows horizontal scrollable list of photos not yet placed on any floorplan
- Photo thumbnails with title below
- Tap to select, then tap floorplan to place
- "Remove pin" option for already-placed photos

### Interaction Flow

1. **From FloorplanTab**: Tap a floorplan → opens FloorplanView
2. **FloorplanView**: See all pinned photos as markers on the plan
3. **Tap empty area** → bottom drawer slides up with unplaced photos
4. **Select photo + tap location** → pin placed, direction defaults to 0
5. **Tap existing pin** → photo popup, tap to open full PhotoView
6. **Long-press pin** → edit: drag to move, rotate dial for direction, remove
7. **In PhotoView**: minimap shows position, tap to jump to floorplan

### Direction Capture (Optional Enhancement)
- Use `DeviceOrientationEvent` to auto-capture compass heading when taking photo
- `window.addEventListener('deviceorientation', e => e.alpha)` gives compass bearing
- Requires HTTPS + user permission on iOS (`DeviceOrientationEvent.requestPermission()`)
- Fallback: manual direction picker (circular dial UI) in PinPlaceDialog

---

## Phase 4: Barcode/QR Scanning

### Package Required
`@AimScannerJs/barcode-reader` or `@AimScannerJs/barcode-reader` — **User to add: `pnpm add @AimScannerJs/barcode-reader`**
Alternative: `html5-qrcode` (simpler API, no wasm) — **`pnpm add html5-qrcode`**

### New Component

**`BarcodeScanner.svelte`** — Full-screen scanner overlay:
- Opens camera via `getUserMedia` with `facingMode: 'environment'`
- Scanning frame overlay (corner brackets like React sample)
- Continuous decode loop via library
- On detect: vibrate + return scanned text + auto-close
- Fallback: manual text entry if camera unavailable

### Integration Points

**PhotoEditor.svelte** — Add barcode button next to title field:
- Scan icon button → opens BarcodeScanner
- Scanned value auto-fills or appends to title/description
- Use case: scan rack serial → becomes photo title "Rack SN: ABC123"

**SurveyDetail header** — Quick scan button:
- Scan → creates a new photo entry pre-filled with scanned value as title
- Opens camera to capture the labeled item

### Data Changes

Add to `SurveyPhoto`:
```ts
barcode?: string   // scanned barcode/QR value
```

---

## Phase 5: Photo Annotation

### Package Required
Canvas drawing library — **`pnpm add perfect-freehand`** (lightweight stroke lib, ~3KB)
Or build custom SVG annotation layer (no dependency needed).

### New Component

**`AnnotationOverlay.svelte`** — Drawing overlay on photos/floorplans:
- SVG layer positioned over the image
- Tools: freehand draw, arrow, rectangle, text label, circle
- Color picker (red, blue, green, yellow, white)
- Stroke width: thin/medium/thick
- Undo/redo stack
- Save: serialize SVG paths to JSON, store in Firestore

### Data Changes

Add to `SurveyPhoto`:
```ts
annotations?: AnnotationData[]  // array of drawn shapes
```

```ts
interface AnnotationData {
  type: 'path' | 'arrow' | 'rect' | 'circle' | 'text'
  points?: number[][]     // for path/arrow
  bounds?: { x: number; y: number; w: number; h: number }  // for rect/circle
  text?: string           // for text labels
  color: string
  strokeWidth: number
}
```

### Integration
- PhotoView: "Annotate" button → enters annotation mode
- FloorplanView: "Annotate" button → mark up the floorplan itself
- Annotations render as SVG overlay on top of image/plan
- Toggle annotations on/off in viewer


Floorplan pin instructions:

FloorplanTab — Empty state now says "Upload a floorplan, then tap it to place photo pins on it". Below the floorplan list: "Tap a floorplan to open it, then use Place to pin photos".
FloorplanView — Place mode drawer text changed from "Select a photo to place" to "Select a photo below, then tap the floorplan" for clarity.

---

## Phase 6: Export & Reporting

### PDF Report Generation
- Package: `jspdf` + `html2canvas` or `pdfmake`
- Generate survey report with:
  - Cover page: survey name, date, project, surveyor
  - Floorplan pages with numbered pin markers
  - Photo pages: image + title + description + GPS + barcode + timestamp
  - Photos grouped by floorplan location
- Export as downloadable PDF

### ZIP Export
- Package: `jszip`
- Bundle all photos + floorplans + metadata JSON
- Structured folders: `photos/`, `floorplans/`, `metadata.json`

### Share Improvements
- QR code on share dialog (use `qrcode` package)
- Email share with preview image
- Improve the Share dialog for mobile

---

## Priority Order

| Phase | Effort | Impact | Priority |
|-------|--------|--------|----------|
| 2. Project linking | Small | High | **Do first** |
| 3. Floorplan photo mapping | Medium | Very high | **Do second** |
| 4. Barcode scanning | Small | High | **Do third** |
| 5. Photo annotation | Medium | Medium | Do fourth |
| 6. Export & reporting | Medium | High | Do fifth |

---

## Packages Summary

Packages to add (when implementing each phase):

| Phase | Package | Size | Purpose |
|-------|---------|------|---------|
| 4 | `html5-qrcode` | ~200KB | Barcode/QR scanning |
| 5 | `perfect-freehand` | ~3KB | Smooth freehand drawing strokes |
| 6 | `jspdf` | ~300KB | PDF report generation |
| 6 | `jszip` | ~100KB | ZIP export |
| 6 | `qrcode` | ~30KB | QR code on share dialog |

No packages needed for Phase 2 (project linking) or Phase 3 (floorplan mapping) — all built with existing tools + SVG.
