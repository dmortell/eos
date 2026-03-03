<script>
	let {class:cls='', children=null} = $props()
</script>
<div class="flex items-center gap-2">
	<div class="animate-spin rounded-full h-4 w-4 border-b-2 border-blue-500 {cls}"></div>
	{@render children?.()}
</div>
