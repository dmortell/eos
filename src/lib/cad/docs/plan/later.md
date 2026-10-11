# cad: later

Postponed on purpose (2026-10-03): model3d / 3D viewer work (Dave: "not yet needed in cad"), items Dave marked later /
future / not essential, and phase items deferred by an earlier decision. Move an item to `backlog.md` when it's
wanted. *From:* ids as in `backlog.md`.

## Outlets, labels and numbering

- **Relabel from a pattern** — regenerate a selection's labels from `labelPatterns` with a preview (low priority). *From:* P048
- **Label check** — compare labels with a pattern / their data and list mismatches as warnings. *From:* P049

## Levels, plans and underlays

- **Underlays per view direction** — several PDF / image underlays per plan or elevation, with opacity, flip, z-order, drag / resize. *From:* G200
- **DXF import** — DXF as an underlay or as shapes. *From:* P056

## Ports, panels and allocation

- **Panel detail strip** — the constant-size, readable close-up of a panel; Dave deferred it until canvas zoom proves not enough. *From:* P012

## Containment, routing, risers and fill

- **Free fill sections** — FR-001-style fill sections not tied to drawn runs (Dave: "maybe later"). *From:* P032
- **Riser view extras** — horizontal positions for rooms / risers that aren't drawn (floor compression has moved to the backlog under Riser view control). *From:* P033

## Selection and editing

- **Rotate grip** — a round grip for rotate (waits for the "Rotate shapes?" decision). *From:* P039
- **Undo across reloads** — keep recent undo steps when the page reloads. *From:* P050
- **Group transform box** — one box to move / scale / rotate a multi-selection or a group. *From:* G202
- **Ctrl+arrow resize (model3d)** — check what legacy model3d does; select all and cut are in the clipboard entry. *From:* G203, T112
- **Copy to Pages** — Pages is retired; copying between projects is in the clipboard entry. *From:* G205

## Drafting commands and input

- **ORTHO / POLAR and F-keys** — ORTHO / POLAR (F8 / F10), F9 snap, F1 help; Dave: "osnap and grid snap only for now". *From:* P055

## Layers, styles, blocks and symbols

- **Model layers** — per-model layers from the model3d viewport (name, colour, active, per-viewport hide / lock). Covered by Layers when 3D comes. *From:* G204

## Sheets and viewports

- **Tables on paper** — outlet schedule, patch list and legend tables on sheets; later, not urgent (Dave). *From:* P026
- **Title block with shapes** — a title-block template that includes drawn shapes. *From:* P058
- **Linking marker** — a section / detail marker that links to another drawing, view or survey photo and shows sheet + viewport number (needs viewport numbers). *From:* T095

## Print and export

- **Prices and quote** — price list (`settings/cadPrices`, JPY, project overrides), prices in the BOM, material-only quote Excel (Dave: "a todo for later maybe"). *From:* P029
- **SVG export** — not needed (Dave). *From:* T159

## Shell, navigation and touch

- **Delete the legacy tools (7.6)** — remove legacy routes and legacy-only `lib` once cad is feature complete and Dave okays deleting `pages/` (Firestore data kept). *From:* P044

## 3D, elevations and sections

- **Hidden-line removal** — true hidden lines in elevations / sections; only needed for line-only DXF elevations. *From:* P007
- **Room elevations** — four sections per room (A–D) with outlets on their wall face; needs room boundaries first (later per Dave). *From:* P034
- **3D view** — a read-only three.js view of a level (later per Dave). *From:* P035

## Maybe later

- **Walls beside the racks in the rack view** — left / right walls of the server room, dragged into place, to see the clearance at the row ends. A maybe for later (Dave 2026-10-09). *From:* T119

## Not needed (Dave 2026-10-07)

- **North arrow symbol** — not needed (Dave 2026-10-09; datum, detail and elevation tags were built). *From:* G258

- **Hover a cord** — thicker on hover, the others dimmed, a "from → to, type, length, status" tip; not needed (Dave 2026-10-12). *From:* G136, T064
- **Dim the other cords when one is selected** — not needed (Dave 2026-10-07). *From:* T017
- **Check how old ends of moved / removed cords show** — not needed (Dave 2026-10-07). *From:* T049
- **Snap to rack corners on the plan** — not needed (Dave 2026-10-07). *From:* G250
- **Port labels / patch cords toggles per viewport** — replaced by a "Port labels" layer (the ❄ freeze hides it per viewport; cords already have a layer) (Dave 2026-10-07). *From:* G190
- **Selectable Japanese text in PDF** — not needed (Dave 2026-10-07). *From:* G324, P027
- **Function keys** — not needed (Dave 2026-10-07). *From:* G300
- **Floorplan zones: rotate and drag** — not required (Dave 2026-10-09); zones keep the typed X / Y offset in the Floor manager. *From:* Dave 2026-10-04
- **Several buildings in one project** — not required (Dave 2026-10-09: "I'll make a different project per building"). *From:* T054
