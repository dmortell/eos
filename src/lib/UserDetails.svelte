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
	var editing = true

	$: console.log('userdetails',user.email, user.displayName)
	$: fields = copyFields(user)

	// todo update staff - test if editing standard times updates the user summary
	// todo fix deletes
	// todo add total days
	// todo adding an entry in a new month doesnt update sheets list

	const items =[
		// {name: 'name',	label:'', },
		{name: 'test',	label:'testing', },
		{name: 'start',			label:'Start time', 	type:'time',	def:'07:30'},
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

	function copyFields(user){
		const fields = {}
		items.forEach(item=>{
			const name = item.name
			fields[name] = user[name] ?? item.def ?? ''
		})
		return fields
	}

	function onChange({target}){
		const {name, value} = target
		console.log(name, value)
		fields[name] = value
	}

	async function saveUser(e){
		var dirty = false
		const data = {}
		editing=false

		items.forEach(item=>{
			const name = item.name
			if (user[name]===undefined && fields[name]===''){}
			else if (user[name]!==fields[name]){
				console.log('changed',name, user[name], fields[name])
				data[name] = fields[name]
				dirty = true
			}
		})
		if (dirty){
			console.log('sending to firebase', user.id, data)
			await users.update(data, user.id, (res,err)=>console.log('updated',user,data,res,err))
		} else console.log('unchanged')
	}

	async function updatePhoto() {
		user.photoURL = null
		const person = (await (await fetch('https://randomuser.me/api/')).json()).results[0]
		user.photoURL = person.picture.thumbnail //+ '?ctr=' + ctr++
		user = user
	}

</script>


<!-- For user details, see https://c0bra.github.io/svelma/bulma/media -->

<!-- <TimeSummary /> -->
<Container>
	<Details open>
		<span slot="summary">
			{user.displayName}
		</span>


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

	<div class="flex justify-between mb-2">
		<div class="p-2 w-24">
			<Avatar src={user?.photoURL} name={user.displayName} />
		</div>
		<div class="flex-auto w-32">
			<div class="font-bold">{user.displayName}</div>
			<a href="mailto:{user.email}">{user.email}</a>
		</div>
		{#if editing}
			<div>
				<Button primary icon={mdiContentSave} on:click={saveUser}>Save</Button>
				<Button secondary icon={mdiClose} on:click={e=>editing=false}>Close</Button>
			</div>
		{:else}
			<Button primary icon={mdiPencil} on:click={e=>editing=true} outline>Edit</Button>
		{/if}
		<!-- <label for="password" class="text-sm text-gray-600 dark:text-gray-400">Password</label> -->
		<!-- <a href="#!" class="text-sm text-gray-400 focus:outline-none focus:text-indigo-500 hover:text-indigo-500 dark:hover:text-indigo-300">Forgot password?</a> -->
	  </div>




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
