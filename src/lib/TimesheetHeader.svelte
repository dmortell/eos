<script>
	import {Nav,Card, Container, Icon, Field, Input,Button, Modal} from 'svelte-chota';
	import {Row,Col} from 'svelte-chota';
	// import Row from "$lib/Row.svelte"
	// import Col from "$lib/Col.svelte"
	import ListInput from "$lib/ListInput.svelte"
	import {mdiHeart,mdiRepeat, mdiReply, mdiPencil, mdiContentSave, mdiCancel, mdiClose} from '@mdi/js'
	import {mdiChevronRight, mdiChevronLeft } from '@mdi/js'
	import {alert, sheets, times, cleanup, holidays, settings, clients, monthTotal} from '$js/stores'
	import {parseEntry, optional, plural, format, calcHours} from "$js/formatter";
	import { createEventDispatcher } from 'svelte';
	const dispatch = createEventDispatcher();
	export let user, month, totals={}, sheet
	// todo make header & footer responsive

	let modal_open = false

	const statuses = [			// todo make clients realtime firebase
		{type:'pending',		name:'Draft'},
		{type:'published',		name:'Submitted'},
		{type:'approved',		name:'Approved'},
	]
	function nextStatus(status){
		if (status=='pending') 			return {type:'published', name:'Publish'}
		else if (status=='published') 	return {type:'approved', name:'Approve'}
										return {type:'pending', name:'Revert'}
	}
	function updateSheet(data, callback = e=>e){
		const defaults = {month, uid:user.uid, client:user.client, ...data}
		sheets.update(defaults, sheet.id, callback)
	}
	function setStatus(status){
		modal_open = false;
		updateSheet({status}, (data,id)=>{
			console.log('sheet updated', data,id)
			$alert = 'Timesheet set to ' + status
		})
	}
	function clientName(code){
		return $clients.find(d=>d.type == code)?.name ?? ''
	}
	function selectClient(){
		updateSheet({client:sheet.client}, (data,id)=>{
			console.log('sheet updated', data,id)
		})
	}

	function decMonth(){incMonth(0,-1)}
	function incMonth(e,inc = 1){
		var [y,m] = month.split('-').map(v=>+v)
		m += inc
		if (m<1) y--, m=12
		if (m>12) y++, m=1
		console.log(y,m)
		month = y + '-' + (''+m).padStart(2,'0')
		dispatch('select',{month})
	}
	function selectMonth(e){
		month=e.target.value
		dispatch('select',{month})
	}
</script>

 <Card>
		<div class='printonly' >
			<Row style={{padding:'4px',borderBottom:'2px solid black'}}>
				<Col>
					<img src='./logo.gif' alt='logo'/>
				</Col>
				<Col>
					<div class='address'>
						<strong>{$settings.company}</strong><br/>
						{$settings.address}<br/>
						{optional($settings.tel,"Telephone: ")}	{#if $settings.tel}<br/>{/if}
						{optional($settings.fax,"Facsimile: ")}
					</div>
				</Col>
				<Col/>
			</Row>
			<hr/>
			<h4 class='printonly'>TIME SHEET</h4>
			<Row class='flex'>
				<Col class='inline-block'>Client:</Col>
				<Col class='left inline-block'>{clientName(sheet.client ?? user.client)}</Col>
				<Col class='inline'/>
			</Row>
			<Row class='flex'>
				<Col class='inline'>Month:</Col>
				<Col class='inline'>{format(month,'longmonth-year')}</Col>
				<Col class='inline'/>
			</Row>
			<Row>
				<Col>Name:</Col>
				<Col>{user.displayName}</Col>
				<Col/>
			</Row>
		</div>		<!-- print only -->


		<div class="noprint">
			<!-- <Icon src={mdiPencil} class="icon noprint" on:click={toggleClient} /> -->
			<Row>
				<Col class='inline '>Client:</Col>
				<Col class='inline left'>
					<ListInput name='client' bind:value={sheet.client} type='select' options={$clients} on:blur={selectClient}/>
				</Col>
				<Col/>
			</Row>
			<Row class="items-center">
				<Col>Month:</Col>
				<!-- <Col>
					<div class="flex items-center">
						<Icon src={mdiChevronLeft} class="icon flex-none w-12" on:click={decMonth}/>
						<Input type="month" value={month} on:change={selectMonth} />
						<Icon src={mdiChevronRight} class="icon flex-none w-12" on:click={incMonth}/>
					</div>
				</Col> -->
				<Col>
					<Field gapless>
						<Button outline icon={mdiChevronLeft} on:click={decMonth}/>
						<Input type="month" value={month} on:change={selectMonth} />
						<Button outline icon={mdiChevronRight} on:click={incMonth}/>
					</Field>
				</Col>
				<Col></Col>
			</Row>
			<Row> <span >Name:</span>				<p>{user.displayName}</p>	</Row>
			<Row> <Col>Name:</Col>				<Col>{user.displayName}</Col>	<Col/></Row>
			<!-- <Row> <Col>Total work hours:</Col>	<Col>{totals.hours}</Col> 	<Col/></Row> -->
			<!-- <Row> <Col>Total work days:</Col>	<Col>{totals.days}</Col> 	<Col/></Row> -->
			<div class='flex flex-wrap items-center'>
				<div class='w-24 max-w-full flex-grow flex-1'>Total work hours:</div>
				<div class='flex-grow flex-1 '>{totals.hours}</div>
			</div>
			<div class='flex flex-wrap items-center'>
				<div class='w-24 max-w-full flex-grow flex-1'>Total work days:</div>
				<div class='flex-grow flex-1 '>{totals.days}</div>
			</div>

			<Row>
				<Col>Status:</Col>
				<Col>{sheet.status}</Col>
				<Col><Button outline class='small' on:click={e=>modal_open=true}>{nextStatus(sheet.status).name}</Button></Col>
			</Row>
		</div>

		<Modal bind:open={modal_open}>
			<Card>
				<h4 slot="header">Update Timesheet Status</h4>
				<p class='notify'>Are you sure you want to {nextStatus(sheet.status).name} this timesheet?</p>
				<div slot="footer" class="is-right">
					<Button clear on:click={e=>modal_open=false}>Cancel</Button>
					<Button primary on:click={e=>setStatus(nextStatus(sheet.status).type)}>Confirm</Button>
				</div>
			</Card>
		</Modal>

</Card>

<style>
	.notify { padding: 2em 0;}
</style>