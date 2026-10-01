# Pages tool — changelog

A readable, curated history of the major milestones (R11). For the exact, per-commit record use
`git log -- 'src/routes/projects/[pid]/pages/'`; `todo.md` keeps only the open items (its old done-log was
condensed into "Earlier work" at the end); `review.md §0a` tracks which review findings are closed.

## Round 21 (2026-09-27) — tree views, tags, site view by OSM API
- **Tree views** (`tree-views-plan.md`, all 3 phases; `store/treeViews.ts` tested):
  - A switcher "By place ▾" (per user, per project) with templates — By place (the only one where a drag re-files),
    By drawing type, Outlets / trunks by level, Elevations by category, By discipline — folders built from each item's
    fields ("(no …)" last), models first under "Models" / "Sheets".
  - **Models vs sheets obvious everywhere**: a model row has a cube (building) icon in the model teal, a MODEL pill and
    "Model — opens in model space"; a sheet row its drawing number (monospace) + "Sheet … — opens the paper layout";
    in the place tree a place with a model shows the MODEL pill (click = open it); model tabs show the model icon.
  - **Tags**: a chip picker (`parts/TagPicker.svelte`) in Properties › DRAWING (Type, Discipline, Category, Tags) and
    ⋮ › Tags… on a multi-selection (a partial tag shows "2/5" + to give it to all); ✦ suggestions from the sheet's
    viewports / title (`store/tags.ts`, tested), never applied on their own. Tag suggestions are GLOBAL across all
    projects (Firestore `settings/pagesTags`) merged with the project's own; a new tag joins the list.
  - **Custom views** shared with the team (`pages.treeViews`): New view…, folders (nest, reorder, rename, delete),
    items are references (an item can be in several folders; Ctrl-drag copies; Add to … / Remove from …), SMART folders
    with a filter editor (`parts/SmartFilterEditor.svelte`); in a grouped view a drop on a folder SETS its field
    (type / discipline / category / tag).
  - New sheet field `category`; sheet types + outlets / trunks / rack / riser; File › Drawings… has Category (column,
    bulk set, group by, Excel export).
- **Site view: building only by default** — a "Neighbours" switch (off): THE building comes from OSM's main API
  (`/api/0.6/{way|relation}/{id}/full`, fast even when the public Overpass servers hang), its building:part pieces from
  Overpass best-effort (15 s; else its outline + a note); Neighbours on = everything within 180 m via Overpass
  (bbox query, 3 servers, timeouts).

- **"Rendering PDF…"**: while a PDF page rasterises, its image shows a dashed placeholder with a spinner (each image on
  a page its own; screen only).
- **Alt+drag = pan a sheet viewport's CONTENT** — inactive, selected or active (in the active one on empty space;
  Alt-press on a shape stays "move without snap") — no need for Pan content.
- **A sheet viewport's zoom IS its scale** (Dave 2026-09-30): model space keeps free zoom, but zooming a sheet viewport
  (Alt+wheel anywhere over it, or the wheel inside it with Pan content) changes its scale to a whole 1:N — like the
  Sheets tool — about the cursor, so what you see is what prints. One undo step per burst ("Viewport scale 1:N"). An
  older viewport's leftover content zoom folds into its scale the first time it is zoomed. The active-viewport bar's
  scale list gains **Custom…** (type 1:37 or 37, Enter). A scale set from the list, Undo or another user keeps the
  model point at the viewport centre fixed. Alt gestures now reach an INACTIVE viewport too (its overlay swallowed
  them — they only worked on an active one).
  - Follow-ups: the bar's scale list shows the EFFECTIVE scale (what the tag shows), and picking one also clears an
    older viewport's leftover content zoom; ZOOM Extents / Window / Object in a sheet viewport set the whole 1:N that
    fits (they zoomed the content before).
- **Left panel › ITEMS tab** (beside DRAWINGS, `parts/ItemsPanel.svelte`, `ui/itemList.ts` tested): the shapes + 3D
  objects of the active view's model as a list — outlets (label, ports · High/Low · usage), trunks, racks, devices,
  walls, doors / windows, boxes, blocks, text, dimensions, lines, images. Filters: category (with counts), layer,
  search, and for outlets level + usage; "In this view" = only what the viewport shows (visible / unfrozen layers,
  its own notes, its plane). Multi-select like a file list (click, Ctrl+click, Shift+click range, Select all) —
  selects in the view (a sheet with no active viewport enters its target one), so Properties edits them together;
  a selection made in the view highlights + scrolls to its rows. Double-click = bring into view (model space zooms
  to it with ~6 m around; a sheet viewport only pans). The unused Filter cog left the DRAWINGS header, then its + (no-op)
  and Manage drawings (= File › Drawings…) buttons, to make room for the tabs.
- **High / low level** (`ui/hiLo.ts`, tested): a stored `level: 'high' | 'low'` on shapes AND 3D boxes (Firestore-stable).
  Properties › Level High / Low (one step, multi-selection too) sets the default HEIGHT — low = on the raised floor (0;
  a wall-mount outlet +300), high = the middle of the ceiling plenum from the model's levels (a box centred in it, never
  below the ceiling; no ceiling known → 2800) — and an outlet's look (low filled in its usage colour, high outline).
  Z (and Height presets Floor / +300 / +1200 / Plenum / Ceiling) overrides it. z is the same datum as a 3D object's
  (mm above FL±0), so a shape and a box line up in elevations + 3D. Older outlets without `level` read it from their fill.
  The Outlets import stores the level and the default height (a re-import keeps a height set in Pages while the level is
  unchanged); the Items list filters any category by level and shows height; the Outlet Schedule gains Height FL+.
- **Viewport-only layers**: a layer added while a sheet viewport is active (Layers › New Layer / + per group, the LAYER
  command) shows ONLY there — `Layer.onlyIn` = its frame ids; hidden in model space, the other viewports and viewports
  made later (VP rendering + Model3d via `frozenAll`, picking, DXF export, Fit, Items "In this view"). The Layers panel
  marks it with a VP tag (click = show everywhere); elsewhere its eye is crossed (click = show it in that viewport too;
  in model space = everywhere). Drawing onto it where it's hidden is refused with a note.
- **Section markers on a layer**: boxes, lines and elevation markers carry `layer` (unset = the new "Sections" layer,
  added to a model with markers on load and when the first is drawn) — hidden / frozen = not drawn or picked on the
  plan (its viewports still work), locked = not pickable; Properties › SECTION › Layer moves one to another layer.
- **Walls / trunks / pipes: X / Y / Z in Properties** (`ui/graphPos.ts`, tested) like a box's — Z = the run's lowest
  node (mm above FL±0); setting X / Y / Z shifts every node (slopes / drops kept; a plan move detaches nodes attached to a
  box). A selected node (walls too now) has NODE X / Y / Z. Multi-select Base Z covers walls / conduits (their lowest
  point) as well as boxes.
- Tool strip order: Boxes, then Walls · trunks · pipes, then Openings.
- Fixes: MODEL SPACE plan → front / side the first time opened far off the bottom (the plan's zoom with the elevation's
  stale offset) — with no height to carry it now centres on the model's mid-height. A sheet open in BOTH panes: the
  ViewCube's new direction (the sheet's — both show it, by design) is now centred in every pane showing it, not just
  the one clicked. Plan TEXT (labels, notes, callouts, legends) no longer shows in elevations — it was drawn at its plan
  coords, high above (an elevation's own text still shows; 3D still lifts plan callouts).

## Round 20 (2026-09-27) — structure lines, lineweights in 3D + print
- **Elevation structure lines**: a FLOOR model (no storeys, just its `levels`) now draws them too — raised floor
  (A-FLOR), ceiling = the plenum's bottom (A-CLNG, dashed) and NEW the ceiling slab's underside = the plenum's top
  (A-CLNG, dash-dot; skipped where the storey above's slab band already draws it); thin 1 px lines, shown while those
  Architectural layers are on. DXF export writes the same lines on A-FLOR / A-CLNG.
- **Lineweights for 3D objects**: walls / boxes / conduits draw at their layer's lineweight in mm like 2D shapes (true
  width with LWT on, hairlines with it off; the old px "Thickness" maps to mm).
- **Printing always uses true lineweights** (like AutoCAD's plot), whatever the LWT display toggle.
- **A floor model's datum is FL±0 = the top of the raised floor** (Dave: racks / furniture sat on the slab; `ui/levels.ts`,
  tested): its `levels` stay stored above the slab top (the Risers tool's heights) but read from FL — the structure
  lines (raised floor at 0, slab top at −raised floor, ceiling / ceiling slab FL-relative), trunk / pipe heights
  (under floor = on the slab below FL; plenum / below ceiling from FL), a new section box (slab top → ceiling slab)
  and the default conduit height. Objects move / draw down to the slab top (z below 0). No data changes: everything
  drawn from z 0 now stands on the raised floor. (A building model's storeys keep their slab-top datum.)
- **Site view (a test)**: select the PROJECT above the tree → its site. It asks for the address (Properties'
  Address; "Save as project address"), finds it on OpenStreetMap (Nominatim), fetches the buildings around it
  (Overpass) and renders THE building in 3D with three.js (`site/osm.ts` tested, `site/siteScene.ts`,
  `parts/SiteView.svelte`): its building:part pieces with heights from the OSM tags (height / levels × 3.2 m,
  min_height, roofs), facades with a window grid per storey, roof / wall colours, crisp edges, its outline on the
  ground; the neighbours as grey massing; the OSM map on the ground (toggle); sun + shadows; orbit / pan / zoom; an info
  card (name, address, use, height, levels, year, architect …) and the other address matches. three.js added (0.185).
- **Segment width grip**: select a wall / trunk / pipe, click a segment again, and drag the bar on its side edge
  (plan) to set THAT segment's width / thickness — symmetric about the centreline, whole mm, ≥ 10 mm; SNAP steps by the
  grid, Alt = free, Shift = 50 mm steps; back to the run's default removes the override; one undo step; the readout shows
  `W … mm` (model-grip drags had no readout before). Trunks & conduits todo closed.
- todo closed: the review leftovers (§2.3 B11, §4.1 R1, §4.3 R5, §2.8 B18 / B19, §6 R4 / B13 — the z0 clamp and
  unused CSS → LOW); #39 (tall buildings look right at 33 floors, riser room boxes, imported layers).
- todo closed: VSCode slowness, 33F as a full-floor model, one model per floor (models are per floor / place, detail
  views have their own), model tabs as an infinite canvas (done in B31: dark model space, one zoom layer), "layer /
  colour / lineweight editing" (round 19). F4 context-menu split and the grid snap base point → LOW.

## Round 19 (2026-09-27) — AREA, rotated dims, new-viewport freeze, clipboard images
- **AREA** command (O19, `ui/area.ts`, tested): click the corners (a live outline; Undo drops the last; Enter totals) or
  Object → a rect / ellipse / closed polyline; prints the area in m² (and mm²) and the perimeter.
- **Rotated linear dimensions**: mode 'r' + `dimAng` — measures along a set angle. Properties › DIMENSION › Mode ›
  Rotated (+ Angle, CCW from +X). An H / V dim turned by any angle now stays LINEAR (rotated, same figure) instead of
  becoming aligned; a mirror reflects its direction; DXF writes it as a rotated linear DIMENSION.
- **Hide in new viewports** (AutoCAD "New VP Freeze"): a layer setting — viewports created later (the Viewport tool,
  a new sheet's first viewport, a section dropped as a sheet) start with that layer frozen; existing ones are untouched.
- **System clipboard + images**: an image whose picture only lived in this tab's memory (`img:` key) now copies with
  its data, so it pastes in another tab / browser.
- **Line grid** (like OpenCad, `ui/grid.ts`, tested) replaces the dot grid: minor lines at the SNAP step (×10 when
  they'd get closer than 6 px), a major every 10th, minors fading in as they open up (no pop when zooming); drawn
  ABOVE background layers (floorplan PDFs / images) and under the drawing; screen only (not printed / exported); the
  GRID toggle. Sheets get a paper grid too (the 5 mm frame snap, major 50 mm).
- **ByLayer colour + mm lineweights** (`ui/lineweight.ts`, tested): a shape's colour resolves own → its layer's → ink
  (dimensions included — they were fixed teal, now their layer's colour); lineweights are real paper mm (`Ent.lw` /
  `Layer.lw`, ByLayer default; the AutoCAD list 0.00–2.11 mm): LWT on draws them at true paper width on sheets,
  LWT off = hairlines. Old px `weight`s map to the nearest mm (1.2 px → 0.25 mm). Properties › Lineweight, Layer
  settings › Lineweight, Drawing defaults › Lineweight; MATCHPROP copies it. DXF writes the colour (ACI 62 + RGB 420,
  none = BYLAYER), lineweight (370) per entity and per layer, BYBLOCK inside block definitions.
- **Sections at any angle — phases 5 + 6 DONE** (`elevation-section-plan.md` complete):
  - Phase 5: 3D objects EDIT in angled (oblique) section / elevation viewports — drag sideways (slides along the view)
    or up / down (height), box corner grips resize (`obliqueResize`: the box axis closest to the view), wall / trunk
    nodes drag keeping their depth (`slideRnd`); DXF export of an angled viewport projects through its own frame and
    trims to its clip (it exported the nearest axis view before).
  - Phase 6: exact HIDDEN LINES (`3dview/hiddenLines.ts`, tested) — every visible edge clipped against nearer faces,
    walls as panels with real holes, so what's behind a wall is hidden but shows through doors / windows / holes (the
    old painted mask hid things in FRONT of openings too); no seams between panels; straight and angled views; DXF
    writes the visible edges. New viewports dropped from a section / elevation marker start with Hidden lines = Hide
    (existing frames unchanged; Properties › Hidden lines). A section line / marker view looks along −n of its line's
    frame (its OClip depth is negative) — `lookNegOf` flips the depth order there (else the FAR wall hid everything:
    caught live on Test Project 4F › Elevations, the racks vanished).
- todo: E7 (per-port labels) closed — not needed (Dave: only for a new Frames tool).

## Round 18 (2026-09-27) — editing follow-ups
- **Ctrl mid-drag, live**: pressing Ctrl during a move drag turns it into a copy at once (the originals jump back, copies
  follow the pointer); releasing it turns it back (copies removed, originals follow) — shapes, 3D objects and sheet
  viewports (`ItemEditor.setDup` + an optional `commit.remove`; unit-tested).
- **Properties › ROTATE** (`props/RotateBar.svelte` → `vpInteraction.rotateSel`): ⟲ / ⟳ 90°, 180°, and "By" any
  angle, for shapes, boxes, racks, blocks, images, walls, conduits — one item turns in place, several about their middle;
  one undo step. 3D objects turn in plan (attached conduit ends follow).
- **Several viewports**: Properties › VIEWPORTS (`props/FramesProps.svelte`) sets scale / border / hidden lines / colour
  / lock on all selected frames in one step (differing fields show "mixed"); Ctrl+C / X / D copy / cut / duplicate ALL
  selected frames (layout kept; the copies come selected).
- **Mixed selections**: shapes + 3D objects selected together show BOTH property sections (was the objects only).
- **Callouts + legends in 3D views** (`ui/isoAnno.ts`, tested): in iso / perspective they draw screen-facing at paper
  size from their projected anchors (a callout's leader to its projected tip), pick like in plan (front layers over the
  model), and show a dashed frame when selected.
- **Dimension modes** (`ui/dimSpec.svelte.ts`, `parts/DimSpecBar.svelte`, tested): Aligned (default, as before) /
  Linear (H or V by the larger delta, like DIMLINEAR) / Horizontal / Vertical — a bar while the tool is armed, A / L / H
  / V on the command line, DIMLINEAR (DLI) / DIMALIGNED (DAL); Properties › DIMENSION › Mode + **Text offset** (paper mm,
  `dimTextOff`; the text grip sets it) + a dim-line grip (`dimExt`). Render, hit, snaps, trim, iso, DXF (rotated linear
  DIMENSIONs at 0° / 90°) follow the mode; a 90° turn swaps H ↔ V. Fixed: MIRROR didn't flip `dimExt`, SCALE didn't
  scale it, Shift snapped the text grip to 15°.
- **Live spacing readout** by the cursor (user mm, Y up): length / angle / Δx Δy while drawing lines, walls, conduits,
  section lines; W × H for boxes; the measured value for H / V dims; the applied Δ while moving or grip-dragging shapes /
  3D objects; from the base point in MOVE / COPY picks; Δ from the selected guide when placing a guide. It flips to the
  cursor's other side near the viewport's edge.
- Connection points (the green ×) of an item on a HIDDEN or LOCKED layer (or one frozen / VP-locked in the viewport)
  aren't shown, and a new trunk / pipe end doesn't attach to them (`VpView.connUsable` / `connTargets`); existing
  attachments still follow.
- A sheet viewport's top-right tag shows its **direction** with the scale — PLAN / FRONT / … · 1:N, and 3D / ISO /
  WIRE in 3D (the ViewCube shows only the target viewport's).
- **Legend tool**: Text fly-out › Legend, Insert › Legend (+ Callout, Note there too), LEGEND command — places the
  layer-legend smart block.
- **Plan shapes have a height** (`Ent.z`, mm above the floor): an elevation draws a flat plan shape edge-on AT that height
  — drag it up / down there, or Properties › POSITION › Z; the 3D view lifts it (a callout's leader + box at its z).
- Fix: a flat plan shape TURNED in plan (rot) drew as a vertical line in elevations (the view rotated its edge-on
  line); its span now comes from its turned outline and the line stays horizontal.
- Fix: a press on the drawing left the keyboard in the command line / a Properties field (the press is
  preventDefault-ed) — Ctrl mid-drag never reached the drag and Ctrl+Z undid the command line's text. The field is
  blurred when the gesture ends, and the command line passes bare modifier keys on.
- Properties: the "Editing writes straight to…" hints are gone.
- Fix: the ViewCube / 3D popout / PERSPECTIVE / export on a sheet acted on the FIRST viewport when none was active,
  even with another one selected. They now act on the active viewport, else the selected one(s), else the sheet's only
  one; with several and none picked they ask (`targetFramesOf`).
- Fix: a word answering the prompt's options (H while dimensioning) was replaced by the top command suggestion
  (HISTORY) on Enter.
- Viewport tool: **right-click** cancels a box being placed, or with nothing pending goes back to Select (like every
  drawing tool).

## Round 17 (2026-09-27) — multi-select in lists
- **One list multi-select rule** (`$lib/ui/listSelect.ts`, unit-tested): Ctrl/⌘+click toggles, Shift+click takes the
  range from the last item (in the order shown), Ctrl+Shift adds the range.
- **Layers**: select several; the eye / lock of any selected layer sets them all (in a sheet viewport the eye freezes them
  there); dragging one moves them all (order kept); a bar shows / hides / locks / unlocks / colours / deletes them (the
  active layer stays; click again when they hold items). A plain click still makes a layer active.
- **Drawings tree**: places AND sheets multi-select (was sheets only); dragging one moves the block (rows inside a
  selected place go with it); the ⋮ menu of a selected row deletes them all (sheets first, then places deepest first —
  a place still holding things stays and says why).
- **File › Drawings**: Shift+click a checkbox selects the range.
- **Tool strip regrouped** into sections (draw · building · services · annotate · modify): Door, Window and Hole are
  tools of their own (the Opening tool with that type) in an Openings group with Penetration; Wall stands alone;
  Box (the Furniture tool — the old 2D Box was merged into it in R4) + Rack; Trunk + Pipe; Dimension + Measure + H / V
  guides in one group. Insert menu lists the same tools (Box, Wall, Door, Window, Hole, Penetration, Trunk, Pipe,
  guides, Section — Trunk / Rack there now work); DOOR / WINDOW commands.
- Strip follow-up: Text before Line; Wall + Trunk + Pipe one group again; the box is just "Box"; Penetration removed
  (PEN didn't work — todo). **Alt while dragging** a shape / 3D object (move or grip) turns grid + object snap off.
- **Fix — duplicate place models**: a closing project load could drop models from the registry AFTER a re-opened
  load had them (a late async cleanup), so opening a place found "no model" and created + stored an empty duplicate
  (Test Project got a second, empty "4F"). The registry now tracks which load owns each model, and a place's model is
  looked up in the store's own list before one is ever created.
- **Replace / insert PDFs and pictures from Uploads** (`ui/pdfFiles.ts`, `parts/UploadPicker.svelte`): Properties ›
  IMAGE › File › Replace… swaps an image's PDF page / picture for another uploaded one (this project's first, then other
  projects' — only referenced), placed by its Uploads calibration (else keeping the size); layer, opacity, live stay.
  Insert › From Uploads… adds one (a PDF follows its calibration live; in an elevation it stands on the ground line).
  Tested: Test Project › 4F's floorplan replaced with Project Journey's "L3303 Plan Clean-EIRE.pdf".
- **Pictures / PDFs from this computer are saved**: Insert › Image… (several, pictures or PDFs), a paste (Ctrl+V a
  screenshot — at the cursor) and a drag-and-drop from the OS onto a viewport (at the drop point) all upload the file
  to the project's Uploads (a `files` doc under a free name — never overwriting another file) and insert it on the
  active layer; before, Image… kept it only until a reload and pastes never showed in Uploads. A drop outside a
  viewport no longer makes the browser open the file.
- **Ctrl+A / SELECTALL** selects every shape AND 3D object on visible, unlocked layers (was shapes only).
- **Missing files**: an image whose PDF / picture was deleted in the Uploads tool now shows a red dashed "Missing
  file" placeholder (live — even while the browser still has it cached), and Properties says so (Replace… / delete).
  `ui/render/fileWatch.svelte.ts`.
- Title bar: Help is the outline "?" icon, bigger + brighter; ⌃ K spaced; the search dialog closes with a × button.
- **Racks in plan look like OpenCad's** (`projection.ts` `rackPlan`): footprint + an X corner to corner + a FRONT
  line (60 % of the width) 40 mm outside the front face (`RACK_FRONT_GAP`; OpenCad's sits ⅛ of the depth out) —
  rotating with the rack. 3D look: later.
- **Fix — deleting a sheet's last viewport "did nothing"**: the sheet re-seeded a default viewport as soon as it had
  none. A sheet may have NO viewports: only a brand-new sheet gets the default one (`PageDoc.seeded`, stored on the
  sheet; older sheets with viewports count as seeded).
- **Elevation marker** (sections-at-any-angle phase 4): the **Elevation** tool (Annotate section; Insert ›
  Elevation; ELEV) — click the spot, click / drag the look (axis snap, Shift = 15°); spec bar width × depth. Drawn as
  an eltag-style callout (one function, `elevMarkerMarks`, so it can become a plain arrow): linked → "1 / A-201", else
  its own number. Selected: its seen region, turn / width / depth grips, drag to move; Properties (number, title,
  look ↑ → ↓ ←, angle, width, depth, band, linked viewports). One marker drives many linked viewports (like section
  lines — it is a third Section kind). A no-move click on any section marker keeps it selected. `ui/elevMarker.ts`
  (+23 tests).
- **Tab / Shift+Tab in the label editor** save the label and move to the next / previous item of the SAME KIND
  (outlet → outlet, rack → rack …) in reading order (rows top → bottom, left → right), wrapping; it gets selected.
- **Section LINES at any angle** (phase 3, OpenCad's O4): the Section button is a group — Section box · **Section
  line** (spec bar Box | Line + Depth; SECTIONLINE / SECL; Insert › Section line). Two clicks / press-drag, Shift =
  15°. Drawn dashed with perpendicular arrows + "A" / "A′"; selected: its seen region, end grips, a depth handle, drag
  to move, click an end arrow to FLIP; Properties (name, look, depth, length / angle, z band). **One line drives many
  viewports**: each "Drop as viewport" adds another linked frame (own annotations, layers, scale), all updating live;
  the toolbar / Properties list them; deleting a line that still drives viewports asks (keep them as plain elevations
  / delete them too). `ui/sectionLine.ts` (+18 tests).
- **Align / distribute any selection** — shapes, 3D objects (boxes, racks, walls, runs) or both — measured as drawn
  (a rotated box by its outline), one undo step (`vpInteraction.arrangeSel`, `ui/arrange.ts arrangeMoves`); the
  Properties panel shows the ALIGN buttons for any 2+ items (`props/AlignBar.svelte`); the ALIGN command too.
- **Double-click / F2 edit a label in place**: an outlet / block's LABEL (else its first visible attribute), a box /
  rack's name, a 2-point line's (new) label — besides texts / dimensions / line labels as before. F2 = the one
  selected item; a note opens its dialog. A wall / run segment's double-click still adds a node.
- **Linked symbols** show a badge at their corner on hover (a page icon = a sheet, the external-link icon = a URL);
  click it to open (or double-click the symbol).
- **Sections at any angle, phase 2**: an ORIENTED clip `OClip` (a cut line + depth + z band; `oclipOf` converts a box
  exactly, `trimToOClip` / `inOClip` trim walls / conduits and test rotated boxes); projection, wall panels + openings,
  the depth sort, hit-testing and the viewport mapping work for ANY view frame. An oblique view is read-only for 3D
  objects (edit there = phase 5). Dev-only: `__pagesOblique(30)` in the console turns elevations to plan 30°.
  20 tests (`ui/oblique.test.ts`).
- **Sections at any angle, phase 1** (`elevation-section-plan.md`): an `ElevFrame` (origin, along `t`, look `n`) in
  `ui/geometry.ts`; the four elevation directions are fixed frames and every elevation call site (projection, hit,
  grips, snap, place, model edits, viewport mapping) goes through it — no visible change, pinned bit-for-bit by
  `ui/elevFrame.test.ts`; `frameAt(o, deg)` builds an oblique one (used from phase 2).
- **Fix — Properties › W / H of a ROTATED shape or box moved it**: it turns about its centre, so growing from the
  unrotated corner slid it; now its drawn top-left corner stays put (`ui/resizeKeep.ts`, 2D rect / ellipse + 3D box).
- **DXF opens on the drawing** (Dave: LibreCAD opened with it off screen): `$EXTMIN` / `$EXTMAX` + the `*Active`
  view's centre / height from the content (patched into the text — `@tarikjabiri/dxf` ignores them). File menu item
  renamed **Export DXF…**.
- **Outlet labels as big as in the Sheets tool**: a block attribute can have a `minPaper` height; an outlet's LABEL is
  ≥ 2.5 paper mm and NOTE ≥ 2 (at 1:100: 250 mm, was a fixed 120 mm). Rack names centred in the rack in plan.
- **Text fly-out**: Text · **Callout** (LEADER: an arrow to a note) · **Note** (NOTE: a wrapped multi-line block).
- **RACK: Left / Right** while placing turn the rack (and its preview, with the front line) 90°; the angle is kept for
  the next rack.
- CAD uploads (DXF / DWG) up to 8 MB.
- **DXF export, proper CAD objects** (O15–O17; `exportDxf.ts`, `dxfEntities.ts`, `dxfImages.ts`):
  - blocks are written ONCE as BLOCK definitions (shapes on layer 0) + INSERTs with rotation / scale / mirror, and
    their attributes as ATTDEF / ATTRIB (hidden ones invisible, not dropped) — recipients can count by block name;
  - dimensions are real aligned DIMENSIONs (with their geometry block, so every viewer shows them; arrows / dots /
    ticks; a dim style per scale; `<>` text overrides kept);
  - images (PDF pages, pictures) are rasterised, cropped, written as sidecar files and placed as IMAGE entities —
    the export downloads a ZIP (the .dxf + images) when there are any, else the plain .dxf. The toast lists images
    that couldn't be read (a deleted upload, a session-only picture).
  - `@tarikjabiri/dxf` bugs worked round (ATTRIB sequence ends, anonymous dim blocks, image dictionary / reactors).
    Verified with ezdxf (audit clean, correct render); not yet opened in AutoCAD.
- **Uploads accepts DXF / DWG** (≤ `CAD_UPLOAD_MAX_MB` = 5 MB for now, `pages/constants.ts`); no preview yet — the
  list shows "CAD" instead of origin / scale. (DXF import into Pages: next.)
- **Fix — resizing a ROTATED box / rack** by its corner grips: it now uses the same world-anchored rule as a rotated
  shape (`anchoredResize` in grips.ts, shared): the opposite corner stays put, sizes snap along the box's own axes.
- Fix: splitting / unsplitting the editor no longer resets a MODEL tab's pan / zoom / orbit (only paper sheets refit).
- Fix: a model view's content stays put ON SCREEN when its pane is resized (split, the split bar, side panels) — the
  pane reveals / covers more of the drawing instead of sliding it (Viewport.svelte resize compensation).

## Round 16 (2026-09-27) — the editing merge, phases 3–4 (done)
- **3D objects run on the engine** (walls, boxes, conduits in plan / elevation): body move with grid snap anchored on
  the first object, Ctrl-drag copy, arrow nudge, Ctrl+D, and the selection box now takes objects too. Shapes and
  objects can be selected TOGETHER (Shift / Ctrl+click or a box) and move / copy / nudge / delete as one undo step.
  Rack devices still slide only up / down their rack; attached conduit ends still follow. The old `MDrag` path is gone.
- **The command line works on paper** (`ui/paperCmd.ts`): with no viewport active, MOVE / COPY (multiple) / ARRAY
  (rectangular) / ALIGN / DIST / ERASE / select-by-point act on the selected viewport frames in paper mm (Y up), each
  one undo step, through the same engine as the mouse; ROTATE / SCALE / drawing commands say "Not on paper — enter a
  viewport". Clicked points go to the running command.
- **Viewport tool uses the Rectangle gesture**: ACAD on = click one corner, click the other (the box follows the
  cursor); EOS = press-drag. Corners snap to the paper lines (Alt off); Esc cancels.

## Round 15 (2026-09-27) — the editing merge, phases 0–2
- **One editing engine** (`ui/itemEdit.svelte.ts`, `editing-merge-plan.md`): move / grip / Ctrl-drag copy / Shift-ORTHO
  axis lock / marquee (window / crossing) / arrow nudge / Ctrl+D are written ONCE and driven through an ItemSource per
  kind. Shapes run on it (no behaviour change); unit-tested.
- **Sheet viewports run on the same engine**: move and corner-resize (paper snaps, Alt off, Shift square), Ctrl-drag
  leaves a copy (with its view), Shift+click borders / a marquee select SEVERAL, arrow keys nudge (1 mm, Shift 10 mm),
  Delete removes all selected — each one undo step. PaperPage's own drag / marquee code is gone.

## Round 14 (2026-09-26) — view-direction previews, layer fixes
- **Direction changes on a sheet viewport are previews**: the ViewCube / 3D popout change shows a "Preview · was
  FRONT — Keep / Revert" chip under the ViewCube; Keep makes it stick (one undo step), Revert — or leaving the viewport
  / switching tab — puts the old direction back.
- **Layers**: with a viewport active the eye IS the VP freeze now (a snowflake in the eye when frozen there; Shift+click
  = everywhere) — the separate snowflake column is gone. LAYMCUR / the Layers crosshair pick walls, boxes and trunks too.
  The ✓ beside Properties › Layer sits on the same line.
- **Delete** removes a selected sheet viewport even while another viewport is active.
- Elevation / 3D views on paper have a white background; the viewport scale label no longer prints.

## Round 13 (2026-09-26) — sheet viewports, sections, sharing, print
- **Viewport copies**: Ctrl-drag a sheet viewport's border to leave a copy behind; copy / paste / duplicate carry the
  content view (pan / zoom + 3D orbit), so the copy shows the same thing. Switching a viewport to a projection it has
  no view for yet centres its content at the viewport's scale (instead of carrying a point that could be empty).
- **Plan images** (floorplan PDFs) show only in the plan — not in elevations / 3D.
- **Share links**: the URL carries the selected tree item (`?node=` a place, `?doc=` a drawing); opening the link
  selects / opens it (before the one remembered in the browser).
- **Print**: the viewport number sits top-left and its EFFECTIVE scale (1:N ÷ content zoom) top-right, as plain text
  when printed; the title block sits ON the margin border; new sheets default to a 5 mm margin.
- **Layers on paper**: with a sheet viewport active the eye hides the layer in THAT viewport only (VP freeze, teal
  eye); Shift+click hides it everywhere. **Make a shape's layer current**: ✓ beside Properties › Layer, or the
  crosshair in the Layers panel (LAYMCUR).
- **Sections**: the floating toolbar sits on the selected box again on a zoomed sheet; "drop" makes a viewport sized
  to the elevation (along × height), fitted to the cut, and LINKED to the section (`SheetFrame.section`) — editing the
  box updates it live; the elevation's ground line spans the cut and its label is 2.5 paper mm.

## Round 12 (2026-09-26) — 3D popout, opening bar, desk holes, WIRE, paste at cursor
- **3D popout** under the ViewCube: 3D = perspective (now the default), ISO = parallel iso, WIRE = see-through
  wireframe (per viewport; PERSPECTIVE on the command line switches 3D / ISO).
- **Opening bar** (the Opening tool): Door / Window / Rect hole, height and sill — the next opening box takes them
  (`ui/openingSpec.svelte.ts`). Round holes aren't offered (walls are cut into box panels).
- **Holes through furniture**: an opening that runs right through a plain box (its full depth or width) splits it
  into solid parts — a desk's legs and top — in 3D and elevations (`projection.ts prismPanels`); openings that
  don't cross a wall show as a dashed outline instead of a masked hole.
- **WIRE** (status bar): boxes pick only on their outline in plan / elevation, so shapes under or inside them can be
  picked (OpenCad's wire).
- **Zoom to the selection**: ZOOM › Object (Z, Enter with something selected).
- **Paste at the cursor**: Ctrl+Shift+V centres the pasted content on the cursor (Ctrl+V keeps the position).
- **Sheet viewports**: Alt+wheel steps the scale, Alt+drag pans the contents — without entering the viewport.
- **Measure** button (runs DIST). Icons: the tool strip shows OpenCad's icons again (a stale compile), Opening = a box
  with diagonals; connection-point × marks are half the size.

## Round 11 (2026-09-26) — OpenCad picks: icons, penetrations, alignment tracking, steadier orbit
- **Icons from OpenCad** (lucide): Wall = brick wall, Box = box, Opening = door, Dimension = ruler, plus new tool
  buttons **Arc** (in Shapes, runs ARC) and **Format painter** (runs MATCHPROP). The Guide tool moved to a crosshair.
- **Penetrations** (O2): the PEN command / the Penetration button (Openings group) places core-drill symbols —
  diameter and through wall / slab asked once, then click each; tags count on (P01, P02 …). A built-in annotative
  block (`penetration`: ring + crosshair, TAG / DIA / THROUGH attributes).
- **Alignment tracking** (O9, OTRACK in the status bar, on by default): while drawing / placing, the cursor lines up
  with a nearby snap point it is level with (same x and / or y) and a dashed guide shows it; Shift / ORTHO and a
  real object snap take precedence; the free axis still grid-snaps.
- **Orbit without wobble**: the 3D view now centres on the projection of the content's 3D centre (a fixed point), and
  an orbit drag pans so the point in the middle of the view stays there — you orbit around what you're looking at.
- **Function keys**: F8 = ORTHO, F9 = SNAP (AutoCAD's), with F1 / F10; the Help dialog lists them (and the browser's
  own F-keys Pages leaves alone).

## Round 10 (2026-09-26) — extension lines, edit in place, more connection points, perspective, hatch
- **DIMBASELINE** stacks draw real **extension lines** back to the measured points (`dimExt`, signed mm); any
  dimension can have them (Properties › Ext. lines); DXF too.
- **Edit in place**: double-click a dimension to edit its text override (empty = the length), or a line's label;
  double-click a wrapped text (Shift+double-click a plain one) to open the large editor. The editor has a plain
  mode for unwrapped text, and the Properties pencil opens the same dialog (`ui/textDialog.svelte.ts`).
- **Connection points** beyond boxes and outlets: a wall's nodes and segment midpoints, another conduit's free ends
  (a trunk feeding a pipe of another size), and faceplate / custom blocks. Dragging a wall / conduit node or
  resizing a box carries what's attached to it. A run never attaches to itself, and a compatible run's end still
  joins instead.
- **Faster snapping / picking** (§5): shape bounding boxes, snap points and note layouts are cached per shape; the
  hover pick and the object snap skip shapes whose box is out of reach.
- **Shift / ORTHO** now constrain Wall, Trunk and Pipe drawing (15° steps / H-V), as they did lines.
- **Keep your place across views**: switching plan ↔ elevations (the ViewCube) re-centres the new view on the same
  3D point at the same zoom (the height comes from the last elevation you looked at).
- **Perspective 3D**: a **Persp** button under the ViewCube in the 3D view (and the PERSPECTIVE command) switches
  that viewport between the parallel iso and a perspective camera aimed at the model's content; picking follows it.
- **Trunk / Pipe spec bar** (F1): arming Trunk or Pipe shows a bar over the pane: a catalogue (PF / E conduit,
  trunking, cable tray, cable ladder, or Custom), Rect / Round, W × H (Ø for round), location (under floor, ceiling
  plenum, below ceiling, on wall, custom Z) and the resulting underside height from the floor's levels. Remembered per
  tool (`ui/trunkSpec.svelte.ts`); new runs are drawn with it.
- **Copy / paste 3D objects** (walls, boxes / furniture / racks, trunks / pipes): Ctrl+C / X / V and Edit › Copy /
  Cut / Paste carry the selected model objects too, over the system clipboard, so they paste into another model,
  tab or project. A paste gives them new ids — offset 5 paper mm only when pasted back into the model they came from (into any other model, tab or project they keep their exact position, shapes too) — keeps attachments between copied
  things and lets go of the rest, and matches each object's layer by id, then by name.
  **From the Sheets tool:** Ctrl+C (or Copy) in a Sheets 3D viewport also puts the objects on the system clipboard in
  this format, mirrored from Sheets' y-up plan to Pages' y-down (`sheets/tools/model3d/pagesClip.ts`).
- **Doors / windows are real holes in 3D** (after OpenCad's wall builder): in the 3D / perspective view each wall
  segment an opening box crosses is built as solid panels around it — jambs either side, a header above and (a
  window) a sill below — so you see through the hole and its reveals. Picking in 3D goes through the hole too.
  Plan / elevations keep their masked openings. (`3dview/projection.ts` openingCuts / segmentGaps / wallBoxes)
- **HATCH (2D)**: a rect, ellipse or closed polyline can carry a line pattern (horizontal, vertical, grid, diagonal,
  diagonal cross) at a spacing in model mm (default 300, e.g. cable-ladder rungs). Properties › HATCH; DXF as lines.

## Round 9 (2026-09-26) — status-bar counts, NOTE → TEXT, graph AUDIT
- **Status-bar counts** (K1): Outlets / Conduits / Racks totals for the active model. With a selection, they
  count only the selection, tagged SEL.
- **NOTE merged into TEXT**: a note is now a TEXT with a wrap width (`noteW`, `isNote()`); stored / copied
  `type: 'note'` shapes migrate on load. Properties › TEXT has a **Wrap** switch (on = wrapped markdown with a width
  and an optional frame, off = plain lines that can be a callout). The NOTE command and pasted multi-line text make
  a wrapped text. Labels stay a plain field on other objects.
- **AUDIT** also checks the active model's walls / conduits (`3dview/graphAudit.ts`): segments naming missing nodes,
  zero-length and duplicate segments, nodes on top of each other, orphan nodes, empty runs, ends attached to a box /
  outlet that's gone, devices in a missing rack, panel ports allocated to a missing outlet. It lists them and
  offers a fix (one undo step).
- **New sheet here** fits the viewport to the place's plan: 3D objects plus the plan's shapes and floorplan image
  (a zone far from the drawing centre used to open half off the frame).

## Round 8 (2026-09-26) — notes blocks, rack presets, pasted images to storage
- **NOTE** (K3): a notes block shape — markdown (# headings, - bullets, 1. lists, | tables | with a |---| header row,
  **bold**) laid out in paper mm and wrapped to its width (`ui/noteLayout.ts`); annotative, optional frame. Grips
  move it / set the width. Properties › NOTE edits the text; DXF as TEXT + lines.
- **NOTE editor** (the pencil beside Properties › NOTE): markdown on the left, a live preview on the right. Pasting
  from Word / Google Docs / a web page keeps headings, bold (inline too), lists and tables (`ui/htmlToMd.ts`); Excel
  cells become a table.
- **Text with office apps**:
  - copied shapes also go out as readable text + HTML (Word / Notepad get the words; Excel gets a note's table as
    cells), with our shapes hidden in the HTML;
  - text pasted from another app into a view becomes a text shape or a NOTE at the cursor.
- **RACK presets** (Server / Network / Deep / Wall / Custom) + a Rack button in the tool strip's Boxes group.
- **A pasted image** goes to file storage (UploadThing); the image shape points at its URL on the active layer.
- **Typing** reaches the command line from anywhere but a text field (after a tree click it stayed with the tree).

## Round 7 (2026-09-25) — racks, pages between projects, fixes
- **RACK**: U / width / depth (remembered), then click centres. Each is a real rack object (Box + rack data, R01,
  R02 …) with devices in Properties; plan only.
- **Pages between projects**: tree › a sheet › Copy page, then tree › a place › Paste page here (another project /
  tab / browser). Copies the sheet, its frames and their annotations; a frame whose model isn't there shows Missing
  model.
- **Viewport resize** keeps the drawing still on the paper.
- **Number inputs**: small right padding, and an empty field types from the left (the caret hid against Chrome's
  spin arrows).
- **Structure lines** in elevations are 1 px screen-constant, in darker tones (they had shrunk to hairlines in 1:100
  viewports).
- **Draw tools** show their step in the command line; a Properties field commits before a press re-selects.

## Round 6 (2026-09-25) — angles, named views, polyline corners, viewport clipboard, structure
- **DIMANGULAR**: two lines, then where the arc goes (which of the four angles). The result is an arc plus its
  figure, grouped.
- **VIEW** (named views): save / restore / delete a drawing's zoom + pan + scale. Stored per project + drawing +
  viewport, in this browser.
- **FILLET / CHAMFER on a polyline corner**: pick its two segments; the arc is sampled into the polyline
  (`modify.cornerInPolyline`).
- **Viewport frames on the system clipboard**: copying a frame on paper also writes it out, so Ctrl+V on paper can
  take frames from another tab or browser.
- **Building structure in elevations**, from the storeys: slab bands + raised-floor lines on layer A-FLOR, ceiling
  lines on A-CLNG — shown while those layers are on (`vpView.structure`).
- A Properties field being edited commits before a press on the drawing re-selects (it used to save onto the newly
  clicked shape).

## Round 5 (2026-09-25) — clouds, dimensions, stretch, quick select, blocks audit, system clipboard
- **Draw tools prompt in the command line** ("Line: specify next point" [Close/Undo] — clickable).
- **REVCLOUD**: two corners, Polygonal (points; Enter closes) or Object (a rect / closed polyline). Clouds now
  work on closed polylines too, bulging outward whichever way the outline winds (`cloudPathPts`).
- **DIMCONTINUE / DIMBASELINE** (from the selected or picked dimension; baseline stacks 8 paper mm apart),
  **DIMRADIUS / DIMDIAMETER** on arcs and circles. A dimension's Text is a template: `<>` = the length (R<>, Ø<>).
- **STRETCH**: a crossing window. What's wholly inside moves; points / edges inside a crossing shape move
  (`modify.stretchEnt`).
- **QSELECT / FILTER**: every shape here of a type, layer, colour or block.
- **PURGE** (unused custom blocks — it asks, and warns that the library is shared by every project) and **AUDIT**
  (block inserts whose block is missing; the ones in view get selected).
- **System clipboard**: Ctrl+C writes the shapes as marked JSON text as well, so Ctrl+V pastes them in another
  browser tab or project (the paste event reads it with no permission prompt). Ctrl+V with an image on the
  clipboard (a screenshot) inserts it as an image shape.
- A right + wheel zoom (or a right-drag pan) no longer counts as a right-click, so it doesn't cancel a draw.

## Round 4 (2026-09-25) — more drafting commands, riser editing, POLAR
- **JOIN**: lines that meet end to end → one polyline. **EXPLODE**: a block → its shapes + attribute texts; a
  polyline → its segments; a rectangle → 4 lines; a group → ungrouped (`ui/explode.ts`).
- **FILLET** (Radius; 0 = a clean corner, else a tangent arc) and **CHAMFER** (two distances). Both take two
  2-point lines, picked on the side to keep (`modify.corner`).
- **LAYOFF / LAYFRZ / LAYISO / LAYUNISO / LAYON**. LAYFRZ is VP Freeze in the active viewport, else off.
- **POLAR tracking** (status bar POLAR, F10, the POLAR command): the rubber band slides onto the nearest 15° ray
  (within 4°), with a dashed tracking line.
- **Command line**:
  - a prompt's [options] are clickable;
  - ▴ expands the whole history;
  - PLAN / FRONT / … on a sheet need an active viewport (they no longer re-aim the first one).
- **B4**: a sheet's viewports are numbered in reading order and renumbered as they move (`ui/frameNumber.ts`).
- **F4**: Alt-drag a node inside a run splits it there. The selected segment's end comes away; otherwise the segment
  pointing the way you drag (`modelEdit.splitNode`).
- **Riser frames with hidden floors**: shapes are selectable and editable again (click / marquee / grips). The view
  works on the drawn heights and writes the real ones back (`storeyMap.unmap`).

## Round 3 (2026-09-25) — layout tools, help, connection points, logo storage
- **Align / distribute** (`ui/arrange.ts`): Properties › ARRANGE › Align (left / centre / right / top / middle /
  bottom — to the extreme shape or the centre line) and Distribute (equal gaps, 3+). Also the ALIGN command. A group
  moves as one.
- **ARRAY**: Rectangular (columns × rows × spacing) or Polar (centre, count, angle to fill), in one undo step.
  Outlet copies get the next free labels.
- **MIRROR**: about a two-point line, keeping or erasing the source (`groupXf.mirrorAbout`). Blocks flip; text and
  images move but stay unmirrored.
- **MATCHPROP** (the layer + style of one shape onto others) and **SELECTSIMILAR** (the same type + layer / block).
  The "Select shapes" prompt also takes a typed point.
- **Help** (`parts/HelpDialog.svelte`, modelled on Kestrel's; the title bar ?, F1 or HELP):
  - "How do I…" answers;
  - keys & mouse;
  - the command line, with examples;
  - every command (click to run it);
  - one search box filters all of it.
- **Connection points** (F6) are ratios of the box: U / V of the width / depth, so they survive a resize; legacy mm
  offsets are still read. Properties › Place… then click on the plan to add points (they snap).
- **Title-block logos in file storage** (UploadThing's image route, like Uploads). The project doc keeps only the URL
  + key. An upload failure keeps an inline copy; "Move to storage" uploads a logo still stored inline.

## Command line, round 2 (2026-09-25) — AutoCAD-style commands (from the todo.md pick-list)
- **Scripted commands** (`ui/cmdScripts.ts`): async scripts that ask "Specify base point:" etc.; an ask is answered
  by typed input (a point, a number, an option letter, text, Enter) or a click in the view, which is snapped, shows a
  rubber band from the base point and a ghost preview (`cmdBus.pick`). Right-click / Enter / Esc in the view answer
  or cancel. A typed point on a shape picks it; `;;` in a typed line is an Enter (AutoCAD script style).
- **Base-point MOVE / COPY / ROTATE / SCALE**: pick a base point, then a second point / angle / factor. COPY places
  copies until Enter (multiple).
- **Space = Enter** in ACAD mode (not while typing a name).
- **Draw**:
  - ARC: a new `arc` shape, stored as three points on it. It is drawn, picked, snapped (ends / middle / centre),
    gripped, moved / rotated / scaled and exported to DXF.
  - CIRCLE: centre + radius, or Diameter.
  - POLYGON: sides, centre, inscribed / circumscribed, radius.
  - LEADER: arrowhead, landing, text.
- **Modify** (geometry in `ui/modify.ts`):
  - OFFSET: lines / polylines (mitred), rectangles / ellipses (grow / shrink), arcs (radius).
  - TRIM: quick mode; click the part of a line to remove.
  - EXTEND: the nearer end grows to the next shape.
  - BREAK: between two points, or a split at one.
  - LENGTHEN: DElta / Percent / Total, for lines and arcs.
  - DRAWORDER.
- **Inquiry / view**: DIST; ZOOM (window / Extents / Previous), ZW, ZP.
- **Layers**: NEWLAYER (named, made current) and LAYMCUR.
- **File**:
  - SVGOUT / PNGOUT: the active view without the screen-only UI (the Viewport's `.vp-screen` group); PNG at 2×.
  - PDF: print, then Save as PDF.
  - SAVE / NEW / OPEN.
- **E5**: several outlets / block inserts are edited together in Properties (block, shared attributes, scale,
  mirror). A field they disagree on shows “— mixed —”.
- **F4**: select a segment vs the full trunk. A click selects the run; a second click selects the segment (Delete
  removes just it).

## Command line (2026-09-25) — Kestrel's, ported
- A command line above the status bar (`parts/CommandLine.svelte`): typing over the canvas lands there; Tab
  completes, ↑/↓ walk the suggestions / history, Enter runs (an empty Enter finishes a draw, else repeats).
- Vocabulary + parsing in `ui/commands.ts` (draw tools, MOVE / ROTATE / SCALE / ERASE / COPY / GROUP, views,
  toggles, panels, files; points `X,Y` · `@DX,DY` · `D<A` · a bare number = distance toward the cursor; `C` / `U`
  while drawing). `ui/commandRunner.svelte.ts` runs a line; points / selection edits go to the focused pane's active
  viewport through `ui/cmdBus.svelte.ts` (`VpInteraction.cmdTarget`, user coords Y-up).

## Parity pick-list, large + medium items (2026-09-25) — parity-review.md
- **Export**: File › Export… writes the active view as DXF (`exportDxf.ts`); File › Outlet Schedule… writes
  the model's outlets to Excel (`store/outletSchedule.ts`).
- **Sheets**:
  - duplicate a sheet;
  - copy / cut / paste / duplicate a viewport frame across sheets (`ui/frameClip.ts`);
  - a revision list (edit / delete / set current, P1 → P2 codes) and a revision table in the title block;
  - link sheets that open another tool;
  - print a set of sheets as one job, each at its own paper size (`parts/PrintBook.svelte`).
- **Title block**: our + the client's logos; strip / band / corner-box layouts.
- **Blocks** (intelligent blocks):
  - symbols (north arrow, section / detail / photo markers, elevation tags, faceplate, door), and a marker's
    LINK to a sheet or a URL;
  - a Blocks panel to place / drag in / save the selection as a block;
  - a legend built from the model's layers.
- **Annotations**:
  - floor-tile grids on a rectangle;
  - auto-number a selection;
  - project drawing defaults (Format menu), including a dimension unit;
  - a group transform box that rotates about the barycentre / scales from a corner. Multi-shape edits are
    one undo step.
- **Outlets**:
  - Insert › Outlet with sticky ports / type / layer;
  - the next label on placing;
  - walk renumber;
  - allocate outlets to a patch panel (`store/allocate.ts`).
- **Conduits**:
  - cable fill and a fill-rate viewport (`3dview/fill.ts`);
  - per-corner bend handles;
  - merge / join runs (`3dview/graphJoin.ts`);
  - connection points on boxes and outlets that conduit ends follow (`3dview/connect.ts`).
- **Racks**: a rack row becomes a 'rack' model with devices on U (`store/racksImport.ts`).
- **Views**:
  - per viewport, hidden-line removal, B/W and a plan cut band;
  - images inserted in an elevation stand on that elevation;
  - floorplans follow the Uploads calibration live, with an origin crosshair (`ui/floorplanLink.ts`).
- **Review round 2 fixes**:
  - Undo:
    - a new rack row is seeded before it enters the undo history;
    - async floorplan attaches and live calibration moves go into every undo step (`timeline.amendModel`);
    - a walk renumber folds into one step without a long-open gesture (`timeline.squashSince`);
    - moving the undo pointer closes an open gesture.
  - Overwriting a revision rewrites that revision's own version.
  - A copied frame carries its model.
  - Attached conduit ends follow every move (via DocEdit).
  - Logos are size-capped.
  - Group drags do one array pass per move.
- **Refactor**:
  - `canvasNav.svelte.ts` and `pageActions.ts` (out of `+page`);
  - `floorplans.svelte.ts` (out of `pagesProject`);
  - `ui/vpModelEdit.ts` (out of `vpInteraction`).

## Parity pick-list, small items (2026-09-25) — parity-review.md
- **Nav bar Pan / Orbit** are latched tools: a left drag (or one finger) pans / orbits; Esc, a right-click or a
  tool pick drops them.
- **Title block**:
  - a company block (name / address / contact);
  - Show toggles (logo / company / fields);
  - an optional printed margin border;
  - a per-sheet "shown on this sheet" switch;
  - frames snap to the drawing-area and title-block edges.
- **Sheets**: viewport labels print and have an editable Label; Ctrl/Shift-click sheets in the tree and drag
  them as a block; PageUp / PageDown page-pan the sheet.
- **Annotations**:
  - line text labels (start / middle / end);
  - a callout frame (box / underline / none);
  - type a dimension's length.

  The Sheets import keeps all three.
- **Editing**:
  - repeat clicks step down through overlapping shapes;
  - copied outlets get the next free label;
  - model objects Ctrl/Shift-click multi-select and move together;
  - shared layer / colour / base Z / height edits;
  - a model object's own colour;
  - greyscale images.
- **Layers**: the active layer can't be deleted; a layer with items asks, then takes them with it. Nothing is
  drawn onto a hidden or locked layer.
- **Keys and prompts**: `+` / `-` / Home zoom keys; a point count while drawing a run.
- **Refactor**:
  - `PropertiesPanel` is a dispatcher over `parts/props/` (Frame, ModelObj, ModelObjs, Place, Page, Ent, with
    shared `props.css` + `fields.ts`);
  - `docEdit.svelte.ts` holds the document edits (out of `+page`);
  - `projectImports.svelte.ts` holds the phase-8 imports (out of `pagesProject`).

## Drawings, models, places (2026-09-24) — drawings-plan.md phases 1–5
- Places, stored models (`projects/{pid}/models`) and sheets (registry `toolType 'pages'`); floorplan PDFs as
  image shapes; a global **Blocks** library with `insert` shapes; **Outlets import** (outlets → block inserts,
  trunks → conduits) per place; model views restored on reload; a click opens any place with a model.
- **Title block** (phase 5): one template per project (`pages.titleBlock`), auto-filled per sheet (project,
  title, location, Dwg №, rev, date, scale, size, drawn); edited in a sheet's page Properties.
- **Drawings dialog** (phase 6): sheets register (search, filters, grouping, sort, inline + bulk edit, renumber
  patterns, tags, archive, Excel export), archived list with restore / hard delete, and a Models tab (usage,
  archive / restore, frames showing a Missing model).
- **History** (phase 7): model versions (1.0 first; majors keep a full copy you can restore, minors are notes;
  "edited since" by content hash), sheet revisions (Issue rev N / Overwrite rev N, blocked until every model is at
  an unedited major — with Overwrite / Open per model), title block rev + date from the latest issue, draft
  packages of issued sheets. The mock revisions are gone.
- **Sheets import** (phase 8): a Sheets-tool sheet → a Pages sheet in a chosen place (drawings dialog › Import
  from Sheets), or another tool's register drawing → a one-frame Pages sheet (tree ⋮). Outlets viewports keep
  their scale + framing on the place model, with their annotations (text, lines, dims, rects / clouds, ellipses,
  callouts, images, outlet symbols as block inserts) scoped to the frame; unmappable viewports show "Not mapped
  yet"; a note lists everything that didn't map.
- `+page.svelte` split: `pagesProject.svelte.ts` (project side), `history.svelte.ts` (undo timeline),
  `ui/clipboard.ts` — 1640 → ~1200 lines.

## Refactors — code-review 2 R-items (2026-09-22 → 09-24)
Work was split across sessions: one spec'd and diff-reviewed, one implemented, one live-gated each
commit in the browser (`review.md §0a` holds the gate records). The working notes were in `HANDOFF.md`,
now deleted; it's in git history.
- **R1 Viewport split** (`refactor-plan.md` executed, then deleted — it's in git history before this
  commit): `ui/Viewport.svelte` 2209 → 90 lines. Pure modules `annotations.ts`, `mapper.ts` (one layout
  read per event), `hit.ts` (+ `pickAt`), `grips.ts`, `snap.ts`, `place.ts`, `gestures.ts`
  (`beginPointerDrag` + `DragRegistry`), `render/EntRender.svelte`. Then two classes: `vpView.svelte.ts`
  (view model) and `vpInteraction.svelte.ts` (pointer/key state machine). Plus `vpPrompt.ts`, `vpTypes.ts`
  and `render/VpMarks`/`VpOverlays`/`VpWidgets`.
- **R2** `viewState.svelte.ts`, `doc.svelte.ts` (PageDoc) and one `session` object. **R3** one Selection
  model (`selection.ts`, per-viewport `editor.sel`, including frames). **R4** the mock `'box'` Ent removed (3D
  solids are model prisms) and `line` retired for a 2-point polyline. **R5** one layer model per model. **R6** `modelEdit.ts` store mutations; `VpOn` = view events,
  plus an `Editor` for document edits. **R7** one projection path for render and edit. **R9** `+page`
  split (`Pane`, `ToolStrip`, `TabMenu`, `printing.ts`, the `Workspace` object).
- **R8-lite** `PaperPage` frames use the shared modules: `inBox`/`marqueeSelect` picking, `gripsLocal`
  resize, and `frameSnapDelta` paper-edge/margin/5 mm snap with Alt bypass. Full R8 (sheet = Viewport) is parked.
- **P1–P6** per-event mapper, hover via `pickAt` once per frame, history folding, cached iso pick faces and
  grips, and a pages-scoped pre-commit gate (`pnpm check:pages`).

## Features & fixes (2026-09-22 → 09-24)
- Bugs B19–B31 fixed. Highlights:
  - drag threshold + Properties remount (B19)
  - odd-sided prisms (B21)
  - elevation snap points sit on the drawn ground line, not in empty space (B22)
  - Shift-press toggle (B25)
  - first section/guide lost behind the `$state` proxy (B26)
  - stable drawing ids (B18)
  - dark AutoCAD-style model space (B31)
- **K5** model corners/nodes are OSNAP targets.
- **VP Freeze**: hide a layer in one sheet frame only.
- Split view keeps the left pane.
- One rotate/Shift-15° rule for every handle.
- Rack tabs at 1:10 with an editable grid step.
- XP7/19/22/26/32/33: margins, custom + Fit scale, viewport lock, frame mm, line types, line-end heads.
- **Real project data**:
  - File › Open Project (Ctrl+O)
  - project tree from Firestore, with buildings (create, drag floors, reorder)
  - Properties that edit project/building/floor/zone/room names
  - clicking a floor opens its model with the calibrated floorplan PDF on a Background layer
  - the last tree item is restored on load
- Zoom up to 2000 % everywhere (one clamp in `constants.ts`).

## Code-review 2 fixes (2026-09-22)
- **B1** svelte-check green (dropped the instance-script type re-export).
- **B2** paper frames render true 1:N scale (`PAPER_PX_PER_MM`, not the mock `BASE`).
- **B3** annotative sizing — dims/text/arrows/clouds are a fixed size on paper (`paperMm`), not on screen.
- **B4** one global undo timeline (per-tab history no longer reverts other tabs' edits).
- **B5** sections live in the model (`Model.sections`) — model-scoped + undoable.
- **B6** closing/reopening a tab keeps the page (document state keyed by drawing id).
- **B7/B9/B10** hit-testing follows paint order, one `tolMm` pick tolerance, tilted prisms pick/grip on their true silhouette.
- **B8** Edit-menu Cut/Copy/Paste/Delete wired.
- **B11/B12** removed the dead FrameSel path + other dead code/props/CSS.
- **B13** one nanoid id generator (`ids.ts`). **B14** fixed by B4. **B15** one home for the duplicated types (`types.ts`).
- **B16** the Layers panel can hide/lock model objects (walls/furniture/trunks).
- **R11** README file map + this changelog. **R1** started: `ui/annotations.ts` extracted.

## Capability milestones (earlier, from `todo.md` / model-plan)
- Ported the model3d engine into `3dview/` — a real 3D wall/conduit/prism model with plan/elevation/iso
  projection, hidden-line + shaded iso, section boxes driving live elevations.
- Data into the model: entities, guides and sections live in `Model`, shared across every view of a floor;
  undo rides one model snapshot.
- Multi-viewport paper space (draggable frames, per-frame scale/projection/clip), split panes, a drawing
  navigator, a title block, and a model registry (a floor + a rack as separate models in one sheet).
- Real dimensions (arrows + extension ticks + measured length), revision clouds, callouts, arrows.
- Grid + object snap, rotated-shape grips (provably fixed anchor), per-axis (X/Y/Z) prism rotation with
  rotate handles in plan + elevation, elevation depth-snap for drawing conduits across views.
- Image underlays with origin/scale/crop calibration; layers with groups + view presets.
- Touch: 1-finger draw/select, 2-finger navigate, pointer capture (the reference touch model in the app).
- Object styling (colour/weight/layer), copy/paste, group/ungroup, z-order, tool fly-outs with touch parity.

## Earlier work (moved from todo.md, 2026-09-27)
Items ticked in `todo.md` that the sections above didn't already record, condensed. Dates are when they were done.

**Drawing / editing**
- **Ellipse tool** (Shift = circle), **polylines** (the Line tool keeps adding segments in ACAD mode; Enter /
  double-click finishes) and an **inline text editor** (double-click a text) — 2026-09-20.
- **Shift constraints** live as Shift goes up / down: 15° lines / dims and square rects / ellipses while drawing, axis
  lock while moving, square about the opposite corner while resizing, 15° steps on a line end (2026-09-20).
- **CEN** status toggle: rectangles / ellipses drawn centre-out; every status toggle has a tooltip (2026-09-22).
- **Rotation**: a Rotation field (`rot`) in Properties (2026-09-20); a **rotate handle on every shape** (rect /
  ellipse / image / line, a box in plan), Shift snapping to 15° live (2026-09-22).
- **Picking**: a ~7 px screen tolerance at any scale (2026-09-20; lines 2026-09-21); unfilled closed shapes pick by
  their outline only; Shift+click only selects (never moves) (2026-09-21).
- **Right-click** ends a multi-point draw (polyline / Wall / Trunk / Pipe) and, with no draft, returns a drawing tool
  to Select; **Esc** from a drawing tool returns to Select first (2026-09-21).
- **Ctrl/⌘-drag duplicates** the selection; **one history step per drag / nudge gesture** (2026-09-21).
- **Graph nodes** (walls / conduits): insert a node in an elevation too, branch a node into a tee, node snap + pull a
  node off its partner (2026-09-20); select a node and Delete it — 1 segment: removed, 2: joined, 3+: the first two
  kept joined (2026-09-22).
- **Conduits**: per-segment width / height and a per-corner bend radius (a conduit default, a node's own overrides)
  (2026-09-22).
- **Guide lines** (2026-09-21): the Guide tool drops H / V guides (a Horizontal / Vertical fly-out for touch, Shift
  flips with a mouse) — selectable, draggable, undoable; a selected plan guide gives the depth of a conduit drawn in
  an elevation; a live Δ mm readout from the selected guide while placing the next (2026-09-22).
- **Text**: a monospaced font like Sheets; vertical align (top / middle / bottom); Enter = newline in the inline
  editor (Ctrl/⌘+Enter commits, with an on-screen hint); the editor sits on the text at any zoom and auto-sizes; the
  whole text extent is clickable (2026-09-20).
- **Object style**: colour / fill / weight / font / align on every shape with Sheets' defaults; an explicit weight
  always renders; the style shows while selected (grips mark the selection); a shared colour-grid picker
  (`$lib/ui/ColorPicker.svelte`) for objects, fills and layers, with Kestrel-style architectural tones (2026-09-20).
- **Model units are millimetres** (review §4.2, 2026-09-20; 1:100 default), and a view's scale really renders
  (2026-09-21).
- **Pan-content zoom re-scales the view**: with a viewport active and "Pan content" on, the wheel changes the drawing
  scale (1:100 → 1:84 …) about the cursor (2026-09-20).
- Fixes (2026-09-20): a polyline double-click no longer adds a zero-length segment; strokes and grips stay a constant
  width on canvas zoom.

**3D model**
- **Box base height (`z0`)**: dragging a box in plan no longer moves it in elevation; elevation grips edit width /
  height / base (2026-09-20).
- **Flat objects** (rects, lines, dims …) show as a ground line in elevations (2026-09-21).
- **Shapes drawn on an elevation** live in that plane and show only there (v1, 2026-09-20); **plan shapes lie on the
  ground** in the 3D view, foreshortened (2026-09-22).
- **Select objects in the 3D view** by the front-most face at the click (2026-09-21).
- **Orbit** button in the zoom tools (3D only), Shift snaps the orbit to 15°; the **WCS triad** is twice the size and
  turns with the orbit (2026-09-22).
- **Sections**: a persistent plan marker — drag to move, corner grips to resize, a floating toolbar (open / direction
  / delete), arrows on all four sides that drop that direction as a viewport on the current sheet; the arrow matches
  the direction dropdown (2026-09-20 → 22).
- **Risers** (2026-09-24 → 25): several risers per building; the riser doc's hiddenFloors → the frame's; Fit on a
  frame with hidden floors; free labels → front-elevation text, cables keep their colour; per-storey heights
  (Properties › HEIGHTS on a building). **H1** (checked 2026-09-27): imported riser rooms, ladders and cables are all
  editable in Pages, also in frames with hidden floors (a room kind + write-back to the Risers tool: not needed).

**Sheets & viewports**
- **Viewport frames**: one array of uniform frames per sheet, no special primary (2026-09-21); frame Properties (name,
  type, X / Y / W / H, border — "none" shows a faint non-printing dotted border); a Model / Source dropdown re-points
  a frame at another model (2026-09-21).
- **Active-viewport bar**: scale dropdown (1:1 … 1:500) + Full-size (2026-09-21).
- **ViewCube**: fixed-size pane gizmos with an x / y / z triad; redesigned (TOP / FRONT / RIGHT + a 3D button, amber
  hover); re-orients a sheet viewport in place instead of going fullscreen (2026-09-20); per tab and per split pane
  (2026-09-21).
- **Paper**: A4 / A3 / A2 + portrait / landscape in the status bar, per tab, without jumping the view; each split pane
  fits its own sheet (2026-09-20). **Print at true size** on the chosen paper (`@page`, review §2.2).
- **Per-projection framing**: a viewport's content pan / zoom and orbit are kept per view direction (2026-09-22).
- **Model / Sheet layouts**: Sheet = paper + viewport frames, Model = the drawing fills the pane; GRID toggle; the
  model name at the top centre of model tabs (2026-09-21).
- **The first paper / model-space mock** (2026-09-20): Kestrel-style drawing with a rubber-band preview, shared
  `Handle.svelte` grips, fixed-scale viewport windows on an infinite canvas, double-click to enter a viewport, border /
  marquee select, the Esc ladder, window / crossing selection, Ctrl+P prints the focused sheet.

**Layers**
- **Wired to the canvas** (`layers.svelte.ts`, 2026-09-20): new objects take the active layer; hidden layers hide,
  locked ones can't be picked; ByLayer colour.
- **Layer settings dialog** (name, colour, fill / line, line type, thickness in mm, lock, delete) and a **lock** beside
  every eye.
- **Drag to reorder layers** (direction-aware drop line) and **paint by layer order**, then by the objects' own order
  (Ctrl+] / Ctrl+[ and Properties › ARRANGE restack within a layer) (2026-09-20 → 21).
- **Background** layer group; Insert › Image… onto the active layer (2026-09-21).

**Files & floorplans**
- **Image calibration in the viewport** (Properties › IMAGE › Calibrate, 2026-09-22): origin crosshair, 2-point scale
  to a real distance, a crop window with the trim dimmed (grips on the cropped extent), crop % fields, opacity; resize
  keeps the aspect ratio (Shift = free).

**Navigation & UI**
- **Mouse / touch model decided** against Sheets (the §1a table in `todo.md`): the ACAD toggle picks the wheel + draw
  gesture, window / crossing marquee, one finger never pans.
- **Drawing navigator**: VSCode-style preview tabs; places select → place properties; the project name above the tree;
  Ctrl+K command palette (2026-09-20).
- **Properties panel**: two-way editing of the selection (a group box for several), page props when nothing is
  selected; X/Y/Z · W/D/H vector rows, a Layer dropdown, a multiline text box, Enter / Shift+Enter to the next /
  previous field; Delete in a field no longer deletes the selection (2026-09-20 → 21).
- **Status bar**: SNAP / ORTHO (Shift toggles it) / OSNAP / LWT wired; coordinates in mm from the active viewport; the
  zoom follows the wheel (2026-09-20 → 21). Tool prompts + inline-edit help sit at the pane's bottom centre.
- **Split view** mirrors the current pane; switching plan / elevation in one pane doesn't refit the other; the active
  viewport + selection come back per tab.
- **Tabs**: closing the last one shows "No page open"; the page title is the active drawing's name (clean Save-as-PDF
  file names).
- **Package / Version** selectors in the title bar (mock); the per-drawing revision lives in the History panel.

**Backend & project**
- **History panel** (2026-09-20): an undo / redo timeline (Ctrl+Z / Ctrl+Y / Ctrl+Shift+Z) — click any step to jump,
  undone steps faded; revision snapshots with a date and a note (REV / DATE / paper SIZE in the title block);
  restoring a revision restores only the current drawing.

**Other**
- **Code review 1 fixes** (`review.md`, 2026-09-20): fit centring (§2.1), keys go to the focused split pane (§2.6),
  Delete / Backspace + the Edit menu (§2.8), dropDoc leaks, the dirty flag, HistoryPanel prop mutation, title-block
  size, ViewCube TOP restores the sheet, shared wheel-normalise / zoom clamp + touchcancel (§4.4); adopted additive
  select, group move, Ctrl+D, select-all and nudge; `ui/geometry.ts` + its first Vitest tests.
- **Viewport callbacks bundled** into one `on` object (with `env`), cutting the Viewport props from ~30 to ~12
  (2026-09-21); shared constants in `pages/constants.ts`.
- **Review of the small parity items** (1f7c681): 8 bugs fixed — among them a pan drag that also clicked / drew, a
  dropped block of sheets reversing, hiding the title block stopping the margin border printing, and a click dropping
  a multi-selection of model objects.
- Fixes: a press inside an active frame no longer starts a paper marquee (2026-09-21); double-click-to-activate after
  the callback bundling; a marquee after a double-click no longer sticks with a not-allowed cursor (2026-09-20).
