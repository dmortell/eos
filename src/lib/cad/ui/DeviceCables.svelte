<!-- Take every cable / cord off the selected devices' ports (Dave 2026-10-10: unlink P3A's panels U4–U10 at once): one
     device, or several picked with a box or Ctrl-click in a rack view. Asks first; one undo step. -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { Device } from '../domain/types'
	import { cablesOnDevices } from '../domain/ports'

	let { project, ws, devices }: { project: CadProject; ws: Workspace; devices: Device[] } = $props()

	const on = $derived(cablesOnDevices(project.index, devices.map((d) => d.id)))
	const what = $derived(devices.length === 1 ? devices[0].name : `${devices.length} devices`)
	function remove(kind: 'links' | 'cords') {
		const ids = on[kind], n = ids.length
		const label = `Remove ${n} ${kind === 'links' ? 'link' : 'cord'}${n === 1 ? '' : 's'} on ${what}`
		const body = kind === 'links' ? 'their outlet links, ties and backbone cables (patched or not)' : 'their patch cords'
		ws.ask2(`${label}: ${body}? Undo brings them back.`, kind === 'links' ? 'Remove links' : 'Remove cords', () => {
			project.store.transact(label, (tx) => { for (const id of ids) tx.del(id) })
			ws.say(`${label} — Undo brings them back`)
		})
	}
</script>

{#if on.links.length || on.cords.length}
	<div class="flex flex-wrap gap-1 pt-1">
		{#if on.links.length}<button class="btn" title="Remove the permanent cables on every port of {what} — outlet links, ties and backbone (asks first)" onclick={() => remove('links')}>Remove links ({on.links.length})</button>{/if}
		{#if on.cords.length}<button class="btn" title="Remove the patch cords on every port of {what} (asks first)" onclick={() => remove('cords')}>Remove cords ({on.cords.length})</button>{/if}
	</div>
{/if}

<style>
	.btn { border: 1px solid var(--cad-line); border-radius: 4px; padding: 0 6px; font-size: 12px; }
	.btn:hover { background: var(--cad-hover); }
</style>
