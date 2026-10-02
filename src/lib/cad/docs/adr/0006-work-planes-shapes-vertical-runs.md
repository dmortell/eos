# ADR 0006: Work planes, 2.5D shapes and vertical runs

**Status:** Accepted as a requirement (Dave, 2026-10-02). He wants to be able to:
- add and edit vertical trunks / conduits
- draw 2.5D shapes by positioning them on the x/y plane and extending them in z, or the reverse when drawing on an
  elevation

The interaction details below are proposed. Shapes are the single `Shape` type of ADR 0007.

## Context

In Pages:
- A conduit node has its own z, and drops are possible, but drawing them is awkward.
- Drawing in an elevation needs a depth plane, set through guide lines.
- A box is placed in plan and given a height in Properties.

The cad tool makes this first-class and symmetric between plan and elevation views. It stays 2.5D (ADR 0004).

## Decision

### The work plane

Every view has one work plane. Clicks are turned into model points on it with `conventions.unproject`.

| View | Work plane | Default | Set by |
|---|---|---|---|
| Plan | horizontal, at **work Z** | the tool's preset (containment = mid-plenum from the level's heights; walls and lines 0) | the tool bar's **Z** field |
| Elevation | vertical, at **work depth** along the view's n | the middle of the level's content | the tool bar's **Depth** field (shown when the active pane is an elevation; blank = automatic) |

- **The other pane shows it** when the view is split: a dashed line in the plan for an elevation's depth, and a line
  in the elevation for the plan's work Z.
- **No guides and no inset** (Dave, 2026-10-02: "we don't need plane inset and guides slice, the split view works ok
  so far"). The earlier ideas of guides as saved work planes, and a pop-up inset of the other view, were dropped. The
  Z / Depth fields plus the split view cover it.

### Split view (2026-10-02)

**Built:** a **Split** button gives two panes side by side. Each pane can be switched to Plan / Front / Rear / Left /
Right at any time.
- Each pane shows the other pane's work plane: the elevation's work depth as a dashed line in the plan, and the work
  height as a line in the elevation.
- Tools work the same in either pane. In an elevation the click gives the height, so drops, outlets at height and
  rack positions are simply drawn there.
- Both panes use the same `ViewCanvas`; a pane is just a view spec plus a camera. That is simpler than Pages' split
  tabs (no tab bookkeeping, no per-tab documents).

The pop-up **inset** that was proposed here was **dropped** (Dave, 2026-10-02): the split view works.

### 2.5D shapes: draw the profile, then extend it

1. **Profile.** Drawn on the work plane: a rectangle (two corners or press-drag) or a polygon (points, then Enter).
2. **Extend.** Out of the plane, by a typed value or a default (the last one used per tool):
   - In plan: **Height**, measured up from work Z.
   - On an elevation: **Depth**, measured away from the viewer, starting at the work plane.

   A drag is also possible wherever the extent axis is visible: the other pane, or the shape's extent grip
   in an elevation.
3. **The result** is a region `Shape` (ADR 0007) that records its plane and `extent`. Leaving the extent at 0 gives a
   flat 2D shape, which can be extended later.
   - **A rectangle on a plan** is a box: X / Y / Z / W / D / H / Rot in Properties.
   - **A rectangle on an elevation** is square to that view (`frameRot`). Its w × h is the drawn rectangle, and the
     extent is its depth.
   - **A polygon or circle** works the same way. On a plan plane it is an upright prism of any footprint. On a
     vertical plane it is a profile in the view's (u, z), extended along −n.

The command form reads like the rest of the command line. For example:

```
BOX   Corner: 1200,800   Other corner: @600,400   Height <720>: 1100
BOX (in FRONT)   Corner: 0,0   Other corner: @600,2000   Depth <600>: ↵
```

**Editing works in whatever view you are in:**
- Grips move along the view's two axes: plan changes x / y / w / d; an elevation changes position-along-u / z / w / h.
- The extent face has its own grip in views where it is visible.
- Properties always shows the full X / Y / Z / W / D / H / Rot for a rectangle, or Plane / Extent and the profile for
  other regions.
  This means "position on x/y, then extend in z" and "draw in an elevation, then extend in depth" are the same object
  edited from two sides.

### Vertical runs (trunks, conduits, drops, risers)

A path segment whose two nodes share x / y is **vertical** (`shapes.isVertical`). Path nodes carry `z`, plus
`levelId` when they are on another level. There is no separate riser entity. This works for any path: a trunk, a
conduit, or a plain line that is later converted to a trunk (ADR 0007).

**Drawing in plan.** The containment tool draws horizontally at work Z. At any point, the prompt offers:

```
Next point or [Rise/Drop/Level/Undo]:
```

- **Rise / Drop** asks for the new Z (typed, or a preset: floor, under-floor, ceiling, plenum, or a picked object's
  top / bottom). It adds a vertical segment at the current point, and the run continues horizontally at the new Z.
- **Level** asks for another level and a Z on it. It adds a vertical segment whose top node is on that level (a
  riser), and the run continues on that level's plan.

**Drawing in an elevation.** The same tool draws in the view's (u, z) on the work plane, so vertical segments are just
drawn. Shift-constrain (horizontal / vertical) keeps them plumb, and so would ORTHO / POLAR once they are in
(ADR 0005).

**Editing an existing run:**
- Select a node: Properties shows Node X / Y / Z (and Level).
- **RISE** on a node inserts a vertical segment there. Dragging a vertical segment's end grip in an elevation changes
  its height.
- Moving a node in plan moves the whole vertical stack at that x / y, so a drop never leans.
- A drop whose end is attached to an outlet (`attach`) follows the outlet when it moves.

**How they draw:**
- In plan, a vertical segment is a symbol at its x / y: a circle for a pipe, a rectangle for a trunk, at its true
  size, with ↑ or ↓ and its z range (e.g. `↑ +300 → +2950`).
- A riser shows on every level it passes through.
- In elevations, a vertical segment is drawn at its true length.

**Quantities.** Vertical segments count towards run lengths, fill and the BOM like any other segment. That is the
reason drops and risers are drawn rather than left as notes.

## Consequences

- **The editor kernel needs a `WorkPlane` per view.** The router converts every pointer event to a model `Pt3`
  through it (`unproject`), so tools never do projection maths.
- **Snapping gains plane-setting snaps** (an object's top, bottom, near face, far face) and a "same x / y" tracking
  line for drops.
- **Hidden lines:** plan-plane regions (boxes, upright prisms) keep the exact interval method (ADR 0004).
  Vertical-plane regions use the vector fallback.
- **Tests state behaviour:** "a run drawn in an elevation keeps one plan position for its vertical part" is already
  in `conventions.test.ts`; the tool tests follow the same style.
