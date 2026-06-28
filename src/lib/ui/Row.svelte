<script>
	let { class:cls='', children } = $props();	// add gap='0.25rem', overflow:'visible'
</script>
<div class="flex items-center {cls}">
	{@render children?.()}
</div>
