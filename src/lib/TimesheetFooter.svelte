<script>
	import {Nav,Card, Container, Icon, Field, Input,Button, Modal} from 'svelte-chota';
	import {Row,Col} from 'svelte-chota';
	export let totals={}
</script>

 <Card class='print'>
	<Row>
		<Col>Total work hours:</Col> <Col>{totals.hours}</Col>
		<Col class='right'>Client reviewed:</Col> <Col><div class='line'>&nbsp;</div></Col>
	</Row>
	<Row>
		<Col>Total work days:</Col> <Col>{totals.days}</Col>
		<Col class='right'>Date:</Col> <Col><div class='line'>&nbsp;</div></Col>
	</Row>
</Card>

<style>
	.line { width:100%; min-width: 180px; border-bottom: 1px solid black; }
</style>
