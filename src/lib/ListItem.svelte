<script>
	import {Icon} from 'svelte-chota';
	import {mdiChevronRight } from '@mdi/js'
	export var link=false, title='', after=''
	// <div class="item-row" on:click={e=>{return {...e,detail}}}>
</script>

<!-- <div class="item-row" on:click={e=>console.log('clk')} > -->

	<!-- <div class="flex flex-wrap items-center">
		<div class="relative w-full px-4 max-w-full flex-grow flex-1">
		  <h3 class="font-semibold text-base text-blueGray-700">Page Visits</h3>
		</div>
		<div class="relative w-full px-4 max-w-full flex-grow flex-1 text-right">
		  <button class="bg-indigo-500 text-white active:bg-indigo-600 text-xs font-bold uppercase px-3 py-1 rounded outline-none focus:outline-none mr-1 mb-1 ease-linear transition-all duration-150" type="button">See all</button>
		</div>
	  </div> -->

<!-- <div class="flex flex-wrap items-center   item-row item-row-narrow" on:click > -->
<div class="item-row item-row-narrow" on:click >
	{#if title}<div class="left"><slot name="title">{title}</slot></div>{/if}
	<div class="float-left"><slot></slot></div>
	{#if after}<div class="left"><slot name="after">{after}</slot></div>{/if}
	{#if link}
	<Icon src={mdiChevronRight} size="1.5" class="relative text-gray-400"/>
	{/if}
</div>

<style>
	.item-row {
		display: flex;
		justify-content: space-between;
		box-sizing: border-box;
		border-bottom: 1px #d1d1d180 solid;
		padding: 8px 0;
	}
	.item-row-narrow {
		/* display: flex;
		justify-content: space-between;
		box-sizing: border-box;
		border-bottom: 1px #d1d1d180 solid; */
		padding: 2px 0;
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
