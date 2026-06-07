# Sheets

Sheets is a simplified version of the Drawings tool in src\routes\projects\[pid]\drawings

Drawings tries to show complex views and editors of the other tools available:
* Fillrate drawings of pipes and rectangular cable containment: src\routes\projects\[pid]\fillrate
* Outlets shows trunk routes, racks and outlets on PDF floorplans: src\routes\projects\[pid]\outlets
* Frames sets port labels on patch frame elevationss: src\routes\projects\[pid]\frames
* Patching is to specify patch cord lists on patch frame elevations: src\routes\projects\[pid]\patching
* Racks edits racks and patch frame elevations in rows of a server room or datacenter: src\routes\projects\[pid]\racks
* Risers edits vertical cable routes between server rooms and EPS risers in a building elevation: src\routes\projects\[pid]\risers

Sheets will simplify these as follows:
* Each sheet in a project will represent a sheet of paper (normally A3 paper), with a titleblock
* Each sheet can have viewports added. Each viewport will contain a view into one of the tools rendering
* Sample code for the basic sheets is available in folder src-sample\routes\projects\[pid]\drawings (however there are some bugs)
* Make basic copies of each of the tools in folders under the sheets folder. Tools will be added in this order:
  1. Outlets
  2. Racks
  3. Risers
* Each tool will render content into a viewport. Floating windows or sidebars will allow editing properties of the content and objects rendered in the viewport

On print preview, each sheet must render only the content of the paper page area of the sheet, such that it fits the page when printed to PDF or hardcopy.

## Implementation steps

1. Create a list of sheets that the user can select for editing. Allow new sheets to be added
2. On opening a sheet from the list, allow the user to insert viewports by dragging out a rectangle.
3. A sheet properties panel should allow user to enter details for the titlebar
4. A viewport properties panel allows user to enter details of the viewport, including the type and data source

## Rack elevations

Simplifications (v1 — can add later if you want)

- Elevation omits per-U RU number ticks, overlap "!" warnings, wall rectangles, and the special desk/shelf/VCM frame internals (all rack types draw as a plain frame + 19" rect).
- Plan ignores frontProtrusionMm in depth alignment.
- Note: rack elevations read best at ~1:20–1:25; at 1:100 device labels are technically to-scale but tiny.


All clean. Here's what changed for the racks refinements:

1. Row selection — added a Row picker to racks properties (populated live from the selected room's racks doc; "All rows" default). Filters both elevation and plan to that row.
2. Thinner rack frames on screen — outer frame 0.6→0.4, inner 19" rect →0.3 (non-scaling hairlines). Note: on-screen stroke thickness scales with the canvas zoom (the SVG sits inside a CSS-transformed pan/zoom layer), so they look heavier when zoomed in — the reduced base keeps them light; PDF is unaffected.
3. Zoom-roll fixed — the device label had a min(…, deviceHeight) cap, so during zoom the font switched regimes and the baseline jumped ("rolled"). Labels are now purely 6pt × scale, which renders at a constant on-screen size through the viewBox, so they no longer drift between zoom steps.
4. RU numbers — added on both rails (monospace, point-sized), aligned to each U slot.
5. Show walls — new checkbox; draws the left/right wall rects from settings.leftWallX/rightWallX (slab→ceiling) and includes them in the fit bounds.
6. Turn off device colors — new Color devices checkbox (default on). Off = the original look: white device box + dark bold label, no type-color fill (matching the original DeviceView, which has no background fill).
7. Plan labels — were scaling to rack size (min(w,d)·0.32); now 6pt × scale like elevation, so they're consistent and no longer balloon with rack footprint.

All point-based fonts (rack 8pt, device 6pt, RU 3.5pt, plan 6pt) render at a stable size on screen and at the true point size on paper.

Type-checks clean; not run. Worth testing: a Front elevation at ~1:20 (RU numbers + thin frames + readable labels), toggle Color devices off (should look like the original), Show walls on, pick a specific Row, zoom while active (labels should stay put now), and a Plan view (labels should be smaller/consistent).



 Stage I — Risers (complete) — the final tool:
- tools/risers/types.ts + engine.ts — copied the data-model subset and the full pure engine (floor bands, compression breaks, cable lane scheduling, cable polyline geometry).
- RisersRender.svelte — building elevation in real-mm: floor bands (plenum / ceiling line / raised floor / slab + floor label), rooms (server/EPS boxes with SER/EPS badge), ladders (with compression-break slashes + level tag), cables (lane-spaced polylines colored by media, with labels), and free-form text labels. Thin non-scaling strokes for the sheet/print look; fit + explicit-scale viewBox with the same onview reporting (so the scale readout works in Fit too).
- RisersViewport.svelte — subscribes risers/{pid}; from/to floor fall back to the doc's range.
- RisersProperties.svelte — From/To floor pickers (risers is a single per-project doc, so no doc picker needed).
- Wired into the dispatcher and properties window (Type → Risers).

Caveats (v1): floor labels show {n}F rather than the project's configured floor format; cable label placement is the midpoint of the longest horizontal run (approximate); strokes thinned for print.

Type-checks clean; not run. Worth testing: add a viewport → Type=Risers → set From/To floors → you should see the building elevation with floors, rooms, ladders and routed cables; try a floor range that hides floors (compression-break slashes on ladders), and print.

🎉 All plan stages A–I are done

Sheet list → editor shell → viewport persistence → sheet properties → viewport properties + text → Outlets (+PDF underlay) → print-to-fit → Racks (front/rear/plan) → Risers. The sheets tool now covers the three tools from the spec, with content pan/zoom, print-to-scale, and floating property windows.

If you'd like, next steps could be: refinements to risers (real floor-format labels, better cable label placement), the y-up conversion tool for legacy outlet floorplans (the deferred version-2 flip), or polishing the sheet list / titleblock. Let me know what you'd like to tackle.