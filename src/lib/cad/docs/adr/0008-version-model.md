# ADR 0008: Two kinds of history: sheet revisions and project versions

**Status:** Proposed. Waits on Dave for the open questions at the end. The backlog's "1.1-style numbering"
decision is answered here as option (a).

## Context

Today cad keeps one kind of history: **sheet revisions made by issuing** (`domain/issue.ts`, `app/issue.ts`).
- Each changed sheet gets the next code (A → B, P01 → P02, or a typed one) and a `revisions[]` entry on the sheet
  (`code`, `date`, `note`, `desc`, `by`, `issueId`, `hash`).
- What it printed is frozen once in `projects/{pid}/cadIssued`: a display list, chunked at 300k characters a doc,
  outside the entity store. The package PDF is uploaded to `files/{id}` and recorded on the `issue` entity.
- sheets-organising §4 decided on purpose that an issue keeps the printed picture and **not** the model data.

So cad can reprint any issue exactly, but it cannot bring the model back to how it was. Four backlog entries need
that or a "saved" state: Version history, Revert to an earlier issue, the Issue gate, and (loosely) Change history
per drawing. Pages solved this with major / minor model versions (1.0, 1.1, 2.0, with full copies kept for majors
only) and required a major version before issuing. Dave wants issuing kept simple and versions simplified, and cad
has one project of entities, not one doc per model, so that design doesn't carry over.

## Decision

### 1. Two kinds of history, and nothing else

- **Sheet revisions: what went out.** One per (sheet, issue) where the sheet changed. They are made only by
  issuing and are immutable: a frozen picture, a fingerprint and a PDF. They are already built and nothing here
  changes them.
- **Project versions: what the data was.** A named snapshot of the whole project's model data, saved by hand or by
  issuing. A version can be restored. This is new.
- **There are no model versions or major / minor numbers.** A version is not a "state" of the project. The live
  project is always the working copy, and a version is a copy taken at a moment.

### 2. What a version stores

- **Every `cadEntities` doc of the project at that moment**: all levels (not just the loaded ones), sheets,
  views, shapes, layers, packages, issues and the `settings` record. The copy is read **from Firestore**
  (`getDocs` on the collection), not from the store, because the store only holds the levels that have been opened.
  Saving waits until `pendingWrites` is 0, so the copy includes the user's own last edit.
- **What each entity holds:** the entity fields only, with `rev` / `updatedAt` / `updatedBy` / `client` stripped
  (`fromDoc`).
- **Where:**
  - a head doc at `projects/{pid}/cadVersions/{versionId}` with `name`, `note?`, `by` (uid + display name),
    `at`, `entities` (the count), `parts`, `issueId?` and `bytes`
  - the JSON in `projects/{pid}/cadVersions/{versionId}/parts/{n}`, chunked like `cadIssued` (300k characters
    a doc)

  Heads are listed without loading parts. A big floor (33F, about 3,300 items) is roughly 1–2 MB of JSON, so about
  5–10 parts.
- **Not included:**
  - global docs: `settings/cadBlocks`, `settings/cadDeviceTemplates`, `settings/cadSheetCategories`. A version
    keeps the ids it uses, and a retired block still draws (`BlockDef.retired`).
  - frozen issue copies (`cadIssued`) and uploaded files (`files/{id}`): a version keeps their ids, not the files
  - workspace state (tabs, cameras, layer toggles: localStorage, ADR 0003)
  - legacy tool docs
  - undo history

  If a floorplan file is later deleted from Uploads, a restored version shows it as missing, the same as the live
  project would.
- **Versions are immutable.** They can be renamed, have their note edited, or be deleted after a confirm. Deleting a
  version is not undoable, because it is outside the store.

### 3. How an issue relates to a version

- **Issuing saves a version first**, automatically, named "Issue 03: <issue name>". The issue records it in a new
  optional field, `Issue.versionId`.
  - The version is taken just before the issue is recorded, so it holds the model the frozen pictures came from.
  - Issues from before this change have no `versionId` and can't be reverted. They can still be reprinted.
- **A version can be issued from:** restore it, then issue. There is no "issue straight from a stored version"
  path, because the frozen pictures are always drawn from the live model.

### 4. Restore

- **The whole project, as ONE undo step through the store** (`store.transact('Restore version …')`), after a
  confirm: "This replaces the current project with <name> (<date>). Changes since then are lost, unless you save
  them as a version first. [Save first and restore] [Restore] [Cancel]".
  - First load every level and sheet scope, so the store holds every live entity.
  - Then `put` each version entity that differs and `del` each live entity that is not in the version.
  - Sync splits the writes into batches of 500. Undo works as usual and skips anything a colleague changed since
    (ADR 0003).
- **History is kept, not rolled back:**
  - `issue` entities are left as they are live.
  - each live sheet keeps its live `revisions[]`.

  A restore therefore never makes something that was issued look unissued. A restored sheet's fingerprint then
  differs from its last revision, so it shows "Changed since", which is true.
- **One sheet only: later.** Its views pull in the outlets, racks and links that other sheets also show, so a
  "sheet-only" restore either changes other sheets or only restores the sheet's own paper (viewports, notes, title
  block). If it is wanted, it will be the second, narrow kind: "restore this sheet's paper from version X".

### 5. Numbering

- **Sheet revisions keep their codes** (A, B … / P01, C01 … / typed codes, `nextRev`). Issues keep their numbers
  (Issue 01, 02 …).
- **Versions have a name and a date, not a number.** The list is in date order. The default name for a hand-saved
  version is the date and time, and the user can type over it. There is no 1.1 / 2.0, unless Dave asks for it.

## What the dependent backlog entries then need

- **Version history** (L → **M**, ~250 lines): the History list (name, date, by, count, note), Save version…,
  Rename, Delete, Restore (§4), and `app/versions.ts` (save / list / load / delete, chunking shared with
  `cadIssued`). Save is also used by issuing.
- **Revert to an earlier issue** (M → **S**, ~40 lines once versions exist): an Issues-list action "Revert to this
  issue", which restores `issue.versionId`. If nothing changed since the last version, it skips the "save first"
  step. It is greyed out for issues with no version.
- **Issue gate** (M → **S** or drop): the auto-save in §3 means nothing goes out without a version behind it. All
  that is left is "warn before issuing changed sheets", which the Issue panel already lists (New revision / As
  last issued). Suggest folding it into For review / Approved (sheets-organising D3: later) rather than building a
  gate.
- **Change history per drawing** (M → **S**, ~60 lines): this does not depend on versions at all. `desc` / `by`
  are already entered when issuing. What remains is editing a revision's `desc` / `by` afterwards in Sheet
  Properties (the live title block's table only, since the frozen copy stays as issued). An optional "pending
  change note" on the sheet could pre-fill the next issue's `desc`.

## Consequences

- **Firestore cost:**
  - Saving a version is one full read of `cadEntities` plus a few chunk writes. Restoring reads a few chunks and
    writes only the entities that differ.
  - Opening a project reads nothing extra.
  - Auto-save on every issue adds one version per issue. That is fine at the rate projects issue.
- **The store and the persistence boundary don't change.** Restore is an ordinary transaction, so sync, echoes,
  undo and colleagues' listeners all just work.
- **A restore can be large** (thousands of ops in one undo step). Memory is fine, and the 200-step limit counts
  steps, not ops.
- **The decisions in `decisions.md` close as follows:**
  - "1.1-style numbering" → (a)
  - "A sheet whose viewports show different versions" → (a): viewports always show the live model
  - "A DRAFT label" is unaffected: it uses the sheet fingerprint
  - "A change log" stays open and separate: a version is a snapshot, not a log

## Open questions for Dave

1. **Auto-save a version on every issue?** *Suggest:* yes. It is what makes "Revert to an earlier issue" work, and
   it is cheap.
2. **Restore keeps issues and each sheet's revisions as they are live** (history is append-only)? *Suggest:* yes.
3. **Whole-project restore only for now; "restore one sheet's paper" later if asked?** *Suggest:* yes.
4. **Versions named and dated, no numbers?** *Suggest:* yes. Default name = date and time, or "Issue NN: name".
5. **Who can delete a version?** *Suggest:* anyone who can edit the project, but never one an issue points at
   (it shows "used by Issue 03").
6. **Keep versions forever?** *Suggest:* yes for now. Add "delete hand-saved versions older than N" only if storage
   shows up as a cost.
