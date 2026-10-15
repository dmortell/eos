# Phase 4 — Sheets and issue

**Status:** REVIEWED (User, 2026-10-02). The answers are in §6, and they change §2 and §3: packages issue a PDF to
file storage.

**Goal (pages-analysis §7):** sheets with true-scale viewports, a title block, print / PDF, a drawing register,
revisions and issue in packages. **Exit:** issue a package of plan + rack sheets for Test Project. **Retires:**
Sheets, Drawings, Packages (their data comes over in Phase 7, or is re-made — §6 Q6).

**Scope rule (User, 2026-10-02):** build what's listed here and nothing more. Everything is confirmed "y" in
`pages-features.md` §Sheets; anything else waits for a request.

## 1. What already exists

- **Domain types (Phase 1):** `Sheet` (number, title, place, paper size / orientation / margin, title-block field
  overrides, viewports, kind / discipline / tags, status) and `Viewport` (a ViewDef at 1:N, a paper rect, a centre,
  lock, per-entity overrides). Shapes can be owned by a sheet (`sheetId`, ADR 0007), so paper notes are ordinary
  shapes.
- **View generators:** plan (a level / area), elevations, rack row (front / rear). A viewport draws one of these into
  its paper rect at its scale, through the same display list as the screen, DXF and picking.
- **Pages code to port as it is** (pure, tested, small):
  - `pages/titleBlock.ts` (90 lines): one template per project, auto fields (project, title, place, number, rev,
    date, scale, size, drawn), custom fields, company block, logo, revision table, three layouts.
  - `pages/printing.ts` (78): `@page` size + CSS zoom so paper prints at true mm (vector text); a multi-sheet print
    book.
  - `pages/store/drawingList.ts` + `drawingListExport.ts` (125): register rows, filter / sort / group, renumber
    patterns, Excel.

## 2. Model (small, additive)

- **`ViewDef`** (exists): plan of a level, an elevation, or a rack row. A viewport points at one.
- **Title block template:** on `ProjectSettings.titleBlock` (Pages kept it on the project doc). Per-sheet values
  are the sheet's own fields.
- **Revision:** `Sheet.revisions: { code, date, note, issueId? }[]`; the latest one is the sheet's rev.
- **Issue** (`type: 'issue'`, project scope): code, date, purpose ("For construction" …), the sheets with the rev
  each was issued at, recipients / notes. This is a **package**: one issue = one transmittal.
- **What an issue freezes (§6 Q2):** proposal — the issued sheets' display lists (paper prims, already resolved
  to text and lines), stored with the issue. Reprinting an issued revision then shows exactly what went out, even
  after the model changes. Small enough for Firestore at these sheet counts; no PDF storage needed.

## 3. UI

- **A sheet opens in a pane** like the plan / elevations: the paper, its viewports, its title block. Split view
  keeps working (sheet beside the plan).
- **Viewport:** place by drawing a rect, then pick its view and scale in Properties. Move / resize the rect; pan
  inside it moves its centre; lock.
- **Sheets** tab in the bottom panel (beside Outlets / Patch list): the register: number, title, place, size,
  scale, rev, status; filter, sort, renumber, Excel.
- **Paper notes:** text, leader, revision cloud — sheet-owned shapes with the existing tools. Dimensions on paper
  wait for a request.
- **Print:** the open sheet, or the selected sheets as a print book → the browser's print dialog → PDF.
- **Issue:** select sheets → **Issue…** (code, purpose, date) → revisions bumped, display lists frozen, transmittal
  sheet (Excel) for the package.

## 4. Slices

| # | Slice | Contents | Exit check (Test Project) |
|---|---|---|---|
| 4.1 | **Sheet + viewports** | sheet entity in a pane; paper at true size; viewport rect / view / scale / centre / lock; plan, elevation and rack-row views at 1:N | A 1F plan at 1:100 and an IDF2 rack row at 1:20 on one A3 sheet |
| 4.2 | **Title block** | port `titleBlock.ts` + the template editor; auto fields; revision table | The sheet shows project, number, title, scale, rev |
| 4.3 | **PDF** | display list → jspdf at true mm (vector lines / text, floorplan images); one sheet or several; CJK font check | Two sheets in one PDF at true scale |
| 4.4 | **Register** | Sheets tab; numbering; filters; Excel (port drawingList) | Renumber three sheets; Excel matches |
| 4.5 | **Paper notes** | text, leader, cloud on paper | A cloud + note on the rack sheet, printed |
| 4.6 | **Issue + packages** | package = (sheet, rev) list; Issue package bumps changed sheets (frozen display lists); package PDF → file storage; transmittal Excel; reprint as issued | Issue rev A of two sheets; change one; issue again → rev B + unchanged A; both PDFs in storage |

Rough size: 4.1 is the big one; 4.2–4.4 are mostly ports; 4.6 is medium.

## 5. Size check

cad is 7.2k lines (non-test) after Phase 3, against the ~20k total target. Phase 4 budget: ~2.5k.

## 6. Decisions (User, 2026-10-02)

1. **Title block:** keep Pages' model.
2. **Issue keeps both:**
   - a **frozen copy** of what each sheet showed (its display list);
   - a **PDF of the whole package**, saved to file storage (Uploads' `files/{id}`), since that PDF is what gets
     issued.

   The PDF is drawn from the display list with **jspdf** (already a dependency): vector lines and text, floorplans
   as images, at true mm. One code path for print and issue — the CSS-print port (`printing.ts`) isn't needed.
   **Risk:** jspdf's standard fonts have no Japanese glyphs. Check in 4.3 whether labels need a CJK font, which is
   a large embed.
3. **A package can mix sheets from several issues.** Model:
   - **Package** = a list of (sheet, revision).
   - **Issue package** bumps the revision only of sheets changed since their last issue (freezing them). Unchanged
     sheets go in at their current issued revision.
   - The package's PDF and transmittal record exactly those revisions.
4. **Sheet numbers:** free text, with renumbering (port `drawingList.renumber`).
5. **Tables on paper:** later; not urgent.
6. **Existing Sheets / Packages data:** imported in Phase 7. Test sheets for now.

## 7. Progress

### Slice 4.1 — sheet + viewports (built 2026-10-02)
- **The view moved onto the viewport:** `Viewport.view = { levelId, spec }` replaces `viewId`. The domain `ViewSpec`
  (plan / elevation / rack row / sheet) is shared with the panes; ViewDef is unused for now (it returns if a view is
  ever shared by several sheets).
- **`views/sheet.ts`:**
  - Paper sizes A0–A4 and orientation; the paper and a dashed margin guide are drawn.
  - Each viewport draws its view with the panes' own generators, at 1:N: view mm → paper mm, annotation sizes
    scaled for the paper.
  - The content sits on a white window (an overlaid viewport hides what's under it) and is clipped to it. A
    `clip` field on prims becomes an SVG `clipPath` in `Prims.svelte`.
  - Content isn't pickable on the sheet; the window is.
- **In the app:**
  - Left panel → **Sheets**: + New (A3 landscape, numbered after the last, free text) and click to open.
  - A sheet opens in a pane like any view. Split view works.
  - Select picks a viewport by its window and drags it (one undo step); a locked one stays. The paper selects the
    sheet.
- **Properties:**
  - **Sheet:** number, title, paper size / orientation, margin, Add viewport (the open level's plan, 1:100,
    centred on its content).
  - **Viewport:** level; view (plan, elevations, each server room's racks front / rear); scale 1:N (list + custom);
    window X / Y / W / H; centre + Fit; label; printed frame; lock; delete.
- **URL state** (User): `?level=…&v=plan,sheet.<id>&a=1`. The level, each pane's view and the active pane come back
  on a refresh (`app/urlState.ts`, `replaceState` from `$app/navigation`). Cameras stay per session.
- **Riser target:** with several levels of one number (33F 3303 / 3307), the main plan wins.
- **Racks list:** the room "Labels" button moved into a **⋯** menu → "Export panel labels (Excel)…" (User).
- **Tests:** 211 (`views/sheet.test.ts`, `app/urlState.test.ts`).
- **Live check on Test Project:**
  - S-001 "Test sheet (cad 4.1)", A3: the 1F plan at 1:100 (230 × 250 mm) and IDF2's racks at 1:20 (150 × 160 mm,
    labelled).
  - Dragging the racks viewport moved it 39 mm.
  - A refresh reopened the sheet on 1F.
  - The test sheet stays for 4.2–4.6.

### Fixes after 4.1 (User)
- The URL sometimes kept `v=plan` after opening a sheet: `page.url` lags after `replaceState`, so the change looked
  like nothing. It now compares with the address bar.
- U numbers in narrow frames (P3C, 17 mm beside the rails) moved just outside the frame's left edge, where panels
  can't cover them.
- Port cells are at most 18 × 30 mm (a 24-port panel's spacing), so a 2-port server or a tower PC no longer draws
  huge ports.
- New sheets are numbered S001 (no hyphen) with a 5 mm margin.

### Slice 4.2 — title block (built 2026-10-02)
- **Model ported unchanged** from Pages (`domain/titleBlock.ts` + its tests): the template on
  `ProjectSettings.titleBlock`, auto fields, custom fields, company lines, logo text + images, revision table, the
  three layouts.
- **Drawn as prims** (`views/titleBlock.ts`) so the screen and the PDF (4.3) draw the same thing:
  - **strip** down the right (default) or **band** along the bottom (4 across), or a **compact** box bottom-right;
  - sections as in Pages: logo, company, full-width fields, then revisions and the half-width grid at the bottom;
  - values cut to fit with an ellipsis; logo images keep their proportions (`fit: 'contain'` on image prims);
  - drawn over the viewports (a window that strays under it is covered); the template's border prints along the
    margin.
- **Values** (`titleBlockContext`):
  - project name; sheet title and number; size ("A3 L");
  - scale ("1:N", or "As shown" when the viewports differ); location (the viewports' levels);
  - rev / date from `Sheet.revisions` (filled by 4.6);
  - the sheet's own `titleBlock.fields` override any of them ("Drawn").
- **New viewports** fill the drawing area: left of the strip, or above the band.
- **Properties (sheet):**
  - Drawn; Title block "on this sheet";
  - **the template editor** (Pages' `TitleBlockEditor`, its imports changed and cad's colours): sections, border,
    layout, logo text, logos uploaded to file storage, company, fields (relabel / width / drag to reorder / remove /
    add).
- **Tests:** 219 (the ported title-block tests; strip / band / compact, filled values, hidden, viewports clear of
  the block).
- **Live check on Test Project S-001:**
  - The strip shows J / EIRE Systems K.K. / 03-1234-5678 / Test Project / Test sheet (cad 4.1) and the grid (As
    shown, A3 L, DM, S-001).
  - Switching Plan ↔ sheet three times kept the URL in step.

### Fixes after 4.2 (User)
- **PDU over R311's U numbers:** a PDU strip now hugs the outside of the 19″ rails (it was 20 mm in from the rack
  edge, on the numbers), and the U scale draws after the rack's devices so nothing covers it. Test in
  `rackRow.test.ts`.
- **Viewport resize** (owed from 4.1's plan):
  - a selected, unlocked viewport shows corner grips (constant size on screen); dragging one resizes the window
    (≥ 10 mm), the view staying where it is on the paper;
  - **Ctrl-drag inside** pans the view (its centre).
  - Tests in `editor/sheet.test.ts`.
- Title-block editor rows are tighter (no row padding, 18 px inputs).

### Slice 4.3 — PDF (built 2026-10-02)
- **`render/pdf.ts`:**
  - `sheetPages` (each sheet's display list at its paper size) → `pagesToPdf` (jspdf, mm units).
  - Vector paths and text; bands at their real width.
  - Fills, dashes and opacity from a class → style table that mirrors `Prims.svelte`.
  - Viewport windows clip.
  - Images (floorplan renders as JPEG, logos as PNG at their own proportions) loaded through a canvas.
  - Screen-only things skipped: paper edge, margin guide, hidden frames; text LOD at print resolution.
- **Fonts:** symbols the standard fonts lack become plain text (№ → No., … → ..., → → ->). Anything else outside
  Latin-1 is left out and REPORTED in the status line. Both projects' names and labels (Tourney 3,088, Test
  Project 324) are all Latin-1, so **no Japanese font for now**; embed one if a sheet ever needs it.
- **UI:** sheet Properties → **PDF** (this sheet); Sheets header → **PDF all** (every sheet, one file). Both are
  downloads; issuing (4.6) builds the same PDF and uploads it instead.
- **Tests:** 226 (`render/pdf.test.ts`: a page per sheet at its own size, real text in the file, symbol swaps,
  unsupported reported, screen-only skipped).
- **Checked in the page** (Test Project, no download): S-001 → 1 page 420 mm wide, 23 KB, 31 ms, nothing
  unsupported. The downloaded file is for User to look at.

### Japanese text in PDFs (User added a Japanese address to the title block)
- **Approach:** text the PDF fonts can't show is drawn by the BROWSER's fonts as a ~300 dpi PNG at its place
  (`browserTextRaster`): same anchor, colour and weight.
  - Crisp on paper and small (S001 with the address: 33 KB).
  - Not selectable / searchable — that's the trade-off.
  - An embedded CJK font (5–9 MB per PDF, fetched from outside) is the upgrade if searchable Japanese is ever
    needed.
- **Status line:** "N Japanese text(s) drawn as pictures"; anything still unrenderable is listed.
- **Title block:** text fitting counts full-width characters as 1 em, so a Japanese line is cut with an ellipsis
  instead of overflowing.
- **User:** "pdf looks fine".

### Slice 4.4 — sheet register (built 2026-10-02)
- **`domain/sheetList.ts`** (ported from Pages' `drawingList.ts` + tests): rows (number, title, place = filed
  place or the viewports' levels, kind, discipline, tags, rev, size, scale, status), text / status filter, natural
  sort with blanks last, grouping (place / kind / discipline / tag / size), renumber patterns (`S{n:3}`).
  Model-usage functions dropped: cad viewports show live views, not models.
- **Sheets tab** in the bottom panel (beside Outlets / Patch list):
  - Find, Active / Archived / All, group; click a heading to sort.
  - Number, title, kind, discipline and tags edited in place.
  - Click / Shift / Ctrl select; double-click opens the sheet in the active pane.
  - **Renumber…** (the selection, in the order shown: pattern, then start); **PDF** (the selection, else the rows
    shown); **Archive / Restore**; **Excel** (`render/sheetList.ts`, ported from Pages' export).
- **Tests:** 230.
- **Live check on Test Project:** two more test sheets made. The register showed S-001 / S-002 / S-003. Selected
  all three and renumbered S{n:3} from 1 → S001, S002, S003. The Excel download is for User.

### Slice 4.5 — paper notes (built 2026-10-02)
- **Tools** (sheet views only): **Text** (X), **Leader** (E) and **Cloud** (U), in `editor/noteTool.ts`.
  - Notes are shapes owned by the sheet (`sheetId`), in paper mm, snapped to 0.5 mm.
  - **Text:** click, then type. The prompt opens on release; opened on press, the rest of the click took the focus
    back.
  - **Leader:** click the tip, then the bend / end points; Enter or right-click asks for its (optional) text.
  - **Cloud:** a polyline — click round the area, any number of points; Enter or right-click closes it.
  - Backspace drops the last point; Esc cancels; typed points work.
- **Drawing** (`views/plan.ts` `shapePrims`, now exported):
  - A leader gets a filled arrowhead and its text beside the last point.
  - A cloud is drawn as outward scallops about `arcMm` (6 mm) long.
  - Notes are drawn over the title block (a cloud may mark a revision there), so they reach the PDF too.
- **Editing:** Select picks and drags notes on paper. Properties edits text / size, leader text and cloud arc
  size. Delete removes a note.
- **Fix:** sheet scopes (`sheet:<id>`) were never subscribed, so notes vanished on reload. The project now watches
  every sheet's scope, as it does levels.
- **Tests:** 234 (`editor/notes.test.ts`).
- **Live check on S001:**
  - Added a rectangle cloud on R311, a free polyline cloud, a leader to P3C and a Japanese + English text.
  - All four reload.
  - The PDF has them; the Japanese text is rasterised.

### Notes tied to viewports (User, 2026-10-02: "tie vp notes to vp coordinates")
- **What tying means:** a note drawn inside a viewport (its first point / tip decides) gets `vpId`, and its points
  are stored in that viewport's view mm.
  - It follows the viewport's move, rescale and pan.
  - Text, arrowheads and cloud arcs stay paper size: drawn at 1:N, then placed like viewport content, but still
    pickable.
- **Dragging:** a tied note moves N view mm per paper mm.
- **Deleting a viewport:** its notes are untied back onto the paper where they showed (`untie`).
- **Paper-only notes:** notes outside any viewport stay in paper mm.
- **Snap fix:** moves on a sheet snap to 0.5 mm. The model's 10 mm step had turned a 5 mm paper drag into 10.
- **Existing notes:** the four notes drawn on S001 before this are paper notes, not tied.

### Slice 4.6 — issue + packages (built 2026-10-02)
- **`domain/issue.ts`** (pure, tested):
  - `nextRev`: A → B … Z → AA; P01 → P02; 9 → 10; first rev settable.
  - `freeze`: a display list rounded to 0.01 mm, pick ids dropped, floorplans as `underlay:<fileId>#<page>`
    references, not the local rendered blob.
  - `fingerprint`: FNV-1a + length.
  - `planIssue`: a sheet never issued, or whose fingerprint differs from its last revision's `hash`, gets the next
    revision; the rest go as last issued.
  - `transmittalRows`.
- **`domain/drawing.ts`:** an `Issue` entity (project scope): name, purpose, date, to, note, sheets
  `{sheetId, number, title, rev, size, changed}`, and `file` (the package PDF). `Sheet.revisions[].hash` added.
- **`app/issue.ts`:**
  - **Frozen copies:** each issued (sheet, rev) is frozen once in `projects/{pid}/cadIssued`. It sits outside the
    entity store, so opening a project doesn't load it. It is split into 300k-character parts, under the 1 MB doc
    limit even for all-Japanese text. S001 is 209 KB.
  - **Issuing a package:**
    1. Floorplans are rendered first (`PdfCache.placed`, new).
    2. Changed sheets are frozen as they show with their new revision; unchanged ones are loaded from their frozen
       copy.
    3. The package PDF is drawn from the frozen lists (floorplan references rendered from their files again).
    4. The PDF is uploaded through UploadThing (`genUploader`, the floorplan route) and a `files/{issue-…}` doc is
       written, so it lists in Uploads.
    5. Then, in one undo step, the bumped sheets and the Issue are recorded.
  - **If the upload fails,** nothing is recorded.
  - **Reprint** draws the package again from the frozen lists.
- **UI** (Sheets tab):
  - **Issue…** on the selection opens a panel: package, purpose (list + free text), date, to, first rev, note. It
    shows what happens to each sheet ("S002 A → B", "S001 stays A (unchanged)").
  - An **Issues** view lists each package: date, purpose, sheets at their revs (new revs in bold), the PDF link,
    **Transmittal** (Excel, `render/transmittal.ts`) and **Reprint**.
- **Also:** the plain PDF button now waits for floorplans to render (a sheet not on screen could miss its floorplan).
- **Tests:** 239.
- **Exit check on Test Project:**
  1. Issued S001 + S002 as "Test issue 1": both at A.
  2. An immediate re-check showed both unchanged, so the fingerprint is stable.
  3. Renamed S002's title.
  4. "Test issue 2": S001 stays A, S002 A → B.
  - Three frozen copies are stored. Both PDFs are in file storage (389 KB each, floorplan included).
  - Read back from the uploaded issue-2 PDF: page 1 is S001 rev A, page 2 is "Test sheet 2 (changed)" rev B.
  - Transmittal / Reprint downloads are for User to try.

### Todo (later)
- **Issue only saved sheets** (User, 2026-10-02): consider blocking Issue until edited sheets are saved as a
  revision / version, so each issued sheet shows its latest revision date. Today Issue bumps changed sheets itself,
  so a sheet can go out with edits never reviewed as a version. Decide with versions (`pages/drawings-plan.md`
  model versions + sheet revisions).

## 6a. The original questions (answered above)

1. **Title block:** keep Pages' model (one template per project; layouts vertical / horizontal / compact; logo,
   company, custom fields, revision table)? Anything from the Sheets / Drawings tools' title blocks it lacks?
2. **What an issue keeps:** the frozen display lists (proposal, §2) — or also a PDF file in Uploads?
3. **Packages:** is "one issue = one package with a transmittal" right, or do packages hold sheets from several
   issues?
4. **Sheet numbering:** a pattern per project (e.g. `JRN-E-{level}-{nnn}`), or free text with renumber only?
5. **Tables on paper** (outlet schedule, patch list, legend) in Phase 4, or later?
6. **Existing Sheets / Packages data:** import in Phase 7 as planned, or re-make the few sheets you need in cad?
