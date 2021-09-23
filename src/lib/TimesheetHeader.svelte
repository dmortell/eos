<script>
	import {Nav,Card, Container, Icon, Field, Input,Button} from 'svelte-chota';
	import Row from "$lib/Row.svelte"
	import Col from "$lib/Col.svelte"
	import {mdiHeart,mdiRepeat, mdiReply, mdiPencil, mdiContentSave, mdiCancel, mdiClose} from '@mdi/js'
	import {sheets, times, cleanup, holidays, settings} from '$js/stores'
	import {parseEntry, optional, plural, format, calcHours} from "$js/formatter";

	export let user, month, footer, totals
	$: console.log(settings)
</script>

 <Card>
	{#if footer}
		<Row><Col>Total work hours:</Col><Col class='left'>{totals.total}</Col><Col class='right'>Client Reviewed:</Col><Col>___</Col></Row>
		<Row><Col>Total work days:</Col><Col class='left'>{totals.days}</Col><Col class='right'>Date:</Col><Col>___</Col></Row>
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

		<div class='printonly'>
			<h4>TIME SHEET</h4>
			<Row><Col>Client:</Col><Col class='left'>Client Name <Icon src={mdiPencil} class="icon xnoprint"/></Col><Col/></Row>
			<Row><Col>Month:</Col><Col class='left'>{format(month,'longmonth-year')}</Col><Col/></Row>
		</div>
		<Row><Col>Name:</Col><Col class='left'>{user.displayName}</Col><Col/></Row>
		<!-- <Row><Col>Status:</Col><Col>{timesheet.status} <div class='right'><Button>Submit!</Button></div></Col><Col/></Row> -->
		<!-- <Row><Col>Total:</Col><Col>{timesheet.total} hrs</Col><Col/></Row> -->
	{/if}
</Card>