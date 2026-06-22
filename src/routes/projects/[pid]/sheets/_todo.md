
## ⭐ HIGH PRIORITY (model3d / sheets editing)

STATUS: H1–H10, H12, H13 ✅ DONE. Remaining: H11 (snap line endpoints — deferred), H14 (auto-hide
section boxes). H9 grew into a unified group/single transform box (oriented BB, rotate-snap 5°/15°,
move/resize/rotate, group-aware marquee + faded outlines).

H1. ✅ Multi-select for conduit and wall segments, like trunks in the outlets tool — plus allow
    selecting the whole trunk.

H2. Floor grid annote to show floor tiles, with editable size (500mm by default) and X/Y offsets
    to align with the building's floor tiles.

H3. Remove unused per-editor single/multi variants (deleteSel / deleteMany / duplicateMultiAnns /
    duplicateSel …) that are now thin aliases. (see also 24d)

H4. Project-wide annot/object defaults (arrow/dim/line arrow types & size, font sizes, colors, …) —
    set via a toolbar like our old CAD app, or a dialog/window. Include a setting to display
    mm / m / km or none in dimensions.

H5. Refactor lines / dims / arrows / callout lines to share code? A dim is just a line with an
    auto-label; lines could support user labels; callouts are lines with a label at one end.
    Consider supporting labels at both ends and at the midpoint.

H6. Refactor all text boxes (callouts and other annotes/symbols with text/labels) to share code.

H7. Symbol selection box should be blue. Outlet hitbox is far too big — dragging a selection marquee
    through outlets doesn't select as expected (user has to draw a rect surrounding the oversized
    hitbox). Tighten the hitbox and fix marquee selection.

H8. View 2 (3303 4PAX), active mode: clicking just below the TV (just left of centerline) selects an
    object (the counter in the BREAK AREA) that isn't visible and is >10m away. Filter these out so
    far/off-view objects aren't selected by mistake.

H9. Multi-select group transform: show a selection rect with resize/rotate handles to resize and
    rotate multiple items as a group around the rect's center.

H10. Selected lines/dims need a stronger selection line — make it solid blue. Also: why does the
     selection line differ between marquee-select and click-select? They should match. Keep the
     endpoint handles from click-select, and add the solid thin blue line.

H11. (later) Snap line endpoints to other line endpoints. Our old CAD allowed connection-points on
     shapes/annotes/objects that lines could attach to, so lines moved with the shapes — powerful but
     complex; consider later.

H12. Grouping / ungrouping items (objects and annotes).

H13. Resize for rotated cuboids.

H14. ✅ Auto-hide section boxes — sections now show a small drawing-size label tag (sized like a
     section symbol's ref text); clicking it opens the editable clip box (move/resize/delete).
     Follow-up — section discoverability (for discussion):
       a) Clamp an off-screen section tag to the nearest visible plan edge so it's always reachable
          (a tag sits at the clip centre, which can be scrolled out of frame).
       b) A "Sections" list in a panel (like the wall/conduit segment list) — click a row to
          select / zoom-to that section regardless of where its clip is.
       c) After creating a section, keep the PLAN active (don't jump focus to the new elevation)
          and select the new section so its box is open immediately.
       d) Section props in the Object window (in progress): layer, label, view direction, scale, …
       e) Resolve the tag/ref to the elevation's viewport number + sheet (5e3/19e/7) so it reads as
          a real cross-reference, and make it print (move out of the edit-only layer).


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
       devices/rooms/ladders), and a move-to-layer in their property editors. Add Layer adds the new
       layer under the active layer's group.   ✅ (active-group default)
  5a7. (low priority) Drag a custom layer onto another group header to recategorise it
       (setLayerBase already exists — just needs drag handles in the Layers panel).   ✅
       Custom layer rows have a grip + are draggable; dropping on any default-layer header
       (highlighted green on hover) re-files the layer under it via setLayerBase.

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
  5c4. Trunk list (select-only). Visibility is handled by layers (5a.), not the old visibility toggle.   ✅
       A "Trunk" select dropdown in the outlets edit panel (when trunks exist) → selectTrunk.

5d. Elevations
  5d1. Rack list beside the existing dropdown: reorder racks by dragging selected row(s); "Add rack"
       button.   ✅ (in the Racks window — see 5d2)
  5d2. "Racks" button that opens a racks window (parallel to the existing Devices button/window).   ✅
       RacksWindow.svelte: select a rack, drag rows to reorder (sets the elevation order via
       reorderRacks), and Add rack. Opened by a "Racks" button next to "Devices".
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
       Numbered top-down then left-to-right by viewport position (reading order; row tolerance 15mm)
       via numberViewports() — shared by the editor and package print. Renumbers when viewports move.
       (Spatial; a stored stable id can come later if references must survive repositioning.)
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

6b. (low priority) Categorize the sheet list into: Outlet plans, Trunk plans, Risers, Elevations, Patch Lists, etc

6c. We will want to be able to add fill rate drawings to sheets. As these are essentially cross-sections of a trunk, they could be considered elevations (although some of them may be x-sections of a vertical riser). We could put them one per elevation vp.   ✅
    New viewport Type "Fill rate" → pick a section from the Fill rates tool (project doc
    fillrate/{pid}). Rendered as crisp SVG via a shared mm-space packSection() (extracted from the
    fillrate canvas), fit to the viewport frame, captioned "FR-xxx · size · Fill %". Static like
    the Text viewport (no annotation layer yet). Works in the package print too.


7. Implement section references as annotes.
I've seen two types:
7a. ✅ Circular section/elevation marker with up to 4 directional triangles (N/S/E/W), each carrying
    a sheet-vp reference number.
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

17. build a list of skills based on lessons learned during development of this app that would be useful when building similar apps in future. Or a list of MCP we should build or fetch   ✅
    → docs/reusable-skills-and-mcps.md (portaling popovers, capture/bubble keys, headless editor
      pattern, mm-space print, Firestore/URL reactivity, runes discipline, …; plus MCP ideas — a
      Firestore read/query MCP is the big one).

18. Fix ugly vp scale dropdown, invisible scale value, and tiny font in scales list   ✅
    Replaced the native <select> with a compact scale button (shows the current scale) that opens a
    <Dialog> — a grid of preset scales + a "Custom 1:" number input. The dialog is portalled out of
    the zoomed canvas so it reads at normal font size (the old <select> options were tiny/invisible).

19. Titleblock

  19a. In Sheets, do we have any way to edit titleblock project scope details (logo)   ✅
       Sheet menubar ▸ File ▸ "Project details…" opens the existing ProjectSettingsDialog
       (client logo/name, address, author) — previously only reachable from the projects list.

  19b. We have a slot for the clients logo in titleblock, we need our own company logo and details (name, logo, address, contact info). Best to allow editing in the project details, then have checkboxes to indicate which sections to include or leave out of the titleblocks. Allow opening a project details dialog from the menubar?   ✅
       Added a "Your company" block to Project Settings (name / contact / address / logo via
       ProjectLogoField) stored per-project on the project doc, plus "Include sections" checkboxes
       (company / client / site / revisions / approvals / scale-size). TitleBlock renders the
       company block at the top and honours the toggles; defaults (absent) keep every section on.

  19c. Logos in titleblock should be resizable (re-use our resize action/wrapper)   ✅
       Both logos (client + company) show a resize grip in the editor; dragging sets the logo
       height (mm), persisted per-project (logoHeightMm / companyLogoHeightMm) so it's consistent
       across sheets and in print. Uses the TitleBlock's pxPerMm drag (TransformBox is SVG-bound,
       so it doesn't fit the HTML title block); a live override previews during the drag.

  19d. Viewport frames should snap to page margins, titleblock edge, and maybe a 5mm grid on the paper page.   ✅
       Dragging/resizing a viewport frame snaps its edges to: paper edges, the printable margin,
       the title-block edges, and a 5mm grid (SheetEditor passes a `snap` rect to Viewport; tol 6px;
       hold Alt to disable).

  19e. Viewport numbering: best to let user enter VP numbers. References from other sheets should use id to lookup the number. We could return 0 for number if <2 vp on page, as number does not need to be displayed in this case.   ✅
       Viewport props gain a "Number" field (blank = auto). numberViewports() keys by viewport id,
       lets a manual `number` override the auto spatial position, and returns an empty map (→ 0,
       not displayed) when a sheet has <2 viewports. References (item 7) should store the target
       viewport id and resolve the current number via numberViewports() — the id→number map is ready.


20. Risers

Merge the sheets Riser renderer with our original risers tool renderer, they should both work the same way.

Original tool looks better overall, with better riser handles. The thin borders on risers/cables/rooms look good. Cables can be selected by clicking on the cable. The sidebar with the room editor and cable list is clear.

Sheets version allows dragging rooms to other floors and dragging to resize rooms which is good, but I dont like the circle handle for dragging the room, just make the whole room draggable.  The Edit window order of buttons is odd, with annotes between the edit cable select and the room editing form, this UX needs to be improved. The cable route hops works better than the original tool route editor.

  20b. Need a tool (dialog box) for editing all floors of a building. To init the floors, the user should enter then number of floors above ground and below ground. Allow selection of the labeling format (L01 or 1F or 01F or others). User can then select which floors do not physically exist in the building (some countries do not use 4F or 13F - superstition). Then in riser viewports, user can select which floors to include, with unused/hidden floors represented with break lines/cut lines (https://graphicdesign.stackexchange.com/questions/45929/what-is-this-design-pattern-called-continuation-wave).

  20c. Rare, but may need to support two or more buildings in one project. Example, we have a client with offices in two towers, with some neighboring floors connected by knocking down the connecting wall between them.


21. Touch support for tools

STATUS: Racks ✅ (full: 2-finger pan/pinch + 1-finger pan/tap). Outlets ✅ + Uploads ✅ (2-finger
pan/pinch fixed: non-passive listeners + touch-action:none; Uploads keeps 1-finger pan when no
calibration tool active; Outlets is 2-finger-only — 1-finger left for outlet select/drag). Sheets ✅.
TODO: Frames/Patching have no pan-zoom canvas (frames doesn't pan/zoom); Risers (sheets viewport) —
revisit if needed. Per-tool 1-finger pan for outlets could follow later.

│                │ Has touch, but it's the old buggy version — the exact bugs I fixed in Sheets (2-finger │
│ Racks          │  pan reversed + scaled by zoom, pinch not centred on the fingers) and no 1-finger pan. │
│                │  (That's exactly what you're seeing.)                                                  │
├────────────────┼────────────────────────────────────────────────────────────────────────────────────────┤
│ Outlets        │ Same old buggy two-finger code (OutletCanvas.svelte).                                  │
├────────────────┼────────────────────────────────────────────────────────────────────────────────────────┤
│ Uploads        │ Same, in the PDF viewer.                                                               │
├────────────────┼────────────────────────────────────────────────────────────────────────────────────────┤
│ Frames /       │ No touch at all — mouse + wheel only, so nothing on iPad and the browser pinch-zooms   │
│ Patching /     │ the whole page.                                                                        │
│ Risers         │                                                                                        │
├────────────────┼────────────────────────────────────────────────────────────────────────────────────────┤
│ Surveys        │ The touch code there is the separate public /survey share feature, not the project     │
│                │ tool.

The two-finger pan/pinch bug fix is quick and identical across racks/outlets/uploads (they share the broken code). But 1-finger pan is per-tool: each needs its own "drag empty space = pan, drag an object = move" hit-test, and racks in particular drags devices via real touch handlers (Draggable.svelte), so I have to make sure 1-finger pan doesn't fight device dragging. So I'd do it tool-by-tool, not in one sweep.

Note that the frames tool doesnt use pan/zoom.

The racks Canvas has two extra problems vs Sheets: its touch handlers are declarative ({ontouchstart}), which Svelte registers as passive — so their e.preventDefault() is silently ignored — and .panzoom here has no touch-action: none, so the browser hijacks the gesture.
Devices (.drag) call stopPropagation on touchstart, so device touches won't reach the Canvas — good, one-finger pan won't steal them.

21a.
  1. Racks only (first)
     Fix racks now: correct the two-finger pan/pinch (same fix as Sheets) and add one-finger pan + tap-to-select / drag-to-move, taking care not to break device dragging. You reported this one; good pilot before touching the others.
  2. Racks + Outlets + Uploads
     All three canvases that already carry the buggy two-finger code. Two-finger fix is shared/quick; one-finger pan done per-tool with each tool's object hit-test. Larger, and untestable here — you'd verify each on the iPad.
  3. All original tools
     Above plus add touch from scratch to Frames / Patching / Risers (currently mouse-only). Biggest scope; several tools I can't verify on a device.
  4. Just two-finger fix everywhere
     Only correct the reversed/off-centre two-finger pan/pinch on racks/outlets/uploads (quick, low-risk, shared bug). Skip one-finger pan for now — revisit after you confirm two-finger feels right on the iPad.


22. Rack elevations viewport

DONE (this pass): RU tick marks beside the numbers; thin BLUE selection border for devices (was thick
cyan); grey device fill (#d8d8d8) when "color devices" is off; right/middle-drag no longer drags a
device (it pans — guarded button!==0 in RacksEditLayer); rack selection by clicking the rack label
(thin blue outline + syncs the Racks window).
STILL TODO: floor/ceiling heights constrained to 10mm intervals (lives in the racks editor, not the
sheets viewport); row builder more options + move out of sidebar to a menu; dragging to add space
between racks. (These are original-racks-tool/editor changes, not the sheets viewport renderer.)

The original racks tool looks better than the sheets viewport renderer.

Racks tool - good features to replicate in viewport:
* tick marks for RU labels
* neat thin blue selection border (racks and devices) looks better than the thick border in VP
* gray background fill of devices (when "color devices" is off)
* Floor and ceiling heights should be constrained to intervals of 10mm
* Enable rack selection by clicking the rack label. Maybe implement dragging to add space between racks (not intuitive?)
* Sidebar rack list is good for selecting, dragging/re-ordering and deleting racks. Multi-select works
* Row builder is useful (although difficult for new users to notice). But needs more options for rack heights (RU) and depths. Maybe move it out of sidebar, into a menu item.


Racks viewport:
* right-drag should not drag devices, it is for pan/zoom


23. PDFs do not display on iPad (real device) — STILL BROKEN, revisit

Symptom: PDFs render fine in Chrome dev-tools "iPad Pro" mode but show nothing on a real iPad
(uploads tool PDF viewer + outlet floorplan background, which both use uploads/parts/PdfState).
Originally surfaced as "URL.parse is not a function".

What we tried (all pushed, still broken on device):
  - URL.parse is a 2024 static method missing on older iPad/iOS Safari/WebKit; Chrome device-mode
    uses the desktop engine so it only fails on real hardware.
  - Added a main-thread polyfill (src/lib/url-parse-polyfill.ts, imported by src/hooks.client.ts
    and PdfState) — got getDocument() past its URL check.
  - pdfjs parses in a Web Worker (separate global). pdf.worker.mjs also calls URL.parse
    (createValidAbsoluteUrl, lines ~397/401), so tried a worker shim that polyfills URL.parse in the
    worker then loads the stock worker, wired via GlobalWorkerOptions.workerPort (one shared worker).
  → REVERTED: workerPort has NO fake-worker fallback, so when that worker fails to init the PDF just
    spins forever (seen on device, and a desktop risk). Back to stock GlobalWorkerOptions.workerSrc.
    The main-thread polyfill (hooks.client + PdfState import) stays. iPad worker URL.parse unsolved.
  → After deploy, PDFs STILL don't display on the device (with the stock worker: original URL.parse-
    in-worker failure on old Safari).

Next debugging ideas (need a real iPad + remote Safari Web Inspector from a Mac to see the console):
  - Confirm whether the polyfill actually runs on device (log in hooks.client / worker shim) and
    whether the error is now gone or changed (could be a different missing API, not URL.parse).
  - Check if the ?worker shim is even being used (workerPort path) vs a cached old bundle; verify
    the deployed bundle hash changed.
  - Suspect other modern-API gaps in pdfjs for that Safari version (e.g. Array.fromAsync,
    structuredClone, OffscreenCanvas, ReadableStream BYOB) — pin the pdfjs-dist version vs the
    iOS version; consider the pdfjs `legacy` build (targets older browsers) for the worker+main.
  - Consider canvas/createImageBitmap or CORS/range-request issues fetching the PDF URL on device.
  - As a fallback, try the legacy build: import 'pdfjs-dist/legacy/build/pdf' + legacy worker.



Risers

20b. Building floors setup dialog (medium, high value)
A dialog to define the building's floors: enter # of floors above/below ground, pick a label format (L01 / 1F / 01F / …), mark floors that don't physically exist (e.g. no 4F/13F), then per riser viewport choose which floors to include — with hidden floors shown as break/cut lines. Self-contained dialog + a floor model on the project doc; unblocks proper riser drawings.

Surveys

9 — Surveys photo/marker UX (large, distinct area)
Rework the non-intuitive survey flow: on user enter a description and markposition + direction on an expandable floorplan minimap (selectable floors), and reorder photos for the
report. Biggest of these and its own domf.

Outlets

5b3. Outlets list + Excel export (medium)
Bring the outlets list + Excel export into Sheets as a sidebar/menu (explicitly not in the viewport). Reuses the existing standalone tool's export lort a usable data view.

Elevations

5d5. Draw trunks in elevations (medium)
Let the user draw horizontal + vertical trunks in a rack elevation to add detail to the floorplan trunks.
Extends the racks elevation editor with

Shared / refactor

5b6. Unify the rack property editors
Fold the three rack property editors (Sheets viewport / outlets tool / racks tool) into one shared component, keeping all advanced functionality. Cuts the racks-viewport parity work (item22) you're doing.

24. Outstanding from the selection / model3d refactor work (deferred by decision)

24a. Section clip checkbox — currently commented out in ViewportPropertiesWindow with a REVIEW LATER
     note (form.modelClip still flows through buildSource so existing clips work). Decide: delete it,
     or keep as the manual clip editor alongside the "Section → elevation" tool.

24b. ❌ CLOSED (not required) — Section ↔ elevation auto-linking / jump button.

24c. Outlet auto-layer: file new outlet annotations onto an "Outlets Low"/"Outlets High" layer by
     level automatically (outletLayerName helper exists; not wired). Currently land on the active
     layer — works, since per-model Outlets Low/High layers can be created manually.

24d. Selection refactor step 3 (tidy): retire the now-thin aliases (duplicateMulti/duplicateMultiAnns,
     deleteMany, cutSel) once nothing calls them; optionally move selection STATE fully behind the
     SelectionCoordinator. Pure cleanup — bugs are fixed.

24e. Ctrl+D / Ctrl+X on a MIXED (object+annotation) selection can create two undo steps instead of
     one (each editor checkpoints via beforeMutate). Centralise the checkpoint in the coordinator if
     it becomes annoying.

24f. ✅ Refactored text box + callout to share code (shared text-block render + props group).


24g. Allow the size of line endpoints (arrows, dots, ticks) to be specified for all line types in props and project defaults.

25. Context menu for objects/annotes.
     * group (enabled if multi selected)/ungroup (enabled if grouped) items

26. Add a polygon annote for drawing regular and irregular polygons. Consider making it like walls/conduits/trunks, for nodes with multiple edges. Or keep it simple, with regular polygons? Or allow nodes of regular polygons to be dragged to new positions?

27. Is json-guard really necessary? I thought firestore already has local first updates, so round-trips just return the same data and dont cause another update.

Guards were added because Root cause: SheetEditor only reloaded the viewport array when the sheet id changed — a guard meant to ignore its own save round-trips, but it also dropped remote edits (same id, new data). Objects were unaffected because they live in a separate models3d doc that already uses a JSON-echo guard.

Fix: switched the sheet load to the same JSON-echo guard — skip our own write, apply anything different (i.e. remote edits). On a remote edit it keeps your current selection/active viewport (only a brand-new sheet resets the view); non-active viewports re-seed their annotation editor so the change shows up.

- One intentional nuance: if you're actively editing a viewport, that viewport's editor won't re-seed mid-edit (so your in-progress work isn't clobbered) — remote changes to that viewport appear once you deactivate it. Other viewports update live. This is the standard last-writer-wins for the one you're editing.


28. Make grid a polygon with clipping path so it can cover a floorplan? Grids are difficult to select, may need to lock walls. Allow grids to be rotated? (maybe not, no floorplans with 45 degree tiles so far)

     28a. ✅ Grid draws in its LAYER's colour (AnnotationLayer), and the props colour control is
          hidden for grids — the bespoke props colour is gone.


29. ✅ When a layer is hidden/locked, selected items on it are removed from the selection (reactive
    prune via pruneSelectionVisibility, driven untracked when layer state changes).

29a. ✅ Hidden-layer walls/objects no longer click/marquee-selectable (edit layer skips hidden), and
     the toggle is live (editor.layerOverrides is $state).

29b. ✅ Documented all annote & symbol props (annotations/PROPS.md).

29c. ✅ Ctrl+A selects all visible + unlocked items (SurfaceEditor.selectAllVisible → coordinator).

29d. ✅ Logo resize — click a title-block logo to select it → blue selection box + 8 handles
     (replacing the tiny corner grip). Height-only/aspect-locked, so any handle drags vertically;
     click outside to deselect; selection chrome is print:hidden. (TitleBlock.svelte)


What should the section tag show + reference?

  1. Elevation no. + sheet ref
     A symbol with the elevation viewport's number and the sheet it lives on (resolved via the existing viewport-numbering/reference system), e.g. 2 / A-301. True drawing cross-reference.
❯ 2. Just the section label
     Show the existing s.label (e.g. “Section 1”) as an editable text tag for now; wire the sheet/viewport-number resolution as a follow-up. Faster first cut.
  3. Direction arrow + label
     A section-line style tag: a short arrow showing the view direction + the label. More like a building section mark than an area/detail callout.


30. ✅ Renumber tool — right-click ▸ "Auto number…" (annotations selected) opens a dialog: Start,
    Increment, number Format (### → padding), Apply mode (overwrite / prefix / suffix / fill-# in
    label), Order (selection / by existing number / X-then-Y / Y-then-X). One undo step + toast.

31. ✅ Migrated outlet.label → shared `text` field (migrate() on load; render + props + auto-number
    use `text`; OutletProps.label removed) so the standard font/text controls apply.

32. ✅ 3D (iso) views toggle layer visibility — iso render already honours per-viewport
    vp.layerOverrides; activating the 3D viewport shows the Layers window targeting it.

33. ✅ PDF renderings in floorplans crop the drawings as defined in the upload tool.
    model3d underlays now clip to the page crop (Model3dUnderlayImage), matching the outlets
    floorplan. Crop is taken as a fraction of the placed rect so it follows move/resize, and the
    clip is applied in pre-flip space so it mirrors with a flipped underlay.

34. ✅ Dash/dot stroke scaling decided — drawing units (print-correct); dashes magnify with zoom,
    consistent on the printed sheet. (Chose this over screen-constant / width-proportional.)

35. Need a legend annote.
Can it be auto populated based on the layers/symbols in the drawing? With visibiility toggles for user to select ones to hide/show. And options to show the items count.

36. Build a library of shapes (do we have one already? if not let me know, I have reference code somewhere with details on how they are stored in firestore)

User should be able to drag shapes from the library to the view.
User should be able to drag a grouped shape from the view to the library (or use a context menu), and enter a name for the shape.
We might want to tag or categorize shapes into groups (network, cabling, racks, furniture, etc) for when the list grows long. And a search.
Needs to handle both objects and annotes.

37. Add a table annote
Needs insert/delete rows/cols.
Need to be able to merge/unmerge rows/cols.
Needs a cell editor to edit text in cells.
Can it be done in markdown with a markdown renderer? Or do we need a full excel-like editor?



Here are the outstanding todos (the H-list is mostly done — only H11 remains; these are the open numbered items):

Quick / standalone

- 24b — Section ↔ elevation linking: auto-fill the section tag's drawing/viewport number from sheet placement (Revit-style) + a plan↔elevation jump button.
- 24f — Refactor text-box + callout to share render + controls code (they already share auto-size + props).
- 24g — Let line endpoint sizes (arrows, dots, ticks) be set in props + project defaults.
- 35 — Legend annotation.
- 34 — "Dash/dot strokes view-scale dependent" — note this contradicts the drawing-units choice you just made; probably close it or redefine.
- 27 — Investigate whether the JSON echo-guard is still necessary (Firestore is local-first).
- H11 — Snap line endpoints to other endpoints / connection points (deferred, complex).

Medium features

- 26 — Polygon annotation (regular + node-based irregular, like walls/conduits).
- 28 — Grid as a clip-path polygon so it can cover a floorplan; allow rotation.
- 36 — Build a shape library (you mentioned you have reference code for Firestore storage).
- 3 — Revisions: track published packages + revision history on the sheet list.
- 4 — Copy/paste viewports from other projects / browser tabs.
- 14 — Wall elevations.

Section references (item 7)

- 7a — Circular section marker with up to 4 directional triangles carrying sheet-vp references.
- 7b — Section line with perpendicular arrow ticks (view width/direction) + non-printing horizon backplane.

Large integration work (item 5 — original tools → Sheets)

- 5b Outlets, 5c Trunks, 5d Elevations, 5e Viewports polish, 5g Frames (port-label integration), 5h Patching, plus 5a6 (tool objects get per-object layerId/visibility).