// The tool strip's TOOLS in their groups (split out of ToolStrip.svelte so the agent guide, a server route, reads them).
// Grouping (Dave 2026-10-15, "better grouping of the tools overall"): Select / modify · Draw (2D) · Build (3D: box,
// wall, opening) · Spaces and views (room, section) · Annotate (with Dimension's Measure and Guide lines) · Cabling ·
// Drawings. TOOL_FAMILIES = the strip's buttons (tool strip option 2, "flyouts"): a family is ONE button showing the
// item last used from it; its corner mark, a long press or a click on it while it's in use opens the others. An item is
// a tool, or a tool with a VARIANT ("shape:polygon", "box:ellipse" = a cylinder) — the Shape / Box tools' kinds.
import { KEYS } from './shellKeys'
import type { ToolId } from '../app/workspace.svelte'
export const TOOL_GROUPS: { name: string; tools: { id: ToolId; label: string; icon: string }[] }[] = [
	{ name: 'Select / modify', tools: [{ id: 'select', label: `Select (${KEYS.esc})`, icon: 'k-select' }, { id: 'move', label: 'Move', icon: 'move' }, { id: 'copy', label: 'Copy', icon: 'copy' }, { id: 'array', label: 'Array', icon: 'grid' }, { id: 'rotate', label: 'Rotate', icon: 'rotateRight' }, { id: 'mirror', label: 'Mirror', icon: 'flip' }, { id: 'match', label: 'Format painter', icon: 'paintbrush' }, { id: 'renumber', label: 'Renumber', icon: 'tag' }] },
	{ name: 'Draw', tools: [{ id: 'line', label: 'Line', icon: 'k-line' }, { id: 'shape', label: 'Shape (rectangle, polygon, ellipse, arc)', icon: 'rect' }] },
	{ name: 'Build (3D)', tools: [{ id: 'box', label: 'Box / desk (box, cylinder, polygon)', icon: 'box' }, { id: 'wall', label: 'Wall', icon: 'brickWall' }, { id: 'opening', label: 'Opening (door, window, hole)', icon: 'doorOpen' }] },
	{ name: 'Spaces and views', tools: [{ id: 'room', label: 'Room (an EPS round a riser)', icon: 'squareDashed' }, { id: 'section', label: 'Section (a wall or room elevation)', icon: 'k-elevmark' }] },
	{ name: 'Annotate', tools: [{ id: 'dimension', label: 'Dimension', icon: 'ruler' }, { id: 'measure', label: 'Measure a distance (nothing drawn)', icon: 'moveHorizontal' }, { id: 'guide', label: 'Guide lines (your screen only)', icon: 'crosshair' }, { id: 'text', label: 'Text', icon: 'k-text' }, { id: 'leader', label: 'Callout', icon: 'callout' }, { id: 'cloud', label: 'Revision cloud', icon: 'highlighter' }, { id: 'legend', label: 'Legend', icon: 'list' }, { id: 'insert', label: 'Insert a block', icon: 'package' }] },
	{ name: 'Cabling', tools: [{ id: 'outlet', label: 'Outlet', icon: 'circleDot' }, { id: 'trunk', label: 'Trunk', icon: 'route' }, { id: 'conduit', label: 'Conduit', icon: 'rows' }, { id: 'rack', label: 'Rack', icon: 'server' }, { id: 'device', label: 'Device', icon: 'pcCase' }, { id: 'cord', label: 'Patch cord', icon: 'cable' }] },
	{ name: 'Drawings', tools: [{ id: 'viewport', label: 'Viewport (draw a box on the sheet)', icon: 'panels' }] },
]

/** One tool by id (its label and icon). */
export const toolInfo = (id: ToolId) => TOOL_GROUPS.flatMap((g) => g.tools).find((t) => t.id === id)

/** The Shape / Box tools' kinds as flyout items (Dave 2026-10-15: Rectangle, Polygon, Ellipse, Arc; Box, Cylinder,
 *  Polygon). */
export const VARIANTS: Record<string, { label: string; icon: string }> = {
	'shape:rect': { label: 'Rectangle', icon: 'rect' }, 'shape:polygon': { label: 'Polygon', icon: 'hexagon' },
	'shape:ellipse': { label: 'Ellipse', icon: 'k-ellipse' }, 'shape:arc': { label: 'Arc (3 points)', icon: 'k-arc' },
	'box:rect': { label: 'Box / desk', icon: 'box' }, 'box:ellipse': { label: 'Cylinder', icon: 'k-cylinder' }, 'box:polygon': { label: 'Polygon box', icon: 'pentagon' },
	// the Section tool: a cut line, or a drawn room's four walls (Dave 2026-10-15)
	'section:line': { label: 'Section (a cut line)', icon: 'k-section' }, 'section:room': { label: 'Room elevations (A–D: click inside a room)', icon: 'k-elevmark' },
}
/** A flyout item: its tool and variant ("shape:polygon" → shape, polygon). */
export const itemOf = (item: string): { tool: ToolId; variant?: string } => { const [tool, variant] = item.split(':'); return { tool: tool as ToolId, ...(variant ? { variant } : {}) } }
export const itemLabel = (item: string) => VARIANTS[item]?.label ?? toolInfo(itemOf(item).tool)?.label ?? item
export const itemIcon = (item: string) => VARIANTS[item]?.icon ?? toolInfo(itemOf(item).tool)?.icon ?? 'square'

/** The strip's buttons, by group: each a family of items (one = a plain button). 18 buttons. */
export const TOOL_FAMILIES: { name: string; families: string[][] }[] = [
	{ name: 'Select / modify', families: [['select'], ['move', 'copy', 'array', 'rotate', 'mirror'], ['match', 'renumber']] },
	{ name: 'Draw', families: [['line'], ['shape:rect', 'shape:polygon', 'shape:ellipse', 'shape:arc']] },
	{ name: 'Build (3D)', families: [['box:rect', 'box:ellipse', 'box:polygon'], ['wall'], ['opening']] },
	{ name: 'Spaces and views', families: [['room'], ['section:line', 'section:room']] },
	{ name: 'Annotate', families: [['dimension', 'measure', 'guide'], ['text', 'leader', 'cloud'], ['legend', 'insert']] },
	{ name: 'Cabling', families: [['outlet'], ['trunk', 'conduit'], ['rack', 'device'], ['cord']] },
	{ name: 'Drawings', families: [['viewport']] },
]
