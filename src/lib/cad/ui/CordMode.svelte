<!-- PLANNING · SURVEYING (patch-list-plan.md D1, Dave: "an obvious toggle for an engineer inventorying a built site, or a
     designer planning a new install"): what new patch cords start as — ADD (to install) or INSTALLED (already there). A
     project setting, so everyone working on it records the same way; shown wherever cords are made and listed. -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'

	let { project }: { project: CadProject } = $props()

	const mode = $derived(project.settings?.newCordStatus ?? 'add')
	function set(v: 'add' | 'installed') {
		const st = project.settings
		if (!st || v === mode) return
		project.store.transact(v === 'installed' ? 'Surveying: new cords installed' : 'Planning: new cords to add', (tx) => tx.put({ ...st, newCordStatus: v }))
	}
</script>

<span class="mode" role="group" aria-label="New cords">
	<button class:on={mode === 'add'} title="Planning a new install: new cords are ADD (to install)" onclick={() => set('add')}>Planning</button>
	<button class:on={mode === 'installed'} title="Surveying a built site: new cords are recorded as INSTALLED (already there)" onclick={() => set('installed')}>Surveying</button>
</span>

<style>
	.mode { display: inline-flex; border: 1px solid var(--cad-line); border-radius: 4px; overflow: hidden; font-size: 11px; vertical-align: middle; }
	button { padding: 0 7px; background: var(--cad-input); color: var(--cad-muted); }
	button + button { border-left: 1px solid var(--cad-line); }
	button.on { background: #2563eb; color: white; font-weight: 600; }
</style>
