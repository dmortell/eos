// The SITE view's three.js scene (a test, Dave 2026-09-27): the buildings around the project address extruded from
// their OpenStreetMap footprints (./osm.ts), THE building in full — its building:part pieces, facades with a window
// grid per storey, roof colour, floor lines — the neighbours as quiet massing, the OSM map on the ground, sun +
// shadows, orbit / pan / zoom (OrbitControls). three.js is imported dynamically, so it only loads with this view.
import type { OsmBuilding, Pt2 } from './osm'

export type SiteSceneInput = { buildings: OsmBuilding[]; target: OsmBuilding | null; parts: OsmBuilding[]; lat0: number; lon0: number; groundTiles: boolean }
export type SiteScene = { dispose(): void; frameTarget(): void; setGroundTiles(on: boolean): void }

const TILE_Z = 17   // OSM tile zoom for the ground map (~1.2 m / px at 35°)

export async function createSiteScene(host: HTMLElement, inp: SiteSceneInput): Promise<SiteScene> {
	const THREE = await import('three')
	const { OrbitControls } = await import('three/examples/jsm/controls/OrbitControls.js')

	// a logarithmic depth buffer: a kilometre of flat ground seen from a few hundred metres would z-fight otherwise
	const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: false, logarithmicDepthBuffer: true })
	renderer.setPixelRatio(Math.min(2, window.devicePixelRatio || 1))
	renderer.shadowMap.enabled = true
	renderer.shadowMap.type = THREE.PCFShadowMap
	renderer.toneMapping = THREE.ACESFilmicToneMapping
	renderer.outputColorSpace = THREE.SRGBColorSpace
	host.appendChild(renderer.domElement)
	renderer.domElement.style.display = 'block'

	const scene = new THREE.Scene()
	scene.background = new THREE.Color('#cfe0ee')
	scene.fog = new THREE.Fog('#cfe0ee', 600, 1600)
	const camera = new THREE.PerspectiveCamera(40, 1, 0.5, 5000)
	const controls = new OrbitControls(camera, renderer.domElement)
	controls.enableDamping = true
	controls.maxPolarAngle = Math.PI * 0.495   // never under the ground

	// ── light: sky + a low south-west sun with soft shadows ──
	scene.add(new THREE.HemisphereLight('#ffffff', '#8a8f7a', 1.1))
	const sun = new THREE.DirectionalLight('#fff3de', 2.2)
	sun.position.set(-260, 420, 180); sun.castShadow = true
	const sc = sun.shadow.camera as InstanceType<typeof THREE.OrthographicCamera>
	sc.left = sc.bottom = -420; sc.right = sc.top = 420; sc.near = 10; sc.far = 1400
	sun.shadow.mapSize.set(4096, 4096); sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.6
	scene.add(sun)

	// ── the ground: a plain plane + (optionally) the OSM map tiles around the site ──
	const ground = new THREE.Mesh(new THREE.PlaneGeometry(4000, 4000), new THREE.MeshStandardMaterial({ color: '#dfe2d8', roughness: 1 }))
	ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; scene.add(ground)
	const tileGroup = new THREE.Group(); scene.add(tileGroup)
	const loadTiles = () => {
		const n = 2 ** TILE_Z, lat0 = inp.lat0, lon0 = inp.lon0
		const tx = Math.floor(((lon0 + 180) / 360) * n), ty = Math.floor(((1 - Math.log(Math.tan((lat0 * Math.PI) / 180) + 1 / Math.cos((lat0 * Math.PI) / 180)) / Math.PI) / 2) * n)
		const lonOf = (x: number) => (x / n) * 360 - 180, latOf = (y: number) => (Math.atan(Math.sinh(Math.PI * (1 - (2 * y) / n))) * 180) / Math.PI
		const kx = 111320 * Math.cos((lat0 * Math.PI) / 180), ky = 110574
		const loader = new THREE.TextureLoader(); loader.setCrossOrigin('anonymous')
		for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) {
			const x = tx + dx, y = ty + dy
			const w = lonOf(x), e = lonOf(x + 1), nn = latOf(y), s = latOf(y + 1)
			const x0 = (w - lon0) * kx, x1 = (e - lon0) * kx, z0 = -(nn - lat0) * ky, z1 = -(s - lat0) * ky
			const tex = loader.load(`https://tile.openstreetmap.org/${TILE_Z}/${x}/${y}.png`)
			tex.colorSpace = THREE.SRGBColorSpace
			// lit (it takes the buildings' shadows) but toned down, so the map reads in its own colours, not washed out
			const m = new THREE.Mesh(new THREE.PlaneGeometry(x1 - x0, z1 - z0), new THREE.MeshLambertMaterial({ map: tex, color: '#9c9c9c' }))
			m.rotation.x = -Math.PI / 2; m.position.set((x0 + x1) / 2, 0.05, (z0 + z1) / 2); m.receiveShadow = true
			tileGroup.add(m)
		}
	}
	let tilesLoaded = false
	const setGroundTiles = (on: boolean) => { if (on && !tilesLoaded) { loadTiles(); tilesLoaded = true } tileGroup.visible = on; ground.visible = !on }   // the plain ground only without the map (no overlap)
	setGroundTiles(inp.groundTiles)

	// ── a facade texture: a window per ~1.6 m across, one row per storey (UVs are world metres) ──
	const facade = (() => {
		const c = document.createElement('canvas'); c.width = 64; c.height = 128
		const g = c.getContext('2d')!
		g.fillStyle = '#e9e5dc'; g.fillRect(0, 0, 64, 128)
		const glass = g.createLinearGradient(0, 0, 0, 128); glass.addColorStop(0, '#5d7b93'); glass.addColorStop(1, '#8fb0c6')
		g.fillStyle = glass; g.fillRect(9, 30, 46, 70)
		g.fillStyle = '#c9c3b6'; g.fillRect(0, 104, 64, 8)   // the slab edge
		const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.colorSpace = THREE.SRGBColorSpace
		t.repeat.set(1 / 1.6, 1 / 3.2); t.anisotropy = 8
		return t
	})()

	const disposables: { dispose(): void }[] = [facade, ground.geometry, ground.material as InstanceType<typeof THREE.Material>]
	const shapeOf = (b: OsmBuilding) => {
		const s = new THREE.Shape(b.outer.map(([x, y]) => new THREE.Vector2(x, y)))
		for (const h of b.holes) s.holes.push(new THREE.Path(h.map(([x, y]) => new THREE.Vector2(x, y))))
		return s
	}
	// extrude a footprint from minH to h (three: y up, north = −z)
	const massOf = (b: OsmBuilding, wall: InstanceType<typeof THREE.Material>, cap: InstanceType<typeof THREE.Material>, lines?: string) => {
		const depth = Math.max(0.3, b.h - b.minH)
		const geo = new THREE.ExtrudeGeometry(shapeOf(b), { depth, bevelEnabled: false })
		geo.rotateX(-Math.PI / 2); geo.translate(0, b.minH, 0)
		const mesh = new THREE.Mesh(geo, [cap, wall]); mesh.castShadow = mesh.receiveShadow = true
		const grp = new THREE.Group(); grp.add(mesh)
		if (lines) { const e = new THREE.LineSegments(new THREE.EdgesGeometry(geo, 25), new THREE.LineBasicMaterial({ color: lines, transparent: true, opacity: 0.55 })); grp.add(e); disposables.push(e.geometry) }
		if (b.roofH > 0.3) grp.add(roofOf(b, cap))
		disposables.push(geo)
		return grp
	}
	// a simple pitched roof: the footprint's outline raised to a ridge point / line over its centre (pyramidal / hipped /
	// gabled read the same at this scale); flat roofs are the extrusion's cap
	const roofOf = (b: OsmBuilding, mat: InstanceType<typeof THREE.Material>) => {
		const c = b.outer.reduce((s, p) => [s[0] + p[0] / b.outer.length, s[1] + p[1] / b.outer.length], [0, 0] as Pt2)
		const pos: number[] = []
		for (let i = 0; i < b.outer.length; i++) {
			const p = b.outer[i], q = b.outer[(i + 1) % b.outer.length]
			pos.push(p[0], b.h, -p[1], q[0], b.h, -q[1], c[0], b.h + b.roofH, -c[1])
		}
		const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.computeVertexNormals()
		const m = new THREE.Mesh(g, mat); m.castShadow = true; disposables.push(g)
		return m
	}

	// ── the neighbours: quiet grey massing ──
	const nbWall = new THREE.MeshStandardMaterial({ color: '#d4d8dd', roughness: 0.9 }), nbCap = new THREE.MeshStandardMaterial({ color: '#c3c8ce', roughness: 0.9 })
	disposables.push(nbWall, nbCap)
	const tgtIds = new Set([inp.target?.id, ...inp.parts.map((p) => p.id)])
	const hasParts = inp.parts.length > 0
	for (const b of inp.buildings) {
		if (tgtIds.has(b.id)) continue
		if (b.part && inp.target) continue   // parts of other buildings: their outline mass stands for them
		scene.add(massOf(b, nbWall, nbCap))
	}

	// ── THE building: its parts (or its own mass), windowed facades, its roof colour, floor lines ──
	let focus = { x: 0, y: 20, z: 0, r: 80 }
	if (inp.target) {
		const t = inp.target
		const pieces = hasParts ? inp.parts : [t]
		for (const b of pieces) {
			const wallTex = facade.clone(); wallTex.needsUpdate = true
			wallTex.offset.set(0, (-b.minH % 3.2) / 3.2)
			const wall = new THREE.MeshStandardMaterial({ map: wallTex, color: b.colour ?? t.colour ?? '#ffffff', roughness: 0.55, metalness: 0.08 })
			const cap = new THREE.MeshStandardMaterial({ color: b.roofColour ?? t.roofColour ?? '#8d8f94', roughness: 0.8 })
			disposables.push(wallTex, wall, cap)
			scene.add(massOf(b, wall, cap, '#3a4450'))
		}
		// the footprint outline on the ground (the building's own outline when it is drawn by its parts)
		const ring = [...t.outer, t.outer[0]].map(([x, y]) => new THREE.Vector3(x, 0.08, -y))
		const outline = new THREE.Line(new THREE.BufferGeometry().setFromPoints(ring), new THREE.LineBasicMaterial({ color: '#d9480f' }))
		scene.add(outline); disposables.push(outline.geometry)
		// frame it
		const xs = t.outer.map((p) => p[0]), ys = t.outer.map((p) => p[1])
		const top = Math.max(t.h + t.roofH, ...inp.parts.map((p) => p.h + p.roofH))
		const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2
		focus = { x: cx, y: top / 2, z: -cy, r: Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys), top) }
	}
	const frameTarget = () => {
		const d = focus.r * 1.9 + 40
		camera.position.set(focus.x - d * 0.7, focus.y + d * 0.55, focus.z + d * 0.75)
		controls.target.set(focus.x, focus.y, focus.z); controls.update()
	}
	frameTarget()

	// ── size + loop ──
	const resize = () => { const w = host.clientWidth || 1, h = host.clientHeight || 1; renderer.setSize(w, h, false); renderer.domElement.style.width = '100%'; renderer.domElement.style.height = '100%'; camera.aspect = w / h; camera.updateProjectionMatrix() }
	const ro = new ResizeObserver(resize); ro.observe(host); resize()
	let raf = 0
	const loop = () => { raf = requestAnimationFrame(loop); controls.update(); renderer.render(scene, camera) }
	loop()

	return {
		frameTarget, setGroundTiles,
		dispose() {
			cancelAnimationFrame(raf); ro.disconnect(); controls.dispose()
			for (const d of disposables) d.dispose()
			tileGroup.traverse((o) => { const m = o as InstanceType<typeof THREE.Mesh>; if (m.isMesh) { m.geometry.dispose(); const mt = m.material as InstanceType<typeof THREE.MeshStandardMaterial>; mt.map?.dispose(); mt.dispose() } })
			renderer.dispose(); renderer.domElement.remove()
		},
	}
}
