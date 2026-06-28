<script lang="ts">
	import type { Cable, CableLevel, CableSegment, Ladder, RiserRoom } from './types'
	import { validateRoute } from './engine'

	let {
		cable,
		rooms,
		ladders,
		onUpdate,
		onDelete,
	}: {
		cable: Cable
		rooms: RiserRoom[]
		ladders: Ladder[]
		onUpdate: (patch: Partial<Cable>) => void
		onDelete: () => void
	} = $props()

	const issues = $derived(validateRoute(cable, { rooms, ladders }))

	function updateSegment(i: number, patch: Partial<CableSegment>) {
		const next = [...cable.segments]
		next[i] = { ...next[i], ...patch }
		onUpdate({ segments: next })
	}

	function addSegmentAfter(i: number) {
		const next = [...cable.segments]
		// Insert a new placeholder hop after i. The new segment starts with no room.
		next.splice(i + 1, 0, { roomId: rooms[0]?.id ?? '', level: 'high' })
		onUpdate({ segments: next })
	}

	function removeSegment(i: number) {
		if (cable.segments.length <= 2) return
		const next = cable.segments.filter((_, idx) => idx !== i)
		onUpdate({ segments: next })
	}

	function moveSegment(i: number, dir: -1 | 1) {
		const j = i + dir
		if (j < 0 || j >= cable.segments.length) return
		const next = [...cable.segments]
		;[next[i], next[j]] = [next[j], next[i]]
		onUpdate({ segments: next })
	}

	function parseTypeIntoFields(typ: string) {
		const t = typ.toUpperCase()
		const media = /OM\d|OS\d|SMF|MMF|FIBER/.test(t) ? 'fiber' : /CAT|UTP|STP|COAX/.test(t) ? 'copper' : undefined
		const countMatch = t.match(/(\d+)\s*(CORE|PORT|PAIR)?/)
		const count = countMatch ? Number(countMatch[1]) : undefined
		const unitWord = countMatch?.[2]
		const countUnit = unitWord === 'PORT' ? 'port' : unitWord === 'PAIR' ? 'pair' : count ? 'core' : undefined
		const specMatch = t.match(/OM\d|OS\d|CAT\s?\d[A-Z]?/)
		const mediaSpec = specMatch?.[0]?.replace(/\s+/g, '')
		return { media, count, countUnit, mediaSpec }
	}

	function onTypeChange(v: string) {
		const parsed = parseTypeIntoFields(v)
		onUpdate({ type: v, ...parsed } as Partial<Cable>)
	}

	function issueFor(i: number) {
		return issues.filter((iss) => iss.segmentIndex === i)
	}
</script>

<div class="editor">
	<header>
		<span class="kind">Cable</span>
	</header>

	<label>
		<span>Type / Spec</span>
		<input
			type="text"
			placeholder="OM4 48-core"
			value={cable.type}
			oninput={(e) => onTypeChange((e.target as HTMLInputElement).value)}
		/>
	</label>

	<label>
		<span>Label (optional)</span>
		<input
			type="text"
			placeholder="auto"
			value={cable.label ?? ''}
			oninput={(e) => onUpdate({ label: (e.target as HTMLInputElement).value || undefined })}
		/>
	</label>

	<label>
		<span>Color</span>
		<input
			type="color"
			value={cable.color ?? '#14b8a6'}
			oninput={(e) => onUpdate({ color: (e.target as HTMLInputElement).value })}
		/>
	</label>

	<div class="hops">
		<div class="hops-header">Route</div>

		{#each cable.segments as seg, i (i)}
			{@const isLast = i === cable.segments.length - 1}
			{@const segIssues = issueFor(i)}
			<div class="hop" class:has-error={segIssues.some((x) => x.severity === 'error')}>
				<div class="hop-row">
					<span class="hop-num">{i + 1}.</span>
					<select
						value={seg.roomId}
						onchange={(e) => updateSegment(i, { roomId: (e.target as HTMLSelectElement).value })}
					>
						<option value="">— pick room —</option>
						{#each rooms as r (r.id)}
							<option value={r.id}>
								{r.kind === 'server' ? '[SER]' : '[EPS]'} {r.label} · F{r.floor}
							</option>
						{/each}
					</select>
					<div class="hop-actions">
						<button type="button" title="Move up" disabled={i === 0} onclick={() => moveSegment(i, -1)}>↑</button>
						<button type="button" title="Move down" disabled={isLast} onclick={() => moveSegment(i, 1)}>↓</button>
						<button type="button" title="Remove hop" disabled={cable.segments.length <= 2} onclick={() => removeSegment(i)}>✕</button>
					</div>
				</div>
				{#if i > 0}
					<label class="inline">
						<span>Enters at</span>
						<select
							value={seg.entryLevel ?? cable.segments[i - 1].level ?? 'high'}
							onchange={(e) => updateSegment(i, { entryLevel: (e.target as HTMLSelectElement).value as CableLevel })}
						>
							<option value="high">High</option>
							<option value="low">Low</option>
						</select>
					</label>
				{/if}
				{#if !isLast}
					<div class="hop-sub">
						<label class="inline">
							<span>Exits at</span>
							<select
								value={seg.level ?? 'high'}
								onchange={(e) => updateSegment(i, { level: (e.target as HTMLSelectElement).value as CableLevel })}
							>
								<option value="high">High</option>
								<option value="low">Low</option>
							</select>
						</label>
						<label class="inline">
							<span>Via ladder</span>
							<select
								value={seg.ladderId ?? ''}
								onchange={(e) => updateSegment(i, { ladderId: (e.target as HTMLSelectElement).value || undefined })}
							>
								<option value="">— pick ladder —</option>
								{#each ladders as l (l.id)}
									<option value={l.id}>{l.label} ({Math.min(l.fromFloor, l.toFloor)}–{Math.max(l.fromFloor, l.toFloor)})</option>
								{/each}
							</select>
						</label>
					</div>
					<button class="add-hop" type="button" onclick={() => addSegmentAfter(i)}>+ Insert hop below</button>
				{:else}
					<div class="hop-sub muted">— arrives here</div>
				{/if}
				{#each segIssues as iss}
					<div class="issue {iss.severity}">{iss.message}</div>
				{/each}
			</div>
		{/each}
	</div>

	<button type="button" class="del-btn" onclick={() => onDelete()}>
		<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
		Delete cable
	</button>
</div>

<style>
	.editor {
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}
	header {
		display: flex;
		justify-content: space-between;
		align-items: center;
		font-weight: 700;
		padding-bottom: 0.4rem;
		border-bottom: 1px solid rgb(228, 228, 231);
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
	.del-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.4rem;
		width: 100%;
		margin-top: 0.25rem;
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
		font-size: 0.8rem;
	}
	label > span {
		font-size: 0.7rem;
		color: rgb(82, 82, 91);
		text-transform: uppercase;
		letter-spacing: 0.04em;
	}
	label.inline {
		flex-direction: row;
		align-items: center;
		gap: 0.4rem;
		flex: 1;
	}
	label.inline > span {
		min-width: 60px;
	}
	input, select {
		font: inherit;
		padding: 0.2rem 0.4rem;
		border: 1px solid rgb(212, 212, 216);
		border-radius: 0.25rem;
		background: white;
		min-width: 0;
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
	.hops {
		display: flex;
		flex-direction: column;
		gap: 0.4rem;
		margin-top: 0.3rem;
	}
	.hops-header {
		font-size: 0.7rem;
		text-transform: uppercase;
		letter-spacing: 0.04em;
		color: rgb(82, 82, 91);
		font-weight: 600;
	}
	.hop {
		border: 1px solid rgb(228, 228, 231);
		border-radius: 0.35rem;
		padding: 0.4rem;
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		background: rgba(255, 255, 255, 0.4);
	}
	:global(.dark) .hop {
		background: rgba(0, 0, 0, 0.2);
		border-color: rgb(63, 63, 70);
	}
	.hop.has-error {
		border-color: rgb(220, 38, 38);
		background: rgba(254, 226, 226, 0.5);
	}
	.hop-row {
		display: flex;
		align-items: center;
		gap: 0.3rem;
	}
	.hop-num {
		font-weight: 700;
		min-width: 16px;
	}
	.hop-sub {
		display: flex;
		flex-direction: column;
		gap: 0.3rem;
		padding-left: 22px;
	}
	.hop-sub.muted {
		font-style: italic;
		color: rgb(120, 120, 130);
		font-size: 0.75rem;
	}
	.hop-actions {
		display: flex;
		gap: 0.2rem;
	}
	.hop-actions button {
		background: none;
		border: 1px solid rgb(228, 228, 231);
		border-radius: 0.2rem;
		padding: 0 0.3rem;
		cursor: pointer;
		font-size: 0.8rem;
		color: rgb(82, 82, 91);
	}
	.hop-actions button:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}
	.add-hop {
		background: none;
		border: 1px dashed rgb(160, 160, 180);
		border-radius: 0.2rem;
		padding: 0.2rem;
		cursor: pointer;
		font-size: 0.7rem;
		color: rgb(82, 82, 91);
		margin-left: 22px;
	}
	.add-hop:hover {
		background: rgba(120, 120, 140, 0.08);
	}
	.issue {
		font-size: 0.7rem;
		padding: 0.15rem 0.3rem;
		border-radius: 0.2rem;
	}
	.issue.error {
		background: rgba(220, 38, 38, 0.15);
		color: rgb(153, 27, 27);
	}
	.issue.warning {
		background: rgba(245, 158, 11, 0.15);
		color: rgb(146, 64, 14);
	}
</style>
