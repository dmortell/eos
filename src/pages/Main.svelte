<script>
	import {onMount, tick} from 'svelte'
	import { slide } from 'svelte/transition';

	import SidePanel from '$lib/SidePanel.svelte'
	import UserList from '$lib/UserList.svelte'
	import UserDetails from '$lib/UserDetails.svelte'
	import UserSheets from '$lib/UserSheets.svelte'
	import Timesheet from '$lib/Timesheet.svelte'
	import Expenses from './Expenses.svelte'
	import Leave from './Leave.svelte'
	import {Alert, Avatar, ListItem, Hamburger} from '$lib'
	import {Nav,Card, Container, Icon, Field, Input,Button, Tag} from 'svelte-chota';
	import {Tabs, Tab} from 'svelte-chota';
	import {mdiHome,mdiMagnify, mdiDelete,mdiAccountPlus,mdiSend, mdiChevronDown } from '@mdi/js'
	import {loading, users, session, times, sheets, leave, holidays, cleanup, monthTotal, alert, sendVerificationLink} from '$js/stores'
	import {parseEntry, capitalize, optional, plural, format, calcHours, mins, toInt, toHours} from "$js/formatter";

	// v0.7
	let month = new Date().toISOString().substr(0,7);	//"2021-08"
	var popups = {side:false}							// popup open/closed flags
	var user = $session.user							// currently selected user (admins can select other users)
	var sheet = {}												// timesheet details for currently selected month
	var active_tab = 'timesheets'
	var dark = false

	let _alltimes = []									// realtime snapshot of all of this users time entries
	var _sheets = []										// all of the selected users timesheets (realtime snapshot)
	var _users = []											// all users (realtime snapshot)
	var _leave = []											// user leave/holidays (realtime snapshot)
	var days = []
	var timeouts = {}

	$: {
		if (dark) document.body.classList.add('dark');
		else document.body.classList.remove('dark');
	}
	function setTheme(e){
		// if (dark) document.body.classList.add('dark');
		// else document.body.classList.remove('dark');
		// console.log('settheme', dark)
		// session.updateToken($session.user);
	}

	// add/edit leave requests
	// expenses
	// improve edit staff details form
	// todo faster time entry
	// checkin/out & breaks
	// link with calendar? scheduled tasks https://clockify.me/timesheet-app
	// copy/paste FROM Excel
	// todo export to Excel/PDF or Mail
	// secure firebase rules
	// todo slide thru dates/months
	// done: push to Vercel/github
	// todo checkbox select rows to set standard times to
	// todo send notifications when sheets are published or approved
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


	// todo add routing to other tabs
  // let current = Home;  // set default component
  // page('/', () => (current = Home));  // Map routes to page. If a route is hit the current reference is set to the route's component
  // page('/about', () => (current = About));
  // page('/profile', () => (current = Profile));
  // page.start();			  // activate router

	// todo save theme locally
	// const btn = document.querySelector(".btn-toggle");
	// const currentTheme = localStorage.getItem("theme");
	// if (currentTheme == "dark") {
	// 	document.body.classList.add("dark-theme");
	// }
	// btn.addEventListener("click", function() {
	// 	document.body.classList.toggle("dark-theme");
	// 	let theme = "light";
	// 	if (document.body.classList.contains("dark-theme")) theme = "dark";
	// 	localStorage.setItem("theme", theme);
	// });


function setTab(tab){ active_tab = tab; popups.side = false }

onMount(() => {
	document.getElementById("app-loading")?.remove();
	users.reconnect(onUsersUpdate);			// only required by editors
	return ()=>{ cleanup() }						// disconnect realtime snapshots
})

function onUsersUpdate(snap){
	_users = snap.docs.filter(q=>q.data().displayName>'').map(d => { return {...d.data(), id:d.id} })
	connectUser(user)
}
function onLeaveUpdate(snap){
	_leave = snap.docs.map(d => { return {...d.data(), id:d.id} })
}
function onSheetsUpdate(snap){
	_sheets = snap.docs.map(d => { return {...d.data(), id:d.id} }).sort((a,b)=>a.month > b.month ? -1 : 1)
	selectSheet(month)
}
function onTimesUpdate(snap){
	_alltimes = snap.docs.filter(d=>{ return true }).map(d => { return {...d.data(), id:d.id } })
	filldays(_alltimes)
}

function selectUser({detail}){
	connectUser(detail.person)
}
async function connectUser(newuser){
	var keys = ['displayName', 'email', 'uid', 'emailVerified'], changed = 0
	var role = newuser.role
	user = _users.find(u => u.email==newuser.email) ?? {}
	if (user?.uid){
		sheets.reconnect(onSheetsUpdate, user.uid);
		times.reconnect(onTimesUpdate,   user.uid);
		leave.reconnect(onLeaveUpdate,   user.uid);
		if (user.email ===$session.user.email && user.role !== $session.claims.role){		// if sessions role is changed in databse
			if (timeouts.refresh) clearTimeout(timeouts.refresh)
			timeouts.refresh = setTimeout(async ()=>{					// it takes a second or two to update firebase claims
				await session.refreshToken($session.user)				// so refresh the session claims after 5 seconds
				timeouts.refresh = null
				// console.log('connectUser role changed', $session.claims)
			}, 5000);
		}
	}
	else {				// user not found in database
		console.error('connectUser.invalid uid', user);
		changed = 1
		_sheets = []														// todo disconnect sheets&times to avoid uid errors
		_alltimes = []
		filldays(_alltimes, false)							// dont revalidate sheet totals if no user
	}
	// todo if claims.role is different in database, then refresh the token first as it might have been updated by someone else
	if (newuser.email === $session.user.email && changed){		// update user in database with user session
		const {email, displayName, uid, emailVerified} = $session.user
		console.log('connect.user adding', {email, displayName, uid, emailVerified, role})
		await users.update({email, displayName, uid, emailVerified, role}, newuser.email)
		console.log('connect.user added', newuser)
	}
}


function selectSheet(month){
	var defaults = {uid:user.uid, month, status:"pending", client:user.client}
	sheet = _sheets.find(d => d.month==month) ?? defaults
}

function selectMonth({detail}){
	month = detail.month
	filldays(_alltimes)
}
function filldays(times, validate=true){
	var start = mins(user.start), end = mins(user.finish), less = toInt(user.breaks) * 60
	var standard = toHours(end-start-less)
	var [y,m] = month.split('-').map(v=>+v)
	var monthdays = new Date(y, m, 0).getDate()			// number of days in the month
	var keys = ['a','b','c','d','total','days','less']

	selectSheet(month)
	days = []
	for (var d=1; d<=monthdays; d++){					// list of days in the month
		var date = month + '-' + (d+'').padStart(2,'0')
		var entry = times.find(e => e.date===date) ?? {date}
		var data = parseEntry(entry, $holidays)
		data.less = data.days ? Math.max(0,standard - data.hours) : 0
		days.push(data)
	}
}

	async function setRole(user, role){										// Check if user meets role criteria.
		// if (user.email && user.email.endsWith('@eiresystems.com') && $session.emailVerified){		// todo check emailverified && role==admin
		if ($session.user.email.endsWith('@eiresystems.com')){
			try {
				await session.setUserRole(user, role)						// set firebase claims role
				await users.update({role}, user.email)		// Update real-time database to notify client to force refresh.
			} catch(err){ console.error('main.setRole',err)}
		}
		else console.log('main.setRole user unauthorised')
	}
	function testRole(role){
		setRole($session.user, role);
	}

	function verifyEmail(){
		sendVerificationLink(err=>{
			if (err) $alert = "Cannot verify email: " + err.message
			else $alert = "Check your mail for verification link"
		})
	}

</script>

<Nav class="noprint">
	<div slot="left" class="is-center ml-5">
		<Icon src={mdiHome} size="1.5" class="is-left"/>
		{capitalize(active_tab)}
	</div>

	<!-- <div slot="center" class="hidden md:inline-block">  -->
	<div slot="center" class="hide-xs">
    <Tabs bind:active={active_tab}>
        <Tab tabid='timesheets'>Timesheets</Tab>
        <Tab tabid='expenses'>Expenses</Tab>
        <Tab tabid='vacations'>Vacations</Tab>
        <!-- <Tab>Quotations</Tab> -->
     </Tabs>
	</div>

	<Hamburger slot="right" bind:open={popups.side}/>
	<!-- <a slot="left" class="active" href="/"><Icon src={mdiHome} size="1.5" />Link 1</a> -->
    <!-- <a slot="center" href="/" class="brand">LOGO</a> -->
</Nav>

{#if active_tab=='timesheets'}
<Container>
	<!-- <ListItem>
		<Button>Enter daily times</Button>
		<Button>View month details</Button>
		<Button>View timesheets</Button>
		<Button>Edit settings</Button>
	</ListItem> -->

	<div class="noprint">

		<label for="checkbox1"><input id="checkbox1" name="checkbox" type="checkbox" bind:checked={dark} on:change={setTheme}> Dark mode</label>

		<ListItem>
		<!-- <Button on:click={e=>testApi()}>API</Button> -->
		<Button on:click={e=>testRole('admin')}>Admin</Button>
		<Button on:click={e=>testRole('user')}>User</Button>

		<p>User: {user.email} {user.role}</p>
		<p>Session: {$session.claims.role}</p>

		{#if $session.emailVerified}
			<p>Email verified</p>
		{:else}
			<Button on:click={e=>verifyEmail()}>Verify mail</Button>
		{/if}
		</ListItem>


		<UserList {_users} on:click={selectUser} />
		<UserDetails {user}/>
		<UserSheets _sheets={_sheets} _times={_alltimes} on:select={selectMonth}/>
	</div>
	<Timesheet {user} {month} {days} {sheet} _times={_alltimes} on:select={selectMonth} />
</Container>
{:else if active_tab=='expenses'}
	<Expenses />
{:else if active_tab=='vacations'}
	<div transition:slide|local>
		<Leave {user} _leave={_leave} times={_alltimes} />
	</div>
{:else}
<Container>Quotations</Container>
{/if}

<!-- Menu -->
<SidePanel bind:visible={popups.side}>
	<!--
		<Button dropdown="My Profile" autoclose outline iconRight={mdiChevronDown}>
			<p><a href="#!">Edit</a></p>
			<p><a href="#!">Alerts</a>&nbsp;<Tag>3</Tag></p>
			<hr>
			<p><a href="#!" class="text-error">Logout</a></p>
		</Button>
	 -->

	<Container>
			<ListItem link on:click={e=>setTab('timesheets')}>Timesheets</ListItem>
			<ListItem link on:click={e=>setTab('expenses')}>Expenses</ListItem>
			<ListItem link on:click={e=>setTab('vacations')}>Vacations</ListItem>
			<ListItem link on:click={e=>session.signout()}>Logout</ListItem>
	</Container>

</SidePanel>

<Alert/>
