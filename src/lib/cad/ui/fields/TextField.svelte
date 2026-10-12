<!-- A TEXT field: label, the text ("mixed" when the selected items differ), trimmed on change — blank = '' (callers turn
     it into "none"). `rows` makes it a text area. -->
<script lang="ts">
	import Field from './Field.svelte'
	import { MIXED } from '../propsKit'

	let { label, unit, title, value, mixed = false, placeholder = '', mono = false, rows = 0, onchange }: {
		label: string
		unit?: string
		title?: string
		value: string | undefined
		mixed?: boolean
		placeholder?: string
		mono?: boolean
		/** > 0: a text area this many rows high. */
		rows?: number
		onchange: (v: string) => void
	} = $props()

	function change(el: HTMLInputElement | HTMLTextAreaElement) {
		const t = el.value.trim()
		el.value = mixed ? '' : (value ?? '')
		onchange(t)
	}
</script>

<Field {label} {unit} {title}>
	{#snippet children(id)}
		{#if rows > 0}
			<textarea class="inp" class:font-mono={mono} aria-labelledby={id} {rows} value={mixed ? '' : (value ?? '')} placeholder={mixed ? MIXED : placeholder} onchange={(e) => change(e.currentTarget)}></textarea>
		{:else}
			<input class="inp" class:font-mono={mono} aria-labelledby={id} value={mixed ? '' : (value ?? '')} placeholder={mixed ? MIXED : placeholder} onchange={(e) => change(e.currentTarget)} />
		{/if}
	{/snippet}
</Field>
