# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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
- Right/middle-click pans, ctrl/alt/meta+wheel zooms. Right+wheel zooms
- SVG overlays positioned absolutely over a canvas or div
- Wheel listener attached with `{ passive: false }` for `preventDefault()`
- Use `tick()` (not `requestAnimationFrame`) for DOM timing after state changes

### Port Label Format (Frames tool)

`FF.Z.NNN-SPP` where FF=floor, Z=zone, NNN=location number, S=server room, PP=port. `-H` suffix for high-level ports.

## Environment

- `.env` requires `UPLOADTHING_TOKEN`
- Firebase config is hardcoded in `db.svelte.ts` (project: sunny-jetty-180208)
- App locale is `'ja'` (Japanese)
- Dont use cd unnecessarily to change to the current working directory
