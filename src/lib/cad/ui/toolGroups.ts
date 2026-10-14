// The tool strip's TOOLS in their groups (split out of ToolStrip.svelte so the agent guide, a server route, reads them).
import { KEYS } from './shellKeys'
import type { ToolId } from '../app/workspace.svelte'
export const TOOL_GROUPS: { name: string; tools: { id: ToolId; label: string; icon: string }[] }[] = [
	{ name: 'Select / modify', tools: [{ id: 'select', label: `Select (${KEYS.esc})`, icon: 'k-select' }, { id: 'move', label: 'Move', icon: 'move' }, { id: 'copy', label: 'Copy', icon: 'copy' }, { id: 'array', label: 'Array', icon: 'grid' }, { id: 'rotate', label: 'Rotate', icon: 'rotateRight' }, { id: 'mirror', label: 'Mirror', icon: 'flip' }] },
	{ name: 'Draw', tools: [{ id: 'line', label: 'Line', icon: 'k-line' }, { id: 'shape', label: 'Shape (rectangle, ellipse, polygon, arc)', icon: 'rect' }, { id: 'box', label: 'Box / desk', icon: 'box' }, { id: 'dimension', label: 'Dimension', icon: 'ruler' }, { id: 'guide', label: 'Guide lines (your screen only)', icon: 'crosshair' }] },
	{ name: 'Annotate', tools: [{ id: 'text', label: 'Text', icon: 'k-text' }, { id: 'leader', label: 'Leader', icon: 'callout' }, { id: 'cloud', label: 'Revision cloud', icon: 'highlighter' }, { id: 'legend', label: 'Legend', icon: 'list' }, { id: 'insert', label: 'Insert a block', icon: 'package' }] },
	{ name: 'Building', tools: [{ id: 'wall', label: 'Wall', icon: 'brickWall' }, { id: 'room', label: 'Room (an EPS round a riser)', icon: 'doorOpen' }, { id: 'opening', label: 'Opening (door, window, hole)', icon: 'opening' }, { id: 'section', label: 'Section', icon: 'scan' }] },
	{ name: 'Cabling', tools: [{ id: 'outlet', label: 'Outlet', icon: 'circleDot' }, { id: 'trunk', label: 'Trunk', icon: 'route' }, { id: 'conduit', label: 'Conduit', icon: 'rows' }, { id: 'rack', label: 'Rack', icon: 'server' }, { id: 'device', label: 'Device', icon: 'pcCase' }, { id: 'cord', label: 'Patch cord', icon: 'cable' }, { id: 'renumber', label: 'Renumber', icon: 'tag' }] },
	{ name: 'Sheet', tools: [{ id: 'viewport', label: 'Viewport (draw a box on the sheet)', icon: 'panels' }] },
]
