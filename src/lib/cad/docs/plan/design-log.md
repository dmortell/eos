# Design log — sketch (for review)

User 2026-10-17: *"I often have to search old versions / notes / emails to figure out why or when or who requested
some change."* This sketches one place that answers **what changed, why, who asked, when, and in which release**, for
the User to review before anything is built. Backlog: "Design log — why, when and who asked".

## What there is today

- **A sheet's change notes** — Properties › Changes since last release: date · what · asked by (`Sheet.changes`,
  `SheetChange`). At a release they move onto that revision (`revisions[].changes`), fill the Release panel's
  "What changed" and the title block's revision table.
- **Revision clouds** — a cloud carries a revision letter; its triangle shows it (no letter = no triangle).
- **Backups** — named snapshots with who / when / a note (`BackupHead`).
- **Undo steps** — every edit already has a readable label ("Patch R02 · SW1 : 39 → R05 · SW2 : 10", "Move 3
  outlets") but it lives only in this tab's undo stack and is gone on reload. Nothing records who edited what.

Missing: a project-wide list, notes on items (an outlet, a rack, a cord), the link from a cloud to the reason for it,
and an edit history.

## The idea in one line

**One kind of record — a change — that sheets, clouds and items point at**, listed in a Log table; plus an automatic
edit history kept beside it.

## 1. Changes (the log)

A `change` entity in the project store (synced, undoable like everything else):

| field | |
|---|---|
| `no` | running number in the project, never reused: **C-001, C-002 …** |
| `date` | when it was asked for (defaults to today) |
| `what` | the change, one line ("Move outlets 1-004…1-006 to the east wall") |
| `why` | optional, longer ("Client moved the reception desk") |
| `asked` | who asked — free text (client, consultant, site) |
| `ref` | where it came from: kind (email · meeting · RFI · phone · site · other) + text (the email's subject, RFI no., minutes item) |
| `links` | the items, sheets and levels it's about |
| `status` | open · done · rejected · superseded (by another change) |
| `by` / `at` | who entered it, when (filled in, not typed) |
| `released` | filled at each release: the sheets and revision it went out in (`S003 rev B`) |

**Where you see it**

- **Tables › Log** (bottom panel, a tab after Sheets): No · Date · What · Asked · Ref · Items · Sheets · Released ·
  Status · By. Search over every column, filter by person / status / sheet / level; a row's click selects and shows
  its items (as the Outlets table does); double-click edits; Excel export.
- **A sheet's Properties › Changes since last release** becomes a view of the log: the open changes linked to this
  sheet. Adding one there makes a change linked to the sheet (today's notes, same place, same keys). At release the
  change gets `released` and the revision table lists it — as now.
- **Any item's Properties › Changes (n)**: the changes linked to it, newest first; **+ Note** makes one already
  linked to it (and to the sheets showing it? — question 3).
- **Selection › Log a change…**: one change linked to everything selected.

Existing sheet notes are moved into changes once (each linked to its sheet; released ones keep their revision).

## 2. Clouds point at a change (the User's idea)

A cloud gets a **change** instead of (or as well as) a free revision letter: its Properties lists the open changes
(+ new) — pick one and the cloud's tag shows its number. Several clouds can point at one change. At release the
title block's table reads "B — C-012, C-014 …" and the Log shows which clouds / sheets each went out on.

What the triangle shows is question 1: the **project number** (C-012, stable forever, the same on every sheet and
in emails) or a **number within the revision** ("B3" — Rev B change 3, short, but it changes meaning per revision).
Proposal: store the project number, let the tag show either (a project setting).

## 3. Edit history (automatic)

Every settled local edit (the store's committed step) is written once, append-only, to its own Firestore collection
beside the project (`cadHistory/{pid}/steps`) — not to the store, so it never undoes or syncs back:
`{ at, by: { uid, name }, label, ids (the entities it touched, capped), n }`.

- **An item's Properties › History**: the edits that touched it — "2026-10-17 14:02 · User · Move rack R03".
- **Project › History…**: the whole list, filtered by person / day / level, with the backup taken before each day.
- **"Working on C-012"** (a chip in the status bar, set from the Log): while it's on, edits are tagged with that
  change, so an item's history answers *why* as well as *who / when*.

Cost: one small write per edit (a drag is one), read only when someone opens a history. Keep a year (a setting)?

## Phases (if the User agrees)

1. **Changes + Log tab + item / sheet links**, sheet notes moved in — **M**.
2. **Clouds point at changes**; the revision table lists them — **S–M**.
3. **Edit history** + item History + Project › History — **M**.
4. **"Working on"** tag — **S**.
5. Later, with outside review (backlog): a reviewer's markup arrives as changes asked by them.

## Questions for the User

1. A cloud's tag: the project number (C-012) or the number within the revision (B3)?
2. Is "asked by" free text enough, or a list of people / companies kept in the project (consistent names, filters)?
3. A note on an item: should it also show on the sheets that item is on (open changes) — or only on the sheets you
   link?
4. Should rejected / superseded changes stay visible in the Log by default, or be filtered off?
5. Edit history: who may read it (everyone on the project)? And how long to keep it?
6. Attachments — paste an email's text or a screenshot into a change, or just the reference?
