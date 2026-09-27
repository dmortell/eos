# Sections at any angle + the Elevation tool — plan

**Status:** plan APPROVED 2026-09-27 (Dave: "looks fine, implement when ready"). Todo #17 "O4 section marker" + #1
"Elevation tool". Dave's review notes: OpenCad's section marker looks great (keep its FLIP to change the look
direction); its elevations look good — objects BEHIND walls are properly hidden unless seen through holes (doors /
windows / openings), which needs DEPTH; sections at any angle matter (drawings with non-orthogonal rooms).
Decisions (§5) taken as recommended: box sections stay alongside line sections; the elevation marker uses the eltag
look; numbering per model (E1, E2 …) — revisit if Dave objects.

## 1. What Dave asked for

- **O4 (OpenCad's section marker):** a section is a LINE drawn at any angle — dashed, with perpendicular arrows at
  each end and labels **A — A′** — not only today's axis-aligned box with N/E/S/W arrows.
- **Elevation tool:** place an elevation MARKER in plan (a point + a look direction, any angle), numbered, that links
  to an elevation view; "Drop as sheet" gives a fitted viewport LINKED to it (moves / re-aims live), like today's
  section drop.

Both are the same thing underneath: **a camera that looks horizontally along any direction**, over a clip region.
A section = a cut plane + a depth; an elevation = a viewpoint + a width / depth box (a section with no cut, or a cut
at the marker's line). Build the oblique view once, then two markers that drive it.

## 2. Today

- `Section = { id, clip: Clip (axis-aligned box), dir: ElevDir, name? }` (3dview/types.ts). `ElevDir` is one of
  front / rear / left / right; `ELEV_BASIS[dir] = { axis: 0 | 1, sign }` (ui/geometry.ts) — the view's horizontal is
  ±x or ±y. `elevU` / `elevUInv` / `elevH` map a model coord to the drawing's horizontal and back.
- The projection (3dview/projection.ts `project(o, dir, …)`), clipping (`trimToClip`, `segmentGaps`, wall panels),
  hit-testing (ui/hit.ts `prismOutline`, `graphHit`), editing in elevation (vpModelEdit `translateObj`, grips
  `applyPrismGrip`, guides' depth plane, `elevDepthSnap`) and the DXF export all branch on `ELEV_BASIS`.
- A sheet frame links to a section (`SheetFrame.section` → `liveClip`), so a moved / resized box re-clips live.

## 3. Design

### 3.1 One view frame: `ElevFrame`
```ts
type ElevFrame = { o: Pt; t: Pt; n: Pt }   // origin (plan mm), unit along the view's horizontal, unit look direction
```
- `t = (-n.y, n.x)` style right-handed pair; the four ElevDirs become fixed frames (front = t +x, n +y, …), so every
  existing view keeps its exact output (`frameOf(dir)`).
- Drawing coords in an elevation: `u = dot(p − o, t)` (+ the plan-centre offset the views use today), `v = GROUND − z`;
  depth (for sorting / clipping) `d = dot(p − o, n)`.
- Replace `ELEV_BASIS[dir]` reads with `frame.u(p) / frame.depth(p) / frame.inv(u, depth)` helpers — the 4-dir fast
  path stays (axis-aligned) so nothing gets slower.

### 3.2 Clip region
- Today's `Clip` is an axis-aligned box. An oblique section needs an **oriented box**: the cut line a→b (width), a
  depth behind it, and z0..z1. `OClip = { a: Pt; b: Pt; depth: number; z0; z1 }`; an axis-aligned `Clip` converts
  to one (so `trimToClip` gains one oriented variant; walls / boxes clip by projecting onto t / n).

### 3.3 Markers
- **Section line (O4):** a new Section kind `{ kind: 'line', a, b, depth, flip, name }` drawn with the SECTION tool as
  two clicks (ACAD) / a press-drag (EOS), at any angle; rendered dashed with perpendicular arrows + "A" / "A′"
  (OpenCad `SectionShape`); grips: both ends, the depth handle, flip by clicking an arrow. The existing box
  sections stay (they are sections with an axis-aligned frame) — no migration.
- **Elevation marker:** `{ kind: 'elev', at: Pt, dir: angle, width, depth, name / number }` — a circle-triangle
  callout (the eltag look) pointing the way it looks; grips: position, rotate (15° with Shift), width / depth box
  (shown when selected). ELEV command + an **Elevation** tool beside Section in the strip (Annotate).
- Both link to views the same way sections do today: "Drop as sheet" → a fitted, LINKED frame (`SheetFrame.section`
  = the marker id; the frame's view = the marker's ElevFrame + OClip, read live).

### 3.4 Editing in an oblique view
- Phase A renders oblique views read-only for 3D objects (shapes drawn in the view still work — they live in the
  view's own 2D space). Phase B moves / resizes objects in them: `translateObj` maps (du, dv) → `du·t` in plan + z;
  box grips use the oriented frame (the rotated-box rule `anchoredResize` already handles rotation).

## 4. Phases

| Phase | Content | Size |
|---|---|---|
| 1 | `ElevFrame` + helpers; the four dirs become frames; all ELEV_BASIS call sites switch to it — **no behaviour change** (tests pin today's output) | M |
| 2 | Oriented clip `OClip`; projection / wall panels / openings / hit-testing on any frame; an oblique view renders (dev-only toggle) | M |
| 3 | **Section line** (O4): tool, render (dashed + arrows + A / A′), grips, Properties (name, depth, flip), drop-as-sheet linked | M |
| 4 | **Elevation marker** + tool + ELEV command, numbered callout, drop-as-sheet linked | M |
| 5 | Editing 3D objects inside oblique views; DXF export of oblique views | M |
| 6 | **Hidden lines in elevations / sections** (Dave): what is behind a wall (by depth along `n`) is hidden, except where the wall has an opening — clip each object's projected faces by the nearer walls' projected panels (walls are already cut into panels around openings, `openingCuts` / `segmentGaps`), nearest first; a flag per view ("Hidden lines", default on) | M–L |

Each phase: one commit, unit tests (projection of a known box at 30°: u / depth values; clip of a wall crossing the
line), Help + CHANGELOG, live check on Test Project.

## 5. Decisions for Dave

1. Keep the box sections alongside the new line sections (recommended), or convert boxes to lines?
2. Elevation marker look: the eltag circle + triangle (recommended), or OpenCad's plain arrow?
3. Numbering: per sheet ("1/A-201") like eltags, or per model ("E1, E2")?
