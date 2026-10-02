# Phase 3 plan: racks, ports, allocation, patching (replaces Elevations)

**Status:** REVIEWED (Dave, 2026-10-02); the decisions are in §9.
**Slice 3.1 (rack-row view) is built**, since it doesn't depend on them; see §11.

**Goal (analysis §7):** allocate a floor's outlets to panels, and produce the patch list and BOM, in the cad tool.
Then Elevations (which already absorbed Racks, Frames and Patching) can retire.

**Exit criterion:** on a real project (LR or Project Journey, imported with Dave's OK):
- every outlet port has a panel port (or is reported as unallocated)
- cords can be added, re-patched and marked installed
- the patch list, patch schedule Excel and cable / rack BOM match what Elevations produces for the same data, apart
  from the known legacy bugs (§7)

---

## 1. What Elevations does today, and where it goes

Elevations is 7.4k lines: `editor.svelte.ts` 1.7k, `Elevations.svelte` 1.3k, `bench.svelte.ts` 660,
`frames-editor.svelte.ts` 706, and the pure `$lib/elevation/*`.

| Elevations today | In cad | Change |
|---|---|---|
| Row elevation, mm-accurate (`RackElevationRenderer`), front / rear | **Rack-row view** generator (§3), front / rear as a view spec | Generated from data; same mm geometry |
| Focus model (row → rack → rack pair), fit presets | Kept: focus = which racks the view fits; dbl-click a rack focuses | Lives in the view's camera, not a separate stack |
| Ports layer with LOD (cells → short → full stacked labels) | Kept, in the generator (LOD by cell mm × zoom) | The same rules (elevations-plan §3.3) |
| Panel detail strip (constant-size HTML grid) | Kept: opens for a selected panel, docked over the bottom panel | Labels come from `ProjectIndex.portLabel` |
| Device placing (palette / catalogue drag, RU snap, Ctrl-drag copy, offsetX snap, front / rear) | **Device tool** + Properties | One move / grip path (the kernel) |
| Racks: rows, add / reorder, rack properties, compat rules | Rack list (exists) + row editing; compat rules ported (`racks/parts/compat.ts`) | |
| Locations tab (Frames zone / location entry) | **Gone as a separate thing.** Locations ARE outlets (ADR 0001); the outlets grid already edits them | Add the missing grid columns: server room per port, room, number of ports |
| Labels: template engine, baked labels, Sync labels, divergence | **Labels are text on outlet ports** (ADR 0002); panels SHOW them through links; Renumber | No baking or Sync. Divergence becomes "printed panel whose linked labels changed" (`labelsPrintedAt`) |
| AssignPorts dialog, reservations, pins (`portAssignments`) | **Allocation** (§4): auto-allocate, assign selected ports, reservations, pinned links | Links ARE the allocation; one engine, tested against the legacy one |
| Patch mode, cords, sticky cable type / colour / status, F / T re-route, bulk N↔N | **Cord tool** (§5) + cord Properties + bulk dialog | Same behaviour, store / undo of the kernel |
| Status workflow add / remove / change / installed, soft delete | Kept on `Cord` (already in the schema, imported) | |
| Cable length (`cableUtils`: Manhattan, nearest manager, front↔rear depth, slack, standard lengths) | Ported pure into `domain/`, fed real mm geometry | |
| Circuit trace (outlet → link → panel → cord → switch) | Ported (`$lib/elevation/trace.ts` logic over cad links / cords) | |
| Patch list (bottom panel, filters, status chips, row ↔ cord selection) | Bottom-panel tab next to Outlets | |
| Excel: patch schedule + cable BOM, cord-ID import, frame-label export | Ported exporters (`patching/parts/exportExcel.ts`, frames export) | |
| Rack BOM (Panduit catalogue, containment kits) | Ported (`racks/parts/bom.ts`, `$lib/catalog`) + merged into the cad BOM | |
| Print (rack elevations, panel label sheets) | **Phase 4** (sheets). Until then Elevations stays for printing | |
| Riser / building level (elevations-plan §7) | Phase 5 (risers) | |

---

## 2. Principles carried over from elevations-plan, and what changes

**Carried over (they worked):**
- **D1:** mm-accurate geometry with a port layer and LOD.
- **D4:** ports are identified structurally (`PortRef {on, port, face}`), never by label.
- **The port-level gate:** an unlabelled port can't be patched; clicking it explains why and offers to assign it.
- **Sticky allocation:** re-running allocation never moves an existing assignment.
- **The patch list is a live view,** not a saved deliverable.
- **Constant-size panel strip** for reading labels at any zoom; print is a fixed-size layout.

**Changed by the cad data model:**
- **No three-collection join** (racks / frames / patching docs): racks, devices, links and cords are entities in one
  store with one undo.
- **No label engine at run time:** a panel port shows its linked outlet port's TEXT label (ADR 0002). Bulk
  generation of labels happens when outlets are created (next label / Renumber), not when panels are drawn.
- **Allocation writes links,** not `portAssignments` + `bakedLabels`. "Pinned" is a flag on a link.
- **One selection model, one Properties panel, one grid panel** for every entity, as in Phase 2.

---

## 3. Views and navigation

- **New view kind `row`:** `{ kind: 'row'; rowId | spaceId; face: 'front' | 'rear'; focus?: rackIds[] }`. It shows
  the racks of a row (or of a server room without rows) side by side at their order and widths, in mm (x along the
  row, y = −height from the floor). It comes from a new generator, `views/rackRow.ts`:
  - rack frames, U ticks and numbers
  - devices on that face (PDUs as 0U side strips)
  - port cells with LOD labels
  - cords as a layer: front cords on the front view, rear links shown faintly
  - datum lines (floor, ceiling) from the level
- **Getting there:**
  - The left panel's rack list gains server room › row › rack levels.
  - Clicking a row opens the row view in the active pane. Split view puts the plan and the row side by side.
  - The pane's view buttons gain "Row" when a row or rack is selected.
- **Focus:** double-click a rack to fit it; Shift-double-click adds a second (the patching pair); Esc goes back to
  the row. This is camera framing, with no separate state machine.
- **LOD** (elevations-plan §3.3 thresholds), keyed off cell mm × zoom:
  - cells only
  - then a 2-line short label
  - then the 3-line full label
  - a tooltip always shows the full label and the connection

---

## 4. Allocation (the heart of Phase 3)

**Model:** allocation IS the set of `Link`s (horizontal: panel rear port ↔ outlet port). Nothing else stores it.

**Engine:** `domain/allocate.ts`, a pure `allocate(outlets, panels, rules) → { links, unallocated, issues }`.

**Rules** (to confirm in §9), taken from the Frames engine:
- Ports go to panels of **their server room** (`OutletPort.serverRoomId` ↔ `PanelInfo.serverRoomId`) and **tier**
  (low → floor panels, high → high-level panels).
- **Order:** by outlet label (natural sort), then port number. Panels fill in rack order, then from the top U down
  (or bottom up — §9), then port 1…n.
- **Reserved ports** (`PanelInfo.reservations`) only take outlets of that usage.
- **Pinned links never move.** Allocation only fills free ports, so re-running it is additive (sticky).
- **Overflow:** ports that don't fit are reported in the issues grid, not squeezed in.

**Tools:**
- **Auto-allocate** a level / zone / server room: a preview first, then apply as one undo step.
- **Assign selected ports:** select panel ports, then pick outlets in the grid, or "next N outlet ports in order".
- **Reserve selected ports** for a usage.
- **Pin / unpin**, and **unallocate**, which refuses while the port has a cord, per the soft rules.

**Validation:** the legacy engine (`buildPortInfoMap`) is run on the imported real projects and compared with
`allocate()`. Differences must be explained: the LR floor-10 duplicate (phase1.md finding 1) is a legacy bug, and
the new engine fills each rack once.

**The allocation grid** (bottom-panel tab): per panel, a 24 / 48 grid of its ports (label, outlet, usage tint,
reserved, pinned, cord) — Frames' view as a table. It edits the same links.

---

## 5. Patching

- **Cord tool (P):** click port A, then port B. The cord gets the sticky cable type / colour / status and an auto
  length from `cableLength()`, ported from `patching/parts/cableUtils.ts` and fed real mm geometry: rack positions
  on the plan, rack depth for front↔rear, nearest manager, slack, rounded up to standard lengths.
- **Gate:** an unlabelled or unallocated port (shows `—`) refuses a cord, and the status bar says why.
- **Cord Properties:** ends, re-route an end (F / T), type, colour, length (lock), cord ID, status, notes.
- **Status workflow:** add / remove / change / installed. Deleting an installed cord marks it `remove` (soft
  delete), as today.
- **Bulk patch:** device A ports a..b → device B ports c..d, validated, skipping occupied ports, as one undo step.
- **Circuit trace:** select an outlet port or a panel / switch port to highlight the whole circuit, with a trace
  line in Properties.
- **Patch list tab:** filters, status chips; selecting a row selects the cord, and vice versa.

---

## 6. Exports and BOM

- **Patch schedule + cable BOM (Excel):** port of `patching/parts/exportExcel.ts`, grouped by status.
- **Cord-ID import (Excel):** port of `importCordIds`.
- **Panel labels (Excel):** what Frames exported (per panel, the port labels as printed) — for label printers.
- **Rack BOM:** port of `racks/parts/bom.ts` + `compat.ts` with the Panduit catalogue. It merges into `bom()`
  (racks, VCMs, containment kits by SKU) alongside the outlet / containment / cable lines that exist.
- **Printing rack elevations and label sheets:** Phase 4 (sheets).

---

## 7. Data model deltas (small, additive)

- `Device.portNumbering?: 'row' | 'column'`: switches number column-major (elevations-plan §3.3). Presentational
  only.
- `Device.portRows?: 1 | 2`: 48-port 1U panels; today inferred from the count.
- `Link.pinned`: already in the schema.
- **Device templates (library):** legacy keeps them per project (`racks/{pid}_library`). Proposal: GLOBAL, like
  blocks, in one doc `settings/cadDeviceTemplates`, plus the Panduit catalogue (§9).
- **Importer additions:** device templates, `portNumbering` if Elevations stored it, the legacy reservation cells
  for 48-port panels (top / bottom row → port number; done for 24 / 48 in phase 1, to verify on real data).

---

## 8. Slices (each ends with a live check on Test Project; tests first)

| # | Slice | Contents | Exit check |
|---|---|---|---|
| 3.1 | **Rack-row view** | the `row` view spec + generator (racks, U, devices, ports, LOD), rack tree in the left panel, focus / fit, split plan + row | Test Project's server room A row reads like Elevations, front and rear |
| 3.2 | **Racks and devices** | add rack (to a row / room), reorder, rack Properties + compat warnings; device tool (template / catalogue → click a U), move by U (snap, overlap = refuse), face, port count / type / numbering; device templates | Build a rack from empty: panels, a switch, a manager |
| 3.3 | **Ports and labels** | select ports (single / block), port Properties (the linked outlet port's label, editable, or the device's own label when unlinked), panel detail strip, printed flag + warning | Rename an outlet → the panel shows it; a printed panel warns |
| 3.4 | **Allocation** | `allocate()` + tests, compared with the legacy engine on LR / Journey (read-only); auto-allocate with preview; assign / reserve / pin / unallocate; allocation grid tab; issues (overflow, server-room mismatch) | Allocate Test Project 1F from scratch; matches Elevations where Elevations is right |
| 3.5 | **Patching** | cord tool, gate, cord Properties, sticky defaults, length, status workflow, bulk, circuit trace, patch list tab | Patch 2 panels to a switch; the patch list and trace read right |
| 3.6 | **Exports + BOM** | patch schedule / cable BOM Excel, cord-ID import, panel label export, rack BOM (Panduit) into `bom()` | Exports match Elevations' for the same data |
| 3.7 | **Real data + cutover** | import LR and Journey (with Dave's OK), compare with Elevations, list differences; Elevations stays for printing until Phase 4 | Dave signs off the comparison |

Rough size: 3.1–3.3 are a slice each, like Phase 2's; 3.4 and 3.5 are the big ones; 3.6 and 3.7 are smaller.

---

## 9. Decisions (Dave, 2026-10-02)

1. **Device templates are GLOBAL**, like blocks: in one doc `settings/cadDeviceTemplates`, plus the Panduit
   catalogue.
2. **Allocation order:** **top down**, racks in **row order**, filled **one after another**.
   - **High-level ports go to high-level panels first** (they overflow to floor panels only if those are full).
   - People then grab a bunch of outlets and drag them to other panels by hand.
3. **Several racks in a room:** fill rack 1, then rack 2 … (fixes the legacy duplicate).
4. **Cords:** keep the **4-state workflow** (add / remove / change / installed).
5. **Panel detail strip:** useful as a zoomed-in panel view. **Later**, if canvas zoom proves insufficient.
6. **The outlets grid is enough** for allocating outlets to server rooms / racks. No Frames-style location sheet.
7. **Racks are drawn on the floor plan, then assigned to rows.**
   - No row-builder tool.
   - The row view orders racks by their row, then their plan position along the row (to confirm in 3.2: left to
     right as seen from the front).

## 9a. The original questions (answered above)

1. **Device templates:** global (like blocks) or per project (like today)? *Proposal: global.*
2. **Allocation order:** fill panels top U down, or bottom up? Rack order = the row's order? High-level ports only
   on high-level panels? *Proposal: Frames' current behaviour, written down and tested; tell me where it's wrong.*
3. **One rack or several per server room:** when a room has 3 racks (LR 10F), should allocation fill rack 1, then
   rack 2…? (Legacy fills all three with the same labels, which is the bug.)
4. **Status workflow:** keep add / remove / change / installed exactly, or simplify (e.g. design / installed like
   links)?
5. **Panel detail strip vs canvas LOD:** keep both (Elevations has both), or rely on one?
6. **Locations tab:** is the outlets grid (with server room per port, room, port count columns) enough for data
   entry, or do you want a dedicated Frames-style location sheet (zone × number rows)?
7. **Racks on the plan:** today a rack's plan position comes from Outlets' rackPlacements, and rows have a
   room-relative origin. Should a row's racks be laid out on the plan from the row (adjacent, in order), or placed
   one by one (as now)?

## 10. Risks

| Risk | Mitigation |
|---|---|
| Allocation semantics drift from what people are used to | Run the legacy engine and the new one on real data and diff them (3.4) before anything is written |
| Label readability at row zoom | Proven pattern from Elevations: LOD + stacked labels + the constant-size panel strip |
| Elevations users mid-project | Elevations keeps running on its own data; cad imports once; no sync back (ADR 0001) |
| Size | Slices ship separately; 3.1–3.3 are useful on their own (viewing and editing racks with labels) |

## 11. Progress

### Slice 3.1 — rack-row view (built 2026-10-02)
- **View spec and generator:** a new view spec `{ kind: 'row', spaceId, rowId?, face }` and `views/rackRow.ts`.
  - Racks side by side at their real widths, in row order; the rear view reverses the order.
  - Rails, U ticks and numbers every 5 U.
  - Devices on that face at their U; PDUs as 0U strips.
  - Port cells: row- or column-major (`Device.portNumbering`), 2 rows for 48 ports in 1 U.
  - Port labels: the linked outlet port's label (ADR 0002). Short form (last two parts) when small, the full 3-line
    stack when big — text LOD via `minPx` / `maxPx` on text prims, applied by `Prims` from the zoom.
  - Cords between ports on that face, in their own colour (dashed while `add`).
- **Getting there:** each server room in the left panel's rack list has an **Elevation** button, which opens the
  room's racks in the active pane. The pane shows **Racks front / Racks rear** toggles. It works in split view next
  to the plan.
- **Focus:** double-click a rack to fit it; double-click empty space to show the whole row.
- **Read-only for now:** a drag in the row view moves nothing (devices move by U in 3.2).
- **Tests:** 140 (face filtering, device U, linked label, cords per face, rear order, port numbering, label
  splitting).
- **Live check on Test Project:**
  - Server room A shows 11 racks / VCMs, 16 devices in P3C, 66 linked ports and 20 cords.
  - Labels like `01A.001A` (two parts) are only readable at a deep zoom. That is expected; the panel detail strip
    (3.3) is what makes every label readable at any zoom.
  - Cords are straight with a sag. Routing them through the managers is part of 3.5.

### Slice 3.2 — racks and devices (built 2026-10-02)
- **Device templates are global** (`domain/devices.ts`): 11 built-ins (panels 24/48/fibre, switches, managers,
  shelf, server, vertical PDU) plus `settings/cadDeviceTemplates`, live for every project. **Save as template…** is
  in a device's Properties; saved templates show ★ in the picker.
- **Rack placement rules** (`placementProblem`):
  - A device must fit inside the rack.
  - It must not overlap another device on the same face. A front-only and a rear-only device can share a U.
  - PDUs are 0U and never collide.

  `firstFreeU` scans from the top down, which is the order allocation will use too.
- **Rack tool (K):** each click on the plan draws a new rack like the last one (room, row, size, kind, rotation),
  named after it (A01 → A02). **Place** in the racks list still places one existing rack.
- **Rows:** the Row selector in a rack's Properties, or in a multi-selection of racks in one room, assigns them to a
  row; **New row…** makes one. There is no row builder (Dave).
- **Row order** follows the plan: left to right as seen from the front of the row's first placed rack.
  - Each rack is still drawn from its own front, so a rack turned 90° in the row (P3C beside R311–R313) just shows
    its front too (Dave: fine, the row view is a schematic, not a true room elevation).
  - If a mixed row comes out in the wrong order, add a manual left/right override.
- **Device tool (D):** pick a template in the tool bar, then click a rack at a U in the rack-row view.
  - Placing on the rear view mounts a front-only kind at the rear.
  - Names run PP1, SW1, CM1 … across the project.
- **Moving devices:** Select drags them by whole U, or into another rack when one device is dropped on it. A move
  onto an occupied U stops at the last good place and says why.
- **Device Properties:** name, kind, U, height, face, ports, numbering, panel tier. An edit that would overlap is
  refused with the reason.
- **Status messages** (why a click was refused) show in the tool bar.
- **"Saving… / Saved" fix:** it now follows the actual writes. It used to stay on "Saving…" after a write that
  caused no store change.
- **Tests:** 155 (`domain/devices.test.ts`, `editor/racks.test.ts`, row order, saving indicator).
- **Live check on Test Project:**
  - Added PP1 to R313 at U35. A second click there was refused ("PP2 would overlap PP1 at U35").
  - Dragged PP1 to U29, then deleted it. Back to 328 docs, 44 devices.
  - **Data note for Dave:** R311–R313 are rotated 90°, so their front line is on the wall side and the row reads
    R313 → R311. The floorplan's door swings suggest their fronts face into the room, i.e. 270°. If so, turn them
    with ⟳ and the row order flips to R311 → R313 by itself.
  - *Dave (later the same day):* the rotation is right. The racks face left for airflow, and the PDF is out of date.
- **Rack sizes:** a rack's width, depth and height in mm are now editable in Properties. The mm height is optional
  and defaults to the height from U.

### Slice 3.3 — ports and labels (built 2026-10-02; the panel strip is deferred per §9.5)
- **Selecting ports:** in the rack-row view, click a port, Shift-click a range from the first, Ctrl-click to add or
  drop one; empty space clears the selection. Selected ports are drawn highlighted.
- **Port Properties** (`ui/PortProps.svelte`): each selected port's label, edited **where it is stored**
  (`domain/ports.ts` `setPortLabel`, ADR 0002). A port linked to an outlet edits that outlet port; any other port keeps
  its own label on the device. Each row shows what the port is linked to and ⇄ when it is patched.
- **Printed labels:**
  - **Mark printed** stores `panel.labelsPrintedAt` plus `panel.printedLabels`, a snapshot of what was printed.
  - A panel whose labels have changed since is drawn with its changed ports outlined in red and "⚠ N labels changed
    since printed" next to its name. Properties lists the changed ports. **Printed again** takes a new snapshot,
    **Clear** forgets it.
- **Ask first:** every label edit goes through `CadProject.relabel`:
  - a port label in Port Properties
  - an outlet's port label
  - renaming an outlet, in the grid or in Properties (`renameOutlet` renames its ports too)

  If the edit would change a printed panel, the toolbar asks "Already printed: <panel> port(s) … would change —
  reprint them after", with **Change anyway** and **Cancel**.
- **Fixed:** trunks and walls drew 1 mm wide. A stylesheet `stroke-width` overrode the band's width attribute, so it
  is now set as an inline style.
- **Tests:** 162 (`domain/ports.test.ts`, port clicks in `editor/racks.test.ts`).
- **Live check on Test Project:**
  - Clicking a port of P3C's 24-port panel showed "Port 6 · 01A.024A · outlet A.024 : 1".
  - After Mark printed, editing that label raised the question. Cancel wrote nothing, and Clear removed the flag.
  - The Shift and Ctrl clicks are covered by the unit tests; the browser driver can't send a shifted click.
- **Dave's request, drawn with the Trunk tool:**
  - A 150 × 150 vertical trunk on top of P3C at its corner nearest the room corner, at (−3725, −6791), from z 2105
    (the top of the frame) to 2600 (the ceiling).
  - A 300 × 100 under-floor trunk on the slab (z −300) from under P3C to the IDF 2 entrance door in the right wall,
    (−3450, −7008) → (−733, −7008).
