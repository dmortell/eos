<script lang="ts">
	import { getContext } from 'svelte'
	import type { Firestore } from '$lib/db.svelte'
	import PropSelect from '../../parts/PropSelect.svelte'
	import PropCheck from '../../parts/PropCheck.svelte'
	import type { RackFace, RackRow } from './types'

	type Settings = { racksDocId: string; face: RackFace; rowId: string; showWalls: boolean; colorDevices: boolean }

	let { floors = [], pid, racksDocId = '', face = 'front', rowId = '', showWalls = false, colorDevices = true, onchange }: {
		floors?: { number: number }[]
		pid: string
		racksDocId?: string
		face?: RackFace
		rowId?: string
		showWalls?: boolean
		colorDevices?: boolean
		onchange?: (p: Settings) => void
	} = $props()

	const db = getContext('db') as Firestore
	const docId = (floor: number, room: string) => `${pid}_F${String(floor).padStart(2, '0')}_R${room}`

	let m = $derived(racksDocId.match(/_F(\d+)_R([A-Z])$/))
	let floorStr = $derived(m ? String(Number(m[1])) : (floors[0] ? String(floors[0].number) : '1'))
	let room = $derived(m ? m[2] : 'A')

	// Rows for the currently-selected room (to populate the Row picker).
	let rows = $state<RackRow[]>([])
	$effect(() => {
		if (!racksDocId) { rows = []; return }
		const unsub = db.subscribeOne('racks', racksDocId, (d: any) => { rows = Array.isArray(d?.rows) ? d.rows : [] })
		return () => unsub?.()
	})

	function emit(p: Partial<Settings>) {
		onchange?.({ racksDocId, face, rowId, showWalls, colorDevices, ...p })
	}
	const val = (e: Event) => (e.currentTarget as HTMLSelectElement).value
	const chk = (e: Event) => (e.currentTarget as HTMLInputElement).checked
</script>

<PropSelect label="Floor" value={floorStr} onchange={(e: Event) => emit({ racksDocId: docId(Number(val(e)), room), rowId: '' })}>
	{#each floors as fl (fl.number)}<option value={String(fl.number)}>{fl.number}F</option>{/each}
</PropSelect>
<PropSelect label="Room" value={room} onchange={(e: Event) => emit({ racksDocId: docId(Number(floorStr), val(e)), rowId: '' })}>
	{#each ['A', 'B', 'C', 'D'] as r (r)}<option value={r}>{r}</option>{/each}
</PropSelect>
<PropSelect label="Row" value={rowId} onchange={(e: Event) => emit({ rowId: val(e) })}>
	<option value="">All rows</option>
	{#each rows as r (r.id)}<option value={r.id}>{r.label}</option>{/each}
</PropSelect>
<PropSelect label="View" value={face} onchange={(e: Event) => emit({ face: val(e) as RackFace })}>
	<option value="front">Front</option>
	<option value="rear">Rear</option>
	<option value="plan">Plan</option>
</PropSelect>
<PropCheck label="Show walls" value={showWalls} onchange={(e: Event) => emit({ showWalls: chk(e) })} />
<PropCheck label="Color devices" value={colorDevices} onchange={(e: Event) => emit({ colorDevices: chk(e) })} />
