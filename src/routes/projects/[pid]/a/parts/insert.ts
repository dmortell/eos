// The Insert palette — what the user can place onto the sheet. Shown both in the
// Insert menu and as a button row beneath the menubar. `todo` items are stubs
// (armed but not yet implemented).
export type Insert = { kind: string; label: string; todo?: boolean }

export const INSERTS: Insert[] = [
	{ kind: 'viewport', label: 'Viewport' },
	{ kind: 'section', label: 'Section' },
	{ kind: 'wall', label: 'Wall', todo: true },
	{ kind: 'conduit', label: 'Conduit', todo: true },
	{ kind: 'furniture', label: 'Furniture', todo: true },
	{ kind: 'rack', label: 'Rack', todo: true },
	{ kind: 'outlet', label: 'Outlet', todo: true },
	{ kind: 'annotation', label: 'Annotation', todo: true },
	{ kind: 'pdf', label: 'PDF / Image', todo: true },
]
