<!-- Several selected cords (patch-list-plan.md Slice 2): Installed · Add · Remove · Restore · Delete, each with how many
     it touches, and their cable type / color (D5: no status change; a type brings its color). In the patch list's
     bar and in Properties. -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { Cord } from '../domain/types'
	import { sortedCableTypes } from '../domain/cableTypes'
	import { withCableType } from '../domain/cords'
	import { cordActionsFor, runCordAction, askRepatch, REPATCH_TITLE } from './cordActions'
	import ColorPick from './ColorPick.svelte'
	import { MIXED } from './propsKit'

	let { project, ws, cords, column = false }: { project: CadProject; ws: Workspace; cords: Cord[]; column?: boolean } = $props()

	// every action in one order, greyed when it touches none: the buttons stay put as statuses change (User 2026-10-20)
	const acts = $derived(cordActionsFor(cords, true))
	const types = $derived(sortedCableTypes(project.settings))
	const sameType = $derived(cords.every((c) => c.cableType === cords[0]?.cableType) ? cords[0]?.cableType : undefined)
	const sameColour = $derived(cords.every((c) => c.colour === cords[0]?.colour) ? cords[0]?.colour : undefined)
	const n = $derived(`${cords.length} cord${cords.length === 1 ? '' : 's'}`)

	function setType(id: string) {
		const t = types.find((x) => x.id === id)
		if (!t) return
		project.store.transact(`Cable type ${t.label} (${n})`, (tx) => { for (const c of cords) tx.put(withCableType(c, t)) })
	}
	function setColour(v: string | undefined) {
		if (!v) return
		project.store.transact(`Cord color (${n})`, (tx) => { for (const c of cords) tx.put({ ...c, colour: v }) })
	}
</script>

<div class="bar" class:column>
	<span class="acts">
		{#each acts as x (x.a)}<button class="btn" class:danger={x.a === 'delete'} disabled={!x.n} title={x.n ? x.title : `${x.title} — none of these cords`} onclick={() => runCordAction(project, ws, cords, x.a)}>{x.label} ({x.n})</button>{/each}
		<button class="btn" disabled={!cords.length} title={REPATCH_TITLE} onclick={() => askRepatch(project, ws, cords)}>Re-patch…</button>
	</span>
	<label class="fld" title="The cable type of {n} — its color comes with it">Type
		<select class="inp" value={sameType ?? ''} onchange={(e) => setType(e.currentTarget.value)}>
			{#if !sameType}<option value="">{MIXED}</option>{/if}
			{#each types as t (t.id)}<option value={t.id}>{t.label}</option>{/each}
			{#if sameType && !types.some((t) => t.id === sameType)}<option value={sameType}>{sameType}</option>{/if}
		</select>
	</label>
	<span class="fld" role="group" aria-label="Color">Color <ColorPick value={sameColour} mixed={!sameColour} onchange={setColour} /></span>
</div>

<style>
	.bar { display: flex; flex-wrap: wrap; align-items: center; gap: 4px 10px; }
	.bar.column { flex-direction: column; align-items: stretch; }
	.acts { display: flex; flex-wrap: wrap; gap: 4px; }
	.fld { display: flex; align-items: center; gap: 4px; }
	.column .fld { display: grid; grid-template-columns: 6.5rem 1fr; }
	.btn { min-height: 20px; border: 1px solid var(--cad-line); border-radius: 4px; padding: 0 6px; background: var(--cad-input); color: var(--cad-text); }
	.btn:hover:not(:disabled) { background: var(--cad-hover); }
	.btn.danger { color: #b91c1c; }
	.btn:disabled { opacity: 0.4; cursor: default; }
	.inp { border: 1px solid var(--cad-line); border-radius: 4px; padding: 0 4px; background: var(--cad-input); color: var(--cad-text); }
</style>
