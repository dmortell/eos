<script lang="ts">
	import { untrack } from 'svelte'
	import { Window } from '$lib'
	import { SCALE_OPTIONS, type PaperSize, type PaperOrientation } from '$lib/ui/print/types'
	import PropText from './PropText.svelte'
	import PropSelect from './PropSelect.svelte'
	import PropCheck from './PropCheck.svelte'
	import { formNav } from '../edit/formNav'
	import type { Firestore } from '$lib/db.svelte'
	import type { SheetDoc, TitleBlockConfig } from '../types'
	import type { TitleBlockProjectDefaults } from './TitleBlock.svelte'
	import { updateSheet } from '../data'

	let { sheet, project = {}, db, pid }: {
		sheet: SheetDoc
		project?: TitleBlockProjectDefaults
		db: Firestore
		pid: string
	} = $props()

	// Editable mirror of the sheet's settings. Re-synced only when the sheet identity changes
	// (so our own debounced writes don't fight the inputs).
	// margins/scale held as strings (Input/Select bind to string) — coerced in save().
	let form = $state({
		title: '', drawingNumber: '',
		paperSize: 'A3' as PaperSize, orientation: 'landscape' as PaperOrientation,
		margins: '10', scale: '100',
		tbVisible: true,
		drawnBy: '', checkedBy: '', approvedBy: '', date: '', client: '',
	})

	let syncedId: string | null = null
	$effect(() => {
		const id = sheet?.id
		if (!id || id === syncedId) return
		syncedId = id
		untrack(() => {
			const p: any = sheet.paper ?? {}
			const tb = (sheet.titleBlock && typeof sheet.titleBlock === 'object') ? sheet.titleBlock as TitleBlockConfig : null
			const f = tb?.fields ?? {}
			form = {
				title: sheet.title ?? '',
				drawingNumber: sheet.drawingNumber ?? '',
				paperSize: p.paperSize ?? 'A3',
				orientation: p.orientation ?? 'landscape',
				margins: String(p.margins ?? 10),
				scale: String(p.scale ?? 100),
				tbVisible: sheet.titleBlock !== null,
				drawnBy: f.drawnBy ?? '', checkedBy: f.checkedBy ?? '', approvedBy: f.approvedBy ?? '',
				date: f.date ?? '', client: f.client ?? '',
			}
		})
	})

	// ── Debounced write ── handlers fire only on user input, so there's no sync→save loop.
	let saveTimer: ReturnType<typeof setTimeout> | null = null
	function save() {
		if (!sheet?.id) return
		if (saveTimer) clearTimeout(saveTimer)
		saveTimer = setTimeout(() => {
			saveTimer = null
			if (!sheet?.id) return
			updateSheet(db, pid, sheet.id, {
				title: form.title,
				drawingNumber: form.drawingNumber,
				paper: {
					...sheet.paper,
					paperSize: form.paperSize,
					orientation: form.orientation,
					margins: Number(form.margins) || 0,
					scale: Number(form.scale) || 0,
				},
				titleBlock: form.tbVisible ? buildTb() : null,
			})
		}, 400)
	}
	$effect(() => () => { if (saveTimer) clearTimeout(saveTimer) })

	// Build the title-block config, preserving template/position; empty override → null (fall back
	// to project default).
	function buildTb(): TitleBlockConfig {
		const base = (sheet.titleBlock && typeof sheet.titleBlock === 'object') ? sheet.titleBlock as TitleBlockConfig : {}
		const orNull = (v: string) => (v.trim() ? v.trim() : null)
		return {
			...base,
			fields: {
				...(base.fields ?? {}),
				drawnBy: orNull(form.drawnBy),
				checkedBy: orNull(form.checkedBy),
				approvedBy: orNull(form.approvedBy),
				date: orNull(form.date),
				client: orNull(form.client),
			},
		}
	}
</script>

<Window title="Sheet" name="sheet-properties" right={10} top={10} open class="w-60 p-2 text-zinc-700">
	<div class="space-y-1" use:formNav>
	<PropText label="Title" bind:value={form.title} oninput={save} />
	<PropText label="Drawing No." bind:value={form.drawingNumber} oninput={save} mono />

	<hr class="border-zinc-200" />

	<PropSelect label="Paper" bind:value={form.paperSize} onchange={save}>
		<option value="A3">A3</option>
		<option value="A4">A4</option>
	</PropSelect>
	<PropSelect label="Orientation" bind:value={form.orientation} onchange={save}>
		<option value="landscape">Landscape</option>
		<option value="portrait">Portrait</option>
	</PropSelect>
	<PropSelect label="Scale" bind:value={form.scale} onchange={save}>
		{#each SCALE_OPTIONS as o (o.value)}
			<option value={String(o.value)}>{o.label}</option>
		{/each}
	</PropSelect>
	<PropText label="Margins (mm)" type="number" min="0" max="30" step="1" bind:value={form.margins} oninput={save} />

	<hr class="border-zinc-200" />

	<PropCheck label="Show title block" bind:value={form.tbVisible} onchange={save} />

	{#if form.tbVisible}
		<div class="space-y-1 border-l-2 border-zinc-100 pl-2">
			<PropText label="Drawn by" bind:value={form.drawnBy} oninput={save} placeholder={project.author ?? ''} />
			<PropText label="Checked by" bind:value={form.checkedBy} oninput={save} />
			<PropText label="Approved by" bind:value={form.approvedBy} oninput={save} />
			<PropText label="Date" type="date" bind:value={form.date} oninput={save} />
			<PropText label="Client" bind:value={form.client} oninput={save} placeholder={project.client ?? ''} />
		</div>
	{/if}
	</div>
</Window>
