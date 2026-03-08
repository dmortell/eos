# Outlet Manager

A comprehensive network cable floorplan manager with following features:

## Core Features:

- Image import - Import floorplans from PDF files or images
- Calibration - Set origin and calibrate scale by marking two points and entering real-world distance (this is implemented in the File Uploads tool)
- Network elements - Place outlets (circles), racks (rectangles), and draw cable trunks (polylines)
- Level toggles - Switch between low/high level outlets and trunks
- Auto-routing - Automatically calculates optimal routes from outlets to racks via nearest trunk
- LocalStorage - All data persists automatically

## Future Improvements for Later

- Cable calculations - Shows individual cable lengths and total cable required
- Data export - Export cable report as JSON
- Firestore - save updates in firestore



Features

  1. Zoom Functionality

  - Mouse wheel zoom: Scroll to zoom in/out (10% to 500% zoom range)
  - Zoom controls: +/- buttons in toolbar to adjust zoom by 20% increments
  - Zoom indicator: Shows current zoom percentage in the toolbar
  - Reset button: ⊙ button to reset zoom to 100% and pan to origin
  - Proper coordinate transformations in canvas rendering and mouse handlers

  2. Multi-Select

  - Ctrl/Cmd + Click: Add or remove items from selection
  - Visual feedback: Selected items show cyan highlight borders:
    - Outlets: circular highlight
    - Racks: square highlight
    - Trunks: dashed line overlay
  - Works with outlets, racks, and trunks

  3. Delete Functionality

  - Delete button: Appears in toolbar when items are selected, shows count
  - Keyboard shortcuts: Delete or Backspace keys to remove selected items
  - Confirmation toast showing number of items deleted
  - Automatically recalculates routes after deletion

  4. Panning

  - Shift + Click and drag: Pan the canvas in select mode
  - Middle mouse button: Also enables panning
  - Works seamlessly with zoom

  5. Print Preview

  - Print button: Opens comprehensive print preview modal
  - Canvas preview: Shows the full floorplan without zoom/pan transformations
  - Summary statistics: Total cable length, outlet count, rack count, trunk count
  - Detailed table: Lists all outlets with their types and individual cable lengths
  - Print button: Triggers browser print dialog with optimized print styles
  - Print-friendly layout that hides UI elements when printing

## Add shortcut keys

Shortcut keys to select tools:
- ctrl-o: outlet
- ctrl-r: rack
- ctrl-t: trunk
- Esc: select

- number keys: set the number of ports for the selected outlet(s)

Cable types:
- c: cat6a copper
- s: fiber SM
- m: fiber MM

Outlet types:
- w: wall mounted
- f: floor box
- b: outlet box (rosette)
- p: panel mounted

shortcut keys to select view mode:
- l: low level
- h: high level

outlet usage:
- n: network
- p: phone
- a: tv/av
- t: printer
- s: security

# Completed features

  ✅ Bugs Fixed

  1. Deleted trunk reappearing - Fixed by clearing selectedTrunk and currentTrunkPoints when deleting a trunk that's currently being edited (KimiPlanner.svelte:577-581)
  2. Print preview blank - Fixed by updating print styles to properly show content while hiding UI elements (KimiPlanner.svelte:1634-1680)

  ✅ Phase 1 Features Completed

  1. Comprehensive Keyboard Shortcuts (KimiPlanner.svelte:84-250)

  - Tool Selection:
    - Ctrl+O - Outlet tool
    - Ctrl+R - Rack tool
    - Ctrl+T - Trunk tool
    - Esc - Select mode
  - View Modes:
    - L - Low level view
    - H - High level view
  - Port Configuration:
    - 1-9 - Set number of ports on selected outlets
  - Cable Types: (applies to selected outlets/trunks)
    - C - Cat6a copper
    - S - Fiber SM (single-mode)
    - M - Fiber MM (multi-mode)
  - Outlet Mount Types: (applies to selected outlets)
    - W - Wall mounted
    - F - Floor box
    - B - Outlet box (rosette)
    - P - Panel mounted
  - Outlet Usage: (applies to selected outlets)
    - N - Network
    - A - TV/AV

  2. Drag-to-Select Rectangle (KimiPlanner.svelte:66-68, 625-764, 1257-1268)

  - Drag from empty space in select mode to create selection rectangle
  - Supports Ctrl/Cmd + drag to add to existing selection
  - Visual feedback with cyan dashed rectangle
  - Selects all outlets, racks, and trunks within the rectangle

  3. Enhanced Panning & Zooming (KimiPlanner.svelte:545-551, 773-796)

  - Right-click drag - Pan the canvas (context menu disabled)
  - Middle-click drag - Pan the canvas
  - Shift + left-click drag - Pan the canvas
  - Mouse wheel - Zoom at cursor position (not center!)
  - Zoom range: 10% to 500%

  4. Simultaneous Level Viewing (KimiPlanner.svelte:44, 1053, 1168, 1190, 1555-1561)

  - Toggle button: "👁️ Both" / "👁️ One"
  - When enabled, shows both low and high level outlets, trunks, and routes
  - Level selector still determines which layer new items are added to

  5. Symbol Legend (KimiPlanner.svelte:70, 1727-1784, 1661-1668)

  - Floating panel in bottom-right corner
  - Shows all symbols with colors:
    - Low/High Level Outlets (amber/pink circles with "O")
    - Network Racks (green squares with "R")
    - Low/High Level Trunks (blue/purple thick lines)
    - Low/High Cable Routes (amber/pink dashed lines)
    - Calibration Line (red)
    - Selected Items (cyan border)
  - Toggle button in toolbar
  - Can be closed with X button

  6. Extended Type System (planning.ts:7-35)

  - Added CableType: "cat6a" | "fiber-sm" | "fiber-mm"
  - Added OutletMountType: "wall" | "floor" | "box" | "panel"
  - Added OutletUsage: "network" | "phone" | "av" | "printer" | "security"
  - Extended NetworkOutlet with: ports, cableType, mountType, usage
  - Extended CableTrunk with: cableType

# Pending features:

## Phase 1 updates

BUG: Print preview modal looks good, but the browser print preview is blank.

Assign outlets to racks and patch panels so they dont get auto rerouted. When an outlet is selected, highlight the route, and let user drag the other end of the cable from the automatically selected rack to a different assigned rack. Or let the user lock the outlet to a specific rack.
Drag from an empty spot to select multiple items (outlets, racks).
Double-tap or Escape to complete a trunk
Allow viewing both the low level and high level details at the same time. Keep the level select as is to allow drawing on the selected low/high-level layer.
Prefer right-click-drag for panning, and right-wheel to zoom. Keep wheel and shift+wheel for vert/horiz panning.
zoom at the mouse cursor, and support mobile two-finger pan/zoom
Implement a legend of symbols and colors used in the plan.
Export a BOM (bill of materials) to request quotations, include empty columns for unit price and total price. Allow sorting by category.
Icons are available from the "@lucide/svelte" package if needed.
Editable rack details (rack number, rack type, rack height (both millimeters and RU), rack width, rack depth, rack location, maker, model).

Refactor the code to use a proper component structure. Put components and utility js files in the "parts" subfolder.

## Phase 2 updates

Implement text annotations and callouts.
Auto-number outlets: specify prefix and number of digits and start number, then click outlets in desired order.
Track changes and version history. Restart tracking when revision number is incremented.
Optionally show clouds around changes along with the revision number in a triangle. List revisions with the date and time and revision number and description/notes in the drawing title block.
Implement adding drawing notes to the plan. Show the note number in a small square on the drawing, then have a list of notes in a movable modal that can be sorted and edited, resized and printed.
Symbols for power sockets (wall,floorbox, OA tap, ceiling. Socket type and qty (NEMA L6-20). V and A ratings ).
Lock layers to prevent editing.
Each drawing should be stored under a project and page number. +page.svelte will list a menu of projects. Allow adding and editing pages.
Project and page information can be optionally included in the title block like a proper cad system. Company details, client details, author, date, page number, scale, etc.
Implement image cropping to remove white space. Implement image rotation.
Might need a menu bar for all the additional features.
Settings menu or config modal for all the additional settings.
Prepare for syncing to a database (Firestore) and user authentication.
The canvas should be responsive and fill the full area under the toolbar, currently it shows scrollbars.
Add right-click to complete a new trunk
Implement adding new trunk segments to an existing trunk waypoint, so waypoints can have 3 or more connected segments, like a T-joint or crossroads.
Set view mode to show both low and high level views at the same time by default. Save the setting in page configuration
Needs a help screen with keyboard shortcuts and mouse actions.
Do we need any move functionality  for conduit, containment, ladders, penetrations etc?

## Phase 3 updates

Show outlet labels at each outlet: label, outlet type (wall, floorbox, rosette), and number of ports
Change tool selection keyboards shortcuts from Ctrl to Shift (because ctrl-O and ctrl-t are browser commands)
Need a properties editor for selected item(s). To add details for outlets, trunks, racks, annotations, etc
Upload images to server so we dont have to keep opening them from local every time
Add image editing tools (non-destructive?) like crop, black/white, hide/erase parts.
Support PDF uploads
Implement viewports, so that a drawing page can show multiple sections of images (from this page or other pages) on the page, with configurable layer settings and additional annotations for the view
Racks need labels
Is origin used? Origin and calibration points are intended to allow correct alignment of objects on floorplan images revised with different scales/crops. need to save origin & calibration data for each image uploaded
For outlets, high level & low level should not be in 'type', use a different name (level? or use a meta object for all user data).
Allow editing height info for outlets, trunks, waypoints (like FL+300, FL+2600) that can be displayed along with the labels
Support vertical cable routes to other floors and risers, include in cable length calculations. Consider having a table of floors with height info.
Vertical trunks/risers: ladders, MK duct, EPS rooms
All data should be stored in a model for the project. Only the data for the relevant floors for the page/view should be displayed.
Support RCP (reflected ceiling plans) in addition to floorplan images.
Support different symbols for outlets (triangles for copper. what is the standard symbol for fiber)
Trunks need to support support various containment sizes along the route (ladder w/h, rectangular containment, steel/plastic piping).
Waypoints should be able to calculate the number of cables per type. Highlight issues with fill-rate exceeding parameters (40%) using the diameters per cable type

Use SHEET NUMBER instead of page number for drawings. Allow selection of sheets to be included in the project drawing set.
Support drawing list with revisions and submission dates
Support sheets with general notes, text with chapter and section headings, tables, abbreviation lists, symbol explainations, etc
Support drawing section marks and elevation markers with large 2-edge triangles. (nn/Axxx where nn is detail no. and xxx is sheet no.). Detail marks (04/AXXX) with callout to dashed circle
Support elevation height markers (6'-10" AFF, and metric version)
Circular and hexagonal grid bubbles
Support for links to open different sheets
Arrow keys as shortcuts for changing orientation of outlet symbols
Suport REDLINES for corrections, and clouds

Export to DWG or DXF

Support for dimension lines

# Bugs

BUG: A deleted trunk reappears when a new point is added. might need to clear the old points of the trunk.
BUG: immediately after opening an image file, pressing ctrl-o shortcut to add an outlet actually opens the file browser; use Shift for selecting tools instead of ctrl.
BUG: after pan/zoom, adding trunk points doesn't work, points are in the wrong position.
BUG: browser print preview still show up blank

ADD: layers to show/hide different parts of outlets drawings: low/high outlets/routes