<script>
	import {onMount, tick} from 'svelte'
	import { fade } from 'svelte/transition'
	// import {loading, users, session, times, sheets, cleanup, alert, } from '$js/stores'
	import {mdiHeart,mdiRepeat, mdiReply, mdiPencil, mdiContentSave, mdiCancel, mdiChevronDown, mdiClose} from '@mdi/js'
	import {Nav,Card, Container, Details, Icon, Input,Button, Modal, Tag} from 'svelte-chota';
	import { asyncable } from 'svelte-asyncable';
	import {users, contracts, roles, clients} from '$js/stores'
	import {parseEntry, optional, plural, format, calcHours} from "$js/formatter";
	import Avatar from "$lib/Avatar.svelte"
	import Dialog from "$lib/Dialog.svelte"
	import ListItem from "$lib/ListItem.svelte"
	import ListInput from "$lib/ListInput.svelte"
	// import Alert from "$lib/Alert.svelte"
	// import { createEventDispatcher } from 'svelte';
	// export const dispatch = createEventDispatcher();
	export var user
	var editing = false

	// $: console.log('userdetails',user.email, user.displayName, user.start)
	$: fields = copyFields(user)

	// todo update staff - test if editing standard times updates the user summary
	// todo fix deletes
	// todo add total days
	// todo adding an entry in a new month doesnt update sheets list

	// todo display client name instead of client type

	const items =[
		// {name: 'name',	label:'', },
		{name: 'start',			label:'Start time', 	type:'time',	def:'07:30'},
		{name: 'finish',		label:'Finish time', 	type:'time',	def:'18:00'},
		{name: 'breaks',		label:'Breaks (hours)', type:'number',	def:1,		fmt:'hours'},
		{name: 'start_date',	label:'Start date', 	type:'date',	hint:'Employment start date'},
		{name: 'finish_date',	label:'Finish date', 	type:'date'},
		// {name: 'email',			label:'Email', 			type:'email'},		// todo remove this
		// {name: 'tel',			label:'Contact Tel', 	type:'tel'},		// todo remove this
		// {name: 'photoURL',		label:'Photo URL', 		type:'url'},		// todo remove this
		{name: 'client',		label:'Client',		 	type:'select',	options: $clients},
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
	<Details class="mb-5">
		<span slot="summary">
			{user.displayName}
		</span>

		<!-- <div class="w-full h-8 flex items-center px-3 my-3">
			<div class="bg-blue-500 z-10 w-5 h-5 rounded-full flex items-center justify-center ">
				<svg class="w-3 h-3 fill-current text-white" xmlns="http://www.w3.org/2000/svg" width="27" height="27" viewBox="0 0 24 24" fill="none" stroke="#b0b0b0" stroke-width="2" stroke-linecap="square" stroke-linejoin="round"><path d="M14 9V5a3 3 0 0 0-3-3l-4 9v11h11.28a2 2 0 0 0 2-1.7l1.38-9a2 2 0 0 0-2-2.3zM7 22H4a2 2 0 0 1-2-2v-7a2 2 0 0 1 2-2h3"></path></svg>
			</div>
			<div class="bg-red-500 w-5 h-5 rounded-full flex items-center justify-center -ml-1">
				<svg  class="w-3 h-3 fill-current stroke-current text-white" xmlns="http://www.w3.org/2000/svg" width="27" height="27" viewBox="0 0 24 24" fill="none" stroke="#b0b0b0" stroke-width="2" stroke-linecap="square" stroke-linejoin="round"><path d="M20.84 4.61a5.5 5.5 0 0 0-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 0 0-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 0 0 0-7.78z"></path></svg>
			</div>

			<div class="w-full flex justify-between">
				<p class="ml-3 text-gray-500">8</p>
				<p class="ml-3 text-gray-500">29 comment</p>
			</div>
		</div> -->

		<!-- <div class="flex items-center text-sm">
			<div class="relative w-8 h-8 mr-3 rounded-full md:block">
			  <img class="object-cover w-full h-full rounded-full" src="https://images.pexels.com/photos/5212324/pexels-photo-5212324.jpeg?auto=compress&cs=tinysrgb&dpr=3&h=750&w=1260" alt="" loading="lazy" />
			  <div class="absolute inset-0 rounded-full shadow-inner" aria-hidden="true"></div>
			</div>
			<div>
			  <p class="font-semibold text-black">Sufyan</p>
			  <p class="text-xs text-gray-600">Developer</p>
			</div>
		</div> -->


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

		<div class="flex justify-between mb-2 mt-5">
			<div class="p-2 w-24">
				<Avatar src={user?.photoURL} name={user.displayName} />
			</div>
			<div class="flex-auto w-32">
				<div class="font-bold">{user.displayName}</div>
				<a href="mailto:{user.email}">{user.email}</a>
			</div>
			<!-- <Button outline primary class='small' icon={mdiPencil} on:click={e=>editing=true}><span class="hidden md:inline">Edit</span></Button> -->
			<Button outline primary  class='small' on:click={e=>editing=true}>
				<Icon class='inline' src={mdiPencil} size="16px"/>
				<span class="hidden md:inline">Edit</span>
			</Button>
			<!-- <label for="password" class="text-sm text-gray-600 dark:text-gray-400">Password</label> -->
			<!-- <a href="#!" class="text-sm text-gray-400 focus:outline-none focus:text-indigo-500 hover:text-indigo-500 dark:hover:text-indigo-300">Forgot password?</a> -->
		</div>

		{#each items as item}
			{#if user[item.name] !== undefined}
				<ListItem title={item.label} after={format(user[item.name], item.fmt)} />
			{/if}
		{/each}
	</Details>
</Container>

<Dialog bind:open={editing} modal=true>
	<div slot="header" class="is-center modal-header">Edit Staff</div>

    <div class='modal-content overscroll-contain'>
		{#each items as item}
			<ListInput label={item.label} name={item.name} value={user[item.name] ?? item.def} type={item.type ?? 'text'} options={item.options}
			on:change={onChange}
			/>
			<!-- on:blur={console.log}
			on:input={console.log}
			on:inputClear={console.log} -->
			<!-- on:focus on:blur on:input on:change on:inputClear on:textareaResize on:inputEmpty on:inputNotEmpty
			on:CalendarChange on:colorPickerChange on:textEditorChange -->
		{/each}
	</div>

	<div slot="footer" class="is-right px-10 py-5 border-t-2">
		<Button secondary icon={mdiClose} on:click={e=>editing=false}>Cancel</Button>
		<Button primary icon={mdiContentSave} on:click={saveUser}>Save</Button>
	</div>
</Dialog>

<style>
	.small {height:20px;}
</style>
