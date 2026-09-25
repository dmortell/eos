// B4: a sheet's viewports are numbered in READING ORDER — rows top to bottom, then left to right — and renumbered
// whenever one is added, moved or removed. A frame joins the current row when its top is above the middle of the
// row's first frame. A label that is just its number follows the new number; a custom label stays.
type F = { id: string; x: number; y: number; w: number; h: number; seq?: number; label?: string }

export function readingOrder<T extends F>(frames: T[]): T[] {
	const numbered = frames.filter((f) => f.seq != null)
	if (!numbered.length) return frames
	const rows: T[][] = []
	for (const f of [...numbered].sort((a, b) => a.y - b.y)) {
		const r = rows[rows.length - 1]
		if (r && f.y < r[0].y + r[0].h / 2) r.push(f); else rows.push([f])
	}
	const seqOf = new Map(rows.flatMap((r) => r.sort((a, b) => a.x - b.x)).map((f, i) => [f.id, i + 1]))
	let changed = false
	const out = frames.map((f) => {
		const n = seqOf.get(f.id); if (n == null || n === f.seq) return f
		changed = true
		return { ...f, seq: n, ...(f.label === String(f.seq) ? { label: String(n) } : {}) }   // empty = shows the number anyway
	})
	return changed ? out : frames
}
