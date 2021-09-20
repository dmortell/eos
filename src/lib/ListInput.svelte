<script context="module">
	let next_id = 0;
</script>

<script>
	// import {onMount, tick} from 'svelte'
	import {Input, Field, Icon} from 'svelte-chota';
	import {mdiChevronRight } from '@mdi/js'

	import { setContext } from 'svelte';
	import { writable } from 'svelte/store';
	import { getEventsAction } from '$js/utils';

	export var title=undefined
	export var label=title
	// export var inlineLabel=false, floatingLabel=false, autofocus=false, noStoreData=false
	export var resizable=undefined
	// export var validate=false
	// export var outline=false				// bool - input outline
	// export var clearButton=false			// bool - add clear button
	// export var input=true	 				// bool - disable to render a custom input
	// export var inputStyle=undefined			// object
	// export var wrap=undefined				// bool - wrap in <li>
	export var type='text', name, placeholder=undefined, value, inputMode=undefined, size=undefined
	export var pattern=undefined, accept=undefined
	export var autosave=undefined, disabled=false, max=undefined, min=undefined, step=undefined
	export var maxlength=undefined, minlength=undefined, multiple=false
	export var readonly=undefined, required=undefined, tabindex=undefined
	export var id=undefined							// wrapper id
	export var inputId=undefined						// wrapper id
	export var info=undefined, errorMessage=undefined
	// export var validateOnBlur=false, onValidate=e=>e
	// export var calendarParams=undefined, colorPickerParams=undefined, textEditorParams=undefined
	export var gapless=undefined, grouped=undefined
	export var options = []
	$: this_id = 'input_id_' + (inputId ?? next_id++)
	$: this_val = value
	$: this_label = label ?? title
	$: this_options = options ?? []


	// from Svelte-Chota
	const events = getEventsAction();
	const state = writable('');
	let message = false;
	setContext('field:state',state);
	$: if(gapless) grouped = true;
	$: if(typeof error === 'string'){ 		state.set('error'); message = error; }
	   else if(typeof success === 'string'){state.set('success'); message = success; }
	   else { 								state.set(''); message = false; }

	// console.log(link, $$props)
</script>

<!-- svelte-ignore a11y-label-has-associated-control -->
<!-- <div class:nomessage={!message} use:events {...$$restProps}>
	{#if label}
		<label>{label}</label>
	{/if}
	<p class:grouped class:gapless><slot/></p>
	{#if message}
		<p class="message" class:text-error={error} class:text-success={success}>{message}</p>
	{:else}
		<p class="message">&nbsp;</p>
	{/if}
</div> -->

<div class="item-row" on:click {id}>
	<!-- <Field label={this_label} for={this_id} error={errorMessage}> -->
	<div class:nomessage={!message} use:events>
		{#if this_label}<label for={this_id}>{this_label}</label>{/if}
		<p class:grouped class:gapless>
			{#if type=='select'}
				<!-- {autofocus}  -->
				<select id={this_id} value={this_val}
				{name} {type} {placeholder} {inputMode} {size} {pattern} {accept} {resizable} {autosave}
				{disabled} {max} {min} {step} {maxlength} {minlength} {multiple} {readonly} {required} {tabindex}
				on:focus on:blur on:input on:change on:inputClear on:textareaResize on:inputEmpty on:inputNotEmpty
				on:CalendarChange on:colorPickerChange on:textEditorChange>
					{#if !value}<option disabled selected>Choose</option>{/if}
					{#each this_options as option (option.type)}
					<option value={option.type} selected={option.type==this_val} disabled={option.disabled}>{option.name ?? option.type}</option>
					{/each}
				</select>
			<!-- {:else if type=='textarea'} -->
			{:else}
			<!-- {autofocus}  -->
			<Input id={this_id} value={this_val}
				{name} {type} {placeholder} {inputMode} {size} {pattern} {accept} {resizable} {autosave}
				{disabled} {max} {min} {step} {maxlength} {minlength} {multiple} {readonly} {required} {tabindex}
				on:focus on:blur on:input on:change on:inputClear on:textareaResize on:inputEmpty on:inputNotEmpty
				on:CalendarChange on:colorPickerChange on:textEditorChange
			/>
			<!-- {#if info}
				<div class="info">{info}</div>
			{/if}
			{#if errorMessage}
				<div class="error">{errorMessage}</div>
			{/if} -->
			{/if}
		</p>

		{#if message}
			<p class="message" class:text-error={errorMessage} class:text-success={info}>{message}</p>
		{:else}
			<p class="message">&nbsp;</p>
		{/if}
	</div>
	<!-- </Field> -->

	<!-- <div class="is-left">
		<slot name="title">{title}</slot>
		<slot></slot>
		<slot name="after">{after}</slot>
	</div>
	{#if link}
	<Icon src={mdiChevronRight} size="1.5" class="is-right"/>
	{/if} -->
</div>

<style>
p{ margin:0px; padding:0px; }
.message{ font-size: smaller; }
.grouped:not(.gapless){ overflow-x: auto; }

/* input:not([type=checkbox]):not([type=radio]):not([type=submit]):not([type=color]):not([type=button]):not([type=reset]), select, textarea, textarea[type=text] { */
select {
    font-family: inherit;
    padding: .8rem 1rem;
    border-radius: 4px;
    border: 1px solid var(--color-lightGrey);
    font-size: 1em;
    -webkit-transition: all .2s ease;
    transition: all .2s ease;
    display: block;
    width: 100%;
}
	.item-row {
		display: flex;
		justify-content: space-between;
		box-sizing: border-box;
	}
	/* .item-cell {
    display: block;
    align-self: center;
    box-sizing: border-box;
  } */

  /* .list .item-link .item-inner {
    padding-right: calc(var(--f7-list-chevron-icon-area) + var(--f7-list-item-padding-horizontal) + var(--f7-safe-area-right) - var(--menu-list-offset));
} */


</style>
