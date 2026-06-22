// Shape library: reusable shapes for the annotation system. A shape is one or more annotation
// "blobs" with coords normalised to the bbox origin (0,0); on placement they're offset to the drop
// point (and given a shared groupId if >1). Built-ins are code constants; custom shapes are stored
// GLOBALLY in the Firestore `library` collection (one doc per shape).
import type { Annotation } from '../../types'
import { USAGE_COLORS } from '../../tools/outlets/colors'

export interface LibraryShape {
	id: string
	name: string
	category: string
	tags?: string[]
	items: Partial<Annotation>[] // normalised to bbox origin; placed at the drop point
	w?: number
	h?: number
}

const sym = (symbol: string, name: string): LibraryShape => ({
	id: 'b-sym-' + symbol, name, category: 'Symbols',
	items: [{ kind: 'symbol', symbol, x: 0, y: 0, w: 1000, h: 1000 }], w: 1000, h: 1000,
})

export const BUILTIN_SHAPES: LibraryShape[] = [
	// Basic kinds
	{ id: 'b-rect', name: 'Rectangle', category: 'Basic', items: [{ kind: 'rect', x: 0, y: 0, w: 2000, h: 1200 }], w: 2000, h: 1200 },
	{ id: 'b-ellipse', name: 'Ellipse', category: 'Basic', items: [{ kind: 'ellipse', x: 0, y: 0, w: 2000, h: 1200 }], w: 2000, h: 1200 },
	{ id: 'b-cloud', name: 'Cloud', category: 'Basic', items: [{ kind: 'cloud', x: 0, y: 0, w: 2000, h: 1200 }], w: 2000, h: 1200 },
	{ id: 'b-text', name: 'Text', category: 'Basic', items: [{ kind: 'text', x: 0, y: 0, text: 'Text' }] },
	{ id: 'b-line', name: 'Line', category: 'Basic', items: [{ kind: 'line', x: 0, y: 0, x2: 2000, y2: 0 }], w: 2000, h: 0 },
	{ id: 'b-arrow', name: 'Arrow', category: 'Basic', items: [{ kind: 'arrow', x: 0, y: 0, x2: 2000, y2: 0, end: 'arrow' }], w: 2000, h: 0 },
	{ id: 'b-dim', name: 'Dimension', category: 'Basic', items: [{ kind: 'dimension', x: 0, y: 0, x2: 2000, y2: 0 }], w: 2000, h: 0 },
	{ id: 'b-callout', name: 'Callout', category: 'Basic', items: [{ kind: 'callout', x: 0, y: 0, x2: 1500, y2: -1000, text: 'Note' }] },
	// Symbols
	sym('section', 'Section marker'),
	sym('elevation', 'Elevation tag'),
	sym('detail', 'Detail marker'),
	sym('north', 'North arrow'),
	sym('door', 'Door'),
	sym('faceplate', 'Faceplate'),
	sym('photo', 'Photo marker'),
	// Outlets — one per usage (Network, CCTV, …)
	...Object.entries(USAGE_COLORS).map(([usage, v]): LibraryShape => ({
		id: 'b-outlet-' + usage, name: v.label + ' outlet', category: 'Outlets', tags: ['outlet', usage],
		items: [{ kind: 'symbol', symbol: 'outlet', x: 0, y: 0, w: 1000, h: 1000, outlet: { usage } as Annotation['outlet'] }],
		w: 1000, h: 1000,
	})),
]
