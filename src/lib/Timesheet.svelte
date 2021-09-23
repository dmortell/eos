<script>
	import {onMount, tick} from 'svelte'
	import { fade } from 'svelte/transition'
	// import {loading, users, session, times, sheets, cleanup, alert, } from '$js/stores'
	import {mdiHeart,mdiRepeat, mdiReply, mdiPencil, mdiContentSave, mdiCancel, mdiClose} from '@mdi/js'
	import {Nav,Card, Container, Details, Icon, Input,Button, Modal} from 'svelte-chota';
	import { asyncable } from 'svelte-asyncable';
	import {sheets, times, cleanup, holidays} from '$js/stores'
	import {parseEntry, optional, plural, format, calcHours} from "$js/formatter";
	import Avatar from "$lib/Avatar.svelte"
	import Dialog from "$lib/Dialog.svelte"
	import ListItem from "$lib/ListItem.svelte"
	import ListInput from "$lib/ListInput.svelte"
	// import Alert from "$lib/Alert.svelte"
	export var user, month

	// import { createEventDispatcher } from 'svelte';
	// export const dispatch = createEventDispatcher();

	const cons = {}
	var _alltimes = [], _times = [], _days = []

	$: connectUser(user,month)

	onMount(()=>{
		return ()=>{ cleanup() }		// todo redo cleanup
	})

	function connectUser(user,month){
		if (!user || !user.uid){
			console.log('invalid uid', user);
			cons.times  = times.disconnect(cons.times)
			return items = []
			return filldays(items = [])
		}
		const uid = user.uid
		cons.times  = times.reconnect(cons.times,   times.collection().where("uid","==",uid).orderBy("date", "asc"), onTimesUpdate )
	}
	function onTimesUpdate(snap){
		_alltimes = snap.docs.filter(q=>{ return true })
			.map(d => { return {id:d.id, ...d.data()} })
		filldays(_alltimes)
	}
	function filldays(times){
		_times = times.filter(d => d.date.substr(0,7)===month)
		// checkSheetTotals(month, totals)
		console.log('usertimes',_times)

		var [y,m] = month.split('-').map(v=>+v)
		var days = new Date(y, m, 0).getDate()		// number of days in the month
		var entries = []
		for (var d=1; d<=days; d++){				// list of days in the month
			var date = month + '-' + (d+'').padStart(2,'0')
			var entry = times.find(e => e.date===date) ?? {date}
			var data = parseEntry(entry, $holidays)
			entries.push(data)
		}
		_days = entries
	}

	// function calcTotals(days){
	// 	var totals = {a:0, b:0, c:0, d:0, total:0, days:0, month}
	// 	var keys = ['a','b','c','d','total','days']
	// 	days.map(data => { keys.map(k => totals[k] += data[k] ?? 0) })
	// 	checkSheetTotals(month, totals)						// update the timesheet totals if an entry is modified
	// 	return totals
	// }
	// function checkSheetTotals(month, totals){				// update sheet table if totals changed
	// 	if (totals.month!==month || sheet?.date!==month) return;
	// 	var keys = ['a','b','c','d','total','days'], update = false
	// 	keys.map(k => {
	// 		if (totals[k]===0 && sheet[k]==undefined){}		// ignore zero entries if undefined
	// 		else if (totals[k] !== sheet[k]) update=true
	// 	})
	// 	if (update){
	// 		var status = sheet.status || "pending"
	// 		var color = status == "pending" ? 'blue' : 'red';
	// 		sheets.update({uid:user.uid,date:month, status, color, ...totals}, sheet.id, e=>console.log('Updated sheet'))
	// 	}
	// }

	function selectEntry(time){}


</script>

<Container>
	<Details class="mb-5" open>
		<span slot="summary">
			Timesheet for {month}
		</span>

		{#each _days as time (time.date)}
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
</Container>


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
	.greyed { background-color: rgb(238 238 238 / 70%); }
	.thin { font-size:0.7em; }
</style>
