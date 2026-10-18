import { getContext, setContext } from 'svelte'

/** How many cad dialogs are open (shown — not `hidden`): while any is, the drawing gets no keys or pastes and the
 *  AskBox doesn't take the focus. Kept by CadDialog; CadShell gives it to its tree (hacky-code review: this was a
 *  `document.querySelector('[role=dialog]')` in three places). */
export class Modals {
	open = $state(0)
	get any(): boolean { return this.open > 0 }
}

const KEY = Symbol('cad-modals')
export const provideModals = (): Modals => setContext(KEY, new Modals())
/** The shell's count; none outside a shell (a dialog then counts nowhere). */
export const modalsOf = (): Modals | undefined => getContext<Modals | undefined>(KEY)
