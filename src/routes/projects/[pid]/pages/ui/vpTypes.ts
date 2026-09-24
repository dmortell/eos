// The Viewport's public props (R1 close-out: the component is a shell over ui/vpView.svelte.ts +
// ui/vpInteraction.svelte.ts, so the prop/callback types live here where all three can import them).
//
// R6: the callback bundle is split in two. `on` (VpOn) is VIEW events only — things that happen to the
// CAMERA/UI, not the document — so it stays useful even for a read-only/preview Viewport with no `editor`.
// `editor` (./editor.ts) carries everything that MUTATES the document: entity ops (`ents`), the undo-history
// bracket (`edit`), section drops (`sections`) and the per-viewport Selection (`sel`) — defaulting to
// `noopEditor` so every call site can read `editor.ents.add(e)` etc. directly, no `?.`. Drafting/interaction
// flags are grouped into one `env` object.
import type { Ent, View, ElevDir } from './geometry'
import type { Clip } from '../3dview/types'
import type { Editor } from './editor'

export type Env = {
	acad?: boolean; navContent?: boolean; grid?: boolean; lwt?: boolean; osnap?: boolean; snap?: boolean; ortho?: boolean; cen?: boolean; guideVert?: boolean; canvasZoom?: number
	/** SNAP grid spacing, model mm (status bar); defaults to SNAP_STEP. */
	snapStep?: number
	/** The nav bar's latched Pan / Orbit tool: a left drag pans / orbits (iso) instead of using `tool`. */
	navMode?: NavMode
	/** D5: the block the 'Block' tool places (the Blocks panel's armed block). */
	blockId?: string
}
export type NavMode = 'pan' | 'orbit' | null

export type VpOn = {
	activate?: () => void; deactivate?: () => void; view?: (v: View) => void; orbit?: (yaw: number, pitch: number) => void
	scale?: (s: string) => void; status?: (text: string) => void; coords?: (x: number, y: number) => void; tool?: (name: string) => void
	/** D4: a double-clicked symbol's link (a sheet id, or a URL). */
	openLink?: (link: string) => void
}

export type VpKind = 'plan' | 'iso' | ElevDir

export type VpProps = {
	label?: string; scale?: string; kind?: VpKind; active?: boolean
	/** B31: this viewport IS a model-layout pane (not a frame on paper) — dark AutoCAD-style model space, and
	 *  it pans/zooms its own view regardless of "Pan content". */
	modelSpace?: boolean
	/** VP Freeze: layer ids hidden in THIS viewport only (a sheet frame's `frozen`). */
	frozen?: string[]
	tool?: string; boxW?: number; boxH?: number; border?: 'dashed' | 'solid' | 'none'; env?: Env; on?: VpOn; editor?: Editor
	frameId?: string; modelId?: import('../3dview/types').ModelId
	/** An imported frame's unmapped Sheets source (SheetFrame.source) — shown instead of any model. */
	unmapped?: string
	/** A building elevation's visible storeys (SheetFrame.storeys); undefined = all. */
	storeys?: string[]
	/** In split view only the focused pane's instance handles keys and drives the shared status line. */
	focused?: boolean
	entities?: Ent[]; view?: View; clip?: Clip | null; yaw?: number; pitch?: number
}
