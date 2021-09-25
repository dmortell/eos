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
	import {Nav,Card, Container, Icon, Field, Input,Button, Tag} from 'svelte-chota';
	import {mdiHome,mdiMagnify, mdiDelete,mdiAccountPlus,mdiSend, mdiChevronDown } from '@mdi/js'
	import {loading, users, session, times, sheets, holidays, cleanup, monthTotal, alert} from '$js/stores'
	import {parseEntry, optional, plural, format, calcHours, mins, toInt, toHours} from "$js/formatter";
	export let open = false;

	// v0.5.1
	let month = new Date().toISOString().substr(0,7);	//"2021-08"
	var days = []
	// var totals = {}										// total hrs, a,b,c,d for this month
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
	// todo update staff - test if editing standard times updates the user summary
	// todo fix deletes
	// todo add total days
	// todo adding an entry in a new month doesnt update sheets list
}

function connectUser(newuser){
	user = _users.find(u => u.email==newuser.email) ?? {}
	if (user?.uid){
		cons.sheets = sheets.reconnect(cons.sheets,
			sheets.collection().where("uid","==",user.uid),		//.orderBy("month", "desc"),
			onSheetsUpdate
		)
		cons.times  = times.reconnect(cons.times,
			times.collection().where("uid","==",user.uid),		//.orderBy("date", "asc"),
			onTimesUpdate
		)
	}
	else {			// todo disconnect sheets&times to avoid uid errors
		console.error('connectUser.invalid uid', user);
		_sheets = []
		_alltimes = []
		filldays(_alltimes, false)							// dont revalidate sheet totals if no user
	}
}
function onSheetsUpdate(snap){
	_sheets = snap.docs.filter(d=>{ return true })
	.map(d => { return {...d.data(), id:d.id} })
	.sort((a,b)=>a.month > b.month ? -1 : 1)
	selectSheet()
}
function selectSheet(){
	var defaults = {uid:user.uid, month, status:"pending", client:user.client}
	sheet = _sheets.find(d => d.month==month) ?? defaults
	// console.log('sheetsUpdate', sheet )
}
function onTimesUpdate(snap){
	_alltimes = snap.docs.filter(d=>{ return true })
		.map(d => { return {...d.data(), id:d.id } })
	console.log('timesUpdate', _alltimes)
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
	var [y,m] = month.split('-').map(v=>+v)
	var monthdays = new Date(y, m, 0).getDate()			// number of days in the month
	var keys = ['a','b','c','d','total','days','less']
	// totals = {a:0, b:0, c:0, d:0, total:0, days:0, less:0, month}

	selectSheet()
	days = []
	for (var d=1; d<=monthdays; d++){					// list of days in the month
		var date = month + '-' + (d+'').padStart(2,'0')
		var entry = times.find(e => e.date===date) ?? {date}
		var data = parseEntry(entry, $holidays)
		data.less = data.days ? Math.max(0,standard - data.hours) : 0
		days.push(data)
		// keys.map(k => totals[k] += data[k] ?? 0) 		// calculate totals
	}
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
	<Card>
		<h2>Menu</h2>
		<Button dropdown="My Profile" autoclose outline iconRight={mdiChevronDown}>
			<p><a href="#!">Edit</a></p>
			<p><a href="#!">Alerts</a>&nbsp;<Tag>3</Tag></p>
			<hr>
			<p><a href="#!" class="text-error">Logout</a></p>
		</Button>
	</Card>
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
		<UserSheets _sheets={_sheets} _times={_alltimes} on:select={selectMonth}/>
	</div>
	<!-- <Timesheet {user} {month} {days} totals={monthTotal($times, sheet.month)} {sheet} on:select={selectMonth} /> -->
	<Timesheet {user} {month} {days} {sheet} _times={_alltimes} on:select={selectMonth} />

</Container>

<Alert/>


<style lang="postcss">

:global(.nav){
    /* pointer-events: none;
    z-index: 0; */
    /* transition-property: transform; */
	background-color: #f7f7f8;
	box-shadow: 0 2px 4px 0 rgba(0,0,0,.2);
	margin: 0 0 8px 0;
}
</style>