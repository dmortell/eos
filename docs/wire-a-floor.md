# Walkthrough: wiring a floor end-to-end

A worked example of the full structured-cabling workflow using the Elevations
tool's three tabs (Elevation → Frames → Patching) plus the Floorplan tool.
Scenario: 12 six-port desk outlets on floor 4, terminated on rack 4AR01's
patch panels from U38 down, labeled `4A001…4A012`, with the first two ports
of each outlet patched to two Arista switches in a checkerboard pattern and
side-separated cords.

## 0. Clean the floor (if re-planning)

There is no single "clear floor" action yet — clean up in this order:

1. **Pins & baked labels** — Elevation tab → select each panel → panel strip
   **Select all** → block bar **Unpin**. This clears sticky pins *and* baked
   label strings for those ports.
2. **Reservations** — Locations tab → Reservations list → **×** each entry.
3. **Locations** — Locations tab → set the zone's location count to `0` →
   **Generate** (generate truncates to the given count).
4. **Cords** — Patching tab → patch list → select-all → delete.
5. **Old outlets** — Floorplan tool → Ctrl+click rows in the Outlets list →
   **Delete N**. Do this *before* re-generating locations: recreated
   locations reuse deterministic ids, so stale outlets can silently claim
   the new locations as "already placed".

## 1. Allocate & label the panel ports (Elevation tab)

1. Select the first destination panel (sidebar or canvas) — the **panel
   detail strip** opens at the bottom.
2. Click **Select all** in the strip; repeat for each panel, top-down
   (selection accumulates, and allocation follows rack order → RU top-down
   automatically). Example: U38, U37, U36 = 72 ports.
3. Click **Auto-generate…** in the block bar:
   - **Zone** (e.g. A), **Ports/location** (6), **Start number** (auto),
     **Type** (desk).
   - **Label format**: pick a preset or **Custom…** — e.g. template
     `FZNNN-PP` renders `4A001-01`. `F`=floor, `Z`=zone, `N`=location,
     `P`=port; repeat a letter to zero-pad; `"quotes"` for literals;
     `[ ]` renders only when its tokens have values. **Save to library**
     stores the template for every project.
4. **Assign** — this single action creates the locations, pins their ports
   to the exact panel positions, and bakes the label strings (baked labels
   are the truth: re-generation never moves them, and they move with the
   panel if the panel moves).

## 2. Place the outlets (Floorplan tool)

1. Open the Floorplan tool → **Outlets** sidebar tab.
2. Set the sticky **defaults** first (Cable = Cat6 for U/UTP, usage, mount).
3. The **Unplaced locations** list shows every location with no outlet.
   Click a location, then click its desk on the plan — the outlet is *born
   linked*: label, port count and per-port labels are adopted from the
   location, so its properties immediately show the real panel labels
   (`4A001-01…`). Repeat per desk. Esc cancels place mode.
4. Outlet display labels default to `Z.NNN` (`A.001`). If your convention
   differs (e.g. `4A001`), edit the Label field per outlet — but note
   **Sync from locations** re-derives `Z.NNN` and will overwrite custom
   outlet labels.

## 3. Terminations (Frames tab)

Open Elevations → **Frames** tab. The rear boards show every panel's
termination state; the baked allocations from step 1 appear automatically as
**outlet-run structured links** (dashed = unterminated, dot = linked).

- **Usage first**: Ctrl+click (or Shift+click for a range) rear ports →
  usage chips in the selection bar reserve them (desk/AP/…) — the label
  engine then allocates matching-type locations to those ports first.
- **Auto-terminate (N)**: creates links for every allocated-but-unlinked
  port, following the engine's usage-aware allocation.
- **Manual**: click an unterminated port (armed, amber) → pick a location
  port in the Locations pane, an outlet on the Floorplan pane, or another
  rear port for a **tie**.
- **Checks** pane: label-sync status, unassigned location ports, orphaned
  links.
- **Move**: select a block and drag any selected chip to another run of
  ports — links, baked labels and pins travel; cords and reservations stay.

## 4. Patch (Patching tab)

1. Add the rack(s) to the **bench** from the tree — each rack is a board of
   port chips (labels, tints, cord dots).
2. Set the sticky **Cable** and **Status** in the toolbar.
3. Single cords: click a free port (armed) → click the destination port.
4. **Bulk**: Ctrl+click the source ports *in order* (numbered purple
   badges) → **Patch to…** → click the destination ports in order (teal) →
   review the mapping table → **Create**. Occupied ports are rejected
   automatically; cross-room pairs are flagged and skipped.
   - For side-separated cabling, run one bulk round per switch per side
     (e.g. left-frame outlets → left switch ports 2–11, right-frame →
     14–23, skipping reserved uplink/VLAN ports).
5. **Filter bar**: substring, usage chips, free-only; Enter jumps to the
   next match.
6. **Circuit**: selecting any cord shows its full chain —
   `A-001 · p1 —run→ 4A001-01 —cord→ 4AR01-U41-P2` — click a hop to pull
   that device onto the bench.

## Result for this walkthrough

- 12 locations `4A001…4A012` (6 ports each), 72 panel ports labeled
  `4A001-01…4A012-06` on U38/U37/U36 in one Assign.
- 12 linked outlets placed on the left desk bank, Cat6, ports adopted.
- 24 cords: odd desks → U41 Arista, even desks → U39 (checkerboard);
  left-of-frame ports (1–12) to switch ports 2–7, right-of-frame (13–24) to
  14–19; switch ports 1, 12, 13, 24 left free for VLAN uplinks; lengths
  auto-calculated.
