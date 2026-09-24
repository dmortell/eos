// The Viewport's Kestrel-style command prompt + the status line shown at the PANE bottom-centre (screen
// space, so it stays readable when zoomed in). Pure: the Viewport gathers the few facts they depend on.

export type PromptArgs = {
	tool: string
	/** Points placed in the current draft. */
	n: number
	isPlan: boolean
	isElev: boolean
	/** This view has a guide space (plan / an elevation — not iso). */
	guideSpace: boolean
	/** The Guide tool's base orientation (H/V pop-out). */
	guideVert: boolean
	/** Distance from a selected same-orientation guide to the Guide-tool preview, if any. */
	guideDelta: number | null
	/** A single wall/conduit is selected (node editing hints). */
	graphSelected: boolean
	/** Elevation only: whether a plan guide is selected to fix the drawing depth. */
	depthGuide: boolean
}

export function toolPrompt(a: PromptArgs): string {
	const { tool, n, isPlan, isElev } = a
	switch (tool) {
		case 'Select': return a.graphSelected ? 'Drag a node to reshape · Ctrl-drag a node to branch · double-click a segment to add a node' : 'Click an element'
		case 'Line': return n ? 'Specify next point (Enter / double-click to finish)' : 'Specify first point'
		case 'Guide': {
			if (!a.guideSpace) return 'Guides are placed on a plan or elevation view'
			const s = `Click to drop a ${a.guideVert ? 'vertical' : 'horizontal'} guide · Shift flips · select a plan guide to fix the depth for elevation drawing`
			// live spacing readout, so guides can be placed an exact distance apart
			return a.guideDelta === null ? s : `${s} · Δ ${Math.round(a.guideDelta)} mm`
		}
		case 'Wall': case 'Trunk': case 'Pipe': {
			const t = tool.toLowerCase()
			if (!isPlan && !isElev) return `Switch to a plan or elevation view to draw ${t}s`
			const depthHint = isElev ? (a.depthGuide ? ' — depth from the selected plan guide' : ' — no depth guide (uses model centre); select a plan guide') : ''
			// K4: a running point count + the finishing / constraint keys while a run is being drawn
			return n ? `${n} point${n === 1 ? '' : 's'} · specify next ${t} point (Enter / double-click / right-click to finish · Shift = 15° · Esc = cancel)${depthHint}` : `Specify ${t} start${depthHint}`
		}
		case 'Furniture': return isPlan ? (n ? 'Specify opposite corner' : 'Specify furniture footprint corner') : 'Switch to the plan view to place furniture'
		case 'Section': return isPlan ? (n ? 'Specify opposite corner (→ front elevation)' : 'Specify section box corner') : 'Switch to the plan view to cut a section'
		case 'Opening': return isPlan ? (n ? 'Specify opposite corner' : 'Specify opening (door / window / hole) corner') : 'Switch to the plan view to place an opening'
		case 'Rectangle': return n ? 'Specify opposite corner' : 'Specify first corner'
		case 'Ellipse': return n ? 'Specify opposite corner (Shift = circle)' : 'Specify first corner'
		case 'Dimension': return n ? 'Specify second point' : 'Specify first point'
		case 'Text': return 'Click to place text'
		default: return tool + ' tool'
	}
}

/** Instruction line for the active image-calibration mode (null when none). */
export function imgModeText(mode: string | null | undefined, entering: boolean, scalePts: number): string | null {
	if (mode === 'origin') return 'Set origin · click a reference point inside the image · Esc = cancel'
	if (mode === 'crop') return 'Crop · drag the corner handles to trim the image · Esc = done'
	if (mode === 'scale') return entering ? 'Scale · drag either endpoint to adjust, then enter the real distance · Esc = cancel'
		: scalePts === 1 ? 'Scale · click the SECOND point of a known distance' : 'Scale · click the FIRST point of a known distance'
	return null
}

export function statusLine(a: { editingText: boolean; active: boolean; imgText: string | null; sectionSelected: boolean; tool: string; prompt: string }): string {
	if (a.editingText) return 'Editing text · Enter = new line · Ctrl/⌘+Enter = commit · Esc = cancel'
	if (!a.active) return ''
	if (a.imgText) return a.imgText
	if (a.sectionSelected && a.tool === 'Select') return 'Section selected · drag a corner to resize · drag the box to move · toolbar: open / re-aim / delete'
	return `${a.tool} · ${a.prompt}`
}
