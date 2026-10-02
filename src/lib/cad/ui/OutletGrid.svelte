<!-- The outlets of one level as an editable grid (ADR 0001: tables are first-class editors). Same records as the
     plan: a click selects in both, an edit is one undo step. Renaming an outlet carries the change into its ports
     (the port labels that start with the old outlet label). -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { Outlet } from '../domain/types'
	import { naturalCompare } from '../domain/labels'
	import { renameOutlet } from '../domain/ports'

	let { project, ws, levelId }: { project: CadProject; ws: Workspace; levelId: string } = $props()

	const rows = $derived(project.index.outlets.filter((o) => o.levelId === levelId).sort((a, b) => naturalCompare(a.label, b.label)))
	const usages = $derived(project.settings?.usages ?? [])
	const selected = $derived(new Set(ws.selection))
	const roomName = (id?: string) => (id ? project.index.nameOf(id) : '')

	function edit(o: Outlet, label: string, patch: Partial<Outlet>) {
		project.store.transact(label, (tx) => tx.put({ ...o, ...patch }))
	}
	/** The input goes back to the stored label at once; it shows the new one when (if) the rename is written — a
	 *  rename that would change printed panel labels asks first. */
	function rename(o: Outlet, input: HTMLInputElement) {
		const next = input.value.trim()
		input.value = o.label
		if (!next || next === o.label) return
		project.relabel(`Rename ${o.label} → ${next}`, [renameOutlet(o, next)], ws.ask2)
	}
	function pick(o: Outlet, e: MouseEvent) {
		ws.select(e.shiftKey || e.ctrlKey ? (selected.has(o.id) ? ws.selection.filter((x) => x !== o.id) : [...ws.selection, o.id]) : [o.id])
	}
</script>

<div class="h-full overflow-auto text-xs">
	<table class="w-full border-collapse">
		<thead class="sticky top-0 bg-zinc-100 text-left text-zinc-600">
			<tr>
				<th class="px-2 py-1">Label</th><th class="px-2">Usage</th><th class="px-2">Tier</th><th class="px-2">Mount</th>
				<th class="px-2">Ports</th><th class="px-2">Server room</th><th class="px-2">Placed</th>
			</tr>
		</thead>
		<tbody>
			{#each rows as o (o.id)}
				<tr class="border-b border-zinc-100 hover:bg-blue-50" class:bg-amber-50={selected.has(o.id)} onclick={(e) => pick(o, e)}>
					<td class="px-2 py-0.5">
						<input class="w-28 rounded border border-transparent bg-transparent px-1 font-mono hover:border-zinc-300 focus:border-blue-400"
							value={o.label} onchange={(e) => rename(o, e.currentTarget)} onclick={(e) => e.stopPropagation()} />
					</td>
					<td class="px-2">
						<select class="bg-transparent" value={o.usage} onchange={(e) => edit(o, 'Usage', { usage: e.currentTarget.value })} onclick={(e) => e.stopPropagation()}>
							{#each usages as u (u.id)}<option value={u.id}>{u.label}</option>{/each}
							{#if !usages.some((u) => u.id === o.usage)}<option value={o.usage}>{o.usage}</option>{/if}
						</select>
					</td>
					<td class="px-2">
						<select class="bg-transparent" value={o.tier} onchange={(e) => edit(o, 'Tier', { tier: e.currentTarget.value as Outlet['tier'] })} onclick={(e) => e.stopPropagation()}>
							<option value="low">Low</option><option value="high">High</option>
						</select>
					</td>
					<td class="px-2">{o.mount}</td>
					<td class="px-2 font-mono text-zinc-600">{o.ports.map((p) => p.label).join('  ')}</td>
					<td class="px-2">{roomName(o.ports[0]?.serverRoomId)}</td>
					<td class="px-2">{o.at ? '✓' : ''}</td>
				</tr>
			{:else}
				<tr><td colspan="7" class="px-2 py-3 text-zinc-400">No outlets on this level yet — use the Outlet tool on the plan.</td></tr>
			{/each}
		</tbody>
	</table>
</div>
