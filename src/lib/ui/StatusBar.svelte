<script lang="ts">
	import type { Snippet } from 'svelte'

	/**
	 * Thin contextual status / instruction strip, typically pinned to the bottom
	 * of a tool's workspace. Pass a plain `message`, or `children` for custom
	 * content. `print:hidden` keeps it out of printed output.
	 *
	 * Height is set in explicit px (not a Tailwind `h-*` rem unit) so callers can
	 * reserve the exact same number of pixels for it without depending on the
	 * app's root font-size (this app sets `html { font-size: 14px }`, so rem-based
	 * heights don't equal their px name).
	 */
	let { message = '', height = 24, children }: {
		message?: string
		height?: number
		children?: Snippet
	} = $props()
</script>

<div
	class="print:hidden shrink-0 flex items-center gap-2 px-3 border-t border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900 text-[11px] text-zinc-500 dark:text-zinc-400 select-none whitespace-nowrap overflow-hidden"
	style:height="{height}px"
>
	{#if children}
		{@render children()}
	{:else}
		<span class="truncate">{message}</span>
	{/if}
</div>
