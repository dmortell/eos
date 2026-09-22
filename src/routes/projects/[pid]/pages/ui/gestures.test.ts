import { describe, it, expect, beforeEach, vi } from 'vitest'
import { beginPointerDrag, DragRegistry } from './gestures'

// A minimal window stand-in (the server project runs in node): records listeners so a test can fire them.
type L = (e: PointerEvent) => void
const listeners: Record<string, Set<L>> = { pointermove: new Set(), pointerup: new Set() }
const fakeWindow = {
	addEventListener: (t: string, l: L) => listeners[t].add(l),
	removeEventListener: (t: string, l: L) => listeners[t].delete(l),
}
const fire = (t: 'pointermove' | 'pointerup', e: Partial<PointerEvent>) => { for (const l of [...listeners[t]]) l(e as PointerEvent) }
const press = (over: Partial<PointerEvent> = {}): PointerEvent => ({
	pointerId: 1, clientX: 100, clientY: 100, preventDefault: vi.fn(), currentTarget: { setPointerCapture: vi.fn() }, ...over,
} as unknown as PointerEvent)

beforeEach(() => { (globalThis as { window?: unknown }).window = fakeWindow; listeners.pointermove.clear(); listeners.pointerup.clear() })

describe('beginPointerDrag', () => {
	it('captures the pointer, preventDefaults, listens on window, and tears down on release (moved flag = any move)', () => {
		const reg = new DragRegistry(), e = press(), onMove = vi.fn(), onUp = vi.fn()
		const h = beginPointerDrag(e, { id: 'x' }, { onMove, onUp }, reg)
		expect((e.currentTarget as unknown as { setPointerCapture: ReturnType<typeof vi.fn> }).setPointerCapture).toHaveBeenCalledWith(1)
		expect(e.preventDefault).toHaveBeenCalled()
		expect(listeners.pointermove.size).toBe(1); expect(listeners.pointerup.size).toBe(1)
		expect(reg.active).toBe(true); expect(h.moved).toBe(false)
		fire('pointermove', { clientX: 101, clientY: 100 })
		expect(onMove).toHaveBeenCalledTimes(1); expect(onMove.mock.calls[0][1]).toEqual({ id: 'x' }); expect(h.moved).toBe(true)
		fire('pointerup', { clientX: 101, clientY: 100 })
		expect(onUp).toHaveBeenCalledTimes(1); expect(onUp.mock.calls[0][2]).toBe(true)
		expect(listeners.pointermove.size).toBe(0); expect(listeners.pointerup.size).toBe(0); expect(reg.active).toBe(false)
	})
	it('a no-move release reports moved = false', () => {
		const reg = new DragRegistry(), onUp = vi.fn()
		beginPointerDrag(press(), null, { onMove: vi.fn(), onUp }, reg)
		fire('pointerup', {})
		expect(onUp.mock.calls[0][2]).toBe(false)
	})
	it('thresholdPx: moves inside the threshold are swallowed; the first move past it starts onMove', () => {
		const reg = new DragRegistry(), onMove = vi.fn()
		const h = beginPointerDrag(press(), null, { onMove }, reg, { thresholdPx: 4 })
		fire('pointermove', { clientX: 102, clientY: 100 })   // 2px
		expect(onMove).not.toHaveBeenCalled(); expect(h.moved).toBe(false)
		fire('pointermove', { clientX: 105, clientY: 100 })   // 5px
		expect(onMove).toHaveBeenCalledTimes(1); expect(h.moved).toBe(true)
		fire('pointermove', { clientX: 101, clientY: 100 })   // back inside — still moving (latched)
		expect(onMove).toHaveBeenCalledTimes(2)
	})
	it('cancel() tears down, calls onCancel once with the moved flag, and never onUp', () => {
		const reg = new DragRegistry(), onUp = vi.fn(), onCancel = vi.fn()
		const h = beginPointerDrag(press(), 's', { onMove: vi.fn(), onUp, onCancel }, reg)
		fire('pointermove', { clientX: 110, clientY: 100 })
		h.cancel(); h.cancel()
		expect(onCancel).toHaveBeenCalledTimes(1); expect(onCancel).toHaveBeenCalledWith('s', true)
		fire('pointerup', {})
		expect(onUp).not.toHaveBeenCalled(); expect(listeners.pointerup.size).toBe(0); expect(reg.active).toBe(false)
	})
	it('tolerates a synthetic event with no currentTarget / capture support', () => {
		const reg = new DragRegistry()
		expect(() => beginPointerDrag(press({ currentTarget: null }), null, { onMove: vi.fn() }, reg)).not.toThrow()
		expect(() => beginPointerDrag(press({ currentTarget: {} as Element }), null, { onMove: vi.fn() }, reg)).not.toThrow()
	})
})

describe('DragRegistry', () => {
	it('noteDown/noteUp count pointers; the second press reports multiTouch; forget drops a non-drag press', () => {
		const reg = new DragRegistry()
		expect(reg.noteDown(press({ pointerId: 1 }))).toBe(false); expect(reg.multiTouch).toBe(false)
		expect(reg.noteDown(press({ pointerId: 2 }))).toBe(true); expect(reg.multiTouch).toBe(true)
		reg.noteUp(press({ pointerId: 2 })); expect(reg.multiTouch).toBe(false)
		reg.forget(press({ pointerId: 1 })); expect(reg.noteDown(press({ pointerId: 3 }))).toBe(false)
	})
	it('cancelAll aborts every live drag', () => {
		const reg = new DragRegistry(), c1 = vi.fn(), c2 = vi.fn()
		beginPointerDrag(press({ pointerId: 1 }), 1, { onMove: vi.fn(), onCancel: c1 }, reg)
		beginPointerDrag(press({ pointerId: 2 }), 2, { onMove: vi.fn(), onCancel: c2 }, reg)
		expect(reg.active).toBe(true)
		reg.cancelAll()
		expect(c1).toHaveBeenCalledWith(1, false); expect(c2).toHaveBeenCalledWith(2, false)
		expect(reg.active).toBe(false); expect(listeners.pointermove.size).toBe(0)
	})
})
