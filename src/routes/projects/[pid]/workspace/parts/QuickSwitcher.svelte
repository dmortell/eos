<script lang="ts">
	import { tick } from 'svelte'
	import { Firestore, Icon } from '$lib'
	import { fmtFloor } from '$lib/utils/floor'
	import type { FloorConfig } from '$lib/types/project'
	import { getWorkspace, type NodeKind, type TreeNode } from '../state.svelte'

	let { open = $bindable(false), floors = [] }: { open: boolean; floors: FloorConfig[] } = $props()

	const ws = getWorkspace()
	const db = new Firestore()

	let framesByFloor: Record<number, any> = $state({})
	let racksByFloorRoom: Record<string, any> = $state({})
	let riserDoc: any = $state(null)

	$effect(() => {
		if (!open || !ws.pid || !floors.length) return
		const unsubs: Array<() => void> = []
		for (const fl of floors) {
			const floorStr = String(fl.number).padStart(2, '0')
			unsubs.push(db.subscribeOne('frames', `${ws.pid}_F${floorStr}`, (data: any) => {
				framesByFloor = { ...framesByFloor, [fl.number]: data }
			}))
			const rooms = 'ABCD'.slice(0, fl.serverRoomCount || 1).split('')
			for (const rm of rooms) {
				unsubs.push(db.subscribeOne('racks', `${ws.pid}_F${floorStr}_R${rm}`, (data: any) => {
					racksByFloorRoom = { ...racksByFloorRoom, [`${fl.number}_${rm}`]: data }
				}))
			}
		}
		unsubs.push(db.subscribeOne('risers', ws.pid, (data: any) => (riserDoc = data)))
		return () => unsubs.forEach((u) => u?.())
	})

	interface Item {
		id: string
		kind: NodeKind
		label: string
		path: string
		meta?: TreeNode['meta']
	}

	const items: Item[] = $derived.by(() => {
		const out: Item[] = []
		for (const fl of floors) {
			const floorLabel = fmtFloor(fl.number, 'L01', floors)
			const floorBase = `floor:${fl.number}`

			const fd = framesByFloor[fl.number]
			const zoneLocsCount = fd?.zoneLocations
				? Object.values(fd.zoneLocations).reduce((n: number, locs: any) => n + ((locs as any[])?.length ?? 0), 0)
				: 0

			let hasContent = zoneLocsCount > 0 || fd?.frames?.length

			if (zoneLocsCount > 0 || fd?.frames?.length) {
				out.push({
					id: `${floorBase}/frames`,
					kind: 'frames',
					label: 'Patch frames',
					path: `${floorLabel} / Patch frames`,
					meta: { floor: fl.number },
				})
			}

			const rooms = 'ABCD'.slice(0, fl.serverRoomCount || 1).split('')
			for (const rm of rooms) {
				const rd = racksByFloorRoom[`${fl.number}_${rm}`]
				const rows = rd?.rows ?? []
				const racks = rd?.racks ?? []
				if (!rows.length && !racks.length) continue
				hasContent = true

				out.push({
					id: `${floorBase}/sr:${rm}`,
					kind: 'serverRoom',
					label: `Server room ${rm}`,
					path: `${floorLabel} / Server room ${rm}`,
					meta: { floor: fl.number, room: rm },
				})

				for (const row of rows) {
					out.push({
						id: `${floorBase}/sr:${rm}/row:${row.id}`,
						kind: 'row',
						label: row.label ?? `Row ${row.id}`,
						path: `${floorLabel} / Server room ${rm} / ${row.label ?? row.id}`,
						meta: { floor: fl.number, room: rm, rowId: row.id },
					})
					const rowRacks = racks
						.filter((r: any) => r.rowId === row.id)
						.sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0))
					for (const r of rowRacks) {
						out.push({
							id: `${floorBase}/sr:${rm}/row:${row.id}/rack:${r.id}`,
							kind: 'rack',
							label: r.label ?? r.id,
							path: `${floorLabel} / Server room ${rm} / ${row.label ?? row.id} / ${r.label ?? r.id}`,
							meta: { floor: fl.number, room: rm, rowId: row.id, rackId: r.id },
						})
					}
				}
			}

			if (hasContent) {
				out.push({
					id: floorBase,
					kind: 'floor',
					label: floorLabel,
					path: floorLabel,
					meta: { floor: fl.number },
				})
			}
		}

		const hasRiser = !!(riserDoc?.rooms?.length || riserDoc?.cables?.length || riserDoc?.ladders?.length || riserDoc?.labels?.length)
		if (hasRiser) {
			out.push({ id: 'building/risers', kind: 'risers', label: 'Risers', path: 'Building / Risers' })
		}

		return out
	})

	let query = $state('')
	let cursor = $state(0)
	let inputEl = $state<HTMLInputElement | null>(null)

	const filtered = $derived.by(() => {
		const q = query.trim().toLowerCase()
		if (!q) return items.slice(0, 50)
		return items
			.filter((it) => `${it.label} ${it.path} ${it.kind}`.toLowerCase().includes(q))
			.slice(0, 50)
	})

	$effect(() => {
		void filtered
		if (cursor >= filtered.length) cursor = 0
	})

	$effect(() => {
		if (open) {
			tick().then(() => inputEl?.focus())
		} else {
			query = ''
			cursor = 0
		}
	})

	function choose(it: Item) {
		ws.select(it.id, it.kind, it.meta, it.label)
		open = false
	}

	function onKey(e: KeyboardEvent) {
		if (!open) return
		if (e.key === 'Escape') {
			e.preventDefault()
			open = false
		} else if (e.key === 'ArrowDown') {
			e.preventDefault()
			cursor = Math.min(filtered.length - 1, cursor + 1)
		} else if (e.key === 'ArrowUp') {
			e.preventDefault()
			cursor = Math.max(0, cursor - 1)
		} else if (e.key === 'Enter') {
			e.preventDefault()
			const it = filtered[cursor]
			if (it) choose(it)
		}
	}

	function iconFor(kind: NodeKind): string {
		switch (kind) {
			case 'floor': return 'layers'
			case 'frames': return 'rows'
			case 'serverRoom': return 'server'
			case 'row': return 'grid'
			case 'rack': return 'rectVertical'
			case 'risers': return 'rectVertical'
			default: return 'folder'
		}
	}
</script>

<svelte:window onkeydown={onKey} />

{#if open}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="fixed inset-0 z-50 bg-black/40 flex items-start justify-center pt-24"
		onclick={() => (open = false)}
	>
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div
			class="w-[520px] max-w-[90vw] bg-white dark:bg-zinc-900 border border-zinc-200 dark:border-zinc-800 rounded-lg shadow-xl overflow-hidden"
			onclick={(e) => e.stopPropagation()}
		>
			<div class="flex items-center gap-2 px-3 py-2 border-b border-zinc-200 dark:border-zinc-800">
				<Icon name="search" size={14} />
				<input
					bind:this={inputEl}
					bind:value={query}
					placeholder="Jump to floor, room, row, rack, frames, risers…"
					class="flex-1 bg-transparent text-sm outline-none placeholder-zinc-400"
				/>
				<span class="text-[10px] text-zinc-400 font-mono">esc</span>
			</div>
			<ul class="max-h-[60vh] overflow-y-auto py-1 text-sm">
				{#each filtered as it, i (it.id)}
					<!-- svelte-ignore a11y_click_events_have_key_events -->
					<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
					<li
						class="flex items-center gap-2 px-3 py-1.5 cursor-pointer
							{i === cursor ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300' : 'hover:bg-zinc-50 dark:hover:bg-zinc-800/60'}"
						onmouseenter={() => (cursor = i)}
						onclick={() => choose(it)}
					>
						<Icon name={iconFor(it.kind)} size={12} />
						<span class="flex-1 truncate">{it.label}</span>
						<span class="text-[10px] text-zinc-400 truncate max-w-[260px]">{it.path}</span>
					</li>
				{/each}
				{#if filtered.length === 0}
					<li class="px-3 py-2 text-xs text-zinc-400">No matches.</li>
				{/if}
			</ul>
		</div>
	</div>
{/if}
