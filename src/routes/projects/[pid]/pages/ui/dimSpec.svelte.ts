// The Dimension tool's spec (its bar over the pane while armed, like the Section / Opening bars): what the NEXT dimension
// measures — ALIGNED (the true a→b distance, the default), LINEAR (AutoCAD DIMLINEAR: horizontal or vertical, whichever
// way the points are further apart), or forced HORIZONTAL / VERTICAL (only Δx / Δy). The drawn shape stores the
// resolved `dimMode` (geometry.ts dimGeom); Properties changes it later. Remembered in localStorage.
import { autoDimMode, type Pt, type DimMode } from './geometry'

export type DimToolMode = 'aligned' | 'auto' | 'h' | 'v'
/** [mode, bar label, command-line option (its capital = the letter to type)]. */
export const DIM_TOOL_MODES: [DimToolMode, string, string][] = [['aligned', 'Aligned', 'Aligned'], ['auto', 'Linear', 'Linear'], ['h', 'Horizontal', 'Horizontal'], ['v', 'Vertical', 'Vertical']]

/** The mode a dimension drawn a → b gets: 'auto' resolves by the larger delta. */
export const resolveDimMode = (m: DimToolMode, a: Pt, b: Pt): DimMode => (m === 'auto' ? autoDimMode(a, b) : m)

const LS = 'eos-pages-dim-spec'
class DimSpec {
	mode = $state<DimToolMode>('aligned')
	constructor() {
		try {
			const o = JSON.parse(localStorage.getItem(LS) ?? '{}')
			if (DIM_TOOL_MODES.some(([m]) => m === o.mode)) this.mode = o.mode
		} catch { /* no storage */ }
	}
	setMode(m: DimToolMode) { this.mode = m; try { localStorage.setItem(LS, JSON.stringify({ mode: m })) } catch { /* private mode */ } }
	/** A typed / clicked command-line option ("H", "vert", "Linear") → set the mode; false = not one of them. */
	option(token: string): boolean {
		const up = token.toUpperCase(), hit = DIM_TOOL_MODES.find(([, , o]) => o.toUpperCase().startsWith(up))
		if (!up || !hit) return false
		this.setMode(hit[0]); return true
	}
}
export const dimSpec = new DimSpec()
