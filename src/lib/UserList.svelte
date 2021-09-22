<script>
	// import {onMount, tick} from 'svelte'
	import {Nav,Card, Container, Details, Field, Icon, Input,Button} from 'svelte-chota';
	import {mdiHome,mdiMagnify, mdiDelete,mdiAccountPlus,mdiSend } from '@mdi/js'
	// import {loading, users, session, times, sheets, cleanup, alert, } from '$js/stores'
	import ListItem from "$lib/ListItem.svelte"
	// import Alert from "$lib/Alert.svelte"
	import { createEventDispatcher } from 'svelte';
	export const dispatch = createEventDispatcher();
	export var _users = []										// all users (realtime snapshot)
	var find=''
</script>

<Container>
	<Details class="mb-5">
		<span slot="summary">
			Users
		</span>
		<Field gapless  class="mt-5">
			<Input placeholder="Search users" bind:value={find}/>
			<Button icon={mdiMagnify} />
		</Field>

		{#each _users.filter(u=>find=='' || (find>'' && u.displayName.search(new RegExp(find, "i"))>-1)) as person (person.id)}
		<ListItem link on:click={e=>dispatch('click',{person})}>
			<div > {person.displayName} {person.start}</div>
		</ListItem>
		{/each}
	</Details>
</Container>
<!-- <Alert/> -->
