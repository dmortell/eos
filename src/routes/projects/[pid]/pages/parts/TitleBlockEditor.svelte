<script lang="ts">
	// The PROJECT's title-block template (titleBlock.ts, drawings-plan phase 5), edited from a sheet's page
	// Properties: logo text, then the fields in order — relabel, full-width or half, move, remove, add an
	// auto-filled field or a custom one with fixed text. Every change calls `onchange` with the whole template
	// (the store saves `projects/{pid}.pages.titleBlock`; every sheet of the project re-renders from it).
	import { Icon, DragReorder } from '$lib'
	import { toast } from 'svelte-sonner'
	import { createUploadThing } from '../../uploads/uploader'
	import { TB_AUTO, DEFAULT_TITLE_BLOCK, type TitleBlockTemplate, type TbField, type TbAutoKey, type TbCompany, type TbSection, type TbLogo, type TbLayout } from '../titleBlock'

	let { template, onchange }: { template: TitleBlockTemplate | undefined; onchange: (t: TitleBlockTemplate) => void } = $props()
	const t = $derived(template?.fields?.length ? template : DEFAULT_TITLE_BLOCK)
	const set = (patch: Partial<TitleBlockTemplate>) => onchange({ ...t, logo: t.logo ?? '', fields: t.fields.map((f) => ({ ...f })), ...patch })
	const setCompany = (patch: Partial<TbCompany>) => set({ company: { ...t.company, ...patch } })
	const SECTIONS: [TbSection, string][] = [['logo', 'Logo'], ['company', 'Company'], ['fields', 'Fields'], ['revisions', 'Revisions']]
	const shows = (s: TbSection) => !t.hidden?.includes(s)
	const toggle = (s: TbSection) => set({ hidden: shows(s) ? [...(t.hidden ?? []), s] : (t.hidden ?? []).filter((x) => x !== s) })
	const setField = (i: number, patch: Partial<TbField>) => set({ fields: t.fields.map((f, j) => (j === i ? { ...f, ...patch } : f)) })
	// fields reorder by dragging their ⋮⋮ grip ($lib DragReorder; ids = the row index, `f<i>`)
	const idx = (id: string) => Number(id.slice(1))
	const dr = new DragReorder((id, targetId, after) => {
		const fs = [...t.fields], [f] = fs.splice(idx(id), 1)
		let to = idx(targetId); if (idx(id) < to) to--   // the target shifted up when the dragged one left
		fs.splice(after ? to + 1 : to, 0, f); set({ fields: fs })
	}, idx)
	const remove = (i: number) => set({ fields: t.fields.filter((_, j) => j !== i) })
	function add(key: string) {
		if (!key) return
		const f: TbField = key === 'custom' ? { key: 'custom', label: 'Note', value: '' } : { key: key as TbAutoKey, label: TB_AUTO[key as TbAutoKey] }
		set({ fields: [...t.fields, f] })
	}
	// A1: a logo image goes to FILE STORAGE (UploadThing's image route, like Uploads / the project logo) and the project
	// doc keeps only its URL + key. A raster is downscaled first (≤ 1200 × 480 px, plenty for a ~10 mm print); an SVG
	// goes as it is. If the upload fails (offline), the old inline data URL (≤ ~150 KB) is kept so it still works —
	// "Move to storage" uploads such a logo later. Removed = an empty src (the project doc saves with a MERGE).
	const LOGO_MAX = 150_000
	const setLogo = (k: 'company' | 'client', lg: TbLogo | undefined) => set({ logos: { ...t.logos, [k]: lg ?? { src: '' } } })
	let uploading = $state<'company' | 'client' | null>(null)
	let pending: { k: 'company' | 'client'; h: number; fallback: string } | null = null
	const { startUpload } = createUploadThing('imageUploader', {
		onClientUploadComplete: (res) => {
			const f = Array.isArray(res) ? res[0] : null, p = pending; pending = null; uploading = null
			if (p && f?.ufsUrl) setLogo(p.k, { src: f.ufsUrl, key: f.key, h: p.h })
		},
		onUploadError: (e) => {
			const p = pending; pending = null; uploading = null
			if (p?.fallback) setLogo(p.k, { src: p.fallback, h: p.h })
			toast.error(`Logo upload failed${p?.fallback ? ' — kept inside the project for now (Move to storage later)' : ''}: ${e.message ?? 'unknown error'}`)
		},
	})
	async function upload(k: 'company' | 'client', file: File, h: number, fallback: string) {
		pending = { k, h, fallback }; uploading = k
		try { await startUpload([file]) } catch (e) { onFail(e) }
	}
	function onFail(e: unknown) {
		const p = pending; pending = null; uploading = null
		if (p?.fallback) setLogo(p.k, { src: p.fallback, h: p.h })
		toast.error(`Logo upload failed: ${e instanceof Error ? e.message : String(e)}`)
	}
	/** An image scaled to fit w × h px, as a PNG blob. */
	const scaled = (img: HTMLImageElement, w: number, h: number) => new Promise<Blob | null>((res) => {
		const s = Math.min(1, w / img.naturalWidth, h / img.naturalHeight), c = document.createElement('canvas')
		c.width = Math.max(1, Math.round(img.naturalWidth * s)); c.height = Math.max(1, Math.round(img.naturalHeight * s))
		c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height); c.toBlob(res, 'image/png')
	})
	function logoDataUrl(img: HTMLImageElement): string {
		let s = Math.min(1, 600 / img.naturalWidth, 240 / img.naturalHeight), out = ''
		for (let i = 0; i < 6; i++, s *= 0.7) {
			const c = document.createElement('canvas')
			c.width = Math.max(1, Math.round(img.naturalWidth * s)); c.height = Math.max(1, Math.round(img.naturalHeight * s))
			c.getContext('2d')!.drawImage(img, 0, 0, c.width, c.height)
			for (const [type, q] of [['image/png', 1], ['image/webp', 0.85], ['image/webp', 0.7]] as const) { out = c.toDataURL(type, q); if (out.length <= LOGO_MAX) return out }
		}
		return out
	}
	function pickLogo(k: 'company' | 'client', e: Event) {
		const input = e.currentTarget as HTMLInputElement, f = input.files?.[0]; input.value = ''; if (!f) return
		const img = new Image(), url = URL.createObjectURL(f), h = t.logos?.[k]?.h ?? 10
		img.onload = async () => {
			URL.revokeObjectURL(url)
			const fallback = logoDataUrl(img)
			if (f.type === 'image/svg+xml') return upload(k, f, h, fallback)   // vector: as it is
			const b = await scaled(img, 1200, 480)
			upload(k, b ? new File([b], f.name.replace(/\.\w+$/, '') + '.png', { type: 'image/png' }) : f, h, fallback)
		}
		img.src = url
	}
	/** A logo still stored inline (a data URL) → file storage. */
	async function moveToStorage(k: 'company' | 'client', lg: TbLogo) {
		const b = await (await fetch(lg.src)).blob(), ext = b.type.split('/')[1]?.replace('svg+xml', 'svg') || 'png'
		upload(k, new File([b], `${k}-logo.${ext}`, { type: b.type }), lg.h ?? 10, lg.src)
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
<div class="prop"><span>Layout</span>
	<select value={t.layout ?? 'vertical'} onchange={(e) => set({ layout: val(e) as TbLayout })}>
		<option value="vertical">Strip down the right</option><option value="horizontal">Band along the bottom</option><option value="compact">Compact box, bottom right</option>
	</select></div>
<div class="prop"><span>Logo text</span><input value={t.logo ?? ''} placeholder="(none)" onchange={(e) => set({ logo: val(e) })} onkeydown={blurOnEnter} /></div>
{#each [['company', 'Our logo'], ['client', 'Client logo']] as const as [k, label] (k)}
	{@const lg = t.logos?.[k]}
	<div class="prop"><span>{label}</span>
		<span class="logo-row">
			{#if lg?.src}<img src={lg.src} alt={label} /><input type="number" min="3" max="60" value={lg.h ?? 10} title="Height on paper (mm)" onchange={(e) => setLogo(k, { ...lg, h: Math.max(3, Math.min(60, +val(e))) })} /><em>mm</em>
				<button title="Remove" onclick={() => setLogo(k, undefined)}><Icon name="x" size={11} /></button>
				{#if uploading === k}<em>uploading…</em>
				{:else if lg.src.startsWith('data:')}<button class="logo-up" title="This logo is stored inside the project document — upload it to file storage" onclick={() => moveToStorage(k, lg)}>Move to storage</button>{/if}
			{:else if uploading === k}<em>uploading…</em>
			{:else}<label class="logo-up">Choose image…<input type="file" accept="image/*" onchange={(e) => pickLogo(k, e)} /></label>{/if}
		</span></div>
{/each}
<div class="prop"><span>Company</span><input value={t.company?.name ?? ''} placeholder="Name" onchange={(e) => setCompany({ name: val(e) })} onkeydown={blurOnEnter} /></div>
<div class="prop"><span></span><input value={t.company?.address ?? ''} placeholder="Address" onchange={(e) => setCompany({ address: val(e) })} onkeydown={blurOnEnter} /></div>
<div class="prop"><span></span><input value={t.company?.contact ?? ''} placeholder="Tel / email" onchange={(e) => setCompany({ contact: val(e) })} onkeydown={blurOnEnter} /></div>
{#each t.fields as f, i (i)}
	{@const r = dr.row(`f${i}`)}
	<!-- the row is the drop target; only the grip starts a drag (so the inputs stay selectable) -->
	<div class="tbf" class:drag-before={dr.isBefore(`f${i}`)} class:drag-after={dr.isAfter(`f${i}`)} class:dragging={dr.dragId === `f${i}`}
		ondragover={r.ondragover} ondragleave={r.ondragleave} ondrop={r.ondrop} role="listitem">
		<span class="grip" draggable="true" ondragstart={r.ondragstart} ondragend={r.ondragend} title="Drag to reorder" role="button" tabindex="-1">⋮⋮</span>
		<input class="lbl" value={f.label} title={f.key === 'custom' ? 'Label (custom text)' : `Label — filled with the sheet's ${TB_AUTO[f.key].toLowerCase()}`}
			onchange={(e) => setField(i, { label: val(e) })} onkeydown={blurOnEnter} />
		{#if f.key === 'custom'}
			<input class="txt" value={f.value ?? ''} placeholder="text" onchange={(e) => setField(i, { value: val(e) })} onkeydown={blurOnEnter} />
		{:else}
			<em title="Filled automatically">{TB_AUTO[f.key]}</em>
		{/if}
		<button class:on={f.wide} title={f.wide ? 'Full width (click for half)' : 'Half width (click for full)'} onclick={() => setField(i, { wide: !f.wide })}>{f.wide ? '▭' : '◫'}</button>
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
	.tbf.drag-before { box-shadow:inset 0 2px 0 var(--accent); }
	.tbf.drag-after { box-shadow:inset 0 -2px 0 var(--accent); }
	.tbf.dragging { opacity:.45; }
	.grip { flex:none; width:12px; color:var(--faint); cursor:grab; font-size:10px; letter-spacing:-2px; user-select:none; text-align:center; }
	.grip:hover { color:var(--text); }
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
	.logo-row { display:flex; align-items:center; gap:4px; min-width:0; }
	.logo-row img { height:22px; max-width:90px; object-fit:contain; background:#fff; border-radius:2px; }
	.logo-row input { width:44px; }
	.logo-row em { font-style:normal; font-size:10px; color:var(--faint); }
	.logo-row button { background:none; border:none; color:var(--muted); cursor:pointer; display:grid; place-items:center; }
	.logo-up { font-size:10px; color:var(--accent); cursor:pointer; }
	.logo-up input { display:none; }
	.chips { display:flex; flex-wrap:wrap; gap:3px; }
	.chips button { padding:1px 6px; font-size:10px; border:1px solid var(--line); border-radius:9px; background:none; color:var(--faint); cursor:pointer; }
	.chips button.on { color:var(--accent); border-color:var(--accent-dim); background:var(--active); }
	.prop-sec { font-size:9px; text-transform:uppercase; letter-spacing:.1em; color:var(--faint); padding:8px 4px 4px; }
	.pp-hint { font-size:10px; color:var(--faint); padding:6px 6px 10px; line-height:1.4; }
</style>
