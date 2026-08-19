# Walkthrough: wiring a floor end-to-end

A worked example of the full structured-cabling workflow using the Elevations
tool's four tabs (Elevation → Frames → Patching → Floorplan).
Scenario: 12 six-port desk outlets on floor 4, terminated on rack 4AR01's
patch panels from U38 down, labeled `4A001…4A012`, with the first two ports
of each outlet patched to two Arista switches in a checkerboard pattern and
side-separated cords.

## 0. Clean the floor (if re-planning)

**Locations tab → Clear floor…** removes everything the labeling side owns in
one confirmed action: locations, reservations, pins, baked labels, structured
links and patch cords for the floor. Outlets on the floorplan are kept but
**automatically unlinked** — so when locations are re-generated (they reuse
deterministic ids) the old outlets cannot silently claim them; they simply
show up ready for **Link all** (step 2.4).

To remove the drawn outlets too: Floorplan tab → Ctrl+click rows in the
Outlets list → **Delete N**.

## 1. Allocate & label the panel ports (Elevation tab)

1. Select the first destination panel (sidebar or canvas) — the **panel
   detail strip** opens at the bottom.
2. Click **Select all** in the strip; repeat for each panel, top-down
   (selection accumulates, and allocation follows rack order → RU top-down
   automatically). Example: U38, U37, U36 = 72 ports. To label a whole rack,
   select the rack instead and use the Inspector's **Select all panel
   ports** — one click for every panel port (switches excluded).
3. Click **Auto-generate…** in the block bar:
   - **Zone** (e.g. A), **Ports/location** (6), **Start number** (auto),
     **Type** (desk).
   - **Label format**: pick a preset or **Custom…** — e.g. template
     `FZNNN-PP` renders `4A001-01`. `F`=floor, `Z`=zone, `N`=location,
     `P`=port; repeat a letter to zero-pad; `"quotes"` for literals;
     `[ ]` renders only when its tokens have values. **Save to library**
     stores the template for every project. Previews render with the
     *active* floor and zone.
   - **Outlet label**: a second template for the outlet *display* labels on
     the floorplan (port tokens unused) — e.g. `FZNNN` → outlets named
     `4A001`. Leave empty for the legacy `Z.NNN` style.
4. **Assign** — this single action creates the locations, pins their ports
   to the exact panel positions, and bakes the label strings (baked labels
   are the truth: re-generation never moves them, and they move with the
   panel if the panel moves).

## 2. Place the outlets (Floorplan tab)

The floorplan editor is available two ways — as the standalone Floorplan
tool, and as the **Floorplan tab inside Elevations** (same document, live in
both). Use the tab when alternating with Frames/Patching: terminate → place
→ patch is one tab-switch.

1. Open the **Outlets** sidebar tab.
2. Set the sticky **defaults** first (Cable = Cat6 for U/UTP, usage, mount).
3. The **Unplaced locations** list shows every location with no outlet.
   Click a location, then click its desk on the plan — the outlet is *born
   linked*: label, port count and per-port labels are adopted from the
   location (`4A001-01…`). After each placement the **next unplaced location
   auto-arms** ("Placed 4A001 — next: A-002"), so a run of desks is one
   click each; Esc stops the sequence.
4. Outlets that already exist (e.g. kept through a Clear floor) relink in
   one click: select any outlet → **Link all** matches every unlinked outlet
   to a location by its rendered label (outlet template first, legacy
   `Z.NNN` as fallback). **Sync from locations** re-derives labels using the
   outlet template, so a `4A001`-style convention survives a sync.
5. New outlets placed without a location also follow the outlet template
   (next free number: `4A013`), keeping the plan's naming consistent.

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
2. **Hold the reserved ports first**: set the toolbar **Hold** label (e.g.
   `VLAN`), then Alt+click each reserved switch port (uplinks, VLAN ports).
   Held chips turn amber and refuse cords — single patching warns, bulk and
   the rule wizard skip them. Alt+click again releases; holds persist on the
   floor's frames doc and are undoable.
3. Set the sticky **Cable** and **Status** in the toolbar.
4. Single cords: click a free port (armed) → click the destination port.
   Selecting a cord highlights both ends in red; **Delete** removes it.
5. **By rule…** (the fast path): one dialog generates the whole mapping —
   pick the source panels (location-labeled panels are pre-checked) and the
   destination switches, set ports/location (2), the left/right range start
   ports (2 / 14), and keep **checkerboard offset** on. It takes the first N
   ports of every location, keeps frame sides separate, alternates locations
   across the switches (right side offset by one → true checkerboard), skips
   held and patched ports, and opens the result in the bulk preview for
   confirmation. The whole 24-cord walkthrough below is one Create.
6. **Bulk** (manual): Ctrl+click the source ports *in order* (numbered purple
   badges) → **Patch to…** → click the destination ports in order (teal) →
   review the mapping table → **Create**. Occupied ports are rejected
   automatically; cross-room pairs are flagged and skipped.
7. **Filter bar**: substring, usage chips, free-only; Enter jumps to the
   next match.
8. **Circuit**: selecting any cord shows its full chain —
   `A-001 · p1 —run→ 4A001-01 —cord→ 4AR01-U41-P2` — click a hop to pull
   that device onto the bench.

### Choosing a true checkerboard

With a 2-column desk bank, splitting odd/even desks between switches leaves
column-neighbors on the same switch. Alternate along *each column* instead —
for outlets 1–12 laid out in column pairs:

- **U41** ← outlets 1, 5, 9 (left-of-frame → switch left 2–7) and
  4, 8, 12 (right-of-frame → switch right 14–19)
- **U39** ← outlets 2, 6, 10 (left → 2–7) and 3, 7, 11 (right → 14–19)

Neighbors then differ down both columns *and* across each row, so one switch
failure never takes out two adjacent desks.

## Result for this walkthrough

- 12 locations `4A001…4A012` (6 ports each), 72 panel ports labeled
  `4A001-01…4A012-06` on U38/U37/U36 in one Assign; outlet labels `4A001…`
  from the outlet template — zero manual relabeling.
- 12 linked outlets placed on the left desk bank, Cat6, ports adopted.
- 24 cords in the checkerboard above; switch ports 1, 12, 13, 24 left free
  for VLAN uplinks; lengths auto-calculated.
