// Guards the key handlers share: is the key a field's (something being typed in), and what a key does to the open
// question. Duck-typed on `closest` / `tagName`, so they run in Node tests without a DOM.

type ElLike = { closest(sel: string): unknown; tagName?: string }
const isEl = (t: unknown): t is ElLike => !!t && typeof (t as ElLike).closest === 'function'

/** The target is a field being typed in (an input, a select, a text area, editable text): its keys are its own. */
export const typingIn = (t: EventTarget | null | unknown): boolean => isEl(t) && !!t.closest('input, select, textarea, [contenteditable]:not([contenteditable="false"])')

/** What a key does to the open question (the drawing's question box, or Project settings' copy of it): 'yes' answers
 *  with the first answer, 'cancel' drops it, null leaves the key alone. Enter answers only with the focus in the box
 *  (on an answer, the browser presses it itself) or on nothing (the page): typing in a search, a cell or a field and
 *  pressing Enter must not say yes to "Delete level 3F?". Esc cancels unless a field is being typed in. */
export function askKey(e: Pick<KeyboardEvent, 'key'> & { target: EventTarget | null | unknown }): 'yes' | 'cancel' | null {
	const t = e.target, inBox = isEl(t) && !!t.closest('[role=alertdialog]')
	if (e.key === 'Escape') return inBox || !typingIn(t) ? 'cancel' : null
	if (e.key !== 'Enter') return null
	if (inBox) return isEl(t) && t.tagName === 'BUTTON' ? null : 'yes'
	return !isEl(t) || t.tagName === 'BODY' || t.tagName === 'HTML' ? 'yes' : null
}
