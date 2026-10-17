// A NEW project's settings (walkthrough 2026-10-14: a project made from scratch had none — only the legacy import made
// them — so Usages, Cable types, Lengths & labels, Sheets and Files were empty). User 2026-10-14: cable types CAT6A,
// CAT6, OS2, OM4; outlet usages (none) + ACS, AP, AV, CCTV, EMS, BMS, N/A, TEL, PR, RS, TV (User 2026-10-16). Pure.
import type { ProjectSettings } from './types'
import type { Entity } from './drawing'
import { DEFAULT_TITLE_BLOCK } from './titleBlock'

export function defaultSettings(): ProjectSettings {
	// the default title block without its "J" placeholder logo text (W10, B50) — kept for older projects only
	const { logo: _placeholder, ...titleBlock } = DEFAULT_TITLE_BLOCK
	return {
		type: 'settings', id: 'settings', portSuffix: 'alpha', titleBlock: structuredClone(titleBlock),
		// User 2026-10-16: ACS AP AV CCTV EMS BMS N/A TEL PR RS TV
		usages: [
			{ id: 'ACS', label: 'ACS', color: '#dc2626' }, { id: 'AP', label: 'AP', color: '#16a34a' }, { id: 'AV', label: 'AV', color: '#db2777' },
			{ id: 'CCTV', label: 'CCTV', color: '#9333ea' }, { id: 'EMS', label: 'EMS', color: '#0891b2' }, { id: 'BMS', label: 'BMS', color: '#0d9488' },
			{ id: 'N/A', label: 'N/A', color: '#999999' }, { id: 'TEL', label: 'TEL', color: '#2563eb' }, { id: 'PR', label: 'PR', color: '#ea580c' },
			{ id: 'RS', label: 'RS', color: '#7c3aed' }, { id: 'TV', label: 'TV', color: '#be185d' },
		],
		cableTypes: [
			{ id: 'cat6a', label: 'CAT6A', media: 'copper', color: '#3b82f6' }, { id: 'cat6', label: 'CAT6', media: 'copper', color: '#2563eb' },
			{ id: 'os2', label: 'OS2', media: 'fibre', color: '#eab308' }, { id: 'om4', label: 'OM4', media: 'fibre', color: '#06b6d4' },
		],
		defaults: { outletCableType: 'cat6a', cordCableType: 'cat6a', cordColour: '#3b82f6', panelPorts: 24 },
	}
}

/** The project's settings entity, checked (hacky-code review #3: `get('settings') as ProjectSettings` trusted whatever
 *  had the id). `get` = the store's, a transaction's or the index's lookup. */
export function settingsOf(get: (id: string) => Entity | undefined): ProjectSettings | undefined {
	const e = get('settings')
	return e?.type === 'settings' ? e : undefined
}
