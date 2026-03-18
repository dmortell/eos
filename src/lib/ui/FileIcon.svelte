<script lang="ts">
	import { Icon } from "$lib";
	let {name, ...props} = $props();
</script>

<Icon name={name?.endsWith('.pdf') ? 'fileText' : 'image'} {...props} />
