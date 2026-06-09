// Device templates for the rack-elevation device library, copied (subset) from the production
// racks tool. Custom templates the user adds are stored on the racks doc (`library`).
import type { DeviceType } from './types'

export interface DeviceTemplate {
	id: string
	label: string
	type: DeviceType
	heightU: number
	portCount?: number
	widthMm?: number
	maker?: string
}

export const DEVICE_PALETTE: DeviceTemplate[] = [
	{ id: 'pp24', label: '24-Port Patch Panel', type: 'panel', heightU: 1, portCount: 24 },
	{ id: 'pp48', label: '48-Port Patch Panel', type: 'panel', heightU: 1, portCount: 48 },
	{ id: 'fiber', label: 'Fiber Enclosure', type: 'enclosure', heightU: 1, portCount: 24 },
	{ id: 'sw24', label: 'Switch 24-port', type: 'switch', heightU: 1, portCount: 24 },
	{ id: 'sw48', label: 'Switch 48-port', type: 'switch', heightU: 1, portCount: 48 },
	{ id: 'sw2u', label: 'Switch 2U 48-port', type: 'switch', heightU: 2, portCount: 48 },
	{ id: 'cm1', label: 'Horizontal Manager 1U', type: 'manager', heightU: 1, portCount: 0 },
	{ id: 'cm2', label: 'Horizontal Manager 2U', type: 'manager', heightU: 2, portCount: 0 },
	{ id: 'srv1u', label: 'Server 1U', type: 'server', heightU: 1, portCount: 2 },
	{ id: 'srv2u', label: 'Server 2U', type: 'server', heightU: 2, portCount: 4 },
	{ id: 'shelf', label: 'Shelf', type: 'shelf', heightU: 1, portCount: 0 },
	{ id: 'pdu', label: 'PDU (vertical)', type: 'pdu', heightU: 0, portCount: 0, widthMm: 80 },
	{ id: 'tower', label: 'Tower PC', type: 'other', heightU: 9, portCount: 2, widthMm: 200 },
]
