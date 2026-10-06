# What cad keeps in the browser

cad saves **view preferences only** in the browser: nothing here is project data, and nothing here is shared with
other people or other computers. Everything a drawing *is* (sheets, racks, settings, the sheet category list …) is in
Firestore. Clearing these keys just resets the views to their defaults.

Every key is read and written inside `try { … } catch`, so blocked or full storage (a private window) means the
defaults, not an error. `<pid>` = the project id.

## localStorage

| Key | Scope | What it holds | Written by |
|---|---|---|---|
| `cad-windows:2` | all projects | each window's (Navigator, Properties, Layers, Blocks, Racks, Device library, Cables) open / docked left or right / floating x, y, w, h / folded / order. `:2` = the layout was reset once (Blocks and Racks open docked). | `app/windows.svelte.ts` |
| `cad-panels:2` | all projects | side column widths, the tables panel's height and whether it's shown, the tables panel's float / position / size / folded, the split between two views. `:2` = the tables start closed. | `app/panels.svelte.ts` |
| `cad-drafting` | all projects | SNAP on / off and the grid step, OSNAP, GRID (shown), B/W floorplans (`grayPlan`). | `app/workspace.svelte.ts` |
| `cad-tabs:<pid>` | per project | the drawing tabs (each tab's view and level, preview or kept) and which tab each pane shows. Back / Forward history isn't kept. | `app/tabs.svelte.ts` |
| `cad-cams:<pid>` | per project | each view's camera (pan x, y and zoom), by view key. Only the view a pane opens with is restored after a refresh; other views fit their content first. | `ui/canvasInfo.ts` (`CameraMemory`) |
| `cad-layers:<pid>` | per project | the Layers panel's eye (hidden layers) and lock (locked layers), and the current layer for new lines / notes. The ❄ freeze per viewport is on the sheet, not here. | `app/layerPrefs.svelte.ts` |
| `cad-nav:<pid>` | per project | which Navigator branches are open. | `ui/Navigator.svelte` |
| `cad-nav-sheets:<pid>` | per project | how the Navigator's Sheets node groups: place / category / level / package. | `ui/Navigator.svelte` |
| `cad-table:<name>` | all projects | each table's sort column and direction, and its scope (This view / Selection / All). `<name>` = `outlets`, `patch`, `links`. | `ui/tableKit.svelte.ts` |
| `cad:pg:<kind>:<title>` | all projects | whether a Properties group is folded, per kind of thing and group (e.g. `cad:pg:rack:Position and size`). | `ui/PropGroup.svelte` |
| `cad:side:<key>` | all projects | whether a section in a side window is folded (e.g. `cad:side:racks`). | `ui/SideSection.svelte` |
| `cad-issue-by` | all projects | the initials last typed in the Issue panel's "By". | `ui/IssuePanel.svelte` |

## sessionStorage

| Key | What it holds | Written by |
|---|---|---|
| `cad-client` | a random 5-character id for this browser tab, put on every save so the tab can tell its own writes from someone else's when Firestore echoes them back. | `app/project.svelte.ts` |

## Not storage

- `eos-cad-clip/1` — a marker inside the text cad puts on the system clipboard (Copy / Paste of drawing items), not a
  storage key (`domain/clipboard.ts`).

## Adding a key

Use the `cad-` prefix (`cad:` for the small per-component fold flags), add `:<pid>` when it belongs to one project,
bump a `:<n>` suffix to reset everyone's saved value when its meaning changes, wrap reads and writes in `try`, and add
a row here.
