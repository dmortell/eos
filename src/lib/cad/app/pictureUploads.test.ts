// Pasted pictures: the same bytes are one file (uploaded once); a new one gets its id at once and uploads meanwhile.
import { describe, it, expect } from 'vitest'
import { PictureUploads, sha256, type PictureDeps } from './pictureUploads.svelte'

const png = (s: string) => new File([s], 'image.png', { type: 'image/png' })

function deps(inProject: Record<string, string> = {}) {
	const uploads: string[] = [], shown: string[] = []
	let finish: () => void = () => {}
	const d: PictureDeps = {
		find: async (h) => inProject[h] ?? null,
		freeId: async (name) => name,
		upload: (_f, id) => { uploads.push(id); return new Promise<void>((ok) => { finish = ok }) },
		show: (id) => { shown.push(id) },
	}
	return { d, uploads, shown, finish: () => finish() }
}

describe('pasted pictures', () => {
	it('a new picture: its id at once, shown from its bytes, uploading (pending) until done', async () => {
		const t = deps(), p = new PictureUploads(t.d)
		const r = await p.add(png('a'), 'Pasted 1.png')
		expect(r).toMatchObject({ fileId: 'Pasted 1.png', fresh: true })
		expect(t.shown).toEqual(['Pasted 1.png'])
		expect(p.pending).toBe(1)
		t.finish(); await r.done
		expect(p.pending).toBe(0)
	})
	it('the same picture again (even mid-upload) is the same file — uploaded once; another name in the same second gets its own id', async () => {
		const t = deps(), p = new PictureUploads(t.d)
		const a = await p.add(png('a'), 'Pasted 1.png')
		const again = await p.add(png('a'), 'Pasted 2.png')
		expect(again).toMatchObject({ fileId: a.fileId, fresh: false })
		const b = await p.add(png('b'), 'Pasted 1.png')
		expect(b.fileId).toBe('Pasted 1 (2).png')
		expect(t.uploads).toEqual(['Pasted 1.png', 'Pasted 1 (2).png'])
	})
	it('a picture already in the project (an earlier session) is used, not uploaded', async () => {
		const t = deps({ [await sha256(png('a'))]: 'Pasted old.png' }), p = new PictureUploads(t.d)
		expect(await p.add(png('a'), 'Pasted 3.png')).toMatchObject({ fileId: 'Pasted old.png', fresh: false })
		expect(t.uploads).toEqual([])
	})
})
