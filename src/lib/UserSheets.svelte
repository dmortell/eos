<script>
	import {onMount, tick} from 'svelte'
	import { fade } from 'svelte/transition'
	import {loading, users, session, times, sheets, cleanup, alert, } from '$js/stores'
	import {mdiHeart,mdiRepeat, mdiReply, mdiPencil, mdiContentSave, mdiCancel, mdiClose} from '@mdi/js'
	import {Nav,Card, Container, Details, Icon, Input,Button, Modal} from 'svelte-chota';
	import { asyncable } from 'svelte-asyncable';
	// import {sheets} from '$js/stores'
	import {parseEntry, optional, plural, format, calcHours} from "$js/formatter";
	import Avatar from "$lib/Avatar.svelte"
	import Dialog from "$lib/Dialog.svelte"
	import ListItem from "$lib/ListItem.svelte"
	import ListInput from "$lib/ListInput.svelte"
	// import Alert from "$lib/Alert.svelte"
	export var _sheets

	// todo filter out completed sheets. Ensure current month is shown

	import { createEventDispatcher } from 'svelte';
	export const dispatch = createEventDispatcher();

	function selectMonth(month){
		dispatch('select',{month})
	}
	function delSheet(sheet){
		sheets.delete(sheet.id)
	}
</script>


<Container>
	<Details class="mb-5" open>
		<span slot="summary">Timesheets</span>

		<!--
			<div class="flex flex-wrap items-center">
			<div class="relative w-full px-4 max-w-full flex-grow flex-1">
			  <h3 class="font-semibold text-base text-blueGray-700">Page Visits</h3>
			</div>
			<div class="relative w-full px-4 max-w-full flex-grow flex-1 text-right">
			  <button class="bg-indigo-500 text-white active:bg-indigo-600 text-xs font-bold uppercase px-3 py-1 rounded outline-none focus:outline-none mr-1 mb-1 ease-linear transition-all duration-150" type="button">See all</button>
			</div>
		  </div> -->


		{#each _sheets as sheet}
		<!-- <ListItem title={item.date} after={format(user[item.name], item.fmt)} /> -->
		<ListItem link on:click={e=>selectMonth(sheet.month)}>
			<!-- <div class="grid grid-flow-col auto-cols-max gap-0.5"> -->
			<div class="flex flex-wrap items-center">
				<div class="relative w-full px-4 max-w-full  flex-initial short-date text-center">
					{format(sheet.month,'month')}
				</div>

				<!-- <div class="relative w-full px-4 max-w-full flex-grow flex-1"> -->
				<div class="w-24 px-4 max-w-full flex-grow flex-1">
					{optional(sheet.days,'','day')}
				</div>
				<div class="w-24 px-4 max-w-full flex-grow flex-1">
					{optional(sheet.total,'','hr')}
				</div>
				<div class='col2'>
					<button class="mx-2 px-2 py-1 text-base bg-white text-red-600 border-red-400" on:click={e=>delSheet(sheet)}>Del</button>
				</div>
				<!-- <div class='col4'>
					{optional(sheet.a,'A','hr')}
					{optional(sheet.b,'B','hr')}
					{optional(sheet.c,'C','hr')}
					{optional(sheet.d,'D','hr')}
				</div> -->
				<div class="w-24 px-4 max-w-full flex-grow flex-1 {sheet.status}">
					{sheet.status || ""}
				</div>
				<!-- <div class='right'>
					<Button  small error  slot="after" on:click={e=>delSheet(sheet)}>Del</Button>
				</div> -->
			</div>
		</ListItem>

		{/each}
	</Details>
</Container>

<style>
	.approved { @apply text-green-500; }
	.published { @apply text-blue-500; }
	.col0 {width:4em; margin-right: 8px; }
	.col1 {width:4em; }
	.col2 {width:4em; }
	.col3 {width:4em; }
	.col4 {width:auto; }
	.col5 {float:right; padding-left: 2em; }
	.short-date { width:4em; font-size:0.8em; border: 1px solid#ddd; border-radius:5px; padding: 4px 8px;}
	.hidden { display:none;}
	.greyed { background-color: rgb(238 238 238 / 70%); }
	.thin { font-size:0.7em; }
</style>
