# Elevations Tool — Unification Plan (Racks + Frames + Patching)

**Goal:** replace the Racks / Frames / Patching trio with one tool at
`/projects/[pid]/elevations` that supports the natural workflow without route switches:

1. **Row view** — racks in a row; add racks, drag devices/panels in.
2. **Rack focus** — zoom into one rack; detailed edits, readable port labels, port allocation.
3. **Patching** — select one or two racks and patch port-to-port; live patch list below.

This is the rack-side half of `ux-plan.md` taken to its conclusion: instead of three view
modes that each mount a different legacy tool, one canvas with one renderer and one data
pipeline, where zoom level and mode determine what is visible and editable.

---

## 1. Why the current split fails (findings)

### 1.1 Three renderers for the same rack

| Aspect | Racks | Frames | Patching |
|---|---|---|---|
| Tech | divs + SVG `RackFrame` | divs + CSS grid | plain divs |
| Units | **mm × SCALE(0.5)**, 1U = 45mm | rows per RU (1.75rem) | raw px, 1U = 30px |
| Rack width | real `widthMm` | full-width card | fixed 416px for all |
| Faces | front + rear + plan | front/rear toggle | front only (`face:'front'` hardcoded) |
| Ports | none (dead code) | 24-col grid, full labels | 14×12px cells, dots |
| Room chrome | slab/floor/ceiling/walls | none | none |
| PDU/VCM | rendered | **filtered out (broken)** | **filtered out (broken)** |

The same physical rack looks like three different objects. Racks' `RackElevationRenderer`
is the only mm-accurate one and is already exported as `$lib/rack` with a `readonly` mode
— it is the correct base (this is ux-plan item #4, "the load-bearing extract").

### 1.2 One data pipeline, three drifting copies

`deriveFramesFromRacks` (racks doc → FrameConfig for label allocation) exists **three times**:
`frames/Frames.svelte:70`, `frames/parts/engine.ts:435` (canonical), and
`patching/parts/elevationUtils.ts:134` — and they have already drifted (the patching copy
skips face filtering and includes PDUs). `PORT_TYPE_COLORS` in patching is a hand-copied hex
re-encoding of Frames' `LOC_TYPE_COLORS`. Three code paths can disagree about port labels today.

### 1.3 Confirmed cross-tool bugs (why the patch list felt wrong)

These get fixed in Phase 0 regardless of the new tool:

1. **Patching honours reservations wrongly** — `elevationUtils.ts:199` does
   `new Map(Object.entries(portReservations))` but `portReservations` is an **array**;
   the engine expects `Map<"frameId:ru:row:col", LocType>`. Every lookup misses, so any
   project using block-assign shows **different labels in Patching than in Frames**.
2. **Cord-ID Excel import reads column 12 (Cable Type)**; Cord ID is column 14
   (`patching/parts/exportExcel.ts:70`). Import also maps row `#` onto the *unsorted*
   connections array while export renumbers after status-grouping → IDs land on wrong cords.
3. **Backspace in patch-list inputs deletes the selected cord** — global key handler with no
   input-focus guard (`ElevationView.svelte:464`).
4. **Drawings viewports read `framesDoc.serverRoomCount`** which is no longer saved →
   labels for rooms B–D silently dropped in FrameDetail/Patching viewports.
5. Bulk add doesn't clamp `portIndex > portCount` and reuses occupied ports mid-range.
6. Sidebar BOM counts soft-deleted (`remove`) cords.
7. `PortCell` floor-prefix-strip regex only matches the `'01'` floor format (no-op for default `L01`).
8. `nextReservationId` resets to 1 on mount → collides with persisted reservation IDs.
9. Selecting a `remove`-status row in the patch list shows nothing in the elevation
   (filtered out before selection resolution).

---

## 2. Decisions (recommended)

**D1 — One renderer, mm-accurate, with a port layer.**
Extend `RackElevationRenderer` (mm × SCALE) with an optional **ports layer** rendered inside
panel devices, driven by the Frames engine's `buildPortInfoMap`. Frames' `FrameDrawing` and
Patching's `ElevationRack/ElevationPort` are retired. At real scale a 24-port row gives
~9px cells at zoom 1 and ~37px at zoom 4 — readable exactly when you zoom in, which is the
whole interaction model. (Frames' exaggerated drawing survives only as the print/export path,
where fixed-scale full labels are wanted — per ux-plan "print is a deliverable".)

**D2 — One mode enum, not tool×tab.**
`mode: 'select' | 'place' | 'patch'` (+ future `'reserve'`). Outlets' two-axis
`activeTool × sidebarTab` gating is the documented anti-pattern; the sidebar *follows* the
mode, never gates it.

**D3 — No schema changes for v1.**
Keep `racks/{pid}_F{NN}_R{room}`, `patching/{pid}_F{NN}_R{room}`, `frames/{pid}_F{NN}` and the
existing types (`RackConfig`, `DeviceConfig`, `PatchConnection`, `PortRef`). The tool
subscribes to all three; unification happens in the derived layer, not in Firestore.
Migration risk ≈ zero; old tools keep working during the transition.

**D4 — Frames labels stay canonical; PortRef stays structural.**
Patching keeps identifying ports by `{rackId, deviceId, portIndex, face}` (survives relabeling,
supports click-to-patch); labels are always resolved live through one shared
`buildPortInfoMap`. Port-level gate stays: unlabeled ports are dimmed and unpatchable.

**D5 — Frames' *location/zone data entry* is a panel, not a casualty.**
The Frames tool is really two things: (a) the frame drawing + port allocation display —
absorbed by Elevations; (b) the zone/location editor (location counts, types, rooms, HL,
per-port room split) — this is upstream data entry and becomes a **left-panel tab
("Locations")** in Elevations, reusing `ConfigPanel`/`LocationList`/`LocationRow` nearly
as-is. The `/frames` route redirects once parity lands.

**D6 — Plan view stays out of Elevations.**
Per the racks/floorplan direction already decided: plan view's future is the outlets
floorplan. Elevations is front/rear only. The old racks route keeps plan view alive until
that migration happens (separate effort).

**D7 — Build standalone, embed-ready.**
Root component takes a `bare` prop from day one (like Outlets/Patching) so it can later slot
into the `workspace/` shell or a sheets viewport. The half-built `workspace/` route is left
untouched for now; Elevations replaces its RackElevation/Frames/Patching views when mature.

---

## 3. UX design

### 3.1 Layout

```
┌──────────────────────────────────────────────────────────────────────────┐
│ Titlebar                                                    [Versions]   │
├──────────────────────────────────────────────────────────────────────────┤
│ Floor ▾ · Room A B C D · Row A ▾   |  [Select][Place][Patch]  Front/Rear │
│                                    |  cable: [■ U/UTP ▾]  View ▾  ⚙  🖨  │
├────────────┬─────────────────────────────────────────────────────────────┤
│ Left panel │  Breadcrumb: Room A ▸ Row A ▸ [Rack-03 ×] [Rack-07 ×]       │
│ (tabs)     │ ┌─────────────────────────────────────────────────────────┐ │
│            │ │                                                         │ │
│ Racks      │ │            CANVAS (pan/zoom, mm space)                  │ │
│ Devices    │ │   ceiling ────────────────────────────────────          │ │
│ Library    │ │   [R1] [V] [R2] [V] [R3]  …racks in a row…              │ │
│ Catalog    │ │   floor ──────────────────────────────────────          │ │
│ Locations  │ │   slab  ══════════════════════════════════════          │ │
│ BOM        │ │                                          ┌───────────┐  │ │
│            │ │                                          │ Inspector │  │ │
│            │ │                                          │ (docked)  │  │ │
│            │ │                                          └───────────┘  │ │
│            │ └─────────────────────────────────────────────────────────┘ │
│            ├─────────────────────────────────────────────────────────────┤
│            │ ▼ Patch list (collapsible)  filter · status chips · bulk    │
├────────────┴─────────────────────────────────────────────────────────────┤
│ Floor tabs │ hints ("Esc: back to row · P: patch mode") │ counts │ zoom  │
└──────────────────────────────────────────────────────────────────────────┘
```

- **Left panel** = paneforge `Pane` with tabs: Racks (list + add/reorder), Devices (grouped by
  rack, front/rear), Library (palette + custom builder), Catalog, **Locations** (from Frames),
  BOM. Tab persistence per project.
- **Inspector** = ONE polymorphic docked panel (right side, collapsible), replacing the three
  overlapping floating `Window`s. Sections render by selection kind: rack / device / port /
  cord / multi. Field-spec-driven with shared "— mixed —" handling (extract once, not ×3).
- **Bottom panel** = the live patch list (reuse `PatchListPane`), collapsible like a terminal
  pane (ux-plan item #7). Row click ↔ canvas cord selection stays bidirectional.
- **Status bar** = floor tabs + contextual hints (copy Outlets' pattern) + counts + zoom.

### 3.2 The zoom/focus model (the core interaction)

State: `focus: { rackIds: string[] } | null` — independent of selection.

| Gesture | Result |
|---|---|
| (default) | **Row view** — viewport fits the active row |
| Double-click a rack (or ⏎ on selected) | **Focus rack** — animated fit to that rack; ports become primary targets |
| *(gesture TBD)* add a second rack | **Focus pair** — fit both racks (side-by-side in row order); ideal patching setup |
| Breadcrumb `×` / Esc | Pop focus → back to row fit |
| Plain pan/zoom | Always available; focus is a *framing + emphasis* aid, not a lock |

Adding the second rack: Shift+dbl-click works but is undiscoverable (user feedback).
Candidates to decide during Phase 2: a 📌 pin icon in each rack's header while focused, a
"Patch with…" context-menu item, or select-two-then-toolbar-"Focus" button. Ship at least
one visible affordance alongside whatever gesture exists.

**Design for the future building level:** model `focus` as a *navigation stack of levels*
(`building → room → rack(s)`), not just `rackIds` — the Risers integration (§7) later
pushes a "building" level on top of the same stack with zero rework: dbl-click a server
room on the building elevation pops you into that room's row view, Esc walks back up.

**View-state restore:** the last focus + viewport per `pid_F{NN}_R{room}` persists to
localStorage, and re-entering the tool (or switching back from another tool) restores the
exact rack view you left — same pattern as pan/zoom persistence today, extended to focus.

Focused racks render at full opacity; the rest of the row dims to ~30% and drops pointer
events for ports (racks stay draggable in select mode). A `Focus dims others` toggle in
View ▾ for those who hate it. Viewport animates with a ~200ms ease (reuse `tick()` +
lerp pattern already in `Canvas.svelte`'s zoom easing).

**Zoom presets** (buttons + keys `1/2/3`): Fit row · Fit focused rack(s) · Fit selected panel.

### 3.3 Level-of-detail (mm renderer, SCALE=0.5, 1U=22.5px@z1)

| Element | Visible when | Notes |
|---|---|---|
| Rack frames, devices, cords | always | cords use zoom-invariant stroke (`w/zoom`) |
| Device labels | always | font clamps like today |
| Port cells (grid in panels) | cell ≥ ~6px → zoom ≥ ~0.7 | fill = usage-type tint (shared `LOC_TYPE_COLORS`) |
| Cable-color dot, F/T badges | zoom ≥ ~1.2 | |
| Stacked short label (`001` / `A01`, 2 lines) | zoom ≥ ~2 | |
| Stacked full label (`L01.A` / `001` / `A01`, 3 lines) | zoom ≥ ~2.6 | one rack ≈ 620px wide at this zoom |
| Tooltip w/ full label + connection info | always on hover | |

**Label readability strategy (the Frames-was-HTML concern).** A 13-char label on one line
needs ~1.4mm characters inside a real 18.5mm port pitch — readable only at extreme zoom
(~6.7×), which is why Frames used an exaggerated HTML grid. The fix is not to abandon mm
geometry but to change the label shape:

1. **Stacked multi-line labels** (SVG text, vector-crisp at any zoom). Splitting
   `L01.A.001-A01` into 3 stacked lines makes the full label readable at ~2.6× zoom —
   i.e., normal "looking at a panel region" zoom, not extreme. 2-line short form kicks in
   from ~2×. Line-splitting derives from the structured label parts the engine already has.
   **High-density panels (48 ports / 1U — common here)** halve the cell height to ~20mm:
   the 2-line short form is the norm at panel zoom, the 3-line full stack needs ~3.2×
   instead of 2.6×, and the panel detail strip / tooltip covers the rest. LOD thresholds
   key off *cell mm height*, not U, so this falls out automatically.
2. **Panel detail strip — the readability guarantee.** Selecting/focusing a panel opens a
   constant-size HTML strip (docked above the bottom panel, or as an overlay anchored to
   the panel using the `scale(1/zoom)` crisp-overlay technique): the full 24/48 grid,
   Frames-style, full single-line labels at fixed screen size, fully interactive (patching
   clicks + block selection work there too). This is ux-plan's `splitViewModes` idea scoped
   to a panel, and it means labels are readable at *any* canvas zoom.
3. **Print/export is always the fixed exaggerated layout** — full labels at fixed scale,
   no LOD (reuse Frames' drawing as the print path).

**Port numbering order.** Patch panels number row-major (1–24 top row, 25–48 bottom), but
switches are often **column-major** (1 above 2, 3 above 4, rightward). Add
`DeviceConfig.portNumbering?: 'row' | 'column'` (default `'row'`; additive optional field —
no migration) with the toggle in the device Inspector and a default on the device template.
This is *presentational only*: `PortRef.portIndex` remains the identity, the setting just
changes the index→(row,col) mapping in the ports layer, hit-testing, and cable anchors — so
flipping it on a patched switch re-draws but never re-wires.

These are the `lod` + `tooltip` + `inspectorAlways` defaults from ux-plan's label-rendering
experiment; the toggles ship in Settings so the other options (hover magnifier, split render)
can be A/B'd later without rework. If stacked labels disappoint on screen in practice, the
panel detail strip is already the fallback primary surface.

### 3.4 Patching flow

- Press `P` or click **Patch**. Cursor becomes crosshair over ports; unlabeled ports render
  dashed/45% and reject clicks (port-level gate — clicking one flashes the reason in the
  status bar and selects the port so the Inspector explains what to do).
- Click port A → armed (green ring + rubber-band line to cursor, drawn like Outlets' trunk
  preview). Click port B → cord created with **sticky** cable type/status (Outlets'
  sticky-defaults pattern), auto length (existing `calculateCableLength`, now fed real mm
  geometry — including real `widthMm` per rack, which the px renderer faked at 416px).
- Click a connected port → selects its cord. Re-route = select cord → `F`/`T` buttons in
  Inspector (keep the endpoint badges).
- Rear face patching: the face toggle applies; new `PortRef.face` = current face
  (fixes the hardcoded `'front'`).
- Bulk add stays (device A → device B → N cords) but validates ranges and skips occupied
  ports; lives in the Devices tab.
- Cord routing: port `mm` anchor → side channels at real rack edges → transit between racks;
  adapt `computeRoute` from px to mm space (mechanical port of the existing logic, managers
  detours preserved).

### 3.5 Placing devices (row view parity with Racks)

Everything Racks does today, unchanged in behaviour: palette/catalog drag with RU-snap ghost,
Ctrl-drag copy, offsetX 25mm snap, front/rear mounting by face, row composer, reference-line
drags, overlap warnings. The only UX changes: selection unifies to one `Set<{kind,id}>`-style
model, delete key works for racks/devices (with input guard + confirm for non-empty racks),
and properties move into the docked Inspector.

### 3.6 Keyboard map

| Key | Action |
|---|---|
| `V` / `P` | select / patch mode (place is drag-initiated, no key needed) |
| `F` | toggle front/rear face |
| `1 / 2 / 3` | fit row / fit focus / fit panel |
| `Esc` | cascade: cancel patch-arm → clear selection → pop focus |
| `Del`/`Backspace` | delete selection (input-guarded; soft-delete for cords per status model) |
| `Ctrl+Z / Ctrl+Shift+Z` | undo/redo (HistoryStore) |
| `Ctrl/Shift+click` | multi/range select (as today) |
| dbl-click rack | focus; Shift+dbl-click adds to focus |

### 3.7 Label assignment UX (rethinking the engine's front door)

User-confirmed pain with the current engine: (a) re-running generation on a zone
**re-numbers existing labels**, (b) the format is fixed when it should be per-project
configurable, (c) the location-list → engine → panels flow is hard to understand.

Direction: keep the engine for what it's good at (bulk allocation), but make **ports the
primary surface** and make results sticky:

- **Block-select ports → assign toolbar** (evolves block-assign): select a run of ports in
  the canvas or panel detail strip, then choose:
  - **Auto-generate…** — dialog: zone, start number, ports-per-location, type, room, HL;
    creates the Location rows and assigns the generated labels to exactly these ports.
  - **Assign to existing location…** — picker over the Locations list.
  - **Manual labels…** — type/paste a list (one per port) for the odd cases.
  - **Clear labels** (validated: refuses while patched, per ux-plan soft rules).
- **Quick edit**: clicking a labeled port (in select mode) shows the label in the Inspector
  with editable location fields (number/type/room/HL) and a live label preview; changes
  write through to the Location row. Clicking an *unlabeled* port offers "Assign…" (same
  dialog) or deep-links to its zone in the Locations tab — the agreed v1 approach.
- **Sticky allocation (the structural fix for re-generation).** Persist the port→label
  assignment as `portAssignments: Record<portPosKey, locationRef>` in the frames doc — a
  natural generalization of `portReservations`. Generation then only fills *unassigned*
  ports and never moves an existing assignment; "re-generate zone" becomes additive instead
  of destructive. Additive schema change, old docs still valid. (This replaces pure
  order-derived allocation; the engine's ordering logic becomes the *initial* placement.)
- **Label format template** (ux-plan item #10): per-project template string, e.g.
  `{floor}.{zone}.{loc:3}-{room}{port:2}` with the existing separator/include options as
  presets. Slots into `buildLabel` cleanly since labels are already built from parts.

Phasing: quick-edit + deep-link land with Phase 2 (Locations tab); block-assign toolbar and
sticky allocation land in Phase 4 (renamed from "Block-assign" to **"Label & reservation
tools"**); format template can ride along in Phase 4 or later.

### 3.8 UI consistency

- Adopt `improvement-plan.md` tokens: toolbar h-8, status bar h-7, one `$lib` Button/Input/Select
  set, standard hover/selected/active states. This tool is the flagship for the design system —
  build it clean rather than migrating later.
- Colors: devices by `DEVICE_TYPE_COLORS`, ports by shared `LOC_TYPE_COLORS`, cords by cable
  type, rooms A–D by the existing blue/purple/teal/rose dots. One source in `$lib`.

---

## 4. Architecture

### 4.1 File layout

```
src/lib/
  elevation/                     ← promoted shared core
    portmap.ts                   ← THE single deriveFramesFromRacks + buildPortInfoMap
    loc-colors.ts                ← LOC_TYPE_COLORS/LABELS (hex + tailwind), PORT colors
    cable-route.ts               ← computeRoute in mm space; calculateCableLength
  panzoom/PanZoom.svelte.ts      ← extracted controller (view xyz, wheel/pinch/drag,
                                    fit(rect), animateTo(rect), localStorage per viewKey)
  history/HistoryStore.svelte.ts ← moved from outlets/parts (generic already)

src/routes/projects/[pid]/elevations/
  +page.svelte                   ← subscriptions: project, racks A–D?, active room doc,
                                    frames doc, patching doc, library, catalog
  Elevations.svelte              ← thin shell: toolbar, panes, statusbar (`bare` prop)
  editor.svelte.ts               ← ElevationsEditor $state class (see below)
  parts/
    ElevationsCanvas.svelte      ← panzoom host + renderer + overlays + pointer routing
    PortsLayer.svelte            ← LOD port grids inside panel devices
    CordsLayer.svelte            ← SVG cords in mm space (port of CableOverlay)
    Inspector.svelte             ← polymorphic docked inspector
    LeftPanel.svelte + tabs      ← Racks/Devices/Library/Catalog/Locations/BOM
    Breadcrumb.svelte
  (reused nearly as-is: PatchListPane, RackList, RowEditor, DevicePalette,
   CatalogBrowser, BOMPanel, ConfigPanel/LocationList/LocationRow, SettingsDialog,
   FloorManagerDialog, VersionPanel)
```

### 4.2 `ElevationsEditor` (single state class — the anti-god-component move)

```ts
class ElevationsEditor {
  // entities (from subscriptions)
  rows; racks; devices; settings; roomObjects        // racks doc (active room)
  connections; customCableTypes; patchSettings       // patching doc
  framesData                                          // frames doc (zoneLocations, labelFormat, reservations)

  // derived (never stored)
  portInfo   = $derived(buildPortInfoMap(...))        // deviceId:port → {label, locationType}
  portConns  = $derived(buildPortConnectionMap(...))
  layout     = $derived(buildElevationLayout(...))    // rack _x/_z, device rects, port rects (mm)
  duplicates = $derived(findDuplicatePorts(...))

  // ui state
  mode: 'select'|'place'|'patch'
  face: 'front'|'rear'
  focus: { rackIds: string[] } | null
  selection: Selection            // ONE set of {kind:'rack'|'device'|'port'|'cord', id}
  patchArm: PortRef | null
  stickyCable: { type, color, status }
  history = new HistoryStore()

  // all CRUD methods (racks/devices/cords), each pushing history + scheduling save
}
```

Components read the editor from context — no 30-callback prop drilling (the documented
Outlets/OutletCanvas failure). Rendering-geometry helpers live in `layout` so canvas,
hit-testing, DXF and print consume identical numbers (the sheets fork proved why:
`deviceBox()` there already drifted from the racks renderer).

### 4.3 Persistence

- Same three docs, same debounced-save pattern, but using the **`dirty` flag +
  `lastSavedSnapshot` echo-matching** autosave (Outlets' `notes-001.md` fix) extracted to
  `$lib/AutoSave.svelte.ts` — replacing the three divergent timer-based implementations
  (this is improvement-plan §20 and racks `bugs-001.md` #14, finally done once).
- Saves are per-doc: rack/device edits → racks doc; cords → patching doc; locations →
  frames doc. Change logs continue to `logs/{pid}/{tool}` with the originating tool names
  (keeps the audit trail meaningful during transition).
- View state (pan/zoom, panel sizes, tab, face) → localStorage per `pid_F{NN}_R{room}`;
  URL carries `?floor=&room=&row=&focus=&v=x,y,z` via `$app/navigation` `replaceState`
  (NOT raw history APIs).

---

## 5. Phased implementation

### Phase 0 — Foundations + bug fixes ✅ (done 2026-08-14, uncommitted)
1. Create `$lib/elevation/portmap.ts`: move `deriveFramesFromRacks` + `buildPortInfoMap`
   there; delete the two stale copies; **fix the portReservations map bug** and the
   viewport `serverRoomCount` fallback (count from `projects.floors`).
2. Move `LOC_TYPE_COLORS`/labels + hex variants to `$lib/elevation/loc-colors.ts`; delete
   patching's private copy.
3. Move `HistoryStore` to `$lib` (generic already, cheap). The `PanZoom.svelte.ts` and
   `AutoSave` extractions move to the **start of Phase 1** — extracting them with no new
   consumer to validate against just risks the three working tools; they're built when
   Elevations consumes them.
4. Fix quick bugs: cord-ID import column+ordering, Backspace input guard, bulk-add
   validation, BOM excluding removed, PortCell regex, `nextReservationId`.
   *(Each is small; ship as one "patching/frames bugfixes" commit — immediate relief for
   the patch-list workflow even before Elevations exists.)*

### Phase 1 — Route + row elevation with editing parity ✅ (done 2026-08-14, commit fdeee51)
- `elevations/` route, `ElevationsEditor`, shell layout (toolbar/left panel/statusbar).
- Canvas = `RackElevationRenderer` internals rebuilt against `editor.layout` (front/rear,
  walls/floor/ceiling/slab, reference-line drag), palette/catalog drag-drop, rack CRUD,
  row composer, Inspector for rack/device, undo/redo on all mutations.
- Exit criteria: everything the Racks tool does in front/rear views works here (plan view
  explicitly excluded), with one selection model and the docked inspector.

### Phase 2 — Ports layer + focus navigation ✅ (done 2026-08-14; label-rendering
settings toggles + "all zones" location view deferred)
- `PortsLayer` with LOD thresholds + stacked labels (§3.3), fed by shared portmap; usage
  tints, tooltips, reservation top-bars. **Panel detail strip** (readability guarantee).
- Focus model + breadcrumb + zoom presets + dimming; double-click/Esc/Shift-dbl-click.
- Locations tab (Frames' ConfigPanel/LocationList/LocationRow mounted against framesData).
- Exit criteria: Frames' *viewing* use-cases covered (see labels on any panel by zooming);
  frames route still owns block-assign for now.

### Phase 3 — Patching ✅ core done 2026-08-14 (commit 2965fe8; deferred to 3b:
re-route buttons, bulk add, Excel export/import, custom cable types dialog,
cord Inspector section)
- Patch mode: arm/click-click flow, rubber band, sticky defaults, rear-face support,
  port-level gate, cord selection/re-route, status model (add/change/remove/installed,
  soft delete) — all logic ported from `Patching.svelte`, now against mm geometry.
- `CordsLayer` (mm `computeRoute`), hover/select emphasis, dim-others.
- Bottom panel: reuse `PatchListPane` (bi-directional selection), bulk add in Devices tab.
- Excel export/import (with the Phase-0 fixes), custom cable types, settings dialog.
- Exit criteria: a full patch list can be built without ever leaving the tool — the
  original complaint resolved.

### Phase 4 — Label & reservation tools + print/export ✅ core done 2026-08-15
(commits b62b82a, af29388; deferred: §3.7 assign dialogs, sticky portAssignments,
label-format template, DXF — see tracker)
- Block-select ports → assign toolbar (§3.7): auto-generate / assign-to-location / manual /
  clear — Frames' drag-select logic ported to the LOD grid + panel detail strip.
- **Sticky allocation**: `portAssignments` map in the frames doc; generation fills only
  unassigned ports (fixes destructive re-generation). Label format template if time allows.
- Port reservations retained as the "reserve for type" flavour of the same block toolbar.
- Print path: fixed-scale full-label rack/panel sheets (reuse `$lib/ui/print` — it was
  built for this) + A3 elevation print from Racks.
- DXF: point `sheets/dxf/racks.ts` at the shared layout (un-fork `rack-layout.ts`), add
  export button here.
- Excel exports: frames-style panel labels export + rack BOM (reuse existing exporters).

### Phase 5 — Cutover ✅ soft cutover done 2026-08-15 (legacy routes redirect
with ?legacy=1 escape; racks keeps ?view=plan; no code deleted yet — soak first)
- `/racks`, `/frames`, `/patching` routes redirect to `/elevations?…` (racks' plan view
  keeps a temporary `/racks?view=plan` escape hatch until the outlets-floorplan migration).
- Workspace views swap to embedding `Elevations bare` (or are removed).
- Versioning adapter `elevations` (serializes all three docs; fixes the frames adapter's
  stale-shape `validate`).
- Delete dead code: `patching/PatchList.svelte` (555 LOC), `racks/parts/ConfigPanel.svelte`,
  patching's renderer trio, Frames' drawing components (after print path confirmed).

Rough total: **~13–18 working sessions**, front-loaded so each phase ships something usable
(Phase 0 alone fixes today's data-integrity bugs).

---

## 6. Open questions — resolutions (user, 2026-08-14)

1. **Inline port labeling** — ✅ resolved: v1 links unlabeled ports to an existing or new
   Locations row; full block-select assignment UX per §3.7. The engine stays for bulk
   allocation but gets sticky assignments so re-generation stops re-numbering.
2. **Cross-room patching** — ✅ not needed. Inter-room/row connections use inter-connect
   structured cabling defined with matching labels in the Frames data. (Follow-up idea for
   later: surface "matching-label interconnect pairs" read-only in the patch list so a
   cross-room circuit is traceable, without any schema change.)
3. **Rack plan view** — ✅ stays out of Elevations; lives in the legacy racks route until
   the outlets-floorplan walls/doors migration.
4. **Workspace route** — ✅ ignore for now (it was a tree-navigation experiment, may resume
   later). Elevations ships standalone with `bare` embed support regardless.
5. **`-H` / high-level panels** — still open: keep the current floor/high split UI as-is
   inside the Locations tab, or revisit while we're in there?
6. **Focus-pair gesture** — open (Phase 2 decision): pin icon vs context menu vs
   select-two-then-button; see §3.2.

## 7. Later: Risers as the building level (agreed direction, post-cutover)

The Risers tool (~5,000 LOC, `risers/`) is the natural *top* of the same hierarchy:
building → floor → server room → row → rack → panel → port. The pieces already line up:

- `RiserRoom.serverRoomKey` already links a room box to a racks room (A–D), and rooms
  carry their floor — the join to a `racks/{pid}_F{NN}_R{room}` doc exists today.
- Risers is mm-based like everything else, and is the only tool already on the full
  `PanZoomInputAdapter` — it needs the least pan/zoom migration of any tool.
- Riser cables ARE the inter-room interconnect story (per the cross-room patching
  decision): building level shows interconnect trunks between rooms; rack level shows
  patch cords. Same hierarchy, two zoom levels. A later nicety: derive/validate riser
  cable counts against the matching interconnect labels defined in Frames data.

**Shape of the integration — navigation, not canvas merge.** One continuous zoom from a
30m building down to a port is technically possible (all mm) but explodes LOD and
editing-mode complexity for no real benefit. Instead: the building elevation is a
separate *scene* at the top of the focus stack. Double-click a server room → animated
transition into that room's row view (same shell, breadcrumb `Building ▸ F3 ▸ Room B`),
Esc walks back up. Risers' own editing modes (rooms, ladders, cables, labels) stay
scoped to the building level. Prerequisites are exactly Phases 1–2 (shared PanZoom,
shell, focus stack, view-state restore) — no extra work needed now beyond modelling
focus as a stack (§3.2). Target: **Phase 6, after the Phase 5 cutover**; the standalone
`/risers` route keeps working until then.

## 8. Explicitly parked (pre-existing list)

- Schema changes (structured label parts, per-client label formats — ux-plan item #10).
- Circuit chains / cross-connect tracing (`kind:'cross-connect'` remains unused).
- Side view (rack cross-section), CRAC/PDU/cable-tray plan symbols, multi-page drawing
  package export (row-builder M7).
- Touch/iPad support beyond what PanZoom extraction gives for free.

---

## 9. Bug & TODO tracker (live — update every session)

### Fixed
| Bug | Fix commit |
|---|---|
| Patching honoured reservations wrongly (array passed as Map) — labels diverged from Frames | cb16dad |
| Drawings viewports dropped rooms B–D labels (unsaved `serverRoomCount`) | cb16dad |
| Cord-ID Excel import read Cable Type column + wrong row order | cb16dad |
| Backspace in patch-list inputs soft-deleted the selected cord | cb16dad |
| Bulk add overflowed portCount / reused occupied ports | cb16dad |
| Sidebar BOM counted soft-deleted cords | cb16dad |
| PortCell floor-prefix strip only matched `01` format | cb16dad |
| `nextReservationId` collided with persisted reservations after reload | cb16dad |
| Click with stray mousemove committed a 0px device drag instead of selecting (Draggable slop) | fdeee51 |
| `writeLog` dropped entries containing undefined fields | fdeee51 |
| First wheel-zoom after focus-fit snapped back (stale zoomTarget) | 7ef0714 |
| Right-drag pan blocked over patch panels (ports layer swallowed all buttons) | 7ef0714 |
| Canvas overflowed Inspector/detail strip (window-math sizing → bind:clientWidth) | 7ef0714 |

### Pending bugs
- [x] Intermittent ~30s renderer stalls during Chrome automation after selection-heavy
      interactions (always recovered, console clean). Suspect dev-mode/CDP overhead;
      if it appears in real use, first perf target = PortsLayer node count (gate
      tooltips/interactivity harder, virtualize offscreen panels).
- [x] Device labels render through port grids at high zoom — opaque backdrop at label LOD (see commit log).
- [x] `effect_update_depth_exceeded` class of bug: editor methods that read+write own
      $state must be called via `untrack()` from $effects — audit new effects as added.

### Pending TODOs (near-term)
- [ ] Focus-pair visible affordance (pin icon / context menu / select-two-then-button)
      — gesture decision from §3.2; Shift+dbl-click works but is undiscoverable.
- [ ] Label-rendering settings toggles (lod/tooltip/inspectorAlways etc., ux-plan
      experiment) — deferred from Phase 2.
- [ ] "All zones" location list view — deferred from Phase 2.
- [ ] Phase 3b leftovers (whatever remains after this session — see §5 Phase 3 note).
- [ ] Rack-level dblclick vs device dblclick: double-clicking a device does not focus
      its rack (Draggable stops propagation) — decide whether it should.
- [ ] Migrate racks tool to $lib PanZoomCanvas + AutoSave (kept its own copies for now).
- [ ] Old tools keep raw history.pushState calls (frames|outlets|patching|racks
      +page.svelte) — migrate when touched.

### Session追記 (3b)
- Fixed: PatchListPane `rowRefs` bind:this non-reactive warning (now $state).
- [x] **AutoSave echo race** — fixed dcac466 (echo ring of last 8 saves). Was:: undoing a just-created cord showed 15 locally
      but the patching doc kept 16 — an in-flight Firestore echo of the previous save may
      be applied as a "genuine remote change" (shouldApplyRemote only remembers the LAST
      saved payload). Reproduce: create → save → undo within ~1–2s. Consider keeping a
      short history of recent saved payload hashes, or verifying with a doc-version field.
      (One stray test cord "L01.A.007-A02 ↔ U34, U/UTP, add" left in Test Project room A.)

### Session追記 (overnight run, 2026-08-15)
- Fixed: AutoSave echo race (dcac466). Phase 4a reservations/block-select (b62b82a).
  Phase 4b label-sheet Excel export in Locations tab (af29388). Phase 5 soft cutover:
  /racks (except ?view=plan), /frames, /patching redirect to /elevations; ?legacy=1
  escape hatch; tools list marks legacy entries.
- [ ] Sticky allocation (`portAssignments`) + §3.7 assign/auto-generate dialogs — the
  remaining Phase 4 items; next major work.
- [ ] Label-format template (per-project), DXF export (needs sheets rack-layout unfork).
- [ ] Old-tool cross-links (e.g. "Open in Frames tool") now land on /elevations without
  frame context — wire ?frame= to focus the rack + open Locations.
- [ ] Stray test cord in Test Project room A (L01.A.007-A02 ↔ U34, U/UTP, add) — delete
  via patch list, or ignore (practice project).
- [ ] Browser-verify overnight work: reservations bar (Ctrl+click ports), label export,
  redirects from all three legacy routes, ?legacy=1 escape.

### Session追記 (UX feedback round, 2026-08-15)
- Fixed: face switch keeps the same rack centered (viewport mirrored around row extent;
  focus path refits). Fixed: rear-view drops landed in the mirrored rack (hit tests now
  use only the current face's layout — latent in the old Racks tool too). Fixed: panel
  labels unreadable at mid zoom — constant-screen-size label with white halo drawn over
  the tint grid until port-label LOD takes over. Port selection now also shows the parent
  panel's editable device section in the Inspector (stacked sections, no toggle). Block
  selection: Ctrl+Shift+click range within a panel + "Select all" in the detail strip.
- [ ] Block selection: drag-to-paint selection as a future nicety.
- [ ] Possible 1U drift on "Test device"/"Shelf" in Test Project room A (U10→U9, U15→U14)
      noticed during automation — verify intent, undo via patch of positionU if unwanted.
