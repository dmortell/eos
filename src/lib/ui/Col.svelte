<script>
	let { class:cls='', children } = $props();	// add gap='0.25rem', height='auto', justify
</script>
<div class="flex flex-col {cls}">
	{@render children?.()}
</div>
