<script lang="ts">
	/**
	 * Labels v2 L4 — review + apply a Sync-labels re-bake.
	 * Nothing is written until Apply; each row is opt-in. Stale rows default
	 * checked EXCEPT on printed panels (physical labels installed — desyncing
	 * them is a deliberate act). Orphaned rows default unchecked; checking one
	 * REMOVES the baked string.
	 */
	import { Icon } from '$lib'
	import type { ElevationsEditor } from '../editor.svelte'

	let { editor, onclose }: { editor: ElevationsEditor; onclose: () => void } = $props()

	let plan = $derived(editor.syncPlan)
	let actionable = $derived(plan.rows.filter(r => r.reason !== 'ok'))
	// Seeded once at mount (the dialog is created per open): stale rows on
	// unprinted panels start checked, everything else opt-in.
	let checked = $state<Set<string>>(new Set(
		editor.syncPlan.rows.filter(r => r.reason === 'stale' && !r.printed).map(r => r.key),
	))

	function toggle(key: string) {
		const next = new Set(checked)
		next.has(key) ? next.delete(key) : next.add(key)
		checked = next
	}

	let printedChecked = $derived(actionable.filter(r => r.printed && checked.has(r.key)).length)

	function apply() {
		editor.applySyncPlan([...checked])
		onclose()
	}

	const reasonBadge: Record<string, string> = {
		stale: 'bg-blue-50 text-blue-600 border-blue-200',
		orphaned: 'bg-red-50 text-red-500 border-red-200',
		'out-of-range': 'bg-amber-50 text-amber-600 border-amber-200',
	}
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<!-- svelte-ignore a11y_click_events_have_key_events -->
<div class="fixed inset-0 bg-black/30 z-50 flex items-center justify-center print:hidden" onclick={onclose}>
	<div class="bg-white rounded-lg shadow-xl border border-gray-200 p-4 w-[560px] max-h-[80vh] flex flex-col" onclick={e => e.stopPropagation()}>
		<div class="flex items-center gap-2 mb-2">
			<Icon name="refresh" size={14} />
			<span class="text-sm font-semibold text-gray-700">Sync labels</span>
			<div class="flex-1"></div>
			<span class="text-[11px] text-gray-400">{plan.staleCount} stale · {plan.orphanCount} orphaned</span>
		</div>

		<div class="text-[11px] text-gray-500 mb-2 leading-snug">
			Re-bakes checked labels from current location data + format. Checked <b>orphaned/out-of-range</b> rows are removed instead.
			Rows on <b>printed</b> panels start unchecked — re-baking them desyncs the physical labels.
		</div>

		<div class="flex-1 overflow-y-auto border border-gray-100 rounded">
			<table class="w-full text-[11px]">
				<thead class="sticky top-0 bg-gray-50 text-gray-500">
					<tr class="text-left">
						<th class="px-2 py-1 w-6"></th>
						<th class="px-2 py-1">Panel · port</th>
						<th class="px-2 py-1">Current</th>
						<th class="px-2 py-1">New</th>
						<th class="px-2 py-1 w-20"></th>
					</tr>
				</thead>
				<tbody>
					{#each actionable as r (r.key)}
						<tr class="border-t border-gray-100 {r.printed ? 'bg-amber-50/50' : ''}">
							<td class="px-2 py-1">
								<input type="checkbox" checked={checked.has(r.key)} onchange={() => toggle(r.key)} />
							</td>
							<td class="px-2 py-1 whitespace-nowrap">
								{r.rackLabel} · {r.deviceLabel} : {r.portIndex}
								{#if r.printed}<span class="text-amber-500" title="Labels printed/installed on this panel">🖶</span>{/if}
							</td>
							<td class="px-2 py-1 font-mono">{r.oldLabel}</td>
							<td class="px-2 py-1 font-mono">{r.newLabel ?? '— remove —'}</td>
							<td class="px-2 py-1">
								<span class="px-1 rounded border text-[10px] {reasonBadge[r.reason]}">{r.reason}</span>
							</td>
						</tr>
					{/each}
					{#if actionable.length === 0}
						<tr><td colspan="5" class="px-2 py-3 text-center text-gray-400">Everything is in sync.</td></tr>
					{/if}
				</tbody>
			</table>
		</div>

		{#if printedChecked > 0}
			<div class="mt-2 text-[11px] text-amber-600 font-medium">
				⚠ {printedChecked} checked row{printedChecked !== 1 ? 's are' : ' is'} on printed panels — physical labels will no longer match.
			</div>
		{/if}

		<div class="flex gap-2 justify-end mt-3">
			<button class="px-3 py-1.5 text-xs rounded border border-gray-200 hover:bg-gray-50" onclick={onclose}>Cancel</button>
			<button class="px-3 py-1.5 text-xs rounded bg-blue-600 text-white hover:bg-blue-500 disabled:opacity-40"
				disabled={checked.size === 0} onclick={apply}>Apply {checked.size || ''}</button>
		</div>
	</div>
</div>
