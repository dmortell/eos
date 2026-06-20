/** Symbol palette — data, not code, so new symbols are easy to add. Rendering lives in
 *  AnnotationLayer (a switch on `id`). `linkable` flags which symbols carry a data link. */
export interface SymbolDef { id: string; name: string; linkable?: 'drawing' | 'photo' }

export const SYMBOLS: SymbolDef[] = [
	{ id: 'section', name: 'Section marker', linkable: 'drawing' },
	{ id: 'elevation', name: 'Elevation / section tag', linkable: 'drawing' },
	{ id: 'detail', name: 'Detail marker', linkable: 'drawing' },
	{ id: 'photo', name: 'Photo marker', linkable: 'photo' },
	{ id: 'north', name: 'North arrow' },
	{ id: 'outlet', name: 'Outlet' },
	{ id: 'faceplate', name: 'Faceplate (wall outlet)' },
	{ id: 'door', name: 'Door' },
]

export const symbolDef = (id?: string) => SYMBOLS.find(s => s.id === id)
