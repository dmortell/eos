<!-- A SELECT field: label, a list of [value, text] — "mixed" (not pickable) when the selected items differ. `extra`
     adds options after the list (New row…). The select shows the data again after a pick: a pick that opens a name
     box, or is refused, doesn't stick. -->
<script lang="ts">
	import type { Snippet } from 'svelte'
	import Field from './Field.svelte'
	import { MIXED } from '../propsKit'

	let { label, unit, title, value, mixed = false, options, disabled = false, onchange, extra }: {
		label: string
		unit?: string
		title?: string
		value: string | undefined
		mixed?: boolean
		options: readonly (readonly [string, string])[]
		disabled?: boolean
		onchange: (v: string) => void
		extra?: Snippet
	} = $props()

	/** Never a real value. */
	const MIXED_KEY = '\u0000mixed'
	const shown = $derived(mixed ? MIXED_KEY : (value ?? ''))
	function change(el: HTMLSelectElement) {
		const v = el.value
		el.value = shown
		if (v !== MIXED_KEY) onchange(v)
	}
</script>

<Field {label} {unit} {title}>
	{#snippet children(id)}
		<select class="inp" aria-labelledby={id} {disabled} value={shown} onchange={(e) => change(e.currentTarget)}>
			{#if mixed}<option value={MIXED_KEY} disabled>{MIXED}</option>{/if}
			{#each options as [v, text] (v)}<option value={v}>{text}</option>{/each}
			{@render extra?.()}
		</select>
	{/snippet}
</Field>
