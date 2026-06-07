<script lang="ts">
	// Full-width labeled (optional) textarea for the property windows.
	let { label = '', value = $bindable(), rows = 4, class: className = '', ...props }: {
		label?: string
		value?: any
		rows?: number
		class?: string
		[key: string]: any
	} = $props()
</script>

{#if label}<span class="text-xs text-zinc-500">{label}</span>{/if}
<textarea bind:value {rows} {...props} class={["w-full rounded border px-1 py-0.5 text-xs", className]}></textarea>
