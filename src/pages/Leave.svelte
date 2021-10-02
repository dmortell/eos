<script>
	import {onMount, tick} from 'svelte'
	import {Dialog, ListItem, ListInput} from '$lib'
	import {Nav,Card, Container, Details, Row, Col, Icon, Field, Input,Button, Tag} from 'svelte-chota';
	import {leave_types, leave, alert} from '$js/stores';
	import {mdiClose } from '@mdi/js'
	import {capitalize, optional} from "$js/formatter";
	export let user, _leave, times
	let today = new Date().toISOString().substr(0,10);	//"2021-08-20"
	let popups = {modal:false}
	let entry = {}
	$: rows = processEntries(_leave, times, user)
	$: console.log('rows',rows)

	// todo enable approvals
	// todo add notifications on approvals

	const fields = [
		{name: 'id', 				type: 'hidden'},		// {name: 'username', 	type: 'hidden'},
		{name: 'uid', 	type: 'hidden'},
		{name: 'submitted', type: 'hidden'},
		{name: 'status', 		type: 'hidden'},
		{name: 'starting', 	type: 'date', 	rules: 'required',autoFocus: true,},
		{name: 'ending', 		type: 'date', 	rules: 'required'},
		{name: 'days', 			type: 'number',	rules: 'minvalue=1,maxvalue=365'},
		{name: 'type', 			type: 'select',	modifier: 'material',options: $leave_types},
		{name: 'reason'},		// todo change type to radio buttons
		// {name: 'cover'},
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

	function processEntries(leave, times, user){
		const d = new Date()
		const year = new Intl.DateTimeFormat('en', { year: 'numeric' }).format(d)
		const totals = {remaining:0}
		if (!times) return []

		times.map(item =>{		// calculate total comp days and used vacations for the year summary
			if (item.type){
				var type = item.type, inc = -1;
				// if (type=='weekend'){ type = 'compensation_days'; inc = 1; }
				totals[type] = (totals[type] ?? 0) + (item.days ?? 1);
				totals.remaining += item.days ?? inc;
				console.log(type, inc, totals)
			}
		})
		summary.map((item, idx)=>{		//update summary with totals
			summary[idx].value = null;
			switch(item.name){
				case 'name': summary[idx].value = `${user.displayName} ${user.username ?? ''}`; break;
				case 'year': summary[idx].value = year; break;
				default: 		 summary[idx].value = totals[item.name]; break;
			}
		})
		// console.log({year,times,fields,entry})
		if (leave) return leave.filter(item=> item.status=='pending')
		return []
	}


	function onChange({target}){
		const {name, value} = target
		console.log(name, value)
		entry[name] = value
	}

	function selectEntry(item={}){
		popups.modal = true;
		entry = {
			uid: user.uid,
			days: 1,
			starting: today,
			ending: today,
			type:'paid_leave',
			submitted: today,
			status:'pending',
			reason:'',
			...item
		}
		fields.map((field,idx)=>{
			const name = field.name
			// let def = 1
			// if (name=="uid") fields[idx].value = user.uid
			// // if (name=="days") fields[idx].value = 1
			// if (name=="days") def = 1
			// if (name=="starting") fields[idx].value = today
			// if (name=="ending") fields[idx].value = today
			// fields[idx].value = item[field.name] ?? fields[idx].value
			fields[idx].label = capitalize(field.name)
		})
		// var {uid, start, finish, breaks} = user
		// var defaults = {uid, start, finish, breaks}
		// entry = {...defaults, ...row}			// nullish coalescing to avoid changing 0 to 1 for breaks
		// editing = true
		// console.log('opentimeentry', {defaults, row, entry, user})
	}
	function updateLeave(){

		// const doSubmit = data => {		// todo: validate data
		// 	ajax('edit.$name',data).then( data=>{
		// 		socket.emit('get.$name')
		// 		if (onClose) onClose()
		// 	})
		// }

		// var {date,start,finish,breaks,remark='',type} = entry
		// var data = {date,start,finish,breaks,remark,type, uid:user.uid}
		// console.log('saving',entry)
		leave.update(entry, entry.id, item=>console.log('saved',entry))
		// editing = false
		// $alert = "entry updated"
	}
	function deleteLeave(){
		// 	ons.notification.confirm('Are you sure you want to delete this item?')
		// .then((response) => { if (response===1){

		if (entry.id) leave.collection().doc(entry.id).delete().then(item=>{
			// console.log('deleted',entry,item, $times)
			$alert = "Entry deleted"
		})
	}
	function closePopup(action){
		if (action=='save') updateLeave()
		if (action=='delete') deleteLeave()
		popups.modal = false
	}

</script>

<Container>

	<!-- <ListTitle>Leave Requests</ListTitle> -->
	<!-- <Card> -->
		<!-- <h2>Leave Requests</h2> -->

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

		<ListItem>
			<Button outline primary type='button' on:click={e=>selectEntry({})}>Add Request</Button>
		</ListItem>

		{#each rows as row (row.id)}
			<!-- <ListItem key={row.id} tappable onClick={e=>selectEntry(row)} modifier='chevron'> -->
				<!-- <ListItem link on:click={e=>selectEntry(time)}> -->
			<ListItem on:click={e=>selectEntry(row)} link>
				<!-- <div class='left'><span class='list-item__icon' style={{fontSize: 14}}>{row.days} days</span></div> -->
				<!-- <div class='center'> -->
					<!-- <span class='list-item__title'>{capitalize(row.type.replace('_',' '))} {row.reason}</span> -->
					<!-- <span class='list-item__subtitle'>{row.starting} - {row.ending}</span> -->
				<!-- </div> -->
				<!-- <div class='right'>{row.status}</div> -->
				<div slot='left' class='days'>{optional(row.days,'','day')}</div>
				{row.starting} - {row.ending}
				<div slot='footer'>{capitalize(row.type.replace('_',' '))} {row.reason}</div>
				<div slot='right'>{row.status}</div>
		</ListItem>
		{/each}
	<!-- </Card> -->

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
	<div slot="header" class="is-center modal-header">Leave Request</div>
    <div class='modal-content'>
		{#each fields as item}
		{#if item.type!='hidden'}
			<ListInput label={item.label} name={item.name} value={entry[item.name]}
				type={item.type ?? 'text'} options={item.options} on:change={onChange} />
		{/if}
		{/each}
	</div>

	<div slot="footer" class="is-right px-10 py-5 border-t-2">
		<Button fill error on:click={e=>closePopup('delete')}>Delete</Button>
		<Button fill primary type='submit' on:click={e=>closePopup('save')}>Save</Button>
		<Button secondary icon={mdiClose} on:click={e=>closePopup()}>Cancel</Button>
	</div>
</Dialog>


<style>
	ol {list-style:auto;}
	li {margin: 12px 20px; line-height: 1.2; }
	.days {min-width:5rem;}
</style>
