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
	export var user
	var editing = false

	$: fields = copyFields(user)

	// todo update staff - test if editing standard times updates the user summary
	// todo fix deletes
	// todo add total days
	// todo adding an entry in a new month doesnt update sheets list
	// todo display client name instead of client type
	// todo only admins can edit role, contract, carry over & entitlements
	// user details, see https://c0bra.github.io/svelma/bulma/media

	const items =[
		{name: 'start',			label:'Standard start time', 	type:'time',	def:'07:30'},
		{name: 'finish',		label:'Standard finish time', 	type:'time',	def:'18:00'},
		{name: 'breaks',		label:'Standard breaks (hours)', type:'number',	def:1,		fmt:'hours'},
		// {name: 'start_date',	label:'Employment start date', 	type:'date',	hint:'Employment start date'},
		// {name: 'finish_date',	label:'Employment finish date', 	type:'date'},
		// {name: 'email',			label:'Email', 			type:'email'},		// todo remove this
		// {name: 'tel',			label:'Contact Tel', 	type:'tel'},		// todo remove this
		// {name: 'photoURL',		label:'Photo URL', 		type:'url'},		// todo remove this
		{name: 'client',			label:'Current client',	 	type:'select',	options: $clients},
		{name: 'contract',		label:'Contract', 				type:'select',	options: $contracts},
		{name: 'role',				label:'Role',							type:'select',	options: $roles },
		{name: 'carry_over',	label:'Carry over', 	},
		{name: 'entitlement',	label:'Entitlement',	},
		// {name: 'paid_leave',	label:'Paid leave',		 },
		// {name: 'sick_leave',	label:'Sick leave',		 },
		// {name: 'special_leave',	label:'Special leave',	 },
		// {name: 'unpaid_leave',	label:'Unpaid leave',	 },
		// {name: 'compensation_days',	label:'Compensation days', },
		// {name: 'compensation_used',	label:'Compensation used', },
		// {name: 'remaining',		label:'Remaining',		 },
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
</script>

<Container>
	<Details>
		<span slot="summary">{user.displayName}</span>

		<ListItem>
			<Avatar slot='left' src={user?.photoURL} name={user.displayName} />
			{user.displayName}
			<a slot='footer' href="mailto:{user.email}">{user.email}</a>
			<button slot='right' class="smallbtn bd-error" on:click={e=>editing=true}>Edit</button>
		</ListItem>

		{#each items as item}
			{#if user[item.name] !== undefined}
				<!-- <ListItem title={item.label} after={format(user[item.name], item.fmt)} /> -->
				<ListItem>
					{item.label}
					<div slot='right'>{format(user[item.name], item.fmt)}</div>
				</ListItem>
			{/if}
		{/each}
	</Details>
</Container>

<Dialog bind:open={editing} modal>
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

	<!-- <div slot="footer" class="is-right px-10 py-5 border-t-2"> -->
	<div slot="footer" class="is-center modal-footer">
		<Button secondary icon={mdiClose} on:click={e=>editing=false}>Cancel</Button>
		<Button primary icon={mdiContentSave} on:click={saveUser}>Save</Button>
	</div>
</Dialog>

<style>
	/* .small {height:20px;} */
</style>
