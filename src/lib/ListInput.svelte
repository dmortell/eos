<script>
	// import {onMount, tick} from 'svelte'
	import {Icon} from 'svelte-chota';
	import {mdiChevronRight } from '@mdi/js'
	export var link=false, title='', after=''
	export var detail
	// console.log(link, $$props)
	// <div class="item-row" on:click={e=>{return {...e,detail}}}>
</script>

<div class="item-row" on:click >
	<div class="is-left">
		<slot name="title">{title}</slot>
		<slot></slot>
		<slot name="after">{after}</slot>
	</div>
	{#if link}
	<Icon src={mdiChevronRight} size="1.5" class="is-right"/>
	{/if}
</div>

<style>
	.item-row {
		display: flex;
		justify-content: space-between;
		box-sizing: border-box;
	}
	/* .item-cell {
    display: block;
    align-self: center;
    box-sizing: border-box;
  } */

  /* .list .item-link .item-inner {
    padding-right: calc(var(--f7-list-chevron-icon-area) + var(--f7-list-item-padding-horizontal) + var(--f7-safe-area-right) - var(--menu-list-offset));
} */
</style>
