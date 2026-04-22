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

## Data Model Changes

### 1. `RackRow` — extend

File: [parts/types.ts](src/routes/projects/[pid]/racks/parts/types.ts)

```ts
export interface RackRow {
  id: string
  label: string
  // ── New: row-level defaults used for compatibility filtering & BOM rules ──
  heightU?: number                 // 45, 52 — homogeneous RU target for the row
  color?: string                   // 'Black' | 'White' | user-defined
  depthIn?: number                 // 30, 36 — nominal row depth (racks can override)
  containment?: 'none' | 'hac' | 'cac' | 'combined'
  // ── New: plan-view placement within the server room ──
  plan?: {
    originMm: { x: number; y: number }  // room-relative, mm
    rotationDeg: number                 // 0/90/180/270
    slotOrder: string[]                 // ordered rack + VCM IDs (interleaved or arbitrary)
  }
}
```

Rationale:
- Panduit forces `VCM - Rack - VCM - Rack - … - VCM` alternation; we store an **ordered list of IDs** instead so users can drag freely (we can validate "interleaved" in a lint badge).
- Room position lives on the row, not the rack, so moving a row is one drag.

### 2. `RackConfig` — extend

```ts
export interface RackConfig {
  // existing fields...
  sku?: string                          // catalog SKU, e.g. 'AR4P96'
  productRef?: string                   // catalog product doc id
  widthIn?: number                      // 20.3, 23.25 — authoritative US dims
  depthIn?: number
  color?: string
  containmentCapability?: {             // denormalized from catalog for offline BOM
    hacTopCap?: string                  // accessory SKU
    cacTopCap?: string
    adjustable?: boolean
    minDepthIn?: number
    maxDepthIn?: number
  }
  frameId?: string                      // link to frames/{pid} → frames[].id (optional)
}
```

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
  widthIn?: number
  depthIn?: number
  color?: string
  adjustable?: boolean
  minDepthIn?: number
  maxDepthIn?: number
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
  when: { ru?: number; color?: string; depthIn?: number; containment?: string }
  emit?: { sku: string; qty?: number; note?: string; group?: string }[]
  disable?: { containment?: string[]; reason: string }
}
```

### 4. Firestore collections

- `racks/{pid}_F{NN}_R{room}` — **existing**, augment `rows` shape, add `plan` data. No breaking changes (new fields are optional).
- `catalog/global/{productId}` — shared curated catalog (Panduit seed + any admin-curated products). Read-only to users.
- `catalog/projects/{pid}/{productId}` — project-scoped products (user-imported/custom). Writable per-project.
- `racks/{pid}_library` — **existing** device template library; unchanged, but we add a `CatalogProduct[]` source alongside `DeviceTemplate[]` for racks and VCMs.

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
Already reads from `racks/{pid}_F{NN}_R{room}` — rack records created in the row builder will appear automatically in the outlets rack palette. No changes required to [outlets/+page.svelte](src/routes/projects/[pid]/outlets/+page.svelte). Optional enhancement: in outlets, show rack SKU + plan-view position.

### Frames
Frames currently has no `rackId` link — frames and racks are both scoped to floor+room but not wired together.
- Add optional `rackId?: string` to `FrameConfig` ([frames/parts/types.ts:69](src/routes/projects/[pid]/frames/parts/types.ts#L69)).
- Add optional `frameId?: string` to `RackConfig` (above).
- In the racks tool, surface a "Frame: [picker]" field in rack properties; in frames, surface a "Rack: [picker]" field.
- When a rack is deleted, warn if a frame references it.

### Devices vs Panels
Current rack `devices[]` already models patch panels via `type: 'panel'` with `patchLevel` and `serverRoom`. Keep this — row builder doesn't modify devices.

---

## Milestones

### M1 — Plan viewport + row dimensions (no catalog, no BOM)
- Extend `RackRow` with `plan` + row defaults.
- `RackPlan.svelte` renders rows top-down using existing `widthMm` / `depthMm`.
- `VIEW_PLAN` bit wired into viewMask, toggleable alongside front/rear.
- Row drag-to-position in the plan viewport.
- Unit toggle, print-A3.
- **Ships value:** usable plan-view diagrams in drawing packages today.

### M2 — Catalog foundation
- `CatalogProduct` type + Firestore collections.
- Seed script importing Panduit racks/VCMs/accessories from the HTML.
- `CatalogBrowser` UI; "Add rack from catalog" flow populates `RackConfig.sku` + dimensions.
- User-defined custom products (per project).

### M3 — Row builder + compatibility
- `RowEditor` panel (RU/color/depth/containment/count).
- `compat.ts` with rule-driven filtering.
- Quick-fill + per-slot notes.
- Compatibility warnings on row setting change.

### M4 — BOM + Excel export
- `bom.ts` rule-driven generation.
- BOM panel in the racks tool (current row + project), export to Excel.
- Containment kit auto-add via `CatalogRule.emit`.

### M5 — Frame ↔ Rack linkage
- `rackId` ↔ `frameId` cross-reference in both tools.
- Picker UI in rack and frame properties.

### M6 — Room primitives (walls, entrances, CRAC, PDU, trays)
- New `RoomObject[]` collection in the racks doc.
- Drawing tools on the plan viewport (line/rect/symbol).
- Symbol library (doors, CRAC units, PDUs, cable trays).
- Hooks for outlets tool to share wall/door data (future).

---

## Open Questions

1. **Catalog scope** — one global shared catalog across projects vs. per-project only? Recommendation: global curated + per-project overrides/customs.
2. **Imperial vs metric** — internal canonical unit? Existing rack code is mm; Panduit catalog is inches. Recommendation: store both where given, compute missing; UI toggle is display-only.
3. **Row vs standalone racks** — keep the concept of racks not belonging to a Panduit-style row (e.g. a lone 2-post)? Yes — row is optional; standalone racks remain in a default "unassigned" row with no containment.
4. **Frame ↔ rack cardinality** — one frame per rack or multiple? Current data suggests 1:1 per room, but multi-frame-per-rack is plausible. Start 1:1, model as `frameId?: string` on rack.
5. **Drawing package output** — separate from M1 print, do we need a multi-page PDF export that stitches all rows/rooms? Potential M7.

---

## Files Touched Summary

**New**
- `parts/RackPlan.svelte`
- `parts/RowEditor.svelte`
- `parts/CatalogBrowser.svelte`
- `parts/compat.ts`
- `parts/bom.ts`
- `parts/catalog.ts`
- `scripts/seedPanduitCatalog.ts`

**Modified**
- `parts/types.ts` — extend `RackRow`, `RackConfig`
- `parts/RoomSelector.svelte` — expose `VIEW_PLAN` toggle
- `Racks.svelte` — mount `RackPlan` when `viewMask & VIEW_PLAN`, add BOM/Catalog sidebar tabs
- `frames/parts/types.ts` — add `rackId?` to `FrameConfig`

**Unchanged**
- `outlets/+page.svelte`, `outlets/Outlets.svelte` — continue to consume the racks doc as today.
