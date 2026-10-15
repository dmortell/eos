<!-- PLANNING · SURVEYING (patch-list-plan.md D1, User: "an obvious toggle for an engineer inventorying a built site, or a
     designer planning a new install"): what new patch cords start as — ADD (to install) or INSTALLED (already there). A
     project setting, so everyone working on it records the same way; shown wherever cords are made and listed. -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'

	let { project }: { project: CadProject } = $props()

	const mode = $derived(project.settings?.newCordStatus ?? 'add')
	function set(v: 'add' | 'installed') {
		const st = project.settings
		if (!st || v === mode) return
		project.store.transact(v === 'installed' ? 'Surveying (for everyone): new cords installed' : 'Planning (for everyone): new cords to add', (tx) => tx.put({ ...st, newCordStatus: v }))
	}
</script>

<!-- a project setting, not this screen's: the titles say it changes for everyone (review: it sat among per-person
     switches without saying so) -->
<span class="mode" role="group" aria-label="New cords — for everyone on this project">
	<button class:on={mode === 'add'} title="Planning a new install: new cords are ADD (to install) — for everyone on this project" onclick={() => set('add')}>Planning</button>
	<button class:on={mode === 'installed'} title="Surveying a built site: new cords are recorded as INSTALLED (already there) — for everyone on this project" onclick={() => set('installed')}>Surveying</button>
</span>
<span class="who" title="A project setting: switching it changes how new cords start for everyone working on this project">for everyone</span>

<style>
	.mode { display: inline-flex; border: 1px solid var(--cad-line); border-radius: 4px; overflow: hidden; font-size: 11px; vertical-align: middle; }
	button { min-height: 20px; padding: 0 7px; background: var(--cad-input); color: var(--cad-muted); }
	button + button { border-left: 1px solid var(--cad-line); }
	button.on { background: #2563eb; color: white; font-weight: 600; }
	.who { margin-left: 4px; font-size: 10px; color: var(--cad-muted); vertical-align: middle; white-space: nowrap; }
</style>
