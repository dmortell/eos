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
	const pageW = doc.internal.pageSize.getWidth()
	const pageH = doc.internal.pageSize.getHeight()
	const margin = 15

	// --- Cover page ---
	doc.setFontSize(28)
	doc.text(survey.name, pageW / 2, 60, { align: 'center' })
	doc.setFontSize(14)
	doc.setTextColor(100)
	doc.text(`Survey Report`, pageW / 2, 75, { align: 'center' })
	doc.setFontSize(11)
	doc.text(`Date: ${fmtDate(survey.date)}`, pageW / 2, 90, { align: 'center' })
	if (survey.projectName) {
		doc.text(`Project: ${survey.projectName}`, pageW / 2, 98, { align: 'center' })
	}
	doc.text(`${photos.length} photos · ${floorplans.length} floorplans`, pageW / 2, 110, { align: 'center' })
	if (survey.ownerName) {
		doc.text(`Surveyor: ${survey.ownerName}`, pageW / 2, 120, { align: 'center' })
	}
	doc.setTextColor(0)

	// --- Photo pages ---
	for (let i = 0; i < photos.length; i++) {
		const photo = photos[i]
		onProgress?.(`Processing photo ${i + 1}/${photos.length}...`)
		doc.addPage()

		// Title bar
		doc.setFontSize(12)
		doc.setFont('helvetica', 'bold')
		doc.text(`${i + 1}. ${photo.title}`, margin, margin + 5)
		doc.setFont('helvetica', 'normal')

		// Metadata line
		doc.setFontSize(8)
		doc.setTextColor(100)
		let meta = fmtTime(photo.capturedAt)
		if (photo.barcode) meta += ` | Barcode: ${photo.barcode}`
		if (photo.latitude) meta += ` | GPS: ${photo.latitude.toFixed(5)}, ${photo.longitude?.toFixed(5)}`
		doc.text(meta, margin, margin + 12)
		doc.setTextColor(0)

		// Photo image
		try {
			const img = await loadImage(photo.imageUrl)
			const dataUrl = imgToDataUrl(img, 1200, 900)
			const maxImgW = pageW - margin * 2
			const maxImgH = pageH - 55
			let imgW = img.naturalWidth
			let imgH = img.naturalHeight
			const scale = Math.min(maxImgW / imgW, maxImgH / imgH)
			imgW = imgW * scale
			imgH = imgH * scale
			const imgX = (pageW - imgW) / 2
			doc.addImage(dataUrl, 'JPEG', imgX, margin + 18, imgW, imgH)

			// Description below image
			if (photo.description) {
				const descY = margin + 20 + imgH
				if (descY < pageH - 20) {
					doc.setFontSize(9)
					doc.setTextColor(80)
					const lines = doc.splitTextToSize(photo.description, pageW - margin * 2)
					doc.text(lines, margin, descY)
					doc.setTextColor(0)
				}
			}
		} catch {
			doc.setFontSize(10)
			doc.setTextColor(200, 0, 0)
			doc.text('(Image could not be loaded)', margin, margin + 30)
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
