# Tree views — organising a project's models and drawings

**Status:** plan, 2026-09-27 (User). Not started. Todo: "Tree views / organisation templates".

## 1. The ask

The left tree is a visual aid for organising a project's models and drawings. Today it has ONE shape: building ›
floor › zone (the Pages *places*), with sheets filed under their place and the old tools' drawings hung on them.
People think about a project in other ways too:

- **by drawing type across the building:** Outlets (high / low / all) for every floor and zone; Trunks (high / low /
  all) for every floor; Elevations by category (risers, racks, AV rooms …);
- or their own grouping, arranged by drag-and-drop.

So: switchable **views** of the same drawings (templates), plus user-made ones. Drawings need **tags** to be
grouped this way, because a sheet's viewports can't reliably tell us what the sheet is *about*.

## 2. Today

- Places (`store/places.ts`, `Place`: id, parentId, name, kind, legacy link) + `buildPlaceTree` (store/placeTree.ts)
  → `NavNode[]` for `parts/DrawingNavigator.svelte` (expand / collapse, drag to re-file, multi-select, ⋮ menus).
- Pages sheets (`PagesSheetDoc`) are filed under a place (`placeId`) and already carry **kind**, **discipline** and
  **tags** (edited in File › Drawings…). Models are one per place.
- The old tools' drawings (Sheets, register drawings, riser diagrams) hang on places via `legacy` links.

## 3. Design

### 3.1 A "view" = a grouping rule over the same items
The ITEMS never move: places, models and sheets stay where they are (the place tree is still the source of truth for
*where* things are). A **view** only decides how the navigator LISTS them:

```ts
type TreeView = {
  id: string; name: string
  kind: 'places' | 'group' | 'custom'
  /** group: the grouping levels, outermost first — e.g. ['discipline', 'kind', 'floor'] */
  levels?: GroupKey[]
  /** filter: only items matching (e.g. tag 'high-level') */
  filter?: { tags?: string[]; kinds?: SheetKind[]; disciplines?: string[] }
  /** custom: a user-made folder structure (below) */
  folders?: CustomFolder[]
}
type GroupKey = 'building' | 'floor' | 'zone' | 'kind' | 'discipline' | 'tag' | 'category'
```

- **places** (today's tree) stays the default and the only view where drag = re-file.
- **group** views build folders from the item's fields: floor / zone come from its place, kind / discipline / tags
  from the sheet. An item with no value for a level goes under "(none)".
- **custom** views are user folders (below).

A view switcher sits at the top of the tree (a small dropdown: "By place ▾"), remembered per user per project.

### 3.2 Built-in templates (one click)
| Template | Levels | Example |
|---|---|---|
| By place (today) | building › floor › zone | 33F › Zone 3303 › sheets |
| By drawing type | kind › floor | Outlets › 33F, 34F … ; Trunks › … ; Elevations › … |
| Outlets / trunks by level | kind › tag (high / low) › floor | Outlets › High level › 33F |
| Elevations by category | category › place | Risers › …; Racks › …; AV rooms › … |
| By discipline | discipline › kind | Electrical › Outlets …; AV › … |

### 3.3 Tags (what a drawing is ABOUT)
We can't infer "this sheet shows high-level outlets" from its viewports, so drawings get tags — lightly:

- **Kind** (existing field): plan, outlets, trunks, elevation, rack, riser, detail, schedule, …
- **Tags** (existing field, free text) with a SUGGESTED vocabulary per project: `high-level`, `low-level`, `AV`,
  `server-room`, `riser`, `rack`, … (a chip picker with autocomplete from the project's tags).
- **Auto-suggest** (never forced): a new sheet made from a template, or with viewports on an outlets layer preset,
  proposes a kind / tags; a drop-as-sheet elevation from a rack row proposes kind = elevation, category = racks.
- Bulk tagging: multi-select in the tree or File › Drawings… → Tags (exists in the dialog today).

### 3.4 Custom views (drag and drop)
- "New view…" creates an empty custom view; the user adds folders and drags sheets / models into them (a sheet can be
  in several folders — they are references, like playlists). Drag between folders, reorder, rename, colour.
- A custom folder can also be a SMART folder: a saved filter (tags / kind / discipline / floor) that fills itself.
- Stored in the project's Pages doc (`pages.treeViews`), so the whole team sees them; the chosen view is per user.

### 3.5 Models vs paper drawings — obvious at a glance (User 2026-09-27: a requirement)
In EVERY view (places, grouped, custom) a MODEL row must be visually distinct from a PAPER drawing (sheet) row, so the
user never has to guess which one opens model space and which opens a sheet:
- **Icon**: models use a 3D / cube-style icon (a model: `box`; a building model: the building icon), sheets a paper
  icon with a folded corner (`fileText`) — never the same glyph family.
- **Colour + weight**: model rows get a model accent (e.g. teal text / icon, like the model-space UI) and their name in
  regular weight; sheet rows stay neutral with the drawing number in a monospace prefix (`A-201 · Outlets 33F`).
- **A tag / chip**: a small "MODEL" pill (or the sheet's number) at the row's end; in a grouped folder, models are
  listed first under a thin "Models" sub-heading, then "Sheets".
- **Hover + tooltip**: "Model — opens in model space" vs "Sheet A-201 — opens the paper layout".
- The open tab mirrors it: model tabs already render dark model space; their tab gets the same model icon.
Phase 1 includes this (it's cheap and it's what makes grouped views readable).

### 3.6 What stays the same
Opening, previewing, the ⋮ menus, multi-select, rename, delete — the same rows in any view. Only "By place" re-files
on drag; in a group view, dragging onto a group SETS that field (drop on "High level" → adds the tag) — optional,
phase 3.

## 4. Phases

| Phase | Content | Size |
|---|---|---|
| 1 | `TreeView` + a pure `buildGroupedTree(items, view)` (tested); the view switcher; the built-in templates; per-user choice | M |
| 2 | Tag UX: chip picker with project vocabulary in the sheet's Properties + bulk tag from the tree; auto-suggest on new / dropped sheets | M |
| 3 | Custom views: folders, drag in / out / reorder, smart folders; drop-on-group sets the field | M–L |

## 5. Decided (User 2026-09-27)
- Custom views are SHARED with the team (stored in the project's Pages doc; the chosen view is per user).
- Tags are FREE text; the suggestions are GLOBAL — one tag vocabulary across all projects (a doc outside any project),
  merged with the project's own tags; a new tag joins it.
- Models appear in grouped views and always look clearly different from sheets (§3.5).

## 5a. Questions for User (answered above)
1. Should models appear in the grouped views (e.g. "33F model" under Floors), or sheets only? (Wherever they appear
   they must look clearly different from sheets — §3.5, User 2026-09-27.)
2. Custom views shared with the team (recommended) or personal?
3. A fixed tag vocabulary per project (admin-defined) or free tags with suggestions (recommended)?

## 6. Related: decommissioning the old tools' leaves
The tree still lists the old tools' drawings (Sheets, register drawings, riser diagrams, Outlets / Racks / Patching
views). Once they are all imported into Pages (todo REMINDER), hide them: a project setting "Show legacy tool
drawings" (off by default once imported), then remove the hanging code (`placeTree.ts` legacy branches) when the
tools are retired.
