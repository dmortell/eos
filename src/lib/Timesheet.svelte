<script>
	import {onMount, tick} from 'svelte'
	import { fade } from 'svelte/transition'
	import {mdiHeart,mdiRepeat, mdiReply, mdiPencil, mdiContentSave, mdiCancel, mdiClose} from '@mdi/js'
	import {Nav,Card, Container, Details, Icon, Input,Button, Modal} from 'svelte-chota';
	import { asyncable } from 'svelte-asyncable';
	import {sheets, times, cleanup, holidays, alert, work_types, keyValues} from '$js/stores'
	import {parseEntry, optional, plural, format, calcHours, mins, toInt, toHours} from "$js/formatter";
	import Avatar from "$lib/Avatar.svelte"
	import Dialog from "$lib/Dialog.svelte"
	import ListItem from "$lib/ListItem.svelte"
	import ListInput from "$lib/ListInput.svelte"
	import TimeEntry from "$lib/TimeEntry.svelte"
	import TimesheetHeader from "$lib/TimesheetHeader.svelte"
	import Row from "$lib/Row.svelte"
	import Col from "$lib/Col.svelte"
	export var user, month, days, totals

	// const cons = {}
	// var _alltimes = [], _times = [], _days = []
	// var totals = {}
	let types = keyValues('type','name',$work_types)
	let editing = false
	let entry = {}

	// $: connectUser(user,month)

	onMount(()=>{
		// types = keyValues('type','name',$work_types)
	})
/*
	// function connectUser(user,month){
	// 	const uid = user?.uid
	// 	if (uid){
	// 		cons.times  = times.reconnect(cons.times,
	// 			times.collection().where("uid","==",uid).orderBy("date", "asc"),
	// 			onTimesUpdate
	// 		)
	// 	}
	// 	else {
	// 		console.log('invalid uid', user);
	// 		cons.times  = times.disconnect(cons.times)
	// 		return filldays([], false)
	// 	}
	// }
	// function onTimesUpdate(snap){
	// 	_alltimes = snap.docs.filter(q=>{ return true })
	// 		.map(d => { return {id:d.id, ...d.data()} })
	// 	filldays(_alltimes)
	// }
	// function filldays(times, validate=true){
	// 	var start = mins(user.start), end = mins(user.finish), less = toInt(user.breaks) * 60
	// 	var standard = toHours(end-start-less)
	// 	var keys = ['a','b','c','d','total','days','less']
	// 	totals = {a:0, b:0, c:0, d:0, total:0, days:0, less:0, month}
	// 	_times = times.filter(d => d.date.substr(0,7)===month)

	// 	var [y,m] = month.split('-').map(v=>+v)
	// 	var days = new Date(y, m, 0).getDate()				// number of days in the month
	// 	var entries = []
	// 	for (var d=1; d<=days; d++){						// list of days in the month
	// 		var date = month + '-' + (d+'').padStart(2,'0')
	// 		var entry = times.find(e => e.date===date) ?? {date}
	// 		var data = parseEntry(entry, $holidays)
	// 		data.less = data.days ? Math.max(0,standard - data.total) : 0
	// 		entries.push(data)
	// 		keys.map(k => totals[k] += data[k] ?? 0) 		// calculate totals
	// 	}
	// 	if (validate) checkSheetTotals(month, totals)		// check if sheet table needs updating
	// 	_days = entries
	// }
	// function checkSheetTotals(month, totals){				// update sheet table if totals changed
	// 	// if (totals.month!==month || sheet?.month!==month) return;
	// 	// var keys = ['a','b','c','d','total','days'], update = false
	// 	// keys.map(k => {
	// 	// 	if (totals[k]===0 && sheet[k]==undefined){}		// ignore zero entries if undefined
	// 	// 	else if (totals[k] !== sheet[k]) update=true
	// 	// })
	// 	// if (update){
	// 	// 	var status = sheet.status ?? "pending"
	// 	// 	// var color = status == "pending" ? 'blue' : 'red';
	// 	// 	sheets.update({uid:user.uid, month, status, ...totals}, sheet.id, e=>console.log('Updated sheet'))
	// 	// }
	// }
*/


function selectEntry(row){
		// var {date,start,finish,breaks,remark,type} = row
		// var defaults = {date,start,finish,breaks,remark,type, uid:user.uid}
		// breaks:row.breaks ?? 1,
		var {uid, start, finish, breaks} = user
		var defaults = {uid, start, finish, breaks}
		entry = {...defaults, ...row}			// nullish coalescing to avoid changing 0 to 1 for breaks
		editing = true
		console.log('opentimeentry', {defaults, row, entry, user})
	}
	function updateTime(){
		// var {date,start,finish,breaks,remark,type} = entry
		// var data = {date,start,finish,breaks,remark,type, uid:user.uid}
		// times.update(data, entry.id, item=>console.log('saved',item))
		// $alert = "entry updated"
	}
	function deleteTime(){
		// times.collection().doc(entry.id).delete().then(item=>{
		// 	console.log('deleted',entry,item, $times)
		// 	$alert = "Entry deleted"
		// })
	}
	function closePopup(action){
		// if (action=='save') updateTime()
		// if (action=='delete') deleteTime()
	}

	// function decMonth(){incMonth(-1)}
	// function incMonth(inc = 1){
	// 	var [y,m] = month.split('-').map(v=>+v)
	// 	m += inc
	// 	if (m<1) y--, m=12
	// 	if (m>12) y++, m=1
	// 	month = y + '-' + (''+m).padStart(2,'0')
	// }


</script>

<Container>
	<TimesheetHeader {user} {month} />
	<div class='printonly'>
		<table class='xborder-collapse xborder xborder-green-600'>
			<tr class='mainrow'>
				<th>Date</th>
				<th>Type</th>
				<th class='center'>From</th>
				<th class='center'>To</th>
				<th class='center'>Break</th>
				<th class='center'>Total</th>
				<th class='center'>Less</th>
				<th class='center'>(A)</th>
				<th class='center'>(B)</th>
				<th class='center'>(C)</th>
				<th class='center'>(D)</th>
				<th>Remarks</th>
			</tr>
			{#each days as time (time.date)}
			<tr class={time.color ? 'greyed':''}>
				<td class="{time.color}">{time.short}</td>
				<td class="{time.color}">{optional(types[time.type ?? 'normal'])}</td>
				<td class='right'>{optional(time.start)}</td>
				<td class='right'>{optional(time.finish,'')}</td>
				<td class='right'>{optional(time.breaks,'','')}</td>
				<td class='right'>{optional(time.hours,'','')}</td>
				<td class='right'>{optional(time.less,'','')}</td>
				<td class='right'>{optional(time.a,'','')}</td>
				<td class='right'>{optional(time.b,'','')}</td>
				<td class='right'>{optional(time.c,'','')}</td>
				<td class='right'>{optional(time.d,'','')}</td>
				<td>{time.remark || time.holiday || ''}</td>
			</tr>
			{/each}
			<tr class='mainrow'>
				<td><b>Total:</b></td>
				<td></td>
				<td></td>
				<td></td>
				<td></td>
				<td class='right'>{optional(totals.total,'','')}</td>
				<td class='right'>{optional(totals.less,'','')}</td>
				<td class='right'>{optional(totals.a,'','')}</td>
				<td class='right'>{optional(totals.b,'','')}</td>
				<td class='right'>{optional(totals.c,'','')}</td>
				<td class='right'>{optional(totals.d,'','')}</td>
				<td></td>
			</tr>

		</table>
	</div>



	<Details class="mb-5 noprint" open>
		<span slot="summary" class='xnoprint'>
			Timesheet for {format(month,'longmonth-year')}
		</span>
		{#each days as time (time.date)}
		<ListItem link on:click={e=>selectEntry(time)}>
			<div class="grid grid-flow-col auto-cols-max gap-0.5">
				<div class="col0 short-date text-center {time.color}">
					{time.short}
				</div>
				<div class='col1'>
					{optional(time.start)}{optional(time.finish,'-')}
				</div>
				<div class='col2'>
					{optional(time.breaks,'-','hr')}
				</div>
				<div class='col3'>
					{optional(time.hours,'','hr')}
				</div>
				<div class='col4'>
					{optional(time.a,'A','hr')}
					{optional(time.b,'B','hr')}
					{optional(time.c,'C','hr')}
					{optional(time.d,'D','hr')}
				</div>
				<div>{time.remark || time.holiday || ''}</div>
			</div>
		</ListItem>
		{/each}
	</Details>

	<TimesheetHeader {user} {month} {totals} footer />

</Container>



<Dialog bind:open={editing} >
	<div slot="header" class="is-center modal-header">Time Entry</div>

    <div class='modal-content'>
		<!-- <TimeEntry entry={entry} onClose={action=>closePopup(action)} /> -->

			<form on:submit|preventDefault={e=>closePopup('save')}>
				<ListInput label="Date"   type="date"   bind:value={entry.date}    />
				<ListInput label="Start"  type="time"   bind:value={entry.start}   />
				<ListInput label="Finish" type="time"   bind:value={entry.finish}  />
				<ListInput label="Breaks (hours)" type="number" bind:value={entry.breaks} inputmode='numeric' placeholder="Breaks in hours (eg. 1.5hrs)"/>
				<ListInput label="Type"   type="select" bind:value={entry.type}>
					{#each $work_types as type}<option value={type.type}>{type.name}</option>{/each}
				</ListInput>
				<ListInput label="Remarks" type="text"  bind:value={entry.remark} >
					<div slot="content" style='margin-right:8px;'><Button fill small round raised on:click={e=>entry.remark="WFH"}>WFH</Button></div>
				</ListInput>
				{entry.id}
				<!-- <ListItem popupClose>
					&nbsp;

				</ListItem> -->
				<!-- <div slot="footer" class="is-right px-10 py-5 border-t-2">
					<Button secondary icon={mdiClose} on:click={e=>editing=false}>Cancel</Button>
					<Button primary icon={mdiContentSave} on:click={saveUser}>Save</Button>
				</div> -->

			</form>
		<!-- {#each items as item}
			<ListInput label={item.label} name={item.name} value={user[item.name] ?? item.def} type={item.type ?? 'text'} options={item.options}
			on:change={onChange}
			/>
		{/each} -->
	</div>

	<div slot="footer" class="is-right px-10 py-5 border-t-2">
		{#if entry.id}
		<Button fill error on:click={e=>closePopup('delete')}>Delete</Button>
		{/if}
		<Button fill primary type='submit' on:click={e=>closePopup('save')}>Save</Button>
		<Button secondary icon={mdiClose} on:click={e=>editing=false}>Cancel</Button>
		<!-- <Button primary icon={mdiContentSave} on:click={saveUser}>Save</Button> -->
	</div>
</Dialog>


<style>
	.col0 {width:4em; }
	.col1 {width:4em; }
	.col2 {width:4em; }
	.col3 {width:4em; }
	.col4 {width:auto; }
	.col5 {float:right; padding-left: 2em; }
	.red { color:red; }
	.blue { color: blue; }
	.short-date { font-size:0.8em; border: 1px solid#ddd; border-radius:5px; padding: 4px 8px;}
	.hidden { display:none;}
	.greyed { background-color: rgb(218 218 218 / 70%); }
	.thin { font-size:0.7em; }
	th, td {border: 0.5px black solid;
		padding:4px;
	}
	.mainrow {
		border-top: 2px black solid;
		border-bottom: 2px black solid;
	}
</style>
