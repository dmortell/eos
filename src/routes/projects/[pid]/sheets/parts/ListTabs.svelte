<script lang="ts">
	// Segmented Sheets / Packages switch shown in the list header.
	let { mode, onmode }: { mode: 'sheets' | 'packages'; onmode: (m: 'sheets' | 'packages') => void } = $props()
	const cls = (on: boolean) => ['px-3 py-1 text-sm font-medium transition-colors', on ? 'bg-blue-600 text-white' : 'text-zinc-600 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800']
</script>

<div class="inline-flex overflow-hidden rounded-md border border-zinc-300 dark:border-zinc-700">
	<button class={cls(mode === 'sheets')} onclick={() => onmode('sheets')}>Sheets</button>
	<button class={cls(mode === 'packages')} onclick={() => onmode('packages')}>Packages</button>
</div>
