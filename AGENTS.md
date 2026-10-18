# AGENTS.md

This file provides guidance to Codex (Codex.ai/code) when working with code in this repository.

## Build & Dev Commands

- `pnpm dev` — Start dev server
- `pnpm build` — Production build
- `pnpm check` — Run svelte-check for type errors
- `pnpm test` — Run Vitest tests (browser via Playwright + node)
- `pnpm test:unit` — Run unit tests in watch mode

## Tech Stack

- **SvelteKit 2** with **Svelte 5** (runes only — `$state()`, `$derived()`, `$effect()`, `$props()`, `$bindable()`)
- **Tailwind CSS v4** with `@tailwindcss/vite` plugin
- **Firebase/Firestore** for auth and database
- **UploadThing** for file uploads
- **pdfjs-dist** for PDF rendering
- **Vercel** deployment via `@sveltejs/adapter-vercel`
- **pnpm** package manager (engine-strict)

## Svelte 5 Rules

- Never use `$:` reactive statements — use `$derived()` or `$effect()` instead
- `onclick|stopPropagation` is NOT valid syntax. Use `onclick={e => { e.stopPropagation(); handler() }}`
- `{@const}` must be immediate child of `{#if}`, `{#each}`, `{:else}`, `{#snippet}` — not inside HTML elements
- Use `{@render children?.()}` instead of deprecated `<slot />`
- Props use `$props()`, bindable props use `$bindable()`

## Architecture

### Routing

All project tools live under `src/routes/projects/[pid]/`:

- `/frames/` — Patch Frame Port Allocation (labeling, panel layout)
- `/racks/` — Rack Elevations (server room device management)
- `/uploads/` — Floorplan Uploads (PDF viewer with origin/scale/crop tools)
- `/api/uploadthing/` — File upload API endpoint

Each tool has a `+page.svelte` entry point that subscribes to Firestore, and a main component (e.g., `Frames.svelte`, `Racks.svelte`, `Uploads.svelte`) with sub-components in a `parts/` subdirectory.

### Shared Library (`src/lib/`)

**Barrel exports** via `src/lib/index.ts`: Button, Dialog, Dropdown, Icon, Input, Row, Select, Search, Spacer, Spinner, Titlebar, Truncate, Window, Firestore, Session

**`db.svelte.ts`** — Firestore wrapper class with:

- `subscribeOne(table, id, callback)` — real-time single doc
- `subscribeMany(path, callback)` — real-time collection
- `subscribeWhere(path, field, value, callback)` — filtered subscription
- `save(path, data)` — upsert with `merge: true`
- `saveBatch(path, docs)` — batch writes with `serverTimestamp`
- Session class handles Firebase auth (Google/GitHub/Microsoft OAuth)

**`ui/Icon.svelte`** — Maps camelCase names to `@lucide/svelte` icons. Use names like `chevronLeft`, `fileText`, `crosshair`, not kebab-case.

### Firestore Collections

- `projects/{pid}` — Project metadata
- `frames/{pid}` — Single doc with zones, frames, rooms, customLocationTypes
- `racks/{pid}` — Rack layouts, devices, library
- `files/{fileId}` — Uploaded file metadata (url, key, size, pageCount, pages with origin/scale/crop per page)
- `logs/{projectId}/{tool}` — Change audit logs

### Pan/Zoom Pattern

The racks, frames, and uploads tools all use a similar canvas pattern:
- CSS `transform: translate(Xpx, Ypx) scale(Z)` with `transform-origin: 0 0`
- Right/middle-click to pan, ctrl/alt/meta+wheel to zoom view. Right+wheel to zoom
- SVG overlays positioned absolutely over a canvas or div
- Wheel listener attached with `{ passive: false }` for `preventDefault()`
- Use `tick()` (not `requestAnimationFrame`) for DOM timing after state changes

### Port Label Format (Frames tool)

`FF.Z.NNN-SPP` where FF=floor, Z=zone, NNN=location number, S=server room, PP=port. `-H` suffix for high-level ports.

## Environment

- Firebase config is hardcoded in `db.svelte.ts` (project: sunny-jetty-180208)
- App locale is `'ja'` (Japanese)
- Dont use cd unnecessarily to change to the current working directory


# Timeless constraints (not a checklist)

When two principles collide, pick the one that cuts future cost in THIS codebase.

HARD RULE: refactor to the principle FIRST, then change behavior.

1. Separation of Concerns — one kind of work per part (UI / domain / persistence / infra). Root principle.
2. Encapsulation / Information Hiding — small stable contract; hide internals.
3. High Cohesion + Loose Coupling — change-together lives together; independents talk narrow.
4. DRY — one authoritative representation of each piece of *knowledge* (not every similar line). Avoid over-DRY.
5. KISS — simplest design that works; complexity is the long-term tax.
6. Single Responsibility — one reason to change.
7. Depend on Abstractions — policy doesn’t depend on details; both depend on contracts.
8. YAGNI — no speculative features, frameworks, or “later” hooks.
9. Composition over Inheritance — assemble pieces; don’t grow fragile hierarchies.
10. Open/Closed (with discipline) — extend at stable boundaries; only where change showed up twice.

Honorable: Law of Demeter · fail fast / illegal states unrepresentable · optimize for deletion · Unix do-one-thing + compose.

Treat as constraints. Violate slogans when judgment says so.