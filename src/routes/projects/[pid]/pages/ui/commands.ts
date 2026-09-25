// The COMMAND LINE's vocabulary + parsing (Kestrel CAD's command line, ported): every command has an id, a label,
// its typed names ("LINE · L" — the first is the full name, the rest aliases) and a description. A line of input
// is split into parts by ';' and tokens by whitespace; each token is a command name, a COORDINATE (x,y absolute /
// @dx,dy relative / d<angle or @d<angle polar), a NUMBER (a direct distance while drawing, or a command's
// argument), or ENTER / ESC / C (close) / U (undo the last point). Pure — the page runs the commands.
import type { Pt } from './geometry'

export type CmdGroup = 'Draw' | 'Modify' | 'Inquiry' | 'View' | 'Settings' | 'Edit' | 'File' | 'Panels' | 'Help'
export type CmdDef = { id: string; label: string; names: string; description: string; group: CmdGroup; /** takes an argument (a number / a vector) */ arg?: string }

const C = (id: string, label: string, names: string, description: string, group: CmdGroup, arg?: string): CmdDef => ({ id, label, names, description, group, arg })
export const COMMANDS: CmdDef[] = [
	// draw — each arms a tool; coordinates typed next are its points
	C('line', 'Line', 'LINE · L · PLINE · PL', 'Draw a line / polyline (Enter finishes, C closes)', 'Draw'),
	C('rect', 'Rectangle', 'RECTANG · REC · RECT', 'Draw a rectangle from two corners', 'Draw'),
	C('ellipse', 'Ellipse / circle', 'ELLIPSE · EL · CIRCLE · C', 'Draw an ellipse (Shift = a circle) from two corners', 'Draw'),
	C('dim', 'Dimension', 'DIMLINEAR · DIM · DLI · DAL', 'Dimension between two points', 'Draw'),
	C('text', 'Text', 'TEXT · T · DT · MTEXT', 'Place text', 'Draw'),
	C('wall', 'Wall', 'WALL · WA', 'Draw a wall run', 'Draw'),
	C('trunk', 'Trunk', 'TRUNK · TK', 'Draw a cable trunk run', 'Draw'),
	C('pipe', 'Pipe', 'PIPE · PI', 'Draw a pipe / conduit run', 'Draw'),
	C('box', 'Box (furniture)', 'BOX · FURNITURE · FU', 'Draw a box from its footprint', 'Draw'),
	C('opening', 'Opening', 'OPENING · DOOR · OP', 'Draw a door / window / hole', 'Draw'),
	C('section', 'Section', 'SECTION · SEC', 'Cut a section box', 'Draw'),
	C('guide', 'Guide', 'GUIDE · XLINE · XL', 'Drop a construction guide line', 'Draw'),
	C('outlet', 'Outlet', 'OUTLET · OU', 'Place outlets (the next label each)', 'Draw'),
	C('blocks', 'Insert block', 'INSERT · I · BLOCK · B', 'Open the Blocks panel to place a block', 'Draw'),
	C('image', 'Image', 'IMAGE · IM · IMAGEATTACH', 'Insert an image', 'Draw'),
	C('select', 'Select', 'SELECT · SE', 'The Select tool', 'Draw'),
	// modify — act on the selected shapes in the active viewport
	C('erase', 'Erase', 'ERASE · E · DELETE · DEL', 'Delete the selection', 'Modify'),
	C('move', 'Move', 'MOVE · M', 'Move the selection from a base point to a second point', 'Modify'),
	C('rotate', 'Rotate', 'ROTATE · RO', 'Rotate the selection about a base point (an angle, or a point)', 'Modify'),
	C('scale', 'Scale', 'SCALE · SC', 'Scale the selection about a base point by a factor', 'Modify'),
	C('copy', 'Copy', 'COPY · CO · CP', 'Copy the selection from a base point to one or more points', 'Modify'),
	C('group', 'Group', 'GROUP · G', 'Group the selected shapes', 'Modify'),
	C('ungroup', 'Ungroup', 'UNGROUP · UG', 'Ungroup the selected shapes', 'Modify'),
	C('draworder', 'Draw order', 'DRAWORDER · DR', 'Bring the selection to the front / back, or one step above / under', 'Modify'),
	C('selectall','Select all', 'SELECTALL · AI_SELALL', 'Select every shape in the active viewport', 'Modify'),
	C('deselect', 'Deselect', 'DESELECT', 'Clear the selection', 'Modify'),
	// inquiry
	C('dist', 'Distance', 'DIST · DI', 'The distance + angle between two points', 'Inquiry'),
	// view
	C('zoom', 'Zoom', 'ZOOM · Z', 'A window (two corners), or Extents / Previous', 'View'),
	C('fit', 'Zoom extents', 'ZOOMEXTENTS · ZE · ZA', 'Fit the view', 'View'),
	C('zoomwin', 'Zoom window', 'ZOOMWINDOW · ZW', 'Zoom to a window (two corners)', 'View'),
	C('zoomprev', 'Zoom previous', 'ZOOMPREVIOUS · ZP', 'Back to the previous view', 'View'),
	C('zoomin', 'Zoom in', 'ZOOMIN · ZI', 'Zoom in', 'View'),
	C('zoomout', 'Zoom out', 'ZOOMOUT · ZO', 'Zoom out', 'View'),
	C('pan', 'Pan', 'PAN · P', 'Latch Pan (drag pans; Esc ends)', 'View'),
	C('orbit', 'Orbit', '3DORBIT · ORBIT · 3DO', 'Latch Orbit in 3D (drag orbits; Esc ends)', 'View'),
	C('plan', 'Plan view', 'PLAN · TOP', 'Look down (plan)', 'View'),
	C('front', 'Front view', 'FRONT', 'Front elevation', 'View'),
	C('rear', 'Rear view', 'BACK · REAR', 'Rear elevation', 'View'),
	C('left', 'Left view', 'LEFT', 'Left elevation', 'View'),
	C('right', 'Right view', 'RIGHT', 'Right elevation', 'View'),
	C('iso', '3D view', 'ISO · SEISO · 3D', 'The 3D view', 'View'),
	C('split', 'Split editor', 'SPLIT · VPORTS', 'Split into two panes', 'View'),
	C('unsplit', 'Unsplit', 'UNSPLIT', 'Back to one pane', 'View'),
	// settings toggles
	C('grid', 'Grid', 'GRID · F7', 'Toggle the grid', 'Settings'),
	C('snap', 'Grid snap', 'SNAP · F9', 'Toggle snapping to the grid', 'Settings'),
	C('ortho', 'Ortho', 'ORTHO · F8', 'Toggle horizontal / vertical constraint', 'Settings'),
	C('osnap', 'Object snap', 'OSNAP · F3', 'Toggle snapping to ends / middles / centres', 'Settings'),
	C('lwt', 'Lineweights', 'LWEIGHT · LWT · LW', 'Toggle lineweight display', 'Settings'),
	C('newlayer', 'New layer', 'NEWLAYER · LAYNEW', 'Add a layer (named) and make it current', 'Settings'),
	C('laymcur', 'Make layer current', 'LAYMCUR · LMC', "A shape's layer becomes the current layer", 'Settings'),
	C('defaults','Drawing defaults', 'DDEFAULTS · DEFAULTS · STYLE', 'Project drawing defaults', 'Settings'),
	// edit
	C('undo', 'Undo', 'UNDO · U', 'Undo the last edit', 'Edit'),
	C('redo', 'Redo', 'REDO', 'Redo', 'Edit'),
	// file
	C('save', 'Save', 'SAVE · QSAVE', 'Edits save as you go — this just confirms', 'File'),
	C('new', 'New page', 'NEW · QNEW', 'A new page tab', 'File'),
	C('open', 'Open project', 'OPEN', 'Pick another project', 'File'),
	C('dxfout','Export DXF', 'DXFOUT · EXPORT', 'The active view as DXF', 'File'),
	C('plot', 'Print', 'PLOT · PRINT', 'Print the sheet', 'File'),
	C('schedule', 'Outlet schedule', 'SCHEDULE · OUTLETS', 'The outlets to Excel', 'File'),
	C('drawings', 'Drawings', 'DRAWINGS · SHEETSET · SSM', 'The drawing management dialog', 'File'),
	// panels
	C('layers', 'Layers', 'LAYER · LA', 'The Layers panel', 'Panels'),
	C('props', 'Properties', 'PROPERTIES · PR · PROPS · CH', 'The Properties panel', 'Panels'),
	C('history', 'History', 'HISTORY · HI', 'The History panel', 'Panels'),
	C('blockspanel', 'Blocks panel', 'BLOCKSPANEL · BP', 'The Blocks panel', 'Panels'),
	C('help', 'Help', 'HELP · ? · F1', 'List the commands', 'Help'),
]

/** Every typed name (upper case) → its command id. */
export const ALIASES: Map<string, string> = new Map(COMMANDS.flatMap((c) => [[c.id.toUpperCase(), c.id] as [string, string], ...c.names.split('·').map((n) => [n.trim().toUpperCase(), c.id] as [string, string])]))
export const commandById = (id: string) => COMMANDS.find((c) => c.id === id)
export const primaryName = (c: CmdDef) => c.names.split('·')[0].trim()

/** Suggestions for what's typed so far: an exact name first, then names starting with it, then any match. */
export function matchCommands(query: string, max = 8): CmdDef[] {
	const q = query.trim().toUpperCase(); if (!q || /[\d,@<]/.test(q[0])) return []
	const names = (c: CmdDef) => c.names.split('·').map((n) => n.trim().toUpperCase())
	const score = (c: CmdDef) => (ALIASES.get(q) === c.id ? 0 : names(c).some((n) => n.startsWith(q)) ? 1 : c.label.toUpperCase().includes(q) || c.description.toUpperCase().includes(q) ? 2 : 9)
	return COMMANDS.map((c) => [c, score(c)] as const).filter(([, s]) => s < 9).sort((a, b) => a[1] - b[1]).slice(0, max).map(([c]) => c)
}

export type Token =
	| { kind: 'cmd'; id: string }
	| { kind: 'point'; p: Pt; rel: boolean; polar: boolean }
	| { kind: 'number'; n: number }
	| { kind: 'enter' } | { kind: 'cancel' } | { kind: 'close' } | { kind: 'undo-point' }
	| { kind: 'error'; message: string }

const NUM = /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i
export const isNumber = (t: string) => NUM.test(t)
/** A coordinate: `x,y`, `@dx,dy`, `d<a`, `@d<a` (angle in degrees, CCW from +X; Y up like CAD). */
export function parseCoord(token: string): { p: Pt; rel: boolean; polar: boolean } | null {
	let t = token.trim(); const rel = t.startsWith('@'); if (rel) t = t.slice(1)
	if (t.includes('<')) {
		const [d, a] = t.split('<'); if (!NUM.test(d) || !NUM.test(a)) return null
		const r = (Number(a) * Math.PI) / 180
		return { p: [Number(d) * Math.cos(r), Number(d) * Math.sin(r)], rel, polar: true }
	}
	const xy = t.split(','); if (xy.length !== 2 || !xy.every((v) => NUM.test(v.trim()))) return null
	return { p: [Number(xy[0]), Number(xy[1])], rel, polar: false }
}

/** One token → what it means. `drawing` = a draw tool is running (then C / U mean close / undo-point). */
export function readToken(token: string, drawing: boolean): Token {
	const up = token.toUpperCase()
	if (up === 'ENTER' || up === '') return { kind: 'enter' }
	if (up === 'ESC' || up === 'CANCEL') return { kind: 'cancel' }
	if (drawing && (up === 'C' || up === 'CLOSE')) return { kind: 'close' }
	if (drawing && (up === 'U' || up === 'UNDO')) return { kind: 'undo-point' }
	const c = parseCoord(token); if (c) return { kind: 'point', ...c }
	if (NUM.test(token)) return { kind: 'number', n: Number(token) }
	const id = ALIASES.get(up)
	return id ? { kind: 'cmd', id } : { kind: 'error', message: `Unknown command “${token}” — type HELP for the list, or X,Y / @DX,DY / @D<A for a point` }
}

/** A line of input → its tokens, in order (parts split by ';', tokens by whitespace). */
export function tokenize(line: string): string[] {
	return line.split(';').flatMap((part) => part.trim().split(/\s+/).filter(Boolean))
}

/** A user coordinate → the absolute point, given the previous one (for @relative); Y up. */
export function resolvePoint(t: { p: Pt; rel: boolean }, last: Pt | null): Pt {
	return t.rel && last ? [last[0] + t.p[0], last[1] + t.p[1]] : t.p
}
