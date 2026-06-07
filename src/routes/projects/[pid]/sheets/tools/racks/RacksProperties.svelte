<script lang="ts">
	import PropSelect from '../../parts/PropSelect.svelte'
	import type { RackFace } from './types'

	let { floors = [], pid, racksDocId = '', face = 'front', onpick }: {
		floors?: { number: number }[]
		pid: string
		racksDocId?: string
		face?: RackFace
		onpick?: (p: { racksDocId: string; face: RackFace }) => void
	} = $props()

	const docId = (floor: number, room: string) => `${pid}_F${String(floor).padStart(2, '0')}_R${room}`

	let m = $derived(racksDocId.match(/_F(\d+)_R([A-Z])$/))
	let floorStr = $derived(m ? String(Number(m[1])) : (floors[0] ? String(floors[0].number) : '1'))
	let room = $derived(m ? m[2] : 'A')

	function emit(f: string, r: string, fc: RackFace) {
		onpick?.({ racksDocId: docId(Number(f), r), face: fc })
	}
</script>

<PropSelect label="Floor" value={floorStr} onchange={(e: Event) => emit((e.currentTarget as HTMLSelectElement).value, room, face)}>
	{#each floors as fl (fl.number)}<option value={String(fl.number)}>{fl.number}F</option>{/each}
</PropSelect>
<PropSelect label="Room" value={room} onchange={(e: Event) => emit(floorStr, (e.currentTarget as HTMLSelectElement).value, face)}>
	{#each ['A', 'B', 'C', 'D'] as r (r)}<option value={r}>{r}</option>{/each}
</PropSelect>
<PropSelect label="View" value={face} onchange={(e: Event) => emit(floorStr, room, (e.currentTarget as HTMLSelectElement).value as RackFace)}>
	<option value="front">Front</option>
	<option value="rear">Rear</option>
	<option value="plan">Plan</option>
</PropSelect>
