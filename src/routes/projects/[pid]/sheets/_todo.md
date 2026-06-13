
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

4. Copy/paste from other projects / browser tabs

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
       devices/rooms/ladders), and a move-to-layer in their property editors. Add Layer should add the new layer under the currently selected default layer group, not the bottom of the list.

5b. Outlets   (largest item — split across several PRs)
  5b1. PDF floorplan: upload / insert a PDF as a floorplan background in the outlets viewport
       (reuse the uploads tool: origin/scale/crop).
  5b2. Auto-label new trunks: add a trunk-label input to the trunk props, and auto-generate a
       default label like the old tool. (Root cause of trunks showing the Firestore ID in old
       tools — there is currently no label input at all.)   ✅
       Trunk props now have a Label field; new trunks auto-label T<n> (one past the highest
       existing T-number), so they never render as the Firestore id in the old tools.
  5b3. Outlets list + Excel export — keep in the existing standalone tool (or a sidebar / menu
       item), NOT in the viewport.
  5b4. Auto-renumber outlets (after add/remove). UX TBD:
       - enter the first outlet number, then a button arms "incremental renumber" of the next
         outlets the user clicks (if the incremented label has an existing duplicate outlet, then increment the existing and all following outlets until there are no duplicates left), OR
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
  5c1. Trunk Shape: 2 toggle buttons (Rect / Pipe).   ✅
  5c2. Trunk Location: 3 toggle buttons (Floor / Ceiling / Wall).   ✅
       Ceiling maps to the existing 'ceiling-tray' value (both ceiling-* keep it active), so the
       model + old-tool rendering are unchanged — the plenum/tray distinction is just dropped from
       the Sheets UI.
  5c3. Type + Color on the Sheets trunk props.   ✅
       "Type" = the catalog preset from the outlets tool's Trunk tab (PIPE_CATALOG / RECT_CATALOG);
       picking one sets spec.catalog + its standard dimensions, editing W/H/Ø sets catalog='custom'.
       Also added a Z-elev (mm) field (writes z to all the trunk's nodes).
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

  5d6. If we want 3D views, should we start linking walls to floorplans now?
    * 3d editor code (for a multi-storey building) is available in M:\dev\pascal-editor-svelte\src


5e. Viewports   (small, mostly UI polish)
  5e1. Border property → checkbox (thin / none). Put checkboxes to the right of the prop label.   ✅
       (PropCheck now lays out label-left / checkbox-right, so all property checkboxes match.)
  5e2. Property-editor keyboard nav (for all property editor windows): Enter → next field, Shift+Enter → previous (skip textareas).   ✅
       `use:formNav` action (edit/formNav.ts) on the Sheet / Viewport / Outlets / Racks / Risers
       property windows — walks the visible input/select fields in DOM order; textareas are skipped.
  (UX) Viewport move handle: drag the frame edge to move (cursor: move) instead of a floating grip
       that looked like an annotation's rotate handle — leaves the top-centre free for a future
       viewport rotate handle. Corners still resize.
  5e3. Number viewports when a sheet has more than one; renumber on reorder/move (how?); include the
       number in the label when one is defined. (for references)   ✅
       Numbered by viewport order (stable under move, renumbers on add/delete) — shown before any
       text label, in the editor and in package print. (Order-based; a stored stable id can come
       later if references must survive reordering.)
  5e4. AutoCAD-style vp controls on the vp toolbar: scale down-triangle (pick scale).   ✅
       Scale <select> on the frame toolbar (when selected/active) → vps.setScale. (The "square
       control" is still TBD — wasn't sure of its purpose.)

5f. Annotates   (small)
  5f1. Consolidate the annote toolbar.   ✅
       Select + four quick annote buttons (first three fixed: text/line/arrow) + a "▾" picker
       listing all annotes (incl. Image). The picker is portalled to a fixed overlay (the Edit
       window clips/scrolls its content). Picking from the picker fills the LAST quick slot;
       clicking a quick button just activates it (no reordering).
  5f2. Image annote.   ✅ (URL / data-URL)
       New 'image' annotation kind (drag a box; fits the image inside). Set the source via the
       "Image URL" prop — accepts an http(s) URL or a data: URL. NOTE: clipboard-image paste and
       upload-to-assets (UploadThing) are deferred — base64 in the sheet doc is fine for small
       images but large pastes should upload first; follow-up.

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
  5h2. Include the patch list in packages.
       → NEAR-TERM (doing now): "file" sheet rows (see item 11) — a list row that opens the
         Patching tool; the user exports to Excel/PDF manually. It sits in packages as a reminder.
       → MAYBE (future): render the patch list to PDF pages directly inside the package print.
         Plan, if we build it:
         (a) Generalise package membership to a tagged union of items
             ({kind:'sheet'|'patch'|'frames'}), migrating sheetIds — 5g1 (frames) needs this too.
         (b) Extract a pure `buildPatchSchedule(connections, racks, devices, customCableTypes,
             portInfoMap)` out of patching/parts/exportExcel.ts → {sections[], bom[]}; share it
             between the Excel export and the PDF renderer so columns/grouping/labels never diverge.
         (c) In sheets/packages/[pkgId]/print: for each patch item subscribe to
             patching/{pid}_F{f}_R{r} + racks + frames (rebuild portInfoMap via buildPortInfoMap),
             JS-paginate rows into fixed-rows-per-page `.sheet-wrap` pages (landscape A3), each an
             HTML <table> + TitleBlock ("Patch Schedule — F/R", Page X/Y), then a BOM page.
             Patch pages are normal pt/CSS layout — skip the PX_PER_MM canvas scale transform.
         Open decisions: membership model (union vs parallel array); per-list drawing number for
         the titleblock; schedule-only vs schedule+BOM (+5h3 schematic later).
  5h3. Consider a schematic "hops" view of A-end ↔ B-end — there may be multiple patchcords between
       panels, ties and endpoints (similar to the hops in riser cable routes).


6. Sheets

6a. The rows in the sheets list should be draggable, like the lists in the Packages tab.   ✅
    Drag a row (grip in the # column) to reorder; sortOrder is renumbered to the new positions.

6b. Categorize the sheet list into: Outlet plans, Trunk plans, Risers, Elevations, Patch Lists, etc

6c. We will want to be able to add fill rate drawings to sheets. As these are essentially cross-sections of a trunk, they could be considered elevations (although some of them may be x-sections of a vertical riser). We could put them one per elevation vp.   ✅
    New viewport Type "Fill rate" → pick a section from the Fill rates tool (project doc
    fillrate/{pid}). Rendered as crisp SVG via a shared mm-space packSection() (extracted from the
    fillrate canvas), fit to the viewport frame, captioned "FR-xxx · size · Fill %". Static like
    the Text viewport (no annotation layer yet). Works in the package print too.


7. Implement section references as annotes.
I've seen two types:
7a. Circles with up to 4 triangles (north, south, east, west) with a sheet-vp number indicating the sheet and vp to refer to. I dont remember if one number pre triangle (will it fit?)
7b. A line with two perpendicular arrowheaded ticks indicating the viewpoint width and direction on a floorplan. A non-printing dotted backplane indicates the horizon, how far away from the line objects will be rendered in the elevation/section. The line is labeled with sheet-vp number of the section rendering.

8. Copy/cut & paste viewports to other sheets (or duplicate on current sheet)   ✅
   Select viewport(s) (frame click / marquee) then Ctrl-C / Ctrl-X / Ctrl-V (module-level clipboard,
   so paste works across sheets) or Ctrl-D to duplicate in place. Only active when no viewport is
   active (active viewports keep Ctrl-C/V for their annotations).

9. Surveys
* We dont need to include surveys in packages for now.
* The UX for selecting photos for inclusion in survey reports, editing comments, and placing markers on floorplans to show the prosiotn and direction the photo was taken, is non-intuitive. Improve the UX. When a photo is taken/uploaded, let user enter description and mark position/direction on floorplan (expandable minimap, wih selectable floors). Let user re-order photos for inclusion in report.

10. Multi-segment annote (need a better name for this text box type. is it a table?)
A rect with two rows, bottom row is 3 columns. User can enter text for each cell. Useful on  floorplans for indicating an equipment ref number, LAN port reqs ref number, Power req ref number, etc, with all refs listed in legends.

11. "File" sheet rows (external / Excel documents)   ← doing now
An "Add file" button on the sheets list adds a lightweight row with a drawing number + title that
links to a tool (Patching, Frames, …) instead of opening the sheet editor. Clicking the row opens
that tool, where the user exports to Excel/PDF manually. The row can be added to packages so it
appears in the set as a reminder to export (a placeholder page with the titleblock in the package
print). Use this for patch lists, BOMs, and any other dense tabular data that lives best in Excel —
the cheap alternative to rendering tables to PDF (see 5h2 MAYBE).

12. Markup   ✅ (hotkeys)
* For marking up a drawing, user should add a layer for the markup. Use Hotkeys to add clouds, text-callouts, arrow-lines
  → Single-key markup hotkeys (no modifier) while a tool viewport is active (edit/hotkeys.ts):
    C cloud · T text · N note(callout) · L line · A arrow · D dimension · R rect · E ellipse.
    Shown in the annote picker (key on the right) + button tooltips. New annotes land on the ACTIVE
    layer, so make a "Markup" layer active (Layers panel) first — that's the per-markup-layer ask.
  → Esc now reverts an armed tool back to Select (viewport stays active); a second Esc deactivates
    the viewport. (Was: Esc immediately deactivated.)

13. In original patching tool, when a patched port is selected, mark the ports at each end as either from or to, to make it easier to identify which button (reoute from or reroute to) in the toolbar we should use for repatching   ✅
    Selecting a cable badges its endpoints: amber "F" on the FROM port, violet "T" on the TO port
    (with matching ring colours), and the Re-route From / Re-route To buttons carry the same F/T dots.

14. Wall elevations
* allow adding wall-mount-panels (plain rects will do), vertical conduits, cutouts, outlets, trunks

15. apply formNav to other property dialogs for Enter navigation (e.g. the fillrate tool, device library)   ✅
    Moved formNav to $lib/formNav and applied it to the Fill-rate SectionEditor + the rack Device
    Library's custom-device form.

16. when adding a Callout, allow user to drag out the line, from the arrowhead to where the callout textbox should be. callout Textbox border should be off by default, add a buttons to toggle none, underline, border.   ✅
    Callout placement is now a drag: press at the arrowhead, release where the text box goes. Border
    defaults to None (off); toggle buttons None / Underline / Border in the props. The old 'leader'
    kind is merged into callout (border None = leader look) and migrated on load; 'L' is now Line.
    Cloud minimum size bumped to 500x500.

17. build a list of skills based on lessons learned during development of this app that would be useful when building similar apps in future. Or a list of MCP we should build or fetch
