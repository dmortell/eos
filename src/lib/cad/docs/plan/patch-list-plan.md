# Patch list management — plan for review

**Status: BUILT 2026-10-11 — slices 1–4 and D5 (decisions D1–D8 below); D7 reviewed (From label, configurable); inline editing built. Logged in
`../phases/phase8.md`.** Dave asked for:
- the status of the selected patches can be set (e.g. Installed);
- changes set the status automatically;
- the full patch list can be exported, or part of it (one room, or every changed patch);
- a re-check of the legacy patching tool for what CAD is missing.

This plan replaces backlog entry "Cord workflow: re-route, end badges, bulk status, sort, purge" (P3). Parts of that
entry are already built: sorting, re-routing by dragging a cord's end grip, the per-room Excel, and `repatch` (it's
called now).

## 1. Where CAD is today

| | What it does | Where |
|---|---|---|
| Statuses | `add` · `change` · `remove` · `installed`; `previous: { a, b, status }` holds the ends and status before a change | `domain/types.ts:285` |
| New cord | always `add` | `domain/cords.ts:107`, `:166` (bulk) |
| Delete key | an `add` cord is deleted; an installed or changed cord is marked `remove` (with `previous`) | `cords.ts:114`, `editor/commands.ts:31` |
| Drag an end grip | `installed` / `change` → `change`, keeping the first `previous`; length recomputed unless locked | `cords.ts:122` |
| Cord Properties (one cord) | status dropdown (sets it raw); Installed / Removed on site; Remove / Delete; Revert; "Was: …" | `ui/CordProps.svelte:36–48` |
| Patch list | scope (this room / selection / all), status chips with counts, Find, sortable columns, click / Shift / Ctrl select, ↑↓, Ctrl+C. **Read-only: no actions on the selected rows** | `ui/PatchList.svelte` |
| Export | Cord BOM… dialog: all rooms or *the open room*, "changes only"; Excel = patch schedule grouped remove → change → add → installed (removed rows struck through, Was From / Was To, hidden Key) + a BOM sheet | `ui/CordBomDialog.svelte`, `render/exports.ts:49` |
| Import | cord IDs back from the returned Excel (matched by Key) | `exports.ts:99` |

**Bugs and inconsistencies found:**
1. The status dropdown sets `status` and nothing else. Choosing *installed* leaves `previous` in place, so the cord
   still shows "Was: …" and Revert. Choosing *remove* doesn't record `previous`, so Revert can't bring the cord back.
2. Moving a changed cord back to its original ends leaves it `change`. The legacy tool made it `installed` again.
3. Three paths delete cords outright, including installed ones, so the "pull this cord" work disappears from the
   schedule:
   - Device › Remove cords (`ui/DeviceCables.svelte:18`)
   - Port › Remove cords (`ui/PortProps.svelte:82`)
   - deleting a device or rack (`commands.ts:46`)
4. Status changes work on one cord at a time. Properties shows nothing for several cords, and the list has no
   actions.
5. The export is hidden under "Cord BOM…". Its room choice is only the room that is open, and it can't export just
   the selected rows.

## 2. Legacy compared with CAD

The legacy patching lives in `routes/projects/[pid]/patching/` (`?legacy=1`) and the Elevations Patching tab. Both
share `patching/parts/PatchListPane.svelte`. The legacy outlets and racks tools have no patch list.

| Legacy feature | CAD | In this plan |
|---|---|---|
| Status chips + counts, search, sort | have | — |
| Tick boxes, Shift range, Ctrl, **check all shown** | partial (no check-all) | Slice 2 (Ctrl+A) |
| **Bulk Mark Installed / Mark Add** on the ticked rows | missing | Slice 2 |
| **Bulk Restore** of removed cords (back to their old status) | missing (Revert, one cord) | Slice 2 |
| **Purge removed** (every `remove` cord gone from the record) | missing | Slice 2 |
| Bulk Delete | have (Delete key) | — |
| Removed rows struck through and dimmed; "↶ Was" mark on a moved end | missing (only in Excel / Properties) | Slice 2 |
| Installed → change when an end moves | have | — |
| **Back to the original ends → installed** | missing | Slice 1 |
| Status → installed clears the history; → remove records it | partial (buttons yes, dropdown no) | Slice 1 |
| Deleting an installed cord marks it remove | have, with the 3 bypasses above | Slice 1 |
| **New cords start as Installed** (recording an existing site) | missing | Slice 4 (optional) |
| Bulk colour / cable type (type resets colour) | missing | D5 |
| Inline editing in the list | Properties instead | not planned, consider adding at least for cord ID, status, notes |
| Per-room export | have (open room only) | Slice 3 (any room) |
| Changes-only export | CAD only | — |
| Cord-ID import | have (better: by Key) | — |
| Ports used / free counts | missing | not here (decision 84b) |
| Port holds, patch by rule, port filter, bulk preview | missing | not here (decisions 82 / 84) |
| Change log (who / when) | missing | not here (decision 131 open) |
| F / T badges on a selected cord's ends | missing | dropped? The end grips now mark the ends (D6) |

## 3. The status rules (one place, `domain/cords.ts`)

Every path that changes a cord goes through these rules, so the list, Properties, the grips and Delete all agree.

| Action | add | installed | change | remove |
|---|---|---|---|---|
| **Move an end** (grip, Re-patch) | moves | → change, `previous` = old ends | moves; **back on its `previous` ends → installed, `previous` cleared** | not allowed (restore first) |
| **Type, colour, length, notes, cord ID, length lock** (D2: never change the status) | edits | edits | edits | edits |
| **Delete / Remove** (key, list, device or port "Remove cords") | deleted | → remove, `previous` = itself | → remove, `previous` kept (its *installed* state) | — |
| **Installed** (done on site) | → installed | — | → installed, `previous` cleared | **record deleted** (removed on site) |
| **Restore** | — | — | → back to `previous` (Revert) | → back to `previous` status and ends |

- **Setting the status by hand** (the dropdown, to fix a mistake) uses the rows above: *installed* = Installed;
  *remove* = Remove; *add* = a plain set, with `previous` cleared. *change* is reached only by an edit.

- `previous` stays `{ a, b, status }` (D2: only the ends make a `change`).
- Deleting a device or rack with **installed** cords on it: the cords can't stay as `remove` because their end is
  gone. They are deleted; the delete confirm warns "N installed cords go from the record — export the changes
  first if the installer needs them" (D3).
- `removeCord`, `repatch`, `revertCord` and `installCord` stay; `setStatus(c, s)` maps the dropdown onto them. All
  pure, all tested.

## Slices

### Slice 1 — The rules (domain, pure) · ~100 lines + tests
- `setStatus`, and the back-to-original check in `repatch`.
- CordProps' dropdown goes through `setStatus`.
- The device / rack delete confirm warns about installed cords (D3).
- DeviceCables and PortProps "Remove cords" go through `removeCord`: `add` cords are deleted, the others are marked
  `remove`. The button reads "Remove cords (3 marked, 2 deleted)".
- Tests: each cell of the table above, plus a round trip (installed → move → move back = installed with no
  `previous`).

### Slice 2 — Act on the selected rows in the patch list · ~150 lines
- A bar above the table when rows are selected: **Installed · Add · Remove · Restore · Delete**, each with the number
  of rows it applies to. "Installed (12)" also covers "removed on site" for `remove` rows, and its confirm says
  "3 removed cords go from the record". One undo step per action, with a status-line message.
- The same actions on a right-click on the rows, and on several cords selected in a rack view (Properties shows a
  "N cords" group with the same buttons).
- **Cable type · Colour** for the selected rows (D5): a type change also sets the type's colour, as in the legacy
  tool. No status change (D2).
- **Purge removed (n)** next to the status chips: every `remove` cord in the scope is done on site (asks first).
- Ctrl+A in the list selects the shown rows. `remove` rows are struck through and dimmed. A moved end shows "↶" with
  the old end as its tooltip.
- Help: "Mark cords installed / restore removed cords".

### Slice 3 — Export from the patch list · ~100 lines
- The list's **Export…** button (and File › Export › Patch schedule…) opens the existing dialog, renamed *Patch
  schedule*, with:
  - **What:** every cord · changes only (add / change / remove)
  - **Where:** all rooms · *a room* (any room with cords, chosen from a list, not only the open one) · the selected
    rows (when there are some) · the rows shown (the list's filters and Find)
  - the cord BOM counts as now, for whatever is chosen
- All rooms → **a sheet per room** in one workbook, plus the BOM (D4). A room or selection → one sheet, as now.
- Sorting inside each status group: by the From port's place, as now (D7 — **review after testing**).
- `exportPatchSchedule` takes a cord list instead of `(room, changesOnly)`. `importCordIds` is unchanged (Key).
- The "Cord BOM…" button stays as a shortcut to the same dialog.

### Slice 4 (D1) — Recording a built site: new cords start as Installed · ~60 lines
- A project setting, `newCordStatus: 'add' | 'installed'`, shown as an obvious two-way toggle, **Planning (new
  cords: add) · Surveying (new cords: installed)**:
  - in the patch list's bar (always visible there);
  - in the cord tool's option bar and the status-line prompt when a patch starts ("Click the port to patch to —
    recorded as INSTALLED");
  - in Project › Settings.
- `makeCord` and `bulkPatch` take the status. Surveying cords skip the work order (they're already in).
- The message after a patch says which ("3 cords recorded as installed").

**Total about 450 lines with tests; slices ship 1 → 4, each committed and checked live on Test Project.**

## Decisions (Dave 2026-10-11)

- **D1** New cords as Installed: **build**, with an obvious toggle for an engineer surveying a built site or a
  designer planning a new install (Slice 4).
- **D2** Only **moving an end** makes an installed cord a `change`. A cord that has to be swapped (other type,
  colour, length) may later get a manual **REPLACE** status to instruct the installer — backlog.
- **D3** Deleting a device or rack with installed cords: **delete them, after a warning**.
- **D4** Full-list export: **a sheet per room** plus the BOM.
- **D5** Bulk cable type / colour on the selected rows: **now** (no status change, D2).
- **D6** F / T badges: **dropped**.
- **D7** Reviewed 2026-10-11: sort by the **From label** inside each group, or by From place / To label / cord ID (the dialog's "sort by"); columns per end: Device, Label, Rack, U, Face, Port.
- **D8** Status back from the returned Excel: **not now**.
- Dave's note on the gap table: inline editing in the list — consider it at least for cord ID, status and notes
  — BUILT 2026-10-11: double-click Cord ID / Status / Notes; Enter / Shift+Enter down / up, Tab / Shift+Tab across.

Not in this plan (still in `decisions.md` / `later.md` / `backlog.md`): hovering a cord (18), patch bench / by rule /
port holds (82), the bulk preview and port counts (84b), a change log (131), patch schedule viewports on sheets,
cord label batches (backlog "Cord label batches by type, length and colour"), a REPLACE status (backlog).
