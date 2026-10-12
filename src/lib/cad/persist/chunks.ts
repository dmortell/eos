// Long JSON kept in Firestore across several docs (a doc holds at most 1 MB): frozen issue copies (`cadIssued`) and
// stored backups (`cadBackups/{id}/chunks`).

/** Text characters per doc: ≤ 300k characters stays under the 1 MB doc limit even if all of it is Japanese. */
export const CHUNK = 300_000

export function splitChunks(text: string, size = CHUNK): string[] {
	const out: string[] = []
	for (let i = 0; i < text.length || !out.length; ) {
		let end = Math.min(text.length, i + size)
		// never between the two halves of a character outside the BMP (some kanji, emoji): each half alone is corrupted
		const c = text.charCodeAt(end - 1)
		if (end < text.length && c >= 0xd800 && c <= 0xdbff) end = end - 1 > i ? end - 1 : end + 1   // a 1-unit chunk takes the pair
		out.push(text.slice(i, end))
		i = end
	}
	return out
}
