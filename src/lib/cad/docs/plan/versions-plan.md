# Versions, file backup and restore — implementation plan

The design is ADR 0008 (`../adr/0008-version-model.md`). Built in seven slices, each committed and checked live
on Test Project (restores there are undone, test versions deleted). About 1,100 lines with tests.

The order puts the risky core first (what a part holds, what a restore changes) as pure, tested code, then the
file round trip (useful on its own, and the cheapest way to exercise restore), then the multi-user notice, and only
then the stored versions and the issue hook.

## Slice 1 — Parts and snapshots (pure) · ~200 lines + tests

- `domain/versionParts.ts`:
  - `type Parts = 'all' | Id[]` (level ids — a model each, ADR §2)
  - `inParts(ix, parts): { inside: Set<Id>; crossing: Map<Id, 'a' | 'b'> }` — the entities the models hold (ADR §2
    table): each level, its spaces, outlets, underlays, level shapes, sections, racks, rows, devices, cords; links
    with an end inside, crossing ones marked with the end that is outside.
  - `floorsOf(ix)` — the picker's tree: floors (`buildingId` + `number`) with their models.
  - `partsLabel(ix, parts)` — "33F 3303 + 32F" for names and file names; a whole floor reads "33F".
- `domain/snapshot.ts`: `Snapshot = { format: 'eos-cad'; schema: 1; projectId; projectName; at; by; parts;
  entities: Entity[]; library?: { blocks; deviceTemplates } }`; `makeSnapshot(...)`, `parseSnapshot(json)` (checks
  format / schema, gives a readable error).
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
- Tests: unchanged project → empty plan; a moved outlet comes back; a new rack is removed; a deleted cord comes
  back; a crossing link to a now-busy port is skipped; a whole-project plan keeps issues and revisions.

## Slice 3 — Collect and apply (app) · ~150 lines

- `app/snapshotIo.ts`:
  - `collect(project, parts)` — waits for `pendingWrites === 0`, reads the project scope + each chosen model's scope
    from Firestore (`getDocs` with `where('scope', '==', …)`), strips meta (`fromDoc`), filters with `inParts`,
    adds the used blocks / templates as `library`.
  - `applyRestore(project, snap, parts)` — loads the chosen models, builds the plan, applies it in ONE
    `store.transact('Restore …')`, adds missing library items, returns the summary.
  - chunk / unchunk JSON (moved out of `app/issue.ts`, shared with `cadIssued`).
- Unit tests for chunking; the rest is checked live.

## Slice 4 — Download / restore as a file (UI) · ~170 lines

- File menu: **Download project…** and **Restore from file…** (`ui/cadMenus.ts`).
- `ui/PartsPicker.svelte` — Whole project, or a tree of floors with their models (checkboxes; ticking a floor
  ticks its models). Shared by download, save version and restore.
- Download: gzip with `CompressionStream`, name `<project> <parts> <yyyy-mm-dd hhmm>.eoscad`.
- Restore from file: open → parse → show project / date / parts → pick parts → preview (slice 2 summary) with "Save
  the current state first" → restore (slice 3), behind the notice (slice 5; until it lands, a confirm only).
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

## Slice 6 — Stored versions · ~200 lines

- `app/versions.ts`: `saveVersion(project, name, note, parts)` (collect → chunks under `cadVersions/{id}`),
  `listVersions` (heads, newest first), `loadVersion`, `renameVersion`, `deleteVersion` (refused for one an issue
  points at).
- `ui/VersionsWindow.svelte` (Project › Versions…): the list — name, date, by, parts, count, issue — with **Save
  version…**, and per row Restore…, Download, Rename, Delete. Restore goes through the same picker, preview and
  notice (a version's parts can be narrowed: restore only "33F 3303" from a 33F version).
- Help: "Save and restore versions".
- Live: save a 1F version, change 1F, restore it, Undo; delete the test version.

## Slice 7 — Issues · ~60 lines

- Issuing first saves a whole-project version "Issue NN: <name>" and records `Issue.versionId`
  (`domain/drawing.ts` Issue, `app/issue.ts`).
- Issues list: **Revert to this issue…** (greyed when the issue has no version) → the restore flow with the version.
- Backlog: closes "Version history", "Revert to an earlier issue" and "Issue gate" (ADR §7).
- Live: issue a test package, revert one model to it, Undo; delete the test issue's version only if Dave agrees.

## Not in this plan

- Firestore scheduled backups / point-in-time recovery: Dave sets them up in the Firebase console.
- Copying a project from a file (a new project id), restoring one sheet's paper, and rooms as parts — later, if
  asked.
- A change log (who changed what, when): a separate decision.
