# ADR 0005: Drafting scope

**Status:** Accepted in principle (Dave, 2026-10-02: "command line + core ~25 commands"). The list below is proposed.

## Context

Pages built 114 commands for AutoCAD / Kestrel parity: trim / extend / fillet / lengthen, hatch, polar and object
tracking, F-keys, and DXF formats. Most drawing content in the cad tool is generated (ADR 0001), so drafting is for
two jobs:
- annotating
- tidying generated drawings

It is not for building drawings from lines.

## Decision

**The command line stays.** It uses the Pages `commands.ts` parser and `CommandRunner`:
- coroutine scripts that `await` a point or a value
- typed coordinates (`x,y`, `@dx,dy`, `@d<a`)
- options, ghosts, Enter / Esc / Space-repeat

Every drawing tool is a command script, so typed and clicked input share one path.

**Core commands (in):**

| Group | Commands |
|---|---|
| Draw / annotate | LINE, PLINE, RECT, CIRCLE, ARC, TEXT, NOTE (multi-line), DIM (linear + aligned), LEADER / CALLOUT, CLOUD, IMAGE, SYMBOL |
| Modify | MOVE, COPY, ROTATE, SCALE, MIRROR, ERASE, ARRAY (rectangular + along a path, for outlet runs), OFFSET, TRIM, EXTEND, STRETCH, MATCHPROP, ALIGN / DISTRIBUTE |
| Aids and view | OSNAP (end, mid, centre, intersection, perpendicular, nearest, plus domain snaps: outlet, port, wall face, containment node, and the work-plane snaps of ADR 0006), GRID / SNAP, ZOOM (extents / window / object), PAN, LAYER, UNDO / REDO. **ORTHO / POLAR later** (Dave: "osnap and grid snap only for now"); Shift-constrain while drawing (H / V / 15°) covers most of it meanwhile |

**Typed input while drawing (all kept).** This is how you give an exact offset or length:

| You type | Result |
|---|---|
| `500,300` | an absolute point |
| `@500,300` | an offset from the last point |
| `@1200<30` | a distance and angle from the last point (angle counter-clockwise, as typed in AutoCAD) |
| a bare number, e.g. `1200` | **direct distance entry**: that far from the last point, towards the cursor. With Shift-constrain or a snap it gives exact horizontal / vertical runs. |
| `Z` / `Depth` values | sets the work plane (ADR 0006) |

**The readout by the cursor** (length, angle, Δx / Δy while drawing; the work plane) also stays. Pages has it
(`vpInteraction` "spacing readout").

**Dropped: AutoCAD-style *editable* fields at the cursor** (DYN, where you tab between length and angle boxes
floating by the cursor). Everything it does is covered by typing into the command line, which shows the typed text
near the cursor as well.

**Domain tools** are not drafting commands, though each is also a command script:
- Outlet (with sticky defaults, next number, walk renumber)
- Containment run (with Rise / Drop / Level, ADR 0006)
- Wall (a path preset, ADR 0007)
- BOX / EXTRUDE: profile, then height or depth (ADR 0006)
- RISE
- CONVERT: a path to line / wall / trunk / conduit / tray, giving it a section and z (ADR 0007)
- Wall, Opening
- Rack, Device
- Underlay calibrate
- Section / elevation marker

**Out**, unless asked for later:
- HATCH, SPLINE, ELLIPSE
- FILLET / CHAMFER / BREAK / JOIN / LENGTHEN
- object tracking
- DYN-style editable fields at the cursor (typed input itself stays, see above)
- isolate
- the 3D solid commands
- DWG out, SVG / PNG of a whole sheet (print to PDF covers it)
- the long tail of inquiry commands (ID, LIST, AREA)

**DXF:** export in Phase 4, from the display list. DXF import is deferred (Pages todo O13).

**Keys:**
- Function keys only where browsers leave them alone: F1 help, F8 ORTHO, F9 SNAP, F10 POLAR.
- No single-letter tool hotkeys. They clash with the command line; command aliases cover the need.

## Consequences

- **Porting from Pages:** `snap.ts`, `modify.ts` (OFFSET / TRIM / EXTEND), `grips.ts`, `hit.ts` and the
  `CommandRunner` port with their tests. Of the 57 `cmdScripts`, only the in-scope ones come across.
- **Adding a command** outside this list means updating this ADR first.
