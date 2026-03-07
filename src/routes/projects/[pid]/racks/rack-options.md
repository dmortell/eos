in the outlets tool I want to be able to place the racks on the floorplan. list some good ux options for this to discuss


● Here are some UX approaches to consider:

  Option A: Rack Tool Mode (new tab in sidebar)

  Add a third tool mode alongside Select/Outlet. The sidebar shows a list of racks from the floor's rack data. Click
   a rack to place it, or drag from the list onto the canvas. Racks render as labeled rectangles (width × depth
  footprint) that can be moved/rotated. Simple and consistent with the outlet placement pattern.

  Option B: Drag from Rack List

  Sidebar shows racks grouped by server room. Drag a rack from the list onto the floorplan — it appears as a ghost
  during drag, snaps to position on drop. No mode switching needed, works alongside select/outlet tools. Similar to
  how design tools handle component libraries.

  Option C: Auto-layout with Manual Adjust

  User defines a "server room zone" rectangle on the floorplan (one per room A–D). Racks auto-arrange in rows within
   the zone based on rack count/widths. User can then manually nudge individual racks. Less flexible but faster for
  standard layouts.

  Option D: Place Room Markers Only

  Instead of placing individual racks, place a single "server room" marker per room (A, B, etc.) on the floorplan.
  The marker shows a summary label like "Room A — 3 racks, 72U". Clicking opens a popover with rack details. Much
  simpler, avoids needing accurate rack dimensions.

  My recommendation

  Option A is probably the best balance — it's consistent with how outlets work, gives full control over
  positioning, and the sidebar tab idea you mentioned earlier (outlets / racks / trunks) fits naturally. The rack
  footprint rectangles would be to-scale using the same mm coordinate system.

  Option D is worth considering if precise rack placement isn't important and you just want to mark where rooms are
  on the plan.




Here's a summary of what was implemented:

  Rack placement on floorplans in the outlets tool:

  1. types.ts — Added RackPlacement (rackId, room, position, rotation), SidebarTab type, and rackPlacements to
  OutletsData
  2. +page.svelte — Subscribes to rack docs for all rooms (A–D) on the active floor, passes racksData to Outlets
  3. Outlets.svelte —
    - Sidebar tabs (Outlets / Racks) to switch between modes
    - Builds flat allRackConfigs from all rooms' rack data
    - Full rack placement CRUD: placeRack, placeRacks, removeRackPlacements, moveRacks, rotateSelectedRacks — all with undo/redo
    - Separate selectedRackIds state (cleared when selecting outlets and vice versa)
    - R key rotates selected racks, Delete removes them
    - Rack placements included in auto-save snapshot
  4. RackPalette.svelte (new) —
    - Lists racks grouped by server room with placed/pending status (green dot = placed, gray = pending)
    - Drag unplaced racks from list onto the floorplan
    - Click placed racks in list to select them on the drawing
    - Rotate/Remove toolbar buttons when racks are selected
    - Properties panel showing size, type, maker, model, rotation, position for selected racks
  5. OutletCanvas.svelte —
    - Renders placed racks as colored rectangles (color per room: A=blue, B=green, C=amber, D=red) with label and
  height
    - Front-side indicator: thick colored line on the front edge, rotates with the rack
    - Click to select, Ctrl+click for multi-select, drag-select rectangle includes racks
    - Drag placed racks to reposition them
    - Drop zone for drag-from-list (visual highlight on drag-over)
    - Rack hit-testing (racks checked before outlets in click handler)


  - Floating Window component appears over the canvas when one or more racks are selected on the floorplan
  - Positioned at top-right (right=16, top=48), draggable, collapsible, with localStorage persistence
  - Editable fields: Label (single-select only), Height (U), Width (mm), Depth (mm), Type (dropdown), Maker, Model
  - Read-only display: Rotation (with +90° button), Position (single-select)
  - Remove button at the bottom
  - Multi-select shows shared values or "— mixed —" placeholders
  - Changes save back to the racks Firestore collection via onsaverack → saveRack() in +page.svelte


  I'll replace the rack SVG rendering to use transform="rotate()" around the center, with the front line always
  on the top edge (before rotation)

  - Rotation input: Number field (0–345, step 15°) in the floating properties panel, plus the existing +90° button
  - setSelectedRacksRotation(): New function to set an exact rotation angle with undo/redo and sticky rotation
  memory
  - sharedRotation: Derived state showing shared rotation across multi-selected racks
  - SVG rendering: Now uses transform="rotate(angle cx cy)" on the rack <g> group, so any angle works. Front
  indicator is always the top edge before rotation.
  - Hit testing: Rotation-aware — transforms the test point into rack-local coordinates before bounds checking  
