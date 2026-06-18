<script lang="ts">
	import type { Section } from './constants'
	import { calcFillRate, DEFAULT_THICKNESS } from './constants'

	let { section, size = 400 }: { section: Section; size?: number } = $props()

	let canvas = $state<HTMLCanvasElement>()
	let fillRate = $derived(calcFillRate(section))

	$effect(() => {
		// Track all reactive deps
		const { containmentType, diameter, width, height, thickness, cables, calcMethod } = section
		if (containmentType && cables && canvas) draw()
	})

	function draw() {
		if (!canvas) return
		const ctx = canvas.getContext('2d')
		if (!ctx) return

		const padding = 20
		let containmentWidth = 0
		let containmentHeight = 0
		if (section.containmentType === 'round') {
			containmentWidth = containmentHeight = section.diameter
		} else {
			containmentWidth = section.width
			containmentHeight = section.height
		}

		const maxDimension = Math.max(containmentWidth, containmentHeight)
		const scaleFactor = Math.min(
			(canvas.width - 2 * padding) / maxDimension,
			(canvas.height - 2 * padding) / maxDimension,
		)
		const centerX = canvas.width / 2
		const centerY = canvas.height / 2

		ctx.fillStyle = '#ffffff'
		ctx.fillRect(0, 0, canvas.width, canvas.height)
		ctx.strokeStyle = '#1e40af'
		ctx.lineWidth = 3
		ctx.font = '12px Arial'
		ctx.textAlign = 'center'

		if (section.containmentType === 'round') {
			const radius = (containmentWidth / 2) * scaleFactor
			ctx.beginPath()
			ctx.arc(centerX, centerY, radius + 8, 0, 2 * Math.PI)
			ctx.stroke()
			ctx.beginPath()
			ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI)
			ctx.stroke()
			ctx.fillStyle = '#eff6ff'
			ctx.fill()

			ctx.fillStyle = '#374151'
			ctx.fillText(`\u00D8 ${section.diameter}mm`, centerX - 130, canvas.height - 25)
			ctx.fillText(`Fill: ${fillRate.toFixed(1)}%`, centerX + 130, canvas.height - 20)
		} else {
			const t = section.thickness ?? DEFAULT_THICKNESS
			const w = containmentWidth * scaleFactor
			const h = containmentHeight * scaleFactor
			const iw = Math.max(0, containmentWidth - 2 * t) * scaleFactor
			const ih = Math.max(0, containmentHeight - 2 * t) * scaleFactor

			// Outer wall
			ctx.fillStyle = '#dbeafe'
			ctx.fillRect(centerX - w / 2, centerY - h / 2, w, h)
			ctx.strokeRect(centerX - w / 2, centerY - h / 2, w, h)
			// Inner usable area
			ctx.fillStyle = '#eff6ff'
			ctx.fillRect(centerX - iw / 2, centerY - ih / 2, iw, ih)
			ctx.save()
			ctx.lineWidth = 1
			ctx.strokeStyle = '#60a5fa'
			ctx.strokeRect(centerX - iw / 2, centerY - ih / 2, iw, ih)
			ctx.restore()

			ctx.fillStyle = '#374151'
			ctx.fillText(`${section.width} \u00D7 ${section.height}mm (t${t})`, centerX - w / 2 + 55, centerY + h / 2 + 15)
			ctx.fillText(`Fill: ${fillRate.toFixed(1)}%`,                        centerX + w / 2 - 50, centerY + h / 2 + 15)
		}

		// Build individual cable instances
		const allCables: { diameter: number; radius: number }[] = []
		section.cables.forEach((cableGroup) => {
			for (let i = 0; i < cableGroup.quantity; i++) {
				allCables.push({ diameter: cableGroup.diameter, radius: (cableGroup.diameter / 2) * scaleFactor })
			}
		})
		allCables.sort((a, b) => b.diameter - a.diameter)

		const positions: { x: number; y: number; radius: number }[] = []
		const cableColor = fillRate > 100 ? '#dc2626' : fillRate > 60 ? '#e08020' : fillRate > 40 ? '#16a34a' : '#3b82f6'

		function collides(x: number, y: number, radius: number): boolean {
			for (const pos of positions) {
				const dist = Math.sqrt(Math.pow(x - pos.x, 2) + Math.pow(y - pos.y, 2))
				if (dist < radius + pos.radius - 0.5) return true
			}
			return false
		}

		allCables.forEach((cable) => {
			const radius = cable.radius
			let x = 0, y = 0
			let placed = false

			if (section.containmentType === 'round') {
				const containmentRadius = (containmentWidth / 2) * scaleFactor
				const groundY = centerY + containmentRadius - radius
				for (let testY = groundY; testY >= centerY - containmentRadius + radius && !placed; testY -= 0.5) {
					const distFromCenter = Math.abs(testY - centerY)
					const maxDistAtY = Math.sqrt(Math.max(0, containmentRadius * containmentRadius - distFromCenter * distFromCenter))
					if (maxDistAtY >= radius) {
						const leftX = centerX - maxDistAtY + radius
						const rightX = centerX + maxDistAtY - radius
						for (let testX = leftX; testX <= rightX; testX += 1) {
							const distToCenter = Math.sqrt(Math.pow(testX - centerX, 2) + Math.pow(testY - centerY, 2))
							if (distToCenter + radius <= containmentRadius + 0.1) {
								if (!collides(testX, testY, radius)) { x = testX; y = testY; placed = true; break }
							}
						}
					}
				}
			} else {
				const t = section.thickness ?? DEFAULT_THICKNESS
				const iw = Math.max(0, containmentWidth - 2 * t) * scaleFactor
				const ih = Math.max(0, containmentHeight - 2 * t) * scaleFactor
				const left = centerX - iw / 2
				const right = centerX + iw / 2
				const bottom = centerY + ih / 2
				const top = centerY - ih / 2
				const groundY = bottom - radius
				for (let testY = groundY; testY >= top + radius && !placed; testY -= 0.5) {
					for (let testX = left + radius; testX <= right - radius; testX += 1) {
						if (!collides(testX, testY, radius)) { x = testX; y = testY; placed = true; break }
					}
				}
			}

			if (placed) {
				positions.push({ x, y, radius })
				ctx.fillStyle = cableColor
				ctx.strokeStyle = '#000000'
				ctx.lineWidth = 1
				ctx.beginPath()
				ctx.arc(x, y, radius, 0, 2 * Math.PI)
				ctx.fill()
				ctx.stroke()
				if (radius > 8) {
					ctx.fillStyle = '#ffffff'
					ctx.font = 'bold 10px Arial'
					ctx.textAlign = 'center'
					ctx.textBaseline = 'middle'
					ctx.fillText(`${cable.diameter}`, x, y)
				}
			}
		})
	}
</script>

<canvas bind:this={canvas} width={size} height={size}></canvas>
