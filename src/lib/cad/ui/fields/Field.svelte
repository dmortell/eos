<!-- One Properties FIELD: its label (with its unit, "Width (mm)") in the left column, the control beside it. The label
     has an id the control points at (aria-labelledby): a color swatch or a pair of inputs has no <label> of its own.
     The other fields (NumberField, TextField, SelectField, CheckField, ColorField) are built on it. -->
<script lang="ts">
	import type { Snippet } from 'svelte'

	let { label, unit, title, children }: { label: string; unit?: string; title?: string; children: Snippet<[string]> } = $props()
	const id = $props.id()
</script>

<div class="row" {title}>
	<span {id}>{label}{#if unit}&nbsp;({unit}){/if}</span>
	<div class="ctl" role="group" aria-labelledby={id}>{@render children(id)}</div>
</div>

<style>
	.ctl { min-width: 0; }
</style>
