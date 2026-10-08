// Long JSON kept in Firestore across several docs (a doc holds at most 1 MB): frozen issue copies (`cadIssued`) and
// stored backups (`cadBackups/{id}/chunks`).

/** Text characters per doc: ≤ 300k characters stays under the 1 MB doc limit even if all of it is Japanese. */
export const CHUNK = 300_000

export function splitChunks(text: string): string[] {
	const n = Math.max(1, Math.ceil(text.length / CHUNK))
	return Array.from({ length: n }, (_, i) => text.slice(i * CHUNK, (i + 1) * CHUNK))
}
