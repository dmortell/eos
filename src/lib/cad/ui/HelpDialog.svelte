<!-- HELP (F1 / ?, Help menu; backlog "Help (F1 / ?)", UX22; modelled on Pages' HelpDialog): how-to answers (label
     editing with F2 / Tab first), keys and mouse, function keys and every tool — click a tool to pick it. One search
     box filters all of it; `keys` opens on the keys list. -->
<script lang="ts">
	import { tick } from 'svelte'
	import { Icon } from '$lib'
	import CadDialog from './CadDialog.svelte'
	import { HOWTO, HOWTO_AREAS, SHORTCUTS, FKEYS } from './helpContent'
	import { TOOL_GROUPS } from './toolGroups'
	import type { ToolId } from '../app/workspace.svelte'

	let { onclose, ontool, keys = false, hints }: { onclose: () => void; ontool: (id: ToolId) => void; keys?: boolean; hints: Partial<Record<ToolId, string>> } = $props()

	let q = $state('')
	let input: HTMLInputElement | undefined = $state()
	let keysEl: HTMLElement | undefined = $state()
	$effect(() => { void tick().then(() => { input?.focus(); if (keys) keysEl?.scrollIntoView({ block: 'start' }) }) })
	const hit = (...t: string[]) => { const w = q.trim().toLowerCase(); return !w || t.some((x) => x.toLowerCase().includes(w)) }
	let opened = $state<string | null>(HOWTO.find((h) => h.featured)?.q ?? null)
	const howto = $derived(HOWTO.filter((h) => hit(h.q, h.a, HOWTO_AREAS[h.area])))
	/** The how-tos by area, in HOWTO_AREAS' order (review R84). */
	const areas = $derived((Object.keys(HOWTO_AREAS) as (keyof typeof HOWTO_AREAS)[]).map((a) => ({ a, name: HOWTO_AREAS[a], items: howto.filter((h) => h.area === a) })).filter((g) => g.items.length))
	const shortcuts = $derived(SHORTCUTS.filter(([a, b]) => hit(a, b)))
	const fkeys = $derived(FKEYS.filter(([a, b]) => hit(a, b)))
	const tools = $derived(TOOL_GROUPS.map((g) => ({ name: g.name, tools: g.tools.filter((t) => hit(t.label, hints[t.id] ?? '', g.name)) })).filter((g) => g.tools.length))
</script>

<CadDialog label="Help" width="780px" top="6vh" flush {onclose}>
	{#snippet head()}
		<span class="lens"><Icon name="search" size={14} /></span>
		<input bind:this={input} class="q" aria-label="Search help" placeholder="Search help — e.g. label, snap, viewport, patch…" bind:value={q} />
	{/snippet}
		<div class="body">
			{#if howto.length}
				<h3>How do I…</h3>
				{#each areas as g (g.a)}
					<h4>{g.name}</h4>
					{#each g.items as h (h.q)}
						<div class="how" class:open={opened === h.q || !!q.trim()} class:featured={h.featured}>
							<button class="how-q" onclick={() => (opened = opened === h.q ? null : h.q)}>{h.q}{#if h.featured}<span class="star">★ very useful</span>{/if}</button>
							{#if opened === h.q || q.trim()}<p>{h.a}</p>{/if}
						</div>
					{/each}
				{/each}
			{/if}
			{#if shortcuts.length}
				<h3 bind:this={keysEl}>Keys &amp; mouse</h3>
				<div class="grid">{#each shortcuts as [a, b] (a)}<div class="row"><span>{a}</span><kbd>{b}</kbd></div>{/each}</div>
			{/if}
			{#if fkeys.length}
				<h3>Function keys</h3>
				<div class="grid">{#each fkeys as [k, what] (k)}<div class="row"><span>{what}</span><kbd>{k}</kbd></div>{/each}</div>
			{/if}
			{#if !q.trim() || hit('typed point coordinates')}
				<h3>Typing points</h3>
				<p>While a drawing tool is active, just type: the point box opens in the status bar. <code>x,y</code> is a point, <code>@dx,dy</code> is from the last point, <code>@d&lt;angle</code> a distance and angle, a bare number a distance towards the cursor. Enter places it; Esc cancels.</p>
			{/if}
			{#each tools as g (g.name)}
				<h3>{g.name} tools</h3>
				<div class="tools">
					{#each g.tools as t (t.id)}
						<button class="tool" title="Pick this tool" onclick={() => { ontool(t.id); onclose() }}><Icon name={t.icon} size={14} /><b>{t.label}</b><span>{hints[t.id] ?? ''}</span></button>
					{/each}
				</div>
			{/each}
			{#if !howto.length && !shortcuts.length && !fkeys.length && !tools.length}<p class="none">Nothing matches “{q}”.</p>{/if}
		</div>
</CadDialog>

<style>
	.lens { display: flex; color: var(--cad-muted); }
	.q { flex: 1; min-width: 0; border: 1px solid var(--cad-line, #d4d4d8); border-radius: 5px; padding: 4px 8px; font-size: 12px; background: var(--cad-input, white); color: var(--cad-text); }
	.body { padding: 4px 16px 14px; font-size: 12px; line-height: 1.5; }
	h3 { margin: 14px 0 6px; font-size: 10px; font-weight: 700; letter-spacing: 0.06em; text-transform: uppercase; color: var(--cad-faint, #a1a1aa); }
	h4 { margin: 10px 0 2px; font-size: 11px; font-weight: 600; color: var(--cad-text, #3f3f46); }
	p { margin: 4px 0; color: var(--cad-muted, #52525b); }
	code { font-family: ui-monospace, Consolas, monospace; color: var(--cad-link, #1d4ed8); font-size: 11px; }
	.grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(320px, 1fr)); gap: 2px 18px; }
	.row { display: flex; justify-content: space-between; gap: 10px; padding: 2px 0; border-bottom: 1px solid var(--cad-line, #f4f4f5); }
	.row span { color: var(--cad-muted); }
	kbd { font-family: ui-monospace, Consolas, monospace; font-size: 11px; white-space: nowrap; }
	.how { border-bottom: 1px solid var(--cad-line, #f4f4f5); }
	.how.featured { background: var(--cad-feature, #eff6ff); border-radius: 4px; padding: 0 6px; }
	.how-q { width: 100%; text-align: left; padding: 5px 0; font-size: 12px; color: var(--cad-text); }
	.how-q::before { content: '▸'; display: inline-block; width: 14px; color: var(--cad-faint); }
	.how.open .how-q::before { content: '▾'; }
	.star { margin-left: 8px; font-size: 10px; color: var(--cad-link, #1d4ed8); font-weight: 600; }
	.how p { margin: 0 0 6px 14px; }
	.tools { display: flex; flex-direction: column; }
	.tool { display: flex; gap: 8px; align-items: baseline; text-align: left; padding: 2px 4px; border-radius: 4px; font-size: 12px; }
	.tool:hover { background: var(--cad-hover); }
	.tool b { min-width: 9rem; color: var(--cad-link, #1d4ed8); font-weight: 600; }
	.tool span { color: var(--cad-muted); }
	.none { color: var(--cad-faint); }
</style>
