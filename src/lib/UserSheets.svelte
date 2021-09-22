<script>
	import {onMount, tick} from 'svelte'
	import { fade } from 'svelte/transition'
	// import {loading, users, session, times, sheets, cleanup, alert, } from '$js/stores'
	import {mdiHeart,mdiRepeat, mdiReply, mdiPencil, mdiContentSave, mdiCancel, mdiClose} from '@mdi/js'
	import {Nav,Card, Container, Details, Icon, Input,Button, Modal} from 'svelte-chota';
	import { asyncable } from 'svelte-asyncable';
	import {sheets} from '$js/stores'
	import {parseEntry, optional, plural, format, calcHours} from "$js/formatter";
	import Avatar from "$lib/Avatar.svelte"
	import Dialog from "$lib/Dialog.svelte"
	import ListItem from "$lib/ListItem.svelte"
	import ListInput from "$lib/ListInput.svelte"
	// import Alert from "$lib/Alert.svelte"
	export var user

	import { createEventDispatcher } from 'svelte';
	export const dispatch = createEventDispatcher();

	const cons = {}
	var items = []

	$: connectUser(user)

	function connectUser(user){
		if (!user) return []
		cons.sheets = sheets.reconnect(cons.sheets, sheets.collection().where("uid","==",user.uid).orderBy("date", "desc"), onSheetsUpdate )
	}
	function onSheetsUpdate(snap){
		items = snap.docs.filter(d=>{ return true })				// todo filter out completed sheets. Ensure current month is shown
			.map(d => { return {id:d.id, ...d.data()} })
		// checkSheetTotals(month, totals)
		console.log('usersheets',items)
	}
	function selectMonth(month){
		dispatch('select',{month})
	}

</script>


<Container>
	<Details class="mb-5" open>
		<span slot="summary">
			Timesheets
		</span>

		{#each items as sheet}
		<!-- <ListItem title={item.date} after={format(user[item.name], item.fmt)} /> -->
		<ListItem link on:click={e=>selectMonth(sheet.month)}>
			<div class="grid grid-flow-col auto-cols-max gap-0.5">
				<!-- <div class="col1 short-date h-12 flex flex-wrap content-start  {sheet.color}"> -->
				<div class="col1 short-date text-center {sheet.color}">
					{format(sheet.date,'month')}
				</div>
				<div class='col2'>
					{optional(sheet.days,'','day')}
					<!-- {optional(sheet.total,'','hr')} -->
				</div>
				<!-- <div class='col3'></div> -->
				<!-- <div class='col4'>
					{optional(sheet.a,'A','hr')}
					{optional(sheet.b,'B','hr')}
					{optional(sheet.c,'C','hr')}
					{optional(sheet.d,'D','hr')}
				</div> -->
				<div class="col5">{sheet.status || ""}</div>
				<!-- <div>
					<Button outline slot="after">Submit</Button>
				</div> -->
			</div>
		</ListItem>

		{/each}
	</Details>
</Container>

<style>
	.col1 {width:4em; }
	.col2 {width:4em; }
	.col3 {width:4em; }
	.col4 {width:auto; }
	.col5 {float:right; padding-left: 2em; }
	.red { color:red; }
	.blue { color: blue; }
	.short-date { font-size:0.8em; border: 1px solid#ddd; border-radius:5px; padding: 4px 8px;}
	.hidden { display:none;}
	.greyed { background-color: rgb(238 238 238 / 70%); }
	.thin { font-size:0.7em; }
</style>
