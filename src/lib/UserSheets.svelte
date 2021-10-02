<script>
	import {onMount, tick} from 'svelte'
	import { fade } from 'svelte/transition'
	import {loading, users, session, times, sheets, cleanup, alert, monthTotal} from '$js/stores'
	import {mdiHeart,mdiRepeat, mdiReply, mdiPencil, mdiContentSave, mdiCancel, mdiClose} from '@mdi/js'
	import {Nav,Card, Container, Details, Icon, Input,Button, Modal} from 'svelte-chota';
	import { asyncable } from 'svelte-asyncable';
	import {parseEntry, optional, plural, format, calcHours} from "$js/formatter";
	import Avatar from "$lib/Avatar.svelte"
	import Dialog from "$lib/Dialog.svelte"
	import ListItem from "$lib/ListItem.svelte"
	import ListInput from "$lib/ListInput.svelte"
	import { createEventDispatcher } from 'svelte';
	export const dispatch = createEventDispatcher();
	export var _sheets = [], _times = []

	var show_all = false
	$: filtered = _sheets?.filter(i=>show_all || i.status!='approved')


	// todo Ensure current month is shown

	function selectMonth(month){
		dispatch('select',{month})
	}
	function delSheet(sheet){
		sheets.delete(sheet.id)
	}
</script>


<Container>
	<Details open>
		<span slot="summary">Timesheets</span>

		<div class="text-right">
			<Button outline on:click={e=>show_all=!show_all}>{show_all ? 'Hide completed':'Show all'}</Button>
		</div>

		{#each filtered as sheet}
		<!-- <ListItem title={item.date} after={format(user[item.name], item.fmt)} /> -->
		<ListItem link on:click={e=>selectMonth(sheet.month)}>
			<div slot='left' class='days'>{format(sheet.month,'month')}</div>
			<div class='col1'>
				{optional(monthTotal(_times, sheet.month).days,'','day')}
			</div>
			<div class='col2'>
				{optional(monthTotal(_times, sheet.month).hours,'','hr')}
			</div>
			<button class="smallbtn bd-error" on:click={e=>delSheet(sheet)}>Del</button>
			<!-- <Button  small error  slot="after" on:click={e=>delSheet(sheet)}>Del</Button> -->
			<div slot='right' class="{sheet.status}">{sheet.status || ""}</div>
		</ListItem>

		<!-- <ListItem on:click={e=>selectEntry(row)} link>
			<div slot='left' class='days'>{optional(row.days,'','day')}</div>
			{row.starting} - {row.ending}
			<div slot='footer'>{capitalize(row.type.replace('_',' '))} {row.reason}</div>
			<div slot='right'>{row.status}</div>
		</ListItem> -->

		<!-- <div class="relative w-full px-4 max-w-full  flex-initial short-date text-center"> -->
		{/each}
	</Details>
</Container>

<style>
	.pending { color: rgba(245, 158, 11, 1); }
	.approved { color: rgba(16, 185, 129, 1); }
	.published { color: rgba(59, 130, 246, 1); }
	.col0 {width:4em; margin-right: 8px; }
	.col1 {width:3em; float: left;}
	.col2 {width:3em; float: left;}
	.hidden { display:none;}
	.greyed { background-color: rgb(238 238 238 / 70%); }
	.thin { font-size:0.7em; }
	.days {
		width:4em; font-size:0.8em; border: 1px solid#ddd; border-radius:5px;
		padding: 8px 8px; margin: 4px 0;
		text-align: center;
		line-height: 1.5rem;
	}
</style>
