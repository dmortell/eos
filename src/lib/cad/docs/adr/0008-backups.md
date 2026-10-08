# ADR 0008: Backups of chosen models; restore is announced to everyone

**Status:** Accepted and built 2026-10-08 (`../phases/phase8.md` "Backups") — Dave 2026-10-07 / 08: "essentially a database backup and restore of the models", with
backups of a selection of models (33F only, or 3303 and 3307 only), a download / restore as a file, and a warning
to the other users before a restore. Called **backups**, not versions (Dave 2026-10-08): it says what they are to a
new user and doesn't clash with sheet revisions or the legacy drawing versions (`types/versioning.ts`). Dave's
answers to the open questions are folded in (§4, §6, §7, §8). The plan is `../plan/backups-plan.md`.

## Context

- **What cad keeps today:** sheet revisions made by issuing (`domain/issue.ts`, `app/issue.ts`). Each changed
  sheet gets the next code and a `revisions[]` entry, and what it printed is frozen in `projects/{pid}/cadIssued`
  (a display list, chunked at 300k characters). That reprints any issue, but cannot bring the model back.
- **What Dave wants:** a backup and restore of the model data, for chosen models (33F only, or 3303 and 3307 only),
  plus a copy kept as a file. In cad a model is a LEVEL: Journey's 33F is two of them, "33F 3303" and "33F 3307"
  (`Level.area`, each with its own plan, racks and elevations — decisions.md "Zones on one floor"). A restore is a
  big deal: it changes the project for everyone working in it, so they must be warned before it happens.
- **Firestore's own tools** (managed export / import, scheduled backups, point-in-time recovery) work on the whole
  database, need admin access from a server or gcloud, and can't pick out one project, let alone one floor. An
  import also leaves newer docs in place. They are the safety net for disaster recovery, set up by Dave in the
  Firebase console — not an app feature, and not part of this ADR.

## Decision

### 1. Two kinds of history

- **Sheet revisions — what went out.** Made only by issuing, immutable, already built. Unchanged by this ADR.
- **Backups — what the data was.** A copy of the model data of chosen PARTS of the project, taken at a moment,
  that can be restored. No numbers (no 1.1 / 2.0): a backup has a name, a note and a date. The live project is
  always the working copy.

### 2. Parts: what a backup (or a file) can hold

A backup holds the **whole project** or a set of **models** (levels):

| Part | What it holds |
|---|---|
| **Model** (a `level`, e.g. "33F 3303") | the level itself; on it: spaces (rooms, server rooms), outlets, underlays, plan shapes (`shape.levelId`), section cuts; racks standing on it (`rack.levelId`), their rack rows, the devices in them and the cords between their ports; links with an end on it |
| **Whole project** | every `cadEntities` doc: all models, plus project-wide records — settings, layers, buildings, views, sheets (with their paper shapes), packages, issues |

- The picker groups models by floor (`buildingId` + `number`): ticking **33F** ticks "33F 3303" and "33F 3307";
  each can be ticked alone. Any set works ("33F 3303 + 32F").
- **Links that cross the edge** (an outlet in 3307 served from a panel in 3303's server room; backbone between
  floors) are stored with the backup when either end is in it, with a note of which end is outside.
- Models only: a room alone (one server room's racks) is not a part (Dave 2026-10-08: "models only for now").
- Project-wide records (sheets, views, layers, settings, issues) are only in whole-project backups. Restoring a
  part never changes a sheet; a sheet that shows the part just shows the restored data.
- **Never in a backup or a file:** the global libraries (`settings/cadBlocks`, `cadDeviceTemplates`,
  `cadSheetCategories`) — a file carries a copy of the blocks it draws (§5; devices copy a template's data, so templates aren't needed); the frozen
  issue copies (`cadIssued`) and uploaded files (`files/{id}`) — kept by id; workspace state (localStorage); undo
  history; the legacy tools' docs.

### 3. Where backups are stored

- A head doc `projects/{pid}/cadBackups/{backupId}`: `name`, `note?`, `by` (uid + name), `at`, `parts`
  (`'all'` or a list of `{ levelId, name }`), `count`, `bytes`, `chunks`, `issueId?`.
- The data in `projects/{pid}/cadBackups/{backupId}/chunks/{n}`: the same JSON as a file (§5), chunked at 300k
  characters, sharing the code with `cadIssued`. The list reads heads only.
- **Taken from the store**, which holds every model once its level's data has loaded (`CadProject.#watchLevels`
  watches every level): making one waits for the chosen models' scopes to load and for `pendingWrites` to reach 0,
  so the store matches the server and the user's own last edit is in it. Entities are stored without `rev` / `updatedAt` / `updatedBy` / `client` /
  `scope`.
- Backups never change: they can be renamed, have their note edited, or be deleted (§8).

### 4. Restore

- **What it does:** for the parts restored, every live entity in them is replaced by the backup's copy, entities
  added since are deleted, and deleted ones come back — all as ONE undo step (`store.transact`), so sync, echoes and
  colleagues' listeners work as for any edit. First every chosen model is loaded, so the store holds what it changes.
- **The edge:** a link that crosses the edge comes back only if its outside end still exists and that port is free;
  otherwise it is skipped and listed. A live crossing link not in the backup is deleted (its outlet or panel
  outside is then free) and listed.
- **A preview first:** the confirm dialog shows what will change — "33F 3303: 214 changed, 12 added back, 30
  removed; 3 links to 33F 3307 skipped (port in use)" — with **Back up the current state first** ticked (a backup
  named "Before restore — …"), then **Restore** / **Cancel**.
- **History is kept:** issues and each sheet's `revisions[]` are never rolled back (a whole-project restore keeps the
  live ones). A restored sheet that now differs from its last issue shows "Changed since", which is true.
- **Only the project owner restores** (`projects/{pid}.ownerId`; Dave 2026-10-08), from a stored backup or a file.
  Others see Restore greyed: "Only <owner> can restore this project". A project with no `ownerId` (older ones) lets
  anyone who can edit restore, and the dialog says so. Making and downloading backups is open to anyone who can
  edit.

### 5. As a file: download and restore

- **File › Download backup…** asks which parts (whole project by default) and saves
  `<project> <parts> <yyyy-mm-dd hhmm>.eoscad` — gzipped JSON:
  `{ format: 'eos-cad', version: 1, exportedAt, project: { id, name }, by, parts?, entities: [...], library?: { blocks } }`
  (`persist/file.ts`, which already had the whole-project format; `parts` absent = the whole project).
  A big floor is about 1–2 MB of JSON before gzip.
- **File › Restore from file…** reads one, shows its project, date and parts, lets the owner pick which of its parts
  to restore, and goes through the same preview and notice as a stored backup (§4, §6).
  - **Only into the same project** (`projectId` must match) for now. Copying a project from a file is later.
  - Missing global blocks are added from `library`; existing ones are never overwritten.
- **Download** on a stored backup gives the same file; a file and a stored backup are interchangeable.

### 6. Everyone is told before a restore

- A notice doc `projects/{pid}/cadMeta/restore`: `{ state: 'pending' | 'running' | 'done' | 'cancelled', by, what
  (the backup or file name), parts, startsAt, at, summary? }`. Every open cad session of the project listens to it.
- **Pending (30 s):** everyone else sees a popup with a countdown: "Dave will restore 33F to 'Issue 03' in 25 s.
  Changes you make there until then will be lost." The person restoring can cancel; nobody else can block it
  (Dave 2026-10-08: ok).
- **Running:** editing is off in every session (the store refuses writes, a banner says why). Reading still works.
- **Done:** "33F was restored to 'Issue 03' by Dave at 14:02" — a banner until dismissed. Other sessions clear their
  undo history (their steps would fight the restore). The person restoring keeps one undo step: Undo restore.
- **Only one at a time:** a pending or running notice blocks a second restore. A notice older than 10 minutes and
  not done counts as abandoned (the tab closed), and the next restore may replace it.
- The notice is advisory (cad has no server to enforce it), which is enough for a team that is told.

### 7. Issues

- **Issuing does not back up by itself** (Dave 2026-10-08: projects issue often, and a copy per issue would eat
  storage). The Issue dialog has **Back up the project with this issue**, unticked, with the warning "A full copy of
  the project (about 1.4 MB). Tick it only for an issue you may need to go back to." Ticked, it makes a
  whole-project backup "Issue 03: <issue name>" and records it as `Issue.backupId`.
- The Issues list offers **Restore this issue's backup…** on an issue that has one (whole or chosen parts, owner
  only). Other issues can be reprinted, not restored.
- The old "Issue gate" is not built: the tick is the gate, by choice.

### 8. Cleaning up

- Backups are kept until someone deletes them (Dave 2026-10-08) — no automatic clean-up.
- The Backups window shows each backup's size and the project's total, newest first, and can sort by size.
  **Delete** (after a confirm; not undoable) is open to whoever made the backup and to the owner; several can be
  ticked and deleted at once. Deleting a backup an issue points at clears `Issue.backupId` (the issue can still be
  reprinted).

## Consequences

- **Firestore cost:** a backup reads the project scope plus the chosen models once, and writes a few chunks; a
  restore reads the chunks and writes only what differs. Opening a project reads nothing extra (one listener on the
  notice doc). Storage grows only with backups people choose to make, and the size column shows where it went.
- **The store, sync and undo don't change**; restore is an ordinary (large) transaction. The store gains a
  read-only switch for the running restore.
- **Partial restores keep the blast radius small:** restoring "33F 3303" touches only that model; the report says
  which outlets or panels in other models lose a link.
- **Owner-only restore depends on `ownerId`**, which new projects get but the projects list doesn't check yet
  (`routes/projects/ProjectSettingsDialog.svelte:155`). Older projects without one fall back to anyone who can edit
  (§4).
- `decisions.md` closes: "1.1-style numbering" → no numbers; "a sheet whose viewports show different versions" →
  viewports always show the live model; "a change log" stays separate (a backup is a snapshot, not a log).

## Dave's answers (2026-10-08)

1. Back up automatically on every issue? **No** — a manual tick in the Issue dialog, with a warning (§7).
2. Who may restore? **The project owner only** (§4).
3. 30 s countdown, cancellable by the person restoring only? **Yes** (§6).
4. Rooms as parts too? **Models only for now** (§2).
5. Keep backups forever? **Yes, with manual deletion** to clean up old ones (§8).
