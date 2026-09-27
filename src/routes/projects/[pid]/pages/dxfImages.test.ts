import { describe, it, expect } from 'vitest'
import JSZip from 'jszip'
import { zipDxf } from './dxfImages'

describe('DXF bundle zip (O15)', () => {
	it('zips the .dxf and its sidecar images flat, byte-exact', async () => {
		const png = new Uint8Array([137, 80, 78, 71, 0, 255])
		const bytes = await zipDxf('Plan.dxf', '0\nEOF\n', [{ name: 'Plan_img1.png', data: png }])
		const z = await JSZip.loadAsync(bytes)
		expect(Object.keys(z.files).sort()).toEqual(['Plan.dxf', 'Plan_img1.png'])
		expect(await z.file('Plan.dxf')!.async('string')).toBe('0\nEOF\n')
		expect(Array.from(await z.file('Plan_img1.png')!.async('uint8array'))).toEqual(Array.from(png))
	})
})
