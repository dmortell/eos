<script lang="ts">
	import { untrack } from 'svelte'
	import { Window } from '$lib'
	import type { ViewportEditor } from '../viewports.svelte'
	import type { ViewportSource } from '../types'
	import PropText from './PropText.svelte'
	import PropSelect from './PropSelect.svelte'
	import PropTextarea from './PropTextarea.svelte'
	import OutletsProperties from '../tools/outlets/OutletsProperties.svelte'
	import RacksProperties from '../tools/racks/RacksProperties.svelte'
	import RisersProperties from '../tools/risers/RisersProperties.svelte'
	import type { RackFace } from '../tools/racks/types'

	let { vps, floors = [], pid }: {
		vps: ViewportEditor
		floors?: { number: number }[]
		pid: string
	} = $props()

	// Show for the selected viewport, or for an active text/empty one — those have no separate Edit
	// panel, so this window IS their editor (activating clears the frame selection).
	let activeText = $derived(vps.activeViewport && (vps.activeViewport.source.kind === 'text' || vps.activeViewport.source.kind === 'empty') ? vps.activeViewport : null)
	let vp = $derived(vps.selectedViewport ?? activeText)

	// Wider scale range than the sheet's paper scale — viewports often need large scales for
	// elevations (1:10 / 1:5 / 1:2). value 0 = Fit (auto).
	const VP_SCALES = [
		{ label: 'Fit', value: 0 },
		{ label: '1:2', value: 2 }, { label: '1:5', value: 5 }, { label: '1:10', value: 10 },
		{ label: '1:15', value: 15 }, { label: '1:20', value: 20 }, { label: '1:25', value: 25 }, { label: '1:50', value: 50 },
		{ label: '1:100', value: 100 }, { label: '1:200', value: 200 }, { label: '1:500', value: 500 },
	]

	// Editable mirror, re-synced when the selected viewport changes. Handlers write back to the
	// reactive viewport object and call vps.notify() (→ debounced save in SheetEditor).
	let form = $state({
		kind: 'empty', label: '', scale: '0', border: 'thin', text: '', fontSizePt: '6',
		outletsDocId: '',
		racksDocId: '', racksFace: 'front' as RackFace, racksRowId: '', racksShowWalls: false, racksColorDevices: true,
		risersFrom: 0, risersTo: 0,
	})
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
				racksDocId: s.kind === 'racks' ? s.racksDocId : '',
				racksFace: s.kind === 'racks' ? s.face : 'front',
				racksRowId: s.kind === 'racks' ? (s.rowId ?? '') : '',
				racksShowWalls: s.kind === 'racks' ? (s.showWalls ?? false) : false,
				racksColorDevices: s.kind === 'racks' ? (s.colorDevices ?? true) : true,
				risersFrom: s.kind === 'risers' ? (s.fromFloor ?? floorMin()) : floorMin(),
				risersTo: s.kind === 'risers' ? (s.toFloor ?? floorMax()) : floorMax(),
			}
		})
	})

	const floorStr0 = () => floors[0] ? String(floors[0].number).padStart(2, '0') : '01'
	const floorMin = () => floors.length ? Math.min(...floors.map(f => f.number)) : 1
	const floorMax = () => floors.length ? Math.max(...floors.map(f => f.number)) : 1
	const defaultOutletsDocId = () => `${pid}_F${floorStr0()}`
	const defaultRacksDocId = () => `${pid}_F${floorStr0()}_RA`

	// Type changed: seed sensible source defaults for the new kind, then persist.
	function onKindChange() {
		if (form.kind === 'outlets' && !form.outletsDocId) form.outletsDocId = defaultOutletsDocId()
		if (form.kind === 'racks' && !form.racksDocId) form.racksDocId = defaultRacksDocId()
		if (form.kind === 'risers' && !form.risersTo) { form.risersFrom = floorMin(); form.risersTo = floorMax() }
		apply()
	}

	// Editing the text of an empty viewport promotes it to a text source.
	function editText() { if (form.kind === 'empty') form.kind = 'text'; apply() }

	function apply() {
		const v = vps.selectedViewport ?? vps.activeViewport
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
		if (form.kind === 'racks') return {
			kind: 'racks', racksDocId: form.racksDocId, face: form.racksFace,
			rowId: form.racksRowId || undefined, showWalls: form.racksShowWalls, colorDevices: form.racksColorDevices,
		}
		if (form.kind === 'risers') return { kind: 'risers', risersDocId: pid, fromFloor: form.risersFrom, toFloor: form.risersTo }
		return { kind: 'empty' }
	}
</script>

{#if vp}
	<Window title="Viewport" name="viewport-properties" left={10} top={10} open class="w-60 space-y-1 p-2 text-zinc-700">
		<PropSelect label="Type" bind:value={form.kind} onchange={onKindChange}>
			<option value="empty">Empty</option>
			<option value="text">Text</option>
			<option value="outlets">Outlets</option>
			<option value="racks">Racks</option>
			<option value="risers">Risers</option>
		</PropSelect>
		<PropText label="Label" bind:value={form.label} oninput={apply} />
		<PropSelect label="Scale" bind:value={form.scale} onchange={apply}>
			{#each VP_SCALES as o (o.value)}
				<option value={String(o.value)}>{o.label}</option>
			{/each}
		</PropSelect>
		<PropSelect label="Border" bind:value={form.border} onchange={apply}>
			<option value="thin">Thin</option>
			<option value="none">None</option>
		</PropSelect>

		{#if form.kind === 'text' || form.kind === 'empty'}
			<hr class="border-zinc-200" />
			<PropText label="Font (pt)" type="number" min="1" step="0.5" bind:value={form.fontSizePt} oninput={editText} />
			<PropTextarea bind:value={form.text} oninput={editText} rows={4} placeholder="Empty — choose source, or type a note" />
		{:else if form.kind === 'outlets'}
			<hr class="border-zinc-200" />
			<OutletsProperties {floors} {pid} outletsDocId={form.outletsDocId}
				onpick={(id) => { form.outletsDocId = id; apply() }} />
		{:else if form.kind === 'racks'}
			<hr class="border-zinc-200" />
			<RacksProperties {floors} {pid} racksDocId={form.racksDocId} face={form.racksFace}
				rowId={form.racksRowId} showWalls={form.racksShowWalls} colorDevices={form.racksColorDevices}
				onchange={(p) => {
					form.racksDocId = p.racksDocId; form.racksFace = p.face; form.racksRowId = p.rowId
					form.racksShowWalls = p.showWalls; form.racksColorDevices = p.colorDevices; apply()
				}} />
		{:else if form.kind === 'risers'}
			<hr class="border-zinc-200" />
			<RisersProperties {floors} fromFloor={form.risersFrom} toFloor={form.risersTo}
				onchange={(p) => { form.risersFrom = p.fromFloor; form.risersTo = p.toFloor; apply() }} />
		{/if}
	</Window>
{/if}
