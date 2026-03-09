<script lang="ts">
	let {class:className=null, value=$bindable(), type='text', active=false, group=null, title=null, label=null, children=null, ...props} = $props()
	let classes = $derived([
		"px-1 border-gray-400 hover:bg-gray-50 disabled:opacity-50",
		group && 'border first:rounded-s last:rounded-e -ms-px', !group && 'rounded',
		active && 'bg-active', className
	])
</script>

{#if type=='textarea'}
	<label {title} class="flexxx items-centerxx gap-2">
		{label} {@render children?.()}
		<textarea bind:value class={classes} {...props}></textarea>
	</label>
{:else}
	<label {title} class="flex-inline items-center gap-2">
		{label} {@render children?.()}
		<input bind:value {type} class={classes} {...props} />
	</label>
{/if}

<style>
	input {
		/* all: unset; */
		padding: 0 4px;
		border-radius: 2px;
		border: 1px solid transparent;
		box-shadow: 0px 0px 0px 1px rgba(0,0,0,0.2);
		transition: border 150ms ease-in-out;
		cursor: revert;
	}
	input:focus { border-color: blue; }
</style>
