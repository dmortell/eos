<script>
	let { class:cls='', children } = $props();
</script>
<div class="flex items-center {cls}">
	{@render children?.()}
</div>
