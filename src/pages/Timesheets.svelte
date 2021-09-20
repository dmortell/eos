<script>
	// import Page from '$lib/Page.svelte'
	// import Block from '$lib/Block.svelte'
	import Hamburger from '$lib/Hamburger.svelte'
	import SidePanel from '$lib/SidePanel.svelte'
	import UserList from '$lib/UserList.svelte'
	import UserDetails from '$lib/UserDetails.svelte'
	import Alert from "$lib/Alert.svelte"
	import {Nav,Card, Container, Icon, Field, Input,Button} from 'svelte-chota';
	import {mdiHome,mdiMagnify, mdiDelete,mdiAccountPlus,mdiSend } from '@mdi/js'
	import {loading, users, session, times, sheets, cleanup, alert} from '$js/stores'
	export let open = false;

	// v0.5.1
	let month = new Date().toISOString().substr(0,7);	//"2021-08"
	var days = []
	var totals											// total hrs, a,b,c,d for this month
	var popups = {entry:false}							// popup open/closed flags
	var user = {}										// currently selected user (admins can select other users)
	var sheet = {}										// timesheet details for currently selected month
	var entry={}										// currently editing time entry
	let findStaff = ''									// searchbar input

	let _alltimes = []									// realtime snapshot of all of this users time entries
	var _times = []										// time entries for this month
	var _sheets = []									// all of the selected users timesheets (realtime snapshot)
	var _users = []										// all users (realtime snapshot)
	var cons = {}										// firebase snapshot connection ids for reconnecting and cleanup

	$: console.log($session)

	// let month = new Date().toISOString().substr(0,7);	//"2021-08"
	// let cons = {}
	// let _users = []
	cons.users  = users.connect(users.collection().orderBy("email", "asc"), onUsersUpdate)

	function onUsersUpdate(snap){
		_users = snap.docs.filter(q=>{ return q.data().displayName>'' || q.data().handle=='newuser1' })		// todo remove newuser1 after testing
		.map(d => { return {id:d.id, displayName:d.data().name, ...d.data()} })

		// todo update staff - test if editing standard times updates the user summary
		// todo fix deletes
		// todo add total days
		// todo adding an entry in a new month doesnt update sheets list
		user = _users.find(u => u)
	}
	function selectUser({detail}){
		$alert="clicked";
		console.log('clicked22', detail)
		user = detail.detail
	}

</script>


<Nav>
	<div slot="left" class="is-center ml-5">
		<Icon src={mdiHome} size="1.5" class="is-left"/>
		Timesheets
	</div>
	<Hamburger slot="right" tag="a" bind:open={open}/>
	<!-- <a slot="left" class="active" href="/"><Icon src={mdiHome} size="1.5" />Link 1</a> -->
    <!-- <a slot="center" href="/" class="brand">LOGO</a> -->
</Nav>

<Field gapless>
    <Input placeholder="Search users"/>
    <Button icon={mdiMagnify} primary/>
</Field>

<SidePanel bind:visible={open} left>
	<h2>Side panel</h2>
	<p>text goes here</p>
</SidePanel>

<Container>
	<!-- <ListItem>
		<Button>Enter daily times</Button>
		<Button>View month details</Button>
		<Button>View timesheets</Button>
		<Button>Edit settings</Button>
	</ListItem> -->

	<h1>
		Welcome {$session.user.displayName}
	</h1>

	<UserList on:click={selectUser} />
	<UserDetails {user}/>

</Container>

<Alert/>

<!--
<TimeSheet/> -->


<!-- <Container>
	<Card class="text-center" style="height:100px; width:100px" title="Hello!!" >
		<h1 class="primary">Hey!</h1>
	</Card>
</Container> -->

<!-- <label for="test">Test</label>
<input name="test" id="test"/> -->

<!-- <Icon src={mdiAccountPlus} color="green" size="3" /> -->

<!-- <button>stop</button>
<Button primary icon={mdiAccountPlus}>Add User</Button>
<Button outline primary iconRight={mdiSend}>Submit</Button> -->

<!-- <Page>
	<Navbar slot='fixed'>

	</Navbar>

	<Block>
		<h1>Timesheets</h1>
		<p>the sheets go here</p>
	</Block>
</Page> -->


<style lang="postcss">
  h1 {
    @apply text-5xl font-semibold;
  }

:global(.nav){
    /* pointer-events: none;
    z-index: 0; */
    /* transition-property: transform; */
	background-color: #f7f7f8;
	box-shadow: 0 2px 4px 0 rgba(0,0,0,.2);
	margin: 0 0 8px 0;
}
</style>