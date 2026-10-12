// The port map (port-map-plan.md): each port with the outlet it reaches, the port it's patched to, and what's between.
import { describe, it, expect } from 'vitest'
import { portMapRows, portMapDevices } from './portMap'
import { ProjectIndex } from './project'
import { circuitEdges, traceCircuit } from './cords'
import { bigPortProject } from '../bench/gen'
import { demoProject } from './fixtures'
import type { Cord } from './types'

const ix = (ents = demoProject()) => new ProjectIndex(ents)
const row = (rows: ReturnType<typeof portMapRows>, dev: string, port: number) => rows.find((r) => r.deviceId === dev && r.port === port)!

describe('port map', () => {
	it('a switch port: the panel port it is patched to, and the outlet behind it', () => {
		const r = row(portMapRows(ix(), ['SW1']), 'SW1', 1)
		expect(r).toMatchObject({ room: 'IDF-A', rack: 'A01', device: 'Switch 1', outlet: '33-001.A', outletAt: '33F · Zone 3', patchedTo: 'A01 · Panel 1 : 1 (front) · 33-001.A', farEnd: '', cordStatus: 'add' })
	})
	it('a panel port: its outlet and the switch port it is patched to', () => {
		const r = row(portMapRows(ix(), ['P1']), 'P1', 1)
		expect(r).toMatchObject({ label: '33-001.A', outlet: '33-001.A', patchedTo: 'A01 · Switch 1 : 1 · SW1-01', farEnd: '' })
		expect(row(portMapRows(ix(), ['P1']), 'P1', 3)).toMatchObject({ outlet: '33-002.A', patchedTo: '', cordStatus: '' })   // cabled, not patched
	})
	it('a panel-to-panel cross-connect: both outlets', () => {
		const xc: Cord = { type: 'cord', id: 'X', kind: 'patch', a: { on: 'P1', port: 3, face: 'front' }, b: { on: 'P1', port: 4, face: 'front' }, cableType: 'cat6a', colour: '#000', lengthM: 1, lengthLocked: false, status: 'installed' }
		expect(row(portMapRows(ix([...demoProject(), xc]), ['P1']), 'P1', 3)).toMatchObject({ outlet: '33-002.A / 33-002.B', patchedTo: 'A01 · Panel 1 : 4 (front) · 33-002.B', cordStatus: 'installed' })
	})
	it('a free port reaches nothing; a cord marked remove is left out', () => {
		const ents = demoProject().map((e) => (e.id === 'C1' ? { ...(e as Cord), status: 'remove' as const } : e))
		expect(row(portMapRows(ix(ents), ['SW1']), 'SW1', 1)).toMatchObject({ outlet: '', patchedTo: '', farEnd: '', cordStatus: '' })
		expect(row(portMapRows(ix(), ['SW1']), 'SW1', 5)).toMatchObject({ outlet: '', patchedTo: '', farEnd: '' })
	})
	it('every port of each device, top U down; things without ports left out', () => {
		const i = ix()
		expect(portMapDevices(i, ['SW1', 'P1', 'O1', 'R1']).map((d) => d.id)).toEqual(['P1', 'SW1'])
		expect(portMapRows(i, ['SW1', 'P1']).length).toBe(24 + 48)
	})
})

describe('port map speed (Q57): the adjacency is built once', () => {
	it('tracing with a prebuilt adjacency gives the same circuits, on a big project', () => {
		const i = new ProjectIndex(bigPortProject(12, 4, 200))
		const edges = circuitEdges(i)
		for (const p of ['P0', 'P5', 'S0', 'S3']) for (let port = 1; port <= 48; port += 5) expect(traceCircuit(i, { on: p, port }, edges)).toEqual(traceCircuit(i, { on: p, port }))
		expect(portMapRows(i, ['P0', 'P1']).length).toBe(96)
	})
})
