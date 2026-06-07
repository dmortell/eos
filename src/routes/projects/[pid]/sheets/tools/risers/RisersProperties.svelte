<script lang="ts">
	import PropSelect from '../../parts/PropSelect.svelte'

	let { floors = [], fromFloor, toFloor, onchange }: {
		floors?: { number: number }[]
		fromFloor: number
		toFloor: number
		onchange?: (p: { fromFloor: number; toFloor: number }) => void
	} = $props()

	const val = (e: Event) => Number((e.currentTarget as HTMLSelectElement).value)
</script>

<PropSelect label="From floor" value={String(fromFloor)} onchange={(e: Event) => onchange?.({ fromFloor: val(e), toFloor })}>
	{#each floors as fl (fl.number)}<option value={String(fl.number)}>{fl.number}F</option>{/each}
</PropSelect>
<PropSelect label="To floor" value={String(toFloor)} onchange={(e: Event) => onchange?.({ fromFloor, toFloor: val(e) })}>
	{#each floors as fl (fl.number)}<option value={String(fl.number)}>{fl.number}F</option>{/each}
</PropSelect>
