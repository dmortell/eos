// Shared colour + layer palette for the Pages tool (mock). The colour dropdown (PropertiesPanel)
// and the layer list draw from here so they stay consistent. Includes a set of subdued,
// Kestrel/AutoCAD-style architectural layer colours (A-WALL, A-DOOR, …) alongside the vivid ones.

export type Swatch = { name: string; value: string }   // value '' = ByLayer (inherit the layer colour)

// Vivid drawing colours (top) + subdued architectural tones (bottom). "By layer" / "None" are
// offered by the ColorPicker component itself (allowByLayer / allowNone), not listed here.
export const COLORS: Swatch[] = [
	{ name: 'Black', value: '#1e293b' },
	{ name: 'Slate', value: '#475569' },
	{ name: 'Grey', value: '#94a3b8' },
	{ name: 'Red', value: '#dc2626' },
	{ name: 'Orange', value: '#ea580c' },
	{ name: 'Amber', value: '#d97706' },
	{ name: 'Green', value: '#16a34a' },
	{ name: 'Teal', value: '#0e7490' },
	{ name: 'Blue', value: '#2563eb' },
	{ name: 'Indigo', value: '#4f46e5' },
	{ name: 'Purple', value: '#9333ea' },
	// subdued architectural (Kestrel/CAD layer tones) — muted so they read as background structure
	{ name: 'Wall (taupe)', value: '#8a7f72' },
	{ name: 'Opening (dusty blue)', value: '#7f9bb0' },
	{ name: 'Door (tan)', value: '#a99a80' },
	{ name: 'Glazing (steel)', value: '#89a0ab' },
	{ name: 'Floor (stone)', value: '#b0a596' },
	{ name: 'Furniture (sage)', value: '#94a58c' },
	{ name: 'Ceiling (mauve)', value: '#a3919c' },
]

