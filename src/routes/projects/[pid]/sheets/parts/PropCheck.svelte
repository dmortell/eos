<script lang="ts">
	// Labeled checkbox for the property windows. Spreads ...props onto the <input> (e.g. onchange).
	let { label = '', value = $bindable(false), ...props }: {
		label?: string
		value?: boolean
		[key: string]: any
	} = $props()
</script>

<label class="flex items-center justify-between gap-2">
	<span class="w-24 shrink-0 text-xs text-zinc-500">{label}</span>
	<input type="checkbox" class="accent-blue-600" bind:checked={value} {...props} />
</label>
