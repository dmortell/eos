# Phase 6 — Elevations and sections

**Status:** REVIEWED (Dave, 2026-10-02) — answers in §6a.
- **Exit** (analysis §8): a room elevation of a comms room with outlets at height.
- **Retires:** the Pages 3D engine (`pages/3dview/`) as the source of elevations / sections.

## 1. What exists

- **Whole-floor elevations** (Front / Rear / Left / Right):
  - every rack, outlet and shape on the level, painted far → near with opaque fills (the "painter's" order);
  - risers cut to the floor (Phase 5);
  - a work depth for drawing.
- **There is no:**
  - cut plane;
  - depth limit (a view of one room shows the whole floor behind it);
  - section through walls.
- **Walls:**
  - `WallRole.openings` (door / window / hole: at, width, sill, head, swing) is in the model and kept by node edits.
  - There is no tool to place an opening, and neither plan nor elevations draw them (no gap, no swing).
- **Outlets in elevations:** a small box at their height, not a faceplate. Wall outlets aren't tied to the wall face
  (`hostShapeId` exists).
- **Rooms:** `Space.boundary` exists (imported rooms may have none).

## 2. Model (small, additive)

- **A SECTION view:** `ViewSpec { kind: 'section'; sectionId }`. The section itself is a stored record:
  - `{ type: 'section', id, levelId, name, a, b }`, where `a → b` is the cut line on the plan;
  - `side`: which way it looks;
  - `depth`: how far beyond the cut it shows;
  - `top?` / `bottom?`.
  - It can be placed on sheets like any view. Section marks are drawn on the plan (the line, its arrow and its
    name). Drag the marks to move the cut.
- **ROOM ELEVATIONS** are four sections made in one go from a room's boundary (or its racks' extent), one per wall,
  each looking at that wall from inside, depth = the room. Named "IDF1 — A / B / C / D".
- **A wall elevation** (one wall face, Pages' "wall elev") is just a section looking at that wall. No separate kind.
- **Openings** stay as they are in the model.

## 3. Drawing

- **Section generator:** the elevation generator, limited to what lies between the cut and `depth` (and
  top / bottom).
  - Cut walls and slabs are drawn as cut (thick outline + light hatch).
  - Everything beyond is drawn as now, far → near with opaque fills.
- **Hidden lines:** the opaque fills already hide what's behind on screen, in PDFs and on sheets. The analysis's
  "interval method" (true hidden-line removal) is only needed for line-only output (DXF of an elevation).
  Proposal: **skip it** until DXF elevations are asked for (§6 Q3).
- **Openings:**
  - Plan: the wall with a gap, a door swing arc, and a window's sill line.
  - Elevations / sections: the opening's outline at sill / head in the wall.
- **Outlets at height:** wall / box outlets are drawn as a faceplate (a small rect with its port count / label) at
  their z on the face they're mounted on. Floor / desk outlets stay as now.

## 4. Slices

| # | Slice | Contents | Exit check (Test Project) |
|---|---|---|---|
| 6.1 | **Openings** | Door / Window tools (click a wall: width, sill, head from the tool bar); plan gaps + swing; Properties; drawn in elevations | A door into IDF1 shows in plan and the 1F front elevation |
| 6.2 | **Sections** | Section record + ViewSpec; a Section tool (two clicks + side); marks on the plan; depth / top / bottom clip; cut walls hatched; on sheets | A section through IDF1 shows only IDF1's racks and walls |
| 6.3 | **Room elevations** | "Room elevations" on a room → 4 sections; outlets as faceplates at height; labels | IDF1 A–D, outlets at height on its walls — the Phase 6 exit |
| 6.4 | *(optional)* 3D view | read-only three.js view of a level (boxes for racks / walls / runs) | Only if Dave wants it (§6 Q4) |

Rough size: ~1.2k lines. 6.2 is the core; 6.1 and 6.3 are small.

## 5. Size check

cad is 10.0k lines (non-test) after Phase 5, against the ~20k total target.

## 6. Questions for Dave

1. **Sections as stored records** with a cut line drawn on the plan (Revit-style marks) — OK? Or only room
   elevations made from rooms, with no free sections?
2. **Room elevations:**
   - Four per room (one per wall of the boundary's bounding box)?
   - For rooms with no boundary, use the racks' extent + 1 m?
   - Named "IDF1 — A / B / C / D", or N / E / S / W by compass (we have no north yet)?
3. **Hidden lines:** skip the interval method (opaque fills already hide things on screen and in PDF) until you need
   line-only DXF elevations?
4. **3D view:** wanted at all for now, or drop it (it was "optional" in the analysis)?
5. **Doors / windows:** just door, window and hole with width / sill / head / swing, or do you need others (a
   double door, a roller shutter …)?

## 6a. Decisions (Dave, 2026-10-02)

1. **Sections are drawn with cut lines** on the plan (stored records).
2. **6.3 Room elevations and 6.4 3D view:** later options, not now.
3. **Hidden-line removal:** skipped for now.
4. **Doors and windows are HOLES:** one Opening, no double doors / shutters.
   - **Fields:** **width**, **Z** (its bottom above FFL), **H** (its height) and a **swing** (none / left / right;
     `flip` = opens to the other side), drawn as a door arc on the plan.
   - **Model:** `Opening { id, segId, at, width, z, h, swing?, flip? }`. This replaces `sill` / `head` / `kind`
     ("head" was the top, Z + H; Dave doesn't need either term). No data had openings yet.

**Now:** 6.1 openings, 6.2 sections.
5. **Slab-to-slab walls** (Dave: "some walls (around the IDF rooms and UPS rooms) will be full height slab to
   slab"): `WallRole.slabToSlab` (Properties: "Slab to slab"). Such a wall runs from the structural slab under the
   raised floor to the underside of the slab above, following the level's heights (`wallSpan`).

## 7. Progress

### Slice 6.1 — openings (built 2026-10-02)
- **`domain/openings.ts`** (tests):
  - `placeOpening`: nearest wall segment within half its thickness + tolerance, centred on the click, kept inside
    the segment.
  - `wallPieces` / `planOpenings`: solid pieces around the holes, jambs, a door's leaf at 90° + quarter arc on the
    swing face, hinged on the left / right jamb as seen from the segment's `a` end; `flip` = the other face.
  - `openingCorners` (3D, for elevations); `wallSpan` (slab to slab).
- **The Opening tool** (H, plan only): click a wall. Tool bar: W, Z, H, Swing (none / left / right). The wall gets
  selected.
- **Wall Properties:** "Slab to slab" plus the openings table (W / Z / H / swing / ⇅ flip / ✕).
- **Plan:** walls draw with gaps, jambs and the door leaf + dashed arc.
- **Elevations:** the wall face is drawn as solid pieces AROUND each hole (beside / below / above), so what's
  behind shows through, and the hole is outlined.
- **Live check on 1F:** drew a wall in front of IDF1 (y −1800, x 7000–11200) and a 900 × 2100 door with a left
  swing at x ≈ 9000. In the plan: gap + leaf + arc. In the front elevation: R301 seen through the door.

### Slice 6.2 — sections (built 2026-10-02)
- **The record:** `SectionCut { levelId, name, a, b, depth, flip? }` (drawing.ts), plus `ViewSpec` `section`. It
  looks to the cut line's left as drawn (left → right = up the sheet, like Front); Flip turns it round.
- **`views/section.ts`** (tests):
  - `sectionFrame` / `sectionSpace`.
  - `sectionDisplayList` = the elevation generator with a `range`: only items between the cut and `depth`, and
    across the line's length, clipped to it.
  - Walls the line crosses are drawn as **cut** (solid, the wall's thickness measured along the cut, full height
    or slab to slab), with a gap where the line passes through an opening.
  - `sectionMarks`: on the plan, a dashed cut line, an arrow at each end pointing the way it looks, and the name at
    both ends. They show on sheets / PDFs of the plan too.
- **The Section tool** (Q, plan only): two clicks or typed ends; named A, B … per level; depth 5 m.
- **Using sections:**
  - **Properties:** Name / Depth / Flip / **Open section**. Drag the line to move it (`moveBy`); Delete removes it.
  - A **Section…** picker in the view bar lists the level's sections; the URL keeps `v=section.<id>`.
  - Sheet viewports can show a section ("Section A" in the View list).
- **Tests:** 268.
- **Live check:** Section A at x 9300 from y −1000 to −4500 (looking west), through the new wall at the door:
  - the cut wall is solid only above the door (2100 → 2600);
  - R301–R303 are seen end-on, with TR1 at the ceiling;
  - P3A (east, behind the viewer) is left out.

### After 6.2 (Dave, 2026-10-02)
- **Openings in Properties fit the sidebar:** two short lines per opening (W / Z / H, then Swing / Flip /
  Delete). The Flip button had been cut off.
- **Handles** (`editor/handles.ts`, tests). Grips that edit a property of the selected thing on the plan:
  - **A wall's openings:**
    - the middle square slides the hole along its segment (10 mm steps, Alt = free, kept inside);
    - the end squares resize it with the other end fixed (≥ 100 mm);
    - the round grip off the face it opens to steps the swing: none → left → right → left (other face) → right
      (other face) → none.
  - **A section:** the end squares move the cut line's ends; the round grip on the far edge sets the depth (100 mm
    steps). The depth outline shows while it's selected.
  - Handles take priority over node grips. They're blue / white (`.grip.grip-handle` / `.grip.grip-round`), so
    they show on the orange selection; an equal-specificity `.grip` rule had made them white-on-white.
- **Right-click = Esc, then Select:**
  - A run with 2+ points is kept, a half-made one is dropped, and an armed bulk patch / interconnect is let go.
  - Leader / cloud Esc now also keeps enough points instead of discarding them.
  - The tool hints say "Esc / right-click ends it and goes back to Select".
- **Pan / zoom survive a refresh:**
  - Every view's camera is saved in localStorage (`cad-cams:<pid>`, debounced) and restored.
  - A restored view is never auto-fitted again (Fit still works). Blocked storage just means fitting as before.
- **Live checks:** wall handles slide a door; the swing grip stepped none → left → right with the arc drawn; a
  right-click mid-section went back to Select without making one; the camera came back identical after a reload.

### More on openings / right-click (Dave, 2026-10-02)
- **Swing by drag:** besides a click (which steps the swing), DRAG the round grip to where the door leaf should be.
  The side of the wall picks the face, the half of the hole picks the hinge; back over the wall = no swing.
- **Holes are selectable:**
  - The middle grip is now a BAR the full width of the hole: drag anywhere along it to slide (it keeps the press
    point's offset), click to select that hole.
  - On the plan, a hole's gap carries an invisible pick band (`opening-pick`, sub = the opening id), so a click on
    the gap of an UNSELECTED wall selects the wall and that hole, and a drag slides it at once.
  - **Feedback:** the selected hole's row in the wall's Properties is highlighted (click a row to select it), and its
    bar turns orange.
  - **Delete** with a hole selected removes just that opening (`ws.openingSel`).
- **Right-click = Esc, exactly:**
  - The first ends what's in progress and stays in the tool. A run with 2+ points is kept (as Esc always did), a
    half-made one is dropped, an armed bulk patch / interconnect is let go.
  - The next (nothing in progress) goes back to Select. In Select it clears the selection.
- **Grip shapes:** squares move / stretch a position (like node grips); round = sets a property (swing, depth);
  bar = a whole hole.

### Todo
- **Shift constraints during drags:** pressing / releasing Shift mid-drag should constrain (H / V / along the
  host, 15° steps) live — for node grips, handles and moves (Dave, 2026-10-02).
- **Fix the drag marquee:** selecting shapes by window doesn't pick them up (Dave, 2026-10-02).

### Door swings solid; rack doors (Dave, 2026-10-02)
- **Door swing arcs** are solid thin lines now (the dashes were hard to see), on screen and in PDFs.
- **Rack doors:**
  - `Rack.doors { front?, rear?: 'single' | 'split', hinge? }`, offered in Properties for `cabinet` racks.
  - The plan draws each leaf open at 90° from its hinge, with its swing arc, so aisle clearance shows
    (`rackDoorPrims`, tested). "Left" hinge = the left of someone standing at that face; a split door has a leaf at
    each side.
  - No 3D: elevations already draw the devices on the face being viewed. The Pages "rack as a prism hides its
    devices" problem doesn't arise; a door need not hide anything.
- **Grip shapes, for later:** a round grip will also suit ROTATE.

### Shift is for constraints (Dave, 2026-10-02)
- **On the canvas Shift no longer adds to / removes from the selection** (it clashed with Shift-to-constrain).
  Ctrl-click toggles shapes and Ctrl+marquee adds to the selection.
- **Shift ranges stay** where Shift isn't a constraint: panel ports in rack views, and the grids (Outlets / Sheets).
- **Todo — Ctrl-drag duplicates** the dragged shapes, as in Pages. To settle when it's built: Ctrl-drag on a node
  grip already BRANCHES a run, and Ctrl-drag inside a selected sheet viewport pans its view; Ctrl-drag on a
  selection elsewhere would duplicate.
