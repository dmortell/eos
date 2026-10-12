<!-- A section cut line (Phase 6.2): name, how deep it sees, which way it looks; open it in the pane, or put it on a
     sheet as a new viewport (sized to the cut, at the largest scale that fits — backlog "Drop a section as a viewport"). -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { SectionCut, Sheet, Viewport } from '../domain/drawing'
	import { sectionViewports } from '../editor/commands'
	import { followSections } from '../editor/behaviours'
	import { newId } from '../domain/ids'
	import { sectionViewport } from '../views/sheet'
	import PropGroup from './PropGroup.svelte'

	let { project, ws, s }: { project: CadProject; ws: Workspace; s: SectionCut } = $props()

	// what's drawn on its plane follows a flip (editor/behaviours.ts followSections)
	const put = (label: string, patch: Partial<SectionCut>) => project.store.transact(label, (tx) => { tx.put({ ...s, ...patch }); followSections(tx, [s], project.store.ofType('shape')) })
	const sheets = $derived.by(() => { void project.rev; return (project.store.ofType('sheet') as Sheet[]).filter((x) => x.status !== 'archived').sort((a, b) => a.order - b.order) })
	let sheetId = $state('')
	const target = $derived(sheets.find((x) => x.id === sheetId) ?? sheets[0])

	const shownOn = $derived.by(() => { void project.rev; return sectionViewports(project.store, [s.id]).sort((a, b) => a.sheet.order - b.sheet.order) })
	function openOn(sheet: Sheet, vp: Viewport) {
		ws.openView({ kind: 'sheet', sheetId: sheet.id })
		ws.select([sheet.id])
		ws.selectViewport(vp.id)
	}

	function putOnSheet() {
		const sh = target
		if (!sh) return
		const name = s.name   // read before the sheet opens: the selection (and this panel) changes
		const v = sectionViewport(project.index, sh, s.id, s.levelId, newId(), project.sheetBase)
		project.store.transact(`Section ${name} on ${sh.number}`, (tx) => tx.put({ ...sh, viewports: [...sh.viewports, v] }))
		ws.openView({ kind: 'sheet', sheetId: sh.id })
		ws.select([sh.id])
		ws.selectViewport(v.id)
		ws.say(`Section ${name} is on ${sh.number} at 1:${v.scale} — drag it into place`)
	}
</script>

<PropGroup kind="section" title="General">
<label class="row">Name <input class="inp" value={s.name} onchange={(e) => e.currentTarget.value.trim() && put('Section name', { name: e.currentTarget.value.trim() })} /></label>
<label class="row">Depth (mm) <input class="inp" type="number" min="100" step="100" value={s.depth} onchange={(e) => { const n = Number(e.currentTarget.value); if (n) put('Section depth', { depth: Math.max(100, n) }) }} /></label>
<label class="row">Looks <span><button class="btn" title="Look the other way" onclick={() => put('Flip section', { flip: !s.flip || undefined })}>Flip</button></span></label>
<div class="acts"><button class="btn" onclick={() => ws.openView({ kind: 'section', sectionId: s.id })}>Open section {s.name}</button></div>
</PropGroup>
{#if sheets.length || shownOn.length}
<PropGroup kind="section" title="On sheets">
{#if sheets.length}
	<label class="row" title="A new viewport on that sheet showing this section, sized to the cut at the largest scale that fits">Sheet
		<span class="flex gap-1">
			<select class="inp" value={target?.id ?? ''} onchange={(e) => (sheetId = e.currentTarget.value)}>
				{#each sheets as x (x.id)}<option value={x.id}>{x.number} {x.title}</option>{/each}
			</select>
			<button class="btn" onclick={putOnSheet}>Put on sheet</button>
		</span></label>
{/if}
{#if shownOn.length}
	<!-- the viewports that show this section: a click opens that sheet with the viewport selected -->
	{#each shownOn as h (h.vp.id)}
		<button class="link" title="Open {h.sheet.number} with this viewport selected" onclick={() => openOn(h.sheet, h.vp)}>{h.sheet.number} {h.sheet.title} · 1:{h.vp.scale}</button>
	{/each}
{/if}
</PropGroup>
{/if}

<style>
	.btn { border: 1px solid var(--cad-line); border-radius: 4px; padding: 0 6px; background: var(--cad-input); color: var(--cad-text); white-space: nowrap; }
	.link { display: block; width: 100%; text-align: left; padding: 0 4px; border-radius: 3px; color: var(--cad-link, #2563eb); }
	.link:hover { background: var(--cad-hover); text-decoration: underline; }
</style>
