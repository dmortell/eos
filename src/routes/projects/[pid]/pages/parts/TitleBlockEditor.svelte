<script lang="ts">
	// The PROJECT's title-block template (titleBlock.ts, drawings-plan phase 5), edited from a sheet's page
	// Properties: logo text, then the fields in order — relabel, full-width or half, move, remove, add an
	// auto-filled field or a custom one with fixed text. Every change calls `onchange` with the whole template
	// (the store saves `projects/{pid}.pages.titleBlock`; every sheet of the project re-renders from it).
	import { Icon } from '$lib'
	import { TB_AUTO, DEFAULT_TITLE_BLOCK, type TitleBlockTemplate, type TbField, type TbAutoKey, type TbCompany, type TbSection } from '../titleBlock'

	let { template, onchange }: { template: TitleBlockTemplate | undefined; onchange: (t: TitleBlockTemplate) => void } = $props()
	const t = $derived(template?.fields?.length ? template : DEFAULT_TITLE_BLOCK)
	const set = (patch: Partial<TitleBlockTemplate>) => onchange({ ...t, logo: t.logo ?? '', fields: t.fields.map((f) => ({ ...f })), ...patch })
	const setCompany = (patch: Partial<TbCompany>) => set({ company: { ...t.company, ...patch } })
	const SECTIONS: [TbSection, string][] = [['logo', 'Logo'], ['company', 'Company'], ['fields', 'Fields'], ['revisions', 'Revisions']]
	const shows = (s: TbSection) => !t.hidden?.includes(s)
	const toggle = (s: TbSection) => set({ hidden: shows(s) ? [...(t.hidden ?? []), s] : (t.hidden ?? []).filter((x) => x !== s) })
	const setField = (i: number, patch: Partial<TbField>) => set({ fields: t.fields.map((f, j) => (j === i ? { ...f, ...patch } : f)) })
	function move(i: number, d: -1 | 1) {
		const fs = [...t.fields], j = i + d; if (j < 0 || j >= fs.length) return
		;[fs[i], fs[j]] = [fs[j], fs[i]]; set({ fields: fs })
	}
	const remove = (i: number) => set({ fields: t.fields.filter((_, j) => j !== i) })
	function add(key: string) {
		if (!key) return
		const f: TbField = key === 'custom' ? { key: 'custom', label: 'Note', value: '' } : { key: key as TbAutoKey, label: TB_AUTO[key as TbAutoKey] }
		set({ fields: [...t.fields, f] })
	}
	const val = (e: Event) => (e.currentTarget as HTMLInputElement).value
	const blurOnEnter = (e: KeyboardEvent) => { if (e.key === 'Enter') (e.currentTarget as HTMLInputElement).blur() }
</script>

<div class="prop-sec">TITLE BLOCK · project template</div>
<div class="prop"><span>Show</span>
	<div class="chips">
		{#each SECTIONS as [s, label] (s)}<button class:on={shows(s)} title="{shows(s) ? 'Hide' : 'Show'} the {label.toLowerCase()} on every sheet" onclick={() => toggle(s)}>{label}</button>{/each}
		<button class:on={t.border} title="Print a hairline border along the paper margin (off = a screen-only guide)" onclick={() => set({ border: !t.border })}>Border</button>
	</div>
</div>
<div class="prop"><span>Logo</span><input value={t.logo ?? ''} placeholder="(none)" onchange={(e) => set({ logo: val(e) })} onkeydown={blurOnEnter} /></div>
<div class="prop"><span>Company</span><input value={t.company?.name ?? ''} placeholder="Name" onchange={(e) => setCompany({ name: val(e) })} onkeydown={blurOnEnter} /></div>
<div class="prop"><span></span><input value={t.company?.address ?? ''} placeholder="Address" onchange={(e) => setCompany({ address: val(e) })} onkeydown={blurOnEnter} /></div>
<div class="prop"><span></span><input value={t.company?.contact ?? ''} placeholder="Tel / email" onchange={(e) => setCompany({ contact: val(e) })} onkeydown={blurOnEnter} /></div>
{#each t.fields as f, i (i)}
	<div class="tbf">
		<input class="lbl" value={f.label} title={f.key === 'custom' ? 'Label (custom text)' : `Label — filled with the sheet's ${TB_AUTO[f.key].toLowerCase()}`}
			onchange={(e) => setField(i, { label: val(e) })} onkeydown={blurOnEnter} />
		{#if f.key === 'custom'}
			<input class="txt" value={f.value ?? ''} placeholder="text" onchange={(e) => setField(i, { value: val(e) })} onkeydown={blurOnEnter} />
		{:else}
			<em title="Filled automatically">{TB_AUTO[f.key]}</em>
		{/if}
		<button class:on={f.wide} title={f.wide ? 'Full width (click for half)' : 'Half width (click for full)'} onclick={() => setField(i, { wide: !f.wide })}>{f.wide ? '▭' : '◫'}</button>
		<button title="Move up" disabled={i === 0} onclick={() => move(i, -1)}><Icon name="chevronUp" size={11} /></button>
		<button title="Move down" disabled={i === t.fields.length - 1} onclick={() => move(i, 1)}><Icon name="chevronDown" size={11} /></button>
		<button title="Remove" onclick={() => remove(i)}><Icon name="x" size={11} /></button>
	</div>
{/each}
<div class="prop"><span>Add</span>
	<select value="" onchange={(e) => { add(val(e)); (e.currentTarget as HTMLSelectElement).value = '' }}>
		<option value="">Add a field…</option>
		{#each Object.entries(TB_AUTO) as [k, l] (k)}<option value={k}>{l} (auto)</option>{/each}
		<option value="custom">Custom text</option>
	</select>
</div>
<div class="pp-hint">Shared by every sheet in this project. Auto fields fill from the project and each sheet.</div>

<style>
	.tbf { display:flex; align-items:center; gap:3px; padding:2px 4px; }
	.tbf input { background:var(--input); color:var(--text); border:1px solid var(--line); border-radius:4px; padding:3px 5px; font-size:11px; font-family:Consolas,monospace; min-width:0; }
	.tbf input:focus { outline:none; border-color:var(--accent); }
	.tbf .lbl { width:64px; flex:none; }
	.tbf .txt { flex:1; }
	.tbf em { flex:1; min-width:0; font-style:normal; font-size:10px; color:var(--faint); overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
	.tbf button { flex:none; width:18px; height:18px; display:grid; place-items:center; padding:0; border:1px solid transparent; border-radius:3px; background:none; color:var(--muted); cursor:pointer; font-size:11px; }
	.tbf button:hover:not(:disabled) { border-color:var(--line); color:var(--text); }
	.tbf button.on { color:var(--accent); }
	.tbf button:disabled { opacity:.3; cursor:default; }
	.prop { display:grid; grid-template-columns:64px 1fr; align-items:center; gap:6px; padding:2px 4px; }
	.prop span { color:var(--muted); font-size:11px; }
	.prop input, .prop select { background:var(--input); color:var(--text); border:1px solid var(--line); border-radius:4px; padding:3px 6px; font-size:11px; font-family:Consolas,monospace; min-width:0; }
	.chips { display:flex; flex-wrap:wrap; gap:3px; }
	.chips button { padding:1px 6px; font-size:10px; border:1px solid var(--line); border-radius:9px; background:none; color:var(--faint); cursor:pointer; }
	.chips button.on { color:var(--accent); border-color:var(--accent-dim); background:var(--active); }
	.prop-sec { font-size:9px; text-transform:uppercase; letter-spacing:.1em; color:var(--faint); padding:8px 4px 4px; }
	.pp-hint { font-size:10px; color:var(--faint); padding:6px 6px 10px; line-height:1.4; }
</style>
