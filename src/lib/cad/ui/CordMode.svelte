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
     switches without saying so); the label beside it says "(all users)" — "for everyone" after it read unclear (User
     2026-10-20). Looks like the status bar's SNAP / OSNAP toggles (light blue when on), not a primary button. -->
<span class="mode" role="group" aria-label="New cords — for everyone on this project">
	<button class:on={mode === 'add'} title="Planning a new install: new cords are ADD (to install) — for everyone on this project" onclick={() => set('add')}>Planning</button>
	<button class:on={mode === 'installed'} title="Surveying a built site: new cords are recorded as INSTALLED (already there) — for everyone on this project" onclick={() => set('installed')}>Surveying</button>
</span>

<style>
	/* as the status bar's toggles (StatusBar .toggles): faint text, light blue with a blue edge when on */
	.mode { display: inline-flex; gap: 2px; vertical-align: middle; }
	button { min-height: 20px; padding: 1px 6px; border-radius: 4px; font-size: 10px; letter-spacing: 0.04em; color: var(--cad-faint); border: 1px solid transparent; }
	button:hover { background: var(--cad-hover); }
	button.on { color: var(--cad-link, #1d4ed8); background: var(--cad-sel, #dbeafe); border-color: var(--cad-sel-line, #93c5fd); }
</style>
