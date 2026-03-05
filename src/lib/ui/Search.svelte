<script>
    import { Icon } from "$lib";
    let {value=$bindable(''), class:cls='', ...props} = $props()
</script>

<label class="flex items-center gap-1 mx-0 px-1 border-gray-300 border rounded {cls}">
	<Icon name=search class="opacity-80"/>
	<input placeholder="Search" bind:value class="px-1 outline-none" {...props}/>
</label>