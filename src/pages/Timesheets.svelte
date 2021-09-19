<script>
	import Page from '$lib/Page.svelte'
	import Block from '$lib/Block.svelte'
	import Navbar from '$lib/Navbar.svelte'
	import Hamburger from '$lib/Hamburger.svelte'
	import {Nav,Card, Input,Button} from 'svelte-chota';
</script>

<Nav>
    <a slot="left" class="active" href="/">Link 1</a>
    <!-- <a slot="left" href="/">Link 2</a> -->

    <a slot="center" href="/" class="brand">LOGO</a>

    <a slot="right" href="/">Link 3</a>
    <!-- <a slot="right" href="/">Link 4</a> -->
</Nav>

<Card
    class="is-rounded text-center"
    style="height:100px; width:100px"
    title="Hello"
>
    <h1>Hey!</h1>
</Card>

<!-- <Page>
	<Navbar slot='fixed'>
		<Hamburger slot="right"/>
	</Navbar>

	<Block>
		<h1>Timesheets</h1>
		<p>the sheets go here</p>
	</Block>
</Page> -->

<style>

</style>