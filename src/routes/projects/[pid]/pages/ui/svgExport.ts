// SVGOUT / PNGOUT: the active viewport as it is on screen — its <svg> serialised without the screen-only tool UI
// (`.vp-screen`: grips, crosshair, snap marker, command ghosts, the origin cross), with the text fonts inlined (they
// come from CSS classes) and the viewport's background painted in. PNG rasterises that SVG at 2×.

/** A standalone SVG document of the viewport's svg element (the visible region, at its on-screen pixel size). */
export function svgMarkup(svg: SVGSVGElement): string {
	const clone = svg.cloneNode(true) as SVGSVGElement
	// inline the computed text styles first (the two trees still line up node for node)
	const src = svg.querySelectorAll('text'), dst = clone.querySelectorAll('text')
	src.forEach((t, i) => {
		const cs = getComputedStyle(t), d = dst[i]
		d.setAttribute('font-family', cs.fontFamily); if (!d.getAttribute('font-size')) d.setAttribute('font-size', cs.fontSize)
		if (cs.fontWeight !== '400') d.setAttribute('font-weight', cs.fontWeight)
	})
	clone.querySelectorAll('.vp-screen').forEach((n) => n.remove())
	const w = svg.clientWidth || 800, h = svg.clientHeight || 600
	clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg')
	clone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink')
	clone.setAttribute('width', String(w)); clone.setAttribute('height', String(h))
	clone.removeAttribute('class')
	// the viewport's background (a dark model space stays readable)
	let bg = 'white'
	for (let el: Element | null = svg; el; el = el.parentElement) { const c = getComputedStyle(el).backgroundColor; if (c && c !== 'rgba(0, 0, 0, 0)' && c !== 'transparent') { bg = c; break } }
	const vb = svg.viewBox.baseVal, rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect')
	rect.setAttribute('x', String(vb.x)); rect.setAttribute('y', String(vb.y)); rect.setAttribute('width', String(vb.width)); rect.setAttribute('height', String(vb.height)); rect.setAttribute('fill', bg)
	clone.insertBefore(rect, clone.firstChild)
	return '<?xml version="1.0" encoding="UTF-8"?>\n' + new XMLSerializer().serializeToString(clone)
}

/** Save a blob as a download. */
export function download(blob: Blob, name: string) {
	const url = URL.createObjectURL(blob), a = document.createElement('a')
	a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove()
	setTimeout(() => URL.revokeObjectURL(url), 5000)
}

/** Rasterise SVG markup to a PNG blob at `scale` × its size. Images inside the SVG that aren't data: URLs don't
 *  load in an SVG-as-image (a browser rule), so they come out blank. */
export function svgToPng(markup: string, w: number, h: number, scale = 2): Promise<Blob> {
	return new Promise((resolve, reject) => {
		const url = URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' })), img = new Image()
		img.onload = () => {
			const cv = document.createElement('canvas'); cv.width = Math.round(w * scale); cv.height = Math.round(h * scale)
			const g = cv.getContext('2d'); if (!g) { URL.revokeObjectURL(url); return reject(new Error('No canvas')) }
			g.drawImage(img, 0, 0, cv.width, cv.height); URL.revokeObjectURL(url)
			cv.toBlob((b) => (b ? resolve(b) : reject(new Error('PNG encoding failed'))), 'image/png')
		}
		img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('The drawing could not be rasterised')) }
		img.src = url
	})
}
