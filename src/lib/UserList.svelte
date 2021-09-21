<script>
	import {onMount, tick} from 'svelte'
	import {Nav,Card, Container, Icon, Input,Button} from 'svelte-chota';
	import {loading, users, session, times, sheets, cleanup, alert, } from '$js/stores'
	// import {loading, users, session, times, sheets, cleanup, alert, dispatch} from '$js/stores'
	import ListItem from "$lib/ListItem.svelte"
	import Alert from "$lib/Alert.svelte"
	import { createEventDispatcher } from 'svelte';
	export const dispatch = createEventDispatcher();

	// import {work_types} from '$js/stores'
	// export let entry, onClose

	export var _users = []										// all users (realtime snapshot)
	var cons = {}										// firebase snapshot connection ids for reconnecting and cleanup
	// $: console.log(_users)
// if(0){
// 	onMount(() => {
// 		cons.users  = users.connect(users.collection().orderBy("email", "asc"), onUsersUpdate)
// 		// connectUser();
// 		return ()=>{ cleanup() }
// 	});
// 	function onUsersUpdate(snap){
// 		_users = snap.docs.filter(q=>{ return q.data().displayName>'' || q.data().handle=='newuser1' })		// todo remove newuser1 after testing
// 		.map(d => { return {id:d.id, displayName:d.data().name, ...d.data()} })

// 		console.log(_users)

// 		// todo update staff - test if editing standard times updates the user summary
// 		// todo fix deletes
// 		// todo add total days
// 		// todo adding an entry in a new month doesnt update sheets list
// 		// user = _users.find(u => u)
// 	}
// }
</script>

<Container>
	{#each _users as person (person.id)}
	<ListItem link detail={person} on:click={e=>dispatch('click',{person})}>
		<div > {person.displayName} {person.start}</div>
	</ListItem>
	{/each}
</Container>
<Alert/>
