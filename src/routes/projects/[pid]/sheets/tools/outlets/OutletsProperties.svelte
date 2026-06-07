<script lang="ts">
	import PropSelect from '../../parts/PropSelect.svelte'

	// Outlets data-source picker for the viewport properties window. The floorplan PDF + calibration
	// are taken from the selected floor's outlets doc automatically, so only a floor is needed.
	let { floors = [], pid, outletsDocId = '', onpick }: {
		floors?: { number: number }[]
		pid: string
		outletsDocId?: string
		onpick?: (outletsDocId: string) => void
	} = $props()

	const docIdFor = (floor: number) => `${pid}_F${String(floor).padStart(2, '0')}`

	let floorStr = $derived.by(() => {
		const m = outletsDocId.match(/_F(\d+)$/)
		if (m) return String(Number(m[1]))
		return floors[0] ? String(floors[0].number) : '1'
	})

	function pick(e: Event) {
		onpick?.(docIdFor(Number((e.currentTarget as HTMLSelectElement).value)))
	}
</script>

<PropSelect label="Floor" value={floorStr} onchange={pick}>
	{#each floors as f (f.number)}
		<option value={String(f.number)}>{f.number}F</option>
	{/each}
</PropSelect>
