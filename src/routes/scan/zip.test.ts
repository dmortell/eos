import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { crc32, zip } from './zip'

describe('zip', () => {
	it('computes the standard CRC-32', () => {
		expect(crc32(new TextEncoder().encode('123456789')).toString(16)).toBe('cbf43926')
	})

	it('writes an archive another tool can unpack', () => {
		const a = new TextEncoder().encode('hello'), b = new Uint8Array([0, 1, 2, 255])
		const bytes = zip([{ name: '001-348-884F59514DD9.jpg', data: a }, { name: 'two.bin', data: b }])
		const dir = mkdtempSync(join(tmpdir(), 'zip-test-'))
		writeFileSync(join(dir, 't.zip'), bytes)
		// bsdtar reads zip (Windows' own tar.exe, macOS tar); GNU tar does not — then only the header checks run
		const tar = process.platform === 'win32' ? 'C:\\Windows\\System32\\tar.exe' : 'bsdtar'
		let unpacked = false
		try { execFileSync(tar, ['-xf', 't.zip'], { cwd: dir, stdio: 'ignore' }); unpacked = true } catch { /* no bsdtar */ }
		if (process.platform === 'win32') expect(unpacked).toBe(true)
		if (unpacked) {
			expect(readFileSync(join(dir, '001-348-884F59514DD9.jpg'), 'utf8')).toBe('hello')
			expect([...readFileSync(join(dir, 'two.bin'))]).toEqual([0, 1, 2, 255])
		}
		const v = new DataView(bytes.buffer)
		expect(v.getUint32(0, true)).toBe(0x04034b50)
		expect(v.getUint32(bytes.length - 22, true)).toBe(0x06054b50)
		expect(v.getUint16(bytes.length - 12, true)).toBe(2)
	})
})
