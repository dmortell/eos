// import { json } from '@sveltejs/kit'
// import multer from 'multer'
// import path from 'node:path'
// import { Readable } from 'node:stream'
// import { promises as fs } from 'node:fs'

// const uploadDir = path.join(process.cwd(), 'static', 'uploads')

// const storage = multer.diskStorage({
// 	destination: async (_req, _file, cb) => {
// 		try {
// 			await fs.mkdir(uploadDir, { recursive: true })
// 			cb(null, uploadDir)
// 		} catch (error) {
// 			cb(error)
// 		}
// 	},
// 	filename: (_req, file, cb) => {
// 		const timestamp = Date.now()
// 		const safeName = file.originalname.replace(/[^\w.\-]/g, '_')
// 		cb(null, `${timestamp}-${safeName}`)
// 	}
// })

// const uploader = multer({ storage }).array('files')
// const metadataFile = path.join(uploadDir, '.file-metadata.json')

// function runMulter(request) {
// 	return new Promise((resolve, reject) => {
// 		const headers = Object.fromEntries(request.headers.entries())
// 		const req = Readable.fromWeb(request.body)
// 		req.headers = headers
// 		req.method = request.method
// 		req.url = new URL(request.url).pathname

// 		const res = {
// 			setHeader() {},
// 			getHeader() {},
// 			removeHeader() {},
// 			end() {},
// 			statusCode: 200
// 		}

// 		uploader(req, res, (error) => {
// 			if (error) {
// 				reject(error)
// 				return
// 			}
// 			resolve(req)
// 		})
// 	})
// }

// async function readMetadata() {
// 	try {
// 		const raw = await fs.readFile(metadataFile, 'utf8')
// 		return JSON.parse(raw)
// 	} catch {
// 		return {}
// 	}
// }

// async function writeMetadata(metadata) {
// 	await fs.mkdir(uploadDir, { recursive: true })
// 	await fs.writeFile(metadataFile, JSON.stringify(metadata, null, 2), 'utf8')
// }

// async function listUploadedFiles() {
// 	await fs.mkdir(uploadDir, { recursive: true })
// 	const metadata = await readMetadata()
// 	const entries = await fs.readdir(uploadDir, { withFileTypes: true })
// 	const files = await Promise.all(
// 		entries
// 			.filter((entry) => entry.isFile() && entry.name !== '.file-metadata.json')
// 			.map(async (entry) => {
// 				const filePath = path.join(uploadDir, entry.name)
// 				const stat = await fs.stat(filePath)
// 				const displayName = entry.name.replace(/^\d+-/, '')
// 				const lastModified = metadata[entry.name]?.lastModified ?? stat.mtime.toISOString()
// 				return {
// 					name: entry.name,
// 					displayName,
// 					size: stat.size,
// 					lastModified
// 				}
// 			})
// 	)
// 	return files.sort((a, b) => Date.parse(b.lastModified) - Date.parse(a.lastModified))
// }

// export const GET = async () => {
// 	const files = await listUploadedFiles()
// 	return json({ files })
// }

// export const POST = async ({ request }) => {
// 	try {
// 		if (!request.body) {
// 			return json({ error: 'Missing request body' }, { status: 400 })
// 		}
// 		const req = await runMulter(request)
// 		const uploaded = req.files ?? []
// 		const submittedMeta = JSON.parse(req.body?.fileMetadata ?? '[]')
// 		const metadata = await readMetadata()
// 		const metaQueue = new Map()

// 		for (const item of submittedMeta) {
// 			const key = `${item.name}::${item.size}`
// 			const queue = metaQueue.get(key) ?? []
// 			queue.push(item.lastModified)
// 			metaQueue.set(key, queue)
// 		}

// 		for (const file of uploaded) {
// 			const key = `${file.originalname}::${file.size}`
// 			const queue = metaQueue.get(key) ?? []
// 			const lastModified = queue.length ? queue.shift() : undefined
// 			metaQueue.set(key, queue)
// 			metadata[file.filename] = {
// 				lastModified: lastModified ? new Date(lastModified).toISOString() : new Date().toISOString()
// 			}
// 		}

// 		await writeMetadata(metadata)
// 		const files = await listUploadedFiles()
// 		return json({ files })
// 	} catch (error) {
// 		return json({ error: error instanceof Error ? error.message : 'Upload failed' }, { status: 500 })
// 	}
// }
