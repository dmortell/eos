# Organising sheets and issue packages (plan)

**Status:** Dave answered the questions on 2026-10-07 (section 6) — ready to build, slice 1 first. Dave: "develop a plan for organizing sheets, the user will want to sort them
by various categories and build re-usable packages for issuing." Plan only; nothing here is built. It replaces the
backlog entries **Organising sheets** and **Revisions and packages**, and takes in the parts of **Change history per
drawing** and the decision **A DRAFT label on drawings?** that touch issuing. Version history, revert and the issue
gate stay where they are (see "Left for later").

## What cad has today

- **Sheet** (`domain/drawing.ts`): `number`, `title`, `order` (print order), `placeId` (a level, space or building),
  free-text `kind`, `discipline`, `tags`, `status: 'active' | 'archived'`, and `revisions[]`
  (`code`, `date`, `note` = the purpose, `issueId`, `hash` = fingerprint of what it printed).
- **Sheet register** = the Sheets tab of the tables panel (`ui/SheetsTab.svelte`, `domain/sheetList.ts`): find box,
  Active / Archived / All, group by place / kind / discipline / tag / size, click-to-sort columns, in-place edit of
  number / title / kind / discipline / tags, print order ▲▼, PDF, Archive, Delete, Excel, **Issue…**. It does not
  use the shared `tableKit` (scope, Ctrl+C, ↑↓) the other tables use.
- **Issue** (`domain/issue.ts`, `app/issue.ts`, `ui/IssuePanel.svelte`): select sheets → Issue… → each sheet whose
  fingerprint changed since its last issue gets the next revision, the rest go "as last issued". Each new (sheet,
  rev) is frozen as a display list in `projects/{pid}/cadIssued` (chunked docs, outside the entity store); one PDF is
  drawn from the frozen lists and uploaded (UploadThing + `files/{id}`); an `issue` entity records the package
  (number, name, purpose, date, to, note, sheets at their revs, file). The Issues view has Transmittal (Excel),
  Reprint, Re-issue… (reselects that issue's sheets) and Edit.
- **Navigator** (`domain/navTree.ts`): "Sheets (n)" grouped by place only (filed place, else the levels its
  viewports show); archived sheets hidden. Row menu: Open, Rename, Renumber, PDF, Archive.
- **Renumber** (`domain/renumber.ts`) already numbers selected sheets (start, step, padding, pick / label order).
- **Title block**: rev and date come from `revisions.at(-1)`; the revision table shows the last 5 (code, date, note).

So the issue machinery is there. What's missing: a controlled category list, the derived columns people sort by
(level, room, issue state), bulk edit, drag reorder, a re-usable package that remembers *which* sheets, what changed
since that package last went out, a cover sheet in the PDF, and per-sheet change notes.

## 1. Sheet metadata

| Field | Stored / derived | Where it comes from | Used for |
|---|---|---|---|
| **Category** | stored `kind` (id), else **derived** | project list `settings.sheetCategories`; unset → from the viewports (below) | column, group, filter, package rule, number prefix |
| **Discipline** | stored `discipline` | free text with suggestions from values in use (Dave, D2: keep) | column, group, filter |
| **Level(s)** | derived | `placeId` if it is a level; else the levels its viewports show | column, group, filter, rule; sorts by **level order** (B1, 1F, 2F), not by name |
| **Room** | derived | `placeId` if it is a space; else the server rooms of its rack-row viewports | column, group, filter, rule ("IDF1") |
| **Place** | stored `placeId`, else derived | as today | the Navigator's default grouping |
| **Number** | stored `number` | typed, Renumber, or "Renumber group" | sort, title block |
| **Print order** | stored `order` | ▲▼ or drag | PDF order, register `#` |
| **Issue state** | derived | `revisions` + fingerprint now (below) | column, filter, DRAFT stamp |
| **Current rev** | derived | `revisions.at(-1).code` | column, title block (as today) |
| **Tags** | stored `tags` | typed | group, filter, rule |
| **Status** | stored `status` | `active` / `archived` (unchanged) | hides from tree and register |

**Derived category** (when `kind` is unset), from the viewports' views: all `plan` → Plans; all `row` → Rack
elevations; all `riser` → Risers; `section` / `elevation` → Sections and elevations; no viewports,
or a mix → General. Shown in the register in grey italics with "(auto)"; setting one stores it. This means most sheets
sort sensibly with nobody typing anything.

**Category list — GLOBAL** (Dave, D1): one list for every project, stored like the blocks and device templates in a
global doc, `settings/cadSheetCategories` (`{ categories: { id, label, code?, order }[] }`), read by `CadProject`
next to `globalTemplates`. Edited in Settings → a new **Sheets** tab, marked "all projects" (add, rename, reorder;
delete refused while a sheet in *this* project uses it — other projects can't be checked cheaply, so a deleted
category is soft: `retired`, hidden from pickers, still shown where used, like retired blocks). Built-in defaults
live in code and are shown when the doc is empty: General `G`, Plans `P`, Rack elevations `RE`, Risers `R`,
Sections and elevations `S`, Schedules `SC`, Details `D`. `code` is the number prefix "Renumber group" offers.
Groups and the Navigator list categories in list `order`, not alphabetically.

**Issue state** — one derived value, no stored flag to forget:
- **Not issued** — no revisions.
- **Issued B** — fingerprint now = the last revision's `hash`.
- **Changed since B** — fingerprint differs (the next issue will make it C).
- **Superseded** — archived after being issued (it stays in old issues and reprints; the next issue of a package that
  held it lists it as withdrawn).

The fingerprint needs each sheet's display list with its floorplans placed (`previewIssue` does this today, async).
Compute it only while the Issue column is shown or a package is being issued: in idle chunks, cached per sheet and
cleared by `project.rev` (debounced ~1 s). 50 sheets ≈ a second or two of background work the first time.

**Hand-set "For review / Approved"** — later (Dave, D3).

## 2. UI

### Sheets tab (tables panel)

- Move it onto `tableKit` like the other tables: find box, scope (This view = the open sheet's level / room ·
  Selection · All), click-sort, ↑↓, Ctrl+C. Split first: the Issues view goes to `IssuesList.svelte`, the
  packages view to `PackagesList.svelte`; `SheetsTab.svelte` keeps the register (it is 216 lines now).
- Segments: **Sheets · Packages · Issues**.
- Columns: `#` · No. · Title · Category · Level · Room · Discipline · Rev · Issue state · Size · Scale · Tags ·
  Status. A column chooser (⋮ on the header row) hides the ones a project doesn't use; kept per browser.
- **Group by**: none, category, level, room, place, discipline, tag, issue state, package (a sheet in two packages
  shows under both, like tags), size. Group headers show a count; clicking one selects its rows.
- **Filter chips** after the find box: Category ▾, Level ▾, Room ▾, Issue state ▾, Tag ▾ (multi-pick each, AND
  across chips). "Save as package…" turns the current chips into a rule package (section 3).
- **Sort**: any column; "Level" sorts by level order; "No." is natural (S2 before S10).
- **Drag to reorder**: drag rows (or the selection) up / down when sorted by `#`; dropping inside a group moves only
  within the overall print order (one undo step, the existing `moveInPrintOrder` renumbering 10, 20 …). When sorted
  by anything else the drag handle is hidden and a hint says "sort by # to reorder".
- **Renumber group**: group header ⋮ → Renumber… opens the existing Renumber panel on the group's rows in print
  order, prefilled with the category code (`RE-101`, `RE-102` …). No new numbering engine.
- **Multi-select bulk edit**: with 2+ sheets selected, Properties shows **SheetMultiProps** (like
  `DeviceMultiProps`): Category, Discipline, Tags (add / remove one tag across all), Paper size + orientation,
  Drawn, Archive / Restore, Add to package ▾. A field the sheets disagree on shows "(mixed)". One undo step per edit.
- **Duplicate sheet** (from the Organising sheets entry): row ⋮ and Navigator ⋮ → Duplicate: "(copy)" title, empty
  number, right after the original in print order, with its viewports and tied notes, no revisions.

### Navigator

- The Sheets node's ⋮ gets **Group by: Place · Category · Level · Package**, remembered per project in this browser
  (like the open branches). Default stays Place. Groups follow the category list order / level order.
- Archived sheets stay hidden. A small grey rev and a dot for "Changed since issue" when the state is already
  computed (no forcing the fingerprint from the tree).
- Package grouping shows each package's sheets in the package's order; a sheet in no package sits under
  "Not in a package". No dragging in the tree in these slices.

## 3. Packages (re-usable issue sets)

A **package** is a named, saved set of sheets that gets issued again and again: "Tender set", "IDF1 rack
elevations", "As-built — all". An **issue** stays what it is now: one time a package (or a loose selection) went out.

**Members** — either:
- **a list**: sheet ids in the package's own order (drag to reorder in the package view), or
- **a rule**: the same filters as the register chips — categories, levels, rooms, tags, disciplines (AND across
  fields, OR within). "All IDF1 rack elevations" = category Rack elevations + room IDF1. New sheets that match join
  automatically; archived sheets never match. Rule packages print in register print order.
"Freeze to list" turns a rule into a list when exceptions are needed. No mixed rule + exceptions (keeps it simple).

**Fields**: name, purpose (default for its issues, from `ISSUE_PURPOSES`), recipients (lines of "name, org"), note.

**Packages view** (segment in the Sheets tab): each package with member count, last issue (number, date) and how
many members are **Changed since** / **Not issued** / **Added** / **Withdrawn** since that issue. Row actions:
Show sheets (selects them in the register), Edit, Issue…, Duplicate, Archive. New package: from the selection (list)
or from the current filter chips (rule).

**Issuing a package** — the existing IssuePanel, opened with the package:
1. The panel lists, against the package's **last issue**: *New rev* (changed or never issued: `B → C`), *As issued*
   (unchanged), *Added* (in the package now, not last time), *Withdrawn* (last time, not now: archived or removed).
2. Per changed sheet: the revision code (prefilled `nextRev`, editable — covers P01 → C01 at construction) and a
   short **description** of the change (prefilled with the purpose). "Set all to …" for the code.
3. Issue → as today: bump changed sheets (revision gets `desc` and `by` = the user's initials), freeze them, load the
   unchanged ones' frozen copies, draw one PDF, upload, record. New: the issue records `packageId` and its withdrawn
   sheets, and the PDF gets a **cover page** (below).
4. The title block's revision table shows `code · date · desc` (desc falls back to the note, so old revisions read
   as before). Status becomes "Issued C" by derivation; nothing else to set.

**Cover page / transmittal**: a generated page (the size of the package's first sheet, with the project title block — Dave, D5) drawn
as a display list like any sheet, so it goes through `pagesToPdf` and is frozen with the issue: project, issue
number, package, purpose, date, recipients, then the drawing register (No., title, rev, size, "New rev" / "As
issued" / "Withdrawn"). The Excel transmittal stays and gains the withdrawn rows and recipients.

**History**:
- per package: its issues (Issues filtered by `packageId`), each with Reprint / Transmittal as today;
- per sheet (Sheet Properties): "Issued revisions" as today, plus **Issued in**: every issue that included it, at
  which rev, new or as issued (derived by scanning `issue.sheets`, no new storage).

**DRAFT stamp** (later — Dave, D4; how it would work): any PDF that is not an issue prints "DRAFT — not issued" (Not issued)
or "DRAFT — changed since rev B" across the title block for sheets whose state is not "Issued". Issues and reprints
never carry it.

Issues made before packages keep working: they have no `packageId`. Their row gets **Make package** (a list package
from its sheets, and the issue is linked to it so the next issue diffs against it).

## 4. Data model

All entity docs live in `projects/{pid}/cadEntities/{id}` with `scope: 'project'` (the `scopeOf` default, so no
persistence change). All new fields are optional: **no migration of stored sheets is needed**.

```ts
// Sheet (domain/drawing.ts) — additions only
kind?: string            // now a category id from settings.sheetCategories (UI label "Category"); unset = derived
revisions?: { code: string; date: string; note?: string; issueId?: Id; hash?: string
	desc?: string        // what changed in this revision (title block revision table)
	by?: string }[]      // initials of who issued it

// GLOBAL (Dave, D1): settings/cadSheetCategories — like settings/cadBlocks and settings/cadDeviceTemplates
interface SheetCategory { id: string; label: string; code?: string; order: number; retired?: boolean }
// doc: { categories: SheetCategory[] }; built-in defaults in code (domain/sheetCategories.ts) when it is empty

// NEW entity (domain/drawing.ts, added to DrawingEntity)
export interface SheetPackage {
	type: 'package'
	id: Id
	name: string
	purpose?: string
	recipients?: { name: string; org?: string }[]
	note?: string
	/** exactly one of these */
	sheetIds?: Id[]          // a list, in the package's order
	rule?: SheetRule         // a saved filter
	order: number            // place in the Packages view
	archived?: boolean
}
export type SheetRule = { kinds?: string[]; levelIds?: Id[]; spaceIds?: Id[]; tags?: string[]; disciplines?: string[] }

// Issue — additions only
packageId?: Id
withdrawn?: { sheetId: Id; number: string; title: string; rev: string }[]
cover?: boolean              // the PDF has a cover page (reprint draws it again from the Issue record)
```

- **Why keep the field name `kind`**: it is already stored on sheets; renaming means a migration for a label change.
  A free-text kind that isn't in the global list shows as typed, with "Add to the category list" beside it (the list
  is global, so nothing is added to it by just opening a project).
- **Rules store ids, not names** (levels, spaces, category ids), so renaming a level or a category doesn't break a
  package. A rule pointing at a deleted level just matches nothing; the Packages view shows "level gone".
- **What a "snapshot" is (decided here, for issuing only)**: the frozen display list per (sheet, rev) in `cadIssued`
  (exists), the uploaded package PDF (exists), and the `issue` record (exists, plus the fields above). **Not** the
  model data. Why: the printed picture is what was contractually issued, it is small and immutable, reprints are
  exact, and it already works. A copy of the model per issue is what "Revert to an earlier issue" needs, but that is
  the Version history entry (L) and should be designed once there; an issue can later also record the version id it
  was taken from (one optional field) without changing anything here.
- Pure code: categories in `domain/sheetCategories.ts`, rule evaluation + "since last issue" diff in
  `domain/packages.ts`, issue-state in `domain/issue.ts`, the cover page in `views/transmittalPage.ts`.

## 5. Phasing

Each slice is useful alone. Sizes as in the backlog (S ≤ 60 lines, M 60–250, L > 250).

1. **Register split + derived columns — M (~120).** IssuesList out of SheetsTab; tableKit; Level (level order), Room,
   derived Category; group by level / room / category; filter chips. *Tests:* `sheetList.test.ts` — level-order sort,
   derived category per view mix, room from row viewports and from `placeId`, chips AND / OR.
2. **Category list (global) — M (~130).** `settings/cadSheetCategories` + built-in defaults, Settings → Sheets tab
   ("all projects"), "Add to the category list" for a typed kind, retire instead of delete, category order in groups.
   *Tests:* `sheetCategories.test.ts` (defaults when empty, add from a typed kind, slug clash, retired hidden from
   pickers but shown where used).
3. **Bulk edit, duplicate, renumber group — M (~180).** SheetMultiProps; group-header select; Renumber prefilled
   with the category code; Duplicate sheet. *Tests:* duplicate keeps viewports / notes, drops revisions and number;
   multi-edit "(mixed)" helper.
4. **Drag reorder + Navigator group-by — M (~120).** Drag in the register when sorted by `#`; Sheets node Group by
   Place / Category / Level. *Tests:* `moveInPrintOrder` with a drop index; `navTree.test.ts` grouping modes.
5. **Issue state — M (~100).** Background fingerprints with cache; column, chip, Navigator dot. (The DRAFT stamp is
   later — Dave, D4.) *Tests:* `issueState()` for each of the four states.
6. **Packages — L (~260).** `SheetPackage` entity, validation, Packages view, new from selection / from chips,
   rule evaluation, Issue… from a package, `issue.packageId`, Make package from an old issue, Navigator group by
   Package. *Tests:* `packages.test.ts` — rule matching (each field, ids not names, archived excluded), list order,
   freeze-to-list.
7. **Re-issue diff + change notes — M (~150).** Added / Withdrawn / New rev / As issued against the package's last
   issue; editable rev code per row; `desc` / `by` on revisions; revision table shows desc. *Tests:*
   `diffSinceLastIssue` (added, withdrawn via archive and via removal, unchanged), `planIssue` with a code override.
8. **Cover page + transmittal — M (~150).** `views/transmittalPage.ts` display list, on the package's first sheet's
   paper size with the project title block (Dave, D5), first page of the PDF and of reprints; recipients from the
   package (D8); Excel gains withdrawn + recipients. *Tests:* page rows and order, long registers flow onto a 2nd page.
9. **History — S (~60).** Package → its issues; Sheet Properties → Issued in. *Tests:* `issuesOfSheet`.

Rough total ~1,300 lines over 9 slices. Order suggestion: 1 → 2 → 6 → 7 → 8 (that is "sort by category" and
"re-usable packages" end to end), then 3, 4, 5, 9 as polish. Live-check each slice in the browser on Journey
(issue to a throwaway package; issue writes are real Firestore + UploadThing writes).

## Left for later

- **For review / Approved workflow** (Dave, D3: later) and the **Issue gate** (needs the version model ADR).
- **DRAFT stamp** on non-issue PDFs (Dave, D4: later) — slice 5's issue state gives it for ~40 lines when wanted.
- **Version history / Revert to an earlier issue** — model snapshots; an issue can point at one later.
- Typed packages with codes (`TYPE-001`), superseding a whole package, package draft / published states.
- Copy / paste a sheet into another project; dragging sheets in the Navigator; nested groups (Level › Category).
- Sending the package (email / share link); the PM's all-issues register (its own backlog entry).
- Sheet-number templates (`{CAT}-{LVL}{NN}`) beyond "Renumber group" with a prefix.

## 6. Decisions (Dave, 2026-10-07)

- **D1 Category list:** **global** — one list for all projects (`settings/cadSheetCategories`), built-in defaults.
- **D2 Discipline:** keep (free text with suggestions, column hidden by default).
- **D3 For review / Approved:** later.
- **D4 DRAFT label:** later.
- **D5 Cover page:** the same size as the package's first sheet, with the project title block.
- **D6 Package members:** either a list or a rule, with "Freeze to list".
- **D7 Revision codes:** try (a) first — type the code per sheet / "Set all to…" in the Issue panel.
- **D8 Recipients:** a list on the package (name, org), printed on the cover and the transmittal.
- **D9 Old issues without a package:** offer "Make package" on each.

<details><summary>The questions as asked</summary>

- [ ] **D1 Category list: fixed or per project?** Options: (a) a fixed cad list; (b) a project list seeded with
  defaults, edited in Settings (like usages); (c) free text as today. *Suggest:* (b) — projects differ (some have
  Details, some Schedules), and a controlled list is what makes grouping and package rules reliable.
- [ ] **D2 Discipline: keep it?** Most cad projects are one trade (ICT). Options: (a) keep free text with
  suggestions, hidden column by default; (b) a project list like categories; (c) drop it. *Suggest:* (a) — no cost,
  and it matters on mixed-trade jobs.
- [ ] **D3 "For review / Approved" on sheets?** Options: (a) not now — issue state is derived (Not issued / Issued /
  Changed since / Superseded); (b) a hand-set review flag per sheet, shown and filterable, not blocking; (c) a flag
  that blocks Issue until approved. *Suggest:* (a), then (b) together with the Issue gate once versions exist.
- [ ] **D4 DRAFT label** (the open decision): (a) a per-sheet flag; (b) automatic on any non-issue PDF of a sheet
  not in state "Issued"; (c) none. *Suggest:* (b) — the issue state from slice 5 gives it for free.
- [ ] **D5 Cover page size and content.** Options: (a) A4 portrait register page; (b) same size as the package's
  first sheet with the project title block; (c) no cover, Excel only. *Suggest:* (b) — it prints and binds with the
  set and looks like part of it; (a) as a setting later if clients ask.
- [ ] **D6 Package members: list, rule, or both?** Options: (a) list only; (b) rule only; (c) either, with "freeze
  to list". *Suggest:* (c) — "all IDF1 rack elevations" should pick up a new IDF1 sheet without anyone remembering.
- [ ] **D7 Revision codes across purposes** (P01 tender → C01 construction). Options: (a) type the code per sheet /
  "set all" in the Issue panel; (b) a revision series per package (`P`, `C`) that `nextRev` follows; (c) both.
  *Suggest:* (a) now (~20 lines, the backlog's slice 1); (b) only if it gets tedious.
- [ ] **D8 Recipients**: (a) free text "to" as now; (b) a list on the package (name, org), printed on the cover and
  transmittal; (c) a project-wide contacts list picked per package. *Suggest:* (b); (c) when a second tool needs
  contacts.
- [ ] **D9 Old issues without a package** — (a) leave them loose; (b) offer "Make package" per issue; (c) auto-make a
  package per distinct issue name. *Suggest:* (b) — explicit, and the next issue diffs against it.

</details>
