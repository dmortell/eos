# Row Builder & Plan View — Implementation Plan

## Goal

Bring the Panduit Open Frame Rack Containment Row Builder functionality into EOS:

1. **Row-based rack construction** with rack/VCM interleaving, color/depth/RU/containment settings, compatibility filtering, quick-fill, and per-slot notes.
2. **Plan view** of each row (and ultimately the full server room) for use in drawing packages.
3. **Multi-maker product catalog** (Panduit seed, user-defined and imported products).
4. **BOM generation** (per-row + whole-project, Excel export).
5. **Room drawing primitives** (walls, entrances, CRAC, PDU, trays) as a follow-up milestone.
6. **Linkage** between racks placed via this tool and the existing outlets/frames tools — one rack identity, many views.

---

## Architecture Decision: Extend the existing `racks` tool (not a new tool)

| Criterion | Extend `racks` | Separate tool |
|---|---|---|
| Single source of truth for rack records | ✅ already the owner | ❌ forces duplication or cross-collection joins |
| Outlets tool already subscribes to `racks/{pid}_F{NN}_R{room}` for `rackPlacements` | ✅ unchanged | Requires adapter or parallel collection |
| Elevation ↔ plan views on the same data | ✅ natural | Split across two tools, always risk of drift |
| Current `RackConfig.type` already includes `vcm` | ✅ reuse | Duplicate type system |
| Containment / BOM / catalog are orthogonal concerns | Adds scope to one tool | Clean split, but BOM still needs to read racks |
| Room walls / doors / CRAC units | Plan view becomes the foundation | Would need a third tool |

**Decision:** keep everything in `src/routes/projects/[pid]/racks/`, add a **plan viewport** alongside the existing front/rear elevation views (the `VIEW_PLAN = 0b0100` bit is already reserved in [types.ts:82](src/routes/projects/[pid]/racks/parts/types.ts#L82)), augment the existing `rows` model with the Panduit fields, and introduce a product catalog as a sibling concern.

The **racks tool becomes the server-room layout tool**. Elevation and plan are two projections of the same data. Outlets and frames keep consuming rack records the way they do today.

---

## Settled Decisions (for implementation)

1. **Homogeneous row defaults** — useful for initial row construction, but per-rack edits are allowed and the row is permitted to become heterogeneous. Surface this as an info badge, never as a block.
2. **Every rack belongs to a row** — even single-rack "rows". No standalone-rack concept.
3. **Canonical unit is millimeters.** Inch values from the Panduit catalog are converted to mm on import. Inch display is a UI toggle only.
4. **Frame ↔ rack is 0..1 : 0..1.** A rack may have zero or one frame; enforce 1:1 by filtering in pickers.
5. **Single global catalog** (`catalog/{productId}`), no per-project catalogs. Custom products write to the global catalog, tagged.
6. **Drawing package = multi-page PDF, one server room per page.** Lives in M7.
7. **Versioning adapter updates** are required for the new plan view — see the Versioning section below.

---

## Data Model Changes

### 1. `RackRow` — extend

File: [parts/types.ts](src/routes/projects/[pid]/racks/parts/types.ts)

```ts
export interface RackRow {
  id: string
  label: string
  // ── New: row-level defaults used only as starter values for new racks
  //    and as the baseline for compatibility filtering / BOM. Per-rack edits
  //    are allowed and the row loses homogeneity — this is expected.
  defaults?: {
    heightU?: number                 // 45, 52
    color?: string                   // 'Black' | 'White' | user-defined
    depthMm?: number                 // 762 (30"), 914 (36") — metric canonical
    containment?: 'none' | 'hac' | 'cac' | 'combined'
  }
  // ── New: plan-view placement within the server room, in mm ──
  plan?: {
    originMm: { x: number; y: number }  // room-relative
    rotationDeg: number                 // 0/90/180/270
    slotOrder: string[]                 // ordered rack + VCM IDs
  }
}
```

Rationale:
- Row defaults are starter values, not invariants. Per-rack edits are permitted; the row is allowed to become heterogeneous. A "row homogeneity" badge can surface mismatches without blocking edits.
- All dimensions in **mm** as the canonical unit (per project convention). Inches are a display-only toggle in the UI; catalog values that come in inches are converted at import.
- Every rack belongs to a row (even a single-rack row). No standalone-rack concept — simpler mental model.
- Panduit forces `VCM - Rack - VCM - Rack - … - VCM` alternation; we store an ordered list of IDs instead so users can drag freely. We can surface an "interleaved" lint badge.
- Room position lives on the row, not the rack, so moving a row is one drag.

### 2. `RackConfig` — extend

```ts
export interface RackConfig {
  // existing fields — widthMm / depthMm / heightMm stay canonical ...
  sku?: string                          // catalog SKU, e.g. 'AR4P96'
  productRef?: string                   // catalog product doc id (maker-sku slug)
  color?: string
  adjustable?: boolean                  // depth-adjustable frame
  minDepthMm?: number
  maxDepthMm?: number
  containmentCapability?: {             // denormalized from catalog for offline BOM
    hacTopCap?: string                  // accessory SKU
    cacTopCap?: string
    containmentKitBlack?: string
    containmentKitWhite?: string
  }
  frameId?: string                      // link to frames[].id (0 or 1 per rack)
}
```

All new physical dimensions remain mm-first. The catalog browser converts inch values from imported products into mm at import time so `RackConfig` is always metric.

### 3. New `CatalogProduct` type — rack, VCM, accessory

New file: `src/routes/projects/[pid]/racks/parts/catalog.ts`

```ts
export type ProductKind = 'rack' | 'vcm' | 'accessory' | 'device'
export interface CatalogProduct {
  id: string                            // maker-sku, slugified
  maker: string                         // 'Panduit' | 'Chatsworth' | user-defined
  sku: string
  kind: ProductKind
  family?: string                       // 'AR4P', 'PatchRunner 2'
  description: string
  ru?: number
  widthMm?: number                      // canonical metric
  depthMm?: number
  color?: string
  adjustable?: boolean
  minDepthMm?: number
  maxDepthMm?: number
  // Accessory relationships (SKU references)
  hacTopCap?: string
  cacTopCap?: string
  hacEndPanel?: string
  cacEndPanel?: string
  containmentKit?: { black?: string; white?: string }
  productUrl?: string
  tags?: string[]
  // Compatibility rule hints (optional free-form predicates evaluated at runtime)
  rules?: CatalogRule[]
}

export interface CatalogRule {
  id: string
  when: { ru?: number; color?: string; depthMm?: number; containment?: string }
  emit?: { sku: string; qty?: number; note?: string; group?: string }[]
  disable?: { containment?: string[]; reason: string }
}
```

### 4. Firestore collections

- `racks/{pid}_F{NN}_R{room}` — **existing**, augment `rows` shape, add `plan` data. No breaking changes — new fields are optional, and the versioning adapter validator ([src/lib/versioning/adapters/racks.ts](src/lib/versioning/adapters/racks.ts)) only checks for `racks` + `devices` arrays so historical snapshots still validate.
- `catalog/{productId}` — single global curated catalog (Panduit seed + admin-curated products across makers). Writable by admins, readable by all users. Custom products from any project are also stored here (flagged with `createdBy`/`tags: ['custom']`).
- `racks/{pid}_library` — **existing** device template library; unchanged.

---

## UI / Component Changes

### 5. Plan viewport (new)

- Add `VIEW_PLAN` to the elevation bitmask selector in [parts/RoomSelector.svelte](src/routes/projects/[pid]/racks/parts/RoomSelector.svelte). `VIEW_PLAN = 0b0100` is already reserved.
- New component: `parts/RackPlan.svelte` — renders a top-down view of the active row(s) with:
  - Rack/VCM rectangles scaled by `widthIn` × `depthIn`.
  - Containment end panels drawn at row ends (orange fill, Panduit convention).
  - Dimension arrows: base width, width-to-flat, width-to-hardware, row depth, VCM offset.
  - SKU labels as clickable hotspots (opens `productUrl` if present).
  - Unit toggle (in/mm) — reuse the rack tool's print scaling idea.
  - Draggable rows in room coordinates (snap to grid); drag handle on the row card.
- Same pan/zoom/print-A3 pipeline as `RackElevations`.

### 6. Row editor panel (new)

New component: `parts/RowEditor.svelte` — the card stack from the Panduit UI:
- Row name, RU, color, depth chips, containment dropdown (with disabled-reason hints).
- Rack count control; when changed, resizes `slotOrder` preserving existing assignments.
- Quick-fill selectors (all racks / all VCMs in the row).
- Grid of slot cards (VCM — Rack — VCM …) with filter input + select + note button per slot.
- Compatibility outlines (red border) for invalid selections.

Hosted in a collapsible section of the existing racks sidebar, or as a new sidebar tab alongside `racks | devices | library`.

### 7. Compatibility engine (new)

New file: `parts/compat.ts`

- `isRackCompatible(row, product)` / `isVCMCompatible(row, product)` — port the Panduit rules but drive them from `CatalogProduct.rules` + core fields so non-Panduit products can participate.
- `containmentRules(row)` — returns `{ disableCAC, disableHAC, reasons }`.
- `clearIncompatible(row)` — used when row settings change.

### 8. BOM engine (new)

New file: `parts/bom.ts`

- `computeRowBOM(row, racks, catalog)` — returns `{ sku, group, desc, qty, note, row, link }[]`.
- `generateProjectBOM(rows, racks, catalog)` — aggregates, dedupes by SKU.
- `exportBOMExcel(project)` — uses `xlsx` (already used by frames via [parts/exportExcel.ts](src/routes/projects/[pid]/frames/parts/exportExcel.ts)).
- Driven by `CatalogRule.emit` entries so Panduit's hardcoded "if rack is AR4P + HAC add AR4P-AC-KIT" is just data.

### 9. Catalog management UI (new)

New component: `parts/CatalogBrowser.svelte`

- Search + filter by maker, kind, family, RU, depth, color.
- "Add to row" action.
- Buttons: **Import JSON**, **Import from Panduit HTML** (one-time bootstrap from `Open_Frame_Rack_Containment_Row_Builder V2.html` — parse the embedded `CATALOG` object), **Add Custom Product**.

A separate seeding script: `scripts/seedPanduitCatalog.ts` populates `catalog/global` from the Panduit HTML on first run and on catalog updates.

---

## Linkage to Outlets & Frames

### Outlets
Already reads from `racks/{pid}_F{NN}_R{room}` — rack records created in the row builder will appear automatically in the outlets rack palette. No changes required to [outlets/+page.svelte](src/routes/projects/[pid]/outlets/+page.svelte). Optional enhancement: in outlets, show rack SKU + row-level plan position.

### Frames (1:1, optional)
Frames currently has no `rackId` link — frames and racks are both scoped to floor+room but not wired together. At most one frame per rack; many racks have zero frames.
- Add optional `rackId?: string` to `FrameConfig` ([frames/parts/types.ts:69](src/routes/projects/[pid]/frames/parts/types.ts#L69)).
- Add optional `frameId?: string` to `RackConfig` (above).
- In the racks tool, surface a "Frame: [picker]" field in rack properties; in frames, surface a "Rack: [picker]" field. Enforce 1:1 by filtering out already-linked frames/racks from the pickers.
- When a rack is deleted, unlink the frame (and warn). When a frame is deleted, clear `RackConfig.frameId`.

### Devices vs Panels
Current rack `devices[]` already models patch panels via `type: 'panel'` with `patchLevel` and `serverRoom`. Keep this — row builder doesn't modify devices.

---

## Versioning & Drawing System

File: [src/lib/versioning/adapters/racks.ts](src/lib/versioning/adapters/racks.ts) — needs updates:

1. **Add plan-view presets:**
   ```ts
   defaultViewPresets(): ViewPreset[] {
     return [
       { name: 'Front Elevation', layers: { front: true, rear: false, plan: false } },
       { name: 'Rear Elevation',  layers: { front: false, rear: true, plan: false } },
       { name: 'Plan View',        layers: { front: false, rear: false, plan: true } },
       { name: 'Elevations + Plan', layers: { front: true, rear: true, plan: true } },
     ]
   }
   ```
2. **Serializer** — already returns `{ rows, racks, devices, library, settings }`, which already covers the new fields (they're nested additions to existing arrays). No change needed.
3. **Validator** — stays permissive; no tightening required for backward compatibility.
4. **URL layer params** — `[pid]/racks/+page.svelte` parses `?front=1&rear=1` today; add `?plan=1` handling and thread into `initialViewMask` via a new `VIEW_PLAN` bit.
5. **Drawing title** — `findOrCreateDrawing` in [src/routes/projects/[pid]/racks/+page.svelte:101](src/routes/projects/[pid]/racks/+page.svelte#L101) uses `Rack Elevations ${fl}F Room ${rm}`. For plan view drawings, title as `Server Room Layout ${fl}F Room ${rm}` — auto-generated via a new drawing entry per view preset.

### Known print-preview issues (pre-existing, to fix)

- Only the **front** elevation currently fits within the A3 print page; rear is clipped.
- With **only Rear** selected, rear elevations render *below* the front-view walls / floor / ceiling reference lines (rear draws below, but the shared reference lines are still positioned for front geometry).
- With **Plan** view enabled, the plan area sits below elevations and is not accounted for by `setPrinting()` in [Racks.svelte:647-675](src/routes/projects/[pid]/racks/Racks.svelte#L647-L675) — print-zoom is computed from elevation bounds only.

Fix before or during M7: `setPrinting()` needs to compute content bounds from whichever views are active (front / rear / plan) and shift the reference lines to match the visible view(s).

### Multi-page PDF export (one server room per page)

New file: `src/lib/versioning/export.ts` extension (or new `src/routes/projects/[pid]/racks/parts/printMultiRoom.ts`).
- Given a project, enumerate `(floor, room)` pairs for which rack docs exist.
- For each, render the plan view into an A3 landscape frame (reuse the existing `setPrinting`/`clrPrinting` routines from [Racks.svelte:647-696](src/routes/projects/[pid]/racks/Racks.svelte#L647)).
- Insert page breaks per room; title block per page with floor + room label.
- Entry point: a "Export Drawing Package" button in the racks toolbar → produces a multi-page PDF via `window.print` with a dynamic DOM that mounts each `(floor, room)` in a `.page-break-after` container, or via a headless render loop.

Phase this into M7 (after M6 room primitives) since walls/doors need to render in the plan-view output.

---

## Milestones

### M1 — Plan viewport + row positioning (no catalog, no BOM)
- Extend `RackRow` with `plan` + `defaults`. Every rack belongs to a row (including single-rack rows — migrate any legacy unassigned racks into a default row on load).
- `RackPlan.svelte` renders rows top-down using existing `widthMm` / `depthMm`. All dimensions in mm; inches are a display-only toggle.
- `VIEW_PLAN = 0b0100` bit wired into viewMask, toggleable alongside front/rear.
- Row drag-to-position in the plan viewport (snap to grid).
- Versioning adapter: add plan-view preset + `?plan=1` URL layer.
- A3 print support for plan view.
- **Ships value:** usable plan-view diagrams in drawing packages today.

### M2 — Catalog foundation
- `CatalogProduct` type + single global `catalog/{productId}` collection. Inch→mm conversion at import.
- Seed script importing Panduit racks/VCMs/accessories from the HTML.
- `CatalogBrowser` UI; "Add rack from catalog" flow populates `RackConfig.sku` + dimensions (mm).
- "Add custom product" UI — writes back to the same global catalog with `createdBy` + project tag.

### M3 — Row builder + compatibility
- `RowEditor` panel (RU/color/depth/containment/rack count) editing `row.defaults`.
- `compat.ts` with rule-driven filtering — warn on per-rack edits that break row homogeneity but never block.
- Quick-fill + per-slot notes.
- Soft warnings on row setting change; per-rack overrides are tolerated.

### M4 — BOM + Excel export
- `bom.ts` rule-driven generation.
- BOM panel in the racks tool (current row + project), export to Excel (reuse `xlsx` from frames export).
- Containment kit auto-add via `CatalogRule.emit`.

### M5 — Frame ↔ Rack linkage (1:1, optional)
- `rackId` ↔ `frameId` cross-reference in both tools.
- Picker UI in rack and frame properties, filtering out already-linked peers.
- Cascade unlink on deletion.

### M6 — Room primitives (walls, entrances, CRAC, PDU, trays)
- New `RoomObject[]` array in the racks doc.
- Drawing tools on the plan viewport (line/rect/symbol).
- Symbol library (doors, CRAC units, PDUs, cable trays).
- Hooks for outlets tool to share wall/door data (future).

### M7 — Multi-page drawing package export
- "Export Drawing Package" button on the racks tool.
- One page per `(floor, room)` in a single PDF; A3 landscape, title block per page.
- Pulls plan view + elevation views per room; page breaks between rooms.
- Builds on M6 so room walls/doors are included in the plan output.

---

## Files Touched Summary

**New**
- `parts/RackPlan.svelte` (M1)
- `parts/catalog.ts` (M2)
- `parts/CatalogBrowser.svelte` (M2)
- `scripts/seedPanduitCatalog.ts` (M2)
- `parts/RowEditor.svelte` (M3)
- `parts/compat.ts` (M3)
- `parts/bom.ts` (M4)
- `parts/BOMPanel.svelte` (M4)
- `parts/RoomObjects.svelte` (M6)
- `parts/drawingPackage.ts` (M7)

**Modified**
- `parts/types.ts` — extend `RackRow` (defaults + plan), `RackConfig` (sku, color, containment fields, frameId), add `VIEW_PLAN`
- `parts/constants.ts` — document mm canonicalization; remove any inch defaults if present
- `parts/RoomSelector.svelte` — expose `VIEW_PLAN` toggle
- `Racks.svelte` — mount `RackPlan` when `viewMask & VIEW_PLAN`, add BOM/Catalog sidebar tabs, backfill legacy unassigned racks into a default row on load
- `+page.svelte` — parse `?plan=1` URL param into `initialViewMask`
- `src/lib/versioning/adapters/racks.ts` — add plan-view presets (Plan View, Elevations + Plan)
- `frames/parts/types.ts` — add `rackId?` to `FrameConfig`
- `frames/Frames.svelte` — rack picker UI in frame properties; unlink-on-delete

**Unchanged**
- `outlets/+page.svelte`, `outlets/Outlets.svelte` — continue to consume the racks doc as today.


Try it:
- Open Racks sidebar tab → Row Settings appears at the top.
- Pick 45 / Black / 30″ / Hot-Aisle (HAC) → if any rack in the row is R4P (fixed-depth, no HAC for some variants), you'll see an amber info box with the reasons.
- Add a few racks from the Catalog tab (Compatible filter is on by default) → they land already matching row defaults.
- Manually edit one rack's color to "White" in the PropertiesPanel → the RowEditor flashes the heterogeneous warning; "Apply row defaults to all" resets it.
- Quick-fill — pick a catalog rack → every rack in the row rewrites to that SKU.
- Enter per-rack notes → they're saved and visible when selecting that rack.