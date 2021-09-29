<script>
	import {onMount, tick} from 'svelte'
	import {Dialog, ListItem} from '$lib'
	import {Nav,Card, Container, Details, Row, Col, Icon, Field, Input,Button, Tag} from 'svelte-chota';
	import { users } from '$js/stores';
	import {mdiClose } from '@mdi/js'
	// import {mdiHome,mdiMagnify, mdiDelete,mdiAccountPlus,mdiSend, mdiChevronDown } from '@mdi/js'
	// import {loading, users, session, times, sheets, holidays, cleanup, monthTotal, alert} from '$js/stores'
	// import {parseEntry, optional, plural, format, calcHours, mins, toInt, toHours} from "$js/formatter";
	import {capitalize} from "$js/formatter";
	export let user, leave
	var popups = {modal:false}
	$: rows = processEntries(leave, user)

	const fields = [
		{name: 'id', 				type: 'hidden'},
		{name: 'username', 	type: 'hidden'},
		{name: 'submitted', type: 'hidden'},
		{name: 'status', 		type: 'hidden'},
		{name: 'starting', 	type: 'date', 	rules: 'required',autoFocus: true,},
		{name: 'ending', 		type: 'date', 	rules: 'required'},
		{name: 'days', 			type: 'number',	rules: 'minvalue=1,maxvalue=365'},
		{name: 'type', 			type: 'radios',	modifier: 'material',options: ['paid_leave', 'sick_leave', 'special_leave', 'unpaid_leave']},
		{name: 'reason'},
		{name: 'cover'},
	];

	const summary = [
		{name: 'name'},
		{name: 'year'},
		{name: 'carry_over'},
		{name: 'entitlement'},
		{name: 'paid_leave'},
		{name: 'sick_leave'},
		{name: 'special_leave'},
		{name: 'unpaid_leave'},
		{name: 'compensation_days'},
		{name: 'compensation_used'},
		{name: 'remaining'},
	];

	onMount(() => {
		return ()=>{ }
	})
	const onClose = e => popups.moddal = false;
	const onSelect = item => {
		popups.modal = true;
		// navigator.pushPage({
		// 	content:EditLeave, key:'edit.$name', props:{item, user, onClose}, title:'Leave Request', hasBackButton:true
		// })
	}
	function processEntries(times, user){
		const d = new Date()
		const year = new Intl.DateTimeFormat('en', { year: 'numeric' }).format(d)
		const totals = {remaining:0}
		if (!times) return []
		times.map(item =>{
			if (item.type){
				var type = item.type, inc = -1;
				if (type=='weekend'){ type = 'compensation_days'; inc = 1; }
				totals[type] = (totals[type] ?? 0) + (item.days ?? 1);
				totals.remaining += item.days ?? inc;
				console.log(type, inc, totals)
			}
		})
		summary.map((item, idx)=>{
			summary[idx].value = null;
			switch(item.name){
				case 'name': summary[idx].value = `${user.displayName} ${user.username ?? ''}`; break;
				case 'year': summary[idx].value = year; break;
				default: 		 summary[idx].value = totals[item.name]; break;
			}
		})
		console.log({year,times})
		return times.filter(item=> item.date==year)
	}


	function selectEntry(row){
		// var {uid, start, finish, breaks} = user
		// var defaults = {uid, start, finish, breaks}
		// entry = {...defaults, ...row}			// nullish coalescing to avoid changing 0 to 1 for breaks
		// editing = true
		// console.log('opentimeentry', {defaults, row, entry, user})
	}
	function updateTime(){

		// const doSubmit = data => {		// todo: validate data
		// 	ajax('edit.$name',data).then( data=>{
		// 		socket.emit('get.$name')
		// 		if (onClose) onClose()
		// 	})
		// }

		// var {date,start,finish,breaks,remark='',type} = entry
		// var data = {date,start,finish,breaks,remark,type, uid:user.uid}
		// console.log('saving',entry)
		// times.update(data, entry.id, item=>console.log('saved',data))
		// editing = false
		// $alert = "entry updated"
	}
	function deleteTime(){
		// 	ons.notification.confirm('Are you sure you want to delete this item?')
		// .then((response) => { if (response===1){
		// 	ajax('del.$name',data).then( data=>{
		// 		socket.emit('get.$name')
		// 		if (onClose) onClose()
		// 	})
		// }})


		// if (entry.id) times.collection().doc(entry.id).delete().then(item=>{
		// 	console.log('deleted',entry,item, $times)
		// 	$alert = "Entry deleted"
		// })
	}
	function closePopup(action){
		if (action=='save') updateTime()
		if (action=='delete') deleteTime(editing = false)
	}

</script>

<Container>

	<!-- <ListTitle>Leave Requests</ListTitle> -->
	<Card>
		<h2>Leave Requests</h2>

		<Card>
			{#each summary as item (item.name)}
				{#if item.value}
					<Row>
						<!-- <Col style={{maxWidth:180, whiteSpace:'nowrap'}}>{capitalize(item.name.replace('_',' '))}:</Col> -->
						<Col >{capitalize(item.name.replace('_',' '))}:</Col>
						<Col class='xxright'>{item.value}</Col><Col/>
					</Row>
				{/if}
			{/each}
		</Card>
		<!-- {#each rows as row (row.id)} -->
		<!-- {#each rows as row }
		<p>row</p>
			<ListItem key={row.id} tappable onClick={e=>onSelect(row)} modifier='chevron'> -->
			<!-- <ListItem tappable onClick={e=>onSelect(row)} modifier='chevron'>
				<div class='left'><span class='list-item__icon' style={{fontSize: 14}}>{row.days} days</span></div>
				<div class='center'>
					<span class='list-item__title'>{capitalize(row.type.replace('_',' '))} {row.reason}</span>
					<span class='list-item__subtitle'>{row.starting} - {row.ending}</span>
				</div>
				<div class='right'>
					{row.status}
				</div>
			</ListItem>
		{/each} -->
	<!-- <FetchData url='?ajax=get.$name' data={{username}} loading error empty field='$name' map={ (row,idx) =>
	} /> -->
	</Card>

	<Card>
		<Details class="mb-5" >
			<span slot="summary">Notes</span>
			<h5 class='center'>Notes regarding leave requests</h5>
			<ol>
				<li>Please do not book any holidays until all approvals have been obtained.</li>
				<li>At least 5 working days notice is needed for paid leave. In other cases please
					submit the request as soon as possible.</li>
				<li>If you wish to change any of your dates for leave please submit a new request.</li>
				<li>When the client you are working at is closed on a day other than a national holiday
					or weekend, submit a request for a client holiday. These days do not require signed
					approval and will not be deducted from your yearly paid leave.</li>
				<li>Days Remaining indicates the number of days remaining to the end of
					the calendar year (December 30th), assuming that the employee will work up to
					the last working day in that year. If the employee leaves the company
					for any reason prior to December 30th, then the remaining holidays will be prorated
					by the number of months worked in that year. (i.e. Prorated Unused Days Remaining
					= Unused Days Remaining x Number of months work in that year / 12 months).</li>
			</ol>
		</Details>
	</Card>
</Container>




<Dialog bind:open={popups.modal} >
	<div slot="header" class="is-center modal-header">Time Entry</div>

    <div class='modal-content'>

			<!-- <form on:submit|preventDefault={e=>closePopup('save')}>
				<ListInput name='date'   label="Date"   type="date"   bind:value={entry.date}    />
				<ListInput name='start'  label="Start"  type="time"   bind:value={entry.start}   />
				<ListInput name='finish' label="Finish" type="time"   bind:value={entry.finish}  />
				<ListInput name='breaks' label="Breaks (hours)" type="number" bind:value={entry.breaks} inputmode='numeric'/>
				<ListInput name='type'   label="Type"   type="select" bind:value={entry.type} options={$work_types} />
				<ListInput name='remark' label="Remarks" type="text"  bind:value={entry.remark} >
				</ListInput>
			</form> -->
		<!-- {#each items as item}
			<ListInput label={item.label} name={item.name} value={user[item.name] ?? item.def} type={item.type ?? 'text'} options={item.options}
			on:change={onChange}
			/>
		{/each} -->
	</div>

	<div slot="footer" class="is-right px-10 py-5 border-t-2">
		<Button fill error on:click={e=>closePopup('delete')}>Delete</Button>
		<Button fill primary type='submit' on:click={e=>closePopup('save')}>Save</Button>
		<Button secondary icon={mdiClose} on:click={e=>closePopup()}>Cancel</Button>
	</div>
</Dialog>
	<!-- <EditForm fields={fields} defaults={item} doSubmit={doSubmit} doDelete={doDelete} doCancel={onClose}/> -->



<style>
	ol {list-style:auto;}
	li {margin: 12px 20px; line-height: 1.2; }
</style>
