<script>
	import {onMount, tick} from 'svelte'
	import { fade } from 'svelte/transition'
	import {mdiFilePdfBox, mdiEmail, mdiMicrosoftExcel,mdiReply, mdiPencil, mdiContentSave, mdiCancel, mdiClose, mdiClipboardTextMultipleOutline as mdiClip} from '@mdi/js'
	import {Nav,Card, Container, Details, Icon, Input,Button, Modal} from 'svelte-chota';
	import { asyncable } from 'svelte-asyncable';
	import {sheets, times, cleanup, holidays, alert, work_types, keyValues, monthTotal} from '$js/stores'
	import {parseEntry, optional, plural, format, calcHours, mins, toInt, toHours} from "$js/formatter";
	import Avatar from "$lib/Avatar.svelte"
	import Dialog from "$lib/Dialog.svelte"
	import ListItem from "$lib/ListItem.svelte"
	import ListInput from "$lib/ListInput.svelte"
	// import TimeEntry from "$lib/TimeEntry.svelte"
	import Clipboard from "$lib/Clipboard.svelte"
	import TimesheetHeader from "$lib/TimesheetHeader.svelte"
	import TimesheetFooter from "$lib/TimesheetFooter.svelte"
	import Row from "$lib/Row.svelte"
	import Col from "$lib/Col.svelte"
	export var user, month, days, sheet, _times

	// todo in timeentry remove weekend, holiday & normal types from combo

	let types = keyValues($work_types,'type','name')
	let editing = false
	let entry = {}, totals={}
	let copy_string = 'hello there'
	$: totals = monthTotal(_times, month)

	function copyString(){		// convert timesheet to string for copying to clipboard
		var str = ''
		days.map(d=>{
			const row = [types[d.type], d.start, d.finish, d.breaks, d.remark]
			str += row.join("\t") + "\n"			// console.log(row,d)
		})
		return str
	}

function selectEntry(row){
		var {uid, start, finish, breaks} = user
		var defaults = {uid, start, finish, breaks}
		entry = {...defaults, ...row}			// nullish coalescing to avoid changing 0 to 1 for breaks
		editing = true
		console.log('opentimeentry', {defaults, row, entry, user})
	}
	function updateTime(){
		var {date,start,finish,breaks,remark='',type} = entry
		var data = {date,start,finish,breaks,remark,type, uid:user.uid}
		console.log('saving',entry)
		times.update(data, entry.id, item=>console.log('saved',data))
		editing = false
		$alert = "entry updated"
	}
	function deleteTime(){
		if (entry.id) times.collection().doc(entry.id).delete().then(item=>{
			console.log('deleted',entry,item, $times)
			$alert = "Entry deleted"
		})
	}
	function closePopup(action){
		if (action=='save') updateTime()
		if (action=='delete') deleteTime(editing = false)
	}
</script>

<Container>

	<TimesheetHeader {user} {month} {totals} {sheet} on:select />

	<div class='printonly'>
		<table>
			<tr class='mainrow'>
				<th>Date</th>
				<th>Type</th>
				<th class='center'>From</th>
				<th class='center'>To</th>
				<th class='center'>Break</th>
				<th class='center'>Total</th>
				<th class='center'>Less</th>
				<th class='center'>(A)</th>
				<th class='center'>(B)</th>
				<th class='center'>(C)</th>
				<th class='center'>(D)</th>
				<th>Remarks</th>
			</tr>
			{#each days as time (time.date)}
			<tr class={time.color ? 'greyed':''}>
				<td class="{time.color}">{time.short}</td>
				<td class="left">{optional(types[time.type ?? 'normal'])}</td>
				<td class='right'>{optional(time.start)}</td>
				<td class='right'>{optional(time.finish,'')}</td>
				<td class='right'>{optional(time.breaks,'','')}</td>
				<td class='right'>{optional(time.hours,'','')}</td>
				<td class='right'>{optional(time.less,'','')}</td>
				<td class='right'>{optional(time.a,'','')}</td>
				<td class='right'>{optional(time.b,'','')}</td>
				<td class='right'>{optional(time.c,'','')}</td>
				<td class='right'>{optional(time.d,'','')}</td>
				<td>{time.remark || time.holiday || ''}</td>
			</tr>
			{/each}
			<tr class='mainrow'>
				<td colspan=2><b>Total:</b></td>
				<td></td>
				<td></td>
				<td></td>
				<td class='right'>{optional(totals.hours,'','')}</td>
				<td class='right'>{optional(totals.less,'','')}</td>
				<td class='right'>{optional(totals.a,'','')}</td>
				<td class='right'>{optional(totals.b,'','')}</td>
				<td class='right'>{optional(totals.c,'','')}</td>
				<td class='right'>{optional(totals.d,'','')}</td>
				<td></td>
			</tr>

		</table>
	</div> 	<!-- print only -->


	<Details class="noprint" open>
		<span slot="summary">
			Timesheet for {format(month,'longmonth-year')}
		</span>

		<ListItem class='compact'>
			<Button outline class='smallbtn'><Icon src={mdiFilePdfBox} size=1.5 /> PDF</Button>
			<Button outline class='smallbtn'><Icon src={mdiMicrosoftExcel} size=1.5 />Excel</Button>
			<Button outline class='smallbtn'><Icon src={mdiEmail} size=1.5 />Email</Button>
			<Button outline class='smallbtn'>
				<Clipboard text={()=>copyString()} on:copy={(e,txt)=>{$alert="Timesheet copied to clipboard"; txt = e.detail}} on:fail={e=>console.log('failed to clipboard')} let:copytext>
				</Clipboard>
				Copy
			</Button>
			<!-- <Icon class="cursor-pointer inline" on:click={copytext} src={mdiClip}/> -->
		</ListItem>


		<div class="text-secondary"> fix dialog colors</div>

		<fieldset>
			<legend>Input fields</legend>
			<p class="grouped">
				<input type="text" name="input__text7" id="input__text7" placeholder="Username">
				<input type="text" name="input__text8" id="input__text8" placeholder="Password">
				<button class="button primary">Submit</button>
			</p>
		</fieldset>



		{#each days as time (time.date)}
		<ListItem link narrow on:click={e=>selectEntry(time)}>
			<div slot='left' class="short-date {time.color}">{time.short}</div>
			<div class="left">
				<!-- <div class="space-x-2 max-w-md md:max-w-lg truncate md:space-x-8 mr-4"> -->
				<div class="">
					<div class='col1'>
						{optional(time.start)}{optional(time.finish,'-')}
					</div>
					<div class='col2 hide-xs'>
						{optional(time.breaks,'-','hr')}
					</div>

					<div class='col3'>
						{optional(time.hours,'','hr')}
					</div>
					<div class='col4'>
						{optional(time.a,'A','hr')}
						{optional(time.b,'B','hr')}
						{optional(time.c,'C','hr')}
						{optional(time.d,'D','hr')}
					</div>
				</div>
			</div>
			<!-- <div slot='footer' class="w-11/12 md:w-full truncate text-xl"> -->
			<div slot='footer' class="">
				{time.remark || time.holiday || ''}
			</div>
	</ListItem>
		{/each}
	</Details>

	<TimesheetFooter {totals} />

</Container>



<Dialog bind:open={editing} on:submit={e=>closePopup('save')}>
	<div slot="header" class="modal-header">Time Entry</div>

    <div class='modal-content'>

				<ListInput name='date'   label="Date"   type="date"   bind:value={entry.date}    />
				<ListInput name='start'  label="Start"  type="time"   bind:value={entry.start}   />
				<ListInput name='finish' label="Finish" type="time"   bind:value={entry.finish}  />
				<ListInput name='breaks' label="Breaks (hours)" type="number" bind:value={entry.breaks} inputmode='numeric'/>
				<ListInput name='type'   label="Type"   type="select" bind:value={entry.type} options={$work_types} />
				<ListInput name='remark' label="Remarks" type="text"  bind:value={entry.remark} size=40 >
					<!-- <div slot="content" style='margin-right:8px;'><Button fill small round raised on:click={e=>entry.remark="WFH"}>WFH</Button></div> -->
				</ListInput>
				<!-- {#each items as item}
					<ListInput label={item.label} name={item.name} value={user[item.name] ?? item.def} type={item.type ?? 'text'} options={item.options} on:change={onChange} />
			{/each} -->
		</div>

		<div slot="footer" class="is-center modal-footer">
			<Button error on:click={e=>closePopup('delete')}>Delete</Button>
			<Button primary submit on:click={e=>closePopup('save')}>Save</Button>
			<Button secondary on:click={e=>editing=false}>Cancel</Button>
			<!-- <Button secondary icon={mdiClose} on:click={e=>editing=false}>Cancel</Button> -->
		</div>
</Dialog>


<!-- <Dialog bind:open={editing} modal>
	<div slot="header" class="is-center modal-header">Edit Staff</div>

  <div class='modal-content overscroll-contain'>
		{#each items as item}
			<ListInput label={item.label} name={item.name} value={user[item.name] ?? item.def} type={item.type ?? 'text'} options={item.options}
			on:change={onChange}
			/>
		{/each}
	</div>

	<div slot="footer" class="is-center modal-footer">
		<Button secondary icon={mdiClose} on:click={e=>editing=false}>Cancel</Button>
		<Button primary icon={mdiContentSave} on:click={saveUser}>Save</Button>
	</div>
</Dialog> -->


<style>

	table { font-size:8px;}

	/* .col0 {width:3em; margin-right: 8px; } */

	/* .col0 {width:4em; margin-right: 8px; } */
	.col1 {width:6em; float: left;}
	.col2 {width:3.5em; float: left;}
	.col3 {width:3em; float: left;}
	.col4 {width:3em; float: left; margin-right: 8px; }

	/* .col1 {width:6em; }
	.col2 {width:4em; }
	.col4 {width:auto; }
	.col5 {float:right; padding-left: 2em; } */
	.red { color:red; }
	.blue { color: var(--day-blue); }
	.short-date {
		width:3.0em; font-size:0.8em; border: 1px solid#ddd; border-radius:5px; padding: 4px 7px;
		text-align:center;
		line-height: 1.5rem;
		/* background-color: var(--color-lightGrey) */
	}
	.hidden { display:none;}
	.greyed { background-color: rgb(218 218 218 / 70%); }
	.thin { font-size:0.7em; }
	th, td {border: 0.5px black solid; padding:4px; }
	.mainrow {
		border-top: 2px black solid;
		border-bottom: 2px black solid;
	}
</style>
