<script>
	let { title='', children, open=$bindable(false) } = $props()
</script>

{#if open}
<div class="fixed inset-0 z-50 flex items-center justify-center">
	<!-- svelte-ignore a11y_click_events_have_key_events -->
	<!-- svelte-ignore a11y_no_static_element_interactions -->
	<div class="fixed inset-0 bg-black/50" onclick={() => open = false}></div>
	<div class="relative bg-white rounded-lg shadow-lg max-w-lg w-full mx-4 max-h-[85vh] flex flex-col">
		{#if title}<h2 class="text-lg font-semibold px-6 pt-6 pb-2 shrink-0">{title}</h2>{/if}
		<div class="px-6 pb-6 overflow-y-auto">
			{@render children?.()}
		</div>
		<button class="absolute top-4 right-6 text-gray-400 hover:text-gray-600" onclick={() => open = false}>x</button>
	</div>
</div>
{/if}
