<script>
	let {class:className=null, value=$bindable(), active=false, group=false, title=null, label=null, children=null, ...props} = $props()
	let classes = $derived([
		"px-1.5 py-0.5 border rounded text-xs",
		!group && 'rounded',
		group && 'border first:rounded-s last:rounded-e -ms-px',
		active && 'bg-active',
		className,
	])
</script>

<!-- {label} {@render children?.()} -->
<!-- <input bind:value {type} class={classes} {...props} /> -->

	<label {title} class="flex-inline items-center gap-2">
		{label}
		<select bind:value class={classes} {title} {...props}>
			{@render children?.()}
		</select>
	</label>
