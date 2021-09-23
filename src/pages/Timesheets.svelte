<script>
	import {onMount, tick} from 'svelte'
	// import Page from '$lib/Page.svelte'
	// import Block from '$lib/Block.svelte'
	import Hamburger from '$lib/Hamburger.svelte'
	import SidePanel from '$lib/SidePanel.svelte'
	import UserList from '$lib/UserList.svelte'
	import UserDetails from '$lib/UserDetails.svelte'
	import UserSheets from '$lib/UserSheets.svelte'
	import Timesheet from '$lib/Timesheet.svelte'
	import Alert from "$lib/Alert.svelte"
	import {Nav,Card, Container, Icon, Field, Input,Button} from 'svelte-chota';
	import {mdiHome,mdiMagnify, mdiDelete,mdiAccountPlus,mdiSend } from '@mdi/js'
	import {loading, users, session, times, sheets, holidays, cleanup, alert} from '$js/stores'
	import {parseEntry, optional, plural, format, calcHours, mins, toInt, toHours} from "$js/formatter";
	export let open = false;

	// v0.5.1
	let month = new Date().toISOString().substr(0,7);	//"2021-08"
	var days = []
	var totals = {}										// total hrs, a,b,c,d for this month
	var popups = {entry:false}							// popup open/closed flags
	var user = $session.user							// currently selected user (admins can select other users)
	var sheet = {}										// timesheet details for currently selected month
	var entry={}										// currently editing time entry
	let findStaff = ''									// searchbar input

	let _alltimes = []									// realtime snapshot of all of this users time entries
	var _times = []										// time entries for this month
	var _sheets = []									// all of the selected users timesheets (realtime snapshot)
	var _users = []										// all users (realtime snapshot)
	var cons = {}										// firebase snapshot connection ids for reconnecting and cleanup

	$: console.log('session',$session)


onMount(() => {
	cons.users  = users.reconnect(cons.users,			// only required by editors
		users.collection().orderBy("email", "asc"),		// todo where('uid','==',user.uid)  if role!=editor
		onUsersUpdate
	)
	return ()=>{ cleanup() }		// todo redo cleanup
})

function onUsersUpdate(snap){
	_users = snap.docs.filter(q=>{ return q.data().displayName>''})
			.map(d => { return {...d.data(), id:d.id} })
	connectUser(user)
	// console.log('user set on snapshot',user.email, user.displayName)
	// todo id must be unique
	// todo update staff - test if editing standard times updates the user summary
	// todo fix deletes
	// todo add total days
	// todo adding an entry in a new month doesnt update sheets list
}

function connectUser(newuser){
	// console.log('connectUser', newuser);
	user = _users.find(u => u.email==newuser.email) ?? {}
	if (user?.uid){
		cons.sheets = sheets.reconnect(cons.sheets,
			sheets.collection().where("uid","==",user.uid).orderBy("date", "desc"),
			onSheetsUpdate
		)
		cons.times  = times.reconnect(cons.times,
			times.collection().where("uid","==",user.uid).orderBy("date", "asc"),
			onTimesUpdate
		)
	}
	else {			// todo disconnect sheets&times to avoid uid errors
		console.error('connectUser.invalid uid', user);
		_sheets = []
		_alltimes = []
		filldays(_alltimes, false)
	}
}
	// function onSheetsUpdate(snap){
	// 	items = snap.docs.filter(d=>{ return true })				// todo filter out completed sheets. Ensure current month is shown
	// 		.map(d => { return {id:d.id, ...d.data()} })
	// 	// checkSheetTotals(month, totals)
	// 	console.log('usersheets',items)
	// }
function onSheetsUpdate(snap){
	_sheets = snap.docs.filter(d=>{ return true })					// todo filter out completed sheets. Ensure current month is shown
		.map(d => { return {...d.data(), id:d.id} })
}
function onTimesUpdate(snap){
	_alltimes = snap.docs.filter(q=>{ return true })
		.map(d => { return {id:d.id, ...d.data()} })
	filldays(_alltimes)
}

function selectMonth({detail}){
	month = detail.month
	filldays(_alltimes)
}
function selectUser({detail}){
	connectUser(detail.person)
}
function filldays(times, validate=true){
	var start = mins(user.start), end = mins(user.finish), less = toInt(user.breaks) * 60
	var standard = toHours(end-start-less)
	var keys = ['a','b','c','d','total','days','less']
	totals = {a:0, b:0, c:0, d:0, total:0, days:0, less:0, month}

	// _times = times.filter(d => d.date.substr(0,7)===month)

	var [y,m] = month.split('-').map(v=>+v)
	var monthdays = new Date(y, m, 0).getDate()			// number of days in the month
	var entries = []
	for (var d=1; d<=monthdays; d++){					// list of days in the month
		var date = month + '-' + (d+'').padStart(2,'0')
		var entry = times.find(e => e.date===date) ?? {date}
		var data = parseEntry(entry, $holidays)
		data.less = data.days ? Math.max(0,standard - data.total) : 0
		entries.push(data)
		keys.map(k => totals[k] += data[k] ?? 0) 		// calculate totals
	}
	// if (validate) checkSheetTotals(month, totals)	// check if sheet table needs updating
	days = entries
}
function checkSheetTotals(month, totals){				// todo update sheet table if totals changed
	// if (totals.month!==month || sheet?.month!==month) return;
	// var keys = ['a','b','c','d','total','days'], update = false
	// keys.map(k => {
	// 	if (totals[k]===0 && sheet[k]==undefined){}		// ignore zero entries if undefined
	// 	else if (totals[k] !== sheet[k]) update=true
	// })
	// if (update){
	// 	var status = sheet.status ?? "pending"
	// 	// var color = status == "pending" ? 'blue' : 'red';
	// 	sheets.update({uid:user.uid, month, status, ...totals}, sheet.id, e=>console.log('Updated sheet'))
	// }
}
</script>


<Nav class="noprint">
	<div slot="left" class="is-center ml-5">
		<Icon src={mdiHome} size="1.5" class="is-left"/>
		Timesheets
	</div>
	<Hamburger slot="right" tag="a" bind:open={open}/>
	<!-- <a slot="left" class="active" href="/"><Icon src={mdiHome} size="1.5" />Link 1</a> -->
    <!-- <a slot="center" href="/" class="brand">LOGO</a> -->
</Nav>


<SidePanel bind:visible={open} >
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


	<div class="noprint">
		<UserList {_users} on:click={selectUser} />
		<UserDetails {user}/>
		<UserSheets {user} sheets={_sheets} on:select={selectMonth}/>
	</div>
	<Timesheet {user} {month} {days} {totals} />

</Container>

<Alert/>

<!-- <TimeSheet/> -->


<!-- <Container>
	<Card class="text-center" style="height:100px; width:100px" title="Hello!!" >
		<h1 class="primary">Hey!</h1>
	</Card>
</Container> -->

<!-- <label for="test">Test</label>
<input name="test" id="test"/> -->

<!-- <Icon src={mdiAccountPlus} color="green" size="3" /> -->

<!-- <Button primary icon={mdiAccountPlus}>Add User</Button> -->
<!--
<Button outline primary iconRight={mdiSend}>Submit</Button> -->

<!-- <Page>
	<Navbar slot='fixed'>

	</Navbar>

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