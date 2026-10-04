# Layers: plan

**Status:** Slices 1–4 built 2026-10-04 (build log in `docs/phases/phase8.md`). Differences from this plan:
- **Current layer:** only new lines take it. Notes live on sheet paper, and layers don't reach paper. Click a layer's
  name to make it current; there's no radio column (Dave: too wide).
- **Hide or lock a layer:** its selected items leave the selection (Dave).
- **System layer names** are short, to fit the sidebar: Floorplans, Backbone, and (Dave) Outlets / Trunks for the
  low ones next to Outlets high / Trunks high. Patch cords and Backbone are extra system layers, for the rack and riser views.
- **Copy / paste** (not built yet) must keep `layerId` and bring a project's layers along to another project. This is
  noted in the backlog's clipboard entry.
- **Not done:**
  - Hidden layers still snap on the plan (plan snapping reads the model, not the drawing).
  - Tied notes on a sheet ignore a viewport's freeze.

**The backlog entry:** "Layers" (`backlog.md`, P1 L, ~400 lines), and the entries that hang off it:
- no adding to a hidden / locked layer;
- move selection to a layer;
- section markers on a layer;
- hide in new viewports;
- layer line type and lineweight;
- view toggles;
- background layer.

## 1. What cad has today

- **A `Layer` record** (`domain/drawing.ts:88`): id, name, colour, weight, dash, order.
- **Shape fields:** `Shape.layerId` / `order` / `style` (`domain/shapes.ts:158`).
- **Nothing reads any of these.** No view, tool or panel uses layers.
- **Dead field:** `ViewDef.hiddenLayers`. `ViewDef` is never used, because a viewport holds its own view.
- **No `layerId`** on outlets, racks or underlays.
- **Persistence:** `Layer` records would load with the project already (project scope), with no persistence change.
- **The only "layers" today are in the DXF export:** each drawing class gets a DXF layer name (E-OUTLETS,
  E-CONTAINMENT-HIGH, A-WALL …, `render/dxf.ts:8`).
- **Rules already set:**
  - ADR 0003: layer visibility is per user, in the workspace — not stored, so it doesn't hide things for everyone, as
    it did in Pages. The one exception is what a viewport prints.
  - ADR 0007: `layerId` is one field on every shape.
  - Dave: ByLayer by default, a shape's own style overrides it (T148). Outlets are coloured per IDF by layer (T058).
    No layers on riser drawings (T072). Model layers are for later (3D).

## 2. How the old tools did it

| Tool | What users had | What to learn |
|---|---|---|
| **Pages** | Layers per model; groups, search, presets, eye / lock / colour, drag order, VP freeze, "only in this frame" (383-line panel) | Two layer systems (page vs model) with their own ids. Visibility stored in the document, so it changed for everyone and wasn't undoable. Settings leaked between projects. **Don't repeat any of these.** |
| **Sheets** | 8 fixed default layers + project custom layers + per-model layers; per-viewport hide / lock; active layer; move-to-layer; legend from layers | Deleting a custom layer removed it on every floor. Good rules worth copying: an item's layer = its own if it still exists, else its kind's default; colour only when the layer has one; new items go to their kind's layer; "X layer is hidden — can't add to it" |
| **Outlets** | View menu: outlets low / high, trunks low / high, routes, labels, racks; hidden trunks can't be clicked | Per user, saved in the browser — the right place for a show / hide switch |
| **Drawings** | Per viewport: outlets high / low, trunks primary / secondary, ceiling / floor | These toggles are just layers |
| **edit3d** | Per model eye / lock list | Same as Pages, smaller |
| **Uploads** | A PDF's own layers per file | A different thing — keep it separate |
| **Shared `$lib`** | Drag-to-reorder (`ui/DragReorder.svelte.ts`, already used in cad), a colour picker with ByLayer, eye / lock icons | Reuse; no new widgets |

**Best for the least code:**
- **One list:** fixed system layers in code, plus project layers. A project layer with a system layer's id restyles it
  (colour, order).
- **Eye and lock per user** (saved in the browser per project, like cad's cameras).
- **Freeze per viewport** stored on the sheet, because that is what prints.
- **Apply layers after the drawing is made:** one filter over the finished display list. The generators (plan,
  elevation, section …) don't change. This is why the work is ~250 lines rather than the backlog's ~400.
- **Build a small panel (~110 lines)** with the `$lib` parts.
- **Drop:**
  - page vs model layers;
  - "only in this frame";
  - per-viewport layer lock (viewport content can't be clicked in cad anyway);
  - presets, groups and multi-select (later if missed).

## 3. The model

- **System layers** (`domain/layers.ts`, in code), in drawing order (as built, Dave: pairs together, the list's first
  row draws at the bottom): Floorplans, Walls, Drawing (plain shapes, blocks), Racks, Trunks, Trunks high, Risers,
  Backbone, Patch cords, Outlets, Outlets high, Notes, Sections. Each keeps its DXF name (today's).
- **Project layers:** `Layer` records you add.
  - A record with a system layer's id restyles that layer.
  - Delete only when empty (the count is shown).
- **An item's layer:** its own `layerId` if that layer still exists, else its default by kind:
  - outlet tier → Outlets low / high;
  - run tier → Containment low / high;
  - riser → Risers; wall → Walls; text / leader / cloud → Notes; …
  - No data changes and no migration: today's items fall into the right layers on their own.
- **Labels go with their item:** a hidden outlet hides its label too.
- **Things on no layer:** the paper, the title block, datums and rack-view ports always show.
- **Per user** (workspace, saved in the browser per project): hidden layers, locked layers, the current layer.
  - Hidden = not drawn and not clickable.
  - Locked = drawn and snapped to, but not clickable.
- **Stored:** `Viewport.frozen` — layers hidden in that viewport, the same for everyone and in the PDF.

## 4. Slices (each useful on its own)

**Slice 1: system layers, eye and lock (~120 lines + ~100 test).** Also closes "View toggles".
- **You get:** a Layers list in the left sidebar (under the legend), with a swatch, name, item count, eye, lock and
  search.
  - Hide "Containment high": the high trunks and their labels go, and can't be clicked.
  - Lock "Walls": walls stay visible and snap, but can't be picked.
  - The choice survives a refresh and doesn't affect other users.
  - It works in plans, elevations and sections (not the riser or rack views — T072).
- **Code:**
  - `domain/layers.ts` + test;
  - `views/layers.ts` (the one filter) + test;
  - `Prim.layer`;
  - the workspace keeps the sets;
  - a new `ui/LayersPanel.svelte`;
  - one line each in ViewCanvas and CadShell.

**Slice 2: project layers, current layer, move to layer, layer colour (~140 lines).** Covers T058 (IDF colours).
- **You get:**
  - add / rename / colour / delete (only when empty) layers;
  - a "current" mark; new lines, notes and blocks go on the current layer;
  - "Layer is hidden — can't add to it";
  - a Layer dropdown in Properties moves the selection (outlets too);
  - a layer's colour recolours its items.
  - For IDF colours: make IDF1 / IDF2 layers and move the outlets onto them.
- **Code:**
  - `Outlet.layerId`;
  - panel add / edit / delete through `store.transact`;
  - a small `ui/LayerPick.svelte` in Properties;
  - every prim can carry a colour (screen, PDF);
  - tools put new items on the current layer.

**Slice 3: freeze per viewport (~35 lines).**
- **You get:** with a viewport picked, the panel shows a "this viewport" column. A frozen layer is hidden in that
  viewport and its PDF; Shift = every viewport on the sheet.
- **Code:** `Viewport.frozen`, a filter in `viewportContent` before the prims are placed, and a panel column.

**Slice 4: paint order and DXF (~45 lines).**
- **You get:** drag a layer to change what draws on top; the DXF uses the layer names.
- **Code:** `$lib` DragReorder; a stable sort by layer order in the filter; DXF reads `p.layer`.

**Later:**
- layer lineweight / line type, and shape style (both wait for "Shape style", decided later);
- hide in new viewports;
- presets, groups, multi-select;
- select similar;
- legend on the drawing;
- model / per-floor layers (3D);
- a lockable Background (hide already works in Slice 1).

**About 340 lines in all; Slice 1 alone is useful.** Files near the 500-line limit (`editor/tools.ts` 488,
`ui/CadShell.svelte` 446) only get one-line hooks; the logic goes in new files.

## 5. Questions for Dave

1. **Who does the eye affect?**
   - (a) Only you, only on screen; sheets use viewport freeze.
   - (b) Stored, hidden for everyone.
   - *Decide:* (a) (ADR 0003; this was the Pages bug).
2. **Layer lock (T156, still open in `decisions.md`)?**
   - (a) Per user.
   - (b) Stored.
   - *Decide:* (a) for now (but if we ever make background layers for PDF/images then I'll want to keep it locked most of the time).
3. **Does the current layer take walls, trunks, outlets and racks too?**
   - (a) No: they go to their system layer, and you move them after.
   - (b) Yes, everything goes on the current layer.
   - *Decide:* (a) (the Sheets tool learned this).
4. **IDF colours (T058)?**
   - (a) Make IDF1 / IDF2 layers and move outlets onto them; a "select by server room" helper later.
   - (b) Automatic layers per server room.
   - *Decide:* Outlets should usually go on low or high Outlet layers. User will move them to IDF room layers manually if they want to control the colors
5. **Can a project restyle the system layers** (colour / order)?
   - (a) Yes.
   - (b) Fixed.
   - *Decide:* (a) (~5 lines).
6. **Shift-click on freeze:** with a viewport picked, a click on a layer's snowflake freezes it in that viewport only.
   Shift-click is a shortcut that does it in several viewports at once.
   - (a) All viewports on this sheet.
   - (b) All sheets.
   - *Built:* (a); easy to drop.
7. **Does the eye also apply to the plan DXF export and to elevations / sections?** *Decide:* yes to both; the riser and rack views also obey layers (T072).
8. **Drop per-viewport layer lock** (viewport content can't be clicked in cad)? *Decide:* yes.
