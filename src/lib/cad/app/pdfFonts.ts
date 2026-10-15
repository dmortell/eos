// The fonts a project's PDFs can embed (Settings › Files › Font in PDFs, Dave 2026-10-15): open-licensed TrueType fonts
// from Google Fonts' repository, fetched when a PDF is made with one set and kept for the session. jsPDF embeds only the
// characters a PDF uses. Chinese is not offered yet: the static TTFs there are display faces, and Noto Sans SC / TC
// are too large to fetch this way.
export type PdfFontLang = 'ja' | 'ja-noto' | 'ko'
export const PDF_FONTS: Record<PdfFontLang, { label: string; face: string; url: string }> = {
	ja: { label: 'Japanese', face: 'M PLUS 1p', url: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/mplus1p/MPLUS1p-Regular.ttf' },
	// Google Fonts' own static TTF (its repository has only the 9 MB variable one, which jsDelivr won't serve): 5.7 MB to fetch
	'ja-noto': { label: 'Japanese', face: 'Noto Sans JP', url: 'https://fonts.gstatic.com/s/notosansjp/v57/-F6jfjtqLzI2JPCgQBnw7HFyzSD-AsregP8VFBEj75s.ttf' },
	ko: { label: 'Korean', face: 'Nanum Gothic', url: 'https://cdn.jsdelivr.net/gh/google/fonts@main/ofl/nanumgothic/NanumGothic-Regular.ttf' },
}

const loaded = new Map<PdfFontLang, Promise<string>>()

/** The font as base64 (jsPDF's addFileToVFS), fetched once per session. */
export function pdfFontData(lang: PdfFontLang): Promise<string> {
	let p = loaded.get(lang)
	if (!p) {
		p = fetch(PDF_FONTS[lang].url).then(async (r) => {
			if (!r.ok) throw new Error(`the ${PDF_FONTS[lang].label} font didn't load (${r.status})`)
			const bytes = new Uint8Array(await r.arrayBuffer())
			let s = ''
			for (let i = 0; i < bytes.length; i += 0x8000) s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
			return btoa(s)
		})
		p.catch(() => loaded.delete(lang))   // a failed fetch is tried again next time
		loaded.set(lang, p)
	}
	return p
}

/** The project's PDF font, or undefined (none set, or it didn't load — then Japanese is drawn as pictures, as before). */
export async function projectPdfFont(settings: { pdfFont?: PdfFontLang } | undefined): Promise<string | undefined> {
	const lang = settings?.pdfFont
	if (!lang || !PDF_FONTS[lang]) return undefined
	try { return await pdfFontData(lang) } catch (e) { console.warn('cad: PDF font', e); return undefined }
}
