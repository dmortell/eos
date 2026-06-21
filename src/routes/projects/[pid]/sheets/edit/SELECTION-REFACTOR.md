# Selection refactor — unifying object + annotation selection

## Problem
Objects and annotations are two separate selection systems linked only by peer
cross-clearing:

| | Objects (`Model3dEditor`) | Annotations (`AnnotationEditor`) |
|---|---|---|
| Identity | **array index** (shifts on add/delete) | string `id` |
| Single sel | `sel = {kind:'obj', id:String(index)}` | `sel = {kind:'ann', id}` |
| Multi sel | `multi: number[]` (indices) | `selAnns: string[]` |
| Cross-link | `peer.clearSel()` | `peer.clearSel()` |

Every cross-cutting gesture (marquee, drag, ctrl-drag, toggle, delete) must
manually coordinate the two lists, which is why each one broke for *mixed*
selections (only one type duplicated; toggling one wiped the other). Index-based
object identity is also fragile: inserting/deleting an object shifts indices and
can silently change what's "selected".

## Target design — `SelectionCoordinator`
One selection set of heterogeneous refs `{ src: 'obj' | 'ann', id }`. Each editor
registers as a **provider** exposing primitives *by id*:

```
interface SelectableProvider {
  src: 'obj' | 'ann'
  ids(): string[]                          // all selectable ids (for marquee)
  hitTest(world): string | null
  inRect(id, rect): boolean
  bounds(id): Rect
  snapshot(id): unknown                    // for group translate / undo
  translate(id, dx, dy): void
  duplicate(ids): string[]                 // clone in place → new ids
  remove(id): void
  locked(id): boolean
}
```

The coordinator owns the selection set + all gestures (marquee, single/group
drag, ctrl-drag duplicate, ctrl-click toggle, Shift constraint, delete). Editors
become data + primitives; the gesture logic lives **once**, over refs, so mixed
selections are native and there is no peer juggling.

## Migration plan
**Step 1 — objects get stable ids + id-based selection (this step).**
- `Obj` gains an `id`; `migrate` backfills legacy objects; creation assigns one.
- The editor's *selection state* moves from indices to ids: `sel.id` = object id,
  `multi: string[]` = ids. `selIndex` becomes a derived (id → index) so the
  existing index-based handlers/edit-layer keep working unchanged.
- Outcome: object selection is robust to reordering and is now expressed the same
  way as annotations (by id) — the precondition for the coordinator.

**Step 2 — introduce `SelectionCoordinator`.**
- Wrap both editors as providers; move marquee/drag/ctrl-drag/toggle/delete into
  the coordinator over refs. Retire the peer cross-clearing and the duplicated
  gesture code (`driveCtrlDrag`/`beginGroupDrag` collapse into the coordinator).

**Step 3 — cleanup.** Remove `multi`/`selAnns`/`dragIdxs`/`dragAnnIds` shims once
the coordinator owns selection; keep editors purely as geometry + primitives.
