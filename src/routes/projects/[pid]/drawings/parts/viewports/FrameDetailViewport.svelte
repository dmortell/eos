<script lang="ts">
	import type { Viewport } from '$lib/types/pages'
	import type { FrameConfig, PanelDevice } from '../../../frames/parts/types'
	import { Firestore } from '$lib'

	let { viewport, db }: { viewport: Viewport; db: Firestore } = $props()

	let src = $derived(viewport.source.kind === 'frame-detail' ? viewport.source : null)

	/**
	 * Subscribe to the frames doc for the referenced floor. The frames tool
	 * derives its frame list from the racks docs at runtime; we mirror that by
	 * looking at the matching racks docs and extracting `panel` devices per rack.
	 * For P7 scope this viewport renders a summary (name + RU + panel list)
	 * rather than the full port grid — the full grid is only legible when the
	 * user opens the frames tool directly.
	 */
	let framesDoc = $state<any>(null)
	$effect(() => {
		const id = src?.frameDocId
		if (!id) { framesDoc = null; return }
		const unsub = db.subscribeOne('frames', id, (data: any) => { framesDoc = data ?? null })
		return () => unsub?.()
	})

	/** Derive the specific frame from the legacy `data.frames` field. */
	let frame = $derived.by<FrameConfig | null>(() => {
		const id = src?.frameId
		if (!id || !framesDoc?.frames) return null
		return (framesDoc.frames as FrameConfig[]).find(f => f.id === id) ?? null
	})

	const ROOM_DOT: Record<string, string> = {
		A: 'bg-blue-500', B: 'bg-purple-500', C: 'bg-teal-500', D: 'bg-rose-500',
	}

	/** Reconstruct a panel list from `panelDevices`, falling back to panelStart/End range. */
	function panelSummary(f: FrameConfig): PanelDevice[] {
		if (f.panelDevices?.length) return [...f.panelDevices].sort((a, b) => a.ru - b.ru)
		const out: PanelDevice[] = []
		for (let ru = f.panelStartRU; ru <= f.panelEndRU; ru++) {
			out.push({ ru, portCount: 24, isHighLevel: false })
		}
		return out
	}

	let noSource = $derived(!src?.frameDocId || !src?.frameId)
</script>

<div class="absolute inset-0 overflow-hidden pointer-events-none bg-white">
	{#if noSource}
		<div class="w-full h-full flex items-center justify-center text-[10px] text-zinc-400 italic">
			Pick a frame source in the properties panel
		</div>
	{:else if !framesDoc}
		<div class="w-full h-full flex items-center justify-center text-[10px] text-zinc-400 italic">
			Loading…
		</div>
	{:else if !frame}
		<div class="w-full h-full flex items-center justify-center text-[10px] text-red-500 italic px-2 text-center">
			Frame <span class="font-mono">{src?.frameId}</span> not found in this doc
		</div>
	{:else}
		{@const panels = panelSummary(frame)}
		<div class="w-full h-full p-1.5 overflow-hidden text-[3pt] leading-tight">
			<!-- Header -->
			<div class="flex items-center gap-1 mb-1 border-b border-zinc-300 pb-0.5">
				<div class="w-1.5 h-1.5 rounded-full {ROOM_DOT[frame.serverRoom] ?? 'bg-zinc-400'}"></div>
				<div class="font-semibold uppercase tracking-wider truncate">{frame.name}</div>
				<div class="ml-auto text-zinc-400">{frame.totalRU}U · {panels.length}p</div>
			</div>
			<!-- Panel list — each as a small coloured bar -->
			<div class="space-y-px">
				{#each panels as p}
					<div class="flex items-center gap-1 bg-zinc-50 px-1 py-px">
						<span class="font-mono text-zinc-400 w-5 text-right">RU{p.ru}</span>
						<div class="flex-1 h-1 rounded-sm {p.isHighLevel ? 'bg-amber-300' : 'bg-emerald-400'}"></div>
						<span class="font-mono text-zinc-500 w-4 text-right">{p.portCount}</span>
					</div>
				{/each}
			</div>
		</div>
	{/if}
</div>
