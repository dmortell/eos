<script>
	// import { f7, Block, Button, Row, Col, Icon, List, ListItem, ListInput, ListButton } from "framework7-svelte";
	import {Nav,Card, Container, Details, Icon, Input,Button, Modal} from 'svelte-chota';
	import ListItem from "$lib/ListItem.svelte"
	import ListInput from "$lib/ListInput.svelte"
	import {work_types} from '$js/stores'
	export let entry, onClose

	// var type, prev_type
	// $: {
	// 	type = entry.type
	// 	// clear start,finish,breaks on changing Normal to another type
	// 	if (type!='normal' && type!=prev_type){}
	// 	prev_type = type
	// }

	// function updateType(){

	// }

	// todo press Enter to save/submit entry

// 	export const work_types = readable([
// 	{type:'normal', 		name:'Normal Day'},
// 	{type:'weekend',		name:'Weekend'},
// 	{type:'public',			name:'National Holiday'},
// 	{type:'compensation',	name:'Compensation Day'},
// 	{type:'paid_full',		name:'Paid Leave (full day)'},
// 	{type:'paid_half',		name:'Paid Leave (half day)'},
// 	{type:'unpaid_leave',	name:'Unpaid leave'},
// 	{type:'client_holiday',	name:'Client holiday'},
// 	{type:'sick',			name:'Sick'},
// 	{type:'other_leave',	name:'Other leave'},
// ])
</script>

<!-- <List> -->
	<form on:submit|preventDefault={e=>onClose('save')}>
	<ListInput label="Date"   type="date"   bind:value={entry.date}    />
	<ListInput label="Start"  type="time"   bind:value={entry.start}   />
	<ListInput label="Finish" type="time"   bind:value={entry.finish}  />
	<ListInput label="Breaks (hours)" type="number" bind:value={entry.breaks} inputmode='numeric' placeholder="Breaks in hours (eg. 1.5hrs)"/>
	<ListInput label="Type"   type="select" bind:value={entry.type}>
		{#each $work_types as type}<option value={type.type}>{type.name}</option>{/each}
	</ListInput>
	<ListInput label="Remarks" type="text"  bind:value={entry.remark} >
		<div slot="content" style='margin-right:8px;'><Button fill small round raised on:click={e=>entry.remark="WFH"}>WFH</Button></div>
	</ListInput>
	<!-- <ListItem popupClose>
		{#if entry.id}
		<Button popupClose={true} type='button' iconF7='trash' color='red' outline on:click={e=>onClose('delete')}  fill>Delete</Button>
		{/if}
		&nbsp;
		<Button popupClose={true} type='submit' on:click={e=>onClose('save')}  fill>Save</Button>
	</ListItem> -->
	<!-- <div slot="footer" class="is-right px-10 py-5 border-t-2">
		<Button secondary icon={mdiClose} on:click={e=>editing=false}>Cancel</Button>
		<Button primary icon={mdiContentSave} on:click={saveUser}>Save</Button>
	</div> -->

	</form>
<!-- </List> -->