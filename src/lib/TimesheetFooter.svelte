<script>
	import {Nav,Card, Container, Icon, Field, Input,Button, Modal} from 'svelte-chota';
	// import Row from "$lib/Row.svelte"
	// import Col from "$lib/Col.svelte"
	// import ListInput from "$lib/ListInput.svelte"
	// import {mdiHeart,mdiRepeat, mdiReply, mdiPencil, mdiContentSave, mdiCancel, mdiClose} from '@mdi/js'
	// import {mdiChevronRight, mdiChevronLeft } from '@mdi/js'
	// import {alert, sheets, times, cleanup, holidays, settings, clients, monthTotal} from '$js/stores'
	// import {parseEntry, optional, plural, format, calcHours} from "$js/formatter";
	export let totals={}
</script>

 <Card class='print'>
		<div class='flex flex-wrap items-center'>
			<div class='w-24 max-w-full flex-grow flex-1'>Total work hours:</div>
			<div class='flex-grow flex-1 '>{totals.hours}</div>
		</div>
		<div class='flex flex-wrap items-center'>
			<div class='w-24 max-w-full flex-grow flex-1'>Total work days:</div>
			<div class='flex-grow flex-1 '>{totals.days}</div>
		</div>
		<!-- <Row>
			<Col>Total work days:</Col><Col class='left'>{totals.days}</Col>
			<Col class='right print'>Date:</Col><Col class='print'>___________</Col>
		</Row> -->
</Card>
