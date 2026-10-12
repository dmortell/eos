<!-- A cabinet's doors (their swings show on the plan: aisle clearance), for one rack or several. With several, a field
     shows the value they share, or "mixed"; an edit sets that one field on every cabinet (the other fields stay
     each rack's own). Racks that aren't cabinets or VCMs are left alone. -->
<script lang="ts">
	import type { CadProject } from '../app/project.svelte'
	import type { Rack } from '../domain/types'
	import type { Shape } from '../domain/shapes'
	import { shared as sharedOf, MIXED } from './propsKit'

	let { project, racks = [], boxes = [] }: { project: CadProject; racks?: Rack[]; boxes?: Shape[] } = $props()

	type Doors = NonNullable<Rack['doors']>
	// cabinets and VCMs (Dave: VCMs have doors too), and boxes drawn as rectangles (backlog "Door swings on other objects")
	const cabinets = $derived<(Rack | Shape)[]>([...racks.filter((r) => r.kind === 'cabinet' || r.kind === 'vcm'), ...boxes.filter((s) => s.geom.kind === 'rect')])
	/** The value every cabinet shares, or `null` when they differ. */
	function shared<K extends keyof Doors>(k: K): Doors[K] | null {
		const r = sharedOf(cabinets, (c) => c.doors?.[k])
		return r.mixed ? null : (r.value as Doors[K])
	}
	const front = $derived(shared('front')), rear = $derived(shared('rear')), hinge = $derived(shared('hinge'))
	const anySingle = $derived(cabinets.some((r) => r.doors?.front === 'single' || r.doors?.rear === 'single'))

	function set(patch: Doors) {
		const n = cabinets.length
		project.store.transact(n > 1 ? `Doors (${n})` : 'Doors', (tx) => {
			for (const r of cabinets) {
				const next = { ...(r.doors ?? {}), ...patch }
				tx.put({ ...r, doors: next.front || next.rear ? next : undefined })
			}
		})
	}
	const face = (v: string) => (v === 'single' || v === 'split' ? v : undefined)
</script>

{#if cabinets.length}
	<label class="row" title={cabinets.length < racks.length ? `Sets the ${cabinets.length} cabinets; the other racks have no doors` : undefined}>Doors
		<span class="flex gap-1">
			<select class="inp" title="Front door" value={front === null ? 'mixed' : (front ?? '')} onchange={(e) => e.currentTarget.value !== 'mixed' && set({ front: face(e.currentTarget.value) })}>
				{#if front === null}<option value="mixed">front: {MIXED}</option>{/if}
				<option value="">front: none</option><option value="single">front: single</option><option value="split">front: split</option>
			</select>
			<select class="inp" title="Rear door" value={rear === null ? 'mixed' : (rear ?? '')} onchange={(e) => e.currentTarget.value !== 'mixed' && set({ rear: face(e.currentTarget.value) })}>
				{#if rear === null}<option value="mixed">rear: {MIXED}</option>{/if}
				<option value="">rear: none</option><option value="single">rear: single</option><option value="split">rear: split</option>
			</select>
		</span>
	</label>
	{#if anySingle}
		<label class="row" title="The side a single door hangs on, as seen standing at that face">Hinge
			<select class="inp" value={hinge === null ? 'mixed' : (hinge ?? 'left')} onchange={(e) => e.currentTarget.value !== 'mixed' && set({ hinge: e.currentTarget.value === 'right' ? 'right' : undefined })}>
				{#if hinge === null}<option value="mixed">{MIXED}</option>{/if}
				<option value="left">left</option><option value="right">right</option>
			</select></label>
	{/if}
{/if}
