<script lang="ts">
	import { untrack } from 'svelte'
	import { Window } from '$lib'
	import { SCALE_OPTIONS } from '$lib/ui/print/types'
	import type { ViewportEditor } from '../viewports.svelte'
	import type { ViewportSource } from '../types'
	import PropText from './PropText.svelte'
	import PropSelect from './PropSelect.svelte'
	import PropTextarea from './PropTextarea.svelte'
	import OutletsProperties from '../tools/outlets/OutletsProperties.svelte'

	let { vps, floors = [], pid }: {
		vps: ViewportEditor
		floors?: { number: number }[]
		pid: string
	} = $props()

	let vp = $derived(vps.selectedViewport)

	// Editable mirror, re-synced when the selected viewport changes. Handlers write back to the
	// reactive viewport object and call vps.notify() (→ debounced save in SheetEditor).
	let form = $state({ kind: 'empty', label: '', scale: '0', border: 'thin', text: '', fontSizePt: '6', outletsDocId: '' })
	let syncedId: string | null = null
	$effect(() => {
		const id = vp?.id ?? null
		if (id === syncedId) return
		syncedId = id
		if (!vp) return
		untrack(() => {
			const s = vp!.source
			form = {
				kind: s.kind,
				label: vp!.label ?? '',
				scale: String(vp!.scale ?? 0),
				border: vp!.border ?? 'thin',
				text: s.kind === 'text' ? s.content : '',
				fontSizePt: s.kind === 'text' ? String(s.fontSizePt ?? 6) : '6',
				outletsDocId: s.kind === 'outlets' ? s.outletsDocId : '',
			}
		})
	})

	const defaultOutletsDocId = () =>
		floors[0] ? `${pid}_F${String(floors[0].number).padStart(2, '0')}` : ''

	// Type changed: seed sensible source defaults for the new kind, then persist.
	function onKindChange() {
		if (form.kind === 'outlets' && !form.outletsDocId) form.outletsDocId = defaultOutletsDocId()
		apply()
	}

	function apply() {
		const v = vps.selectedViewport
		if (!v) return
		v.label = form.label.trim() || undefined
		v.scale = Number(form.scale) || 0
		v.border = form.border as 'none' | 'thin'
		v.source = buildSource()
		// Outlets data is legacy y-down (version 1); other sources use the y-up default (2).
		v.version = form.kind === 'outlets' ? 1 : 2
		vps.notify()
	}

	function buildSource(): ViewportSource {
		if (form.kind === 'text') return { kind: 'text', content: form.text, fontSizePt: Number(form.fontSizePt) || 6 }
		if (form.kind === 'outlets') {
			const cur = vps.selectedViewport?.source
			const carry = cur?.kind === 'outlets' ? { fileId: cur.fileId, pageNum: cur.pageNum, showPdf: cur.showPdf } : {}
			return { kind: 'outlets', outletsDocId: form.outletsDocId, ...carry }
		}
		return { kind: 'empty' }
	}
</script>

{#if vp}
	<Window title="Viewport" name="viewport-properties" left={10} top={10} open class="w-60 space-y-1 p-2 text-zinc-700">
		<PropSelect label="Type" bind:value={form.kind} onchange={onKindChange}>
			<option value="empty">Empty</option>
			<option value="text">Text</option>
			<option value="outlets">Outlets</option>
		</PropSelect>
		<PropText label="Label" bind:value={form.label} oninput={apply} />
		<PropSelect label="Scale" bind:value={form.scale} onchange={apply}>
			{#each SCALE_OPTIONS as o (o.value)}
				<option value={String(o.value)}>{o.label}</option>
			{/each}
		</PropSelect>
		<PropSelect label="Border" bind:value={form.border} onchange={apply}>
			<option value="thin">Thin</option>
			<option value="none">None</option>
		</PropSelect>

		{#if form.kind === 'text'}
			<hr class="border-zinc-200" />
			<PropText label="Font (pt)" type="number" min="1" step="0.5" bind:value={form.fontSizePt} oninput={apply} />
			<PropTextarea bind:value={form.text} oninput={apply} rows={4} />
		{:else if form.kind === 'outlets'}
			<hr class="border-zinc-200" />
			<OutletsProperties {floors} {pid} outletsDocId={form.outletsDocId}
				onpick={(id) => { form.outletsDocId = id; apply() }} />
		{/if}
	</Window>
{/if}
