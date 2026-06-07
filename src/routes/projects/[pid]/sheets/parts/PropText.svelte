<script lang="ts">
	// Labeled text/number/date input for the property windows. Spreads ...props onto the
	// <input> so consumers pass oninput / placeholder / min / max / step etc.
	let { label = '', value = $bindable(), type = 'text', mono = false, class: className = '', ...props }: {
		label?: string
		value?: any
		type?: string
		mono?: boolean
		class?: string
		[key: string]: any
	} = $props()
</script>

<label class="flex items-center justify-between gap-2">
	<span class="w-24 shrink-0 text-xs text-zinc-500">{label}</span>
	<input {type} bind:value {...props}
		class={["w-full rounded border px-1 py-0.5 text-xs", mono && "font-mono", className]} />
</label>
