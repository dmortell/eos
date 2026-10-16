<!-- PROJECT GROUPS on the Projects page (User 2026-10-16, cad/docs/plan/multi-building-plan.md): add a building to a
     project (a new project in its group — details, members and cad settings copied), move a building into another
     project's group, rename a group, take a building out of its group, archive (delete) a building. Only the group link
     and names change; a building's data never moves. -->
<script lang="ts">
	import { Dialog, Button } from '$lib'
	import { getContext } from 'svelte'
	import type { Firestore } from '$lib'
	import { addBuilding, moveToGroup, renameGroup, ungroup, groupOf, type GroupedProject, type GroupAction } from '$lib/projectGroups'


	let { action = $bindable(null), projects, uid, onadded }: {
		action: GroupAction | null; projects: GroupedProject[]; uid: string | undefined; onadded?: (id: string) => void
	} = $props()

	const fdb = getContext('db') as Firestore
	let open = $state(false)
	let busy = $state(false), error = $state('')
	let building = $state(''), ownBuilding = $state(''), targetId = $state(''), targetBuilding = $state(''), groupName = $state('')
	$effect(() => {
		const a = action
		open = !!a
		if (!a) return
		error = ''; busy = false
		const p = a.project
		building = a.kind === 'add' ? '' : (p.buildingName ?? '')
		ownBuilding = p.buildingName ?? ''
		groupName = groupOf(p)
		targetId = ''; targetBuilding = ''
	})
	$effect(() => { if (!open && action) action = null })

	// where a building can move: every other group (once) and every lone project, by name
	const targets = $derived.by(() => {
		const p = action?.project, seen = new Set<string>(), out: { id: string; label: string; grouped: boolean }[] = []
		for (const x of projects) {
			if (!p || x.id === p.id || x.deleted) continue
			if (x.masterId) { if (x.masterId === p.masterId || seen.has(x.masterId)) continue; seen.add(x.masterId); out.push({ id: x.id, label: `${groupOf(x)} (group)`, grouped: true }) }
			else out.push({ id: x.id, label: x.name, grouped: false })
		}
		return out
	})
	const target = $derived(projects.find((x) => x.id === targetId))

	const title = $derived(!action ? '' : action.kind === 'add' ? 'Add a building' : action.kind === 'move' ? (action.project.masterId ? 'Move to another project' : 'Group with another project') : action.kind === 'rename' ? 'Rename the project group'
		: action.kind === 'ungroup' ? 'Ungroup this building' : 'Delete this building')

	async function go() {
		const a = action
		if (!a) return
		busy = true; error = ''
		try {
			const p = a.project
			if (a.kind === 'add') {
				if (!building.trim()) { error = 'Name the new building'; busy = false; return }
				const id = await addBuilding(p, building, uid, p.masterId ? undefined : ownBuilding || 'Building 1')
				action = null
				onadded?.(id)
				return
			}
			if (a.kind === 'move') {
				if (!target) { error = 'Pick where it goes'; busy = false; return }
				await moveToGroup(p, target, building || p.name, uid, target.masterId ? undefined : targetBuilding || target.buildingName || target.name)
			}
			if (a.kind === 'rename' && p.masterId) await renameGroup(p.masterId, groupName)
			if (a.kind === 'ungroup') await ungroup(p)
			if (a.kind === 'delete') await fdb.save('projects', { id: p.id, deleted: true, deletedAt: new Date(), deletedBy: uid ?? null, updatedAt: new Date() })
			action = null
		} catch (e) { error = (e as Error).message; busy = false }
	}
</script>

<Dialog bind:open {title}>
	{#if action}
		{@const p = action.project}
		<div class="space-y-2 text-sm min-w-80">
			{#if action.kind === 'add'}
				<p class="text-xs text-gray-600">A new project in {p.masterId ? `the ${groupOf(p)} group` : `a group with ${p.name}`}: its details, members and cad settings are copied; its floors and drawings start empty.</p>
				{#if !p.masterId}
					<label class="block text-xs text-gray-700">This project’s building
						<input class="w-full border rounded px-2 py-1 text-sm" bind:value={ownBuilding} placeholder="e.g. building1" /></label>
				{/if}
				<label class="block text-xs text-gray-700">The new building
					<input class="w-full border rounded px-2 py-1 text-sm" bind:value={building} placeholder="e.g. building2" /></label>
			{:else if action.kind === 'move'}
				<p class="text-xs text-gray-600">{p.name} joins another project’s group. Its floors, drawings and settings stay as they are.</p>
				<label class="block text-xs text-gray-700">Into
					<select class="w-full border rounded px-2 py-1 text-sm" bind:value={targetId}>
						<option value="">—</option>
						{#each targets as t (t.id)}<option value={t.id}>{t.label}</option>{/each}
					</select></label>
				<label class="block text-xs text-gray-700">This building’s name
					<input class="w-full border rounded px-2 py-1 text-sm" bind:value={building} placeholder="e.g. building2" /></label>
				{#if target && !target.masterId}
					<label class="block text-xs text-gray-700">{target.name}’s building (it starts the group)
						<input class="w-full border rounded px-2 py-1 text-sm" bind:value={targetBuilding} placeholder="e.g. building1" /></label>
				{/if}
			{:else if action.kind === 'rename'}
				<label class="block text-xs text-gray-700">Group name (every building’s title follows)
					<input class="w-full border rounded px-2 py-1 text-sm" bind:value={groupName} /></label>
			{:else if action.kind === 'ungroup'}
				<p class="text-xs text-gray-600">{p.name} becomes a project of its own (its name stays “{p.name}”; rename it in Edit). Nothing in it changes.</p>
			{:else}
				<p class="text-xs text-gray-600">{p.name} goes to Archived (Restore brings it back, still in its group). The other buildings stay.</p>
			{/if}
			{#if error}<p class="text-xs text-red-600">{error}</p>{/if}
			<div class="flex justify-end gap-2 pt-1">
				<Button variant="outline" onclick={() => (action = null)}>Cancel</Button>
				<Button variant={action.kind === 'delete' ? 'danger' : 'primary'} disabled={busy} onclick={go}>{action.kind === 'add' ? 'Add building' : action.kind === 'move' ? 'Move' : action.kind === 'rename' ? 'Rename' : action.kind === 'ungroup' ? 'Ungroup' : 'Delete building'}</Button>
			</div>
		</div>
	{/if}
</Dialog>
