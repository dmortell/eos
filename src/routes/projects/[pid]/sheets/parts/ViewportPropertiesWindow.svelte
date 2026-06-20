<script lang="ts">
	import { untrack, getContext } from 'svelte'
	import { Window } from '$lib'
	import type { Firestore } from '$lib/db.svelte'
	import type { ViewportEditor } from '../viewports.svelte'
	import type { ViewportSource } from '../types'
	import PropText from './PropText.svelte'
	import PropSelect from './PropSelect.svelte'
	import PropTextarea from './PropTextarea.svelte'
	import PropCheck from './PropCheck.svelte'
	import { formNav } from '$lib/formNav'
	import OutletsProperties from '../tools/outlets/OutletsProperties.svelte'
	import RacksProperties from '../tools/racks/RacksProperties.svelte'
	import RisersProperties from '../tools/risers/RisersProperties.svelte'
	import Model3dProperties from '../tools/model3d/Model3dProperties.svelte'
	import type { RackFace } from '../tools/racks/types'
	import type { Dir, Clip } from '../tools/model3d/types'
	import { modelStore } from '../tools/model3d/models.svelte'
	import { modelBounds } from '../tools/model3d/projection'

	let { vps, floors = [], pid }: {
		vps: ViewportEditor
		floors?: { number: number }[]
		pid: string
	} = $props()

	const db = getContext('db') as Firestore
	// Fill-rate sections (project-wide doc) for the section picker.
	let fillrateSections = $state<{ id: string; label: string }[]>([])
	$effect(() => {
		if (!pid) return
		const unsub = db.subscribeOne('fillrate', pid, (d: any) => { fillrateSections = Array.isArray(d?.sections) ? d.sections : [] })
		return () => unsub?.()
	})

	// Show for the selected viewport, or for the active one (activating clears the frame selection
	// to hide resize handles, but we still want this panel available to edit type/scale/source).
	let vp = $derived(vps.selectedViewport ?? vps.activeViewport)

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
		kind: 'empty', label: '', number: '', scale: '0', border: 'thin', text: '', fontSizePt: '6',
		outletsDocId: '',
		racksDocId: '', racksFace: 'front' as RackFace, racksRowId: '', racksShowWalls: false, racksColorDevices: true,
		risersFrom: 0, risersTo: 0,
		fillrateSectionId: '',
		modelId: 1, modelDir: 'plan' as Dir, modelHidden: true, modelBw: false, modelClip: null as Clip | null,
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
				number: vp!.number ? String(vp!.number) : '',
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
				fillrateSectionId: s.kind === 'fillrate' ? s.sectionId : '',
				modelId: s.kind === 'model3d' ? s.modelId : 1,
				modelDir: s.kind === 'model3d' ? s.direction : 'plan',
				modelHidden: s.kind === 'model3d' ? (s.hiddenLines ?? true) : true,
				modelBw: s.kind === 'model3d' ? (s.bw ?? false) : false,
				modelClip: s.kind === 'model3d' ? (s.clip ?? null) : null,
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
		if (form.kind === 'fillrate' && !form.fillrateSectionId && fillrateSections[0]) form.fillrateSectionId = fillrateSections[0].id
		apply()
	}

	// Editing the text of an empty viewport promotes it to a text source.
	function editText() { if (form.kind === 'empty') form.kind = 'text'; apply() }

	function apply() {
		const v = vps.selectedViewport ?? vps.activeViewport
		if (!v) return
		v.label = form.label.trim() || undefined
		v.number = Number(form.number) > 0 ? Number(form.number) : undefined
		v.scale = Number(form.scale) || 0
		v.border = form.border as 'none' | 'thin'
		v.source = buildSource()
		// Outlets data is legacy y-down (version 1); other sources use the y-up default (2).
		v.version = form.kind === 'outlets' ? 1 : 2
		vps.notify()
	}

	// Default section box = the current model's full bounds (a touch padded), so the
	// user starts from the whole model and shrinks the box around the area of interest.
	function modelClipDefault(): Clip {
		const m = modelStore(db, pid).models.find((x) => x.id === form.modelId)
		const b = m ? modelBounds(m.objects) : null
		return b ?? { x0: 0, y0: 0, z0: 0, x1: 1000, y1: 1000, z1: 1000 }
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
		if (form.kind === 'fillrate') return { kind: 'fillrate', sectionId: form.fillrateSectionId }
		if (form.kind === 'model3d') return { kind: 'model3d', modelId: form.modelId, direction: form.modelDir, hiddenLines: form.modelHidden, bw: form.modelBw, clip: form.modelClip ?? undefined }
		return { kind: 'empty' }
	}
</script>

{#if vp}
	<Window title="Viewport" name="viewport-properties" left={10} top={10} open class="w-60 p-2 text-zinc-700">
		<div class="space-y-1" use:formNav>
		<PropSelect label="Type" bind:value={form.kind} onchange={onKindChange}>
			<option value="empty">Empty</option>
			<option value="text">Text</option>
			<option value="outlets">Outlets</option>
			<option value="racks">Racks</option>
			<option value="risers">Risers</option>
			<option value="fillrate">Fill rate</option>
			<option value="model3d">3D model</option>
		</PropSelect>
		<PropText label="Label" bind:value={form.label} oninput={apply} />
		<PropText label="Number" type="number" min="1" step="1" bind:value={form.number} oninput={apply} placeholder="auto" />
		<PropSelect label="Scale" bind:value={form.scale} onchange={apply}>
			{#each VP_SCALES as o (o.value)}
				<option value={String(o.value)}>{o.label}</option>
			{/each}
		</PropSelect>
		<PropCheck label="Border" value={form.border === 'thin'}
			onchange={(e: Event) => { form.border = (e.currentTarget as HTMLInputElement).checked ? 'thin' : 'none'; apply() }} />

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
		{:else if form.kind === 'model3d'}
				<hr class="border-zinc-200" />
				<Model3dProperties {pid} modelId={form.modelId} direction={form.modelDir} hiddenLines={form.modelHidden} bw={form.modelBw}
					onchange={(p) => { form.modelId = p.modelId; form.modelDir = p.direction; form.modelHidden = p.hiddenLines; form.modelBw = p.bw; apply() }} />
				<!-- Section: clip the model to a box (cull outside + frame to it) for cropped elevations -->
				<hr class="border-zinc-200" />
				<PropCheck label="Section" value={!!form.modelClip}
					onchange={(e: Event) => { form.modelClip = (e.currentTarget as HTMLInputElement).checked ? (form.modelClip ?? modelClipDefault()) : null; apply() }} />
				{#if form.modelClip}
					{@const c = form.modelClip}
					<div class="grid grid-cols-2 gap-1 text-xs">
						{#each [['x0','X min'],['x1','X max'],['y0','Y min'],['y1','Y max'],['z0','Z min'],['z1','Z max']] as const as [k, lbl] (k)}
							<label class="flex items-center gap-1"><span class="w-10 text-zinc-400">{lbl}</span>
								<input type="number" class="w-full rounded border px-1 py-0.5" value={c[k]}
									oninput={(e) => { form.modelClip = { ...c, [k]: Number((e.currentTarget as HTMLInputElement).value) }; apply() }} /></label>
						{/each}
					</div>
					<button class="rounded border px-1.5 py-0.5 text-xs hover:bg-slate-100" onclick={() => { form.modelClip = modelClipDefault(); apply() }}>Reset to model bounds</button>
				{/if}
			{:else if form.kind === 'fillrate'}
			<hr class="border-zinc-200" />
			{#if fillrateSections.length}
				<PropSelect label="Section" bind:value={form.fillrateSectionId} onchange={apply}>
					{#each fillrateSections as s (s.id)}<option value={s.id}>{s.label}</option>{/each}
				</PropSelect>
			{:else}
				<p class="text-xs text-zinc-400">No fill-rate sections yet — add them in the Fill rates tool.</p>
			{/if}
		{/if}
		</div>
	</Window>
{/if}
