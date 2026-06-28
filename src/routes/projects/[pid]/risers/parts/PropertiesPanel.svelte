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
			<span>Exit Level</span>
			<!-- Adds a label indicating whether that riser/trunk serves only the high path (above-ceiling plenum), only the low path (under raised floor), or the full shaft. -->
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
				value={l.widthMm ?? 450}
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
		<div class="empty">No selection.</div>
	{/if}

	{#if selectedRoom || selectedLadder}
		<button type="button" class="del-btn" onclick={() => onDelete()}>
			<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
			Delete {selectedRoom ? (selectedRoom.kind === 'server' ? 'server room' : 'EPS room') : 'ladder'}
		</button>
	{/if}
</aside>

<style>
	.props {
		padding: 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
		font-size: 0.8rem;
		background: transparent;
	}
	:global(.dark) .props {
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
	.del-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		width: 100%;
		margin-top: 0.5rem;
		padding: 0.45rem 0.5rem;
		border: 1px solid rgb(220, 38, 38);
		border-radius: 0.35rem;
		background: rgb(239, 68, 68);
		color: white;
		font-size: 0.8rem;
		font-weight: 600;
		cursor: pointer;
		transition: background 0.12s;
	}
	.del-btn:hover {
		background: rgb(220, 38, 38);
	}
	:global(.dark) .del-btn {
		background: rgb(220, 38, 38);
		border-color: rgb(248, 113, 113);
	}
	:global(.dark) .del-btn:hover {
		background: rgb(185, 28, 28);
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
		font-size: 0.7rem;
		padding: 0.25rem 0;
	}
</style>
