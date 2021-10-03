<script>
	import {Icon} from 'svelte-chota';
	import {mdiChevronRight } from '@mdi/js'
	export var link=false, title='', after='', narrow=null

// todo
// {#if $$slots.left}
// 	<div class="nav-left">
// 		<slot name="left"></slot>
// 	</div>
// {/if}
</script>

<div class="list-item {$$props.class ??''}" class:narrow class:link on:click >
	{#if title}<div class="left"><slot name="title">{title}</slot></div>{/if}
	<div class='listitem-left'><slot name='left'></slot></div>
	<div class='listitem-center'>
		<div class='listitem-title'><slot></slot></div>
		<div class='listitem-footer'><slot name='footer'></slot></div>
	</div>
	{#if after}<div class="left"><slot name="after">{after}</slot></div>{/if}
	<div class='listitem-right'><slot name='right'></slot></div>
</div>

<style>

	@media screen and (max-width: 800px){
		.list-item { padding: 0; }
	}

	.list-item {
		position: relative;
    width: 100%;
    list-style: none;
    box-sizing: border-box;
    display: -webkit-box;
    display: -webkit-flex;
    display: flex;
    flex-direction: row;
    justify-content: flex-start;
    align-items: center;
    margin: 0 0 -1px 0;
    /* color: #1f1f21; */
    transition: background-color .2s linear;

    /* -webkit-box-orient: horizontal;
    -webkit-box-direction: normal;
    -webkit-flex-direction: row;
    -webkit-box-pack: start;
    -webkit-justify-content: flex-start;
    -webkit-box-align: center;
    -webkit-align-items: center; */

		/* display: flex;
		justify-content: space-between;
		box-sizing: border-box;
		border-bottom: 1px #d1d1d180 solid;
		padding: 8px 0; */
	}

	.listitem-left {
    box-sizing: border-box;
    display: flex;
    padding: 0px 14px 0px 0;
    order: 0;
    align-items: center;
    align-self: stretch;
    line-height: 1.2em;
    min-height: 44px;
    /* display: -webkit-box; */
    /* display: -webkit-flex; */
    /* -webkit-box-ordinal-group: 1;
    -webkit-order: 0;
    -webkit-box-align: center;
    -webkit-align-items: center;
    -webkit-align-self: stretch; */
}

.listitem-center {
		padding: 8px 6px 8px 0;
    line-height: 1.2em;
    min-height: 44px;

		box-sizing: border-box;
    display: -webkit-box;
    display: -webkit-flex;
    display: flex;
    -webkit-box-flex: 1;
    -webkit-flex-grow: 1;
    flex-grow: 1;
    -webkit-flex-wrap: wrap;
    flex-wrap: wrap;
    -webkit-box-orient: horizontal;
    -webkit-box-direction: normal;
    -webkit-flex-direction: row;
    flex-direction: row;
    -webkit-box-ordinal-group: 2;
    -webkit-order: 1;
    order: 1;
    margin-right: auto;
    -webkit-box-align: center;
    -webkit-align-items: center;
    align-items: center;
    -webkit-align-self: stretch;
    align-self: stretch;
    margin-left: 0;
    border-bottom: none;
    background-size: 100% 1px;
    background-repeat: no-repeat;
    background-position: bottom;
    background-image: linear-gradient(0deg,#ccc,#ccc 100%);
}

.narrow .listitem-center {
		padding: 0px 6px 0px 0;
}
.listitem-title {
	margin-right:4px;
}
.item-title {
    /* min-width: 0;
    flex-shrink: 1;
    position: relative;
    overflow: hidden;
    text-overflow: ellipsis;
    max-width: 100%; */
    /* white-space: var(--f7-list-item-title-white-space);
    font-size: var(--f7-list-item-title-font-size);
    font-weight: var(--f7-list-item-title-font-weight);
    color: var(--f7-list-item-title-text-color);
    line-height: var(--f7-list-item-title-line-height); */
}
.row {
    display: flex;
    justify-content: space-between;
    flex-wrap: wrap;
    align-items: flex-start;
    --f7-cols-per-row: 1;
}

.listitem-footer {
    /* color: var(--f7-list-item-footer-text-color); */
    /* font-size: var(--f7-list-item-footer-font-size); */
    /* line-height: var(--f7-list-item-footer-line-height); */
    color: var(--color-secondary);
    font-size: 0.9em;
    font-weight: var(--f7-list-item-footer-font-weight);
    line-height: 1.2;
}

	.listitem-right {
		box-sizing: border-box;
    display: -webkit-box;
    display: -webkit-flex;
    display: flex;
    margin-left: auto;
    padding: 12px 12px 12px 0;
    -webkit-box-ordinal-group: 3;
    -webkit-order: 2;
    order: 2;
    -webkit-box-align: center;
    -webkit-align-items: center;
    align-items: center;
    -webkit-align-self: stretch;
    align-self: stretch;
    border-bottom: none;
    background-size: 100% 1px;
    background-repeat: no-repeat;
    background-position: bottom;
    background-image: linear-gradient(0deg,#ccc,#ccc 100%);
		line-height: 1.2em;
    min-height: 44px;
	}

	.link { cursor:pointer; }

	.link .listitem-right  {
    padding-right: 30px;
	}

	.link:before {
    position: absolute;
    content: '';
    right: 16px;
    top: 50%;
    -webkit-transform: translateY(-50%) rotate(-45deg);
    transform: translateY(-50%) rotate(-45deg);
}

/* .list-item--chevron:before, .list-item__expand-chevron { */
.link:before, .list-item__expand-chevron {
    border-right: 2px solid #c7c7cc;
    border-bottom: 2px solid #c7c7cc;
    width: 7px;
    height: 7px;
    background-color: transparent;
    z-index: 5;
}




	.narrow {
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
