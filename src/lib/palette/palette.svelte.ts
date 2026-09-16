// Open-state for the Ctrl+K destination palette, shared so the Titlebar
// search button (or anything else) can open it while the component itself
// lives in the root layout.
class PaletteState {
	open = $state(false)
}
export const palette = new PaletteState()
