# Riser view: floor / ceiling lines check (backlog T071)

Compares the cad riser view (`src/lib/cad/views/riser.ts`, `riserDisplayList`, per-floor loop at lines 98–106) with the
legacy Risers tool (`src/routes/projects/[pid]/risers/`: `parts/FloorBand.svelte`, `parts/engine.ts`,
`parts/RoomBox.svelte`, `parts/Ladder.svelte`, `Risers.svelte`). Both use the same four heights per floor
(`slabMm`, `raisedFloorMm`, `clearHeightMm`, `plenumMm`, defaults 200 / 300 / 2600 / 700). Checked 2026-10-07, no code changed.

## 1. What both draw

- A band per floor, stacked by height (legacy: `engine.ts:63` builds it from the heights; cad: `Level.elevationMm`).
- The structural slab as a filled strip, and a ceiling line at FFL + clear height.
- The floor name at the left of each floor.
- A break where floors are left out, with text saying which floors (legacy: hatched block "3 floors hidden",
  `Risers.svelte:1113-1138`; cad: zigzag "5F – 12F not shown", `riser.ts:107-114`).
- Server rooms as boxes with their names, and risers as vertical strips with labels at the top.

## 2. Missing or wrong in cad

1. **Slab is in the wrong place (bug).** cad draws the slab from FFL down to FFL − slab (`riser.ts:101`). Per
   ADR 0004 and `types.ts:44` the slab top is at FFL − `raisedFloorMm`, so with the default 300 raised floor the slab
   sits 300 too high: it covers the floor void, and the plenum above looks 300 too deep. Legacy stacks it correctly
   (`engine.ts:94-98`, `FloorBand.svelte:73-79`). *Fix:* draw the slab from −raisedFloor to −(raisedFloor + slab). **S**
2. **Raised-floor void.** Legacy shades the void between slab top and FFL and draws the walking surface
   (`FloorBand.svelte:55-71`, only when `raisedFloorMm > 0`). cad has only the FFL line. *Fix:* a light filled strip
   (new class, e.g. `riser-void`) from FFL down to the slab top. **S**
3. **Ceiling plenum.** Legacy shades the plenum between the ceiling and the slab above (`FloorBand.svelte:38-44`).
   cad leaves it blank. *Fix:* the same void strip from FFL + clear to FFL + clear + plenum. **S**
4. **Slab above the top floor, and above a floor under a break.** Legacy draws the roof slab on the top floor and the
   slab above any floor that sits below hidden floors (`FloorBand.svelte:28-36`, `roof` / `gapAboveMm`). In cad the
   slab above a floor only appears as the next level's slab, so the top floor and every floor under a break end
   open at the plenum. *Fix:* when no shown level sits directly above, also draw a slab at FFL + clear + plenum. **S**
5. **Room box height.** Legacy fills the whole storey, plenum top to slab top (`RoomBox.svelte:17-22`), so a room
   visibly spans floor void to plenum. cad uses a fixed 2200 box from FFL (`riser.ts:19`, `:117`), which is shorter
   than the default 2600 ceiling. *Fix:* use the level's clear height (or the full storey). **S**
6. **EPS rooms.** Legacy has two room kinds, server (IDF) and EPS, in different colours (`RoomBox.svelte:43-52`,
   `types.ts:37`). cad only shows `server room` spaces that have placed racks (`riser.ts:81-86`), so EPS rooms that
   a riser passes through never appear. *Fix:* also show EPS spaces, at the x of the riser on that floor. **M**
   (needs EPS spaces in the data; overlaps `later.md` "Riser view extras").
7. **HIGH / LOW tag on risers.** Legacy writes HIGH or LOW under a ladder that serves one level only
   (`Ladder.svelte:126-136`); cable hops run mid-plenum or mid-floor-void (`engine.ts:151-161`). cad has no tag and
   draws backbone groups at one fixed height (`riser.ts:151`). *Fix:* fold into the existing backlog item
   "High / low cables in the riser view" (P3 · M). **S** for the tag alone.
8. **Break slashes on a riser.** Legacy draws two slanted lines across a ladder where it crosses hidden floors
   (`Ladder.svelte:88-112`). cad's zigzag runs across the whole width, shafts included, so this is mostly covered.
   *Fix:* none needed.
9. **Building outline.** Legacy draws the left and right building walls as vertical lines (`Risers.svelte:1141-1158`,
   draggable to set the width). cad bands just stop at the margins. *Fix:* two vertical lines at x0 / x1. **S**, optional.
10. **Grid.** Legacy has an optional 1 m grid (`Risers.svelte:1081-1104`). Not needed on a generated drawing.

Neither tool draws dimensions between floors (floor-to-floor height) or ceiling-height / SSL values. cad already
has datum labels for this in other views (`views/elevation.ts:207-218` "SSL / FFL ±0 / CLG +2600 / SSL above",
`views/rackRow.ts:246-258`). These could be reused as small labels at the right end of each band. **S**, optional.

## 3. What cad does that legacy doesn't

- The FFL value in the floor label (`3F  FFL 8.00`, `riser.ts:105`); legacy shows the floor name only.
- Area plans on the same floor (Journey 33F, 3303 / 3307) share one band, named together (`riser.ts:93-94`, `:104`).
- Breaks name the floors they leave out, and a gap with no levels at all reads "floors with no level"
  (`riser.ts:29-58`, `:112`). Legacy only gives a count, and its gap is a fixed half storey.
- Everything is placed from the data: rooms at their racks' x, risers at their real x and true top / bottom heights
  (`riser.ts:61-74`). Legacy rooms and ladders are placed by hand and always span whole floors.
- Backbone cables grouped per room pair and type, labelled "24 × cat6a · 12m", with unrouted counts (`riser.ts:126-163`).
- An FFL line on every floor, even with no raised floor (legacy draws it only when `raisedFloorMm > 0`).
- Print / PDF styles for the slab, FFL and ceiling (`render/pdf.ts:55`).

## 4. Recommendation

Worth doing now, as one small change in the per-floor loop (~25 lines, plus a test that the slab sits under the
raised floor): **1** (the slab bug), **2** and **3** (void strips), and **4** (slab above the top floor / under a
break). Together these make each band read like the legacy section: slab, floor void, room, ceiling, plenum.
Also cheap and useful: **5** (room box to the ceiling height). Take **7** with the existing high / low cables item.
Leave **6** (EPS rooms) for when EPS spaces exist in the data, and skip **8**, **9** and **10**. Floor-to-floor
dimensions / datum labels are optional; reuse the elevation datum style if Dave wants them.
