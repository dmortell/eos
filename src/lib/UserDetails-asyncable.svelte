<script>
	import {onMount, tick} from 'svelte'
	import { fade } from 'svelte/transition'
	// import {loading, users, session, times, sheets, cleanup, alert, } from '$js/stores'
	import {mdiHeart,mdiRepeat, mdiReply, mdiPencil, mdiContentSave, mdiCancel, mdiClose} from '@mdi/js'
	import {Nav,Card, Container, Details, Icon, Input,Button} from 'svelte-chota';
	import { asyncable } from 'svelte-asyncable';
	import {users, contracts, roles} from '$js/stores'
	import {parseEntry, optional, plural, format, calcHours} from "$js/formatter";
	import Avatar from "$lib/Avatar.svelte"
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
	$: console.log('userdetails',user.email, user.displayName)

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
		{name: 'test',	label:'testing', },
		{name: 'start',			label:'Start time', 	type:'time',	def:'09:00'},
		{name: 'finish',		label:'Finish time', 	type:'time',	def:'18:00'},
		{name: 'breaks',		label:'Breaks (hours)', type:'number',	def:1,		fmt:'hours'},
		{name: 'start_date',	label:'Start date', 	type:'date'},
		{name: 'finish_date',	label:'Finish date', 	type:'date'},
		{name: 'email',			label:'Email', 			type:'email'},		// todo remove this
		{name: 'tel',			label:'Contact Tel', 	type:'tel'},		// todo remove this
		{name: 'photoURL',		label:'Photo URL', 		type:'url'},		// todo remove this
		{name: 'contract',		label:'Contract', 		type:'select',	options: $contracts},
		{name: 'role',			label:'Role',			type:'select',	options: $roles },
		{name: 'carry_over',	label:'Carry over', 	},
		{name: 'entitlement',	label:'Entitlement',	},
		{name: 'paid_leave',	label:'Paid leave',		 },
		{name: 'sick_leave',	label:'Sick leave',		 },
		{name: 'special_leave',	label:'Special leave',	 },
		{name: 'unpaid_leave',	label:'Unpaid leave',	 },
		{name: 'compensation_days',	label:'Compensation days', },
		{name: 'compensation_used',	label:'Compensation used', },
		{name: 'remaining',		label:'Remaining',		 },
	]

	var editing = true
	var ctr = 0
	// var doc = null, _doc = null
	// const cons = {}
	// $: console.log('details.userlist',$users)



// {#await $user}
//   <p>Loading user...</p>
// {:then user}
//   <b>{user.firstName}</b>
// {:catch err}
//   <mark>User failed.</mark>
// {/await}

//   import { user } from './store.js';

// const posts = asyncable(
// 	async ($path, $query) => {
// 		if ($path.toString() === '/posts') {
// 			const res = await fetch(`/posts?page=${$query.params.page || 1}`);
// 			return res.json();
// 		}
// 	},
// 	null,
// 	[ path, query ]			// an asyncable store may depend on other stores. These values will be available to the getter
// );


// const tags = asyncable(fetchTags, null);		// Read-only asyncable store

// tags.subscribe(async $tags => {
//   console.log('tags changed', await $tags); // will never triggered
// });

// // changes won't actually be applied
// tags.update($tags => {
//   $tags.push('new tag');
//   return $tags;
// });

	const doc = asyncable(
		async () => {
			// const res = await fetch('/user/me');
			// return res.json();
			const res = await users.collection().doc(user.id).get();
			// 	const userStore = await doc.get();			// a point in time copy of the promise in the store
			// console.log('userstore',userStore)
			// console.log('userstore',userStore.data())
			return {...res.data(), id:res.id};
		},
		async ($new, $old) => {
			var dirty = false

			items.forEach(item=>{
				const key = item.name, newval = $new[key] ?? ''
				if ($old[key]===undefined && newval===''){}
				else if ($old[key]!==$new[key]){
					console.log('changed',key, $old[key],$new[key])
					dirty = true
				}
			})
			if (dirty){
				console.log('sending to firebase', $old.id, $new)
				await users.update($new, $old.id, (res,err)=>console.log('updated',$old,$new,res,err))
			} else console.log('unchanged')
			// await users.update($new,$old.id,(res,err)=>console.log('updated',$old,$new,id,res,err))

			// const old = $users.find(d=>d.id===user.id)

			// if ($newValue.email !== $prevValue.email) {
			// 	throw new Error('Email cannot be modified.');
			// }
			// await saveUser($newValue);

			// await fetch('/user/me', {
			// 	method: 'PUT',
			// 	body: JSON.stringify($newValue)
			// })
		}
		,[users]
	);

	function onChange({target}){
		const {name, value} = target
		console.log(name, value)
		user[name] = value
	}


	async function saveUser(e){
		console.log('saving')
		// editing=false

		const userStore = await doc.get();			// a point in time copy of the promise in the store
		console.log('userstore',userStore, user)
		// console.log('userstore',userStore.data())

		// the doc can be updated by field or by using user.set(user);
		// doc.set(user);
		doc.update($user => {
			console.log('doc.update', $user)

			items.forEach(item=>{
				const key = item.name, v1 = user[key] ?? '', v2 = $user[key] ?? ''
				// if (user[key]===undefined || ($user[key]===undefined || user[key]==='')){}
				// else if (user[key]!==$user[key]){
				if (v1!==v2){
					console.log('changed1',key, $user[key],$user[key])
					$user[key] = user[key]
					// dirty = true
				}
				else console.log("same",v1,v2)
			})

			// items.forEach(item=>{
			// 	const key = item.name
			// 	if (user[key]!==undefined && user[key]!==old[key]){
			// 		console.log('updated',key, old[key],user[key])
			// 	}
			// })
			console.log('$user',$user)
			// const data = $user.data()
			// $user.test = "test1"
			// $user.breaks++
			// console.log({data})
			return $user;
		});


		// const old = $users.find(d=>d.id===user.id)
		// items.forEach(item=>{
		// 	const key = item.name
		// 	if (user[key]!==undefined && user[key]!==old[key]){
		// 		console.log('updated',key, old[key],user[key])
		// 	}
		// })
	}

	//two methods to access the stored promise, subscribe and get
	// const userStore = await user.get();			// a point in time copy of the promise in the store
	doc.subscribe(async userStore => {
		// console.log('details.onmount.firebase.user', await userStore); // will be printed after each side-effect
		const res = await userStore
		console.log('details.onmount.firebase.user', res); // will be printed after each side-effect
	});

	// the doc can be updated by field or by using user.set(user);
	// user.update($user => {
	// 	$user.visits++;
	// 	return $user;
	// });


	onMount(()=>{
		//cons.users  = users.connect(users.collection().orderBy("email", "asc"), onUsersUpdate)
		// return ()=>{ cleanup() }
		// doc = asyncable(async () => {
		// 	// const res = await fetch('/user/me');
		// 	// return res.json();
		// 	const res = await collection().doc(user.id);
		// 	return res;
		// },
		// async ($newValue, $prevValue) => {
		// 	await fetch('/user/me', {
		// 		method: 'PUT',
		// 		body: JSON.stringify($newValue)
		// 	})
		// }

		// );
		// doc.subscribe(async userStore => {
		// 	console.log('details.onmount.firebase.user', await userStore); // will be printed after each side-effect
		// });
		// const userStore = await user.get();			// a point in time copy of the promise in the store
	})

	async function updatePhoto() {
		user.photoURL = null
		const person = (await (await fetch('https://randomuser.me/api/')).json()).results[0]
		user.photoURL = person.picture.thumbnail //+ '?ctr=' + ctr++
		user = user
		// cell: "0170-2727173"
		// dob: {date: '1979-04-11T22:51:09.501Z', age: 42}
		// email: "karl-dieter.preuss@example.com"
		// gender: "male"
		// id: {name: '', value: null}
		// location: {street: {…}, city: 'Kreuztal', state: 'Thüringen', country: 'Germany', postcode: 57206, …}
		// login: {uuid: '9a4a47f8-3aed-4b34-bb5d-7aa8d1a38cad', username: 'goldensnake513', password: 'private1', salt: 'mM52TppS', md5: 'aea1cdc2536a5c9d4648c24d43b6fa2e', …}
		// name: {title: 'Mr', first: 'Karl-Dieter', last: 'Preuß'}
		// nat: "DE"
		// phone: "0816-2576830"
		// picture: {large: 'https://randomuser.me/api/portraits/men/50.jpg',
		// medium: 'https://randomuser.me/api/portraits/med/men/50.jpg',
		// thumbnail: 'https://randomuser.me/api/portraits/thumb/men/50.jpg'}
		// console.log(user.photoURL)
	}

</script>

<!-- <Container>
	{#each _users as person (person.uid)}
	<ListItem link detail={person} on:click={e=>dispatch('click',{detail:person})}>
		<div > {person.displayName} {person.start}</div>
	</ListItem>
	{/each}
</Container>
<Alert/> -->

<!-- For user details, see https://c0bra.github.io/svelma/bulma/media -->

<!-- <TimeSummary /> -->
<Container>
	<Details open>
		<span slot="summary">
			{user.displayName}
		</span>

		<Avatar src={user?.photoURL} name={user.displayName} />

			<!-- <figure class="image is-64x64">
				{#if user?.photoURL}<img transition:fade class="is-rounded" src={user.photoURL} alt="Avatar" />{/if}
			  </figure> -->
			<!-- <button class="button is-primary" on:click={updateUser}>Fetch New Photo</button> -->

		<!-- {#if user}
        <nav class="level is-mobile" transition:fade>
          <div class="level-left">
            <a href class="level-item" aria-label="reply">
				<span class="icon is-small2">
				  <Icon src={mdiReply}/>
              </span>
            </a>
            <a href class="level-item" aria-label="retweet">
				<span class="icon is-small2">
					<Icon src={mdiRepeat} class="icon2" />
              </span>
            </a>
            <a href class="level-item" aria-label="like">
              <span class="icon is-small2">
				<Icon src={mdiHeart}/>
              </span>
            </a>
          </div>
        </nav>
      {/if} -->

		<a href="mailto:{user.email}">{user.email}</a>

		{#if editing}
		<Button secondary icon={mdiClose} on:click={e=>editing=false}>Close</Button>
		<Button primary icon={mdiContentSave} on:click={saveUser}>Save</Button>
		{:else}
			<Button primary icon={mdiPencil} on:click={e=>editing=true} outline>Edit</Button>
		{/if}

		{#each items as item}
			{#if editing}
				<ListInput label={item.label} name={item.name} value={user[item.name] ?? item.def} type={item.type ?? 'text'} options={item.options}
				on:change={onChange}
				/>
				<!-- on:blur={console.log}
				on:input={console.log}
				on:inputClear={console.log} -->

				<!-- on:focus on:blur on:input on:change on:inputClear on:textareaResize on:inputEmpty on:inputNotEmpty
				on:CalendarChange on:colorPickerChange on:textEditorChange -->

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
