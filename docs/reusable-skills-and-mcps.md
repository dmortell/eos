# Reusable skills & MCPs — lessons from building EOS

Patterns and gotchas worth carrying into the next SvelteKit + Svelte 5 + Firestore +
canvas-editing app, plus tooling (MCPs / skills) that would have sped this one up.

## Reusable engineering skills / patterns

1. **Floating popovers must escape clipping ancestors.**
   Any dropdown/popup rendered *inside* a panel that has `overflow:auto` (or lives on a
   CSS-`transform` canvas) gets clipped and can spawn scrollbars. Render it through a fixed,
   viewport-sized overlay (`position:fixed; inset:0; overflow:hidden; pointer-events:none`, the
   panel re-enables `pointer-events:auto`) and position it from the anchor's
   `getBoundingClientRect()`. See `edit/portal.ts`; applied to the annote picker and `PropColor`.

2. **Window capture vs. bubble for global keyboard handlers.**
   When two `window` keydown listeners coexist (e.g. an active viewport's capture-phase handler
   and a parent's bubble-phase handler), `stopPropagation()` in the *capture* handler suppresses
   the bubble handler **for real DOM events** (they traverse window→target→window). It does **not**
   for events `dispatchEvent`-ed directly on `window` (same target → both fire). This bit our
   "Esc reverts tool, then deactivates" layering and our test harness — dispatch synthetic key
   events on a child element, not `window`.

3. **Headless editor + thin render/edit layers.** Each tool is a `SurfaceEditor` subclass (state +
   mutations) with a read-only render component, an interactive edit layer, and one transparent
   `EditBackground` press-catcher. `useViewportEditing()` wires: seed-from-doc while idle,
   debounced persist, and a shared undo `History`. Keeps DOM dumb and logic testable.
   Gotcha: `EditBackground` has its OWN hardcoded list of which tools place objects — adding a new
   annotation kind means updating that list too (the ellipse and image bugs were both this).

4. **mm-space SVG that prints true-size.** Render in real millimetres; for print use a named/plain
   `@page { size: Wmm Hmm; margin:0 }` + `transform: scale(96/25.4)` so 1 world-unit = 1mm, and
   `vector-effect="non-scaling-stroke"` for hairlines. A *named* `@page` name-switch inserts a blank
   lead page — use a plain `@page` for a single size; `display:contents` on wrappers so they emit no
   box. Extract layout maths (e.g. the fill-rate cable packing) into a pure, scale-free function so
   it serves both the canvas and crisp SVG/print.

5. **Firestore reactivity hygiene.** `subscribeOne/Many`, debounced merge-saves, `$state.snapshot()`
   before writing. Guard subscription echoes from clobbering in-progress local edits (compare
   `JSON.stringify` before assigning). Migrate legacy shapes in the editor's `seed()` (e.g.
   leader→callout, boolean→enum) instead of a one-shot migration script.

6. **URL/shallow-routing state.** `page.url` is **not** reactive to shallow `replaceState` and can be
   stale at mount; read `location.search` (browser ground truth) in the `$state` initializer and in
   `afterNavigate`. Late-mounting children miss the navigation's `afterNavigate` — initialise from
   `location` at mount.

7. **Svelte 5 runes discipline.** Runes only (`$state/$derived/$effect/$props/$bindable`); never `$:`.
   Module-level shared state goes in `<script module>` with `$state` (we use it for MRU tool lists
   and the cross-sheet viewport clipboard). `onclick|stopPropagation` isn't valid — wrap in an arrow.
   `{@const}` must be an immediate child of `{#if}/{#each}/…`.

8. **Small reusable `use:` actions beat per-component code.** `$lib/formNav` (Enter → next field,
   Shift+Enter → previous, skip textareas) is one action applied to every property window. Also:
   direction-aware HTML5 drag-reorder (dragging downward drops *after* the target).

9. **Object→layer mapping is a fork in the road.** Mapping objects to layers *by kind* is cheap but
   means custom-layer assignment later touches every render/edit layer + the live object schemas.
   Decide early whether objects need a stored `layerId`.

10. **Verify in the browser, but expect synthetic-event flakiness.** Clicks on controlled
    checkboxes / portaled menus race re-renders; separate the calls, target the exact element, and
    prefer reading ground-truth state over re-clicking. The editors' own undo (`Ctrl-Z`) is the
    cleanest way to revert test data created in a live project.

## MCPs / skills worth building or fetching

- **A Firestore MCP (read/query)** — the single biggest accelerator. Most verification here was done
  by synthetically clicking the UI and reading the DOM; a tool to read `projects/{pid}/…` docs
  directly would let an agent assert on the actual saved data (and clean up test docs) far faster
  and more reliably.
- **A domain MCP for this app** — list/inspect frames, outlets, trunks, racks, patch connections,
  fill-rate sections for a project, so an agent can set up/verify scenarios without the UI.
- **A "browser assert" helper skill** — wraps the chrome tools with retry + settle-then-read, and
  dispatches key events on a child (not `window`) so capture/bubble ordering is realistic.
- **Svelte 5 / SvelteKit docs MCP** — already available (`svelte` MCP); keep using it for runes and
  routing APIs rather than training-data recall.
- **A print/PDF snapshot tool** — render a route's print view to PDF headlessly and diff, so package
  print and true-size scaling can be checked without eyeballing Ctrl-P.
