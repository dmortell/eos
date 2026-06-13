
1. Package sheets into drawing sets  ✅ DONE
   Sheets/Packages toggle on the list; PackageManager with two-list membership (add/remove/reorder by
   buttons or drag); per-package Print → /sheets/packages/[pkgId]/print renders every sheet one per
   page. Data: projects/{pid}/sheetPackages. (Page number in titleblock still TODO if wanted.)
See the packages tool (src\routes\projects\[pid]\packages) and drawings tool (src\routes\projects\[pid]\drawings)

A toggle button in our sheets list view switches to package manager which lets use add/edit a list of packages/drawing sets.
A print button on each item in the list opens a print preview with all sheets in the package, one per paper page, that can be printed to PDF or hardcopy. (we might want the page number in the titleblock at a later date).
On selecting a package, show 2 lists, one with sheets in the package and one with remaining sheets. Let the user select drawings in one list and drag them (or use buttons) to move them to the other list.
Allow user to reorder sheets in the list.

Try to reuse the existing sheet list code.

2. Renumber sheets  ✅ DONE
A renumber tool (maybe a menuitem in a ... button to the right of the New Sheet button) that lets renumber selected or clicked sheets in the list in order continuing from the previous or first selected sheet.
Preserve any prefix text the user may have entered in the label.
   → Row checkboxes + select-all; "⋮" menu ▸ "Renumber selected (N)". Sequential from the first
     selected sheet's number (or the sheet before it / 1); each sheet's prefix + zero-pad preserved.

3. Revisions
Like our exiting tools, our sheets/packages will need to track published packages and revisions.
The sheets list should show the latest version by default, but maybe a dropdown arrow in the actions column to select an old version for viewing or allow reverting it to be the latest version for further updates.

4. Copy/paste from other projects


5. Integrate original tools with Sheets

5a. Layers   ✅ DONE (annotations) — tool-object assignment still TODO
  Custom layers are project-wide (stored on the project doc as `sheetLayers`), filed under a
  default layer as their category, and shown indented in the Layers panel. The active layer
  (panel: "New objects → …") drives new objects; annotations now carry that layerId, so each
  layer hides/locks independently per viewport. Wrong-category (5a5) falls back to Annotations +
  an info toast. Move-to-layer is the "Layer" dropdown in the annotation properties.
  → Done end-to-end for ANNOTATIONS only. Tool objects (outlets/trunks/racks/devices/rooms/
    ladders) still map to their fixed default layer by kind — giving them a `layerId` + per-object
    visibility in every render/edit layer is the follow-up (touches the live object schemas).
  5a1. Custom-layer CRUD: add / rename / delete custom layers in the layer panel.   ✅
  5a2. Categorise a custom layer under one of the default layers (optional parent).   ✅
  5a3. "Active layer" selector — new objects are created on the active layer.   ✅ (annotations)
  5a4. Move selected object(s) to another layer.   ✅ (annotations — props "Layer" dropdown)
  5a5. Wrong-category handling: falls back to the default layer + info toast.   ✅
  5a6. TODO: extend layerId + per-object layer visibility to tool objects (outlets/trunks/racks/
       devices/rooms/ladders), and a move-to-layer in their property editors.

5b. Outlets   (largest item — split across several PRs)
  5b1. PDF floorplan: upload / insert a PDF as a floorplan background in the outlets viewport
       (reuse the uploads tool: origin/scale/crop).
  5b2. Auto-label new trunks: add a trunk-label input to the trunk props, and auto-generate a
       default label like the old tool. (Root cause of trunks showing the Firestore ID in old
       tools — there is currently no label input at all.)
  5b3. Outlets list + Excel export — keep in the existing standalone tool (or a sidebar / menu
       item), NOT in the viewport.
  5b4. Auto-renumber outlets (after add/remove). UX TBD:
       - enter the first outlet number, then a button arms "incremental renumber" of the next
         outlets the user clicks, OR
       - drive it from the multi-select list (better for hundreds of outlets).
       - user-defined prefix for outlet labels.
       - highlight duplicate outlet numbers as errors.
  5b5. Racks on the floorplan: list racks (from rack elevations); drag a rack onto the floorplan.
       - decide: disable creating new racks in the outlets tool, OR
       - generate a rack elevation by selecting an elevation/section on the floorplan and linking
         via a Section annote.
  5b6. Unify the rack property editors (Sheets / outlets tool / racks tool) into one shared
       component, keeping all advanced functionality. (shared by 5d. Elevations too)
  5b7. Link outlets back to patch frames (via the frames tool).
  5b8. Link trunks to one or more frames/racks; an outlet's secondary trunks auto-link to the
       nearest main trunk that connects to the correct frame/rack.

5c. Trunks
  5c1. Trunk Shape: replace the select with 2 toggle buttons.
  5c2. Trunk Location: simplify to floor / ceiling / wall toggle buttons.
  5c3. Add type + color to the Sheets trunk props.
  5c4. Trunk list (select-only). Visibility is handled by layers (5a.), not the old visibility toggle.

5d. Elevations
  5d1. Rack list beside the existing dropdown: reorder racks by dragging selected row(s); "Add rack"
       button.
  5d2. "Racks" button that opens a racks window (parallel to the existing Devices button/window).
  5d3. Custom device form → modal dialog (the list gets long); openable from the device list for
       editing existing devices.
  5d4. Link rack elevations to floorplan section views for section/elevation references — and
       support wall elevations (server-room wall panels, meeting-room AV), not just rack rows.
  5d5. Draw trunks in elevations (horizontal + vertical) to add detail to the floorplan trunks.

5e. Viewports   (small, mostly UI polish)
  5e1. Border property → checkbox (thin / none). Put checkboxes to the right of the prop label.
  5e2. Property-editor keyboard nav: Enter → next field, Shift+Enter → previous (skip textareas).
  5e3. Number viewports when a sheet has more than one; renumber on reorder/move; include the
       number in the label when one is defined. (for references)
  5e4. AutoCAD-style vp controls on the vp toolbar: scale down-triangle (pick scale) + the square
       control (purpose TBD).

5f. Annotates   (small)
  5f1. Consolidate the annote toolbar: a group toggle (Select ↔ annote) + a chevron dropdown to
       pick the annote; keep a few most-recently-used annotes as extra toggle buttons if space allows.
  5f2. Image annote: paste a URL / base64, or upload to the assets folder when an image is pasted
       (or dragged) into the view.

5g. Frames   (large — port-label integration)
  5g1. Keep Frames as a standalone tool (no viewport unless we want a titleblock), but list frames
       in the drawings/sheets list so they can be added to packages. (decide: render to HTML/PDF or Excel?)
  5g2. Usage-driven port allocation: assign outlets a room/row (rack?) + a usage; assign a usage to
       blocks of ports on frame panels to auto-allocate ports by usage. (see existing frames tool)
  5g3. Port labels in a viewport: add a "frame" (or "ports") option to the viewport View setting, so
       the user can zoom a rack large enough to read labels on an A3 portrait page.
  5g4. Rack ties specify the B-end for the panel/ports on this frame.
  5g5. Outlet list (replaces the Generate auto-gen, which we likely drop): bulk-set outlet usage,
       room (description) and type (high/low-level, etc). Sub-decisions:
       - highlight duplicate labels and numbering gaps (a coloured rule where not sequential).
       - is the list needed in BOTH the Frames view and the Outlets floorplan view?
       - or drop the list entirely and rely on the selected-ports toolbar — maybe always-visible /
         floating, disabled when no ports are selected.
       - the resizable sidebar works well; drop the vertical-arrangement toggle buttons (unused).
       - bring Export-to-Excel + Settings from the original tool into Sheets.
       - skip logs for port assigns (change history matters more for outlet/device changes).

5h. Patching   (mostly keep-as-is)
  5h1. Keep the patching tool as-is (manages patch lists + a visual connection editor).
  5h2. Include the Excel patch list in packages (rendered to PDF). No viewport render needed.
  5h3. Consider a schematic "hops" view of A-end ↔ B-end — there may be multiple patchcords between
       panels, ties and endpoints (similar to the hops in riser cable routes).
