<script>
	import {Nav,Card, Container, Icon, Field, Input,Button, Modal} from 'svelte-chota';
	import {Row,Col} from 'svelte-chota';
	export let totals={}
</script>

 <Card class='print'>
	<Row> <Col>Total work hours:</Col> <Col>{totals.hours}</Col> <Col/> </Row>
	<Row> <Col>Total work days:</Col> <Col>{totals.days}</Col> <Col/> </Row>
</Card>
