<script lang="ts">
	let { items = [], value = $bindable(), placeholder = '', ...props } = $props()
	let filterText = $state('')
	let listOpen = $state(false)
	let highlightIndex = $state(0)
	let inputEl: HTMLInputElement | undefined
	let listEl: HTMLDivElement | undefined = $state()

	let filteredItems = $derived(
		filterText
			? items.filter((item: string) => item.toLowerCase().includes(filterText.toLowerCase()))
			: items
	)

	function selectItem(item: string) {
		value = item
		filterText = ''
		listOpen = false
	}

	function onInput() {
		listOpen = true
		highlightIndex = 0
	}

	function onFocus() {
		filterText = ''
		listOpen = true
		highlightIndex = 0
	}

	function onKeydown(e: KeyboardEvent) {
		if (e.key === 'ArrowDown') {
			e.preventDefault()
			highlightIndex = Math.min(highlightIndex + 1, filteredItems.length - 1)
			scrollToHighlighted()
		} else if (e.key === 'ArrowUp') {
			e.preventDefault()
			highlightIndex = Math.max(highlightIndex - 1, 0)
			scrollToHighlighted()
		} else if (e.key === 'Enter') {
			e.preventDefault()
			if (filteredItems.length > 0) selectItem(filteredItems[highlightIndex])
		} else if (e.key === 'Escape') {
			listOpen = false
			filterText = ''
		}
	}

	function scrollToHighlighted() {
		const el = listEl?.children[highlightIndex] as HTMLElement
		el?.scrollIntoView({ block: 'nearest' })
	}

	function onClickOutside(e: MouseEvent) {
		if (inputEl && !inputEl.parentElement?.contains(e.target as Node)) {
			listOpen = false
			filterText = ''
		}
	}

	let displayValue = $derived(listOpen ? filterText : (value ?? ''))
</script>

<svelte:window onclick={onClickOutside} />

<div class="combo" {...props}>
	<input
		bind:this={inputEl}
		value={displayValue}
		oninput={(e) => { filterText = e.currentTarget.value; onInput() }}
		onfocus={onFocus}
		onkeydown={onKeydown}
		{placeholder}
	/>
	{#if listOpen}
		<div class="combo-list" bind:this={listEl}>
			{#if filteredItems.length > 0}
				{#each filteredItems as item, i}
					<div
						class="combo-item"
						class:highlighted={i === highlightIndex}
						role="option"
						tabindex="-1"
						aria-selected={i === highlightIndex}
						onmousedown={() => selectItem(item)}
						onmouseenter={() => highlightIndex = i}
					>{item}</div>
				{/each}
			{:else}
				<div class="combo-empty">No matches</div>
			{/if}
		</div>
	{/if}
</div>

<style>
	.combo {
		position: relative;
		display: inline-block;
	}
	input {
		padding: 0 4px;
		border-radius: 2px;
		border: 1px solid transparent;
		box-shadow: 0px 0px 0px 1px rgba(0,0,0,0.2);
		transition: border 150ms ease-in-out;
		cursor: revert;
		width: 100%;
	}
	input:focus { border-color: blue; }
	.combo-list {
		position: absolute;
		top: 100%;
		left: 0;
		right: 0;
		max-height: 200px;
		overflow-y: auto;
		background: white;
		border: 1px solid #ccc;
		border-radius: 2px;
		box-shadow: 0 2px 8px rgba(0,0,0,0.15);
		z-index: 9999;
	}
	.combo-item {
		padding: 2px 6px;
		cursor: pointer;
		font-size: 0.8rem;
	}
	.combo-item:hover, .combo-item.highlighted {
		background: #e0e7ff;
	}
	.combo-empty {
		padding: 4px 6px;
		color: #999;
		font-size: 0.8rem;
	}
</style>
