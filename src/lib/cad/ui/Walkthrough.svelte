<!-- The WALKTHROUGH window (Help › Walkthrough; Dave 2026-10-15: "keep it open for reference"): a project from start to
     release, stage by stage, short numbered steps (helpContent.ts WALKTHROUGH / WALKTHROUGH_JA). EN / 日本語 at the top
     switches the language (remembered in this browser); a stage folds on a click of its heading. -->
<script lang="ts">
	import { WALKTHROUGH, WALKTHROUGH_JA } from './helpContent'

	const KEY = 'cad-walkthrough-lang'
	let lang = $state<'en' | 'ja'>((() => { try { return localStorage.getItem(KEY) === 'ja' ? 'ja' : 'en' } catch { return 'en' } })())
	const setLang = (l: 'en' | 'ja') => { lang = l; try { localStorage.setItem(KEY, l) } catch { /* storage blocked */ } }
	const stages = $derived(lang === 'ja' ? WALKTHROUGH_JA : WALKTHROUGH)
	// folded stages by their place, so a fold stays when the language changes
	let folded = $state(new Set<number>())
	const fold = (i: number) => { const f = new Set(folded); if (!f.delete(i)) f.add(i); folded = f }
</script>

<div class="walk" lang={lang}>
	<div class="lang" role="group" aria-label="Language">
		<button class:on={lang === 'en'} onclick={() => setLang('en')}>EN</button>
		<button class:on={lang === 'ja'} onclick={() => setLang('ja')}>日本語</button>
	</div>
	{#each stages as s, i (i)}
		<button class="stage" class:shut={folded.has(i)} onclick={() => fold(i)}>{i + 1}. {s.stage}</button>
		{#if !folded.has(i)}<ol>{#each s.steps as x (x)}<li>{x}</li>{/each}</ol>{/if}
	{/each}
</div>

<style>
	.walk { font-size: 12px; line-height: 1.5; }
	.lang { display: flex; justify-content: flex-end; gap: 2px; margin: 4px 0 2px; }
	.lang button { padding: 0 8px; border: 1px solid var(--cad-line); border-radius: 4px; font-size: 11px; color: var(--cad-muted); }
	.lang button.on { background: var(--cad-hover); color: var(--cad-text); font-weight: 600; }
	.stage { display: block; width: 100%; text-align: left; margin: 8px 0 2px; font-size: 11px; font-weight: 600; color: var(--cad-text, #3f3f46); }
	.stage::before { content: '▾'; display: inline-block; width: 12px; color: var(--cad-faint); }
	.stage.shut::before { content: '▸'; }
	ol { margin: 0 0 4px 12px; padding-left: 18px; list-style: decimal; color: var(--cad-muted, #52525b); }
	ol li { padding: 1px 0; }
</style>
