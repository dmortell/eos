import type { Survey, SurveyPhoto, SurveyFloorplan } from './types'

function fmtDate(d: string): string {
	if (!d) return ''
	return new Date(d).toLocaleDateString('en', { year: 'numeric', month: 'short', day: 'numeric' })
}

function fmtTime(ts: any): string {
	if (!ts) return ''
	const d = ts.toDate ? ts.toDate() : new Date(ts)
	return d.toLocaleDateString('en', { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
}

async function loadImage(url: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const img = new Image()
		img.crossOrigin = 'anonymous'
		img.onload = () => resolve(img)
		img.onerror = reject
		img.src = url
	})
}

function imgToDataUrl(img: HTMLImageElement, maxW = 800, maxH = 600): string {
	const canvas = document.createElement('canvas')
	let w = img.naturalWidth
	let h = img.naturalHeight
	if (w > maxW || h > maxH) {
		const scale = Math.min(maxW / w, maxH / h)
		w = Math.round(w * scale)
		h = Math.round(h * scale)
	}
	canvas.width = w
	canvas.height = h
	const ctx = canvas.getContext('2d')!
	ctx.drawImage(img, 0, 0, w, h)
	return canvas.toDataURL('image/jpeg', 0.85)
}

async function fetchAsBlob(url: string): Promise<Blob> {
	const res = await fetch(url)
	return res.blob()
}

// --- PDF Export ---

export async function exportPdf(
	survey: Survey,
	photos: SurveyPhoto[],
	floorplans: SurveyFloorplan[],
	onProgress?: (msg: string) => void,
) {
	onProgress?.('Loading PDF library...')
	const { jsPDF } = await import('jspdf')
	const doc = new jsPDF({ orientation: 'portrait', unit: 'mm', format: 'a4' })
	const pageW = doc.internal.pageSize.getWidth()   // 210
	const pageH = doc.internal.pageSize.getHeight()   // 297
	const margin = 10
	const headerH = 10   // space for header text
	const footerH = 8    // space for footer text
	const cols = 2
	const rows = 3
	const photosPerPage = cols * rows
	const gap = 4
	const captionH = 10  // reserved below each image for text
	const gridTop = margin + headerH
	const gridBottom = pageH - margin - footerH
	const cellW = (pageW - margin * 2 - gap * (cols - 1)) / cols
	const cellH = (gridBottom - gridTop - gap * (rows - 1)) / rows
	const imgH = cellH - captionH

	const totalPages = Math.ceil(photos.length / photosPerPage) || 1
	const headerLeft = survey.projectName ? `${survey.projectName} — ${survey.name}` : survey.name
	const headerRight = fmtDate(survey.date)

	function drawHeader(pageNum: number) {
		doc.setFontSize(8)
		doc.setFont('helvetica', 'bold')
		doc.setTextColor(60)
		doc.text(headerLeft, margin, margin + 5)
		doc.setFont('helvetica', 'normal')
		doc.text(headerRight, pageW - margin, margin + 5, { align: 'right' })
		doc.setDrawColor(200)
		doc.line(margin, margin + headerH - 2, pageW - margin, margin + headerH - 2)
	}

	function drawFooter(pageNum: number) {
		const y = pageH - margin - 1
		doc.setDrawColor(200)
		doc.line(margin, y - 4, pageW - margin, y - 4)
		doc.setFontSize(7)
		doc.setTextColor(120)
		doc.text(`Page ${pageNum} of ${totalPages}`, pageW - margin, y, { align: 'right' })
		doc.setTextColor(0)
	}

	// Pre-load all images
	const images: (HTMLImageElement | null)[] = []
	for (let i = 0; i < photos.length; i++) {
		onProgress?.(`Loading photo ${i + 1}/${photos.length}...`)
		try {
			images.push(await loadImage(photos[i].imageUrl))
		} catch {
			images.push(null)
		}
	}

	// --- Render pages ---
	for (let page = 0; page < totalPages; page++) {
		if (page > 0) doc.addPage()
		const pageNum = page + 1
		drawHeader(pageNum)
		drawFooter(pageNum)

		for (let slot = 0; slot < photosPerPage; slot++) {
			const idx = page * photosPerPage + slot
			if (idx >= photos.length) break

			const photo = photos[idx]
			const col = slot % cols
			const row = Math.floor(slot / cols)
			const cellX = margin + col * (cellW + gap)
			const cellY = gridTop + row * (cellH + gap)

			// Draw photo image
			const img = images[idx]
			if (img) {
				const dataUrl = imgToDataUrl(img, 800, 600)
				let iw = img.naturalWidth
				let ih = img.naturalHeight
				const scale = Math.min(cellW / iw, imgH / ih)
				iw = iw * scale
				ih = ih * scale
				const imgX = cellX + (cellW - iw) / 2
				doc.addImage(dataUrl, 'JPEG', imgX, cellY, iw, ih)
			} else {
				doc.setFontSize(7)
				doc.setTextColor(180)
				doc.text('(image unavailable)', cellX + cellW / 2, cellY + imgH / 2, { align: 'center' })
				doc.setTextColor(0)
			}

			// Caption below image
			const capY = cellY + imgH + 2
			doc.setFontSize(7)
			doc.setFont('helvetica', 'bold')
			doc.setTextColor(0)
			const titleText = photo.title ? doc.splitTextToSize(photo.title, cellW)[0] : ``
			doc.text(`${idx + 1}. ${titleText}`, cellX, capY + 3)
			doc.setFont('helvetica', 'normal')
			doc.setFontSize(6)
			doc.setTextColor(100)

			let meta = fmtTime(photo.capturedAt)
			if (photo.barcode) meta += ` | Barcode: ${photo.barcode}`
			if (photo.latitude) meta += ` | GPS: ${photo.latitude.toFixed(5)}, ${photo.longitude?.toFixed(5)}`
			doc.text(meta, cellX, capY + 6.5)

			if (photo.description) {
				const descLines = doc.splitTextToSize(photo.description, cellW)
				doc.text(descLines[0], cellX, capY + 9.5)
			}
			doc.setTextColor(0)
		}
	}

	onProgress?.('Generating PDF...')
	const filename = `${survey.name.replace(/[^a-zA-Z0-9]/g, '_')}_report.pdf`
	doc.save(filename)
	onProgress?.('')
}

// --- ZIP Export ---

export async function exportZip(
	survey: Survey,
	photos: SurveyPhoto[],
	floorplans: SurveyFloorplan[],
	onProgress?: (msg: string) => void,
) {
	onProgress?.('Loading ZIP library...')
	const JSZip = (await import('jszip')).default
	const zip = new JSZip()

	// Metadata
	zip.file('metadata.json', JSON.stringify({
		survey: {
			id: survey.id,
			name: survey.name,
			date: survey.date,
			projectId: survey.projectId,
			projectName: survey.projectName,
			ownerName: survey.ownerName,
			photoCount: photos.length,
			floorplanCount: floorplans.length,
			exportedAt: new Date().toISOString(),
		},
		photos: photos.map((p, i) => ({
			index: i + 1,
			title: p.title,
			description: p.description,
			barcode: p.barcode,
			latitude: p.latitude,
			longitude: p.longitude,
			capturedAt: p.capturedAt,
			filename: `photos/${String(i + 1).padStart(3, '0')}_${(p.title || 'photo').replace(/[^a-zA-Z0-9]/g, '_')}.jpg`,
		})),
		floorplans: floorplans.map(f => ({
			name: f.name,
			filename: `floorplans/${f.name}`,
		})),
	}, null, 2))

	// Photos folder
	const photosFolder = zip.folder('photos')!
	for (let i = 0; i < photos.length; i++) {
		const photo = photos[i]
		onProgress?.(`Downloading photo ${i + 1}/${photos.length}...`)
		try {
			const blob = await fetchAsBlob(photo.imageUrl)
			const filename = `${String(i + 1).padStart(3, '0')}_${(photo.title || 'photo').replace(/[^a-zA-Z0-9]/g, '_')}.jpg`
			photosFolder.file(filename, blob)
		} catch {
			// Skip failed downloads
		}
	}

	// Floorplans folder
	if (floorplans.length > 0) {
		const fpFolder = zip.folder('floorplans')!
		for (let i = 0; i < floorplans.length; i++) {
			const fp = floorplans[i]
			onProgress?.(`Downloading floorplan ${i + 1}/${floorplans.length}...`)
			try {
				const blob = await fetchAsBlob(fp.url)
				fpFolder.file(fp.name, blob)
			} catch { }
		}
	}

	onProgress?.('Creating ZIP file...')
	const blob = await zip.generateAsync({ type: 'blob' })
	const filename = `${survey.name.replace(/[^a-zA-Z0-9]/g, '_')}_export.zip`
	const url = URL.createObjectURL(blob)
	const a = document.createElement('a')
	a.href = url
	a.download = filename
	a.click()
	URL.revokeObjectURL(url)
	onProgress?.('')
}
