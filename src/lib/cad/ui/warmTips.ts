// WARM TOOLTIPS for a row of buttons (backlog 5, User 2026-10-29): the first hovered button's tip waits DELAY; moving
// on to a neighbour while a tip shows (or just after) shows its tip at once. A Svelte action on the bar: it takes over
// the `title` of whatever is hovered inside (moved to data-tip while hovered, so the browser's own tip, which always
// waits, stays away) and puts the text back on leave. One shared tip element for the page, in the top layer
// (popover) where supported, so it shows over dialogs too. Mouse / pen only — a touch has no hover.
// (CSS `interestfor` / `interest-delay` would do this natively but needs a popover per button and isn't in every
// browser yet; this works everywhere with the titles the bars already have.)

export const DELAY = 500
/** How long after a tip hides the next one still shows at once. */
export const COOL = 600

let tip: HTMLDivElement | null = null
let warmUntil = 0

function tipEl(): HTMLDivElement {
	if (tip?.isConnected) return tip
	tip = document.createElement('div')
	tip.className = 'cad-warm-tip'
	tip.setAttribute('role', 'tooltip')
	if ('popover' in tip) tip.setAttribute('popover', 'manual')
	Object.assign(tip.style, {
		position: 'fixed', margin: '0', inset: 'auto', zIndex: '10000', maxWidth: '22rem', padding: '3px 7px',
		font: '12px/1.35 system-ui, sans-serif', color: 'var(--cad-text, #18181b)', background: 'var(--cad-panel, #fff)',
		border: '1px solid var(--cad-line, #d4d4d8)', borderRadius: '4px', boxShadow: '0 2px 8px rgb(0 0 0 / 0.15)',
		pointerEvents: 'none', whiteSpace: 'pre-line', display: 'none',
	})
	document.body.appendChild(tip)
	return tip
}

function show(el: HTMLElement, text: string): void {
	const t = tipEl()
	t.textContent = text
	t.style.display = 'block'
	if (t.hasAttribute('popover')) try { t.showPopover() } catch { /* already open */ }
	// below the button, kept on screen; above it when there's no room below
	const r = el.getBoundingClientRect(), w = t.offsetWidth, h = t.offsetHeight
	const x = Math.max(4, Math.min(r.left + r.width / 2 - w / 2, innerWidth - w - 4))
	const y = r.bottom + 6 + h <= innerHeight ? r.bottom + 6 : Math.max(4, r.top - 6 - h)
	t.style.left = `${x}px`
	t.style.top = `${y}px`
}

function hide(): boolean {
	if (!tip || tip.style.display === 'none') return false
	if (tip.hasAttribute('popover')) try { tip.hidePopover() } catch { /* not open */ }
	tip.style.display = 'none'
	return true
}

export function warmTips(node: HTMLElement) {
	let timer: ReturnType<typeof setTimeout> | undefined
	let cur: HTMLElement | null = null

	const release = () => {
		clearTimeout(timer)
		if (cur?.dataset.tip !== undefined) {
			if (!cur.hasAttribute('title')) cur.setAttribute('title', cur.dataset.tip)
			delete cur.dataset.tip
		}
		cur = null
		if (hide()) warmUntil = Date.now() + COOL
	}
	const over = (e: PointerEvent) => {
		if (e.pointerType === 'touch') return
		const el = (e.target as Element | null)?.closest<HTMLElement>('[title], [data-tip]')
		if (!el || !node.contains(el) || el === cur) return
		release()
		const text = el.getAttribute('title') ?? el.dataset.tip ?? ''
		if (!text) return
		cur = el
		el.dataset.tip = text
		el.removeAttribute('title')
		if (Date.now() < warmUntil) show(el, text)
		else timer = setTimeout(() => { if (cur === el) show(el, text) }, DELAY)
	}
	const out = (e: PointerEvent) => {
		if (!cur) return
		const to = e.relatedTarget as Node | null
		if (to && cur.contains(to)) return
		release()
	}
	const down = () => { clearTimeout(timer); hide(); warmUntil = 0 }

	node.addEventListener('pointerover', over)
	node.addEventListener('pointerout', out)
	node.addEventListener('pointerdown', down)
	return {
		destroy() {
			release()
			node.removeEventListener('pointerover', over)
			node.removeEventListener('pointerout', out)
			node.removeEventListener('pointerdown', down)
		},
	}
}
