<!-- The circuit a port or cord is part of, end to end: outlet port ─link─ panel port ═cord═ switch port … -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { TraceStep } from '../domain/cords'

	let { project, steps }: { project: CadProject; steps: TraceStep[] } = $props()
</script>

{#if steps.length > 1}
	<p class="pt-1 font-semibold">Circuit</p>
	<ol class="trace">
		{#each steps as s, i (i)}
			{#if s.via}<li class="via">{s.via.kind === 'link' ? '│ cable' : '║ cord'}</li>{/if}
			<li><span>{project.index.portPlace(s.ref)}</span>{#if project.index.portLabel(s.ref)}<span class="lbl">{project.index.portLabel(s.ref)}</span>{/if}</li>
		{/each}
	</ol>
{/if}

<style>
	.trace { list-style: none; padding: 0; margin: 0; }
	.trace li { display: flex; justify-content: space-between; gap: 6px; }
	.trace .via { color: var(--cad-faint); font-size: 10px; padding-left: 6px; }
	.lbl { font-family: ui-monospace, monospace; color: var(--cad-link); }
</style>
