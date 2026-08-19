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
- [x] Focus-pair visible affordance — "Focus rack(s)" button in the Inspector rack
      section (select 1–2 racks in the sidebar → Focus); Shift+dbl-click remains.
- [x] View menu (toolbar): Patch cords / Port grids & labels / Reservation marks /
      Dim on focus — persisted per project. (ux-plan's lod/tooltip experiment is
      superseded by the working LOD + tooltips.)
- [x] "All zones" location list view — checkbox in the Locations tab; multi-select edits apply across zones.
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
- [x] ?frame= deep link — frames redirect forwards it; Elevations focuses the rack on
  load (explicit link overrides restored focus).
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
- [x] Block selection: Ctrl+drag paints cells (click still toggles).
- [ ] Possible 1U drift on "Test device"/"Shelf" in Test Project room A (U10→U9, U15→U14)
      noticed during automation — verify intent, undo via patch of positionU if unwanted.

### Session追記 (morning feedback round 2, 2026-08-15)
- Fixed: block-select modifiers relaxed — Ctrl+click toggle OR Shift+click range (was
  Ctrl+Shift). Panel labels now readable at every zoom: constant-screen-size centered
  label at mid zoom (drawn ABOVE cells — all-unlabeled panels like R04 painted over it
  with opaque gray cells), faded side tag at port-label LOD so hostnames stay visible
  while patching; off-face panels get a 45%-opacity label. Default device width now
  DEVICE_W_MM = 450 (palette builder, template fallback, all renderers/hit tests;
  Inspector shows 450 default). NOTE: devices already stored with explicit 445/480 keep
  their stored value — multi-select + widthMm in the Inspector to bulk-fix if wanted.
- Note: long-running Vite dev server can serve stale transforms after sed-based edits
  (DEVICE_W_MM ReferenceError until files touched) — touch files or restart dev server.

### Session追記 (assign dialogs + patch-list UX, 2026-08-15)
- §3.7 SHIPPED: block-select → Auto-generate… (new locations pinned to ports) /
  To location… (pin existing) / Unpin. Sticky `portAssignments` in the frames doc:
  pinned cells blocked from auto-fill via a sentinel reservation, pinned labels
  withheld from the engine and overlaid — zone re-generation never moves pins.
  Pinned cells show a dark corner triangle. Locations "Generate" kept for mass entry.
- Patch list: row edit panel suppressed (hideEditor) — full cord editing moved to the
  Inspector (cable/length+lock/cordId/status/notes); list panel height now drag-resizable
  (strip above header), persisted per project.
- [x] Free-form port label overrides — DeviceConfig.portLabels (Inspector "custom label" field), override canonical labels, work on switches/servers too.

### Session追記 (device ports, 2026-08-15)
- Ports now render on ALL port-bearing devices (switches, servers, …), not just panels:
  slate-tinted cells, faint port numbers at label LOD, same click/patch/block-select
  interactions. Patch gate applies to panels only — switch ports patch by number
  (Inspector explains). Panel detail strip accepts any port-bearing device.

### Session追記 (labels + port geometry, 2026-08-15)
- Free-form label overrides per port (DeviceConfig.portLabels, racks doc — they move
  with the device); merged over canonical labels in portInfo (override flag, indigo
  "custom" chip in Inspector). Label format (separator/zone/room) editable from the
  Auto-generate dialog (project-wide, saved to frames doc, live in pipeline).
- Port cells capped (MAX_CELL_W 30px / MAX_CELL_H 20px ≈ 1U) + per-device portAlign
  (tl/tc/tr/bl/bc/br, default bottom-left) — 4-port 6U servers no longer stretch ports
  across the box. Shared parts/portGeometry.ts feeds PortsLayer AND CordsLayer anchors.
  Side effect: capped cells also delay the side-tag LOD on low-port devices (~53% now).

## 10. Sheets integration (next major work — design notes, 2026-08-15)

Goal: rack elevations as sheets-tool viewports for printing with title blocks +
annotations (PDF deliverables, e.g. highlighting racks of concern).

- Elevations is already embed-ready (`bare` prop); the sheets viewport source becomes
  `{ kind: 'elevations', racksDocId, face, focusRackIds?, viewOpts?, region? }` — the
  editor's display state (face, focus/dim, View toggles, zoom region) is all
  serializable, so viewports RETAIN the on-screen look and can re-edit it via a small
  settings popover on the viewport (reuse the View menu component).
- Readonly render path: RackElevationRenderer(readonly) + PortsLayer + CordsLayer fed
  by a lightweight read-only editor (subscriptions only, no CRUD) — avoids forking
  geometry again (the sheets racks fork is the documented anti-pattern).
- Highlighting racks of concern: prefer sheet ANNOTATIONS (clouds/arrows) over focus
  dimming for authored deliverables; focus dimming remains a quick on-screen/print aid.
- Decisions (2026-08-15): selection (blue ring, Inspector) and focus (frame+dim) stay
  SEPARATE concepts — focus must print clean without selection chrome (PDF use-case),
  so focus does NOT auto-select. Dblclick-to-focus stays. Reservation marks stay
  positional and panel-only (Frames parity); consider a "Reservations" maintenance list
  (incl. orphaned positions with no panel) in the Locations tab later.

### §10 implementation map (explored 2026-08-15 — build next session)

Concrete integration points discovered (RacksViewport.svelte is the template):
1. `sheets/types.ts:88-94` — add to the source union:
   `{ kind: 'elevations'; racksDocId: string; face: 'front'|'rear'; focusRackIds?: string[]; showPorts?: boolean; showCords?: boolean; showReservations?: boolean; dimOthers?: boolean }`
2. New `sheets/tools/elevations/ElevationsViewport.svelte` modeled on
   `sheets/tools/racks/RacksViewport.svelte` (~140 lines): subscribes racks doc (and
   frames + patching docs for ports/cords), hosts `AnnotationLayer`, honours the
   `onview` fit contract (see RacksRender's `onview` → `{x,y,w,h,den}`) and layer
   visibility (`hidden`/`locked`, `vps.allLayers`).
3. Rendering: either (a) reuse `sheets/tools/racks/RacksRender.svelte` (fork, SVG in
   real-mm world space) and ADD ports/cords as SVG children — requires adapting
   elevations portGeometry (canvas px = mm×SCALE) to mm world space (×2), or
   (b) mount the elevations PortsLayer/CordsLayer + RackElevationRenderer readonly
   inside a scaled div (needs editor-lite + zoom=den wiring for LOD). (a) integrates
   with sheets annotations/print cleanly and is recommended; port label text sizes must
   use den-based LOD (RacksRender reports viewDen).
4. Register the new kind wherever `vp.source.kind === 'racks'` is dispatched (grep
   "kind === 'racks'" under sheets/) + the viewport add-flow picker + publish.ts if
   the pages tool should link it.
5. Data for ports/cords: reuse `$lib/elevation/portmap.buildPortInfoMap` directly (no
   editor needed for readonly) + `patching` doc connections for cords.

### Session追記 (sheets viewports shipped, 2026-08-15)
- §10 SHIPPED (route a): racks viewport gains `showPorts` / `showCords` source options
  (Viewport properties checkboxes). New sheets/tools/racks/PortsCordsOverlay.svelte
  renders port grids (mm geometry mirroring portGeometry: capped cells + portAlign,
  full stacked labels — print scale, no LOD) and patch cords (side-channel routing)
  inside RacksRender's SVG, under annotations. RacksViewport subscribes frames +
  patching docs on demand; labels via $lib buildPortInfoMap (no editor needed).
- Fixed: Locations-tab crash on legacy duplicate reservation ids (index-keyed list).
- Later: focus/dim options on the viewport; overlay honours device portAlign; the fork's
  DeviceConfig gained portAlign (portLabels overrides flow through portInfoMap already).

### Session追記 (print quality + RU ticks, 2026-08-15)
- RU tick marks (sheets RacksRender): moved from slot centers to U-slot BOUNDARIES
  (ticks between the numbers, numbers centred in their slot; extra tick closes the
  top of the last slot). Verified in browser at deep zoom.
- Blurry PDF print (user screenshot): Chromium rasterizes `transform: scale()`d
  layers at screen resolution when printing → text printed as a low-res bitmap.
  Fix: the injected print CSS in sheets/parts/Canvas.svelte now uses CSS `zoom`
  (participates in layout, prints as true vector) instead of `transform: scale`.
  Needs user PDF re-test on Vercel.
- HELD (user): stroke-width rework in the racks viewport (vector-effect
  non-scaling-stroke → real-mm strokes) pending the user's PDF print verdict.

### TODO — racks plan view × Outlets integration (added 2026-08-15)
- User verdict: vector print fix confirmed good (crisp PDF text).
- **TODO: implement the plan view for racks** — but design it WITH the Outlets
  tool/viewports in mind before building. Racks can also be drawn on outlet
  floorplans, and the two must stay in sync (one source of truth for rack
  position/rotation on the floor, not two divergent drawings).
- Design questions to settle first:
  1. Single source of truth: do rack plan positions live in the racks doc
     (rooms/rows layout) or as placements on the outlets floorplan — and which
     view derives from which?
  2. Prior direction (2026-06-11) was to DROP the separate rack plan view and
     let the outlets floorplan be the unified plan surface (adding walls/doors
     there); this TODO supersedes/refines that — a rack plan view is wanted,
     the open question is whether it renders from the same placement data the
     outlets floorplan uses (shared model, two views) vs. a separate layout.
  3. Sync mechanics: moving a rack in plan view should move it on the outlets
     floorplan and vice versa; row/room membership in elevations should follow.
  4. Sheets: the racks viewport source already has face 'plan' plumbing
     (currently renders nothing) — decide if it renders the shared plan model.

### Session追記 (2026-08-15, later)
- Fixed: reservation delete (×) buttons in the Locations tab were near-invisible
  (text-gray-300) → now text-gray-600 with red hover.
- **TODO — advanced custom label formats.** The current format options (separator +
  include zone/room) are too rigid. Wanted: an Excel-custom-cell-format-style
  formatter — a code/template string with tokens and literal separators (e.g.
  something like `FF.Z.NNN-SPP`, tokens for floor/zone/location/room/port with
  padding control, arbitrary literal text between) so each client's convention can
  be expressed. ALSO: formats should NOT be project-wide (current implementation
  stores one format in the frames doc) — scope TBD (per-panel? per-zone? per
  generate-run?). Needs a design discussion before building.
- **TODO — patching to unallocated/unlabelled panel ports.** Currently patchPortClick
  gates on labeled ports. Allow patching to unlabelled panel ports; the label can be
  assigned later and the cord keeps pointing at the position. Unassigned ports get a
  default fallback label of the form `rack-RU#-port#` (e.g. R04-U33-P07) wherever a
  label is displayed (patch list, inspector, cord tooltips) until a real label is
  allocated.
- **TODO — viewport port-label readability.** Sheets racks viewport with port labels
  enabled is a key deliverable: contractors receive printed port-labeling
  instructions from it. Current PortsCordsOverlay labels are very hard to read
  (tiny stacked text squeezed into cells). Improve for print legibility — ideas:
  larger min font with cell growth, per-port callout/leader-line mode, tabular
  port-schedule companion (label list per panel beside the elevation), bolder
  weight/contrast, wrap vs stack tuning. Treat print output as the acceptance test.

### Design — label formats + outlet sync (discussion, 2026-08-15)
Decisions (user):
- **Baked labels + hybrid presets.** Format presets are a GLOBAL user library
  (users add formats once, cross-project; new collection e.g. `labelFormats`),
  projects select the presets they use + a default. Generate-run picks a preset;
  the rendered strings are stored. No live format bindings — re-styling is an
  explicit re-bake.
- **Alpha/numeric port token.** Template tokens: `P`/`PP` numeric port,
  `A` alpha port (A..D). Same choice applies to outlet-port suffixes
  (`33-001.A` vs `33-001.1`) — per-client variance already documented.
- **Labels move with the panel.** Baked labels + assignments must be
  DEVICE-scoped (`deviceId:portIndex`), not position-keyed. NOTE: current
  sticky portAssignments are position-keyed — migration needed.
Proposed sync model (outlets ↔ panel ports), pending user confirmation:
- **Identity ≠ label.** Every outlet gets a stable immutable id; number, zone,
  type, port count are mutable attributes. Floorplan placements reference the
  id. Panel assignments store `{ outletId, outletPort, label }` — the label is
  baked output; the id+port is the structural link that survives renumbering.
- Design phase: add/remove/renumber outlets and change port counts freely; a
  manual **Sync labels** action re-bakes all assignment strings with a diff
  preview (never silent). Orphans (deleted outlet, shrunk port count) and
  unassigned new ports surface in a maintenance list like reservations.
- Printed labels: stop syncing (optional per-panel "printed" flag makes the
  diff warn). Cords reference device+portIndex so patching is label-agnostic.
- Open: where the canonical outlet entity lives (frames doc locations vs
  outlets tool doc) — must audit the current outlets data model + whether a
  frames↔floorplan link already exists before building.

## §11 Labels v2 + outlet unification — implementation phases (2026-08-15)
Decisions locked: baked labels; global preset library selected per-project;
stable location ids; location-canonical link BUT outlets stay independently
editable (portCount editable on plans) with divergence FLAGGED, not prevented —
during design extra ports are simply inserted on panels; after installation,
added ports may need to land on a DIFFERENT panel, so assignments are per-port
and a location's ports may span panels. Manual "Sync labels" with diff preview;
per-panel printed flag.

### Phase L0 — stable location ids + key migration
- Add `id` to `LocationConfig` via repair-on-load (deterministic, persisted on
  next edit — mirror the reservation-id repair) in BOTH frames tool and
  elevations syncFrames.
- Migrate `portAssignments` pin keys `{zone, locationNumber, port}` →
  `{locationId, port}` (read legacy, write new). Renumbering stops breaking pins.
- Fix incidental bug: RenumberDialog.svelte:22 reads removed `outlet.label`.
- Tests: portmap.test.ts id-repair + pin-migration cases.

### Phase L1 — template engine + global preset library
- Token engine: `F/Z/N/S/P` (repetition = zero-pad), `A` alpha port, `H`
  conditional high-level suffix, quoted literals; pure lib + unit tests.
- New global `labelFormats` collection (user library: id, name, template).
- Project selects usable presets + default (projects/{pid} field). Built-in
  presets replicate today's legacy/period/hyphen options.
- Generate/Assign dialog: preset picker with live example replaces the
  separator+checkbox controls.

### Phase L2 — baked, device-scoped labels
- Assignments become device-scoped records `{deviceId, portIndex} → {locationId,
  port, label}` (label = baked string) stored in the frames doc; labels move
  with the panel. buildPortInfoMap reads baked strings first, engine fallback
  during transition.
- Unassigned-port display fallback `rack-RU#-port#`; patching gate on labeled
  ports removed (cords are device+port refs already).
- Per-panel `labelsPrinted` flag (device field) — gates loud warnings in sync.

### Phase L3 — outlet ↔ location linking
- `OutletConfig.locationId?`; consume the dead `frameData` wire in Outlets.
- One-time matcher for existing projects: heuristic zone+number ↔ `Z.NNN`
  label match with a confirm list; manual link/unlink in outlet properties.
- Create-outlet-on-plan can create a location (batch write outlets + frames
  docs); delete on either side orphans the other into a maintenance list.
- Mirror `locationId` into the sheets outlets viewport type copy.

### Phase L4 — divergence flags + Sync labels action
- Reconciliation engine (lib): linked pairs compared on portCount, zone/number
  vs outlet label, room; differences FLAGGED in outlet properties + a
  maintenance list beside reservations (never auto-rewritten).
- "Sync labels": diff preview (old → new per port) re-baking all assignments
  from current location data + panel preset; printed panels warn loudly;
  apply = batch write.
- New/extra ports of a location surface in an "unassigned ports" work list and
  can be assigned to ANY panel (post-install case: different panel than the
  location's original ports).
- Renumber (Locations tab or plan) edits location attrs; links survive by id;
  labels go stale until synced.

### Phase L5 — outlet port suffixes + exports read the link
- Linked outlets: per-port labels/Excel export read the BAKED panel labels
  (canonical rule: outlets read frames); `derivePortLabels` only for unlinked.
- Plan/DXF outlet number rendering follows the location number when linked
  (divergence flagged, not forced).

### Session追記 (labels v2 L0+L1 shipped, 2026-08-15)
- L0 ✅: LocationConfig.id (deterministic repair-on-load), id-form pins with
  legacy fallback in buildPortInfoMap, RenumberDialog preview fix. 14 tests.
- L1 ✅: $lib/elevation/labelTemplate.ts — Excel-style token engine
  (F/Z/N/S/P/A/R/H, repeat=pad, "quotes", [conditional groups]), 10 tests;
  LabelFormat.template (precedence over separator options, byte-identical
  legacy mapping via templateForLegacyFormat); global `labelFormats`
  collection as the user preset library; AssignPortsDialog format picker:
  built-ins + library + Custom with live preview, save-to-library, delete.
  Verified in browser (custom `Z/NNN":"A` → A/023:D, alpha port token).
- NOTE: Firestore rules must allow the new global `labelFormats` collection
  (same pattern as `catalog`) — verify on Vercel; writes fail silently if not.
- L2 ✅: baked device-scoped labels. frames doc gains `bakedLabels`
  (`deviceId:portIndex` → {label, locationId, port}) written at
  generate/assign time through the effective template (byte-identical legacy
  mapping); buildPortInfoMap overlays baked strings over engine output
  (locationType via locationId); labels move with panels. Unassigned-port
  fallback rack-RU#-port# (portLabelOf); patch gate on unlabeled panel ports
  REMOVED; DeviceConfig.labelsPrinted + Inspector "printed" checkbox.
  Fixed: clearing labelFormat.template needs explicit null — merge:true
  deep-merge resurrected a deleted key (echo loop). Verified in browser:
  generate → 037-A01 baked chip; undo reverts bake. 25 lib tests.
- L3 ✅: outlet↔location linking. OutletConfig.locationId (+ sheets mirror);
  the outlets page's dead frameData wire is now consumed — locations get the
  same deterministic id repair as elevations. OutletProperties gains a
  Location row (linked: zone-NNN·type·Np + ⚠ ports divergence hint + unlink;
  unlinked: location select + "create" which writes the frames doc and
  links), and a "Link all by label" bulk matcher (Z.NNN ↔ zone+number,
  undoable). Verified in browser: 9/15 test outlets linked, ports-mismatch
  flag shows on A.001 (6p outlet vs 2p location). Unlink drops the key
  entirely (Firestore rejects undefined).
- L4 ✅: divergence + Sync labels. $lib/elevation/reconcile.ts (6 tests):
  buildSyncPlan diffs every structurally-linked baked label against current
  location data + effective template (stale / orphaned / out-of-range,
  printed-panel counts), unbakedLocationPorts lists location ports with no
  baked position (post-install additions). Elevations Locations tab gains a
  LABEL SYNC panel (counts + Review & sync…) and an UNASSIGNED LOCATION
  PORTS work list; SyncLabelsDialog shows per-port old→new rows (stale rows
  pre-checked EXCEPT printed panels; checked orphans are removed), Apply =
  editor.applySyncPlan (undoable mutateFramesDoc). Verified in browser:
  format change → 1 stale → diff L01.037-A01→L01.037.A01 → apply → panel
  clears; unassigned work list surfaced organically (A-037 port 2).
- L5 ✅: outlets read the link. Outlets tool derives bakedByLocation from the
  frames doc; linked outlets' ports line shows BAKED panel labels when they
  exist (canonical rule), derivePortLabels only otherwise; ⚠ label divergence
  chip when o.label ≠ zone.NNN; "Sync from locations" (undoable) adopts
  location truth onto all linked outlets: label ← zone.NNN, portCount, and
  portLabels ← baked strings — after which Excel export, plan render, DXF and
  sheets viewports are correct with no render-path changes. Verified in
  browser: synced 9 outlets, A.001 6p→4p, flags cleared.
- Labels v2 (§11) L0–L5 ALL SHIPPED. Remaining follow-ups: Firestore rules
  for `labelFormats` (verify on Vercel); renumbering UI for locations (list
  edits numbers indirectly today); outlets-side create-on-plan auto-link
  option; port-label readability TODO (earlier entry) still open.

### Session追記 (2026-08-16 — place-location picker + link guards + sheets link UI)
- Outlets tool palette gains **Unplaced locations** (frames locations with no
  linked outlet): click one → click the plan → outlet born linked with the
  location's identity adopted (label zone.NNN, portCount, level from HL,
  usage from type, baked port labels). Esc cancels place mode. Verified in
  browser (A-036 placed linked, no divergence flags).
- Location dropdown guard: locations already linked to another outlet are
  disabled + marked "· linked" (both the tool and the sheets panel) so two
  outlets can't silently share one location.
- Sheets outlets viewport: subscribes the floor's frames doc (tenant-area
  suffix stripped) and the edit panel now has the Location row — link picker
  with guard, linked display with ⚠ ports chip, unlink. Bulk actions
  (Link all / Sync from locations) intentionally stay in the Outlets tool.
- TODO (from discussion): moving a location's ports to a different panel is
  done today by block-selecting target ports → "To location…" (re-pin moves
  all pins + baked strings). Consider DRAG-to-move for selected port blocks
  (grab pinned/baked ports, drop on another panel/position, printed-panel
  warning on drop) — direct-manipulation alternative worth designing.

## §12 Direction change (2026-08-16) + triage list before the split

User direction: the unified Elevations tool is trying to do too much. New plan:
**simplify Elevations to displaying + editing devices/panels**, then design
dedicated UX for (a) **Patching** — view 2+ switches/devices/panels/ties at
once, select ports by type/usage/id, patch to a destination port with proper
connection attributes; and (b) **Frames** — rear-of-panel focus: structured
cable links to outlets/rack ties in other locations (floorplan/other racks),
cable types/bundles, automatic/manual port positioning, consistent labels on
both ends. Current unified code is parked on branch
`elevations-unified-reference` (pushed) for later reference.

### Triage — pending items to complete or postpone before branching
Quick fixes / cleanups:
1. Stray test cord in Test Project room A (L01.A.007-A02 ↔ U34, U/UTP, add) —
   delete via patch list or ignore (practice data).
2. Device dblclick doesn't focus its rack (Draggable stops propagation) —
   decide intended behavior, one-line fix either way.
3. Test-data leftovers from labels-v2 verification: location A-037 (port 1
   baked on test rack 1 U33, port 2 unassigned), linked/synced outlets.

Sheets / print deliverables:
4. Port-label readability in the sheets racks viewport (contractor labeling
   prints): bigger min fonts, callouts/leader lines, or a tabular port
   schedule beside the elevation. Print output is the acceptance test.
5. HELD stroke-width rework (vector-effect → real-mm strokes) — print is now
   true vector; re-judge line weights on a fresh PDF and decide.
6. Sheets racks viewport source options: focus/dim rack subset for
   deliverables.
7. Racks plan view × Outlets integration (design-first): shared placement
   model, sync both ways, sheets `face:'plan'` renders it.
8. DXF export of rack elevations still depends on the sheets fork —
   rack-layout unfork / renderer unification. (Directly informs how the
   simplified Elevations renderer should be built — decide before coding.)

Labels v2 follow-ups:
9. Firestore security rules for the global `labelFormats` collection —
   verify preset saves on Vercel.
10. Location renumbering UI (Locations list edits everything but the
    number; Sync labels exists precisely to absorb renumbers).
11. Drag-to-move pinned/baked port blocks between/within panels (design
    discussed 2026-08-16) — natural fit for the NEW Frames editor rather
    than the current canvas.
12. Cross-room interconnect traceability: read-only "matching-label pairs"
    in the patch list (no schema change) — fits the NEW Patching editor.
13. Outlet create-on-plan auto-link option (place-location picker covers
    the main flow; optional default remains).

Open design decisions absorbed into the new split:
14. High-level (-H) panel UI treatment (§6.5) → Frames editor design.
15. Focus-pair gesture (§6.6) → superseded by Patching editor's
    multi-device view design.
16. Elevations LOD/ports/cords rendering on one canvas → becomes
    display-only in simplified Elevations; heavy interaction moves to the
    dedicated editors.

Legacy / infra (independent of the split):
17. Migrate racks tool to $lib PanZoomCanvas + AutoSave; migrate raw
    history.pushState calls in old +page.svelte files when touched.
18. Risers as the building level (§7) — unchanged long-term direction.

### Triage refinements (user, 2026-08-16)
- **#7 KEEP (build):** racks on floorplans stay in sync with elevations racks.
  Foundation exists: `RackPlacement.rackId` already references the racks doc
  and the floorplan join (racksById) derives dims/labels live. Work = an
  "Unplaced racks" picker on the floorplan (rooms' racks with no placement on
  the floor's plan → click to place, mirroring the place-location picker),
  two-way position sync question resolved by: racks doc owns rack identity +
  dims; the outlets doc placement owns position/rotation on the plan.
- **#9:** security rules confirmed OK by user. Where to edit labelFormats
  today: Elevations → block-select ports (Ctrl+click) → "Auto-generate…" →
  Label format select → "Custom…" → template input + "Save to library"
  (presets list + delete live in the same section). NOTE: buried — a
  standalone "Manage label formats" entry point is a candidate follow-up.
- **#12 EXPANDED — multi-hop circuit tracing.** Not just matching-label pairs:
  trace full chains across patch cords AND structured links, e.g.
  server1-port3 → (cord) → rack1-rack3 tie port 17 → (tie/structured link,
  matching labels both ends) → far-end tie port → (cord) → switch02 port 3/21.
  The trace walks: device port → cord → panel/tie port → label-matched far
  end → cord → device port, over any number of hops. Belongs in the new
  Patching editor (read-only trace view first; selection highlights the
  whole circuit).

### Session追記 (2026-08-16 — quick fixes + rack picker + labelFormats findings)
- #1 ✅ stray test cord: already gone (patch-list filter 007/U34 → no matches).
- #2 ✅ device dblclick now focuses its parent rack: Draggable gained an
  optional onDblClick passthrough; RackElevationRenderer exposes
  ondevicedblclick; Elevations selects + focuses + fits. Verified in browser.
- #3 ✅ resolved as KEEP: A-037 + linked outlet A.037 are now coherent linked
  data (deleting would orphan links); no cleanup needed.
- #7 ✅ sheets outlets viewport rack picker: "Unplaced racks" list in the
  edit panel (rooms' racks with no placement, live from racksById which now
  carries room) → click one, click the plan → placeRackRef stores ONLY
  {rackId, room, position, rotation} so label/dims stay live-joined from the
  racks doc — elevations and floorplan cannot diverge. Esc cancels. Free-draw
  "+ Rack" (self-contained box) unchanged. The standalone Floorplan tool's
  Racks tab already had drag-to-place for real racks (no change needed).
- labelFormats mystery EXPLAINED: typing a Custom template applies it
  project-wide immediately (frames doc labelFormat.template) but is NOT a
  library preset until a NAME is typed and "Save to library" clicked — only
  that writes the global `labelFormats` collection (visible in Firebase
  console as a root collection once the first preset is saved). Verified
  live: preset "Floor-port-alpha" (FFZ.NNNA) appeared in the dropdown via
  the real-time subscription. UX follow-up: make the two-step (apply vs
  save-as-preset) more obvious.

## §13 Patching editor — design proposal (2026-08-16, discussion)

Premise (user): patching is about looking at 2+ specific devices at once and
connecting ports with the right attributes — not about spatial rack layout.
The rack drawing is how you FIND devices; the work itself is port-to-port.

### Core concept: the patch bench
A working set of devices, each shown as a PORT BOARD — a fixed-size, always-
readable card (the PanelDetailStrip pattern, which already proved constant-
size beats zoom LOD for this): device name + rack/RU context header, port
grid with number, label, status color (free/patched/reserved), usage tint,
cord dot. Boards sit side by side / stacked in a user-arranged bench;
2-column default, drag to reorder. Bench persists per project/user.

Getting devices onto the bench:
- Device tree sidebar (room → rack → device, with search) — click to add.
- From simplified Elevations: select device(s) → "Patch…" → opens Patching
  with them on the bench (the tool-switching UX: shared context, not a
  cold start).
- Recent/named bench sets (e.g. "SW02 ↔ floor panels") for recurring jobs.

### Patch flow
- Click a free port on board A → armed; click a port on board B → cord
  created with the sticky attribute bar's values (cable type, status,
  length auto from rack geometry, cord id, notes) — same interaction as
  today, but between readable boards.
- Filter bar (global + per-board): substring on label/id, type/usage chips
  (desk/AP/…), "free only" toggle — matching ports highlight, rest dim;
  Enter jumps to next match ("type-to-jump" as the power flow).
- Bulk: select N ports on A (drag/shift), N on B → "Patch N" with a
  sequential mapping preview before commit.
- PatchListPane stays as the bottom panel (bi-directional selection,
  filters, Excel roundtrip — reuse as-is).
- Unlabeled ports patchable (L2), display rack-RU#-port# fallback.

### Tracing (§12-expanded, id-based)
- Selecting any port or cord shows the full CIRCUIT in an inspector panel:
  every hop across cords (device+port refs) and structured links (id-based
  link entities from the Frames editor; label-match only as bootstrap).
  server1-p3 → tie1 p17 → sw02 p3/21 renders as a clickable chain — click
  a hop to add that device's board to the bench.
- Optional: highlight lines drawn between bench boards for the SELECTED
  circuit only (permanent all-cords lines between boards would be noise).

### Data + routing
- No schema change: patching/{pid}_F{NN}_R{room} connections with PortRefs.
- Bench may span rooms: editor subscribes each involved room's patching
  doc; cords stay within their room's doc; cross-room hops are structured
  links (ties), which is exactly what the trace view shows.
- Route: /projects/[pid]/patching reclaims its redirect. Tool switching:
  Elevations ⇄ Patching ⇄ Frames as sibling tools sharing selection
  context (device/rack ids in the URL), not one mega-canvas.

### Open questions (user)
P1. Board granularity: one board per device? Or allow a combined board per
    rack (all its panels stacked) for the "patch a whole rack" case?
P2. Are selected-circuit highlight lines between boards wanted at all, or
    is the chain list + port highlighting enough?
P3. Attribute bar: sticky-per-session (today's behavior) vs per-bench-set
    remembered defaults (e.g. this bench always Cat6a blue)?
P4. Should the bench show LIVE rack thumbnails (mini elevation with the
    device highlighted) for spatial orientation, or is text context
    (rack · U· room) enough?

### §13 resolved (user decisions, 2026-08-16)
- Board unit: **per rack group** — a bench board is a RACK, its port-bearing
  devices stacked in RU order (top-down), each as a row-group (device header
  + port grid). Adding a device from the tree/Elevations adds its rack's
  board scrolled to + highlighting that device; device row-groups are
  collapsible for tall racks.
- Trace: chain list in inspector + port highlights on boards (no drawn lines).
- Attributes: sticky per session (today's behavior).
- Orientation: text context (rack · room · U range) + jump-to-Elevations link.

### §13 build phases
- P-1: bench shell at /patching (reclaim redirect): rack boards (readonly),
  device tree sidebar + search, bench add/remove/reorder/persist,
  PatchListPane bottom panel wired to existing docs.
- P-2: patching interactions: click-click arm/complete with sticky
  attribute bar, filter bar (substring + type/usage chips + free-only,
  Enter = next match), unlabeled-port fallback labels.
- P-3: bulk N↔N with mapping preview; multi-room bench (subscribe rooms on
  demand); "Patch…" entry from Elevations selection.
- P-4: circuit trace inspector (cords by ref; structured links by id with
  label-match bootstrap) + saved bench sets.
- Elevations simplification lands alongside P-1/P-2: patch mode + cords
  layer become view-only there (edit → Patching), Locations tab stays.

## §14 Frames editor — design proposal (2026-08-16, discussion)

Premise (user): Frames is the REAR side of patch panels — specifying the
structured cable links from rear ports to far ends that live somewhere else
entirely (outlets on floorplans, tie panels in other racks), with cable
types/bundles, auto/manual port positioning, and identical labels on both
ends. This is the tool that CREATES the links Patching's trace consumes.

### Core concept: the termination map
The Frames editor answers three questions per rear port: which structured
cable lands here, where does its other end terminate, and what's the label
on both ends. Layout = dual pane:

- LEFT — **rear boards**: rack-group boards (same pattern as the patch
  bench, §13) but rear-focused: each panel a port grid whose cells show
  the baked/derived label, location type tint, reservation mark, link
  state (unterminated / outlet-run / tie) and a bundle color band.
- RIGHT — **destination pane**, tabbed:
  1. Floorplan (embedded outlets view, read-mostly: select outlets/ports,
     place-location picker available) — the "far end in another location".
  2. Locations list (the existing zone/location editor moves here).
  3. Other racks (tie destinations: another rack's rear boards).

### The structured-link entity (the big schema addition — id-based per the
§12 decision; Patching traces these by id)
  structuredLinks: Record<id, {
    kind: 'outlet-run' | 'tie',
    a: { deviceId, portIndex },                         // rear panel port
    b: { locationId, port } | { deviceId, portIndex },  // outlet OR tie end
    cableType, bundleId?, lengthM?, status, notes?
  }>
  bundles: Record<id, { name, cableType, color, notes? }>
- Existing portAssignments/bakedLabels already encode outlet-runs
  implicitly — a bootstrap pass generates link records from them (like the
  outlet label matcher). bakedLabels remains the label store; links add
  the explicit endpoint + cable/bundle metadata and make ties possible.
- Tie labels: ONE label rendered on both ends from a tie template
  (label-template engine reused; e.g. "R01-R03:NN") — consistent-both-ends
  by construction.

### Flows
1. Mass allocate: existing auto-generate/assign flows, now also writing
   link records (outlet-runs).
2. Manual terminate: click rear port → click destination (outlet on the
   floorplan / location row / tie port on the other-rack board) → link
   created with sticky cable/bundle attributes.
3. Block ops on rear boards: assign-to-location, set bundle, clear, and
   DRAG-TO-MOVE a block to another position/panel (triage #11) with
   collision checks + printed-panel warning; labels re-bake via sync.
4. Maintenance: Label sync, divergence flags, unassigned-ports work list
   (all already built) become this editor's checklists panel.

### Open questions (user)
F1. Storage: structuredLinks + bundles as new fields on the per-floor
    frames doc (same autosave/undo/echo machinery; ties within a floor) —
    cross-floor ties deferred to the riser story? Or a new collection?
F2. Tie labels: template-derived both ends (recommended) vs free-form?
F3. Destination floorplan: embedded read-mostly outlets view (recommended)
    vs jumping to the Outlets tool?
F4. Bundles: first-class entity with per-bundle BOM/exports (recommended)
    vs a plain tag/color on links?

### §14 resolved (user decisions, 2026-08-16)
- Storage: structuredLinks + bundles as fields on the per-floor frames doc
  (same autosave/undo/echo machinery). Cross-floor ties → riser story later.
- Tie labels: template-derived, rendered onto both ends (template engine).
- Floorplan destination pane: embedded read-mostly outlets view (select
  outlets/ports, place-location picker; full editing stays in Floorplan tool).
- Bundles: TAG/COLOR ONLY on links (name+color, no entity, no per-bundle
  BOM for now — revisit if exports are wanted).

### §14 build phases
- F-1: structuredLinks schema + bootstrap from existing pins/bakedLabels;
  rear boards (readonly) + link-state rendering; route /frames reclaims
  its redirect; Locations tab moves in.
- F-2: manual terminate flow (rear port → destination) for outlet-runs via
  embedded floorplan + locations list; sticky cable/bundle-tag attributes;
  block assign/clear.
- F-3: ties: other-rack destination boards, tie template + both-ends
  labels, tie link records.
- F-4: drag-to-move port blocks (collision + printed warnings, re-bake via
  sync); maintenance checklists panel (sync/divergence/unassigned).

### Recommended build order across both editors
Patching P-1→P-3 first (no schema change, fastest value) with the
Elevations simplification alongside; then Frames F-1→F-4; Patching P-4
(trace) last, consuming real link records.

### Session追記 (2026-08-16 — Patching P-1 shipped)
- P-1 ✅ at /projects/[pid]/elevations/patching (user chose subfolders under
  elevations for the new editors). New files: patching/bench.svelte.ts
  (BenchEditor: multi-room subscriptions merged via the shared portmap
  pipeline, per-room AutoSave echo-gating, bench persist per pid+floor in
  localStorage, connection mutations routed to the owning room's doc with
  undo), RackBoard.svelte (rack-group board, collapsible device row-groups,
  constant-size chips: LOC tint, short label, cord dot, click-to-select
  cord), DeviceTree.svelte (room→rack→device with search; device click
  adds rack board + highlight/scroll), +page.svelte (floor pills, undo/
  redo, Elevations link, PatchListPane with its built-in cord editor).
- Titlebar: menu links now absolute per-project (relative hrefs broke from
  nested routes) + "Patching" menu item. Old /patching redirect now targets
  /elevations/patching (?legacy=1 unchanged).
- Verified in browser: boards render labels/tints/dots (037-A01 visible),
  device-click highlight ring + scroll, chip click selects the cord in the
  list and opens its editor, both cord ends ring.
- Next: P-2 (click-click patching + sticky attribute bar + filter bar).
- COURSE CORRECTION (user): not separate tools — the editors are TABS inside
  Elevations. P-1 converted: PatchBench.svelte is an embedded component;
  Elevations gains a main-view tab bar (Elevation | Patching, Frames later)
  under the Titlebar, ?view=patching URL sync (bare-guarded), keydown
  handler stands down on non-elevation views (bench has its own undo keys),
  FloorTabs stay visible under the bench. Standalone route deleted; legacy
  /patching redirect → /elevations?view=patching; Titlebar menu back to 3
  items (absolute toolHref fix kept). Verified in browser: tab switch,
  bench restored from localStorage, URL sync, console clean.

### Session追記 (2026-08-16 — Patching P-2 shipped)
- P-2 ✅: patching interactions on the bench. BenchEditor gains portClick
  (select-existing → arm → complete; same-room gate with an explanatory
  hint — cross-room = structured interconnects), sticky {cable, status},
  cord creation mirroring elevations (getCableType color, auto length via
  calculateCableLength, kind 'patch'), armed statusHint in the toolbar.
  Port filter: substring on label/port#, LOC-type chips (incl. project
  custom types), free-only; non-matching chips dim to 25%; Enter cycles
  jump-to-next-match (amber ring + scrollIntoView via per-board effect on
  data-pk attrs); Esc cascade disarm → clear jump → deselect. Attribute +
  filter bar as a second toolbar row.
- Verified in browser: arm hint + amber ring, U42/01 ↔ Server U20/1 created
  with auto 1.5m length and selected in the list editor, filter "031"
  dimmed all but U35's 01A.031x chips, Enter jumped, undo removed the test
  cord. (Concurrent user test patch explained a transient count bump.)
- Next: P-3 (bulk N↔N with mapping preview, Patch… entry from Elevations
  selection); P-4 trace waits for Frames F-1 links.

### Session追記 (2026-08-16 — Patching P-3 shipped)
- P-3 ✅: BULK N↔N — Ctrl+click builds an ordered source set (purple rings +
  order badges), "Patch to…" enters destination-picking (plain or Ctrl click
  appends, teal badges, x/N hint; occupied ports rejected), auto-opens a
  mapping preview at N/N (rows src → dst with fallback labels, cross-room
  rows flagged + skipped), Create writes one undoable mutation per room.
  Esc cascade: preview → bulk → arm → jump → selection.
- "Patch…" hand-off from Elevations: Inspector rack section button opens the
  Patching tab with the selected rack(s) benched + first port-bearing device
  highlighted (one-shot seed prop, ts-keyed).
- Multi-room was already structural (P-1 subscribes rooms A–D).
- Verified in browser (synthetic ctrl+clicks — the automation modifier
  gotcha, real ctrl+click fine): 3 sources → dest picking correctly
  rejected an occupied port (2/3) → 3/3 opened preview → Create 3 → 17→20
  cords → single undo → 17. Hand-off benched Rack 2 + highlighted the 96p
  switch. NOTE dev-mode renderer stalls under CDP screenshots recurred
  (known §9 watch item); JS probes used instead.
- Remaining: P-4 circuit trace (waits for Frames F-1 structured links).

### Session追記 (2026-08-16 — Frames F-1 shipped; bundles ON HOLD)
- BUNDLES ON HOLD (user): structuredLinks carry NO bundle fields; the
  tag/color design in §14 is deferred until asked for.
- F-1 ✅: $lib/elevation/links.ts — StructuredLink {id, kind outlet-run|tie,
  a: panel port, b: location port | panel port, cableType?, lengthM?,
  status design|installed, notes?}; deterministic linkIdFor(SL-dev-port);
  bootstrapLinks generates outlet-runs from bakedLabels (idempotent, never
  overwrites, skips endpoints covered by ties) — 3 tests. FramesEditor
  (elevations/frames/): multi-room reads, frames-doc sync echo-gated on
  {structuredLinks} ONLY (merge-safe vs the elevation editor's fields),
  in-memory rebootstrap as rooms load (persists on first edit), link CRUD
  with undo, locations coverage map, own bench (framesbench: key).
  UI: Frames TAB in Elevations (view=frames) — PanelTree (panels only),
  RearRackBoard (dashed = unterminated, solid + dot = linked, violet = tie),
  Locations coverage pane (linked x/N per location), Structured-links table
  (inline cable/status edit, remove). Legacy /frames redirect → view=frames
  (?frame= deep-link still goes to elevation-view focus).
- Verified in browser: 3 links bootstrapped from the Test Project's baked
  labels (037-A01, 01A-038A, 01A-039.1), board link-states render, console
  clean.
- NOTE / F-2 candidate: links only exist for BAKED ports (by design — bake
  = truth). Engine-allocated ports need a "bake current allocation" action
  to get full coverage on legacy projects.
- Next: F-2 (manual terminate flow: rear port → destination via embedded
  floorplan + locations list; block assign/clear; sticky cable attrs).

### Session追記 (2026-08-16 — Frames F-2 shipped)
- F-2 ✅: manual terminate + block ops + bake-allocation. DESIGN CALL:
  terminating writes LINKS ONLY — labels stay as-is (baking remains the
  explicit generate/bake actions' job). This keeps undo clean: undoing a
  terminate can't be resurrected by the baked-labels bootstrap.
- PortInfo gained locationId/locationPort (structural source) on all three
  resolution paths (engine, pinned, baked) — powers bake-allocation and
  destination pairing.
- Flows: click an unterminated rear port → armed (amber + hint) → pick a
  free port chip in the expanded Locations row → outlet-run link with the
  sticky cable type. Ctrl+click builds a mixed block: "⇐ N" button on each
  location terminates the unlinked selection to its free ports in order
  (shortfall keeps the remainder selected); "Clear N links" removes the
  linked subset. Esc cascade: arm → block → link selection.
- "Bake allocation (N)": confirm-gated, writes ONLY a bakedLabels patch
  (deep-merge, add-only, not undoable) + rebootstraps links and persists
  them. Legacy projects get full link coverage this way.
- Verified in browser: armed U33-P14 → A-001 p2 link with cat6a sticky
  cable + fallback panel label; undo removed it (3 links again); bake
  button showed 63 candidates (not pressed — user's call on the practice
  data); console clean.
- Deferred to F-3: embedded read-mostly floorplan destination tab (ties +
  spatial picking together); tie template labels.

### Session追記 (2026-08-16 — Frames F-3 shipped + CRITICAL merge-deletion fix)
- **CRITICAL FIX — map-field deletions never persisted.** db.save uses
  setDoc merge:true, which DEEP-MERGES map fields: deleting a key from
  portAssignments / bakedLabels / structuredLinks wrote a doc without the
  key, but the merge kept the stored one — the deletion silently resurrected
  on the next echo/load (observed live: an undone F-2 link came back).
  Fix: db.saveFields (setDoc with mergeFields = written keys → each listed
  top-level field REPLACES its stored value; unlisted fields untouched).
  Switched: elevations saveFrames (portAssignments/bakedLabels deletions)
  and the FramesEditor links autosave. Array fields (patching connections,
  racks/devices, outlets) were never affected (arrays replace under merge).
  bakeAllocation intentionally KEEPS db.save — its partial bakedLabels
  patch relies on deep-merge. Verified: deleted links stayed deleted across
  a full reload.
- F-3 ✅: TIES — with a rear port armed, clicking another unterminated rear
  port completes a tie (locations still complete via the pane); tie labels
  are DISPLAY-DERIVED (`RackA~RackB:NN`, NN stable per pair by sorted link
  ids) so both ends match by construction with nothing stored — the §14
  "template-derived" intent without label-write coupling (configurable tie
  template = later polish). Tie chips show the tie label + violet ring.
- F-3 ✅: FLOORPLAN destination tab (PlanPicker) — read-mostly picker-grade
  embed: calibrated PDF page as an image + outlet dots positioned from mm
  coords, colored by the linked location's coverage (emerald full / amber
  partial / blue pickable when armed); clicking an outlet terminates the
  armed port to its location's next free port. Full editing stays in the
  Floorplan tool. Verified: tie created via click-click; plan tab rendered
  20 dots on the Test Project floorplan.

### Session追記 (2026-08-16 — usage flow + tab order + floorplan pan/zoom)
- Tab order swapped to **Elevation | Frames | Patching** (user: the normal
  flow assigns rear-port usage/terminations first, then patches).
- USAGE ASSIGNMENT on rear ports (Frames tab): Ctrl+click a block → usage
  chips in the toolbar (desk/AP/PR/… + project custom types + "none") create/
  remove PORT RESERVATIONS — the same records the Elevation view edits, saved
  as a whole-field replace, undoable. Rear chips show the reservation tint +
  type text on unlabeled cells (mirrors PanelDetailStrip).
- AUTO-TERMINATE (N): creates outlet-run links for every allocated-but-
  unlinked panel port, following the engine's allocation — which already
  fills usage-reserved ports with MATCHING-type locations first, then
  unreserved ports. This implements the user's flow: reserve usage → outlet
  ports auto-assign to same-usage panel ports first → links follow. Undoable
  (unlike Bake, which stores label strings).
- PlanPicker upgraded: wheel-zoom at cursor + drag pan (any button; dots
  stay clickable), Fit button, and an Enlarge popout (85vw/85vh overlay,
  same viewport snippet). Dots keep constant screen size (counter-scaled).
- Verified in browser: tab order, 2-port AP reserve + hint + undo,
  Auto-terminate (63) offered, floorplan tab with 20 dots + Fit/Enlarge.

### Session追記 (2026-08-16 — frames UX feedback + F-4 checks panel)
- Selection actions moved OFF the main toolbar to a full-width purple
  selection bar (own row, flex-wrap) — no more cramped 2-line wrapping.
- Tie-intent hover messages (user kept creating accidental ties): free
  chips now say "click: set first port of a link (tie or outlet run)";
  with a port armed, other free chips say "click: set tie link destination
  · {armed} ↔ this port · (or pick a location/outlet in the pane)"; the
  armed chip says "click again to cancel".
- Block selection: Shift+click extends a RANGE within the same device
  (anchor = last Ctrl/Shift-clicked port); Ctrl+click still toggles.
- F-4 checks panel ✅ (partial): third destination tab "Checks" with an
  amber count badge — Label sync counts (stale/orphaned/printed, apply
  still in the Elevation view's dialog), Unassigned location ports,
  Orphaned links (endpoint device/location gone; one-click remove),
  and an unlinked-locations summary pointing at Auto-terminate.
- F-4 remaining: drag-to-move terminated port blocks (collision checks +
  printed warnings). Then Patching P-4 (circuit trace).
- Verified in browser: range → "8 ports selected" in the new bar,
  tooltips carry the tie-intent text, Checks badge = 6 real findings.

### Session追記 (2026-08-16 — instant tooltips, no layout shift, P-4 TRACE shipped)
- Instant tooltips: parts/instantTip.ts — delegated `use:tipHost` container
  action + singleton fixed div; chips use data-tip (no native-title delay).
  Applied to both benches' boards + the trace strip. Patch-bench chips also
  gained intent text ("set first port of a patch cord" / "click: connect
  A ↔ this port" / "armed — click again to cancel").
- Frames selection bar is now an ABSOLUTE overlay over the boards area —
  no more canvas shift when it appears.
- P-4 ✅ CIRCUIT TRACE: $lib/elevation/trace.ts walkCircuit — alternating
  cord/link path walker (ports carry ≤1 cord + ≤1 link → circuits are
  simple paths), id-based, cycle-guarded; 5 tests incl. the user's
  server→tie→switch example and mid-circuit starts. Patch bench shows a
  Circuit strip above the patch list for the selected cord: node chips
  (click → board + highlight) joined by cord/tie/run edge badges; location
  ends render emerald. Links come free from the already-subscribed frames
  doc. Verified live: 01A.037B —cord→ 01A-038A —run→ A-038·p1.
- NOTE: chains extend as links exist — Auto-terminate/Bake give legacy
  projects full-depth traces.
- Program status: §13 P-1..P-4 ✅ ALL SHIPPED; §14 F-1..F-3 ✅ + F-4 checks
  panel ✅ — ONLY remaining item: F-4 drag-to-move terminated port blocks.

### Session追記 (2026-08-16 — F-4 drag-to-move shipped: §13+§14 PROGRAM COMPLETE)
- Drag-to-move terminated port blocks ✅: drag any SELECTED rear chip to
  move the whole selection to a consecutive run starting at the drop anchor
  (same panel or another). What moves: structured links (endpoints
  rewritten; bootstrap-derived ids re-derived for determinism), baked
  labels, and position pins. What stays: patch cords (front-side, physical
  port) and usage reservations (position semantics). Validity live during
  drag (emerald/red rings + cursor ghost "N ports · drop here/blocked"):
  targets must fit the device and be free of links/baked/pins (source
  ports vacated by the move are fine). Printed panels confirm first.
  Single undoable step (echo-safe: link autosave pending-status blocks the
  interim saveFields echo). Fixed en route: rear chips were missing the
  data-pk attribute the hit-test needs.
- Verified live (synthetic drag): 2 linked ports moved U32:6,7 → 15,16 —
  labels traveled, the desk reservation stayed at the old position, one
  Ctrl+Z restored everything.
- **STATUS: §13 Patching P-1..P-4 and §14 Frames F-1..F-4 are ALL SHIPPED.**
  Remaining backlog outside the program: Elevations simplification (cords
  view-only), port-label readability on printed sheets, stroke-width
  verdict, plan-view×outlets sync, bundles (on hold), tie-template config,
  legacy migrations.

### Session追記 (2026-08-17 — end-to-end field test on L04 + findings)
Executed the full workflow on floor 4 (docs/wire-a-floor.md is the write-up):
cleared old frame data; 72 ports labeled 4A001-01…4A012-06 via ONE
Auto-generate (custom template FZNNN-PP); 12 outlets placed+linked via the
place-location picker (Cat6, ports adopted); relabeled outlets 4A001…;
24 cords in 4 bulk rounds (checkerboard switches, side-separated,
VLAN ports 1/12/13/24 untouched); circuits trace desk→panel→switch.
- FIXED during test: patch-bench trace missed links that existed only as
  the Frames tab's in-memory bootstrap — BenchEditor now runs the same
  bootstrapLinks over the frames doc.
- FINDINGS / TODO CANDIDATES:
  1. Stale-outlet id collision: deleting + regenerating locations reuses
     deterministic ids, so OLD outlets silently claim the new locations
     ("unplaced" list wrong). Location delete should unlink referencing
     outlets, or Checks should flag label/link mismatches on outlets.
  2. No "clear floor/zone data" action — cleanup = unpin per panel +
     remove reservations + Generate 0 + delete cords + delete outlets.
  3. Outlet display-label convention is hardcoded Z.NNN; user wanted
     4A001 → had to relabel 12 outlets manually AND Sync-from-locations
     would revert them. Outlet labels should be template-driven.
  4. Custom-template preview shows sample floor 1 ("1A023-04") — should
     preview with the ACTIVE floor/zone.
  5. "Patch by rule" wizard candidate: pattern-based bulk (N ports per
     outlet, alternate switches, side mapping, skip reserved switch
     ports) — the checkerboard/side rules were all manual selection.
  6. Switch-port reservations: reservations only exist on panels; VLAN/
     uplink switch ports can't be marked reserved — avoided by hand.
  7. Place-mode could offer "place next in sequence" (auto-arm the next
     unplaced location after each placement) — halves the clicks.
  8. Select-all per panel accumulates across panels (good); a rack-level
     "select all panel ports" would help bigger jobs.

### Session追記 (2026-08-19 — overnight re-test on L04: 4 fix/feature rounds, all committed)
Re-ran the full L04 field test with the friction fixes in place, two browser
tabs (actor + live watcher), fixing every bug found; committed after each
verified round.

**Round 1 — `5116f4e`** outlets stale-doc revert + template-aware ⚠ label.
- BUG (critical, found live): "Link all" linked 12 outlets, then silently
  UNLINKED them. The remote-apply $effect read `autosave.status` ($state) and
  `payloadOf()` inside its tracking scope, so any local edit re-ran it while
  `data` still held the pre-save doc → stale doc re-applied → revert
  autosaved. Fix: wrap the whole apply in `untrack()` — the effect now
  depends ONLY on the subscribed doc. (Same audit done on the other AutoSave
  consumers: they call shouldApplyRemote from subscription callbacks, not
  effects — unaffected.)
- BUG: OutletProperties flagged correct template labels ("4A001") as
  "⚠ label" — divergence check was hardcoded legacy Z.NNN. Now uses the
  template-aware expectedOutletLabel passed from Outlets.
- Verified: Clear floor → outlets auto-unlinked (finding #1 fix) live in the
  watcher tab; one Auto-generate re-labeled 72 ports (template FZNNN-PP +
  outlet template FZNNN persisted; active-floor previews (finding #4 fix)
  show "4A023"); Link all relinked 12 by rendered label — ZERO manual
  relabels (finding #3 fixed).

**Round 2 — `3d2ea05`** template-aware default labels for NEW outlets
(placed junk got "A.001" colliding with the 4A001 convention → now renders
the outlet template with max-used+1: "4A013"). Live-sync test passed: junk
outlets created + deleted in one tab appeared/disappeared in the other
WITHOUT refresh — the originally-reported delete-sync bug is fixed.

**Round 3 — `f33e61d`** corrected checkerboard + Delete-key for cords.
- 24 cords patched and audited against the Firestore doc (in-page import of
  db.svelte.ts): exact match. U41 ← outlets 1,5,9 (left, sw 2-7) + 4,8,12
  (right, sw 14-19); U39 ← 2,6,10 + 3,7,11. Neighbors alternate down both
  desk columns AND across rows — true checkerboard. VLAN ports untouched.
- UX: Delete/Backspace now removes the selected cord on the bench (was
  list-pane-only).
- Circuit strip re-verified: A-001·p1 → run → 4A001-01 → cord → 4AR01-U41-P2.
- Red endpoint rings (`ring-red-500`) confirmed visible on from/to chips.

**Round 4 — `4a8ffd0`** Floorplan main-view tab (the answer to "switching
between Outlets and frames/patching is time consuming"): the FULL Outlets
editor is embedded as a 4th tab in Elevations via a new `embedded` prop
(sidebar + floor tabs, no Titlebar). elevations/+page subscribes outlets doc
(floor+primary area), files, all-room racks. Same doc as the standalone tool
— edits live-sync both ways (verified). ?view=floorplan deep-links.

**Also verified:** place-next mode (finding #7) — deleted 4A011/4A012,
re-placed via palette: after each click the next unplaced location auto-arms
("Placed 4A011 — next: A-012 (Esc to stop)" → "all locations placed").

**Automation note (not an app bug):** cord creation measured at 8–12ms; the
apparent ~10s/cord during scripted loops was Chrome background-tab timer
throttling starving awaited setTimeouts — keep the automated tab focused or
avoid timer-paced loops.

**Findings still open:** #5 patch-by-rule wizard, #6 switch-port
reservations, #8 rack-level select-all.
