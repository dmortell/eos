<script lang="ts">
	import type { RiserRoom, Ladder, RoomKind, LadderLevel } from './types'

	let {
		selection,
		rooms,
		ladders,
		onUpdateRoom,
		onUpdateLadder,
		onDelete,
	}: {
		selection: { kind: 'room' | 'ladder'; id: string } | null
		rooms: RiserRoom[]
		ladders: Ladder[]
		onUpdateRoom: (id: string, patch: Partial<RiserRoom>) => void
		onUpdateLadder: (id: string, patch: Partial<Ladder>) => void
		onDelete: () => void
	} = $props()

	const selectedRoom = $derived(
		selection?.kind === 'room' ? rooms.find((r) => r.id === selection.id) : null,
	)
	const selectedLadder = $derived(
		selection?.kind === 'ladder' ? ladders.find((l) => l.id === selection.id) : null,
	)
</script>

<aside class="props">
	{#if selectedRoom}
		{@const r = selectedRoom}
		<header>
			<span class="kind">{r.kind === 'server' ? 'Server Room' : 'EPS Room'}</span>
			<button type="button" class="del" onclick={() => onDelete()} title="Delete">✕</button>
		</header>
		<label>
			<span>Label</span>
			<input
				type="text"
				value={r.label}
				oninput={(e) => onUpdateRoom(r.id, { label: (e.target as HTMLInputElement).value })}
			/>
		</label>
		<label>
			<span>Kind</span>
			<select
				value={r.kind}
				onchange={(e) => onUpdateRoom(r.id, { kind: (e.target as HTMLSelectElement).value as RoomKind })}
			>
				<option value="server">Server</option>
				<option value="eps">EPS</option>
			</select>
		</label>
		<label>
			<span>Floor</span>
			<input type="number" value={r.floor} disabled />
		</label>
		<label>
			<span>X (mm)</span>
			<input
				type="number"
				value={r.xMm}
				step="100"
				oninput={(e) => onUpdateRoom(r.id, { xMm: Number((e.target as HTMLInputElement).value) })}
			/>
		</label>
		<label>
			<span>Width (mm)</span>
			<input
				type="number"
				value={r.widthMm}
				min="200"
				step="100"
				oninput={(e) => onUpdateRoom(r.id, { widthMm: Number((e.target as HTMLInputElement).value) })}
			/>
		</label>
		<label>
			<span>Color</span>
			<input
				type="color"
				value={r.color ?? '#000000'}
				oninput={(e) => onUpdateRoom(r.id, { color: (e.target as HTMLInputElement).value })}
			/>
		</label>
	{:else if selectedLadder}
		{@const l = selectedLadder}
		<header>
			<span class="kind">Ladder</span>
			<button type="button" class="del" onclick={() => onDelete()} title="Delete">✕</button>
		</header>
		<label>
			<span>Label</span>
			<input
				type="text"
				value={l.label}
				oninput={(e) => onUpdateLadder(l.id, { label: (e.target as HTMLInputElement).value })}
			/>
		</label>
		<label>
			<span>Level</span>
			<select
				value={l.level}
				onchange={(e) => onUpdateLadder(l.id, { level: (e.target as HTMLSelectElement).value as LadderLevel })}
			>
				<option value="high">High only</option>
				<option value="low">Low only</option>
				<option value="both">Both (full shaft)</option>
			</select>
		</label>
		<label>
			<span>From floor</span>
			<input
				type="number"
				value={l.fromFloor}
				oninput={(e) => onUpdateLadder(l.id, { fromFloor: Number((e.target as HTMLInputElement).value) })}
			/>
		</label>
		<label>
			<span>To floor</span>
			<input
				type="number"
				value={l.toFloor}
				oninput={(e) => onUpdateLadder(l.id, { toFloor: Number((e.target as HTMLInputElement).value) })}
			/>
		</label>
		<label>
			<span>X (mm)</span>
			<input
				type="number"
				value={l.xMm}
				step="100"
				oninput={(e) => onUpdateLadder(l.id, { xMm: Number((e.target as HTMLInputElement).value) })}
			/>
		</label>
		<label>
			<span>Width (mm)</span>
			<input
				type="number"
				value={l.widthMm ?? 150}
				min="50"
				step="10"
				oninput={(e) => onUpdateLadder(l.id, { widthMm: Number((e.target as HTMLInputElement).value) })}
			/>
		</label>
		<label>
			<span>Color</span>
			<input
				type="color"
				value={l.color ?? '#6B46C1'}
				oninput={(e) => onUpdateLadder(l.id, { color: (e.target as HTMLInputElement).value })}
			/>
		</label>
	{:else}
		<div class="empty">Select a room or ladder to edit its properties.</div>
	{/if}
</aside>

<style>
	.props {
		width: 240px;
		border-left: 1px solid rgb(228, 228, 231);
		background: rgb(250, 250, 252);
		padding: 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		overflow-y: auto;
		font-size: 0.8rem;
	}
	:global(.dark) .props {
		background: rgb(24, 24, 27);
		border-left-color: rgb(39, 39, 42);
		color: rgb(212, 212, 216);
	}
	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-weight: 700;
		padding-bottom: 0.4rem;
		border-bottom: 1px solid rgb(228, 228, 231);
		margin-bottom: 0.2rem;
	}
	:global(.dark) header {
		border-bottom-color: rgb(39, 39, 42);
	}
	.kind {
		font-size: 0.75rem;
		text-transform: uppercase;
		letter-spacing: 0.05em;
		color: rgb(82, 82, 91);
	}
	:global(.dark) .kind {
		color: rgb(161, 161, 170);
	}
	.del {
		background: none;
		border: 1px solid rgb(228, 228, 231);
		border-radius: 0.25rem;
		padding: 0.05rem 0.4rem;
		cursor: pointer;
		font-size: 0.8rem;
		color: rgb(120, 30, 30);
	}
	.del:hover {
		background: rgba(220, 60, 60, 0.1);
	}
	label {
		display: flex;
		flex-direction: column;
		gap: 0.2rem;
	}
	label > span {
		font-size: 0.7rem;
		color: rgb(82, 82, 91);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	:global(.dark) label > span {
		color: rgb(161, 161, 170);
	}
	input, select {
		font: inherit;
		padding: 0.2rem 0.4rem;
		border: 1px solid rgb(212, 212, 216);
		border-radius: 0.25rem;
		background: white;
	}
	:global(.dark) input, :global(.dark) select {
		background: rgb(39, 39, 42);
		border-color: rgb(63, 63, 70);
		color: rgb(244, 244, 245);
	}
	input[type='color'] {
		padding: 0;
		height: 1.8rem;
	}
	.empty {
		color: rgb(120, 120, 130);
		font-style: italic;
		text-align: center;
		padding: 1rem 0.5rem;
	}
</style>
