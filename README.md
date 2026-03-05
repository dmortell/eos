# EOS

EOS is a set of tools for managing IT Infrastructure related projects.

## Tech Stack

- **Framework**: SvelteKit with Svelte v5 (runes)
- **Styling**: Tailwind CSS v4
- **Icons**: @lucide/svelte, available via `import { Icon } from '$lib'`
- **UI Components**: Custom components in `$lib/ui` - `import { Button, Input, Row, Icon } from '$lib'` (see `lib/index.ts`). shadcn-svelte components can be added if needed.
- **Auth**: Firebase authentication 
- **Database**: Firestore with realtime subscriptions
- **Deployment**: Vercel via GitHub
- **Package Manager**: pnpm (preferred)
- **Testing**: Vitest + Playwright

## Tools

### Patch Frame Port Allocation

The port allocator tool generates a visual representation of data patch frames showing LAN port outlet labels assigned to each port position. It is used during infrastructure design to plan and document structured cabling layouts.

**Entry point**: `src/routes/projects/[pid]/frames/Frames.svelte`
**Sub-components**: `src/routes/projects/[pid]/frames/parts/`

#### Labeling Format

| Segment | Format | Description |
|---------|--------|-------------|
| Floor | `FF` | 01 to 20 |
| Zone | `Z` | A to Z |
| Location | `NNN` | 001 to 999 |
| Server Room | `S` | A or B |
| Port Number | `PP` | 01 to 99 per location |

- **Floor port label**: `FF.Z.NNN-SPP` (e.g., `03.B.012-A02`)
- **High-level ceiling port**: `FF.Z.NNN-SPP-H` (e.g., `03.B.012-A01-H`)

#### Configuration

- Enter floor, zone, and number of locations in that zone
- Per location: set number of data ports (1-99, default 2; some locations may need more, e.g. 24 for an AV rack)
- Each location can be assigned a type via quick-select grouped buttons: desk, AP, PR (printer), RS (room scheduler), FR (facial recognition), WC (world-clock), TV, LK (lockers), etc. Additional types can be added in settings.
- Location numbers can be assigned a 4-digit room number for floorplan reference. A room number editor allows assigning room names.
- Most floors have one server room, but some have two (A and B). Ports from a single outlet box can be split across server rooms (e.g., 4 ports: 2 to room A, 2 to room B) with bulk assignment actions (Split 50/50, All A, All B).
- Select a group of outlets using shift-click or ctrl-click for editing simultaneously

#### Frame Layout

- Patch frames are 45U by default (configurable)
- Each patch panel is high-density: 48 ports per RU (two rows of 24 ports)
- High-level ceiling panels are kept separate from floor port panels
- RU numbering starts at RU 1 at the bottom
- Configurable top/bottom RU boundaries for patch panel placement
- Multiple patch frames may be needed per server room

#### Frame Customization

- Blanking panels at specific RU positions
- 1U or 2U horizontal cable management at specific RU positions
- Network devices of various sizes can be placed in the frame

#### UI Layout

- Port editor list in sidebar with realtime frame drawing in the main content area
- View toggle: sidebar layout or stacked vertical layout (outlet list above frame drawing) for narrow screens
- Pan/zoom on frame drawing with auto-scroll to the panel of a selected port
- Light mode theme preferred, or light/dark toggle in titlebar

#### Export

- Export patch frame drawings to Excel

#### Data Storage

Patch frame data is stored in Firestore at `frames/{pid}` (where pid is the project id). All patch frames for a project are stored together in one document.

#### Future Features

- Outlet ports defined as Copper or Fiber, with copper/fiber panel locations specified per frame

## Developing

```sh
pnpm install
pnpm dev

# or open in browser automatically
pnpm dev --open
```

## Building

```sh
pnpm build
pnpm preview  # preview the production build
```

## Project Setup

To recreate this project from scratch with the same configuration:

```sh
pnpm dlx sv@0.12.4 create --template minimal --types ts --add vitest="usages:unit,component" tailwindcss="plugins:none" sveltekit-adapter="adapter:vercel" devtools-json --install pnpm .
```
