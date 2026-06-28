<script lang="ts">
	import { Icon } from '$lib'

	let {
		drawings = [],
		activeId = '',
		onSelect,
		onNew,
		onRename,
		onDelete,
	}: {
		drawings?: { id: string; name?: string }[]
		activeId?: string
		onSelect?: (id: string) => void
		onNew?: () => void
		onRename?: (id: string, name: string) => void
		onDelete?: (id: string) => void
	} = $props()

	let open = $state(false)
	let menuEl: HTMLDetailsElement | null = $state(null)
	let renamingId = $state<string | null>(null)
	let renameValue = $state('')

	const nameOf = (d: { id: string; name?: string }, i: number) =>
		d.name?.trim() || `Riser ${i + 1}`
	const activeName = $derived.by(() => {
		const i = drawings.findIndex((d) => d.id === activeId)
		return i >= 0 ? nameOf(drawings[i], i) : 'Riser'
	})

	function pick(id: string) {
		if (id !== activeId) onSelect?.(id)
		open = false
	}
	function startRename(id: string, current: string) {
		renamingId = id
		renameValue = current
	}
	function commitRename() {
		if (renamingId && renameValue.trim()) onRename?.(renamingId, renameValue.trim())
		renamingId = null
	}

	// Close on outside click.
	$effect(() => {
		if (!open) return
		const onDoc = (e: MouseEvent) => {
			if (menuEl && !menuEl.contains(e.target as Node)) open = false
		}
		document.addEventListener('mousedown', onDoc)
		return () => document.removeEventListener('mousedown', onDoc)
	})
</script>

<details class="drawing-picker" bind:this={menuEl} bind:open>
	<summary title="Switch riser drawing">
		<Icon name="layers" size={14} />
		<span class="name">{activeName}</span>
		<Icon name="chevronDown" size={12} />
	</summary>
	<div class="pop">
		<ul>
			{#each drawings as d, i (d.id)}
				<li class:active={d.id === activeId}>
					{#if renamingId === d.id}
						<!-- svelte-ignore a11y_autofocus -->
						<input
							class="rename"
							bind:value={renameValue}
							autofocus
							onkeydown={(e) => {
								if (e.key === 'Enter') { e.preventDefault(); commitRename() }
								else if (e.key === 'Escape') { e.preventDefault(); renamingId = null }
							}}
							onblur={commitRename}
						/>
					{:else}
						<button type="button" class="pick" onclick={() => pick(d.id)}>
							{nameOf(d, i)}
						</button>
						<button type="button" class="icon" title="Rename" onclick={(e) => { e.stopPropagation(); startRename(d.id, nameOf(d, i)) }}>
							<Icon name="edit" size={13} />
						</button>
						{#if drawings.length > 1}
							<button type="button" class="icon danger" title="Delete drawing" onclick={(e) => { e.stopPropagation(); if (confirm(`Delete "${nameOf(d, i)}"? This cannot be undone.`)) onDelete?.(d.id) }}>
								<Icon name="trash" size={13} />
							</button>
						{/if}
					{/if}
				</li>
			{/each}
		</ul>
		<button type="button" class="new" onclick={() => { open = false; onNew?.() }}>
			<Icon name="plus" size={13} /> New drawing
		</button>
	</div>
</details>

<style>
	.drawing-picker {
		position: relative;
		font-size: 0.8rem;
	}
	summary {
		display: inline-flex;
		align-items: center;
		gap: 0.35rem;
		padding: 0.2rem 0.6rem;
		border: 1px solid rgb(212, 212, 216);
		border-radius: 0.375rem;
		background: white;
		color: rgb(24, 24, 27);
		cursor: pointer;
		list-style: none;
		max-width: 16rem;
	}
	summary:hover { background: rgb(244, 244, 245); }
	summary::-webkit-details-marker { display: none; }
	.name {
		max-width: 11rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
		font-weight: 500;
	}
	:global(.dark) summary {
		background: rgb(39, 39, 42);
		border-color: rgb(63, 63, 70);
		color: rgb(228, 228, 231);
	}
	.pop {
		position: absolute;
		top: calc(100% + 4px);
		left: 0;
		z-index: 40;
		min-width: 14rem;
		background: white;
		color: rgb(24, 24, 27);
		border: 1px solid rgb(212, 212, 216);
		border-radius: 0.5rem;
		box-shadow: 0 8px 24px rgba(0, 0, 0, 0.12);
		padding: 0.3rem;
	}
	:global(.dark) .pop {
		background: rgb(24, 24, 27);
		color: rgb(228, 228, 231);
		border-color: rgb(63, 63, 70);
	}
	ul { list-style: none; margin: 0; padding: 0; }
	li {
		display: flex;
		align-items: center;
		gap: 0.15rem;
		border-radius: 0.375rem;
	}
	li.active { background: rgba(59, 130, 246, 0.1); }
	.pick {
		flex: 1;
		text-align: left;
		background: none;
		border: none;
		padding: 0.35rem 0.5rem;
		cursor: pointer;
		color: inherit;
		border-radius: 0.375rem;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	li.active .pick { font-weight: 600; color: rgb(37, 99, 235); }
	.pick:hover { background: rgba(120, 120, 140, 0.12); }
	.icon {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		padding: 0.3rem;
		background: none;
		border: none;
		cursor: pointer;
		color: rgb(113, 113, 122);
		border-radius: 0.3rem;
	}
	.icon:hover { background: rgba(120, 120, 140, 0.15); color: rgb(24, 24, 27); }
	.icon.danger:hover { color: rgb(220, 38, 38); }
	:global(.dark) .icon:hover { color: rgb(244, 244, 245); }
	.rename {
		flex: 1;
		padding: 0.3rem 0.4rem;
		border: 1px solid rgb(59, 130, 246);
		border-radius: 0.375rem;
		font: inherit;
		background: white;
		color: black;
	}
	.new {
		display: flex;
		align-items: center;
		gap: 0.35rem;
		width: 100%;
		margin-top: 0.25rem;
		padding: 0.4rem 0.5rem;
		background: none;
		border: none;
		border-top: 1px solid rgb(228, 228, 231);
		cursor: pointer;
		color: rgb(37, 99, 235);
		font: inherit;
		border-radius: 0 0 0.375rem 0.375rem;
	}
	.new:hover { background: rgba(59, 130, 246, 0.1); }
	:global(.dark) .new { border-top-color: rgb(39, 39, 42); }
</style>
