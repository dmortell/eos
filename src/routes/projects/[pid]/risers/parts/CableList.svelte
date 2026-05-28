<script lang="ts">
	import type { Cable, RiserRoom } from './types'

	let {
		cables,
		rooms,
		selectedId,
		onSelect,
		onAddCable,
	}: {
		cables: Cable[]
		rooms: RiserRoom[]
		selectedId?: string | null
		onSelect: (id: string) => void
		onAddCable: () => void
	} = $props()

	const roomById = $derived(new Map(rooms.map((r) => [r.id, r])))

	function summary(c: Cable): string {
		const first = roomById.get(c.segments[0]?.roomId ?? '')
		const last = roomById.get(c.segments[c.segments.length - 1]?.roomId ?? '')
		const a = first ? `${first.label}/F${first.floor}` : '?'
		const b = last ? `${last.label}/F${last.floor}` : '?'
		const hops = c.segments.length - 1
		return `${a} → ${b}${hops > 1 ? ` (${hops - 1} transit)` : ''}`
	}
</script>

<section class="cable-list">
	<header>
		<span class="title">Cables ({cables.length})</span>
		<button type="button" class="add" onclick={onAddCable}>+ New</button>
	</header>
	{#if cables.length === 0}
		<div class="empty">No cables yet. Use the "Cable" mode to draw a route or click "+ New".</div>
	{:else}
		<ul>
			{#each cables as c (c.id)}
				<li class:selected={c.id === selectedId}>
					<button type="button" class="row" onclick={() => onSelect(c.id)}>
						<span class="swatch" style:background={c.color ?? '#14b8a6'}></span>
						<span class="meta">
							<span class="cable-type">{c.label || c.type || '(untitled)'}</span>
							<span class="cable-route">{summary(c)}</span>
						</span>
					</button>
				</li>
			{/each}
		</ul>
	{/if}
</section>

<style>
	.cable-list {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		font-size: 0.8rem;
	}
	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		padding-bottom: 0.3rem;
		border-bottom: 1px solid rgb(228, 228, 231);
	}
	:global(.dark) header {
		border-bottom-color: rgb(39, 39, 42);
	}
	.title {
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		font-weight: 700;
		color: rgb(82, 82, 91);
	}
	.add {
		background: none;
		border: 1px solid rgb(212, 212, 216);
		border-radius: 0.25rem;
		padding: 0.1rem 0.5rem;
		cursor: pointer;
		font-size: 0.75rem;
	}
	.add:hover {
		background: rgba(120, 120, 140, 0.1);
	}
	.empty {
		color: rgb(120, 120, 130);
		font-style: italic;
		padding: 0.5rem 0.3rem;
		font-size: 0.75rem;
	}
	ul {
		list-style: none;
		padding: 0;
		margin: 0;
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}
	li.selected .row {
		background: rgba(59, 130, 246, 0.15);
		border-color: rgb(59, 130, 246);
	}
	.row {
		display: flex;
		align-items: center;
		gap: 0.4rem;
		width: 100%;
		padding: 0.3rem 0.4rem;
		border: 1px solid transparent;
		border-radius: 0.25rem;
		background: none;
		cursor: pointer;
		text-align: left;
	}
	.row:hover {
		background: rgba(120, 120, 140, 0.08);
	}
	.swatch {
		width: 10px;
		height: 24px;
		border-radius: 2px;
		flex-shrink: 0;
	}
	.meta {
		display: flex;
		flex-direction: column;
		gap: 0.05rem;
		min-width: 0;
		flex: 1;
	}
	.cable-type {
		font-weight: 600;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
	.cable-route {
		font-size: 0.7rem;
		color: rgb(120, 120, 130);
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}
</style>
