<script>
	import {onMount, tick} from 'svelte'
	import SidePanel from '$lib/SidePanel.svelte'
	import UserList from '$lib/UserList.svelte'
	import UserDetails from '$lib/UserDetails.svelte'
	import UserSheets from '$lib/UserSheets.svelte'
	import Timesheet from '$lib/Timesheet.svelte'
	import {Alert, Avatar, ListItem, Hamburger} from '$lib'
	import {Nav,Card, Container, Icon, Field, Input,Button, Tag} from 'svelte-chota';
	import {Tabs, Tab} from 'svelte-chota';
	import {mdiHome,mdiMagnify, mdiDelete,mdiAccountPlus,mdiSend, mdiChevronDown } from '@mdi/js'
	import {loading, users, session, times, sheets, holidays, cleanup, monthTotal, alert} from '$js/stores'
	import {parseEntry, optional, plural, format, calcHours, mins, toInt, toHours} from "$js/formatter";

	// v0.5.1
	let month = new Date().toISOString().substr(0,7);	//"2021-08"
	var popups = {side:false}							// popup open/closed flags
	var user = $session.user							// currently selected user (admins can select other users)
	var sheet = {}										// timesheet details for currently selected month
	var active_tab = 0

	let _alltimes = []									// realtime snapshot of all of this users time entries
	var _sheets = []									// all of the selected users timesheets (realtime snapshot)
	var _users = []										// all users (realtime snapshot)
	var days = []
	var cons = {}										// firebase snapshot connection ids for reconnecting and cleanup

	// $: console.log('session',$session)
	// add/edit leave requests
	// expenses
	// fix header formatting
	// todo faster time entry
	// todo fix labels in user details & forms
	// checkin/out & breaks
	// link with calendar? scheduled tasks https://clockify.me/timesheet-app
	// copy/paste FROM Excel
	// secure firebase rules
	// todo slide thru dates/months
	// todo push to Vercel/github
	// todo checkbox select rows to set standard times to
	// todo export to Excel/PDF or Mail
	// todo send notifications when sheets published or approved
	// todo fix total time when working past midnight
	// test entering breaks of 30mins or 15mins
	// only auth users can view/edit other user sheets, and approve sheets
	// users cannot edit/see all their settings
	// add comp days & vactions remaining calculations
	// do we need separate sheets per project? allow multiple enties per day?
	//   assign multiple projects to each user
	// disable editing published sheets
	// validate breaks (<0 not allowed) and other entries, start/finish required
	// todo add/edit clients, holidays, roles
	// todo add/edit contract types and overtime rules
	// add/edit company name/address (make it selectable per user)
	// login with O365, Facebook, github, google, linkedin (widgets.php)
	// fallback date/time pickers if no native (times.php notes)
	// track who updated table entries
	// add/edit/import staff
	// edit roles and access (role.php)


onMount(() => {
	document.getElementById("app-loading").remove();
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
}
function onTimesUpdate(snap){
	_alltimes = snap.docs.filter(d=>{ return true })
		.map(d => { return {...d.data(), id:d.id } })
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

	selectSheet()
	days = []
	for (var d=1; d<=monthdays; d++){					// list of days in the month
		var date = month + '-' + (d+'').padStart(2,'0')
		var entry = times.find(e => e.date===date) ?? {date}
		var data = parseEntry(entry, $holidays)
		data.less = data.days ? Math.max(0,standard - data.hours) : 0
		days.push(data)
	}
}
</script>

<Nav class="noprint">
	<div slot="left" class="is-center ml-5">
		<Icon src={mdiHome} size="1.5" class="is-left"/>
		Timesheets
	</div>

	<div slot="center" class="hidden md:inline-block"> <!-- or left, or right -->
    <Tabs bind:active={active_tab}>
        <Tab>Timesheets</Tab>
        <Tab>Expenses</Tab>
        <Tab>Vacations</Tab>
        <Tab>Quotations</Tab>
     </Tabs>
	</div>

	<Hamburger slot="right" tag="a" bind:open={popups.side}/>
	<!-- <a slot="left" class="active" href="/"><Icon src={mdiHome} size="1.5" />Link 1</a> -->
    <!-- <a slot="center" href="/" class="brand">LOGO</a> -->
</Nav>

<SidePanel bind:visible={popups.side} >
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
		Vacations
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