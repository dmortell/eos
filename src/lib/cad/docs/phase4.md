# Phase 4 — Sheets and issue

**Status:** REVIEWED (Dave, 2026-10-02). The answers are in §6, and they change §2 and §3: packages issue a PDF to
file storage.

**Goal (pages-analysis §7):** sheets with true-scale viewports, a title block, print / PDF, a drawing register,
revisions and issue in packages. **Exit:** issue a package of plan + rack sheets for Test Project. **Retires:**
Sheets, Drawings, Packages (their data comes over in Phase 7, or is re-made — §6 Q6).

**Scope rule (Dave, 2026-10-02):** build what's listed here and nothing more. Everything is confirmed "y" in
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

## 6. Decisions (Dave, 2026-10-02)

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
- **URL state** (Dave): `?level=…&v=plan,sheet.<id>&a=1`. The level, each pane's view and the active pane come back
  on a refresh (`app/urlState.ts`, `replaceState` from `$app/navigation`). Cameras stay per session.
- **Riser target:** with several levels of one number (33F 3303 / 3307), the main plan wins.
- **Racks list:** the room "Labels" button moved into a **⋯** menu → "Export panel labels (Excel)…" (Dave).
- **Tests:** 211 (`views/sheet.test.ts`, `app/urlState.test.ts`).
- **Live check on Test Project:**
  - S-001 "Test sheet (cad 4.1)", A3: the 1F plan at 1:100 (230 × 250 mm) and IDF2's racks at 1:20 (150 × 160 mm,
    labelled).
  - Dragging the racks viewport moved it 39 mm.
  - A refresh reopened the sheet on 1F.
  - The test sheet stays for 4.2–4.6.

## 6a. The original questions (answered above)

1. **Title block:** keep Pages' model (one template per project; layouts vertical / horizontal / compact; logo,
   company, custom fields, revision table)? Anything from the Sheets / Drawings tools' title blocks it lacks?
2. **What an issue keeps:** the frozen display lists (proposal, §2) — or also a PDF file in Uploads?
3. **Packages:** is "one issue = one package with a transmittal" right, or do packages hold sheets from several
   issues?
4. **Sheet numbering:** a pattern per project (e.g. `JRN-E-{level}-{nnn}`), or free text with renumber only?
5. **Tables on paper** (outlet schedule, patch list, legend) in Phase 4, or later?
6. **Existing Sheets / Packages data:** import in Phase 7 as planned, or re-make the few sheets you need in cad?
