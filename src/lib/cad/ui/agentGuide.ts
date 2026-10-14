// The AGENT GUIDE (Dave 2026-10-14): one plain-text page, served at /cad/agent, that a user can point an LLM at
// before it drives cad in their browser without the source. The concepts, the URL, how to type rather than click, how
// to check each step, and recipes are written here; the tools, windows, keys and how-tos come from the same lists as
// Help (toolGroups.ts, toolHints.ts, shellKeys.ts, helpContent.ts), so the page can't fall behind the app.
import { TOOL_GROUPS } from './toolGroups'
import { HINT } from './toolHints'
import { SHORTCUTS, FKEYS, HOWTO, HOWTO_AREAS } from './helpContent'
import { WIN_TITLES } from '../app/windows.svelte'

const GUIDE = `# EOS cad — a guide for an AI assistant driving it in a browser

You are helping a user design ICT cabling for a building (outlets, containment, server rooms, racks, patching) and
issue drawings, by operating the cad tool in their browser. You can't see the source code; this page is what you need.
The full how-to list is at the end — search it for the task in hand.

## Ground rules

- Work only in the project the user names. Every change saves at once (there is no Save button) and other people may
  have the project open, so nothing is a scratch copy.
- Ask the user before anything that deletes a level, a server room or a sheet, restores a backup, imports, issues a
  package, or downloads a file (everything under File › Export downloads).
- Don't sign in, enter passwords or accept dialogs about accounts: if cad says "Sign in", ask the user.
- After every step, CHECK it (see "Checking your work"). If something went wrong, Ctrl+Z undoes it — one undo per
  step, and the status bar says what came back.

## What is in a project

- **Levels** (floors: B1, 1F, 2F …). Each has a **plan** (top view, model millimetres) and may have a floorplan PDF
  under it. Elevations (front / rear / left / right), sections and the riser view show the same model from the side.
- **Building**: walls (with openings), boxes (desks, furniture), sections.
- **Cabling**: outlets (each with ports and a label like 03.1.042), runs — trunks, conduits, trays — drawn as paths
  with a width and a height, server rooms with rows of racks, devices in racks (patch panels, switches), and patch
  cords between ports. Outlets are allocated to panel ports; routes and fill are worked out along the runs.
- **Annotation**: text (optionally Markdown), leaders, dimensions, revision clouds, legends, blocks (symbols and 3D
  furniture from the global block library), images.
- **Sheets**: paper drawings with a title block and **viewports** that each show a view at a scale. Sheets are issued
  as PDFs, in packages, with revisions.
- **Layers**: each project has its own; each viewport on a sheet hides layers independently.

## The screen

- Top: the menu bar (File, Edit, View, Insert, Cabling, Tables, Sheets, Project, Window, Help).
- Under it: the **tool strip** — icon buttons whose aria-label is the tool's name (find them by that). A greyed tool
  doesn't work in this view; its title says where it does. Under the strip: the **options row** for the active tool
  (layer chip, sizes, heights).
- Middle: one or two **panes** (View › Split), each with a tab strip (open views and sheets) and a **view strip**:
  Plan · Elevation… · Riser · Section… · Display ▾ · To sheet… (a rack view has its own buttons).
- Windows (Window menu; docked left / right or floating, each with a title bar): ${Object.values(WIN_TITLES).join(', ')}.
  **Properties** shows and edits whatever is selected. **Navigator** lists levels, views, sheets, rooms and racks.
- Bottom: the **tables** (Ctrl+, shows / hides them): Outlets, Patching, Sheets, Links — plain HTML tables you can read.
- Very bottom: the **status bar** — on the left the prompt box when cad asks for a value, else the latest message,
  else the active tool's hint; then "N selected", the cursor / length readout, SNAP + grid step, OSNAP, GRID, the
  scale, the zoom, Fit, and the ACAD / EOS input switch.

## The URL

\`/projects/<projectId>/cad?level=<levelId>&v=<view>[,<view>]&a=<active pane 0|1>\`

Views: \`plan\` · \`front\` \`rear\` \`left\` \`right\` (elevations) · \`riser\` · \`section.<sectionId>\` ·
\`row.<roomId>.front|rear[.<rowId>]\` (a rack view) · \`sheet.<sheetId>\` · \`ports.<rackId>\` ·
\`schedule.patch.<roomId|all>\` · \`portmap.<deviceId>~<deviceId>\`. Two comma-separated views = a split screen.
The address bar follows what is open, so read it to know where you are, and load a URL to go straight back. Ids are
opaque: get them from the URL after opening something via the Navigator (Ctrl+K searches it), not by guessing.

## Coordinates and typing (prefer typing to clicking)

Clicking on the drawing from a screenshot is imprecise; typed values are exact. With a drawing tool active, type a
digit, \`@\`, \`.\` or \`-\` while the drawing has focus: the prompt box opens in the status bar with that character;
finish the value and press Enter.

- Units are millimetres. On a plan or a sheet, x goes right and **y goes DOWN the screen**; in an elevation / section
  y is the HEIGHT above the floor. Typed angles are degrees, anticlockwise from +x.
- \`x,y\` absolute · \`@dx,dy\` relative to the last point · \`@d<a\` polar from the last point · a single number = that
  distance towards the cursor. A numpad \`..\` works as the comma (\`1200..600\`).
- A path tool (line, wall, trunk, conduit, cloud) takes points until Enter (with the prompt closed) finishes; C closes
  it into a loop; Backspace drops the last point; Esc ends it, and Esc again returns to Select.
- Some tools read their own values: Box takes \`width,depth\` after its first corner; Rotate takes degrees.
- Sizes, heights, names and labels are set afterwards in Properties (inputs — type and press Enter / Tab).
- To learn where things are, point at them and read the cursor readout, or select one and read Properties' Position.

## Focus and keys

Keys go to cad only when the focus is NOT in a text field. If a key does nothing, press Esc (or click an empty part
of the status bar) and try again; Esc repeated also cancels the tool, deselects and leaves a viewport. The ACAD / EOS
switch on the status bar changes the mouse (ACAD: wheel zooms, click points; EOS: wheel pans, press-drag draws) —
typed input is the same in both. Home fits the view; Z then E / W / P zooms extents / window / previous.

## Checking your work

1. **The message** after each action — the status bar's left end, or a short toast over the drawing — says what was made, moved or refused (e.g. "This tool takes
   no typed points", "Drawn on the Furniture layer").
2. **"N selected"** and **Properties** — select the thing you made (it usually stays selected) and read its fields.
3. **The tables** (Ctrl+,) — outlets with their labels, ports and panel ports; cords; sheets with numbers and
   revisions. Reading a table is the most reliable check of cabling work.
4. **A screenshot** for geometry and layout, after Home (fit) or Shift+Home (zoom to the selection).
5. **Help** (F1) is the same how-to list as below, searchable, inside the app.

## Recipes

Each is a sequence of the how-tos below; read the matching how-to first.

1. **Open a level**: Ctrl+K, type the level name (e.g. 3F), ↓ to its row, Enter; or load the URL with its \`level\` and \`v=plan\`.
2. **A room's walls**: pick Wall; type \`0,0\` Enter, \`@6000,0\` Enter, \`@0,4000\` Enter, \`@-6000,0\` Enter, then C
   to close. Openings: the Opening tool, then click a wall. Check: select a wall, read Properties.
3. **Outlets along a wall**: pick Outlet; type the first point, then \`@1200,0\` Enter for each next one. Set usage,
   ports and zone in Properties (several selected = all at once); labels come from the project's label format.
   Check: the Outlets table.
4. **Containment**: pick Trunk (or Conduit); type its points; Enter. Snap its ends onto outlets or racks to attach
   (OSNAP on, F3). Width, height and bend radius in Properties. Check: Display ▾ › Routes shows cable routes.
5. **A server room and racks**: Window › Racks › + Server room; then the Rack tool on the plan (room, row, size in
   the options row / Properties). Devices: open the room's rack view (Window › Racks › Rack view), Window › Device
   library, pick a template, click a rack at a U.
6. **Allocate and patch**: select outlets in the Outlets table, then Allocate N on the table's bar (how-to
   "Allocate outlets to panel ports"); patch with the Patch cord tool in a rack view (click a port, then the other).
   Check: the Patching table.
7. **Furniture**: on a plan pick Box; click or type a corner, type \`width,depth\` Enter; set its height and Z in the
   options row. Select the boxes and Make block to save them as a block (Blocks window) to place again.
8. **A sheet**: in the view, To sheet… (a new sheet or an existing one, at a scale that fits), or Sheets › New
   sheet, then the Viewport tool. Title block: Sheets › Title block…. Check: the Sheets table; open the sheet tab.
9. **A PDF**: open the sheet, File › Export › PDF of this sheet — this downloads, so ask the user first.

## Gotchas

- A tool that works only in some views is greyed elsewhere; clicking it opens the level's plan when it works there
  (rack-view and sheet tools: switch the view yourself).
- New things go on the layer shown on the options row's Layer chip; drawing onto a layer you had hidden shows it again.
- Typing in a table doesn't reach the drawing; a Properties field hands the keys back after Enter (keeps it) or Esc
  (puts it back).
- Undo is per user and per session; a page reload empties it.
- A message like "No run … serving its room — draw a … run within 10 m, or tick its server room in a run's Serves" is
  cad telling you the model is incomplete, and what to add.
`

const row = (cells: string[]) => `| ${cells.map((c) => c.replace(/\|/g, '\\|')).join(' | ')} |`

/** The whole guide as Markdown (plain text is fine to read). */
export function agentGuide(): string {
	const tools = TOOL_GROUPS.map((g) => `### ${g.name}\n\n${g.tools.map((t) => `- **${t.label}**${HINT[t.id] ? ` — ${HINT[t.id]}` : ''}`).join('\n')}`).join('\n\n')
	const keys = ['| What | Keys |', '| --- | --- |', ...SHORTCUTS.map(([l, k]) => row([l, k])), ...FKEYS.map(([k, l]) => row([l, k]))].join('\n')
	const howto = (Object.keys(HOWTO_AREAS) as (keyof typeof HOWTO_AREAS)[]).map((a) =>
		`### ${HOWTO_AREAS[a]}\n\n${HOWTO.filter((h) => h.area === a).map((h) => `**${h.q}** — ${h.a}`).join('\n\n')}`).join('\n\n')
	return `${GUIDE}\n## Tools (the tool strip, by aria-label) and their hints\n\n${tools}\n\n## Keys and mouse\n\n${keys}\n\n## How to … (the same list as Help, F1)\n\n${howto}\n`
}
