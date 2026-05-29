<script lang="ts">
	import { page } from '$app/state'
	import { Firestore, Icon } from '$lib'
	import { fmtFloor } from '$lib/utils/floor'
	import type { FloorConfig } from '$lib/types/project'
	import { getWorkspace, type TreeNode, type NodeKind } from '../state.svelte'

	let { floors }: { floors: FloorConfig[] } = $props()
	const ws = getWorkspace()
	const db = new Firestore()

	let framesByFloor: Record<number, any> = $state({})
	let racksByFloorRoom: Record<string, any> = $state({})

	$effect(() => {
		if (!ws.pid || !floors.length) return
		const unsubs: Array<() => void> = []
		for (const fl of floors) {
			const floorStr = String(fl.number).padStart(2, '0')
			const fid = `${ws.pid}_F${floorStr}`
			unsubs.push(
				db.subscribeOne('frames', fid, (data: any) => {
					framesByFloor = { ...framesByFloor, [fl.number]: data }
				}),
			)
			const roomCount = fl.serverRoomCount || 1
			const rooms = 'ABCD'.slice(0, roomCount).split('')
			for (const rm of rooms) {
				const rid = `${ws.pid}_F${floorStr}_R${rm}`
				unsubs.push(
					db.subscribeOne('racks', rid, (data: any) => {
						racksByFloorRoom = { ...racksByFloorRoom, [`${fl.number}_${rm}`]: data }
					}),
				)
			}
		}
		return () => unsubs.forEach((u) => u?.())
	})

	const tree: TreeNode[] = $derived.by(() => {
		const out: TreeNode[] = []
		const floorChildren: TreeNode[] = []

		for (const fl of floors) {
			const floorId = `floor:${fl.number}`
			const kids: TreeNode[] = []

			const fd = framesByFloor[fl.number]
			if (fd?.zones?.length || fd?.frames?.length) {
				kids.push({
					id: `${floorId}/frames`,
					kind: 'frames',
					label: 'Patch frames',
					meta: { floor: fl.number },
				})
			}

			const rooms = 'ABCD'.slice(0, fl.serverRoomCount || 1).split('')
			for (const rm of rooms) {
				const rd = racksByFloorRoom[`${fl.number}_${rm}`]
				const rows = rd?.rows ?? []
				const racks = rd?.racks ?? []
				if (!rows.length && !racks.length) continue

				const rowNodes: TreeNode[] = []
				for (const row of rows) {
					const rowRacks = racks
						.filter((r: any) => r.rowId === row.id)
						.sort((a: any, b: any) => (a.order ?? 0) - (b.order ?? 0))
					rowNodes.push({
						id: `${floorId}/sr:${rm}/row:${row.id}`,
						kind: 'row',
						label: row.label ?? `Row ${row.id}`,
						meta: { floor: fl.number, room: rm, rowId: row.id },
						children: rowRacks.map((r: any) => ({
							id: `${floorId}/sr:${rm}/row:${row.id}/rack:${r.id}`,
							kind: 'rack' as NodeKind,
							label: r.label ?? r.id,
							meta: { floor: fl.number, room: rm, rowId: row.id, rackId: r.id },
						})),
					})
				}

				const orphanRacks = racks
					.filter((r: any) => !rows.some((row: any) => row.id === r.rowId))
					.map((r: any) => ({
						id: `${floorId}/sr:${rm}/rack:${r.id}`,
						kind: 'rack' as NodeKind,
						label: r.label ?? r.id,
						meta: { floor: fl.number, room: rm, rackId: r.id },
					}))

				kids.push({
					id: `${floorId}/sr:${rm}`,
					kind: 'serverRoom',
					label: `Server room ${rm}`,
					meta: { floor: fl.number, room: rm },
					children: [...rowNodes, ...orphanRacks],
				})
			}

			if (kids.length) {
				floorChildren.push({
					id: floorId,
					kind: 'floor',
					label: fmtFloor(fl.number, 'L01', floors),
					meta: { floor: fl.number },
					children: kids,
				})
			}
		}

		if (floorChildren.length) {
			out.push({ id: 'group:floors', kind: 'group', label: 'Floors', children: floorChildren })
		}

		return out
	})

	function iconFor(kind: NodeKind): string {
		switch (kind) {
			case 'floor': return 'layers'
			case 'frames': return 'rows'
			case 'serverRoom': return 'server'
			case 'row': return 'grid'
			case 'rack': return 'rectVertical'
			case 'panel': return 'rect'
			case 'outletsHigh':
			case 'outletsLow': return 'route'
			case 'trunks': return 'cable'
			case 'fillrate': return 'pile'
			case 'risers': return 'rectVertical'
			case 'building': return 'home'
			case 'group':
			default: return 'folder'
		}
	}
</script>

<div class="p-2 text-sm select-none">
	{#if tree.length === 0}
		<div class="p-3 text-xs text-zinc-500 dark:text-zinc-400">
			No drawings yet. Use the existing tool pages to add floors, racks, or frames; they'll appear here.
		</div>
	{:else}
		{#each tree as node (node.id)}
			{@render renderNode(node, 0)}
		{/each}
	{/if}
</div>

{#snippet renderNode(node: TreeNode, depth: number)}
	{@const expanded = ws.expanded.has(node.id)}
	{@const selected = ws.selectedNodeId === node.id}
	{@const hasChildren = !!(node.children && node.children.length)}
	<div
		class="flex items-center gap-1 py-1 pr-2 rounded cursor-pointer hover:bg-zinc-100 dark:hover:bg-zinc-800 {selected
			? 'bg-blue-100 dark:bg-blue-900/40'
			: ''}"
		style="padding-left: {depth * 12 + 8}px"
		role="treeitem"
		aria-selected={selected}
		aria-expanded={hasChildren ? expanded : undefined}
		tabindex="0"
		onclick={() => ws.select(node.id, node.kind)}
		onkeydown={(e) => {
			if (e.key === 'Enter' || e.key === ' ') {
				e.preventDefault()
				ws.select(node.id, node.kind)
			}
		}}
	>
		{#if hasChildren}
			<button
				class="w-4 h-4 grid place-items-center text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
				onclick={(e) => {
					e.stopPropagation()
					ws.toggleExpanded(node.id)
				}}
				aria-label={expanded ? 'Collapse' : 'Expand'}
			>
				<Icon name={expanded ? 'chevronDown' : 'chevronRight'} size={12} />
			</button>
		{:else}
			<span class="w-4 h-4 inline-block"></span>
		{/if}
		<Icon name={iconFor(node.kind)} size={14} />
		<span class="truncate">{node.label}</span>
	</div>
	{#if hasChildren && expanded}
		{#each node.children ?? [] as child (child.id)}
			{@render renderNode(child, depth + 1)}
		{/each}
	{/if}
{/snippet}
