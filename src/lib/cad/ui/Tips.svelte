<!-- The TIPS window (Help › Tips; User 2026-10-15: "a tip of the day … with prev / next buttons"): one tip at a time
     (helpContent.ts TIPS / TIPS_JA), ‹ › to step through, EN / 日本語 shared with the Walkthrough. It opens by itself
     once a day (CadShell) until "Show at start" is unticked; each day starts on the next tip. -->
<script lang="ts">
	import { TIPS, TIPS_JA } from './helpContent'
	import { tipsAtStart, setTipsAtStart, tipIndex, setTipIndex } from './tipsStart'

	const LANG = 'cad-walkthrough-lang'
	let lang = $state<'en' | 'ja'>((() => { try { return localStorage.getItem(LANG) === 'ja' ? 'ja' : 'en' } catch { return 'en' } })())
	const setLang = (l: 'en' | 'ja') => { lang = l; try { localStorage.setItem(LANG, l) } catch { /* storage blocked */ } }
	const tips = $derived(lang === 'ja' ? TIPS_JA : TIPS)
	let i = $state(tipIndex() % TIPS.length)
	const step = (d: number) => { i = (i + d + tips.length) % tips.length; setTipIndex(i) }
	let atStart = $state(tipsAtStart())
</script>

<div class="tips" lang={lang}>
	<div class="lang" role="group" aria-label="Language">
		<button class:on={lang === 'en'} onclick={() => setLang('en')}>EN</button>
		<button class:on={lang === 'ja'} onclick={() => setLang('ja')}>日本語</button>
	</div>
	<p class="tip">{tips[i]}</p>
	<div class="bar">
		<label class="start"><input type="checkbox" bind:checked={atStart} onchange={() => setTipsAtStart(atStart)} /> {lang === 'ja' ? '起動時に表示' : 'Show at start'}</label>
		<span class="n">{i + 1} / {tips.length}</span>
		<button class="nav" aria-label="Previous tip" onclick={() => step(-1)}>‹</button>
		<button class="nav" aria-label="Next tip" onclick={() => step(1)}>›</button>
	</div>
</div>

<style>
	.tips { font-size: 12px; line-height: 1.5; display: flex; flex-direction: column; gap: 6px; }
	.lang { display: flex; justify-content: flex-end; gap: 2px; margin-top: 4px; }
	.lang button { padding: 0 8px; border: 1px solid var(--cad-line); border-radius: 4px; font-size: 11px; color: var(--cad-muted); }
	.lang button.on { background: var(--cad-hover); color: var(--cad-text); font-weight: 600; }
	.tip { margin: 0; min-height: 4.5em; color: var(--cad-text, #3f3f46); }
	.bar { display: flex; align-items: center; gap: 6px; }
	.start { display: flex; align-items: center; gap: 4px; font-size: 11px; color: var(--cad-muted); margin-right: auto; }
	.n { font-size: 11px; color: var(--cad-faint); }
	.nav { width: 24px; height: 22px; border: 1px solid var(--cad-line); border-radius: 4px; font-size: 14px; line-height: 1; color: var(--cad-text); }
	.nav:hover { background: var(--cad-hover); }
</style>
