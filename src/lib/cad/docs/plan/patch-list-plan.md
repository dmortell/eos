# Patch list management — plan for review

**Status: for Dave's review (2026-10-11).** Nothing below is built yet. Dave asked for:
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
| Inline editing in the list | Properties instead | not planned |
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
| **Edit type / colour / length** (D2) | edits | → change, `previous` records the old value | edits; back to the old values → installed | not allowed |
| **Notes, cord ID, length lock** | edits | edits, no status change | edits | edits |
| **Delete / Remove** (key, list, device or port "Remove cords") | deleted | → remove, `previous` = itself | → remove, `previous` kept (its *installed* state) | — |
| **Installed** (done on site) | → installed | — | → installed, `previous` cleared | **record deleted** (removed on site) |
| **Restore** | — | — | → back to `previous` (Revert) | → back to `previous` status and ends |

- **Setting the status by hand** (the dropdown, to fix a mistake) uses the rows above: *installed* = Installed;
  *remove* = Remove; *add* = a plain set, with `previous` cleared. *change* is reached only by an edit.

- `previous` grows to `{ a, b, status, cableType?, colour?, lengthM? }` (only the fields that changed), so Revert,
  "Was" and the Excel's Was columns cover a swapped cord too. Firestore-safe: optional fields only.
- Deleting a device or rack with **installed** cords on it: the cords can't stay as `remove` because their end is
  gone. The delete confirm already lists what goes. It adds: "N installed cords go from the record — export the
  changes first if the installer needs them" (D3).
- `removeCord`, `repatch`, `revertCord` and `installCord` stay; a new `editCord(c, patch)` holds the edit rule;
  `setStatus(c, s)` maps the dropdown onto them. All pure, all tested.

## Slices

### Slice 1 — The rules (domain, pure) · ~120 lines + tests
- `editCord`, `setStatus`, and the back-to-original check in `repatch` / `editCord`; `previous` gains the optional
  fields.
- CordProps uses them: the dropdown goes through `setStatus`, and type / colour / length edits through `editCord`.
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
- Sorting inside each status group: by From label (D7).
- `exportPatchSchedule` takes a cord list instead of `(room, changesOnly)`. `importCordIds` is unchanged (Key).
- The "Cord BOM…" button stays as a shortcut to the same dialog.

### Slice 4 (optional, D1) — New cords start as Installed · ~30 lines
- Settings › Patching: "New cords start as: Add (planned) / Installed (recording what is on site)". `makeCord` and
  `bulkPatch` take the status.

**Total about 400 lines with tests; slices 1–3 ship in that order, each committed and checked live on Test Project.**

## Decisions for Dave

- **D1** Slice 4 (new cords as Installed, for surveying an existing site): build it now, or later?
  *Recommend: now; it's small, and the legacy tool had it.*
- **D2** "Changes auto change the status": which edits make an installed cord a `change`?
  (a) moving an end only (legacy);
  (b) also the cable type, colour and length — a different cord has to go in.
  *Recommend (b).* Notes and cord ID never change the status.
- **D3** Deleting a device or rack with installed cords: (a) delete them, and the confirm warns (as planned above);
  (b) refuse until the cords are removed and purged. *Recommend (a).*
- **D4** "Full list" export: (a) one sheet, grouped by status (as now); (b) a sheet per room plus the BOM.
  *Recommend (b): installers work room by room.*
- **D5** Bulk cable type / colour on the selected rows (legacy had it; with D2b it makes them `change`): include it
  in Slice 2? *Recommend: not now — one line in later.md.*
- **D6** F / T badges on a selected cord's ends (old backlog item): drop them now that the end grips show the ends?
  *Recommend: drop.*
- **D7** Inside each status group the schedule sorts by the From port's place (P3C U37 : 15). Switch to the From
  label, or keep the place (the installer walks the rack)? *Recommend: keep the place.*
- **D8** Is "Changes only" + "Installed" on the selected rows the whole round trip? The installer gets the changes,
  does them, and you then mark those rows Installed. Or do you also want the returned Excel to set the status (a
  "Done" column, read back like cord IDs)? *Recommend: not now.*

Not in this plan (still in `decisions.md` / `later.md`): hovering a cord (18), patch bench / by rule / port holds
(82), the bulk preview and port counts (84b), a change log (131), patch schedule viewports on sheets
(backlog), cords ordered / delivered (backlog).
