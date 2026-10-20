<!-- Every table's frame (review R79): one bar of a fixed layout over a scrolling table —
       [scope] [Find] [filter chips] · count | what acts on the selection (only with one; a hint without) | ⋯
     The bar stays put while the table scrolls under it (its header row sticks to the top of the scroll). The keys
     (↑ / ↓, F2, Ctrl+A, Ctrl+C …) go to `onkeydown` on the whole frame. -->
<script lang="ts">
	import type { Snippet } from 'svelte'
	import type { TableState } from './tableKit.svelte'
	import type { MenuItem } from './cadMenus'
	import ScopeSelect from './ScopeSelect.svelte'
	import MoreMenu from './MoreMenu.svelte'
	import { typingIn } from './keyGuards'

	let { label, t, view, lead, chips, count, countTitle = 'Shown · in this scope · selected', nSel = 0, sel, hint, tail, more = [], top, onkeydown, children }: {
		/** The table's name, for screen readers. */
		label: string
		/** Its sort / Find / scope: the scope select and the Find box (none: neither). */
		t?: TableState
		/** What "This view" is called in the scope select (the level's / room's name). */
		view?: string
		/** Before the scope (the Sheets tab's Sheets · Packages · Issues switch). */
		lead?: Snippet
		chips?: Snippet
		count?: string
		countTitle?: string
		/** How many selected rows `sel` acts on: 0 = the hint instead. */
		nSel?: number
		sel?: Snippet
		hint?: string
		/** Always shown, before ⋯ (a mode such as Planning · Surveying). */
		tail?: Snippet
		more?: MenuItem[]
		/** Above the table, under the bar (a panel such as Issue…). */
		top?: Snippet
		onkeydown?: (e: KeyboardEvent) => void
		children: Snippet
	} = $props()
	// Ctrl+A is the table's (its rows: `selectAllRows` in the table's keys), never the drawing's select-all — a table
	// with no rows to pick (Packages, Issues) still keeps it from the shell
	function key(e: KeyboardEvent) {
		onkeydown?.(e)
		if (!e.defaultPrevented && (e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'a' && !typingIn(e.target)) { e.preventDefault(); e.stopPropagation() }
	}
</script>

<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<div class="frame text-xs" tabindex="0" role="grid" aria-label={label} onkeydown={key}>
	<div class="bar">
		{@render lead?.()}
		{#if t}
			<ScopeSelect {t} {view} />
			<input class="find" type="search" placeholder="Find…" aria-label="Find in the table" bind:value={t.q} />
		{/if}
		{@render chips?.()}
		{#if count !== undefined}<span class="count" title={countTitle}>{count}</span>{/if}
		{#if sel || hint}
			<span class="sel" class:hinting={!(nSel && sel) && !!hint}>
				{#if nSel && sel}{@render sel()}{:else if hint}<span class="hint" title={hint}>{hint}</span>{/if}
			</span>
		{/if}
		<span class="end">
			{@render tail?.()}
			{#if more.length}<MoreMenu items={more} />{/if}
		</span>
	</div>
	<div class="scroll">
		{@render top?.()}
		{@render children()}
	</div>
</div>

<style>
	.frame { display: flex; flex-direction: column; height: 100%; min-height: 0; }
	.frame:focus { outline: none; }
	.bar { flex: 0 0 auto; display: flex; flex-wrap: wrap; align-items: center; gap: 4px 6px; min-height: 30px; padding: 3px 8px; border-bottom: 1px solid var(--cad-line); background: var(--cad-panel); }
	.scroll { flex: 1; min-height: 0; overflow: auto; }
	.find { border: 1px solid var(--cad-line); border-radius: 4px; padding: 0 4px; min-height: 20px; width: 10rem; background: var(--cad-input); color: var(--cad-text); }
	.count { color: var(--cad-faint); white-space: nowrap; }
	/* what acts on the selection: after a divider, so it reads as its own group */
	.sel { display: inline-flex; flex-wrap: wrap; align-items: center; gap: 4px; padding-left: 8px; border-left: 1px solid var(--cad-line); }
	/* the hint: one line in the room that's left, cut with … (the whole of it on hover) — it wrapped and pushed the
	   bar's right-hand buttons onto a second line (User 2026-10-20: "looks bad") */
	.sel.hinting { flex: 1 1 0; min-width: 6rem; flex-wrap: nowrap; margin-right: 10px; }
	.hint { color: var(--cad-faint); min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
	.end { margin-left: auto; display: inline-flex; align-items: center; gap: 6px; }
	/* the buttons the tables put in the bar */
	.bar :global(.tb) { display: inline-flex; align-items: center; gap: 3px; min-height: 20px; border: 1px solid var(--cad-line); border-radius: 4px; padding: 0 6px; background: var(--cad-input); color: var(--cad-text); white-space: nowrap; }
	.bar :global(.tb:hover:not(:disabled)) { background: var(--cad-hover); }
	.bar :global(.tb:disabled) { opacity: 0.4; }
	.bar :global(.tb.pri) { background: #2563eb; border-color: #2563eb; color: white; }   /* the next step (Allocate this level) */
	.bar :global(.tb.danger) { color: #b91c1c; }
	.bar :global(.tb:focus-visible) { outline: 2px solid #2563eb; outline-offset: 1px; }
</style>
