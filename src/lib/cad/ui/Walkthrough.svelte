<!-- The WALKTHROUGH (Help › Walkthrough; Dave 2026-10-15: "keep it open for reference"): a project from start to
     release, stage by stage, short numbered steps (helpContent.ts WALKTHROUGH). Its own window (floating or docked, the
     Window menu) and a section of Help; `filter` = Help's search. A stage folds on a click of its heading. -->
<script lang="ts">
	import { WALKTHROUGH } from './helpContent'

	let { filter = (_: string) => true }: { filter?: (...t: string[]) => boolean } = $props()

	const stages = $derived(WALKTHROUGH.map((s) => ({ ...s, steps: s.steps.filter((x) => filter(x, s.stage, 'walkthrough')) })).filter((s) => s.steps.length))
	let folded = $state(new Set<string>())
	const fold = (s: string) => { const f = new Set(folded); if (!f.delete(s)) f.add(s); folded = f }
</script>

<div class="walk">
	{#each stages as s, i (s.stage)}
		<button class="stage" class:shut={folded.has(s.stage)} onclick={() => fold(s.stage)}>{i + 1}. {s.stage}</button>
		{#if !folded.has(s.stage)}<ol>{#each s.steps as x (x)}<li>{x}</li>{/each}</ol>{/if}
	{/each}
</div>

<style>
	.walk { font-size: 12px; line-height: 1.5; }
	.stage { display: block; width: 100%; text-align: left; margin: 8px 0 2px; font-size: 11px; font-weight: 600; color: var(--cad-text, #3f3f46); }
	.stage::before { content: '▾'; display: inline-block; width: 12px; color: var(--cad-faint); }
	.stage.shut::before { content: '▸'; }
	ol { margin: 0 0 4px 12px; padding-left: 18px; list-style: decimal; color: var(--cad-muted, #52525b); }
	ol li { padding: 1px 0; }
</style>
