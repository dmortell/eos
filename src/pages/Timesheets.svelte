<script>
	import Page from '$lib/Page.svelte'
	import Block from '$lib/Block.svelte'
	// import Navbar from 'src/unused/Navbar.svelte'
	import Hamburger from '$lib/Hamburger.svelte'
	import SidePanel from '$lib/SidePanel.svelte'
	import {Nav,Card, Container, Icon, Input,Button} from 'svelte-chota';
	import {mdiHome, mdiDelete,mdiAccountPlus,mdiSend } from '@mdi/js'

	export let open = false;
	export let slot
</script>


<Nav>
	<a slot="left" class="active" href="/"><Icon src={mdiHome} size="1.5" />Link 1</a>
    <a slot="center" href="/" class="brand">LOGO</a>
	<Hamburger slot="right" tag="a" bind:open={open}/>
</Nav>

<SidePanel bind:visible={open} left>
	<h2>Side panel</h2>
	<p>text goes here</p>
</SidePanel>
<!-- 
<UserList/>
<UserDetails/>
<TimeSheet/> -->


<Container>
	<Card class="text-center" style="height:100px; width:100px" title="Hello!!" >
		<h1 class="primary">Hey!</h1>
	</Card>
</Container>

<label for="test">Test</label>
<input name="test" id="test"/>

<Icon src={mdiAccountPlus} color="green" size="3" />

<button>stop</button>
<Button primary icon={mdiAccountPlus}>Add User</Button>
<Button outline primary iconRight={mdiSend}>Submit</Button>

<!-- <Page>
	<Navbar slot='fixed'>

	</Navbar>

	<Block>
		<h1>Timesheets</h1>
		<p>the sheets go here</p>
	</Block>
</Page> -->

<style>


:global(.nav){
    /* pointer-events: none;
    z-index: 0; */
    /* transition-property: transform; */
	background-color: #f7f7f8;
	box-shadow: 0 2px 4px 0 rgba(0,0,0,.2);
	margin: 0 0 8px 0;
}
</style>