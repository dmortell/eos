<!-- SEVERAL SHEETS in Properties (sheets-organising slice 3): category, discipline, a tag added to / taken off them
     all, paper size and orientation, drawn / checked / approved by, archive / restore, add to a package, duplicate. A field they disagree on
     shows "mixed". One undo step per edit. -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Workspace } from '../app/workspace.svelte'
	import type { Sheet, SheetPackage } from '../domain/drawing'
	import { ordered } from '../domain/sheetCategories'
	import { duplicateSheets } from '../app/sheetActions'
	import PropGroup from './PropGroup.svelte'
	import Field from './fields/Field.svelte'
	import { shared, MIXED } from './propsKit'
	import { drawnFallback } from '../domain/titleBlock'

	const TB_PEOPLE = [['drawn', 'Drawn'], ['checked', 'Checked'], ['approved', 'Approved']] as const

	let { project, ws, sheets }: { project: CadProject; ws: Workspace; sheets: Sheet[] } = $props()

	const cats = $derived(ordered(project.sheetCategories))
	const packages = $derived([...project.index.byId.values()].filter((e): e is SheetPackage => e.type === 'package' && !e.archived && !!e.sheetIds).sort((a, b) => a.order - b.order))
	/** What they share; undefined when mixed (`mixed()` says which). */
	const same = <V,>(get: (s: Sheet) => V): V | undefined => shared(sheets, get).value
	const mixed = <V,>(get: (s: Sheet) => V) => shared(sheets, get).mixed
	const MIXED_KEY = '\u0000mixed'
	function set(label: string, patch: (s: Sheet) => Partial<Sheet>) {
		project.store.transact(`${label} (${sheets.length} sheets)`, (tx) => { for (const s of sheets) tx.put({ ...s, ...patch(s) }) })
	}
	let tag = $state('')
	function tagAll(add: boolean) {
		const t = tag.trim()
		if (!t) return
		set(add ? `Tag ${t}` : `Untag ${t}`, (s) => { const cur = s.tags ?? [], next = add ? [...new Set([...cur, t])] : cur.filter((x) => x !== t); return { tags: next.length ? next : undefined } })
	}
	function toPackage(id: string) {
		const p = packages.find((x) => x.id === id)
		if (!p) return
		const add = sheets.map((s) => s.id).filter((x) => !p.sheetIds!.includes(x))
		project.store.transact(`${p.name}: add ${add.length} sheet(s)`, (tx) => tx.put({ ...p, sheetIds: [...p.sheetIds!, ...add] }))
		ws.say(`${add.length} sheet(s) added to ${p.name}`)
	}
	const duplicate = () => ws.select(duplicateSheets(project, sheets.map((s) => s.id)))
</script>

<PropGroup kind="sheets" title="General">
	<label class="row">Category
		<select class="inp" value={mixed((s) => s.kind ?? '') ? MIXED_KEY : same((s) => s.kind ?? '')} onchange={(e) => set('Sheet category', () => ({ kind: e.currentTarget.value || undefined }))}>
			{#if mixed((s) => s.kind ?? '')}<option value={MIXED_KEY} disabled>{MIXED}</option>{/if}
			<option value="">Auto (from its viewports)</option>
			{#each cats as c (c.id)}<option value={c.id}>{c.label}</option>{/each}
		</select></label>
	<label class="row">Discipline <input class="inp" value={same((s) => s.discipline ?? '') ?? ''} placeholder={mixed((s) => s.discipline ?? '') ? MIXED : '—'} onchange={(e) => set('Sheet discipline', () => ({ discipline: e.currentTarget.value.trim() || undefined }))} /></label>
	<Field label="Tags">
		<span class="flex gap-1"><input class="inp" bind:value={tag} placeholder="a tag" aria-label="Tag" />
			<button class="btn" disabled={!tag.trim()} title="Add this tag to every selected sheet" aria-label="Add this tag to every selected sheet" onclick={() => tagAll(true)}>+</button>
			<button class="btn" disabled={!tag.trim()} title="Take this tag off every selected sheet" aria-label="Take this tag off every selected sheet" onclick={() => tagAll(false)}>−</button></span></Field>
	<!-- who drew, checked and approved them (Checked / Approved print in templates that show them) -->
	{#each TB_PEOPLE as [k, l] (k)}
		<label class="row">{l} <input class="inp" value={same((s) => s.titleBlock?.fields?.[k] ?? '') ?? ''} placeholder={mixed((s) => s.titleBlock?.fields?.[k] ?? '') ? MIXED : k === 'drawn' ? drawnFallback(project.details?.author) || 'initials' : 'initials'}
			onchange={(e) => { const v = e.currentTarget.value.trim(); set(`${l} by`, (s) => ({ titleBlock: { ...s.titleBlock, fields: { ...s.titleBlock?.fields, [k]: v } } })) }} /></label>
	{/each}
</PropGroup>
<PropGroup kind="sheets" title="Paper">
	<label class="row">Size
		<span class="flex gap-1">
			<select class="inp" value={same((s) => s.paper.size) ?? MIXED_KEY} onchange={(e) => { const v = e.currentTarget.value as Sheet['paper']['size']; set('Paper size', (s) => ({ paper: { ...s.paper, size: v } })) }}>
				{#if mixed((s) => s.paper.size)}<option value={MIXED_KEY} disabled>{MIXED}</option>{/if}
				{#each ['A0', 'A1', 'A2', 'A3', 'A4'] as z (z)}<option value={z}>{z}</option>{/each}
			</select>
			<select class="inp" value={same((s) => s.paper.orientation) ?? MIXED_KEY} onchange={(e) => { const v = e.currentTarget.value as 'landscape' | 'portrait'; set('Paper orientation', (s) => ({ paper: { ...s.paper, orientation: v } })) }}>
				{#if mixed((s) => s.paper.orientation)}<option value={MIXED_KEY} disabled>{MIXED}</option>{/if}
				<option value="landscape">landscape</option><option value="portrait">portrait</option>
			</select>
		</span></label>
</PropGroup>
<div class="acts">
	{#if packages.length}
		<select class="inp w-auto" value="" title="Add the selected sheets to a package (a list package)" onchange={(e) => { toPackage(e.currentTarget.value); e.currentTarget.value = '' }}>
			<option value="" disabled>Add to package…</option>
			{#each packages as p (p.id)}<option value={p.id}>{p.name}</option>{/each}
		</select>
	{/if}
	<button class="btn" title="Copies with their viewports and notes (no number, no revisions), each right after its original" onclick={duplicate}>Duplicate</button>
	{#if sheets.some((s) => s.status !== 'archived')}<button class="btn" onclick={() => set('Archive', () => ({ status: 'archived' }))}>Archive</button>{/if}
	{#if sheets.some((s) => s.status === 'archived')}<button class="btn" onclick={() => set('Restore', () => ({ status: 'active' }))}>Restore</button>{/if}
</div>

<style>
	.inp.w-auto { width: auto; }
</style>
