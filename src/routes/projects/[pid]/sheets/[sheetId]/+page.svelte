<script lang="ts">
	// Stage A stub — replaced by the full SheetEditor in Stage B.
	import { page } from '$app/state'
	import { goto } from '$app/navigation'
	import { Firestore, Titlebar, Button, Icon } from '$lib'
	import type { SheetDoc } from '../types'

	let db = getContext('db') as Firestore
	let pid = $derived(page.params.pid)
	let sheetId = $derived(page.params.sheetId)

	let sheet = $state<SheetDoc | null>(null)

	$effect(() => {
		if (!pid || !sheetId) return
		const unsub = db.subscribeOne(`projects/${pid}/sheets`, sheetId, (data: any) => {
			sheet = data?.title !== undefined ? (data as SheetDoc) : null
		})
		return () => { unsub?.() }
	})
</script>

<Titlebar title={sheet ? `Sheet — ${sheet.title}` : 'Sheet'} height={30} />

<div class="p-6 space-y-3">
	<Button onclick={() => goto(`/projects/${pid}/sheets`)}>
		<Icon name="chevronLeft" size={14} />
		Back to sheets
	</Button>

	{#if sheet}
		<div class="text-sm text-zinc-600 dark:text-zinc-300">
			<div><span class="text-zinc-400">Title:</span> {sheet.title}</div>
			<div><span class="text-zinc-400">Drawing No.:</span> {sheet.drawingNumber || '—'}</div>
			<div><span class="text-zinc-400">Paper:</span> {sheet.paper?.paperSize} {sheet.paper?.orientation}</div>
			<div><span class="text-zinc-400">Viewports:</span> {sheet.viewports?.length ?? 0}</div>
		</div>
		<p class="text-xs text-zinc-400">Editor (canvas, viewports, title block) arrives in Stage B.</p>
	{:else}
		<p class="text-sm text-zinc-400">Sheet not found.</p>
	{/if}
</div>
