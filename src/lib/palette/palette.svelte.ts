// Open-state for the Ctrl+K destination palette, shared so the Titlebar
// search button (or anything else) can open it while the component itself
// lives in the root layout.
class PaletteState {
	open = $state(false)
}
export const palette = new PaletteState()

// The open cad page opens one of its own levels / sheets (the cad URL's query,
// `?v=plan&level=…`) in a tab, instead of the palette changing the URL it reads
// only once. Set by the page while it's mounted.
type CadOpener = (search: string) => void
let cadOpener: CadOpener | null = null
/** Returns a remover that removes only this opener (a newer page's stays). */
export function setCadOpener(f: CadOpener): () => void {
	cadOpener = f
	return () => { if (cadOpener === f) cadOpener = null }
}
/** False = no cad page is open to take it. */
export function openInCad(search: string): boolean {
	if (!cadOpener) return false
	cadOpener(search)
	return true
}
