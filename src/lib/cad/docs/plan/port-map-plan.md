# Port map for network engineers (VLAN assignment) — plan for review

**Status: BUILT 2026-10-11 — Slice 1 (the list) and Slice 2 (the drawing); decisions P1–P4 below.** From backlog
"Port map for network engineers (VLAN assignment)" (User 2026-10-11): a drawing of the selected patch-frame panels or
network switches, each port labelled with the endpoint it is patched to, so network engineers can assign VLANs to the
ports; and the same as a list.

## What each port shows

The circuit through the port (`traceCircuit`, `domain/cords.ts`: outlet → link → panel → cord → switch, planned
cords included, cords marked `remove` left out), read from the outlet end:
- **Outlet** — the outlet port label(s) at the circuit's ends (e.g. `01A.004A`; both for a cross-connect) and where they are (level · room / zone).
- **Patched To** — the other end of the cord on this port, with its label (a switch port → the panel port and its outlet label; a panel port → the switch port; a cross-connect → the other panel port).
- **Far End** — a device port at the far end beyond the cord (e.g. the switch behind a panel-to-panel tie).
- the cord's ID and status on this port (`add` = planned, not yet on site).

So a switch port reads: patched to `P3C · P3C-37 : 4 (front) · 01A.004A`, outlet `01A.004A` (1F · Zone A); a panel port has its
outlet and the switch port.

## Slice 1 — the list (Excel) · BUILT

- `domain/portMap.ts` `portMapRows(ix, deviceIds)`: one row per port of each device (room → rack → top U down, ports
  1…n): Room · Rack · Device · U · Port · Port label · Outlet · Outlet location · Patched To · Far End · Cord ID · Cord
  status · **VLAN** (empty, for the engineer) · Notes (empty).
- `render/exports.ts` `exportPortMap`: one sheet, a header row per device, VLAN column highlighted;
  `PortMap-{project}-{date}.xlsx`.
- From **File › Export** and **Cabling › Port map (VLAN) of the selected devices**: exports the selected panels / switches
  (select them in a rack view; any device with ports counts); with none selected it says so.

## Slice 2 — the drawing (a view, and a viewport) · BUILT

- View kind `{ kind: 'portmap'; deviceIds: Id[] }` (`domain/drawing.ts`), drawn by `views/portMap.ts`
  `portMapDisplayList`: each device like its faceplate — the ports where they are on it (the rack view's rows and
  numbering: a 48-port 1U = 2 × 24), every port cell with its number (or the device's own port label) small in the
  top-left corner and the far item's label stacked as big as fits (P4); the device name, rack · U · room above it;
  devices stacked down the page, top U first. Paper mm at 1:1 (24 ports ≈ 290 mm: an A3 landscape at 1:1).
- **Cabling › Port map view of the selected devices** opens it in the active pane (a tab; in the URL as
  `portmap.<id>~<id>`). Its strip: the map's name, **Excel (VLAN)** (Slice 1 for these devices), **To sheet…** (the
  usual: a new sheet or onto one, as a viewport). The viewport picker keeps it.
- Drawn from the model like every view, so it follows the cords. A deleted device drops out; the view goes when all
  of its devices are gone.
- The Excel's columns (User 2026-10-11): Room · Rack · U · Port · Device · Port label, then Outlet · Outlet location ·
  Patched To · Far End · Cord ID · Cord status · VLAN · Notes.

## Decisions (User 2026-10-11)

- **P1** VLANs: **only in the Excel** — not stored in CAD yet.
- **P2** The drawing: **the switch with its ports in the right positions**, each port's number (label) small in a
  corner of the cell, and the label of the item it is connected to at the far end.
- **P3** The devices: **just the selected ones** (stored in the view / viewport).
- **P4** The far end (with P2): **the item at the other end** — across the port's cord: a switch port → the outlet
  (through the panel); a panel port → the switch port (name + port); unpatched → the other end of its cable.
