<script lang="ts">
	import CableEditor from './CableEditor.svelte'
	import CableList from './CableList.svelte'
	import PropertiesPanel from './PropertiesPanel.svelte'
	import type { Cable, Ladder, RiserRoom, TextLabel } from './types'

	let {
		selection,
		cables,
		rooms,
		ladders,
		labels: _labels,
		onUpdateCable,
		onDeleteCable,
		onUpdateRoom,
		onUpdateLadder,
		onUpdateLabel,
		onDeleteLabel,
		onDeleteSelected,
		onSelectCable,
		onStartNewCable,
	}: {
		selection: { kind: 'room' | 'ladder' | 'cable' | 'label'; id: string } | null
		cables: Cable[]
		rooms: RiserRoom[]
		ladders: Ladder[]
		labels: TextLabel[]
		onUpdateCable: (id: string, patch: Partial<Cable>) => void
		onDeleteCable: (id: string) => void
		onUpdateRoom: (id: string, patch: Partial<RiserRoom>) => void
		onUpdateLadder: (id: string, patch: Partial<Ladder>) => void
		onUpdateLabel: (id: string, patch: Partial<TextLabel>) => void
		onDeleteLabel: (id: string) => void
		onDeleteSelected: () => void
		onSelectCable: (id: string) => void
		onStartNewCable: () => void
	} = $props()

	const selectedCable = $derived(
		selection?.kind === 'cable' ? cables.find((c) => c.id === selection.id) ?? null : null,
	)
	const selectedLabel = $derived(
		selection?.kind === 'label' ? _labels.find((l) => l.id === selection.id) ?? null : null,
	)
	const propsSelection = $derived<{ kind: 'room' | 'ladder'; id: string } | null>(
		selection?.kind === 'room' || selection?.kind === 'ladder'
			? { kind: selection.kind, id: selection.id }
			: null,
	)
</script>

<aside class="sidebar">
	{#if selectedCable}
		<CableEditor
			cable={selectedCable}
			{rooms}
			{ladders}
			onUpdate={(patch) => onUpdateCable(selectedCable!.id, patch)}
			onDelete={() => onDeleteCable(selectedCable!.id)}
		/>
	{:else if selectedLabel}
		{@const l = selectedLabel}
		<div class="label-editor">
			<header>
				<span class="kind">Label</span>
				<button type="button" class="del" onclick={() => onDeleteLabel(l.id)} title="Delete">✕</button>
			</header>
			<label>
				<span>Text (multi-line)</span>
				<textarea
					rows="5"
					value={l.text}
					oninput={(e) => onUpdateLabel(l.id, { text: (e.target as HTMLTextAreaElement).value })}
				></textarea>
			</label>
			<div class="row">
				<label>
					<span>Font (mm)</span>
					<input
						type="number"
						min="40"
						step="20"
						value={l.fontSizeMm ?? 240}
						oninput={(e) => onUpdateLabel(l.id, { fontSizeMm: Number((e.target as HTMLInputElement).value) })}
					/>
				</label>
				<label>
					<span>Width (mm, 0=auto)</span>
					<input
						type="number"
						min="0"
						step="100"
						value={l.widthMm ?? 0}
						oninput={(e) => onUpdateLabel(l.id, { widthMm: Number((e.target as HTMLInputElement).value) || undefined })}
					/>
				</label>
			</div>
			<div class="row">
				<label>
					<span>Color</span>
					<input
						type="color"
						value={l.color ?? '#1f2937'}
						oninput={(e) => onUpdateLabel(l.id, { color: (e.target as HTMLInputElement).value })}
					/>
				</label>
				<label>
					<span>Background</span>
					<input
						type="text"
						placeholder="transparent / #fff"
						value={l.background ?? ''}
						oninput={(e) => onUpdateLabel(l.id, { background: (e.target as HTMLInputElement).value || undefined })}
					/>
				</label>
			</div>
			<div class="row">
				<label>
					<span>X (mm)</span>
					<input
						type="number"
						step="100"
						value={l.xMm}
						oninput={(e) => onUpdateLabel(l.id, { xMm: Number((e.target as HTMLInputElement).value) })}
					/>
				</label>
				<label>
					<span>Y (mm)</span>
					<input
						type="number"
						step="100"
						value={l.yMm}
						oninput={(e) => onUpdateLabel(l.id, { yMm: Number((e.target as HTMLInputElement).value) })}
					/>
				</label>
			</div>
		</div>
	{:else}
		<PropertiesPanel
			selection={propsSelection}
			{rooms}
			{ladders}
			onUpdateRoom={onUpdateRoom}
			onUpdateLadder={onUpdateLadder}
			onDelete={onDeleteSelected}
		/>
	{/if}
	<div class="sidebar-divider"></div>
	<CableList
		{cables}
		{rooms}
		selectedId={selection?.kind === 'cable' ? selection.id : null}
		onSelect={onSelectCable}
		onAddCable={onStartNewCable}
	/>
</aside>

<style>
	.sidebar {
		width: 320px;
		flex-shrink: 0;
		border-left: 1px solid rgb(228, 228, 231);
		background: white;
		display: flex;
		flex-direction: column;
		overflow-y: auto;
		font-size: 0.85rem;
	}
	:global(.dark) .sidebar {
		background: rgb(24, 24, 27);
		border-left-color: rgb(63, 63, 70);
		color: rgb(244, 244, 245);
	}
	.sidebar-divider {
		height: 1px;
		background: rgb(228, 228, 231);
		margin: 0.5rem 0;
		flex-shrink: 0;
	}
	:global(.dark) .sidebar-divider {
		background: rgb(63, 63, 70);
	}
	.label-editor {
		padding: 0.5rem 0.75rem;
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
	}
	.label-editor header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding-bottom: 0.3rem;
		border-bottom: 1px solid rgb(228, 228, 231);
	}
	:global(.dark) .label-editor header {
		border-bottom-color: rgb(63, 63, 70);
	}
	.label-editor .kind {
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: rgb(82, 82, 91);
	}
	:global(.dark) .label-editor .kind {
		color: rgb(161, 161, 170);
	}
	.label-editor .del {
		background: none;
		border: none;
		color: rgb(244, 63, 94);
		cursor: pointer;
		font-size: 0.9rem;
	}
	.label-editor label {
		display: flex;
		flex-direction: column;
		gap: 0.15rem;
		font-size: 0.75rem;
		color: rgb(82, 82, 91);
	}
	:global(.dark) .label-editor label {
		color: rgb(212, 212, 216);
	}
	.label-editor input,
	.label-editor textarea {
		padding: 0.2rem 0.4rem;
		border: 1px solid rgb(212, 212, 216);
		border-radius: 0.25rem;
		background: white;
		font-size: 0.8rem;
	}
	:global(.dark) .label-editor input,
	:global(.dark) .label-editor textarea {
		background: rgb(39, 39, 42);
		border-color: rgb(63, 63, 70);
		color: rgb(244, 244, 245);
	}
	.label-editor .row {
		display: grid;
		grid-template-columns: 1fr 1fr;
		gap: 0.4rem;
	}
</style>
