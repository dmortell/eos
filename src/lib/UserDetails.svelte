<script>
	// import {onMount, tick} from 'svelte'
	import {Nav,Card, Container, Details, Icon, Input,Button} from 'svelte-chota';
	// import {loading, users, session, times, sheets, cleanup, alert, } from '$js/stores'
	// // import {loading, users, session, times, sheets, cleanup, alert, dispatch} from '$js/stores'
	import {parseEntry, optional, plural, format, calcHours} from "$js/formatter";
	import ListItem from "$lib/ListItem.svelte"
	import ListInput from "$lib/ListInput.svelte"
	// import Alert from "$lib/Alert.svelte"
	// import { createEventDispatcher } from 'svelte';
	// export const dispatch = createEventDispatcher();
	export var user

	// // import {work_types} from '$js/stores'
	// // export let entry, onClose

	// var _users = []										// all users (realtime snapshot)
	// var cons = {}										// firebase snapshot connection ids for reconnecting and cleanup
	$: console.log('userdetails',user)

	// onMount(() => {
	// 	cons.users  = users.connect(users.collection().orderBy("email", "asc"), onUsersUpdate)
	// 	// connectUser();
	// 	return ()=>{ cleanup() }
	// });
	// function onUsersUpdate(snap){
	// 	_users = snap.docs.filter(q=>{ return q.data().displayName>'' || q.data().handle=='newuser1' })		// todo remove newuser1 after testing
	// 	.map(d => { return {id:d.id, displayName:d.data().name, ...d.data()} })

	// 	console.log(_users)

	// 	// todo update staff - test if editing standard times updates the user summary
	// 	// todo fix deletes
	// 	// todo add total days
	// 	// todo adding an entry in a new month doesnt update sheets list
	// 	// user = _users.find(u => u)
	// }

	const items =[
		// {name: 'name',	label:'', },
		{name: 'start',			label:'Start time', },
		{name: 'finish',		label:'Finish time', },
		{name: 'breaks',		label:'Breaks (hours)', fmt:'hours'},
		{name: 'contract',		label:'Contract', },
		{name: 'role',			label:'Role', },
		{name: 'carry_over',	label:'Carry over', 	value:5		},
		{name: 'entitlement',	label:'Entitlement',	value:20 	},
		{name: 'paid_leave',	label:'Paid leave',		 },
		{name: 'sick_leave',	label:'Sick leave',		 },
		{name: 'special_leave',	label:'Special leave',	 },
		{name: 'unpaid_leave',	label:'Unpaid leave',	 },
		{name: 'compensation_days',	label:'Compensation days', },
		{name: 'compensation_used',	label:'Compensation used', },
		{name: 'remaining',		label:'Remaining',		 },
	]

	var editing = true

</script>

<!-- <Container>
	{#each _users as person (person.uid)}
	<ListItem link detail={person} on:click={e=>dispatch('click',{detail:person})}>
		<div > {person.displayName} {person.start}</div>
	</ListItem>
	{/each}
</Container>
<Alert/> -->

<!-- <TimeSummary /> -->
<Container>
	<Details open>
		<span slot="summary">
			<div>{user.displayName}</div>

		</span>

		<a href="mailto:{user.email}">{user.email}</a>

		{#each items as item}
			{#if editing}
				<ListInput title={item.label} after={format(user[item.name], item.fmt)} />
			{:else}
				{#if user[item.name] !== undefined}
					<ListItem title={item.label} after={format(user[item.name], item.fmt)} />
				{/if}
			{/if}
		{/each}

	</Details>
</Container>

<!--

<ListItem accordionItem title={user.displayName} badge={user.notifications?.length}>
	<div slot='title'>
		<a href="mailto:{user.email}">{user.email}</a>
	</div>
	<div slot='media'><Avatar name={user.displayName} src={user.photoURL}/></div>
	<AccordionContent>

		<List noHairlinesBetween inset inlineLabels >
			<ListItem accordionItem title="Start: {user.start} Finish {user.finish} Break {plural(user.breaks,'hr')}" link="#" after="Edit">
				<b slot='header'>Normal Working Hours</b>
				<AccordionContent>
					<Block strong>
						<BlockHeader>Edit Normal Work Time</BlockHeader>
						<ListInput label="Start"  name="start"  type="time" value={user.start} on:blur={editUser} validateOnBlur />
						<ListInput label="Finish" name="finish" type="time" value={user.finish} on:blur={editUser} validateOnBlur />
						<ListInput label="Breaks (hours)" name="breaks" type="number" value={user.breaks} on:blur={editUser} inputmode='numeric' placeholder="Breaks in hours (eg. 1.5hrs)"/>
					</Block>
				</AccordionContent>
			</ListItem>


			<ListItem title="Standard Hours:" after={plural(calcHours(user),'hr')} />
			{#each items as item}
			{#if item.value!==undefined}
			<ListItem title={item.label} after={plural(item.value)} />
			{/if}
			{/each}
		</List>

	</AccordionContent>


</ListItem> -->
