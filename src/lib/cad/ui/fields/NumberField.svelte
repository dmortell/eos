<!-- A NUMBER field: label (unit), the value — blank shows the default it uses as the placeholder ("from U: 2100"), and
     "mixed" when the selected items differ. Not a number: nothing changes. Blank: `onchange(undefined)` when `blank`
     (back to the default), else nothing. The box shows the data again once it's written, or refused. -->
<script lang="ts">
	import Field from './Field.svelte'
	import { MIXED } from '../propsKit'

	let { label, unit, title, value, mixed = false, placeholder = '', min, max, step, blank = false, mono = false, onchange }: {
		label: string
		unit?: string
		title?: string
		value: number | undefined
		mixed?: boolean
		/** What a blank box means (the default). */
		placeholder?: string
		min?: number
		max?: number
		step?: number | 'any'
		/** A blank box clears the value (undefined); otherwise blank is ignored. */
		blank?: boolean
		mono?: boolean
		onchange: (v: number | undefined) => void
	} = $props()

	function change(el: HTMLInputElement) {
		const t = el.value.trim(), n = Number(t)
		el.value = mixed || value == null ? '' : String(value)
		if (t === '') { if (blank) onchange(undefined); return }
		if (Number.isFinite(n)) onchange(n)
	}
</script>

<Field {label} {unit} {title}>
	{#snippet children(id)}
		<input class="inp" class:font-mono={mono} type="number" aria-labelledby={id} {min} {max} {step} value={mixed || value == null ? '' : value}
			placeholder={mixed ? MIXED : placeholder} onchange={(e) => change(e.currentTarget)} />
	{/snippet}
</Field>
