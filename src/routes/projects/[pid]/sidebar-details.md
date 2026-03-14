# Sidebar List Multi-Select Patterns

Reference for refactoring the sidebar list selection logic across tools (outlets, racks, trunks).

## Current Implementations

### 1. Outlet List (OutletPalette.svelte)
- **Selection state**: `selectedIds: Set<string>` — plain `$state(new Set())` in `Outlets.svelte`, passed as prop
- **Single click**: `onselect(outlet.id, false)` → parent clears set, adds single id via reassignment
- **Ctrl/Meta-click**: `onselect(outlet.id, true)` → parent toggles id in set via reassignment
- **Shift-click**: `onrangeselect(fromIndex, toIndex)` → parent computes range from `outlets[]` array, creates new Set
- **Anchor tracking**: `lastClickedIndex: $state(-1)` in OutletPalette, updated on every click
- **Highlighting**: conditional class based on `selectedIds.has(id)`
- **`select-none`**: on list items

### 2. Trunk List (TrunkPalette.svelte)
- **Selection state**: `selectedTrunkIds: Set<string>` — plain `$state(new Set())` in `Outlets.svelte`
- **Single click**: `onselect(trunk.id, false)` → parent clears set, adds single id via reassignment
- **Ctrl/Meta-click**: `onselect(trunk.id, true)` → parent toggles id in set via reassignment
- **Shift-click**: `onrangeselect(fromIndex, toIndex)` → parent computes range from `trunks[]` array, creates new Set
- **Index source**: `{#each trunks as trunk, i}` — uses the `trunks` prop directly (same array the parent uses for range lookup)
- **Anchor tracking**: `lastClickedIndex: $state(-1)` in TrunkPalette, updated on every click
- **Highlighting**: cyan bg when `selectedTrunkIds.has(trunk.id)`
- **`select-none`**: on list container div and list items
- **Range select callback**: `onrangeselect(fromIndex: number, toIndex: number)` — parent resolves indices against its own `trunks` array

### 3. Rack List (RackList.svelte)
- **Selection state**: `selectedIds: Set<string>` — `$state(new Set())` in `Racks.svelte`, passed as prop
- **Single click**: `onselect(rackId, false)` → parent: `selectedIds = new Set([rackId])`
- **Ctrl/Meta-click**: `onselect(rackId, true)` → parent: toggle via new Set + reassignment
- **Shift-click**: Uses selection-based anchor (finds first selected item in `sortedRacks`), computes range, passes IDs via `onrangeselect(ids: string[])`
- **No `lastClickedIndex`**: derives anchor from current `selectedIds` instead (avoids state reset issues)
- **Index source**: `sortedRacks` — `$derived([...filteredRacks].sort(...))`, indices used locally only
- **Range computed in child**: RackList slices its own `sortedRacks` and passes IDs directly
- **Highlighting**: cyan bg/border when `selectedIds.has(rack.id)`
- **`select-none`**: on list container div

## Key Design Decisions

### Reactivity: `$state(new Set())` vs `SvelteSet`
- All three tools now use **plain `$state(new Set())`** with full reassignment on every mutation
- `SvelteSet` was tried for racks but didn't reliably trigger re-renders in child components receiving it as a prop
- Pattern: always create a new Set (`selectedIds = new Set([...])`) rather than mutating in place

### Range Select Anchor: `lastClickedIndex` vs Selection-Based
Two approaches to finding the "anchor" for shift-click range select:

1. **`lastClickedIndex` (outlets, trunks)**: Store the index of the last-clicked item. Works when the child's `{#each}` iterates the same array the parent uses for range lookup, and the `$state` doesn't get reset between clicks.

2. **Selection-based anchor (racks)**: Derive the anchor from the first currently-selected item in the sorted list. More robust because it doesn't rely on persisted state — it works even if the component remounts or state is lost. Recommended for refactoring.

```typescript
// Selection-based anchor pattern (recommended)
function handleListClick(e: MouseEvent, itemId: string, index: number) {
    if (e.shiftKey && selectedIds.size > 0) {
        const anchorIdx = sortedItems.findIndex(item => selectedIds.has(item.id))
        if (anchorIdx >= 0) {
            const lo = Math.min(anchorIdx, index)
            const hi = Math.max(anchorIdx, index)
            const ids = sortedItems.slice(lo, hi + 1).map(item => item.id)
            onrangeselect?.(ids)
            return
        }
    }
    onselect?.(itemId, e.ctrlKey || e.metaKey || e.shiftKey)
}
```

### Range Select: IDs vs Indices
- **Outlets/trunks**: passes indices — works because parent and child iterate the same array
- **Racks**: passes IDs — child computes the range locally from its own sorted array, passes resolved IDs to parent. This is more robust because parent (`activeRacks`) and child (`sortedRacks`) maintain independent sorted/filtered arrays
- **Recommended approach for refactor**: pass IDs, not indices. The child owns the display order and should resolve the range itself

### Parent Select Handler Pattern
```typescript
function selectItem(id: string, multi = false) {
    if (multi) {
        const next = new Set(selectedIds)
        if (next.has(id)) next.delete(id)
        else next.add(id)
        selectedIds = next
    } else {
        selectedIds = new Set([id])
    }
}

function rangeSelectItems(ids: string[]) {
    const next = new Set(selectedIds)
    for (const id of ids) next.add(id)
    selectedIds = next
}
```

## Refactoring Notes

### Unified List Component
All three lists share:
- Sorted/filtered item display with selection highlighting
- Ctrl-click toggle, shift-click range select
- `select-none` to prevent text selection on shift-click
- Deletion with inline confirmation (racks have this, could add to others)

Differences:
- Trunk list: visibility toggle per item, color dot, length info
- Rack list: row filtering, inline add form, delete confirmation
- Outlet list: zone/room grouping display

A unified `SelectableList` component could handle the click/selection logic, with slots/snippets for item rendering.

### Props interface for unified component
```typescript
{
    items: T[]
    selectedIds: Set<string>
    onselect: (id: string, multi: boolean) => void
    onrangeselect: (ids: string[]) => void
    sortFn?: (a: T, b: T) => number
    filterFn?: (item: T) => boolean
    children: Snippet<[item: T, selected: boolean, index: number]>
}
```

### Known Issues
- Racks: `lastClickedIndex` approach failed because state was lost between clicks (likely component remount or Svelte reactivity side-effect). Fixed by using selection-based anchor derivation instead.
- Racks: originally used `SvelteSet` for `selectedIds` but mutations (`.add()`, `.delete()`) didn't trigger prop-based reactivity in child components. Switched to `$state(new Set())` with reassignment.
