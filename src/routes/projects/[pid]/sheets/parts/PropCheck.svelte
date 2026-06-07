<script lang="ts">
	// Labeled checkbox for the property windows. Spreads ...props onto the <input> (e.g. onchange).
	let { label = '', value = $bindable(false), ...props }: {
		label?: string
		value?: boolean
		[key: string]: any
	} = $props()
</script>

<label class="flex items-center gap-2">
	<input type="checkbox" class="accent-blue-600" bind:checked={value} {...props} />
	<span class="text-xs text-zinc-600">{label}</span>
</label>
