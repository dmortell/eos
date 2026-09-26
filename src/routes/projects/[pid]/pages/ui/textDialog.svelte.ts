// The large TEXT editor dialog (parts/NoteDialog.svelte), opened from anywhere — a viewport double-click on a wrapped
// text (or Shift+double-click on a plain one) — and rendered once by +page (outside the zoomed canvas, so its
// fixed positioning isn't caught by the canvas transform). RAW state: `apply` is a closure, compared by nothing.
export type TextDialogReq = { text: string; plain?: boolean; width?: number; fontPt?: number; apply: (t: string) => void }

class TextDialog {
	req = $state.raw<TextDialogReq | null>(null)
	open(r: TextDialogReq) { this.req = r }
	close() { this.req = null }
}
export const textDialog = new TextDialog()
