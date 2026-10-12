<!-- A CHECKBOX field: label, the box with its words after it ("takes outlets") — half-ticked when the selected items
     differ; a click sets them all. -->
<script lang="ts">
	import Field from './Field.svelte'

	let { label, title, checked, mixed = false, text = '', onchange }: {
		label: string
		title?: string
		checked: boolean
		mixed?: boolean
		text?: string
		onchange: (v: boolean) => void
	} = $props()
</script>

<Field {label} {title}>
	{#snippet children(id)}
		<label class="chk"><input type="checkbox" aria-labelledby={id} checked={checked && !mixed} indeterminate={mixed} onchange={(e) => onchange(e.currentTarget.checked)} /> {text}</label>
	{/snippet}
</Field>

<style>
	.chk { display: inline-flex; align-items: center; gap: 0.25rem; }
</style>
