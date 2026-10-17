# Design log — sketch (decisions 2026-10-17)

User 2026-10-17: *"We often have to search old versions / notes / emails to figure out why or when or who requested
some change."* One place that answers **what changed, why, who asked, when, and in which release**. Backlog: "Design
log — why, when and who asked". Decisions from the User's review are marked ✔.

## What there is today

- **A sheet's change notes** — Properties › Changes since last release: date · what · asked by (`Sheet.changes`,
  `SheetChange`). At a release they move onto that revision (`revisions[].changes`) and fill the Release panel's
  "What changed".
- **Revision clouds** — a cloud carries a revision letter; its triangle shows it (no letter = no triangle).
- **Backups** — named snapshots with who / when / a note (`BackupHead`).
- **Undo steps** — every edit has a readable label ("Patch R02 · SW1 : 39 → R05 · SW2 : 10") but only in this tab's
  undo stack. Nothing records who edited what.

## The idea in one line

**One kind of record — a change — that clouds, sheets and items point at**, listed in a Log table and in a change list
on the package's sheet; plus an optional edit history kept beside it.

## 1. Changes

A `change` entity in the project store (synced, undoable like everything else). Fields as first proposed ✔ (the User:
what / who / date would do, but try these to see how it looks):

| field | |
|---|---|
| `n` | its number within the current major revision: **1, 2, 3 …** ✔ — it continues through the minor versions (Rev A had 1–5, A.1 adds 6, 7) ✔ and restarts at 1 after the next major release ✔ |
| `cycle` | the major revision it goes out in (A, B …) — with `n` the log reads "Rev A · 3" |
| `date` | when it was asked for (defaults to today) |
| `what` | one line ("Move outlets 1-004…1-006 to the east wall") |
| `why` | optional, longer |
| `asked` | free text, names already used offered as you type ✔ |
| `ref` | where it came from: email · meeting · RFI · phone · site · other + text (subject, RFI no.) — a reference only, no attachments for now ✔ |
| `links` | the items and sheets it's about |
| `status` | open · done · rejected · superseded — rejected / superseded stay in the Log, greyed ✔ |
| `by` / `at` | who entered it, when (filled in) |
| `released` | the version it went out in (A, A.1 …) and on which sheets |

**Where you see it**

- **Tables › Log** (bottom panel, after Sheets): Rev · No · Date · What · Asked · Ref · Items · Sheets · Version ·
  Status · By. Search, filters (person, status, sheet, revision); a row's click shows its items; double-click edits;
  Excel export.
- **The package's change list** ✔ — a viewport on one sheet of the package (as the User does now): every change of
  this package since the last major release, with the version each went out in ✔; it starts empty again after the
  next major release. The clouds' numbers refer to it.
- **A sheet's Properties › Changes** — the open changes linked to that sheet; adding one there links it to the sheet
  (today's notes, same place).
- **An item's Properties › Changes (n)** — the changes that name it. **+ Note** creates a change with that item in its
  links: it shows on the item and in the Log, and reaches a sheet / the package list only when you link it there (or
  draw a cloud for it) ✔ — nothing lands on a submittal unexpectedly.
- **Selection › Log a change…** — one change linked to everything selected.

Existing sheet notes become changes once (linked to their sheet; released ones keep their revision).

## 2. Clouds

A cloud points at a change: its Properties lists this revision's changes (+ new); picking one sets the cloud's
number. **The triangle shows just the number, "3"** ✔ (the letter is in the title block). Several clouds can point at
one change. After a major release the clouds are usually deleted or moved to a hidden layer and numbering restarts
from 1 — a "Clear clouds after release" choice in the release dialog (delete / move to a layer) does it in one step.
No change → no triangle, as today (deleting the letter hides it).

## 3. Revisions and versions in the title block

- The title block's revision part shows **only the revision and its date** ✔ — no description / notes (those are in
  the package's change list).
- **Major revision** A, B … = a big submittal; **minor version** A.1, A.2 … = a small update to the sheet after it ✔.
- **Bump version** in the Save as PDF / release dialogs ✔: offered when the sheet has changed since its last PDF —
  A → A.1, A.1 → A.2. A major release (A → B) stays the Release… dialog's job.

## 4. Edit history (optional)

- **A project toggle, off by default** ✔ — turn it on after the first major release.
- Every settled local edit is written once, append-only, to its own collection (`cadHistory/{pid}/steps`), not the
  store: `{ at, by: { uid, name }, label, ids (capped), n }`. Everyone on the project can read it ✔.
- **Settings shows its size** (entries, rough storage) and **Delete history older than…** ✔ — watch storage and speed.
- An item's Properties › History ("2026-10-17 14:02 · User · Move rack R03"); Project › History… for the whole list.
- Later: **"Working on Rev A · 3"** — a status-bar chip; while it's on, edits are tagged with that change (why as well
  as who / when).

## Phases

1. **Changes + Log tab + item / sheet links** — **M** — BUILT 2026-10-17 (`domain/changes.ts`, `ui/LogTable.svelte`, `ui/ChangesSection.svelte`, `ui/ChangeProps.svelte`; a release records them). Old sheet notes are NOT moved: they stay as "Earlier notes" and release as before (no write to existing projects).
2. **Clouds point at changes**, numbering per major revision, the package's change list (a legend-like shape — BUILT 2026-10-17: `views/changeList.ts`, the Change list tool, a cloud's Change, the Release form's "Number changes from 1 again" and Clouds keep / delete), "Clear clouds
   after release" — **M**.
3. **Title block revision + minor versions + Bump version** — **S–M**.
4. **Edit history** (toggle, size, trim) + item History + Project › History — **M**.
5. "Working on" tag — **S**. Later, with outside review: a reviewer's markups arrive as changes asked by them.

## Still open

- Packages and revisions: is a revision the PACKAGE's (every sheet in it goes A → B together) or each sheet's? The
  sheets carry their own revisions today; the change list is per package.
- The change list: columns No and What (User 2026-10-17). Whether it can run over two sheets.
