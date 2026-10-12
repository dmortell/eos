<!-- The ONE modal dialog shell every cad dialog uses: a backdrop (a click that starts and ends on it closes), the dialog
     focused when it opens (its keys work at once; the drawing behind gets none, shellKeys skips while a
     [role=dialog] is open), Tab kept inside it, Esc closes, a header with the title and ✕, a scrolling body, an
     optional bar between the two and a footer under it, one z-index (above the menu bar and floating windows, under
     the right-click menu).
     It moves itself to cad's root: inside a floating window (its backdrop-filter) `position: fixed` would be relative
     to the window, not the screen.
     `hidden` keeps it (and its state) but out of sight with no dialog role, so the drawing gets its keys again
     (Project settings while a floorplan is calibrated). `locked` (a job running) ignores ✕ / Esc / backdrop;
     `outside={false}` ignores the backdrop only; `onescape` answers Esc instead of closing (step back first). -->
<script lang="ts">
	import type { Snippet } from 'svelte'
	import { backdropClose, dialogFocus } from './backdrop'
	import { composing } from './keyGuards'

	let { title = '', label, hint, width = '40rem', height, top = '6vh', flush = false, hidden = false, locked = false, outside = true,
		onclose, onescape, onkeydown, head, bar, footer, children, el = $bindable() }: {
		title?: string; label?: string; hint?: string
		/** the most it is wide (never wider than the screen); `height` makes its height fixed (else it fits, up to 88vh) */
		width?: string; height?: string; top?: string
		/** the body without its padding (the content brings its own) */
		flush?: boolean; hidden?: boolean; locked?: boolean; outside?: boolean
		onclose: () => void; onescape?: () => void; onkeydown?: (e: KeyboardEvent) => void
		/** replaces the title (a search box); the ✕ stays */
		head?: Snippet; bar?: Snippet; footer?: Snippet; children?: Snippet
		el?: HTMLElement
	} = $props()

	const close = () => { if (!locked) onclose() }
	/** Its own keys only — not those of a dialog opened from it. */
	const mine = (e: KeyboardEvent) => (e.target as Element | null)?.closest?.('[role=dialog]') === el || e.target === el

	function key(e: KeyboardEvent) {
		if (composing(e)) return   // mid-conversion (IME) Esc / Enter are the IME's: no closing, no OK
		onkeydown?.(e)
		if (e.defaultPrevented || !mine(e)) return
		if (e.key === 'Escape') {
			e.preventDefault(); e.stopPropagation()
			if (!locked) (onescape ?? onclose)()
		} else if (e.key === 'Tab' && el) trap(e, el)
	}
	/** Tab past the last control comes back to the first (Shift+Tab the other way), so the focus stays in the dialog. */
	function trap(e: KeyboardEvent, box: HTMLElement) {
		const all = [...box.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
			.filter((n) => !(n as HTMLButtonElement).disabled && n.offsetParent !== null && n.closest('[role=dialog]') === box)
		if (!all.length) { e.preventDefault(); return }
		const first = all[0], last = all[all.length - 1], at = document.activeElement
		if (e.shiftKey && (at === first || at === box)) { e.preventDefault(); last.focus() }
		else if (!e.shiftKey && at === last) { e.preventDefault(); first.focus() }
	}
	function toRoot(node: HTMLElement) {
		const root = node.parentElement?.closest('.shell') ?? document.body
		if (node.parentElement !== root) {
			// moving a node drops the focus inside it: give it back
			const had = node.contains(document.activeElement) ? (document.activeElement as HTMLElement) : null
			root.appendChild(node)
			had?.focus({ preventScroll: true })
		}
		return { destroy: () => node.remove() }
	}
</script>

<div class="cad-dlg-back" class:hidden role="presentation" style:padding-top={top} use:toRoot use:backdropClose={() => { if (outside) close() }}>
	<div class="cad-dlg" bind:this={el} role={hidden ? undefined : 'dialog'} aria-modal={hidden ? undefined : 'true'} aria-label={label ?? title} tabindex="-1"
		style:width="min({width}, 96vw)" style:height={height} style:max-height={height ? undefined : '88vh'}
		use:dialogFocus onclick={(e) => e.stopPropagation()} onkeydown={key}>
		<div class="cad-dlg-head">
			{#if head}{@render head()}{:else}<b>{title}</b>{#if hint}<span class="cad-dlg-hint">{hint}</span>{/if}{/if}
			<button class="cad-dlg-x" title="Close (Esc)" aria-label="Close" disabled={locked} onclick={close}>✕</button>
		</div>
		{#if bar}<div class="cad-dlg-bar">{@render bar()}</div>{/if}
		<div class="cad-dlg-body" class:flush>{@render children?.()}</div>
		{#if footer}<div class="cad-dlg-foot">{@render footer()}</div>{/if}
	</div>
</div>

<style>
	.cad-dlg-back { position: fixed; inset: 0; z-index: 90; background: rgb(0 0 0 / 0.25); display: flex; align-items: flex-start; justify-content: center; }
	.cad-dlg-back.hidden { display: none; }
	.cad-dlg { display: flex; flex-direction: column; overflow: hidden; background: var(--cad-panel, white); color: var(--cad-text, #18181b); border: 1px solid var(--cad-line, #e4e4e7); border-radius: 8px; box-shadow: 0 8px 30px rgb(0 0 0 / 0.2); font-size: 12px; }
	.cad-dlg:focus { outline: none; }
	.cad-dlg-head { flex: none; display: flex; align-items: center; gap: 8px; padding: 8px 12px; border-bottom: 1px solid var(--cad-line, #e4e4e7); }
	.cad-dlg-hint { color: var(--cad-muted, #71717a); font-weight: 400; min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
	.cad-dlg-x { margin-left: auto; flex: none; min-width: 20px; min-height: 20px; border-radius: 4px; color: var(--cad-muted, #71717a); }
	.cad-dlg-x:hover:not(:disabled) { background: var(--cad-hover, #f4f4f5); color: var(--cad-text, #18181b); }
	.cad-dlg-x:disabled { opacity: 0.45; }
	.cad-dlg-bar { flex: none; display: flex; flex-wrap: wrap; align-items: center; gap: 8px 16px; padding: 8px 12px; border-bottom: 1px solid var(--cad-line, #e4e4e7); }
	.cad-dlg-body { flex: 1 1 auto; min-height: 0; overflow: auto; padding: 8px 12px 12px; }
	.cad-dlg-body.flush { padding: 0; }
	.cad-dlg-foot { flex: none; display: flex; align-items: center; justify-content: flex-end; gap: 8px; padding: 8px 12px; border-top: 1px solid var(--cad-line, #e4e4e7); }
	/* the footer's buttons, one look in every dialog: Cancel, then the action (.go) on the right; .keys = a key reminder */
	.cad-dlg-foot :global(.btn) { border: 1px solid var(--cad-line, #d4d4d8); border-radius: 4px; padding: 2px 10px; background: var(--cad-input, white); color: inherit; font-size: 12px; }
	.cad-dlg-foot :global(.btn:hover:not(:disabled)) { background: var(--cad-hover); }
	.cad-dlg-foot :global(.btn.go) { background: #2563eb; border-color: #1d4ed8; color: #fff; font-weight: 600; }
	.cad-dlg-foot :global(.btn.go:hover:not(:disabled)) { background: #1d4ed8; }
	.cad-dlg-foot :global(.btn:disabled) { opacity: 0.5; }
	.cad-dlg-foot :global(.btn:focus-visible) { outline: 2px solid #2563eb; outline-offset: 1px; }
	.cad-dlg-foot :global(.keys) { margin-right: auto; font-size: 10px; color: var(--cad-muted, #71717a); }
</style>
