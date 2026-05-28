# UX Plan — Tool / View Switching

## The problem in one sentence

The four tools (Patching, Frames, Racks, Outlets) are presented as separate *pages*, but users think of them as different *views of the same underlying entities* (a rack, a panel, a floor). Every switch is a navigation, which means a route change, a Firestore re-subscribe, a fresh DOM, and a lost pan/zoom state. The workaround — opening duplicate tabs — proves it.

## Diagnosis: what the tools actually share

| Tool | Primary entity | View of that entity |
|---|---|---|
| Racks | Rack | Elevation in a server-room row, with devices/panels |
| Frames | Rack (one) | Front + rear of the panels, port-by-port |
| Patching | Rack (one) | Elevation focused on patching connections |
| Outlets | Floor | Outlets + trunks on a floorplan PDF |

Three of the four tools are different *views of a rack*. Switching between them should feel like switching layers on the same drawing, not like opening a different program.

---

## Option A — Persistent workspace with drawing tabs (recommended)

This is the direction the existing `UI_wireframe_spec.md` already hints at, applied specifically to the switching problem.

### Shape

```
┌─────────────────────────────────────────────────────────────┐
│ Top bar: Project / Package / Version                        │
├──────────────┬──────────────────────────────────────────────┤
│ Navigator    │ [Rack A-01 Elev] [Rack A-01 Frames] [F2]  +  │
│ (tree)       ├──────────────────────────────────────────────┤
│              │  View-mode strip:                            │
│ Floors       │  ◉ Elevation  ○ Frames  ○ Patching          │
│  F1 Outlets  │                                              │
│  F1 Trunks   │  ┌──────────────────────────────────────┐   │
│ Server rooms │  │                                      │   │
│  SR-01       │  │   Canvas (pan/zoom preserved        │   │
│   Row A      │  │   per tab)                          │   │
│    Rack-01   │  │                                      │   │
│              │  └──────────────────────────────────────┘   │
└──────────────┴──────────────────────────────────────────────┘
```

### Behavior

- **One SvelteKit route** holds the workspace shell. The Racks/Frames/Patching/Outlets components become *view components* mounted inside the shell, not pages.
- **Each tab owns its own state**: zoom, pan, selection, scroll. Switching tabs is a CSS show/hide (or `{#if active}` with `bind:this`-preserved state), not a remount.
- **Firestore subscriptions are shared at the shell level** — `frames/{pid}`, `racks/{pid}`, etc. subscribe once. Tabs read from the same store, so opening a second view of the same rack costs nothing.
- **View-mode strip** lets you flip the same rack between Elevation / Frames / Patching *without opening a new tab* — same viewport, same zoom, just a different rendering of the same data. This is the part that directly fixes the "jarring switch" complaint.
- **Cmd/Ctrl+K quick switcher** to jump to any rack / floor / outlet by name.

### What this requires

- Promote the four `+page.svelte` entries (`/racks`, `/frames`, `/patching`, `/outlets`) to *components* under a single workspace route, e.g. `/projects/[pid]/workspace`.
- A tabs store: `{ id, kind: 'rack' | 'floor', entityId, viewMode, viewport: {x, y, zoom} }[]`.
- Move Firestore subscriptions out of each tool's `+page.svelte` into a workspace-level provider so multiple tabs don't re-subscribe.
- URL reflects the *active* tab (`?tab=rack-A01&view=frames`) so deep links and refresh still work.

### Tradeoffs

- ✅ Fixes the actual complaint (no remount, no lost viewport, no duplicate tabs needed).
- ✅ Aligns with the wireframe spec you already wrote.
- ⚠️ Biggest refactor of the four options. Roughly: workspace shell + tabs store + lifting Firestore subs + migrating each tool to a component API. Maybe 1–2 weeks.
- ⚠️ Keeping per-tab viewport state means each tool needs to accept `viewport` as a bindable prop instead of owning it internally.

---

## Option B — Split-view panes (alternative or complement to A)

```
┌──────────────┬──────────────────────┬──────────────────────┐
│ Navigator    │ Rack A-01 Elevation  │ Rack A-01 Frames     │
│              │                      │                      │
│              │  [canvas]            │  [canvas]            │
│              │                      │                      │
└──────────────┴──────────────────────┴──────────────────────┘
```

- Two (or more) view panes side-by-side, each independently a Racks/Frames/Patching/Outlets view.
- Replaces the "open in another browser tab" workaround natively.
- Can be layered *on top of* Option A: a tab can be split into two panes.

### Tradeoffs

- ✅ Directly replaces the multi-tab workaround.
- ✅ Great for "I'm wiring panel 3 in Frames while watching the rack elevation."
- ⚠️ Canvas-heavy on a single screen — pan/zoom gestures need a clear "which pane has focus" model.
- ⚠️ On smaller screens this collapses badly; needs a responsive fallback.

---

## Option C — View-mode toggle only (smallest change)

Keep the four tools as separate routes, but:

1. Add a **view-mode pill** at the top of each rack-related route: `Elevation | Frames | Patching`. Clicking it navigates between the three but **preserves `entityId`, viewport, and selection in the URL** (`?rack=A01&zoom=1.4&x=…&y=…`).
2. On mount, each tool reads the viewport from the URL and applies it before paint, so the user lands at the same place visually.
3. Use SvelteKit's `data-sveltekit-preload-data="hover"` plus a shared `+layout.svelte` at the `[pid]` level that *doesn't* re-subscribe Firestore on navigation.

### Tradeoffs

- ✅ Smallest blast radius. Could ship in a day or two.
- ✅ Solves the "lost zoom" pain without rewriting the architecture.
- ❌ Still a route change — there will still be a frame of flicker. Doesn't fix the "open multiple tabs" workaround.
- ❌ Doesn't help the Outlets ↔ Racks switch, only rack-internal switches.

Good as a **stepping stone** to Option A.

---

## Option D — Layers, not tools

Reframe the four tools as *layers on a unified canvas* rather than four separate tools.

- A rack drawing is one canvas. The right panel has toggles: `☑ Devices  ☑ Patch panels  ☑ Cable routes  ☑ Port labels  ☑ Outlet links`.
- The Frames "tool" becomes "Devices + Patch panels + Port labels" with the rack zoomed in.
- The Patching "tool" becomes "Devices + Cable routes."
- Outlets stay a separate canvas type (it's a floorplan, not a rack), but link to rack canvases via clickable trunk endpoints.

### Tradeoffs

- ✅ Conceptually clean — matches how users already think about it.
- ✅ No tool-switching at all for rack work, just layer toggling.
- ⚠️ Each tool has different *editing affordances* (port-by-port wiring in Frames vs. drag-to-place devices in Racks). Layers don't map cleanly to editing modes — you'd still need an active-edit-mode concept.
- ⚠️ Biggest conceptual rewrite. Users have to relearn the mental model.

I'd consider this **after** Option A is in place, as the "view mode strip" matures.

---

## Workflow signal — which switch actually matters

In practice the dominant tool-switch is **Frames → Racks → back to Frames**: a user is wiring ports in Frames, needs to fix or check a device/panel, and bounces to Racks for that. Frames ↔ Patching switching is rare.

That changes the framing. The real problem isn't "make tool switching fast" — it's "**Racks owns editing affordances Frames needs.**" No amount of fast switching beats not switching. The right move is to bring rack-structure editing *into* Frames so the bounce stops happening, then handle the remaining inter-tool nav with Option C's cheap route swap.

Mental model:
- **Racks** edits the rack's **structure** — which slots hold which devices/panels.
- **Frames** edits the rack's **cabling** — where each port goes.
- Same rack. Two editors. Today they live behind a route boundary for historical reasons, not user-task reasons.

## Sidebar handling under Option C

Four approaches, ranked least → most invasive:

1. **Status quo** — each tool owns its sidebar; full swap on route change. Cheapest, but the sidebar visibly redraws on every Frames↔Racks bounce.
2. **Stable sidebar shell, swapped contents** — the `[pid]` layout owns the sidebar container (width, resize handle, header strip); only inner contents re-render on route change. Cuts visual jank, no routing change.
3. **Selection-driven sidebar** — contents follow the selected entity (rack/panel/port/device); the tool decides which *actions* appear. Requires a unified selection model across tools.
4. **Pin Racks' editing panel inside Frames** — Frames grows a collapsible secondary sidebar containing the Racks device/panel library, drag targets, etc. Drops onto the rack rendered in Frames' canvas. The dominant workflow stops requiring a tool switch.

### Decision

- Adopt **#2** as the structural change for all tools (stable shell, swapped contents).
- Layer **#4** on top, specifically for the Frames↔Racks pair, since that's where the time goes.
- When the user drops a device into the rack from Frames' pinned Racks panel, **the user stays in Frames** — the device appears in Frames' rack rendering. No route flip.

### Implication: Frames canvas renders the full rack

Today Frames renders panels (the wireable surface). To support in-place rack editing, Frames' canvas must render the **whole rack** — devices and panels both — in the same visual style as Racks. Practically:

- Extract the rack-rendering component from Racks into a shared `RackElevation` component used by both Racks and Frames.
- Frames sources its rack-rendering from this shared component and overlays its port-level UI on top.
- Drag-from-library and slot-edit interactions become props on `RackElevation`, enabled in both contexts.

This is the load-bearing piece of work. The pinned sidebar itself is cheap once the canvas can render and edit the rack.

## Plan of attack

1. **Stable sidebar shell** in the `[pid]` layout — owns container chrome; tools provide contents via a slot/snippet. (Small.)
2. **URL-encoded viewport** on Racks, Frames, Patching, Outlets — `?rack=A01&v=x,y,z`. Each tool reads viewport from URL on mount, writes on pan/zoom. Tabs stay in localStorage. (Small.)
3. **Shared `RackElevation` component** — extracted from Racks, used by both Racks and Frames. (Medium — the actual work.)
4. **Pinned Racks panel inside Frames** — collapsible secondary sidebar with device/panel library; drag targets land on the rack via the shared component. (Small once #3 exists.)
5. **Defer Option A** (persistent workspace + tabs) — revisit after #1–#4 ship and we see whether Frames-with-rack-editing is *the* view people use, or whether tab switching is still painful for other pairs.

Option B (split panes) and Option D (layers) stay parked. The wireframe spec's tabs/tree workspace remains the north star but isn't on the critical path.

## Decided constraints

- **Tabs are per-browser** (localStorage), not persisted to Firestore.
- **URL encodes only the active viewport** (entity + x/y/zoom) for share-link sharing. Embedding viewports into the drawings/packages tools later consumes this same URL shape.
- **Frames↔Patching simultaneous viewing is not needed** — rare switch, low priority, in-place toggle is fine if/when we want it.
