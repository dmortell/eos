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

	let modal_open = false

	const statuses = [			// todo make clients realtime firebase
		{type:'pending',		name:'Draft'},
		{type:'published',	name:'Submitted'},
		{type:'approved',		name:'Approved'},
	]
	function nextStatus(status){
		if (status=='pending') 		return {type:'published', name:'Publish'}
		if (status=='published')	return {type:'approved', name:'Approve'}
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
		updateSheet({client:sheet.client}, (data,id)=>{ $alert='Client updated'})
	}

	function decMonth(){incMonth(0,-1)}
	function incMonth(e,inc = 1){
		var [y,m] = month.split('-').map(v=>+v)
		m += inc
		if (m<1) y--, m=12
		if (m>12) y++, m=1
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
			<Field gapless class='md:ml-28 max-w-md'>
				<Button outline icon={mdiChevronLeft} on:click={decMonth}/>
				<Input type="month" value={month} on:change={selectMonth} />
				<Button outline icon={mdiChevronRight} on:click={incMonth}/>
			</Field>

			<dl class="items-center"><dt>Client:</dt>
				<dd>
					<div class='client'>
						<Field gapless>
							<ListInput name='client' bind:value={sheet.client} type='select' options={$clients} on:blur={selectClient}/>
							<Button outline icon={mdiPencil} on:click={incMonth}/>
						</Field>
					</div>
				</dd>
			</dl>
			<p>Change client to autoselect</p>
			<dl><dt>Name:</dt>							<dd>{user.displayName}</dd>	</dl>
			<dl><dt>Work days:</dt>		<dd>{totals.days}</dd>	</dl>
			<dl><dt>Work hours:</dt>	<dd>{totals.hours}</dd>	</dl>
			<dl><dt>Status:</dt>						<dd>{sheet.status} <Button outline primary class='small ml-8' on:click={e=>modal_open=true}>{nextStatus(sheet.status).name}</Button></dd>	</dl>
		</div>

		<!-- Popup -->
		<Modal bind:open={modal_open}>
			<Card>
				<h4 slot="header">Update Timesheet Status</h4>
				<p class='my-16'>Are you sure you want to {nextStatus(sheet.status).name} this timesheet?</p>
				<div slot="footer" class="is-right">
					<Button clear on:click={e=>modal_open=false}>Cancel</Button>
					<Button primary on:click={e=>setStatus(nextStatus(sheet.status).type)}>Confirm</Button>
				</div>
			</Card>
		</Modal>

</Card>

<style>
	dl { width:100%; margin: 6px 0; align-items: center; }
	dt { width: 7em;  display: inline-block; }
	dd { width: auto; display: inline-block;}
	.client { max-width: 18rem; }
</style>