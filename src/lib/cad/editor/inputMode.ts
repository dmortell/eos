// The two ways to drive the drawing with the mouse (User 2026-10-13), chosen per user in the status bar:
//   ACAD — the wheel zooms; points are clicked (click, click).
//   EOS  — as the older EOS tools: the wheel PANS (Shift+wheel sideways), Ctrl / Alt / Meta + wheel zooms, and a
//          press-drag draws (editor/pressDrag.ts); a plain click works as in ACAD. Right- / middle-drag pans in both.
export type InputMode = 'acad' | 'eos'
export const INPUT_MODE_KEY = 'cad-input-mode'

export function parseInputMode(v: string | null | undefined): InputMode { return v === 'eos' ? 'eos' : 'acad' }

export interface WheelLike { deltaX: number; deltaY: number; deltaMode?: number; shiftKey: boolean; ctrlKey: boolean; altKey: boolean; metaKey: boolean }
export type WheelAction = { kind: 'zoom'; factor: number } | { kind: 'pan'; dx: number; dy: number }

/** What a wheel turn does. `rightHeld`: the right button is down (EOS: right+wheel zooms, as in the older tools). */
export function wheelAction(mode: InputMode, e: WheelLike, rightHeld = false): WheelAction {
	const zoom = (): WheelAction => ({ kind: 'zoom', factor: Math.exp(-e.deltaY * 0.0015) })
	if (mode === 'acad') return zoom()
	if (e.ctrlKey || e.altKey || e.metaKey || rightHeld) return zoom()
	// lines → pixels (a few mice report lines); Shift turns the wheel sideways (some systems already swap the axes)
	const k = e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? 400 : 1
	const dx = e.shiftKey && !e.deltaX ? e.deltaY : e.deltaX, dy = e.shiftKey && !e.deltaX ? 0 : e.deltaY
	// the content follows the wheel as a page scroll does: wheel down shows what is below, so the drawing moves up
	return { kind: 'pan', dx: -dx * k, dy: -dy * k }
}
