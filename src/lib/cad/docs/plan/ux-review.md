# cad UX review

**Status:** review for Dave (2026-10-06), written by the Pages session. It is input for `backlog.md` and
`decisions.md`, not a plan of its own: tick what you agree with, and the cad session folds the ticked items into the
backlog.

**What it covers:** how cad feels to use, compared with Pages, the Sheets tool and the model3d editor. It doesn't
cover the domain model, which is better than before (one shape type, entity-per-doc, tables as editors).

**How it was done:**
- Read `ui/CadShell.svelte`, `ui/ViewCanvas.svelte`, `ui/Properties.svelte`, `app/workspace.svelte.ts`,
  `editor/tools.ts`, the backlog, the decisions and Dave's todo batches.
- Used cad on Test Project in Chrome at 1512 × 795 and 1567 × 784. I selected outlets, switched plan → front
  elevation → rack view → sheet → plan, drew a trunk, dragged a segment, undid both, and opened Split and the layers.
- Not tested: touch, PDF / DXF output, cords, Renumber, dark mode.
- **Caveat:** the cad session was coding at the same time, so the page may have hot-reloaded during the test. Three
  observations could be reload artefacts rather than cad behaviour; re-check them before building:
  - the first click on an outlet that selected nothing (UX06);
  - the floorplan arriving after the drawing;
  - the rack view opening un-fitted (UX13).

  The rest come from the code as well as the screen.

**How to read an entry:** `- [ ] **UXnn Name** — the problem (what I saw). *Before:* what Pages / Sheets / model3d
did. *Suggest:* … **P1–P3 · S/M/L**`, with the same meanings as `backlog.md`. Where the backlog or decisions already
have an entry, it is named. The point then is that the entry matters more for UX than its tag says.

## Summary

The engine is sound, but the screen around it is the weak part. Most of what makes cad "harder than Pages" comes
from five things:

1. **The drawing gets less than half the screen.** Three panels and a toolbar take the rest (UX01, UX02).
2. **One toolbar line does too much.** It holds 22 text-only tools, tool options, hints, messages, questions, typed
   input, Undo / Redo / Delete / Fit / Split, the panel toggles and Export. It overflows, and buttons move when the
   view changes (UX03, UX04).
3. **Nothing reacts to the mouse until you click.** There's no hover highlight and no cursor change, and the grips
   are small. You can't see what a click will take (UX06, UX07).
4. **Selection and context don't follow the view.** A sheet's Properties stay up on the plan, and lists don't scroll to
   what you picked (UX09, UX10).
5. **The model can't be edited through a viewport on a sheet.** That was the core way of working in Pages and Sheets
   (UX17).

None of these is about the data. Most are S–M changes in the shell. Three files have grown past the README's
~500-line limit: `CadShell.svelte` (569 lines), `ViewCanvas.svelte` (560) and `editor/tools.ts` (589). The toolbar,
status bar and question box are the natural seams for splitting them, so the UX work can also do that split.

## Keep: what cad already does better

These are worth keeping through any redesign:
- **Undo / redo selects what changed** and opens its level.
- **Delete says what goes with it** ("Delete rack with 12 devices…").
- **Properties offers named height presets.** For example, a trunk's Location is "ceiling plenum (Z 2950)" rather
  than a bare number. Tool defaults come from the level's heights.
- **Each view keeps its own pan / zoom**, and the URL keeps the open views, so a refresh comes back to the same place.
- **The tables are real editors.** The outlet grid has usage, tier, mount, server room, panel and length per outlet.
- **"Saving… / Saved" is always visible.**
- **Tools that can't work in a view are not offered there.** This stops an Outlet click in a rack view, but see UX03
  for its cost.

## Screen layout

- [ ] **UX01 The drawing area is too small** — at 1567 × 784 the canvas is about 1180 × 470 px, roughly 45 % of the
  screen. The bottom table is always open (~230 px), the left panel takes ~180 px and Properties ~195 px. In a rack
  view the 45U racks didn't fit vertically. *Before:* Pages kept tables and lists in tabs and side panels, so the
  drawing had most of the screen. *Suggest:*
  - Start with the bottom panel closed. Open it from its tab strip, or automatically when you use a table action
    (e.g. Allocate).
  - Remember open / closed per view kind (plan / rack view / sheet).
  - Add one key (e.g. Ctrl+Shift+F) that hides every panel and brings them back.

  **P1 · S** (Panels already has show / hide; this changes the defaults and adds the key)

- [ ] **UX02 The left panel is one long scroll of seven sections** — Levels, Sheets, Sections, Racks (with
  find-a-device), Blocks (the whole library), Cables and Layers, stacked. Layers is last, so you scroll past the block
  library every time you want to hide a layer. *Before:* Pages had tabs (DRAWINGS / ITEMS) over the left panel.
  *Suggest:* an icon rail or tabs:
  - **Project:** levels, sheets, sections.
  - **Racks**
  - **Blocks**
  - **Layers**
  - **Cables**

  Keep each tab's scroll position and collapsed sections. Layers is used most while drawing, so it might also sit
  pinned at the bottom of the Project tab. **P1 · M**

- [ ] **UX03 The toolbar: text buttons that move** — 22 text-only tool buttons, then the tool's options, then the
  hint. After them come Undo / Redo / Delete / Fit / Split, the three panel toggles and Export. At 1512 px wide the
  hint is cut off ("…Ctrl+G gr…") and Export wraps onto two lines. Tools that don't work in a view are hidden, so
  every other button shifts: plan shows 22 tools, a rack view 4 (Select, Device, Cord, Renumber), a sheet 10. Muscle
  memory can't form. *Before:* Pages had an icon tool strip (`pages/parts/ToolStrip.svelte`) with separators and
  grouped fly-outs (a group button keeps its last-used member), and its buttons stayed put. *Suggest:*
  - An icon strip, grouped:
    - **Select / modify:** Select, Move, Copy.
    - **Draw:** Line, Shape, Box, Dim.
    - **Annotate:** Text, Leader, Cloud, Legend, Block.
    - **Building:** Wall, Opening, Section.
    - **Cabling:** Outlet, Trunk, Conduit, Rack, Device, Cord, Renumber.
  - Tools that don't apply are **greyed, not hidden**, with a title saying where they work.
  - The tool's options go on a second row that appears only for tools with options (or into the status bar, UX05).
  - This is also the seam for splitting `CadShell.svelte`: a new `ToolStrip.svelte`.

  **P1 · M**

- [ ] **UX04 Questions, messages and typed input are all in the toolbar line** — the hint, short messages
  (`ws.say`), delete confirmations (`ws.ask2`), number prompts and the typed-point box all take turns in the same small
  text slot at the top. They are far from the cursor and look alike (small grey / amber), and each replaces the last.
  A question such as "Delete rack R301 with 12 devices…? [Delete] [Cancel]" is easy to miss. *Before:* Pages had a
  command line and status bar at the bottom, plus dialogs for real questions. *Suggest:*
  - Hints and messages go to the status bar (UX05).
  - A question becomes a small dialog near the selection, with Enter = yes and Esc = no.
  - Typed points go to a command-line style box at the bottom-left, where ADR 0005 puts the command line. The decision
    "Build the command line?" is still open; this is the cheap first step towards it.

  **P1 · M**

- [ ] **UX05 Make the status bar a real bar** — the cursor X / Y, length · angle while drawing, scale, zoom and mm/px
  are 10 px grey text floating at the canvas's bottom-left. The grid is a fixed 10 mm, isn't drawn, and has no on /
  off switch; only Alt skips it. *Before:* Pages' `StatusBar.svelte` had SNAP / GRID / ORTHO / POLAR / OSNAP toggles
  and the ACAD-mode switch. *Suggest:* one bar under the panes holding:
  - the hint and messages (from UX04);
  - X / Y (or X / Z);
  - the length · angle readout, bigger;
  - Snap and Grid toggles, the grid size, and F9 to toggle snap. The backlog's "Grid size setting" and "Function
    keys" belong here.

  **P2 · M**

## Feedback while pointing

- [ ] **UX06 No hover feedback** — the Select tool's cursor is always the arrow (`editor/tools.ts:128`). Nothing
  lights up under the mouse, so you only find out what a click takes after clicking. On a busy floorplan at 1:100
  (outlet symbols ~10 px, pick tolerance 6 px), my first click on an outlet selected nothing. *Before:* Pages ran the
  same pick as a press on hover: the cursor showed move over a body, crosshair over a grip and pointer over a link
  (`pages/ui/vpInteraction.svelte.ts:226`). *Suggest:*
  - A thin highlight on whatever a click would take (one rAF-throttled `pickAt` per move).
  - A cursor that says what a press does: move / grip / nothing.
  - The same highlight in the rack view on ports and devices. It also covers the backlog's "Port hover tips" and
    "Hover a cord" halfway.

  **P1 · M**

- [ ] **UX07 Selection colour clashes with data colours, and grips are small** — a selected item is orange, but high
  trunks are also drawn orange (backlog "Trunk drawing style": "high runs orange"). The grips on a selected run are
  tiny dots in the same orange. *Before:* Pages used one selection colour (teal / blue) that no data used, with square
  grips at a fixed screen size. *Suggest:*
  - One selection colour that nothing else uses.
  - 8 px square grips, filled when picked, larger on hover. (round grips may also be allowed for certain actions)
  - Selected segments in a second shade of the same colour.

  **P2 · S**

## Selection and context

- [ ] **UX09 The selection stays when the view can't show it** — this looks like a bug:
  - On a sheet, I clicked the sheet, then **Plan**. The plan came up, but Properties still showed the sheet: number,
    paper, revisions and the whole title-block template.
  - An outlet selected on the plan keeps its Properties in a rack view, where it isn't drawn.

  *Before:* Pages kept a selection per pane / view. *Suggest:*
  - When the active view changes, put aside any selection it doesn't draw, and bring it back on return. The simple
    version just clears it.
  - Properties always describes something you can see.

  **P1 · S**

- [ ] **UX10 Lists don't follow the canvas** — three cases:
  - Selecting an outlet on the plan highlights its row in the Outlets table but doesn't scroll to it. Only the patch
    list scrolls (`ui/PatchList.svelte:56`).
  - With a sheet open, the level list still marks 1F as open, and the bottom table still lists 1F's outlets.

  *Suggest:*
  - Scroll the outlet grid to the selection (a few lines, as in PatchList).
  - Mark the level row "not showing" while a sheet or the riser view is open.
  - The bottom panel follows the view: sheets → Sheets tab, rack view → Patch list, plan → Outlets, unless the user
    picked a tab themselves.

  **P2 · S**

- [ ] **UX11 Properties: no header, no groups, and project settings mixed in** — Properties is one flat list of rows
  under a small bold word ("Outlet", "Trunk"). Sheet Properties also holds the project-wide title-block template,
  about 25 rows that change every sheet, under the sheet's own five fields. *Before:* Pages' `PropertiesPanel` had
  collapsible groups (`pages/parts/props/`). *Suggest:*
  - A header: kind icon · name / label · layer.
  - Groups, remembered per kind: General / Position & height / Ports / Circuit / Style.
  - The title-block template moves to a dialog, i.e. answer the open decision "Title block properties in a dialog or
    a floating window?" with (a).
  - Delete in the header, not at the bottom.

  **P2 · M**

## Views and navigation

- [ ] **UX12 Getting between views** — there are three different ways in:
  - **Building views:** each pane's strip (Plan · Front · Rear · Left · Right · Riser · Section… · To sheet…).
  - **Rack views:** only from the Racks list's "Elevation" links, and they open as "Racks front".
  - **Sheets:** from the Sheets list or table.

  The strip shows Plan / Front … on a sheet and in a rack view too, where a click leaves for the level. There is no
  back. *Before:* Pages had a drawing navigator, tabs, the ViewCube and a command palette. *Suggest:*
  - Alt+← / Alt+→ for back / forward through the views opened in this pane. The URL state already exists, so this is
    a small history list.
  - A breadcrumb in the strip, e.g. "1F › IDF1 › Racks front" or "S001 › viewport 2".
  - Raise "Quick switcher (Ctrl+K)" from P3 to P2.
  - The decided "Back to sheet" button (T127) belongs in the breadcrumb.

  **P2 · M**

- [ ] **UX13 Fit and first view** — three cases I saw:
  - The IDF1 rack view first opened cut off: a restored camera, with the 45U racks running off the bottom.
  - **Fit** in a rack view includes the slab / ceiling / SSL lines, so the racks end up small in the middle.
  - Turning on Split opened the front elevation at a restored zoom, showing only part of the content.

  *Suggest:*
  - Fit = what the view is for: the racks in a rack view; the model, not every storey line, in an elevation.
  - A restored camera that shows none of the content fits again.

  **P2 · S**

- [ ] **UX14 Elevations draw the whole floor at once** — the front elevation of 1F overlays every outlet, box and
  rack on the level. Labels collide ("A.002" / "A.003", "R312" / "R313" print on top of each other), and you can't
  tell near from far. *Before:* Pages elevations came from section markers with a depth band and hidden lines, and
  their depth / Z handles were on the plan. *Suggest:*
  - An elevation gets a depth band, near / far, like cad's Sections, drawn and dragged on the plan in Split. Far items
    are faded.
  - Labels avoid each other (or the far one hides).Outlet labels hould not appear on elevations.
  - Alternatively, make "Section" the normal way to get an elevation and keep the full-floor elevation as an
    overview. This would probably work best.

  **P2 · M**

- [ ] **UX15 No 3D check** — the only way to check heights is a whole-floor elevation (UX14). Pages and model3d had an
  iso / orbit view and a ViewCube. Dave decided 3D is later (`later.md` "3D view"), and that still seems right. Listed
  only so it is weighed against UX14: a good elevation band covers most "is this trunk at the right height" checks.
  **P3 · L**

## Sheets

- [ ] **UX17 Edit the model through a viewport** — today only paper notes can be edited on a sheet; a viewport's
  content can't be picked (`views/sheet.ts:1`). In Pages, a double-click on a viewport let you edit the model inside
  it at that scale and clip, and the Sheets tool's viewports were editable too. This is probably the single biggest
  "harder than Pages" item: drafting happens on the sheet you'll print. It is already in the backlog as "Edit the
  model from a sheet" (P2 · L), and the "How is a viewport picked?" decision is (c), frame-only once model mode
  exists. *Suggest:* raise it to P1 and build it before more sheet features. **P1 · L**

- [ ] **UX18 Viewport scale and size are hidden** — "Add viewport" fills the drawing area, and then you size it by
  its corner grips. The scale lives in a dropdown in Properties; Alt+wheel / Alt-drag inside a selected viewport is
  explained only by a message after you've used it. *Before:* Pages had a scale tag on the viewport itself, with the
  PDF spinner beside it, and Fit. *Suggest:*
  - A scale tag at the viewport's corner on the sheet (click → the 1:N list).
  - The backlog's "Viewport tool (draw a box)".
  - A one-line hint while a viewport is selected: "Alt-drag pans · Alt+wheel scales".
  - Alt is not intuitive, I prefer the "pan/zoom content" toggle of Pages/Sheets

  **P2 · M**

## Drawing and editing

- [ ] **UX19 Typed input** — typing a digit while drawing opens a prompt in the toolbar. There is nothing at the
  cursor, and no length / angle fields to Tab between while dragging. *Before:* Pages had a command line plus spec bars
  for dimensions and trunks (`DimSpecBar`, `TrunkSpecBar`). *Suggest:* the bottom-left command box from UX04, showing
  "length ⟶ Tab ⟶ angle" while a draw tool has a last point. **P2 · M**
- Lets implement the command line

- [ ] **UX20 Height presets in the tool options** — Properties offers named Locations (e.g. "ceiling plenum (Z
  2950)"), but the Trunk / Conduit / Wall options show bare Z / W / H boxes. The decision "Height presets" chose (a),
  named presets for any item. *Suggest:* the same Location select in the tool options, with Z beside it for a custom
  value. **P3 · S**

- [ ] **UX21 Hidden commands** — Group, draw order, Make block, Select similar, Copy link, Pin, Patch to… live in
  keys or in Properties buttons. Right-click is Esc (decision "A right-click menu?" is open, suggestion (a) none).
  *Suggest:*
  - (b) a menu on right-click **over a selected item**, keeping right-click on empty space = Esc. It holds that
    item's commands with their keys, so the keys are learnt from it.
  - I'm ok with a context-menu for selected items.

  **P2 · M**

- [ ] **UX22 No Help, and many gestures to remember** — all of these are found only in button titles or the hint
  line:
  - Ctrl-drag copies; Ctrl on a grip branches. good
  - Alt = no snap; Alt-drag pans a viewport. neither are intuitive
  - Double-click a run adds a point; click again cycles what's stacked under the cursor. ok to keep for now, but lets think of better options to add a point
  - F2 then Tab edits labels. good
  - R / V while drawing a trunk. not intuitive

  *Suggest:* raise "Help (F1 / ?)" from P3 to P2. Pages' `HelpDialog.svelte` is a 204-line port. **P2 · M**

- [ ] **UX23 Menu bar** — decided "implement" (T154), not built. Floors…, Settings…, PDF all, Export and the panel
  toggles are scattered over the toolbar and the side panels. Pages had a menu bar and a command palette. Doing UX03 and
  this together keeps the toolbar for tools only. **P2 · M**

## Words

- [ ] **UX24 Use the glossary's words in the UI** — a few labels don't match what they do:
  - "Elevation" in the Racks list opens a rack view, while "Front / Rear / Left / Right" are building elevations.
  - The **Block** tool button runs the Insert tool. (avoid using "Insert")
  - "Is a" heads the trunk / conduit / line choice. Improve this
  - "Dim" sits next to full words. Improve this

  *Suggest:* check the toolbar, strips and Properties labels against `docs/glossary.md` once. **P3 · S**

## Suggested order

1. **Quick fixes (S, a day):**
   - UX09: the selection follows the view.
   - UX10: lists follow the canvas.
   - UX13: Fit.
   - UX07: the selection colour and grips.
   - UX01: the bottom panel starts closed, plus the hide-all key.
2. **The shell (M, split `CadShell` / `ViewCanvas` on the way):**
   - UX05: status bar.
   - UX04: questions and typed input out of the toolbar.
   - UX03: icon tool strip.
   - UX06: hover.
3. **Panels:**
   - UX02: left-panel tabs.
   - UX11: Properties groups and the title-block dialog.
   - UX22 + UX23: Help and the menu bar.
   - UX12: back / forward and breadcrumb.
4. **Large:**
   - UX17: edit through viewports.
   - UX14: elevation depth band.

## Open questions for Dave

- [x] **Toolbar:** icons with a grouped strip (as Pages), or keep text labels but in fixed groups that grey out? *My
  suggestion:* icons + groups, with labels in the titles; text costs too much width. Decision: icons + groups.
- [x] **Left panel:** tabs, or an icon rail (VS Code style)? *My suggestion:* tabs. There are five, and the words fit
  at 180 px. Decision: tabs, or floating windows like Sheets tool so user can keep two or more important ones open together. The Pages tool menu also good for opening dialogs.
- [x] **Right-click:** menu on a selected item, or stay with "right-click = Esc" everywhere? Ok for context-menu, but keep right-click = Esc while drawing
- [x] **Elevations:** depth band on every elevation (UX14), or sections as the normal elevation? Currently prefer sections, but I would like to test depth bands

---

## Check (cad session, 2026-10-06)

Each claim checked against the code (and live where noted). **Confirmed** unless said otherwise.

- **UX01** — confirmed: every panel starts shown (`app/panels.svelte.ts:8`), remembered per browser, not per view kind.
- **UX02** — confirmed: seven stacked sections in the left panel.
- **UX03** — confirmed, and now 23 tools (Viewport added today). Tools that don't work in a view are hidden
  (`toolWorksIn` in `CadShell.svelte`), so the buttons shift. The hint is cut off at 1512 px.
- **UX04** — confirmed, with a live example: today a "Delete level 1F (90 items)?" question (opened by mistake by a
  test script) sat in the toolbar's text slot and was easy to miss. It was cancelled; nothing was lost.
- **UX05** — confirmed: the readout is 10 px text at the canvas's bottom-left (`ui/ViewCanvas.svelte:533`); no grid
  is drawn, and there is no snap / grid switch.
- **UX06** — confirmed: the Select tool has no `hover` and its cursor is always `default` (`editor/tools.ts:128`). The
  "first click on an outlet selected nothing" may be a hot-reload artefact, but the 6 px pick tolerance is real.
- **UX07** — partly: the grips are 8 px **squares**, not dots. The colour clash is real: selection and grips are both
  amber `#f59e0b`, high runs are orange `#f97316`, and a selected viewport is orange too (`ui/Prims.svelte`).
- **UX09** — confirmed: changing a pane's view (`setPane`) keeps the selection; only picking a level clears it.
- **UX10** — confirmed: only the patch list scrolls to the selection; the outlet grid doesn't.
- **UX11** — confirmed: sheet Properties includes the whole project title-block template.
- **UX12** — confirmed: the view strip (Plan · Front · … · Riser) shows in rack views and on sheets too; there is no
  back / forward.
- **UX13** — confirmed in code: Fit (`zoomExtents`) fits every prim, including the slab / ceiling / SSL datum lines.
  The un-fitted first rack view is a restored camera.
- **UX14, UX15, UX17** — confirmed (viewport content isn't pickable: `placePrim` in `views/sheet.ts`).
- **UX18** — partly done today: the **Viewport tool** (draw a box) is built. Selecting a viewport already says
  "Alt-drag pans · Alt+wheel scales", but only as a passing message. The scale tag on the viewport isn't built.
- **UX19, UX20, UX22, UX23** — confirmed. The menu bar is decided ("implement"), not built.
- **UX21** — confirmed; Select similar (built today) is one more command that lives only in a Properties button.
- **UX24** — confirmed: "Elevation" in the Racks list opens a rack view, the **Block** button runs Insert, "Is a"
  (`ui/PathProps.svelte:136`, `ui/RunsMultiProps.svelte:29`), "Dim".

## Remediation plan (cad session's proposal)

Four phases. Phase A needs no decision; each later phase starts once its questions (below) are answered. Every phase
ends with tests, svelte-check and a live check, and is logged in `../phases/phase8.md`. Items you tick go into
`backlog.md` with these tags.

### Phase A: quick fixes (S each, about a day, no decisions needed)

1. **UX09 Selection follows the view** — when a pane's view changes, keep only the selected ids the new view draws
   (an effect on the view spec in ViewCanvas, which knows its prims). Properties then always describes something
   visible. (~20 lines)
2. **UX13 Fit means the content** — rack view: fit the racks; elevations / sections: leave out the datum lines; a
   restored camera that shows none of the content fits instead. (~25 lines)
3. **UX10 Lists follow the canvas** — the outlet grid scrolls to the selection (the PatchList pattern); the level row
   is marked "not showing" while a sheet or the riser view is open; the bottom panel follows the view kind (sheet →
   Sheets, rack view → Patch list, plan → Outlets) unless you picked a tab yourself. (~40 lines)
4. **UX01 More room for the drawing** — panels remembered per view kind (plan / rack view / sheet); the bottom panel
   starts closed for a view kind not seen before; one key (Ctrl+. suggested) hides / shows every panel. (~40 lines,
   `app/panels.svelte.ts`)
5. **UX24 Words** — Racks list "Elevation" → "Rack view"; "Block" button → "Insert"; "Is a" → "Kind"; "Dim" →
   "Dimension" (moot if Phase B uses icons). (~10 lines)
6. **UX20 Location presets in the tool options** — the Properties Location select beside Z for Trunk / Conduit /
   Wall. (~30 lines)

### Phase B: the shell (M each; splits the three oversized files on the way)

0. **The split first, no behaviour change:** `editor/tools.ts` → `editor/selectTool.ts` (SelectTool is ~450 of its
   ~600 lines); `CadShell.svelte` → `ToolStrip.svelte`, `StatusBar.svelte`, `AskBox.svelte`; `ViewCanvas.svelte` →
   `ViewStrip.svelte`, with the readout moving to the status bar.
1. **UX05 Status bar** under the panes: hint and messages, X / Y (Z), length · angle (bigger), scale / zoom, Snap /
   Grid switches with the grid size, F9. Takes in the backlog's "Grid size setting" and the F9 part of "Function
   keys".
2. **UX04 Questions out of the toolbar** — a question becomes a small box over the drawing (Enter = yes, Esc = no);
   number / text prompts and typed points go to a box at the status bar's left — the first step towards the command
   line, without deciding it.
3. **UX06 Hover** — the Select tool gets a `hover`: one throttled pick per move, a thin highlight on what a click
   would take, and a cursor for move / grip / nothing. In rack views the same on ports, devices and cords (half of
   "Port hover tips" and "Hover a cord"). (~100 lines)
4. **UX07 One selection colour** (Q5) — selection, grips, picked segments and the hover highlight in one colour no
   data uses; 8 px grips, filled when picked, larger on hover. (S)
5. **UX03 Tool strip** (Q1) — fixed groups (Select / modify · Draw · Annotate · Building · Cabling · Sheet); tools
   that don't work here greyed, with a title saying where they do; options on a second row only for tools that have
   them.

### Phase C: panels and finding things (M each)

1. **UX02 Left panel tabs** (Q2) — Project (levels, sheets, sections) · Racks · Blocks · Layers · Cables, each keeping
   its scroll and collapsed sections.
2. **UX11 Properties** — a header (kind · name · layer · Delete) and groups remembered per kind; the title-block
   template moves to a dialog (answers the open decision with (a)).
3. **UX22 Help (F1 / ?)** raised to P2 — the Pages HelpDialog port, featuring F2 + Tab label editing. **UX23 Menu
   bar** (decided) with it: File / Edit / View / Insert / Format, holding Floors…, Settings…, PDF all, Export, the
   panel switches and the commands from UX21.
4. **UX12 Getting between views** — the view strip shows only what fits the view (rack view: front / rear and back to
   the plan; sheet: back to the last view); Alt+← / Alt+→ back / forward per pane; a breadcrumb ("1F › IDF1 › Racks
   front", "S001 › viewport 2", with the decided "Back to sheet"). Quick switcher stays P3 unless you raise it.
5. **UX21 Right-click menu** (Q3) on a selected item: its commands with their keys; right-click on empty space stays
   Esc.
6. **UX18 the rest** — a 1:N tag on the selected viewport's corner (click → the scale list), and the Alt hint kept in
   the status bar while a viewport is selected. (S)

### Phase D: large

1. **UX17 Edit the model through a viewport** — raise "Edit the model from a sheet" to P1; build it after Phase B
   (hover and picking are its base): double-click a viewport → model mode inside it, at its scale and clip; tools run
   in its view through `fromPaper`; Esc or a double-click outside → back to the paper. (L, ~300 lines)
2. **UX14 Elevation depth** (Q4) — a near / far band on every elevation, or sections as the normal elevation. Either
   way far items fade and labels stop colliding. (M–L)
3. **UX15 3D** stays in `later.md`.

### Questions for Dave (the review's four, plus one)

- [ ] **Q1 Tool strip:** icons (labels in the titles), or text labels in fixed groups? *Suggest:* icons from
  `$lib/ui/Icon.svelte`, grouped; text costs too much width.
- [ ] **Q2 Left panel:** tabs or an icon rail? *Suggest:* tabs.
- [ ] **Q3 Right-click:** a menu on a selected item, or right-click = Esc everywhere? *Suggest:* the menu, only over a
  selected item.
- [ ] **Q4 Elevations:** a depth band on every elevation, or sections as the normal elevation? *Suggest:* the band;
  sections stay for cuts.
- [x] **Q5 Selection colour:** amber clashes with high runs and the cord highlight (orange), and sky blue is trunks.
  *Suggest:* a strong blue (`#2563eb`) with a white halo for selection and grips; the picked-node fill already uses it.
Decision: the blue selection and blue/white grips of Sheets look ok

**Order:** Phase A now; then B0 → B5; C and D1 once Q1–Q3 are answered; D2 after Q4.

---

## Screen direction (Pages session, 2026-10-06, after Dave's call)

**Dave's call:** keep building cad. Take the **look of Pages**, the **floating windows of the Sheets tool** (a user
closes the ones she doesn't need and keeps two or more important ones open together), the **Pages menu bar** for
opening dialogs, and **editing inside viewports** from both. Pages' tree is the right idea, but it must make models and
drawings easier to find. Pages and Sheets stay as they are: bug fixes only, and kept as references.

This section is the target the phases above build towards. It changes three of them:
- **Phase C1 (UX02):** floating windows instead of tabs. This also answers Q2.
- **Phase A4 (UX01):** windows instead of fixed panels.
- **Phase D1 (UX17):** moves up, right after Phase B.

### S1 The layout

```
┌ Menu bar: File · Edit · View · Insert · Cabling · Sheets · Project · Window · Help ───── Saved ┐
├ Tool strip (icons, grouped, Pages style) │ tool options (only when the tool has some)          │
├──────────────────────────────────────────────────────────────────────────────────────────────┤
│ ┌ Navigator ┐                                                          ┌ Properties ┐        │
│ │ (window)  │                the drawing: one or two panes,            │ (window)   │        │
│ └───────────┘                full width under the windows               └────────────┘        │
│                                   ┌ Layers ┐                                                 │
│                                   └────────┘                                                 │
├ Status bar: hint / message · X Y · L ∠ · Snap Grid · 1:100 · zoom ─────────────────────────────┤
```

- **The drawing fills the screen.** Everything else is a window over it, or the menu, strip and status bar.
- **The Pages look:**
  - an icon tool strip with groups and fly-outs (UX03);
  - one selection colour (Q5) and hover highlight (UX06);
  - a status bar with the snap / grid switches (UX05);
  - the quiet grey panels, and the view strip per pane, as in Pages.
- **Tables (outlets, patch list, sheets, links) stay a bottom panel.** They're wide, and a window would be cramped.
  The panel opens from the menu (View) or with a key, and starts closed (UX01).

### S2 Floating windows (from the Sheets tool)

Reuse `$lib/ui/Window.svelte` (242 lines, already in the `$lib` barrel, used by the Sheets tool's Sheet / Viewport
Properties). It already does most of this:
- drag by the title;
- fold the window to its title bar, and resize its height;
- remember its position, height and open / folded state in localStorage, keyed by its title;
- `ondock` / `onundock` hooks for left / right / bottom docking.

The cad windows:

| Window | Holds today's | Open by default |
|---|---|---|
| Navigator | Levels, Sheets, Sections, the rack rooms (S3) | yes |
| Properties | Properties | yes |
| Layers | the Layers section | no |
| Blocks | the Blocks library | no (opens with the Insert tool) |
| Racks | the Racks list + Find a device | no (opens in a rack view) |
| Cables | the Cables list | no |

Rules:
- **Every window opens and closes from the Window menu**, with a tick for the ones that are open. Closing one never
  loses anything.
- **Docking:** drop a window on the left or right edge to dock it there as today's side panel, with docked windows
  stacking. Drag it off to float it again. Default: Navigator docked left, Properties docked right, the rest floating.
  Someone who likes today's layout keeps it; someone who wants the drawing big floats or closes them.
Just be careful to handle browser window resizing.
- **The layout is per user, per browser** (localStorage, like the cameras), and the Window menu has **Reset layout**.
- **No two copies of one window.** Opening a window that's already open brings it to the front.
- **Keys:**
  - one key hides / shows every window (Phase A4's key);
  - Esc never closes a window, because Esc belongs to the tools.
- **Check on a laptop screen (1366 × 768):** with the Navigator and Properties docked, the drawing should still be at
  least 60 % of the screen.

### S3 The navigator (Pages' tree, made easier to find things in)

One tree in one window, replacing today's Levels / Sheets / Sections / Racks sections:

```
[ Search: levels, views, sheets, rooms, racks…        ]
▾ Building A
  ▾ 3F            12 outlets
      Plan · Front · Rear · Left · Right
      Sections: A–A′, B–B′
      ▸ IDF1 (server room) — Rack view · Rows: Row A, Row B
  ▸ 4F
  Riser
▾ Sheets                 [group: place ▾]
    S001 3F plan
    S002 3F IDF1 racks
```

- **The model and the sheets are in one tree.** The building side is the model, and each leaf is a view. Sheets
  group by place by default (the register's grouping), so "everything about 3F" is in one place.
- **A search box at the top filters as you type** (level, view, sheet number or title, room, rack), showing the
  matches with their parents. This is the Quick switcher (Ctrl+K) in a window, and Ctrl+K focuses it.
- **"Show in navigator"** (in the menu and on the selection's Properties header) opens the branch of whatever is
  selected or open, and marks it. The open view's row is always marked. That fixes UX10's "level still marked while
  a sheet is open".
- **Sheet rows show which views they hold.** Unfold a sheet to see its viewports, and click one to open that view.
  This answers the open decision "A list of all views?" without a new tab.
- **Today's per-row ✎ / ✕ and the drawing / sheet commands** (Floors…, Settings…, PDF all, + New, + Server room) move
  to a ⋮ menu on each row, plus the main menu.
- **What Pages had and cad leaves out for now:**
  - Pages' custom tree views, smart folders, and dragging to re-file. Search plus the by-place tree should cover
    finding things.
  - Add them later only if a big project (Journey's 8 + 19 sheets and 4 buildings) still feels lost.

### S4 The menu bar (Pages style)

Dialogs and project-wide commands go here, so the tool strip is only tools (decided T154). Suggested contents:
- **File:** Open project (Ctrl+O), Export (PDF / DXF / Excel), Print (Ctrl+P), Issue…
- **Edit:** Undo, Redo, Cut, Copy, Paste, Delete, Select all, Select similar, Group / Ungroup, Draw order
- **View:** Fit, Split, Fill overlay, the tables panel, Hide all windows, Back / Forward
- **Insert:** Block, Legend, Image (later)
- **Cabling:** Allocate, Re-allocate, Renumber…, Cable schedule, BOM, Patch list
- **Sheets:** New sheet, New sheet from this view, Title block… (the dialog from UX11), Sheet register
- **Project:** Floors…, Settings… (usages, cable types), Project details… (decided: a dialog)
- **Window:** each window with its tick, Reset layout
- **Help:** Help (F1), Keys (?)

Each item shows its key, as Pages' menu did, so the menu teaches the keys (UX22).

### S5 Editing inside viewports (from Pages and Sheets)

This is UX17 / Phase D1, moved to straight after Phase B: hover and picking are its base, and nothing else makes
sheets feel like Pages without it. Behaviour, as in Pages:
- **Getting in and out:**
  - Double-click a viewport to enter it. The paper dims, the viewport's frame turns the selection colour, and the
    status bar says "Editing 3F plan in S001 · Esc or double-click outside to leave".
  - Leave with Esc (when no tool is drawing) or a double-click outside.
- **Inside it:**
  - The tool strip shows the model tools for that view (plan / elevation / section), and clicks go through
    `fromPaper` to the model.
  - Undo works as anywhere.
  - Alt-drag / Alt+wheel still pan / scale the viewport. Or use the pan/zoom-content toggle always visible no matter the zoom level.
- **Picking a viewport** follows the decided (c): click-anywhere while not in model mode, frame-only once inside one.

### What this means for the order

1. **Phase A** (quick fixes) as planned, except A4: make the panels windows straight away if S2 starts next.
   Otherwise A4's per-view-kind panels are throw-away work.
2. **Phase B:** the shell split, status bar, questions box, hover, selection colour, tool strip.
3. **Then, in this order:**
   - **S2 windows + S4 menu bar** together: the menu's Window list is how closed windows come back.
   - **S5 editing in viewports.**
   - **S3 navigator:** it replaces four of the left panel's sections, so it comes after the windows.
4. **Phase C's other items** (Properties groups, Help, back / forward, right-click menu), then Phase D2.

---

## Status after the remediation run (cad session, 2026-10-06)

Built and committed phase by phase (each logged in `../phases/phase8.md`):

| Item | State | Commit |
|---|---|---|
| UX09 selection follows the view · UX13 Fit · UX10 lists follow · UX24 words · UX20 location presets | done | b19c2eec |
| B0 split · UX05 status bar (SNAP / OSNAP / GRID, F9 / F3 / F7) · UX04 questions box · UX06 hover · UX07 / Q5 blue selection + Sheets grips · UX03 icon tool strip · UX12 back / forward + breadcrumb + strip per view | done | 5f80f81e |
| S2 windows (dock / float / close, hide all Ctrl+., reset) · S4 menu bar · UX22 Help (F1 / ?) · UX11 title block dialog | done | a0560867 |
| S5 / UX17 edit inside viewports · UX18 viewport chip (scale, pan / zoom content) | done | 5a50ea46 |
| S3 Navigator tree + search (Ctrl+K) | done | b392e056 |
| UX11 Properties header + groups · UX21 right-click menu · UX19 length / Tab / angle · UX07 larger hovered grip | done | a7500e2c |
| UX14 depth band (a test) | done, for you to try | 99730279 |
| UX01 per-view panels | replaced by the windows (S2) | — |
| UX15 3D | stays in `later.md` | — |

### Left to do (not built)

- **Properties groups for the other kinds** (outlets, runs, sheets, cords, notes, sections): they still use their own
  panels; racks, devices and drawn shapes have groups.
- **In-place label editing inside a viewport** (double-click / F2 there): edit those labels in the view itself.
- **Dragging a docked window straight to a new place**: dragging its title out pops it out under the pointer; a
  second drag places it.
- **Depth band edges dragged on the plan**: typed for now (at / front / back on the elevation's strip).
- **F8 ORTHO / F10 POLAR** (backlog "Function keys").
- **Toolbar fly-outs** (Pages' grouped fly-outs): the strip shows every tool in its group; with 24 tools it fits at
  1512 px. Fly-outs only if it gets too long.
- `ui/ViewCanvas.svelte` (≈ 560 lines) and `editor/selectTool.ts` (≈ 525) are still over the ~500-line guide; the
  next work in them should split them (the camera / fit logic; the hover and grips of the Select tool).

### Decisions for Dave

- [ ] **Depth band vs sections** (Q4): try Band on an elevation (front / back / at; Split with the plan to see it).
  Keep it (and store it per view, put it on sheets), or drop it in favour of sections?
- [ ] **Blocks / Racks open docked** under the Navigator when they open by themselves (Insert tool, a rack view) —
  the review said "the rest floating", but floating they covered the drawing. OK?
- [ ] **The windows' saved layout was reset once** (`cad-windows:2`) so that change reaches every browser. OK?
- [ ] **Delete without a question for racks with no devices** — a rack (or anything) with nothing going with it is
  deleted at once (Undo brings it back). During testing two empty racks went that way. Keep, or ask for every rack?
- [ ] **Paste in the menus** says "use Ctrl+V": browsers don't let a page paste from a menu click. OK, or hide it?
- [ ] **`$lib/ui/Window.svelte` not reused** (it's the Sheets tool's, bug-fix only, and lacks close / docking /
  z-order); cad has its own `CadWindow`. Merge them later, or keep separate?
