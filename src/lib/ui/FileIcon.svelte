<script lang="ts">
	import { Icon } from "$lib";
	let {name, ...props} = $props();

</script>

<Icon name={name?.endsWith('.pdf') ? 'fileText' : 'image'} {...props} />

<!-- {#if name && lucide[name]}
	{@const LucideIcon = lucide[name]}
	<LucideIcon {size} class={[className]} {...props} />
{:else if name}
	<i class={['inline-block', name, className]} {...props}></i>
{/if} -->
