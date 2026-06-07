<script lang="ts">
	import { page } from '$app/state'
	import { getContext } from 'svelte'
	import { Firestore, Titlebar, Spinner } from '$lib'
	import type { SheetDoc } from '../types'
	import type { TitleBlockProjectDefaults } from '../parts/TitleBlock.svelte'
	import SheetEditor from '../SheetEditor.svelte'

	let db = getContext('db') as Firestore
	let pid = $derived(page.params.pid)
	let sheetId = $derived(page.params.sheetId)

	let sheet = $state<SheetDoc | null>(null)
	let project = $state<TitleBlockProjectDefaults>({})
	let loading = $state(true)

	// Sheet doc
	$effect(() => {
		if (!pid || !sheetId) return
		loading = true
		const unsub = db.subscribeOne(`projects/${pid}/sheets`, sheetId, (data: any) => {
			// subscribeOne returns { id } for a missing doc; treat absence of real fields as "not found".
			sheet = data && (data.title !== undefined || data.paper !== undefined) ? (data as SheetDoc) : null
			loading = false
		})
		return () => { unsub?.() }
	})

	// Project defaults for the title block
	$effect(() => {
		if (!pid) return
		const unsub = db.subscribeOne('projects', pid, (data: any) => {
			project = {
				name: data?.name,
				author: data?.author,
				address: data?.address,
				logoUrl: data?.logoUrl,
				client: data?.client,
			}
		})
		return () => { unsub?.() }
	})
</script>

<!-- App shell: a viewport-tall flex column. The titlebar takes its natural height;
     everything below (SheetEditor → menubar / canvas / status bar) flexes to fill the rest. -->
<div class="flex h-[100dvh] flex-col overflow-hidden">
	<Titlebar title={sheet ? `Sheet — ${sheet.title}` : 'Sheet'} height={30} />
	{#if loading}
		<div class="flex flex-1 items-center justify-center">
			<Spinner>Loading sheet...</Spinner>
		</div>
	{:else if sheet}
		<SheetEditor {sheet} {project} {db} pid={pid ?? ''} />
	{:else}
		<div class="flex flex-1 items-center justify-center text-sm text-zinc-400">Sheet not found.</div>
	{/if}
</div>
