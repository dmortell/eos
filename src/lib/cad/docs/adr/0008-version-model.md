# ADR 0008: Versions are backups of chosen models; restore is announced to everyone

**Status:** Accepted direction (Dave 2026-10-07): "essentially a database backup and restore of the models", with
versions of a selection of models (33F only, or 3303 and 3307 only), a download / restore as a file, and a warning to the
other users before a restore. Replaces the first draft (whole-project versions only). The few questions left are at
the end; the plan is `../plan/versions-plan.md`.

## Context

- **What cad keeps today:** sheet revisions made by issuing (`domain/issue.ts`, `app/issue.ts`). Each changed
  sheet gets the next code and a `revisions[]` entry, and what it printed is frozen in `projects/{pid}/cadIssued`
  (a display list, chunked at 300k characters). That reprints any issue, but cannot bring the model back.
- **What Dave wants:** a backup and restore of the model data, for chosen models (33F only, or 3303 and 3307 only),
  plus a copy kept as a file. In cad a model is a LEVEL: Journey's 33F is two of them, "33F 3303" and "33F 3307"
  (`Level.area`, each with its own plan, racks and elevations — decisions.md "Zones on one floor"). A restore is a big deal: it changes the project for everyone working in it, so
  they must be warned before it happens.
- **Firestore's own tools** (managed export / import, scheduled backups, point-in-time recovery) work on the whole
  database, need admin access from a server or gcloud, and can't pick out one project, let alone one floor. An
  import also leaves newer docs in place. They are the safety net for disaster recovery, set up by Dave in the
  Firebase console — not an app feature, and not part of this ADR.

## Decision

### 1. Two kinds of history

- **Sheet revisions — what went out.** Made only by issuing, immutable, already built. Unchanged by this ADR.
- **Versions — what the data was.** A copy of the model data of chosen PARTS of the project, taken at a moment,
  that can be restored. There are no model numbers (no 1.1 / 2.0): a version has a name, a note and a date. The live
  project is always the working copy.

### 2. Parts: what a version (or a file) can hold

A version holds the **whole project** or a set of **models** (levels):

| Part | What it holds |
|---|---|
| **Model** (a `level`, e.g. "33F 3303") | the level itself; on it: spaces (rooms, server rooms), outlets, underlays, plan shapes (`shape.levelId`), section cuts; racks standing on it (`rack.levelId`), their rack rows, the devices in them and the cords between their ports; links with an end on it |
| **Whole project** | every `cadEntities` doc: all models, plus project-wide records — settings, layers, buildings, views, sheets (with their paper shapes), packages, issues |

- The picker groups models by floor (`buildingId` + `number`): ticking **33F** ticks "33F 3303" and "33F 3307";
  each can be ticked alone. Any set works ("33F 3303 + 32F").
- **Links that cross the edge** (an outlet in 3307 served from a panel in 3303's server room; backbone between
  floors) are stored with the version when either end is in it, with a note of which end is outside.
- A room alone (one server room's racks) is not a part for now — say if it's wanted.
- Project-wide records (sheets, views, layers, settings, issues) are only in whole-project versions. Restoring a
  part never changes a sheet; a sheet that shows the part just shows the restored data.
- **Never in a version or a file:** the global libraries (`settings/cadBlocks`, `cadDeviceTemplates`,
  `cadSheetCategories`) — a file carries a copy of the blocks and templates it uses, for reference (§5); the frozen
  issue copies (`cadIssued`) and uploaded files (`files/{id}`) — kept by id; workspace state (localStorage); undo
  history; the legacy tools' docs.

### 3. Where versions are stored

- A head doc `projects/{pid}/cadVersions/{versionId}`: `name`, `note?`, `by` (uid + name), `at`, `parts`
  (`'all'` or a list of `{ levelId, name }`), `count`, `bytes`, `chunks`, `issueId?`.
- The data in `projects/{pid}/cadVersions/{versionId}/chunks/{n}`: the same JSON as a file (§5), chunked at 300k
  characters, sharing the code with `cadIssued`. The list reads heads only.
- **Taken from Firestore, not the store** (the store only holds the models opened this session): the project scope
  (always loaded) plus a query per chosen model's scope; saving first waits for `pendingWrites` to reach 0 so the
  user's own last edit is in it. Entities are stored without `rev` / `updatedAt` / `updatedBy` / `client` /
  `scope`.
- Versions are immutable: rename, edit the note, or delete (after a confirm; not undoable).

### 4. Restore

- **What it does:** for the parts restored, every live entity in them is replaced by the version's copy, entities
  added since are deleted, and deleted ones come back — all as ONE undo step (`store.transact`), so sync, echoes and
  colleagues' listeners work as for any edit. First every chosen model is loaded, so the store holds what it changes.
- **The edge:** a link that crosses the edge comes back only if its outside end still exists and that port is free;
  otherwise it is skipped and listed. A live crossing link not in the version is deleted (its outlet or panel
  outside is then free) and listed.
- **A preview first:** the confirm dialog shows what will change — "33F 3303: 214 changed, 12 added back, 30
  removed; 3 links to 33F 3307 skipped (port in use)" — with **Save the current state first** ticked (a version named "Before
  restore — …"), then **Restore** / **Cancel**.
- **History is kept:** issues and each sheet's `revisions[]` are never rolled back (a whole-project restore keeps the
  live ones). A restored sheet that now differs from its last issue shows "Changed since", which is true.
- A version can be issued by restoring it, then issuing.

### 5. As a file: download and restore

- **File › Download project…** asks which parts (whole project by default) and saves
  `<project> <parts> <yyyy-mm-dd hhmm>.eoscad` — gzipped JSON:
  `{ format: 'eos-cad', schema: 1, projectId, projectName, at, by, parts, entities: [...], library: { blocks, deviceTemplates } }`.
  A big floor is about 1–2 MB of JSON before gzip.
- **File › Restore from file…** reads one, shows its project, date and parts, lets the user pick which of its parts
  to restore, and goes through the same preview and notice as a version (§4, §6).
  - **Only into the same project** (`projectId` must match) for now. Copying a project from a file is later.
  - Missing global blocks / templates are added from `library`; existing ones are never overwritten.
- **Download a version** gives the same file; a file and a version are interchangeable.

### 6. Everyone is told before a restore

- A notice doc `projects/{pid}/cadMeta/restore`: `{ state: 'pending' | 'running' | 'done' | 'cancelled', by, what
  (the version or file name), parts, startsAt, at, summary? }`. Every open cad session of the project listens to it.
- **Pending (30 s):** everyone else sees a popup with a countdown: "Dave will restore 33F to 'Issue 03' in 25 s.
  Changes you make there until then will be lost." The person restoring can cancel; nobody else can block it.
- **Running:** editing is off in every session (the store refuses writes, a banner says why). Reading still works.
- **Done:** "33F was restored to 'Issue 03' by Dave at 14:02" — a banner until dismissed. Other sessions clear their
  undo history (their steps would fight the restore). The person restoring keeps one undo step: Undo restore.
- **Only one at a time:** a pending or running notice blocks a second restore. A notice older than 10 minutes and
  not done counts as abandoned (the tab closed), and the next restore may replace it.
- The notice is advisory (cad has no server to enforce it), which is enough for a team that is told.
- **Who may restore:** anyone who can edit the project (as for every other edit), unless Dave answers Q2 otherwise.

### 7. Issues

- **Issuing saves a version of the whole project automatically**, "Issue 03: <issue name>", and records it as
  `Issue.versionId`, so **Revert to this issue** (Issues list) is just a restore of that version, whole or chosen
  parts. Older issues without a version can be reprinted, not reverted.
- This also covers the "Issue gate": nothing goes out without a version behind it. What's left of the gate is the
  existing New revision / As last issued list in the Issue panel.

## Consequences

- **Firestore cost:** saving reads the project scope plus the chosen models once, and writes a few chunks; a
  restore reads the chunks and writes only what differs. Opening a project reads nothing extra (one listener on the
  notice doc). One whole-project version per issue is fine at the rate projects issue.
- **The store, sync and undo don't change**; restore is an ordinary (large) transaction. The store gains a
  read-only switch for the running restore.
- **Partial restores keep the blast radius small:** restoring "33F 3303" touches only that model; the report says
  which outlets or panels in other models lose a link.
- `decisions.md` closes: "1.1-style numbering" → no numbers; "a sheet whose viewports show different versions" →
  viewports always show the live model; "a change log" stays separate (a version is a snapshot, not a log).

## Questions left for Dave (defaults used until answered)

1. **Auto-version on every issue: the whole project?** *Default:* yes (it is the record of what went out; partial
   versions are for hand-saved ones).
2. **Who may restore:** anyone who can edit, or the project owner only (`projects/{pid}.ownerId`)? *Default:*
   anyone who can edit.
3. **Countdown:** 30 s, cancellable by the person restoring only? *Default:* yes.
4. **Rooms as parts too** (one server room's racks, devices and cords, without the rest of its model)? *Default:*
   not now; models only.
5. **Keep versions forever** (no automatic clean-up)? *Default:* yes, until storage shows up as a cost.
