<!-- Take every cable / cord off the selected devices' ports (User 2026-10-10: unlink P3A's panels U4–U10 at once): one
     device, or several picked with a box or Ctrl-click in a rack view. At once, as one undo step ("— Undo brings them
     back"), as on selected ports: only what the button names goes. -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { Cord, Device } from '../domain/types'
	import { cablesOnDevices } from '../domain/ports'
	import { removeCords, removedText } from '../domain/cords'

	let { project, ws, devices }: { project: CadProject; ws: Workspace; devices: Device[] } = $props()

	const on = $derived(cablesOnDevices(project.index, devices.map((d) => d.id)))
	const what = $derived(devices.length === 1 ? devices[0].name : `${devices.length} devices`)
	function remove(kind: 'links' | 'cords') {
		const ids = on[kind], n = ids.length
		const label = `Remove ${n} ${kind === 'links' ? 'link' : 'cord'}${n === 1 ? '' : 's'} on ${what}`
		if (kind === 'cords') {
			// the install workflow (patch-list-plan.md): an installed cord still has to come out on site
			const r = removeCords(ids.map((id) => project.index.get(id) as Cord))
			project.store.transact(label, (tx) => { for (const c of r.marked) tx.put(c); for (const id of r.deleted) tx.del(id) })
			ws.say(`${label}: ${removedText(r)} — Undo brings them back`)
			return
		}
		project.store.transact(label, (tx) => { for (const id of ids) tx.del(id) })
		ws.say(`${label} — Undo brings them back`)
	}
</script>

{#if on.links.length || on.cords.length}
	<div class="flex flex-wrap gap-1 pt-1">
		{#if on.links.length}<button class="btn" title="Remove the permanent cables on every port of {what} — outlet links, ties and backbone, patched or not (Undo brings them back)" onclick={() => remove('links')}>Remove links ({on.links.length})</button>{/if}
		{#if on.cords.length}<button class="btn" title="Remove the patch cords on every port of {what} — installed ones are marked for removal (they come out on site), planned ones deleted (Undo brings them back)" onclick={() => remove('cords')}>Remove cords ({on.cords.length})</button>{/if}
	</div>
{/if}

<style>
	.btn { min-height: 20px; border: 1px solid var(--cad-line); border-radius: 4px; padding: 0 6px; font-size: 12px; }
</style>
