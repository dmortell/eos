<script lang="ts">
	import { tick } from 'svelte'
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
	let riserDoc: any = $state(null)
	const rowRefs = new Map<string, HTMLDivElement>()

	$effect(() => {
		if (!ws.pid) return
		const unsub = db.subscribeOne('risers', ws.pid, (data: any) => {
			riserDoc = data
		})
		return () => unsub?.()
	})

	/** Risers branch surfaces only when the doc has any actual content
	 *  (rooms / cables / ladders / labels). An empty doc with just defaults
	 *  doesn't deserve a tree node. */
	const hasRiserContent = $derived(
		!!(riserDoc?.rooms?.length || riserDoc?.cables?.length || riserDoc?.ladders?.length || riserDoc?.labels?.length),
	)

	function registerRow(el: HTMLDivElement, id: string) {
		rowRefs.set(id, el)
		return {
			update(nextId: string) {
				if (nextId === id) return
				if (rowRefs.get(id) === el) rowRefs.delete(id)
				id = nextId
				rowRefs.set(id, el)
			},
			destroy() {
				if (rowRefs.get(id) === el) rowRefs.delete(id)
			},
		}
	}

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
			const zoneLocsCount = fd?.zoneLocations
				? Object.values(fd.zoneLocations).reduce((n: number, locs: any) => n + ((locs as any[])?.length ?? 0), 0)
				: 0
			if (zoneLocsCount > 0 || fd?.zones?.length || fd?.frames?.length) {
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

		if (hasRiserContent) {
			out.push({
				id: 'group:building',
				kind: 'building',
				label: 'Building',
				children: [{ id: 'building/risers', kind: 'risers', label: 'Risers' }],
			})
		}

		return out
	})

	interface VisibleItem {
		node: TreeNode
		depth: number
		parentId: string | null
	}

	const visible: VisibleItem[] = $derived.by(() => {
		const out: VisibleItem[] = []
		const walk = (nodes: TreeNode[], depth: number, parentId: string | null) => {
			for (const n of nodes) {
				out.push({ node: n, depth, parentId })
				if (n.children?.length && ws.expanded.has(n.id)) {
					walk(n.children, depth + 1, n.id)
				}
			}
		}
		walk(tree, 0, null)
		return out
	})

	const focusedId = $derived(ws.selectedNodeId ?? visible[0]?.node.id ?? null)

	async function selectAndFocus(node: TreeNode) {
		ws.select(node.id, node.kind, node.meta, node.label)
		await tick()
		const el = rowRefs.get(node.id)
		el?.focus()
		el?.scrollIntoView({ block: 'nearest' })
	}

	async function handleKey(e: KeyboardEvent, item: VisibleItem) {
		const { node } = item
		const hasChildren = !!node.children?.length
		const expanded = ws.expanded.has(node.id)
		const idx = visible.findIndex((v) => v.node.id === node.id)

		switch (e.key) {
			case 'ArrowDown': {
				e.preventDefault()
				const next = visible[idx + 1]
				if (next) await selectAndFocus(next.node)
				break
			}
			case 'ArrowUp': {
				e.preventDefault()
				const prev = visible[idx - 1]
				if (prev) await selectAndFocus(prev.node)
				break
			}
			case 'ArrowRight': {
				e.preventDefault()
				if (hasChildren && !expanded) {
					ws.toggleExpanded(node.id)
				} else if (hasChildren && expanded) {
					await selectAndFocus(node.children![0])
				}
				break
			}
			case 'ArrowLeft': {
				e.preventDefault()
				if (hasChildren && expanded) {
					ws.toggleExpanded(node.id)
				} else if (item.parentId) {
					const parent = visible.find((v) => v.node.id === item.parentId)
					if (parent) await selectAndFocus(parent.node)
				}
				break
			}
			case 'Home': {
				e.preventDefault()
				if (visible[0]) await selectAndFocus(visible[0].node)
				break
			}
			case 'End': {
				e.preventDefault()
				const last = visible[visible.length - 1]
				if (last) await selectAndFocus(last.node)
				break
			}
			case 'Enter':
			case ' ': {
				e.preventDefault()
				ws.select(node.id, node.kind, node.meta, node.label)
				break
			}
		}
	}

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

<div class="p-2 text-sm select-none" role="tree" aria-label="Project navigator">
	{#if tree.length === 0}
		<div class="p-3 text-xs text-zinc-500 dark:text-zinc-400">
			No drawings yet. Use the existing tool pages to add floors, racks, or frames; they'll appear here.
		</div>
	{:else}
		{#each visible as item (item.node.id)}
			{@render renderRow(item)}
		{/each}
	{/if}
</div>

{#snippet renderRow(item: VisibleItem)}
	{@const { node, depth } = item}
	{@const expanded = ws.expanded.has(node.id)}
	{@const selected = ws.selectedNodeId === node.id}
	{@const focused = focusedId === node.id}
	{@const hasChildren = !!(node.children && node.children.length)}
	<div
		use:registerRow={node.id}
		class="flex items-center gap-1 py-1 pr-2 rounded cursor-pointer outline-none hover:bg-zinc-100 dark:hover:bg-zinc-800 focus-visible:ring-2 focus-visible:ring-blue-500 {selected
			? 'bg-blue-100 dark:bg-blue-900/40'
			: ''}"
		style="padding-left: {depth * 12 + 8}px"
		role="treeitem"
		aria-selected={selected}
		aria-expanded={hasChildren ? expanded : undefined}
		aria-level={depth + 1}
		tabindex={focused ? 0 : -1}
		onclick={() => ws.select(node.id, node.kind, node.meta, node.label)}
		onkeydown={(e) => handleKey(e, item)}
	>
		{#if hasChildren}
			<button
				class="w-4 h-4 grid place-items-center text-zinc-500 hover:text-zinc-900 dark:hover:text-zinc-100"
				onclick={(e) => {
					e.stopPropagation()
					ws.toggleExpanded(node.id)
				}}
				tabindex="-1"
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
{/snippet}
