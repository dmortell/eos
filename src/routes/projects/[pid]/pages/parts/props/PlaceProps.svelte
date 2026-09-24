<script lang="ts">
	// Properties › a TREE NODE (project / building / floor / place): its sections from projectProps.ts (editable
	// fields save to Firestore on change; the rest is read-only backend data), a building's per-floor HEIGHTS table
	// + the Edit heights dialog. Without `info` (the mock tree) it shows placeholder fields.
	import { Icon } from '$lib'
	import HeightsDialog from '../HeightsDialog.svelte'
	import { NODE_FIELDS } from '../../mock/data'
	import { autoresize, blurOnEnter } from './fields'
	import type { NodeInfo } from '../../projectProps'

	type HeightKey = 'slabMm' | 'raisedFloorMm' | 'clearHeightMm' | 'plenumMm'
	type HeightRow = { id: string; name: string; z: number } & Record<HeightKey, number>
	let { node, info = null, onfield, heights = null, onheight, onheightall }: {
		node: { id: string; label: string; kind: string }
		/** A REAL tree node's properties (projectProps.ts, from Firestore); null → mock fields. */
		info?: NodeInfo | null; onfield?: (key: string, value: string) => void
		/** A selected BUILDING place's storey heights (top first). */
		heights?: { placeId: string; rows: HeightRow[] } | null
		onheight?: (placeId: string, storeyId: string, key: HeightKey, value: number) => void
		onheightall?: (placeId: string, key: HeightKey, value: number) => void
	} = $props()
	let heightsOpen = $state(false)
	const KIND_LABEL: Record<string, string> = { project: 'PROJECT', building: 'BUILDING', floor: 'FLOOR', zone: 'ZONE', room: 'ROOM', row: 'ROW' }
</script>

{#if info}
	{#each info.sections as sec (sec.label)}
		<div class="prop-sec">{sec.label}</div>
		{#each sec.fields as f (f.key)}
			{#if f.edit === 'checklist'}
				{@const ticked = new Set(f.value.split(',').map((x) => x.trim()).filter(Boolean))}
				<div class="prop"><span>{f.label}</span>
					<details class="pp-check" title={f.hint}>
						<summary>{f.value || 'none'}</summary>
						<div class="pp-check-grid">
							{#each [...(f.options ?? [])].reverse() as o (o)}
								<label><input type="checkbox" checked={ticked.has(o)} onchange={(e) => {
									const on = (e.currentTarget as HTMLInputElement).checked
									onfield?.(f.key, (f.options ?? []).filter((x) => (x === o ? on : ticked.has(x))).join(', '))
								}} />{o}</label>
							{/each}
						</div>
					</details></div>
			{:else if f.edit === 'textarea'}
				<div class="prop wide"><span>{f.label}</span>
					<textarea class="pp-textarea" use:autoresize value={f.value} title={f.hint}
						onchange={(e) => onfield?.(f.key, (e.currentTarget as HTMLTextAreaElement).value)}></textarea></div>
			{:else if f.edit}
				<div class="prop"><span>{f.label}</span>
					<input value={f.value} placeholder={f.hint} title={f.hint} onchange={(e) => onfield?.(f.key, (e.currentTarget as HTMLInputElement).value)} onkeydown={blurOnEnter} /></div>
			{:else}
				<div class="prop"><span>{f.label}</span><div class="pp-val" title={f.value}>{f.value}</div></div>
			{/if}
		{/each}
		{#if sec.hint}<div class="sec-help">{sec.hint}</div>{/if}
	{/each}
	{#if heights?.rows.length}
		<!-- a building's per-floor heights (its building model's storeys) — an edit re-stacks the floors above -->
		<div class="prop-sec">HEIGHTS · mm<button class="pp-mini sec-btn edit-btn" onclick={() => (heightsOpen = true)}><Icon name="edit" size={11} /> Edit heights…</button></div>
		<div class="pp-heights">
			<table>
				<thead><tr><th></th><th title="Structural slab thickness">Slab</th><th title="Raised floor height">Raised</th><th title="Clear height (floor to ceiling)">Clear</th><th title="Plenum (ceiling void)">Plenum</th><th title="Slab top above the lowest floor">Level (m)</th></tr></thead>
				<tbody>
					{#each heights.rows as r (r.id)}
						<tr><th>{r.name}</th><td>{r.slabMm}</td><td>{r.raisedFloorMm}</td><td>{r.clearHeightMm}</td><td>{r.plenumMm}</td><td class="lvl">{(r.z / 1000).toFixed(2)}</td></tr>
					{/each}
				</tbody>
			</table>
		</div>
		{#if heightsOpen}
			<HeightsDialog title={node.label} rows={heights.rows} onclose={() => (heightsOpen = false)}
				onheight={(id, k, v) => onheight?.(heights!.placeId, id, k, v)} onall={(k, v) => onheightall?.(heights!.placeId, k, v)} />
		{/if}
	{/if}
	<div class="pp-hint">{info.note ?? 'Edits save to the project in Firestore.'}</div>
{:else}
	<div class="prop-sec">{KIND_LABEL[node.kind] ?? 'ITEM'}</div>
	<div class="prop"><span>Name</span><input value={node.label} /></div>
	{#each NODE_FIELDS[node.kind] ?? [] as [label, ph] (label)}
		<div class="prop"><span>{label}</span><input value={ph} /></div>
	{/each}
	<div class="pp-hint">Editing these is mock-only for now.</div>
{/if}
