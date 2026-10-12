// Guards the key handlers share: is the key a field's (something being typed in), and what a key does to the open
// question. Duck-typed on `closest` / `tagName`, so they run in Node tests without a DOM.

type ElLike = { closest(sel: string): unknown; tagName?: string }
const isEl = (t: unknown): t is ElLike => !!t && typeof (t as ElLike).closest === 'function'

/** A key pressed while an IME (Japanese input) is converting: Enter commits the conversion, Esc cancels it, ↑ / ↓
 *  pick a candidate — the IME's keys, not the field's, the table's or the shell's. Some browsers send the first Enter
 *  after a conversion with keyCode 229 and isComposing already false. */
export const composing = (e: { isComposing?: boolean; keyCode?: number }): boolean => !!e.isComposing || e.keyCode === 229
/** Enter that is the field's (not the IME committing a conversion). */
export const enterKey = (e: { key: string; isComposing?: boolean; keyCode?: number }): boolean => e.key === 'Enter' && !composing(e)

/** The target is a field being typed in (an input, a select, a text area, editable text): its keys are its own. */
export const typingIn = (t: EventTarget | null | unknown): boolean => isEl(t) && !!t.closest('input, select, textarea, [contenteditable]:not([contenteditable="false"])')

/** What a key does to the open question (the drawing's question box, or Project settings' copy of it): 'yes' answers
 *  with the first answer, 'cancel' drops it, null leaves the key alone. Enter answers only with the focus in the box
 *  (on an answer, the browser presses it itself) or on nothing (the page): typing in a search, a cell or a field and
 *  pressing Enter must not say yes to "Delete level 3F?". Esc cancels unless a field is being typed in. */
export function askKey(e: { key: string; target: EventTarget | null | unknown; isComposing?: boolean; keyCode?: number }): 'yes' | 'cancel' | null {
	if (composing(e)) return null
	const t = e.target, inBox = isEl(t) && !!t.closest('[role=alertdialog]')
	if (e.key === 'Escape') return inBox || !typingIn(t) ? 'cancel' : null
	if (e.key !== 'Enter') return null
	if (inBox) return isEl(t) && t.tagName === 'BUTTON' ? null : 'yes'
	return !isEl(t) || t.tagName === 'BODY' || t.tagName === 'HTML' ? 'yes' : null
}
