// App theme switcher (Kestrel CAD trial themes — see kestrel-adoption.md A1).
// 'eos' = the untouched default look: no data-theme attribute is set, so ALL
// kestrel.css rules are inert and the app renders exactly as before this file
// existed. Removing the feature = delete this folder + the two layout/Titlebar
// call sites.
export type ThemeId = 'eos' | 'kestrel-dark' | 'kestrel-light'

export const THEMES: { id: ThemeId; label: string }[] = [
	{ id: 'eos', label: 'EOS Light (default)' },
	{ id: 'kestrel-dark', label: 'Kestrel Dark' },
	{ id: 'kestrel-light', label: 'Kestrel Light' },
]

const KEY = 'eos.theme'

class ThemeStore {
	current = $state<ThemeId>('eos')
	/** Call once client-side (root layout effect). */
	init() {
		try {
			const v = localStorage.getItem(KEY) as ThemeId | null
			if (v && THEMES.some(t => t.id === v)) this.current = v
		} catch { /* storage unavailable — stay on default */ }
		this.#apply()
	}
	set(id: ThemeId) {
		this.current = id
		try { localStorage.setItem(KEY, id) } catch { /* per-browser convenience only */ }
		this.#apply()
	}
	#apply() {
		const el = document.documentElement
		if (this.current === 'eos') delete el.dataset.theme
		else el.dataset.theme = this.current
		// Kestrel Dark also enables Tailwind's `dark:` variants — several components
		// (sheets list menus/headers, etc.) already carry hand-written dark: classes
		// that are more precise than the generic utility remaps in kestrel.css.
		el.classList.toggle('dark', this.current === 'kestrel-dark')
	}
}

export const theme = new ThemeStore()
