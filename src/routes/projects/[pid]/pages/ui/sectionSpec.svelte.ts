// The Section tool's spec (its bar over the pane while armed, like the Opening / Trunk bars): what the next section is —
// a BOX (drag a clip box, its elevations picked by the arrows) or a LINE (elevation-section-plan.md phase 3: two points
// at any angle, looking to its left as drawn — ui/sectionLine.ts) — and a line's depth. Remembered in localStorage.
import { LINE_SECTION_DEPTH } from './sectionLine'

export type SectionKind = 'box' | 'line'
export const SECTION_KINDS: [SectionKind, string][] = [['box', 'Box'], ['line', 'Line']]

const LS = 'eos-pages-section-spec'
class SectionSpec {
	kind = $state<SectionKind>('box')
	depth = $state(LINE_SECTION_DEPTH)
	constructor() {
		try { const o = JSON.parse(localStorage.getItem(LS) ?? '{}'); if (o.kind === 'box' || o.kind === 'line') this.kind = o.kind; if (o.depth > 0) this.depth = o.depth } catch { /* no storage */ }
	}
	#save() { try { localStorage.setItem(LS, JSON.stringify({ kind: this.kind, depth: this.depth })) } catch { /* private mode */ } }
	setKind(k: SectionKind) { this.kind = k; this.#save() }
	setDepth(d: number) { if (d > 0) { this.depth = Math.round(d); this.#save() } }
}
export const sectionSpec = new SectionSpec()
