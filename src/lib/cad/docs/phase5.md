# Phase 5 — Routing, fill, quote

**Status:** REVIEWED (Dave, 2026-10-02). The answers are in §6a and override §2–§4 where they differ.
- **Exit** (analysis §8): produce a quote BOM for a floor.
- **Retires:** Fill rate and Risers.

## 1. What exists, and what the legacy tools do

- **cad already has:**
  - Containment runs: paths with sections (`inner` size for fill), `form` / `tier` / `serves` server rooms.
  - Risers: vertical segments to another level's FFL.
  - True 3D run lengths (`runLengths`).
  - A quantities-only BOM with Excel export.
  - `Link.route` and `Link.lengthM`, declared but never filled: links show "length unknown" in the BOM.
  - `cordLength`, for patch cords only.
- **Not yet in cad:** no graph, no shortest path, no fill, no prices, no riser view.
- **Fill rate (legacy):** free sections `FR-001…`, each a containment size plus cable groups (Ø × qty) typed by
  hand.
  - Fill % = cable area ÷ inner area, cables counted as d² or πr².
  - Shown as a packed-cable picture; prints A3.
  - No cable table, no limits rule (colours at 40 / 60 / 80 %), no Excel, no prices.
  - Not tied to the drawing.
- **Risers (legacy):** a hand-drawn building elevation.
  - Floor bands (slab / raised floor / ceiling / plenum), server rooms and EPS rooms, ladders.
  - Cables routed by hand as hops room → ladder → room, laid out in lanes.
  - No lengths, no export.
- **Tests:** neither legacy tool has any; their maths are pure and easy to test.

## 2. Model (small, additive)

- **Routes are DERIVED, not stored** (proposal, §6 Q1).
  - `routeLinks(ix)` runs a shortest path over the containment graph, recomputed with the data like every other
    view. The graph's nodes are path nodes joined where runs meet; riser ends join the other level.
  - What is stored:
    - an optional **via** on a link, a run it must use (to force a route);
    - `lengthM` typed by hand, which still wins.
  - Stored routes would go stale whenever a run is edited.
- **A link's route:**
  1. outlet → the nearest run of its tier that serves its server room (a straight drop: plan distance + height
     change);
  2. through the graph (3D lengths, risers included);
  3. into the server room / rack (the run's end → the rack top / bottom, then down / up to the panel's U).

  **Length** = route + allowances (§6 Q2), rounded up.
- **Fill per segment:** the cables whose routes use it.
  - Each cable's area comes from a **cable table** of outer diameters by cable type (global, like device
    templates; seeded cat6a 9 / cat6 7 / cat5e 6 / fibre 3 mm, the Pages values).
  - Fill % = that area ÷ the section's inner area.
  - **Limit:** a project setting (default 40 %, §6 Q3); over the limit = a problem.
- **Prices:** a **price list** (global, `settings/cadPrices`): key → unit price, where the key is a BOM line's item
  (a catalog SKU, a cable type per m, a containment size per m, an outlet …). A project can override prices.
  Currency and labour are in §6 Q5.
- **Riser view:** a generated `ViewSpec` `riser` (ViewDef already names it).
  - It draws:
    - floor bands from `Level.heights` (ported `buildFloorBands`);
    - the server rooms per level;
    - the riser runs;
    - the backbone links routed through them, laid out in lanes (ported `computeCableLanes`).
  - Nothing is hand-drawn: cables follow their derived routes.
  - It can be placed on a sheet like any view.

## 3. UI

- **Plan:**
  - A **Fill** overlay toggle colours runs by fill (green / amber / red at the limit).
  - **Trace** (exists) also shows a link's route.
- **A run's Properties:**
  - fill % per segment (the tightest governs);
  - the cables in it by type;
  - a packed-cable section picture (ported `packSection`).
- **Links / outlets grid:** a **Length** column (routed, or typed), and "no route" flagged with the reason (no run
  of its tier serving its room, a gap in the graph …).
- **BOM:**
  - cable metres per type from routes, plus boxes (305 m);
  - containment metres (exists);
  - **Prices** (unit / total) once a price list exists.
  - **Quote** (Excel): the BOM with prices, subtotals by category, and the §6 Q5 extras.
- **Riser view:** "Riser" in the view list (building-wide, not per level).

## 4. Slices

| # | Slice | Contents | Exit check (Test Project) |
|---|---|---|---|
| 5.1 | **Graph + routes** | containment graph across levels (joins, risers); outlet entry / room exit; Dijkstra; via; no-route reasons; route in Trace | Every 1F outlet with a run routes; the route shown on the plan |
| 5.2 | **Lengths** | length = route + allowances; Length column; BOM cable metres + boxes; cable schedule Excel | 1F cable metres in the BOM, no "length unknown" |
| 5.3 | **Fill** | cable table; fill per segment; limit; Fill overlay; run Properties with section picture | The busiest 1F trunk shows its fill and goes red over the limit |
| 5.4 | **Prices + quote** | price list editor; prices in BOM; quote Excel | A priced quote for 1F |
| 5.5 | **Riser view** | floor bands, rooms, risers, backbone lanes; on sheets | Journey 33F 3303 ↔ 3307 backbone shown |

Rough size: ~2k lines. 5.1 is the core; 5.3–5.5 are mostly ports.

## 5. Size check

cad is 9.1k lines (non-test) after Phase 4, against the ~20k total target.

## 6a. Decisions (Dave, 2026-10-02)

1. **Routes:**
   - Recalculated from the drawing, never stored.
   - No "via" (forcing a run) for now.
2. **Length:**
   - Length = route + **slack at the outlet** (a project setting, user-defined), + **waste %**, rounded **up** to
     the metre.
   - No service loop in the rack.
   - **Flag over 90 m.**
3. **Fill:**
   - Limit 40 % for everything.
   - A cable's area counted as a **square** (d²).
4. **Fill sections:** only drawn runs, the simplest version. Free sections maybe later.
5. **Quote / BOM:**
   - **Material only** (no labour, no markup), in **Excel**.
   - The price list stays as planned (unit prices against BOM items, empty until filled; JPY).
6. **Riser view:**
   - What it covers: risers between building floors.
   - Built from data only for now.
   - Cable lengths come from the risers DRAWN on the plans, at their real positions; the schematic doesn't need
     real positions.
   - Where a floor's riser / room isn't drawn, the route can't be found → "no route". Entering horizontal
     positions / distances for those may be needed later.
7. **Cable in the BOM:** metres; the box estimate (305 m) as a note in the description column.

## 6. Questions for Dave (answered in §6a)

1. **Routes derived** (recomputed from the drawing, with an optional "via" to force one) rather than stored per
   link — OK?
2. **Length allowances:** what does a cable length include beyond the route?
   - For example: slack at the outlet (0.3 m?), a service loop in the rack (3 m?), termination, a % waste, rounding
     up to the next metre?
   - Is there a maximum (90 m permanent link) to flag?
3. **Fill limit:** 40 % for everything, or per form (conduit 40 %, tray / ladder 50 %)? Count cables as πr² (the
   default) or d²?
4. **Free fill sections:** do you still need FR-001-style sections NOT tied to drawn containment (e.g. a sleeve
   you don't draw), or do drawn runs cover it?
5. **Quote:** what does it contain?
   - Material only, or labour too (per outlet / termination / metre)?
   - Markup?
   - Currency (JPY)?
   - Do you have a price list to seed it from?
   - Is the format Excel only?
6. **Riser view:** derived from levels + riser runs + backbone links, nothing drawn by hand — OK? Import the legacy
   Risers docs (rooms / ladders / hand-routed cables) in Phase 7, or drop them?
7. **Cable sold by the box** (305 m) in the BOM, or metres only?

## 7. Progress

### Slices 5.1 + 5.2 — routes and lengths (built 2026-10-02)
- **`domain/routing.ts`** (tests in `routing.test.ts`):
  - **The graph:** every containment segment in 3D (node z + level elevation). Segment ends within 50 mm are
    merged into one node. Segments are cut where another run's node lies on them (a tee). Runs that merely cross
    mid-span are NOT joined: draw a node to tee.
  - **Risers:** a riser's far node sits on the other level, so it meets that level's run there.
  - **Outlet end:** the nearest run of the outlet's tier (wall runs take any tier) on its level serving its port's
    server room. Never onto a riser. Drop = plan distance + height difference. Outlet height = its z, else
    ceiling → clear height, wall → 300, floor / box / desk → 0.
  - **Rack end:** each run serving the rack's room within 3 m (plan) at its nearest point, else the single
    nearest. Drop = plan distance + height to the panel's U. A rack never jumps straight to a run across the
    floor.
  - **Shortest path:** Dijkstra from the rack's taps, one per (rack, panel), shared by that panel's links.
  - **Backbone / tie links:** routed rack to rack.
  - **No route:** the reason is given (not placed, no run serving the room, not connected).
  - **Length** = route + outlet slack, rounded up to the metre. A hand-set `lengthM` still wins. Over 90 m is
    flagged.
  - **BOM metres** (`cableMetres`): × (1 + waste %), rounded up, with a "≈ N box(es) of 305 m" note.
- **Settings:** `ProjectSettings.cable {slackM, wastePct}`, defaults 0.5 m and 10 %, edited in the Outlets grid
  bar.
- **`CadProject.routes`:** recomputed with the data.
- **BOM:** cable lines "cat6a (incl. 10% waste)" in m with the box note in a new **Note** column; "— no route,
  length unknown" counted per type. The title says "material, quantities".
- **Outlets grid:**
  - A **Length** column per port: the metres; `?` (red) when there is no route; red over 90 m. Hover gives the
    reason / breakdown.
  - The bar shows "N routed · M no route · K over 90 m" for the level.
- **Plan:** selecting outlets, a link or panel ports highlights their routes (orange) on the runs used; a riser
  shows as a dot.
- **Tests:** 245.
- **Live check on Test Project 1F:**
  - 17 links routed, 8–15 m. Routing all 138 links is instant.
  - The 49 / 72 with no route are data gaps: outlets not placed on the plan, and racks with no plan position. The
    project has only 3 runs (TR1–TR3).

### Risers, interconnects, the riser choice (Dave's questions, 2026-10-02)
- **A riser is drawn once.**
  - How: the path tool (Trunk / Conduit) → click / type the start → **V** → the other level's number. That draws a
    vertical segment to that level's FFL.
  - It now shows on **every floor it passes through** (`plan.ts` `passesThrough`), not only its two ends.
  - Routing joins any run on an intermediate floor that has a node on the riser (a tee in 3D), so there is nothing
    to draw per floor.
- **Interconnects** (`domain/interconnect.ts` + tests):
  - Port Properties → **Interconnect to…** arms the selected panel ports. Then, in any room on any floor, click the
    other panel's first port. One cable per port is created, to that panel's free ports in order; busy ports are
    skipped.
  - **Kind:** `backbone` between rooms, `tie` within one room.
  - **Faces:** both ends land on the panels' REAR (permanent cabling), whichever face was viewed.
  - **Cable type:** the tool bar's Type.
  - **Getting there:** the armed ports survive view changes (the cord tool keeps a bulk selection on cancel; Esc
    drops it).
- **Riser choice (diversity):**
  - `Link.via` = a run the route must use.
  - Routing searches from both ends and goes through the best piece of that run.
  - Port Properties → **Cable** section: Length (range / total / no route) and **Riser** (Shortest / each riser run
    by label, applied to all selected ports).
- **Hand-entered lengths:** `Link.lengthM`, typed in the same section's "By hand (m)" field (blank = routed). It is
  for as-built measurements, or where the containment isn't drawn. Before this, only legacy imports set it.
- **Grid:** lengths read "12m"; the 305 m box note is for copper only (fibre is ordered differently).
- **Tool bar:** only the tools that work in the current view are shown; the four exports moved into an
  **Export ▾** menu.

#### How to: 24 × Cat6A from 1F P3A / PP1 to 4F 4AR01 / PP2 through a building riser (done on Test Project)
1. **Place the far rack on its plan.** 4F plan → Racks list → **Place** beside 4AR01 → click the plan. Set the
   exact X / Y in Properties if needed: here (10495, −1500). A rack with no plan position can't be routed to.
2. **Draw the riser on 1F.**
   - Trunk tool. Set **Z** to the height of the run it continues from (TR1 is at 2600).
   - Type `10210,2600` Enter. **Typed points are Y-UP**, so this lands at stored (10210, −2600), TR1's end.
   - Press **V** → level `4` → Enter.
   - Name it in Properties (Label "Riser A"). It now shows on 1F, 4F and every floor in between.
3. **Draw the 4F run from the riser to the rack.**
   - 4F plan → Trunk, **Z 0** (the riser arrives at 4F FFL).
   - Type `10210,2600` Enter, then `10210,1500` Enter, then Enter to finish.
   - Its first node sits on the riser's top, so they join.
4. **Pick the ports.** 1F → IDF1 → Elevation. Click PP1 port 1, **Shift**-click port 24 → Properties shows
   "Ports 1–24".
5. **Interconnect.** **Interconnect to…** (the tool bar says "Interconnect 24 port(s) from PP1…"; pick the Type,
   Cat6A). Switch to 4F → Server room A → Elevation and click **PP2 port 1**. Result: "24 interconnect cable(s)
   added".
6. **Check.**
   - Select PP1's ports → Cable: 24 backbone, Cat6A, 12m each.
   - The route is 4F run → Riser A → TR1 (11.7 m + no slack, panel ↔ panel).
   - With a second riser drawn, choose it under **Riser** for half the ports (diversity).

#### Found on the way
- **Typed points are Y-up** (AutoCAD habit), but Properties show the stored Y-down values. Typing a point copied
  from Properties lands mirrored. Make Properties show Y-up too? (a todo for Dave)
- **Outlets join the nearest run of their tier however far it is.** On 4F the only run is the short one by
  4AR01, so the 72 outlets now "route" with straight 10–15 m drops (17–19 m). A maximum drop (e.g. 10 m, else
  "no run near the outlet") may be wanted. To ask Dave.

### Plan view fit (Dave: "outlets shown zoomed in, then it zooms out when the PDF loads")
- **Cause:**
  - The first fit ran as soon as the plan had anything to show: the project-wide racks / rooms, before the level's
    own data arrived.
  - The fit key also changed when the floorplan image arrived, so it fitted again.
- **Fix:**
  - `CadProject.loadedScopes` / `levelLoaded()` (the first snapshot of a level scope).
  - A plan not fitted yet stays hidden ("Loading floorplan…") until its level has loaded and its floorplan has
    rendered or failed, then fits once.
- **Measured:** 1F fits once at ~3.1 s; 4F (cached PDF) at 0.5 s.

### Slice 5.3 — fill (built 2026-10-02)
- **`domain/fill.ts`** (tests in `fill.test.ts`):
  - `fillBySegment(ix, routes)` gives, per run segment, the cables routed through it by type.
  - A cable counts as d² (Dave). The outer diameter comes from the project's cable type (`diameterMm`), else the
    Pages table: cat6a 9, cat6 7, cat5e 6, fibre 3, MPO-12 4.
  - Area = the section's inside (`inner`, else w×h; round = πr²). A segment's own section overrides the run's.
  - Limit **40 %** (`FILL_LIMIT_PCT`). `fillTone`: amber from ¾ of the limit, red over it.
  - `packCables`: the legacy greedy gravity packing, with a step of max(0.5 mm, r/2), largest first, capped at 400
    cables; the rest count as "don't fit".
- **`CadProject.fills`:** recomputed with the routes.
- **Plan:** a **Fill** toggle in the view bar draws each segment with cables as a band in its tone, with its %.
- **Run Properties → Fill:**
  - each segment's % and its cables by type (the fullest highlighted);
  - the fullest segment's section with the cables packed in, coloured by cable type.
- **Tests:** 252.
- **Live check on 1F:** TR1 (a 50×50 tray) seg 3 carries the 24 Cat6A backbones: 24 × 81 / 2500 = 77.8 %, red,
  packed picture shown. Outlet runs to IDF2 show green.

### Todo (later)
- **5.4 Prices + quote:** skipped for now (Dave, 2026-10-02: "skip 5.4, mark it as a todo for later maybe"). The
  BOM stays material-only in Excel.
- **Typed points are Y-up, Properties are Y-down:** make them agree (Dave to decide).
- **Maximum outlet drop:** outlets join the nearest run of their tier however far away it is (Dave to decide on a
  limit, e.g. 10 m).

### Slice 5.5 — riser view (built 2026-10-02)
- **The view:** a new `ViewSpec` `{ kind: 'riser' }` (building-wide), generated by `views/riser.ts` (tests in
  `riser.test.ts`). It is a front elevation of the whole building: x = plan x, up = true elevation.
  - **Floors:** one band per elevation (area plans share it): the slab under FFL, FFL with "4F FFL 11.40", and a
    dashed ceiling line.
  - **Server rooms:** boxes spanning their placed racks' x. Rooms with no placed rack are left out.
  - **Risers** (`riserShafts`): containment with a vertical segment between two levels, at its real x, labelled.
  - **Backbone cables:** grouped per panel pair + cable type + the risers their ROUTES use. Each group is one line
    room → riser → up → room, labelled "24 × cat6a · 12m" (a length range when they differ; "N no route" if some
    have no route, red dashed when none route). Groups sharing a riser are laid side by side in lanes.
  - Nothing is hand-drawn; lengths come from the plans' routes.
- **Where it appears:**
  - a **Riser** button in every pane's view bar; the URL `v=riser`;
  - Select is the only tool there;
  - a sheet viewport can show it (View → "Risers (building)") and it prints to PDF (styles added to the PDF table);
  - its label class is `rv-label` (the plan already uses `riser-label`).
- **Tests:** 255.
- **Live check on Test Project:** 1F (IDF2, IDF1) and 4F (Server room A), Riser A between them, and one backbone
  line "24 × cat6a · 12m".
- **Later, if needed** (Dave): horizontal positions for rooms / risers that can't be worked out (nothing drawn),
  and floor compression for tall buildings (the legacy Risers tool hid floors; Pages had `storeyMap`).

**Phase 5 is complete except 5.4 (prices), which is a todo.**
