<script>
  import { Icon } from '$lib'
	let {class:className="", variant="", href=null, icon=null, active=null, group=null, children=null, ...props} = $props()

	let classes = $derived([
		"rounded items-center justify-center px-1 disabled:opacity-50 inline-flex gap-1",
		"hover:bg-gray-200",
		"transition-colors",
		group && 'border rounded-none first:rounded-s last:rounded-e -ms-px hover:bg-blue-400',
		active && 'bg-blue-100 border-blue-300 hover:bg-blue-400/40!',
		variant=='primary' && 'px-2 py-1 bg-blue-500 text-white hover:bg-blue-700',
		variant=="danger"  && "px-2 py-1 bg-red-500 text-white hover:bg-red-700",
		variant=="outline" && "px-2 py-1 border hover:bg-gray-100",
		className,
	])
</script>

{#if href}
	<a {href} class={classes} {...props}><Icon name={icon} />
		{@render children?.()}
	</a>
{:else}
	<button class={classes} {...props}><Icon name={icon} />
		{@render children?.()}
	</button>
{/if}
