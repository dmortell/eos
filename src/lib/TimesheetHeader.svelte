<script>
	import {Card, Icon, Field, Input,Button, Modal} from 'svelte-chota';
	import {Row,Col} from 'svelte-chota';
	import Select from 'svelte-select';
	import ListInput from "$lib/ListInput.svelte"
	import {mdiPencil} from '@mdi/js'
	import {mdiChevronRight, mdiChevronLeft } from '@mdi/js'
	import {alert, sheets, settings, clients} from '$js/stores'
	import {optional, format} from "$js/formatter";
	import {createEventDispatcher } from 'svelte';
	const dispatch = createEventDispatcher();
	export let user, month, totals={}, sheet

	let modal_open = false
	$: client = sheet.client ?? 'eire'

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
		updateSheet({status}, (data,id)=>{ $alert = 'Timesheet set to ' + status })
	}
	function clientName(code){ return $clients.find(d=>d.type == code)?.name ?? '' }
	function selectClient(){ updateSheet({client}, (data,id)=>{ $alert='Client updated'}) }

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
			<h4>TIME SHEET</h4>
			<Row>
				<Col>Client:</Col>
				<Col>{clientName(sheet.client ?? user.client)}</Col>
				<Col/>
			</Row>
			<Row>
				<Col>Month:</Col>
				<Col>{format(month,'longmonth-year')}</Col>
				<Col/>
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
<!--
			<dl class="items-center"><dt>Client:</dt>
				<dd>
					<div class='client'>
						<Field gapless>
							<ListInput name='client' bind:value={client} type='select' options={$clients} on:blur={selectClient}/>
							<Button outline icon={mdiPencil} on:click={incMonth}/>
						</Field>
					</div>
				</dd>
			</dl> -->


			<dl class="items-center"><dt class='client-label'>Client:</dt>
				<dd class='client'>
					<!-- <div class='client'> -->
						<Select items={$clients} optionIdentifier='type' labelIdentifier='name' />
						<!-- <Select {optionIdentifier} {labelIdentifier} {items} /> -->
						<!-- <Field gapless>
							<ListInput name='client' bind:value={client} type='select' options={$clients} on:blur={selectClient}/>
							<Button outline icon={mdiPencil} on:click={incMonth}/>
						</Field> -->
						<!-- <select>
							<option>item 1 is a long item</option>
						</select> -->
					<!-- </div> -->
				</dd>
			</dl>

			<dl><dt>Name:</dt>							<dd>{user.displayName}</dd>	</dl>
			<dl><dt>Work days:</dt>		<dd>{totals.days}</dd>	</dl>
			<dl><dt>Work hours:</dt>	<dd>{totals.hours}</dd>	</dl>
			<dl><dt>Status:</dt>						<dd>{sheet.status} <Button outline primary class='small ml-8' on:click={e=>modal_open=true}>{nextStatus(sheet.status).name}</Button></dd>	</dl>
		</div>

		<!-- Popup -->
		<Modal bind:open={modal_open}>
			<Card>
				<h4 slot="header">Update Timesheet Status</h4>
				<!-- <p></p> -->
				<br/>
				<p >Are you sure you want to {nextStatus(sheet.status).name} this timesheet?</p>
				<br/>
				<div slot="footer" class="is-right">
					<Button clear on:click={e=>modal_open=false}>Cancel</Button>
					<Button primary on:click={e=>setStatus(nextStatus(sheet.status).type)}>Confirm</Button>
				</div>
			</Card>
		</Modal>

</Card>

<!--
.selectContainer.s-hVM-kgueVcUB input.s-hVM-kgueVcUB {
	cursor: default;
	border: none;
	color: var(--inputColor, #3f4f5f);
	height: var(--height, 42px);
	line-height: var(--height, 42px);
	padding: var(--inputPadding, var(--padding, var(--internalPadding)));
	width: 100%;
	background: transparent;
	font-size: var(--inputFontSize, 14px);
	letter-spacing: var(--inputLetterSpacing, -0.08px);
	position: absolute;
	left: var(--inputLeft, 0);
	margin: var(--inputMargin, 0);
}

.clearSelect.s-hVM-kgueVcUB.s-hVM-kgueVcUB {
    position: absolute;
    right: var(--clearSelectRight, 10px);
    top: var(--clearSelectTop, 11px);
    bottom: var(--clearSelectBottom, 11px);
    width: var(--clearSelectWidth, 20px);
    color: var(--clearSelectColor, #c5cacf);
    flex: none !important;
}


.selectContainer.s-hVM-kgueVcUB.s-hVM-kgueVcUB {
    --internalPadding: 0 16px;
    border: var(--border, 1px solid #d8dbdf);
    border-radius: var(--borderRadius, 3px);
    box-sizing: border-box;
    height: var(--height, 42px);
    position: relative;
    display: flex;
    align-items: center;
    padding: var(--padding, var(--internalPadding));
    background: var(--background, #fff);
    margin: var(--margin, 0);
}
-->

<style>
	dl { width:100%; margin: 6px 0; align-items: center; }
	dt { width: 7em;  display: inline-block; }
	dd { width: auto; display: inline-block;}
	.client { min-width: 10em; }
	/* .client-label { display:flex; } */
	.printonly .row .col { margin-bottom: 4px; }
</style>