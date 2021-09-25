<script>
	import {Nav,Card, Container, Icon, Field, Input,Button, Modal} from 'svelte-chota';
	import Row from "$lib/Row.svelte"
	import Col from "$lib/Col.svelte"
	import ListInput from "$lib/ListInput.svelte"
	import {mdiHeart,mdiRepeat, mdiReply, mdiPencil, mdiContentSave, mdiCancel, mdiClose} from '@mdi/js'
	import {mdiChevronRight, mdiChevronLeft } from '@mdi/js'
	import {alert, sheets, times, cleanup, holidays, settings, clients, monthTotal} from '$js/stores'
	import {parseEntry, optional, plural, format, calcHours} from "$js/formatter";
	import { createEventDispatcher } from 'svelte';
	const dispatch = createEventDispatcher();
	export let user, month, footer=false, totals={}, sheet
	// export let user, month, footer=false, sheet
	// todo make header & footer responsive

	let modal_open = false
	// let totals = {}
	// $: totals = monthTotal($times, month)
	// $: console.log(totals)
	// $: {
	// 	totals = monthTotal($times, month)
	// 	console.log(totals)
	// }

	console.log("FIX client.onselect triggering twice ")

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
	function setStatus(status){
		// const next = nextStatus(status)
		// update: async (data,id=null,callback=(data,id)=>console.log('connectTable.updated',data,id)) => {
		sheets.update({status}, sheet.id, (data,id)=>{
			console.log('sheet updated', data,id)
			$alert = 'Timesheet set to ' + status
		})
		modal_open = false;

	}
	// function openModal(){
	// 	modal_open=true
	// 	console.log(modal_open)
	// }
	var editClient = false
	function clientName(code){
		// console.log('header.clientName', code, sheet)
		return $clients.find(d=>d.type == code)?.name ?? ''
	}
	function selectClient(){
		console.log('client selected', sheet.client)
		// todo update client in timesheet table
		// sheets.update({status}, sheet.id, (data,id)=>{
		// 	console.log('sheet updated', data,id)
		// 	$alert = 'Timesheet set to ' + status
		// })
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

</script>

 <Card>
	{#if footer}
		<div class='flex flex-wrap items-center'>
			<!-- <div class="w-24 px-4 max-w-full flex-grow flex-1"></div> -->
			<div class='w-24 max-w-full flex-grow flex-1'>Total work hours:</div>
			<div class='flex-grow flex-1 '>{totals.hours}</div>
			<!-- <Col class='flex-grow flex-1 print right'>Client Reviewed:</Col><Col class='print'>___________</Col> -->
		</div>
		<div class='flex flex-wrap items-center'>
			<!-- <div class="w-24 px-4 max-w-full flex-grow flex-1"></div> -->
			<div class='w-24 max-w-full flex-grow flex-1'>Total work days:</div>
			<div class='flex-grow flex-1 '>{totals.days}</div>
			<!-- <Col class='flex-grow flex-1 print right'>Client Reviewed:</Col><Col class='print'>___________</Col> -->
		</div>
		<!-- <Row>
			<Col>Total work days:</Col><Col class='left'>{totals.days}</Col>
			<Col class='right print'>Date:</Col><Col class='print'>___________</Col>
		</Row> -->
	{:else}
		<Row class='printonly' style={{padding:'4px',borderBottom:'2px solid black'}}>
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

		<hr class='printonly'/>

		<div>
			<h4 class='printonly'>TIME SHEET</h4>
			<!-- <Row>
				<Col>Client:</Col>
				<Col class='left'>{clientName(sheet.client)} <Icon src={mdiPencil} class="icon noprint" on:click={toggleClient} /></Col>
				<Col/>
			</Row> -->
			<!-- <Icon src={mdiPencil} class="icon noprint" on:click={toggleClient} /> -->

			<Row class='print flex'>
				<Col class='inline-block'>Client:</Col>
				<Col class='left inline-block'>{clientName(sheet.client ?? user.client)}</Col>
				<Col class='inline'/>
			</Row>
			<Row class='noprint flex'>
				<Col class='inline '>Client:</Col>
				<Col class='inline left'>
					<ListInput name='client' bind:value={sheet.client} type='select' options={$clients} on:change={selectClient}/>
				</Col>
				<Col class='inline'/>
			</Row>
			<Row class='print flex'>
				<Col class='inline'>Month:</Col>
				<Col class='inline'>{format(month,'longmonth-year')}</Col>
				<Col class='inline'/>
			</Row>
			<Row class='noprint'>
				<Col>Month:</Col><Col class='left'>
				<div class="flex">
					<!-- <Button onClick={decMonth}><i class="f7-icons">arrow_left</i></Button> -->
					<!-- <Button onClick={incMonth}><i class="f7-icons">arrow_right</i></Button> -->
					<Icon src={mdiChevronLeft} class="icon noprint flex-none w-12" on:click={decMonth}/>
					<!-- <Input type="month" bind:value={month} inputStyle="max-width:180px" /> -->
					<!-- <Input type="month" bind:value={month} class="noprint" /> -->
					<div class="flex-none w-52 mx-auto">{format(month,'longmonth-year')}</div>
					<Icon src={mdiChevronRight} class="icon noprint flex-none w-12" on:click={incMonth}/>
				</div>
				</Col><Col/>
			</Row>
		</div>
		<div class='flex xxflex-wrap items-center'>
			<div class='w-52 xxmax-w-full xxflex-grow flex-initial'>Name:</div>
			<div class='flex-grow flex-1 '>{user.displayName}</div>
		</div>
		<!-- <Row class='xxxprintonly flex flex-wrap items-center'>
			<Col class='w-24 max-w-full flex-grow flex-1'>Name2:</Col>
			<Col class='left flex-grow flex-1'>{user.displayName}</Col>
			<Col/>
		</Row> -->
		<!-- <Row><Col>Status:</Col><Col>{timesheet.status} <div class='right'><Button>Submit!</Button></div></Col><Col/></Row> -->
		<!-- <Row><Col>Total:</Col><Col>{timesheet.total} hrs</Col><Col/></Row> -->
		<div class='flex flex-wrap items-center'>
			<!-- <div class="w-24 px-4 max-w-full flex-grow flex-1"></div> -->
			<div class='w-52 xxmax-w-full xxflex-grow flex-initial'>Total work hours:</div>
			<div class='flex-grow flex-1 '>{totals.total}</div>
			<!-- <Col class='flex-grow flex-1 print right'>Client Reviewed:</Col><Col class='print'>___________</Col> -->
		</div>
		<div class='flex flex-wrap items-center'>
			<!-- <div class="w-24 px-4 max-w-full flex-grow flex-1"></div> -->
			<div class='w-52 xxmax-w-full xxflex-grow flex-initial'>Total work days:</div>
			<div class='flex-grow flex-1 '>{totals.days}</div>
			<!-- <Col class='flex-grow flex-1 print right'>Client Reviewed:</Col><Col class='print'>___________</Col> -->
		</div>

		<div class='noprint flex xxflex-wrap items-center'>
			<!-- <div class='w-52 xxmax-w-full xxflex-grow flex-initial'>Status:</div> -->
			<div class='inline-blockxx w-52 flex-initial'>Status:</div>
			<div class='flex-grow flex-1 '>{sheet.status}</div>
			<!-- <div class='flex-grow flex-1 '><Button outline class='small' on:click={e=>setStatus(sheet.status)}>{nextStatus(sheet.status).name}</Button></div> -->
			<div class='flex-grow flex-1 '><Button outline class='small' on:click={e=>modal_open=true}>{nextStatus(sheet.status).name}</Button></div>
			<!-- <div class='flex-grow flex-1 '><Button outline class='small' on:click={openModal}>{nextStatus(sheet.status).name}</Button></div> -->
			<!-- <div class='flex-grow flex-1 '>{sheet.status}</div> -->
			<!-- <ListInput name='status'  bind:value={sheet.status} type='select' options={statuses} on:change={selectClient} inlineLabel/> -->

		</div>

		<!-- <Button on:click={modal_show}>Show modal</Button> -->
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

	{/if}
</Card>

<style>
	.notify { padding: 2em 0;}
</style>