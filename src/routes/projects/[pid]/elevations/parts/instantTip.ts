/**
 * Instant hover tooltips (no native-title delay) via event delegation.
 *
 * Attach `use:tipHost` to a container; any descendant with a `data-tip`
 * attribute shows its text immediately on hover in a singleton fixed div
 * that follows the cursor. Multi-line via \n (white-space: pre-line).
 * Native `title` should be omitted on those elements (double tooltip).
 */
let tipEl: HTMLDivElement | null = null
let hosts = 0

function ensureTip(): HTMLDivElement {
	if (!tipEl) {
		tipEl = document.createElement('div')
		tipEl.style.cssText = [
			'position:fixed', 'z-index:9999', 'pointer-events:none', 'display:none',
			'background:rgba(17,24,39,.92)', 'color:#fff', 'font-size:10px', 'line-height:1.35',
			'padding:4px 7px', 'border-radius:5px', 'white-space:pre-line', 'max-width:280px',
			'box-shadow:0 2px 8px rgba(0,0,0,.25)', 'font-family:ui-sans-serif,system-ui,sans-serif',
		].join(';')
		document.body.appendChild(tipEl)
	}
	return tipEl
}

function place(e: MouseEvent) {
	if (!tipEl || tipEl.style.display === 'none') return
	const pad = 12
	const w = tipEl.offsetWidth, h = tipEl.offsetHeight
	let x = e.clientX + pad
	let y = e.clientY + pad
	if (x + w > window.innerWidth - 4) x = e.clientX - w - pad
	if (y + h > window.innerHeight - 4) y = e.clientY - h - pad
	tipEl.style.left = `${x}px`
	tipEl.style.top = `${y}px`
}

export function tipHost(el: HTMLElement) {
	hosts++
	const onOver = (e: MouseEvent) => {
		const t = (e.target as HTMLElement)?.closest?.('[data-tip]') as HTMLElement | null
		const tip = ensureTip()
		const text = t?.dataset.tip
		if (!text) { tip.style.display = 'none'; return }
		tip.textContent = text
		tip.style.display = 'block'
		place(e)
	}
	const onMove = (e: MouseEvent) => place(e)
	const onLeave = () => { if (tipEl) tipEl.style.display = 'none' }
	el.addEventListener('mouseover', onOver)
	el.addEventListener('mousemove', onMove)
	el.addEventListener('mouseleave', onLeave)
	return {
		destroy() {
			el.removeEventListener('mouseover', onOver)
			el.removeEventListener('mousemove', onMove)
			el.removeEventListener('mouseleave', onLeave)
			if (--hosts === 0 && tipEl) { tipEl.remove(); tipEl = null }
		},
	}
}
