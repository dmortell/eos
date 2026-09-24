// Small field helpers shared by the Properties section components (parts/props/*.svelte).

/** An input's value as a number / a string. */
export const num = (e: Event) => +(e.currentTarget as HTMLInputElement).value
export const strVal = (e: Event) => (e.currentTarget as HTMLInputElement).value
/** Enter commits a single-line field (blur → its onchange fires). */
export const blurOnEnter = (e: KeyboardEvent) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur() }

/** Enter / Shift-Enter in a field jumps to the next / previous field in the panel (textareas keep Enter for
 *  newlines). Fields opt in with class="navf". */
export function fnav(e: KeyboardEvent) {
	if (e.key !== 'Enter' || (e.currentTarget as HTMLElement).tagName === 'TEXTAREA') return
	e.preventDefault()
	const fields = [...document.querySelectorAll<HTMLElement>('.pp .navf')].filter((el) => !(el as HTMLInputElement).disabled)
	const i = fields.indexOf(e.currentTarget as HTMLElement)
	const nx = fields[i + (e.shiftKey ? -1 : 1)]
	if (nx) { nx.focus(); (nx as HTMLInputElement).select?.() }
}

/** Action: grow a textarea to fit its content (and on every input). */
export function autoresize(el: HTMLTextAreaElement) {
	const grow = () => { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px' }
	grow(); el.addEventListener('input', grow)
	return { destroy() { el.removeEventListener('input', grow) } }
}

/** A wall's / conduit's length in metres, 2 decimals (cable-length friendly). */
export const fmtLen = (mm: number) => `${(mm / 1000).toFixed(2)} m`
