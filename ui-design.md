# UI Controls Inventory and Consolidation Plan

## Scope
- Scanned `src/**/*.svelte` for native and `$lib` controls.
- Focused on `button`, `input`, and `select` usage.
- Goal: define a consistent direction centered on `$lib/ui/Button.svelte`, plus equivalent consistency for input/select controls.

## Current Usage Snapshot
- Buttons:
- Native `<button>`: `174`
- `$lib` `<Button>`: `27`
- Inputs:
- Native `<input>`: `70`
- `$lib` `<Input>`: `3`
- Selects:
- Native `<select>`: `23`
- `$lib` `<Select>`: `6`

## Hotspot Files
- Buttons:
- `src/routes/projects/[pid]/uploads/parts/PdfViewer.svelte` (17)
- `src/routes/projects/[pid]/outlets/Outlets.svelte` (15)
- `src/routes/projects/[pid]/racks/Racks.svelte` (14)
- `src/routes/projects/[pid]/outlets/parts/OutletCanvas.svelte` (14)
- `src/routes/projects/[pid]/outlets/trunks/TrunkPalette.svelte` (11)
- Inputs:
- `src/routes/projects/[pid]/outlets/trunks/TrunkPalette.svelte` (11)
- `src/routes/projects/[pid]/outlets/parts/RackProperties.svelte` (7)
- `src/routes/projects/[pid]/outlets/Outlets.svelte` (7)
- Selects:
- `src/routes/projects/[pid]/outlets/Outlets.svelte` (8)
- `src/routes/projects/[pid]/outlets/trunks/TrunkPalette.svelte` (6)
- `src/routes/tasks/parts/TaskDialog.svelte` (4)

## Existing Shared Components
- `src/lib/ui/Button.svelte`
- Simple wrapper with `variant`, `group`, `active`, `href`, `icon`.
- Strength: lightweight and already used in several areas.
- Gaps: no `size` model, no loading state, no icon-only treatment, no semantic `tone` set beyond current variants, no built-in confirmation/danger affordances.

- `src/lib/components/ui/button/button.svelte`
- Separate advanced button system (variant + size) exists but is not the primary app-level import path.
- Risk: two competing button systems in one codebase.

- `src/lib/ui/Input.svelte`
- Supports `type='textarea'` mode and `label`.
- Gaps: odd class names (`flexxx`, `flex-inline`), mixed styling strategy (component classes plus element-level CSS), limited size/validation/assistive text model.

- `src/lib/ui/Select.svelte`
- Basic wrapper with `label` and class composition.
- Gaps: no standardized hint/error state, no consistent sizing tokens with `Input`.

## Style Variants Observed In Native Controls
- Primary action buttons (`bg-blue-600 text-white`, often small heights like `h-5/h-6/h-7`).
- Destructive buttons (`bg-red-600`, `text-red-*`, confirm/cancel pairs).
- Ghost/icon controls (`p-0.5`, `p-1`, text-gray hover states).
- Segmented toggles (`flex-1`, conditional classes for active/inactive).
- Inline link-style buttons (`text-[10px] hover:underline`).
- Toolbar zoom controls (`+`, `-`, `Fit`, compact rounded).

## Consistency Problems
- Same semantics styled differently per module (especially `outlets`, `uploads`, `racks`, `frames`).
- Confirm/delete UI patterns are duplicated and inconsistent.
- Inputs/selects repeat near-identical utility classes in many files.
- Accessibility consistency varies (some controls rely on color only; focus styles differ).
- Two button component systems increase maintenance and migration friction.

## Recommended Component Direction
- Standardize on one app-level control set exported from `$lib`.
- Keep `src/lib/ui/Button.svelte` as the canonical button entry point and absorb missing capabilities.
- Align `Input` and `Select` APIs so form fields share size, status, and label/help behavior.

### Proposed `Button` API (single source)
- Props:
- `variant`: `primary | secondary | outline | ghost | danger | link`
- `size`: `xs | sm | md | lg | icon`
- `loading`: boolean (shows spinner, disables click)
- `icon`: icon name
- `iconOnly`: boolean (auto size/aria expectations)
- `confirm`: optional `{ text?: string }` for small inline confirmation flows
- `href`: string (anchor mode)
- `active`, `group`: keep existing behavior

- Behavior:
- Sensible defaults for `type="button"`.
- Consistent disabled and focus-visible styles.
- Optional built-in icon spacing rules.

### Proposed `Input` API
- Props:
- `type`, `value`, `label`, `placeholder`, `disabled`, `required`
- `size`: `sm | md | lg`
- `state`: `default | error | success`
- `hint`, `error`
- `multiline` (or keep `type='textarea'`, but make naming explicit and documented)

- Behavior:
- Remove element-scoped CSS that conflicts with utility classes.
- Unified class tokens with Select.

### Proposed `Select` API
- Props:
- `value`, `label`, `disabled`, `required`, `size`, `state`, `hint`, `error`
- Behavior:
- Match Input spacing, border, focus, and typography tokens.
- Optional placeholder option handling.

## Suggested Migration Plan
- Phase 1: Define design tokens and variant map inside `Button`, `Input`, `Select`.
  - Implement src\lib\ui\ButtonNew.svelte InputNew.svelte and SelectNew.svelte and change $lib\index.ts to use them
- Phase 2: Migrate high-volume hotspots first:
- `src/routes/projects/[pid]/uploads/parts/PdfViewer.svelte`
- `src/routes/projects/[pid]/outlets/Outlets.svelte`
- `src/routes/projects/[pid]/outlets/parts/OutletCanvas.svelte`
- `src/routes/projects/[pid]/outlets/trunks/TrunkPalette.svelte`
- Phase 3: Replace duplicated confirm/delete button pairs with standard patterns.
- Phase 4: Remove or explicitly deprecate duplicate button system at `src/lib/components/ui/button/button.svelte` (or invert: adopt it as canonical and re-export through `$lib`).

## Immediate Wins
- Introduce `size` and `ghost` variants to `src/lib/ui/Button.svelte` first.
- Add shared field classes in `Input` and `Select` so repeated class strings can be removed from outlets/racks/forms.
- Add lint or grep checks in CI to flag new raw control patterns in migrated areas.

## Notes
- Counts above come from `src/**/*.svelte` only.
- This document is inventory + direction. It does not yet perform the component refactor.
