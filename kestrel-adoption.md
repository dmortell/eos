# KestrelCad2 → EOS adoption catalog

Inventory of KestrelCad2 (`M:\dev\KestrelCad2`) functions and UI elements, organized for
selecting what to port into EOS. Sources: Kestrel's own `notes.md` (command/ribbon inventory,
2026-09-13) plus a source survey of `src/*` (2026-09-16). Kestrel is vanilla JS on a global `K`
namespace with hand-written CSS; EOS is SvelteKit + Svelte 5 + Tailwind 4 — so each item below
says *how* it ports: **CSS-copy** (lift styles, rewrite markup in Svelte), **lib-lift** (the JS
module is framework-free and usable nearly as-is), **algorithm** (re-implement the logic against
EOS's models), or **pattern** (idea only).

Tick what you want; effort is S/M/L per item.

---

## A. Visual design (the "beautiful look")

- [ ] **A1. Design tokens** — `src/style.css` lines 1-2 — **CSS-copy, S**
  ~20 custom properties on `:root` (dark default) with a `[data-theme=light]` override block.
  Cool blue-gray neutrals + teal accent: dark `--bg:#18212d --panel:#1b2532 --ribbon:#212c3a
  --canvas:#121c29 --hover:#2c3b4d --active:#244852 --accent:#5ac6d2 --text:#dce4ed
  --muted:#8b9aab --line:#344151 --input:#17212e --success:#78c4a6 --danger:#ed8d92`;
  light `--bg:#e3e9ef --panel:#f5f7fa --accent:#157a8b --text:#23374a` etc.
  Font: Inter/Segoe UI at 12px base (chrome runs 8–11px); Consolas mono for coordinates,
  values, ids. Small crisp radii (3-6px). This one item transfers most of the look —
  maps directly onto Tailwind 4 `@theme` variables with the same `data-theme` flip.
- [x] **A2. Icon set** — DONE (see `$lib/ui/kestrel-icons.ts`). All 109 Kestrel glyphs extracted
  verbatim and wired into `Icon.svelte`: Lucide still wins name collisions (nothing existing
  changed), Kestrel fills any unmatched name, and a `k-` prefix forces the Kestrel glyph for a
  shadowed name (e.g. `k-line`). Browse them all at `/icons` (click a card to copy its name).
- [x] **A3. Glass floating toolbars** — DONE. Reusable `.glass` utility in `layout.css`
  (`color-mix` translucency + `backdrop-filter: blur` + shadow, with an opaque `@supports`
  fallback), and the floating `Window` chrome (Layers/Sheet/Edit/Properties panels across the
  tools) now frosts over the drawing via the same `--glass-*` vars. Vars default to the original
  solid look, so EOS light is a subtle frost; Kestrel themes retint the panels. Verified in
  sheets over the floorplan, light + dark.
- [ ] **A4. Accent-underline tabs** — ribbon/document-tab CSS — **CSS-copy, S**
  Active tab = 2px accent bar via `:after` (bottom edge for ribbon tabs, top edge for document
  tabs) + tinted bg, instead of boxed tabs. Pairs with C1/C2.
- [ ] **A5. Theme mechanism** — `applyTheme()` — **pattern, S**
  `documentElement.dataset.theme` + attribute-scoped token overrides; paper/sheet surfaces force
  light regardless of app theme (worth keeping if EOS gets a dark mode: sheets stay print-true).

## B. Navigation & command surfaces (your stated pain point)

- [ ] **B1. Document tabs bar** — `#documentbar` + `App.addDocument/switchDocument/closeDocument`
  (app.js ~L280-310) — **CSS-copy + algorithm, M** — *the* model for sheets tabs.
  Each tab = a doc object owning ALL its own state (entities, selection, undo stacks, dirty flag,
  serialized camera); the app holds only `docs[]` + `activeId`. Switch = serialize outgoing
  camera → restore incoming (or compute a sensible default view); close = dirty-confirm, never
  closes the last tab; 12-tab cap; workspace (docs + active) persisted and restored on boot.
  For EOS: tabs would hold {sheet | tool+floor+area} descriptors + per-tab view state (pan/zoom,
  selection), with Firestore subscriptions attached per open tab. The pattern translates
  directly to a `$state` array + activeId rune store.
- [ ] **B2. Command palette (Ctrl+K)** — `openPalette/renderPalette` (~L2234) — **algorithm, S**
  Native `<dialog>`, substring search over label/alias/description, arrow-key nav, alias chips.
  For EOS the higher-value twist: index *destinations* (sheets by title/number, tools, floors,
  racks) not just commands — "Ctrl+K → 3303 out…→ Enter" kills the back-to-menu round trip even
  before tabs exist. Cheapest first step of the whole navigation plan.
- [ ] **B3. File menu structure** — `makeFileMenu()` + `.popover`/`.menu-item` CSS — **CSS-copy, S**
  Static popover built from an id list with `-` separators; icon + label + shortcut kbd per row.
  Good template for the richer sheets File menu you want (recent sheets, open-in-tab, exports).
- [ ] **B4. Quick-access toolbar** — title bar (new/open/save/undo/redo) — **pattern, S**
  Tiny always-visible icon strip; EOS equivalent: undo/redo + print + fit on the sheet titlebar.
- [ ] **B5. Workspace switcher** — `setWorkspace()` — **pattern, S**
  Just a camera/style preset select, *not* a mode — reassurance that a "2D/3D" or per-discipline
  switcher can be a thin veneer on one canvas rather than separate routes.
- [ ] *(Split view — Kestrel has nothing to copy here; it's single-viewport. Plan separately:
  two pane hosts each owning a tab strip + active doc, VS Code style. B1's "doc owns its state"
  rule is the prerequisite that makes splits cheap.)*

## C. UI chrome elements

- [ ] **C1. Ribbon** — `U.groups/tabs/ribbon()` + `setRibbon/refreshRibbon` — **CSS-copy + pattern, M**
  Data-driven tabs → groups → large(70px, icon-over-label)/small(23px, columned) buttons; embedded
  live widgets (current-layer dropdown, color/lineweight pickers) inside ribbon groups. EOS uses
  menus + tool windows instead; adopt only if you want a ribbon aesthetic — the *data model*
  (command catalog → generated UI) is the reusable idea.
- [ ] **C2. Command line dock** — `executeCommand/parsePoint/commandSuggest` (~L2035-2123) —
  **algorithm, M-L**
  Tokenizer with `;` chaining, alias map, reserved tokens (ESC/ENTER/C/U), bare-number accept,
  and full AutoCAD point syntax `x,y` `@dx,dy` `dist<angle` `@dist<angle`; history capped at 100
  with arrow recall; suggestion dropdown. For EOS this is the "type exact coordinates/lengths
  while drawing trunks/walls" feature — pairs with C3. Port the parser mechanism; bind to EOS
  tools.
- [ ] **C3. Dynamic input + tool banner** — `updateDynamic/updateToolPrompt` — **CSS-copy + pattern, S**
  Cursor-following mono pill (label + value, pointer-events:none) + bottom-center banner
  ("TOOL — prompt — ESC to cancel"). Cheap polish for EOS's drawing modes (trunk draw, annotation
  place) which currently rely on the status bar only.
- [ ] **C4. Properties inspector** — `refreshInspector` (~L490+) — **pattern, S**
  Row/read/input/section builder generating the right panel from the selection, with good
  multi-select behavior ("Multiple / choose…" placeholders, color fallback chains). EOS already
  has per-tool property windows; the multi-select conventions are the part worth stealing.
- [ ] **C5. Drawing explorer** — `refreshExplorer` — **pattern, S**
  Layers/Objects tabbed left panel with filter box, count badges, current-layer accent bar,
  stat footer, drag-resizer bound to a CSS var. EOS's Layers window covers most of this; the
  *Objects list* (browse/select entities by type with id) is the piece EOS lacks.
- [ ] **C6. Status bar** — `refreshStatus` — **CSS-copy, S**
  Data-driven toggle chips (GRID/SNAP/ORTHO/POLAR/OSNAP/LWT from a `[key,label]` array), mono
  coordinate readout, layout tabs. EOS's sheets status bar could adopt the toggle-chip pattern
  for its view flags.
- [ ] **C7. Modal / toast / popover primitives** — `dialog()/toast()/showContextMenu()` — **skip / CSS only**
  EOS already has Window, Dialog, svelte-sonner, and context menus. Only the `.popover` styling
  and the viewport-clamped positioning helper are worth borrowing.
- [ ] **C8. View cube** — flat SVG hexagon — **skip**
  Hand-drawn 3-face SVG; if model3d ever wants one, build a real 3D gizmo instead.

## D. Engine / logic modules (framework-free JS, `K.*`)

- [ ] **D1. DXF import** — `exchange.js` `parseDXF` (639L total) — **lib-lift + adapter, M** — *new capability*
  Reads LINE/POLYLINE(+bulges)/CIRCLE/ARC/ELLIPSE/SPLINE/TEXT/MTEXT/INSERT(blocks, arrays)/
  HATCH/DIMENSION + LAYER/STYLE/DIMSTYLE tables; codepage autodetect (incl. shift_jis — relevant
  for your ja-locale client files); unsupported entities reported, not dropped. EOS currently
  only *exports* DXF — this would let clients' DXF floorplans come in as underlays/geometry
  instead of PDF-only. Port the parser, write an adapter to EOS shapes; run in a Worker (D8).
- [ ] **D2. DXF writer upgrades** — `exchange.js` `writeDXF` — **reference, S-M**
  More complete than EOS's exporter: blocks, dimstyles, hatch patterns, encoding-aware text,
  ellipse-degeneracy handling, MTEXT. Mine it piecemeal when EOS's export needs a feature.
- [ ] **D3. Live schedules** — `fields.js` (237L) — **lib-lift + adapter, M**
  Declarative field bindings (no eval): object properties, aggregates (count/sum/min/max/avg over
  entities), drawing props, template strings; dependency DAG with cycle detection; `linkedTable`
  = a TABLE whose cells re-evaluate when source geometry changes. Direct fit for auto-updating
  outlet/device schedules on sheets (EOS's legend counts are a baby version of this).
- [ ] **D4. Quantity takeoff** — `productivity.js` (285L) — **lib-lift + adapter, S-M**
  QSELECT-style `select(query, mode)` filter engine, `count()` grouped totals, `rows()` per-entity
  length/area/attrs, `extractionTable()` (schedule placed in the drawing), injection-safe `csv()`.
  Shallow entity coupling — adapts to outlets/trunks/racks easily. Feeds the BOM story; `select`
  alone would give the floorplan a "select all Cat6a outlets on layer X" power.
- [ ] **D5. Geometry ops** — `geometry.js` (399L) — **lib-lift, S (primitives) / algorithm, M (commands)**
  Liftable: `offset()` (line/polyline/arc/circle with joins), `arcThrough()` (3-point arc),
  NURBS eval, entity tessellation, per-entity `snaps[]` contract (endpoint/midpoint/center/
  quadrant). NOT here: fillet/chamfer/trim/extend and interactive osnap live inside app.js
  (~L838-1736) as editor code — porting those means re-implementing the pattern (spatial index +
  snaps + screen-space nearest), not lifting a file. Offset alone is useful for trunk routing.
- [ ] **D6. Dimension math** — `production.js` `dimension()` — **algorithm, S-M**
  Linear/radius/diameter/angular/ordinate arrow+extension-line+text geometry with dimstyle
  prefix/suffix/precision/scale. EOS has aligned dimensions only; this is the recipe book for
  adding the other kinds to sheets annotations.
- [ ] **D7. Undo pattern** — `model.js` `transaction()` — **reference only**
  Whole-doc JSON snapshot + validate-before-commit + auto-rollback-on-throw, 80-entry/32MB cap.
  EOS's editors already have undo; the validate+rollback guarantee is the idea worth remembering.
- [ ] **D8. DXF-in-a-Worker** — `io-worker.js` (11L) — **pattern, S**
  Parse/write DXF off the main thread. Adopt alongside D1 (and for EOS's own export, which can
  stall on large floors).
- [ ] **D9. Not worth porting** (agreed by both surveys, my judgment added):
  `renderer.js` (WebGPU, tightly coupled — steal only the instanced-line + camera-relative-vertex
  ideas if model3d ever needs precision at big pans) · `constraints.js`/`spatial-constraints.js`
  (real Levenberg-Marquardt solvers, well-tested, but parametric editing isn't on EOS's roadmap —
  shelf them) · `production.js` layouts/PLOT (**EOS's sheets tool is already ahead** — Kestrel
  edits layouts as raw JSON and its own notes plan to build what EOS has) · `csg.js`, `kernel.js`
  (3D solids) · `source-document.js` (byte-exact DXF round-trip) · `mtext.js`+`fonts.js`+
  `unicode-bidi.js` (AutoCAD MTEXT codes + SHX fonts + bidi — only if DXF *text* fidelity on
  import matters; note unicode-bidi.js is vendored third-party MIT — check its license if used) ·
  `dynamic-blocks.js` (parametric symbols — revisit if outlet/rack symbols ever need
  configurable variants).

---

## Suggested first picks

1. **B2 palette** (S) — biggest navigation payoff per hour; works before tabs exist.
2. **A1 tokens (+A3/A4)** (S) — the look, nearly free.
3. **B1 document tabs** (M) — the navigation fix proper; design doc first (tab = sheet or
   tool-view descriptor, per-tab state, then split view as two tab hosts).
4. **D1 DXF import** (M) — the one genuinely new *capability* in the pile.
5. **D4 + D3** (M) — select-by-filter now, live schedules when the BOM story lands.
