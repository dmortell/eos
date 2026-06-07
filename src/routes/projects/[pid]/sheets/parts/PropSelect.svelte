<script lang="ts">
	// Labeled <select> for the property windows. Options are passed as children.
	let { label = '', value = $bindable(), class: className = '', children, ...props }: {
		label?: string
		value?: any
		class?: string
		children?: any
		[key: string]: any
	} = $props()
</script>

<label class="flex items-center justify-between gap-2">
	<span class="w-24 shrink-0 text-xs text-zinc-500">{label}</span>
	<select bind:value {...props} class={["w-full rounded border px-1 py-0.5 text-xs", className]}>
		{@render children?.()}
	</select>
</label>
