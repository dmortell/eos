# Backups, file download and restore — implementation plan

**Built 2026-10-08** — all seven slices; the log is `../phases/phase8.md` "Backups".

The design is ADR 0008 (`../adr/0008-backups.md`). Built in seven slices, each committed and checked live on Test
Project (restores there are undone, test backups deleted). About 1,150 lines with tests.

The order puts the risky core first (what a part holds, what a restore changes) as pure, tested code, then the
file round trip (useful on its own, and the cheapest way to exercise restore), then the multi-user notice, and only
then the stored backups and the issue tick.

## Slice 1 — Parts and snapshots (pure) · ~200 lines + tests

- `domain/backupParts.ts`:
  - `type Parts = 'all' | Id[]` (level ids — a model each, ADR §2)
  - `inParts(ix, parts): { inside: Set<Id>; crossing: Map<Id, 'a' | 'b'> }` — the entities the models hold (ADR §2
    table): each level, its spaces, outlets, underlays, level shapes, sections, racks, rows, devices, cords; links
    with an end inside, crossing ones marked with the end that is outside.
  - `floorsOf(ix)` — the picker's tree: floors (`buildingId` + `number`) with their models.
  - `partsLabel(ix, parts)` — "33F 3303 + 32F" for names and file names; a whole floor reads "33F".
- `persist/file.ts` (the existing `eos-cad` whole-project file) gains `by`, `parts` and `library: { blocks }`;
  `makeBackup(entities, parts, …)` and `usedBlocks`; `readProjectFile` checks `parts` and doesn't report a crossing
  link's outside end as an error.
- Tests: a model holds its outlets / racks / devices / cords, not another model's (an area level's racks stay with
  it); a link from an outlet in one area level to a panel in the other is inside when both are chosen, crossing when
  one is; 'all' holds everything; parse rejects a non-cad file.

## Slice 2 — Restore plan (pure) · ~180 lines + tests

- `domain/restorePlan.ts`: `restorePlan(ix, snap, parts): { put: Entity[]; del: Id[]; skipped: { id; why }[];
  counts: { changed; added; removed; skipped } }`
  - live entities inside the parts that differ from the snapshot → put; inside but not in the snapshot → del;
    in the snapshot but not live → put (they come back)
  - crossing links: back only when the outside end exists and its port is free, else skipped ("port in use",
    "the outlet is gone"); live crossing links not in the snapshot → del, listed
  - project-wide records only for 'all'; issues and sheets' `revisions[]` always kept live (ADR §4)
- `restoreSummary(plan, ix)` — the preview lines ("33F 3303: 214 changed, 12 added back, 30 removed; 3 links to
  33F 3307 skipped (port in use)").
- `canRestore(project, uid)` — the owner, or anyone when the project has no `ownerId` (ADR §4).
- Tests: unchanged project → empty plan; a moved outlet comes back; a new rack is removed; a deleted cord comes
  back; a crossing link to a now-busy port is skipped; a whole-project plan keeps issues and revisions; canRestore.

## Slice 3 — Collect and apply (app) · ~160 lines

- `app/snapshotIo.ts`:
  - `collect(project, parts)` — waits for the chosen models' scopes to load and `pendingWrites === 0`, then
    `makeBackup` from the store (every level's data loads with the project).
  - `applyRestore(project, snap, parts)` — refuses unless `canRestore`; loads the chosen models, builds the plan,
    applies it in ONE `store.transact('Restore …')`, adds missing library items, returns the summary.
  - chunk / unchunk JSON (moved out of `app/issue.ts`, shared with `cadIssued`).
- The project's `ownerId` reaches the cad project (read with the project doc CadShell already loads).
- Unit tests for chunking; the rest is checked live.

## Slice 4 — Download / restore as a file (UI) · ~170 lines

- File menu: **Download backup…** and **Restore from file…** (`ui/cadMenus.ts`); Restore from file greyed with the
  reason for a non-owner.
- `ui/PartsPicker.svelte` — Whole project, or a tree of floors with their models (checkboxes; ticking a floor
  ticks its models). Shared by download, Back up now and restore.
- Download: gzip with `CompressionStream`, name `<project> <parts> <yyyy-mm-dd hhmm>.eoscad`.
- Restore from file: open → parse → show project / date / parts → pick parts → preview (slice 2 summary) with "Back
  up the current state first" → restore (slice 3), behind the notice (slice 5; until it lands, a confirm only).
- A file from another project is refused ("This file is from <name>").
- Help: "Back up a project to a file / restore it".
- Live: download 1F, change something on 1F, restore 1F from the file → back; Undo → the change again (then undone).

## Slice 5 — The restore notice (multi-user) · ~170 lines

- `app/restoreNotice.ts`: the doc `projects/{pid}/cadMeta/restore`; `announce(parts, what)` → pending with
  `startsAt` = now + 30 s; `start()` → running; `finish(summary)` → done; `cancel()`; abandoned after 10 min.
- `ui/RestoreNotice.svelte` (in CadShell): the countdown popup for others; Cancel for the person restoring; the
  "running" banner; the "done" banner until dismissed.
- Store: `store.readOnly` (a reason string) — `transact` refuses and says why; set while another session's restore
  runs. Other sessions clear their undo history on done.
- A second restore while one is pending / running is refused with who and what.
- Live: two tabs on Test Project — tab A restores 1F from a file, tab B sees the countdown, the read-only banner and
  the done banner; tab B's edit during running is refused.

## Slice 6 — Stored backups · ~230 lines

- `app/backups.ts`: `makeBackup(project, name, note, parts)` (collect → chunks under `cadBackups/{id}`),
  `listBackups` (heads, newest first), `loadBackup`, `renameBackup`, `deleteBackups(ids)` (chunks and head; clears
  `Issue.backupId` on an issue that points at one).
- `ui/BackupsWindow.svelte` (Project › Backups…): the list — name, date, by, parts, count, size, issue — with the
  project's total size, sort by date or size, **Back up now…**, and per row Restore… (owner), Download, Rename,
  Delete (its maker or the owner); tick several to delete them at once. Restore goes through the same picker,
  preview and notice (a backup's parts can be narrowed: restore only "33F 3303" from a 33F backup).
- Help: "Back up and restore models".
- Live: back up 1F, change 1F, restore it, Undo; delete the test backup.

## Slice 7 — Issues · ~70 lines

- Issue dialog: **Back up the project with this issue**, unticked, with the size warning (ADR §7). Ticked, issuing
  first makes a whole-project backup "Issue NN: <name>" and records `Issue.backupId` (`domain/drawing.ts` Issue,
  `app/issue.ts`).
- Issues list: **Restore this issue's backup…** on an issue that has one (owner only) → the restore flow.
- Backlog: closes "Backups and restoring an issue's backup".
- Live: issue a test package with the tick, restore one model from it, Undo; delete the test backup.

## Not in this plan

- Firestore scheduled backups / point-in-time recovery: Dave sets them up in the Firebase console.
- Copying a project from a file (a new project id), restoring one sheet's paper, and rooms as parts — later, if
  asked.
- Checking ownership anywhere else in the app (the projects list still lets anyone edit settings).
- A change log (who changed what, when): a separate decision.
