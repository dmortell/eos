# Port map for network engineers (VLAN assignment) — plan for review

**Status: Slice 1 (the list) BUILT 2026-10-11; Slice 2 (the drawing) waits for decisions P1–P4.** From backlog
"Port map for network engineers (VLAN assignment)" (Dave 2026-10-11): a drawing of the selected patch-frame panels or
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

## Slice 2 — the drawing (a viewport) · ~250 lines · waits for P1–P4

- A new view kind `{ kind: 'portmap'; deviceIds: Id[] }` (`views/portMap.ts`): each device drawn as an enlarged
  faceplate — its ports in their real rows (e.g. 2 × 24), each port cell with its number and, beside it, the
  endpoint text (P4) in small text; the device name and rack · U above it; devices stacked down the page.
- Not to scale (it's a schematic); the viewport shows it at a fixed text size like the riser view.
- Made from the selection: **Sheets › New port map sheet** (selected devices → a new sheet with one port-map
  viewport) and the viewport picker's "Port map of the selection". Opens on screen as a view tab too.
- The view updates as cords change (it's drawn from the model, like every view).

## Decisions

- **P1 Where VLANs live.** (a) Only in the Excel the engineer fills in — CAD doesn't store them *(recommended for now,
  as D8 for cord statuses)*; (b) a `vlan` per device port in CAD, read back from the returned Excel by a Key column
  and shown on the drawing (≈ +120 lines).
- **P2 The drawing.** (a) The faceplate with the endpoint text beside each port *(recommended)*; (b) a port table
  per device drawn on the sheet (port · endpoint · VLAN boxes) — easier to read, less like the hardware.
- **P3 Choosing the devices.** (a) The selection, stored in the viewport (add / remove later from its Properties)
  *(recommended)*; (b) a whole rack / room's switches, kept up to date as devices are added.
- **P4 The text at each port.** (a) The outlet label for a switch port, the switch port for a panel port
  *(recommended — the thing at the other end)*; (b) always the outlet label (+ room); (c) both lines.
