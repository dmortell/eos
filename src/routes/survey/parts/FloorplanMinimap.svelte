<script lang="ts">
	import { Icon } from '$lib'
	import { subscribeFloorplans } from '../survey.svelte'
	import type { SurveyPhoto, SurveyFloorplan } from '../types'

	let {
		surveyId,
		photo,
		ontap,
	}: {
		surveyId: string
		photo: SurveyPhoto
		ontap?: (floorplan: SurveyFloorplan) => void
	} = $props()

	let floorplans: SurveyFloorplan[] = $state([])

	$effect(() => {
		const unsub = subscribeFloorplans(surveyId, (data) => { floorplans = data })
		return () => unsub()
	})

	let floorplan = $derived(photo.floorplanId ? floorplans.find(f => f.id === photo.floorplanId) : null)

	function handleTap() {
		if (floorplan && ontap) ontap(floorplan)
	}
</script>

{#if floorplan && photo.pinX != null && photo.pinY != null}
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div
		class="absolute bottom-20 right-3 z-10 cursor-pointer overflow-hidden rounded-lg border-2 border-white/50 shadow-lg"
		style="width: 140px; height: 100px"
		onclick={handleTap}
	>
		<img src={floorplan.url} alt={floorplan.name} class="h-full w-full object-cover" />
		<!-- Pin dot -->
		<div
			class="absolute h-3 w-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white bg-red-500 shadow"
			style="left: {photo.pinX * 100}%; top: {photo.pinY * 100}%"
		></div>
		<!-- Direction cone -->
		{#if photo.direction != null}
			{@const angle = photo.direction - 90}
			<div
				class="absolute h-5 w-5 -translate-x-1/2 -translate-y-1/2"
				style="left: {photo.pinX * 100}%; top: {photo.pinY * 100}%"
			>
				<svg viewBox="0 0 20 20" class="h-full w-full">
					<path
						d="M10,10 L{10 + 9 * Math.cos((angle - 20) * Math.PI / 180)},{10 + 9 * Math.sin((angle - 20) * Math.PI / 180)} A9,9 0 0,1 {10 + 9 * Math.cos((angle + 20) * Math.PI / 180)},{10 + 9 * Math.sin((angle + 20) * Math.PI / 180)} Z"
						fill="rgba(239,68,68,0.4)"
						stroke="rgba(239,68,68,0.8)"
						stroke-width="0.5"
					/>
				</svg>
			</div>
		{/if}
		<!-- Label -->
		<div class="absolute bottom-0 left-0 right-0 bg-black/40 px-1.5 py-0.5 text-center">
			<span class="text-[9px] font-medium text-white">
				<Icon name="mapPin" size={8} class="inline" /> Floorplan
			</span>
		</div>
	</div>
{/if}
