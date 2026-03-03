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

<select bind:value class={classes} {title} {...props}>
	{@render children?.()}
</select>
