// The tool strip's TOOLS in their groups (split out of ToolStrip.svelte so the agent guide, a server route, reads them).
// The groups follow the menus (option 2, Dave 2026-10-15): Select / modify · Draw · Annotate · Building · Cabling ·
// Drawings. TOOL_FAMILIES = the strip's buttons (tool strip option 2, "flyouts"): a family is ONE button showing the
// tool last used from it; its corner mark opens the others.
import { KEYS } from './shellKeys'
import type { ToolId } from '../app/workspace.svelte'
export const TOOL_GROUPS: { name: string; tools: { id: ToolId; label: string; icon: string }[] }[] = [
	{ name: 'Select / modify', tools: [{ id: 'select', label: `Select (${KEYS.esc})`, icon: 'k-select' }, { id: 'move', label: 'Move', icon: 'move' }, { id: 'copy', label: 'Copy', icon: 'copy' }, { id: 'array', label: 'Array', icon: 'grid' }, { id: 'rotate', label: 'Rotate', icon: 'rotateRight' }, { id: 'mirror', label: 'Mirror', icon: 'flip' }, { id: 'match', label: 'Format painter', icon: 'paintbrush' }, { id: 'renumber', label: 'Renumber', icon: 'tag' }] },
	{ name: 'Draw', tools: [{ id: 'line', label: 'Line', icon: 'k-line' }, { id: 'shape', label: 'Shape (rectangle, ellipse, polygon, arc)', icon: 'rect' }, { id: 'box', label: 'Box / desk', icon: 'box' }, { id: 'measure', label: 'Measure a distance (nothing drawn)', icon: 'moveHorizontal' }, { id: 'guide', label: 'Guide lines (your screen only)', icon: 'crosshair' }] },
	{ name: 'Annotate', tools: [{ id: 'dimension', label: 'Dimension', icon: 'ruler' }, { id: 'text', label: 'Text', icon: 'k-text' }, { id: 'leader', label: 'Callout', icon: 'callout' }, { id: 'cloud', label: 'Revision cloud', icon: 'highlighter' }, { id: 'legend', label: 'Legend', icon: 'list' }, { id: 'insert', label: 'Insert a block', icon: 'package' }] },
	{ name: 'Building', tools: [{ id: 'wall', label: 'Wall', icon: 'brickWall' }, { id: 'room', label: 'Room (an EPS round a riser)', icon: 'doorOpen' }, { id: 'opening', label: 'Opening (door, window, hole)', icon: 'opening' }, { id: 'section', label: 'Section', icon: 'scan' }] },
	{ name: 'Cabling', tools: [{ id: 'outlet', label: 'Outlet', icon: 'circleDot' }, { id: 'trunk', label: 'Trunk', icon: 'route' }, { id: 'conduit', label: 'Conduit', icon: 'rows' }, { id: 'rack', label: 'Rack', icon: 'server' }, { id: 'device', label: 'Device', icon: 'pcCase' }, { id: 'cord', label: 'Patch cord', icon: 'cable' }] },
	{ name: 'Drawings', tools: [{ id: 'viewport', label: 'Viewport (draw a box on the sheet)', icon: 'panels' }] },
]

/** One tool by id (its label and icon). */
export const toolInfo = (id: ToolId) => TOOL_GROUPS.flatMap((g) => g.tools).find((t) => t.id === id)

/** The strip's buttons, by group: each a family of tools (one = a plain button). ~19 buttons for the 32 tools. */
export const TOOL_FAMILIES: { name: string; families: ToolId[][] }[] = [
	{ name: 'Select / modify', families: [['select'], ['move', 'copy', 'array', 'rotate', 'mirror'], ['match', 'renumber']] },
	{ name: 'Draw', families: [['line'], ['shape'], ['box'], ['measure', 'guide']] },
	{ name: 'Annotate', families: [['dimension'], ['text', 'leader', 'cloud'], ['legend', 'insert']] },
	{ name: 'Building', families: [['wall'], ['opening'], ['room'], ['section']] },
	{ name: 'Cabling', families: [['outlet'], ['trunk', 'conduit'], ['rack', 'device'], ['cord']] },
	{ name: 'Drawings', families: [['viewport']] },
]
