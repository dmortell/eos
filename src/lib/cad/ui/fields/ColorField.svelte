<!-- A COLOR field: label, cad's color picker (ColorPick) — "By layer" / "None" where allowed, mixed when the selected
     items differ. -->
<script lang="ts">
	import Field from './Field.svelte'
	import ColorPick from '../ColorPick.svelte'

	let { label = 'Color', title, value, mixed = false, allowNone = false, allowByLayer = false, onchange }: {
		label?: string
		title?: string
		value: string | undefined
		mixed?: boolean
		allowNone?: boolean
		allowByLayer?: boolean
		onchange: (v: string | undefined) => void
	} = $props()
</script>

<Field {label} {title}>
	{#snippet children()}
		<ColorPick {value} {mixed} {allowNone} {allowByLayer} title={label} {onchange} />
	{/snippet}
</Field>
