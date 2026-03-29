<script>
	import { Titlebar, Button } from '$lib'

	let canvas = $state();
	let containmentType = $state('rectangular')
	let calc = $state("rectangular");		// calculate type: rectangular or circular
	let diameter = $state(50)
	let width = $state(50)
	let height = $state(30)
	let cables = $state([
		{ id: "1", diameter:  6, quantity: 15 },
		{ id: "2", diameter: 10, quantity:  5 },
	])

	const fillColor = $derived.by(() => {
    if (fillRate > 100) return "text-red-600";
    if (fillRate > 80) return "text-orange-500";
    if (fillRate > 40) return "text-green-600";
    return "text-blue-500";
  });

  const fillStatus = $derived.by(() => {
    if (fillRate > 100) return "Overfilled - Exceeds capacity!";
    if (fillRate > 80) return "High - Near capacity";
    if (fillRate > 40) return "Moderate - Good utilization";
    return "Low - Plenty of space";
  });

  const fillRate = $derived.by(() => {
		const r = parseFloat(diameter) / 2;
    let containmentArea = (containmentType === "round") ?  Math.PI * r * r : parseFloat(width) * parseFloat(height);

		const cablesArea = cables.reduce((sum, cable) => {
			if (calc=='rectangular'){
				const area = cable.diameter * cable.diameter
				return sum + (area * cable.quantity);
			}
      const r = cable.diameter / 2;
      return sum + (Math.PI * r * r * cable.quantity);
    }, 0);

    return (cablesArea / containmentArea) * 100;
  });

	const addCable = () => {
		const newId = (Math.max(...cables.map(c => parseInt(c.id)), 0) + 1).toString();
		cables = [...cables, { id: newId, diameter: 10, quantity: 1 }]
	};
  const removeCable = (id) => {
    if (cables.length > 1) cables = cables.filter(c => c.id !== id)
  };

	$effect(()=>{
		if (containmentType && diameter && width && height && cables) drawVisualization();
	})

  const drawVisualization = () => {
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const scale = 3;
    const padding = 40;
    let containmentWidth = 0;
    let containmentHeight = 0;
    if (containmentType === "round") {
      const d = parseFloat(diameter);
      containmentWidth = containmentHeight = d;
    } else {
      containmentWidth = parseFloat(width);
      containmentHeight = parseFloat(height);
    }

    // Scale to fit canvas
    const maxDimension = Math.max(containmentWidth, containmentHeight);
    const scaleFactor = Math.min((canvas.width - 2 * padding) / maxDimension, (canvas.height - 2 * padding) / maxDimension);

    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;

    // Draw containment
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = "#1e40af";
    ctx.lineWidth = 3;
		ctx.font = "12px Arial";
		ctx.textAlign = "center";

    if (containmentType === "round") {
      const radius = (containmentWidth / 2) * scaleFactor;
			ctx.arc(centerX, centerY, radius + 8, 0, 2 * Math.PI); ctx.stroke();
      ctx.beginPath(); ctx.arc(centerX, centerY, radius, 0, 2 * Math.PI); ctx.stroke();
      ctx.fillStyle = "#eff6ff"; ctx.fill();

			// Draw dimensions
			ctx.fillStyle = "#374151";
			ctx.fillText(`Ø ${diameter}mm`, centerX + 50, canvas.height - 20);
			ctx.fillText(`Fill: ${fillRate.toFixed(1)}%`, centerX - 50, canvas.height - 20);

    } else {
      const w = containmentWidth * scaleFactor;
      const h = containmentHeight * scaleFactor;
      ctx.fillStyle = "#eff6ff";
      ctx.fillRect(centerX - w/2, centerY - h/2, w, h);
      ctx.strokeRect(centerX - w/2, centerY - h/2, w, h);

			// Draw dimensions
			ctx.fillStyle = "#374151";
			ctx.fillText(`${width} × ${height}mm`, centerX + w/2 - 50, centerY + h/2 + 20);
			ctx.fillText(`Fill: ${fillRate.toFixed(1)}%`, centerX - w/2 + 50, centerY + h/2 + 20);
    }

    // Create individual cable instances from groups
    const allCables = [];
    cables.forEach(cableGroup => {
      for (let i = 0; i < cableGroup.quantity; i++) {
        allCables.push({
          diameter: cableGroup.diameter,
          radius: (cableGroup.diameter / 2) * scaleFactor
        });
      }
    });

    allCables.sort((a, b) => b.diameter - a.diameter);    // Sort cables by diameter (largest first for better packing)
    const positions = [];    // Layer-based gravity packing
    const cableColor = fillRate > 100 ? "#dc2626" : fillRate > 80 ? "#ea580c" : fillRate > 40 ? "#f59e0b" : "#16a34a";

		function collides(x,y, radius){
			for (const pos of positions) {									// Check for collisions with existing cables
				const dist = Math.sqrt(Math.pow(x - pos.x, 2) + Math.pow(y - pos.y, 2));
				if (dist < radius + pos.radius - 0.5) return true;
			}
			return false;
		}

    allCables.forEach((cable) => {
      const radius = cable.radius;
      let x = 0, y = 0;
      let placed = false;

      if (containmentType === "round") {
        // Find the lowest valid Y position where this cable can fit
        const containmentRadius = (containmentWidth / 2) * scaleFactor;
        const groundY = centerY + containmentRadius - radius;

        // Start from the bottom and work up in small increments
        for (let testY = groundY; testY >= centerY - containmentRadius + radius && !placed; testY -= 0.5) {
          // Calculate the valid X range at this Y position within the circle
          const distFromCenter = Math.abs(testY - centerY);
          const maxDistFromCenterAtY = Math.sqrt(Math.max(0, containmentRadius * containmentRadius - distFromCenter * distFromCenter));

          if (maxDistFromCenterAtY >= radius) {
            const leftX = centerX - maxDistFromCenterAtY + radius;
            const rightX = centerX + maxDistFromCenterAtY - radius;
            for (let testX = leftX; testX <= rightX; testX += 1) {							// Try positions from left to right across this layer
              const distToCenter = Math.sqrt(Math.pow(testX - centerX, 2) + Math.pow(testY - centerY, 2));
              if (distToCenter + radius <= containmentRadius + 0.1) {						// Verify position is within the circle
                if (!collides(testX, testY, radius)) { x = testX; y = testY; placed = true; break; }
              }
            }
          }
        }
      } else {
        // Rectangular containment - layer by layer from bottom
        const w = containmentWidth * scaleFactor;
        const h = containmentHeight * scaleFactor;
        const left = centerX - w / 2;
        const right = centerX + w / 2;
        const bottom = centerY + h / 2;
        const top = centerY - h / 2;

        // Start from the bottom
        const groundY = bottom - radius;
        for (let testY = groundY; testY >= top + radius && !placed; testY -= 0.5) {
          // Try positions from left to right across this layer
          for (let testX = left + radius; testX <= right - radius; testX += 1) {
            if (!collides(testX, testY, radius)) {
              x = testX;
              y = testY;
              placed = true;
              break;
            }
          }
        }
      }

      if (placed) {
        positions.push({ x, y, radius });

        // Draw cable
        ctx.fillStyle = cableColor;
        ctx.strokeStyle = "#000000";
        ctx.lineWidth = 1;
        ctx.beginPath(); ctx.arc(x, y, radius, 0, 2 * Math.PI); ctx.fill(); ctx.stroke();

        // Draw cable label (only if large enough)
        if (radius > 8) {
          ctx.fillStyle = "#ffffff";
          ctx.font = "bold 10px Arial";
          ctx.textAlign = "center";
          ctx.textBaseline = "middle";
          ctx.fillText(`${cable.diameter}`, x, y);
        }
      }
    });
  };

</script>

<Titlebar>Fill Rate</Titlebar>

<div class="flex">
	<div class="text-sm px-2 py-1 border-r border-gray-300 w-80 print:hidden">
		<Button class="rounded border px-2 py-1" active={containmentType=="round"} onclick={e=>containmentType="round"}>Round (Conduit)</Button>
		<Button class="rounded border px-2 py-1" active={containmentType=="rectangular"} onclick={e=>containmentType="rectangular"}>Rectangular (Trunking)</Button>
		<div class="flex mt-2">
			{#if containmentType=='round'}
				<div class="space-y-2 mb-2">
					<label for="diameter">Diameter (mm):</label>
					<input id="diameter" type="number" min="1" bind:value={diameter} placeholder="100" />
				</div>
			{:else}
				<div class="grid gap-4 sm:grid-cols-2 mb-2">
					<div class="space-y-2">
						<label for="width">Width (mm)</label>
						<input id="width" type="number" min="1" bind:value={width}  placeholder="100" />
					</div>
					<div class="space-y-2">
						<label for="height">Height (mm)</label>
						<input id="height" type="number" min="1" bind:value={height}  placeholder="50" />
					</div>
				</div>
			{/if}
		</div>


		<div class="flex justify-between mt-4">
			<div>
				<span>Fill Rate:</span>
				<b class="{fillColor}">{fillRate.toFixed(1)}%</b>
				<div class="{fillColor} mt-2 text-sm text-muted-foreground">{fillStatus}</div>
			</div>
			<div>
				By: <button class="mr-2 px-2 py-1 border rounded" onclick={e=>calc = calc=='rectangular' ? "diameter":"rectangular" }>{calc}</button>
			</div>
		</div>


		<div class="mt-4"><b>Cable Groups</b></div>
			<div class="flex items-center gap-2">
				<div class="flex-1 space-y-2xx">Diameter (mm)</div>
				<div class="flex-1 space-y-2xx">Qty</div>
				<div></div>
			</div>
		{#each cables as cable, index}
			<div class="flex items-center gap-2 py-1 border-gray-300">
				<div class="flex-1 space-y-2xx">
					<input id={`cable-diameter-${cable.id}`} type="number" min="0.1" step="0.1" bind:value={cable.diameter} placeholder="10" class="w-20"/>
				</div>
				<div class="flex-1 space-y-2xx">
					<input id={`cable-quantity-${cable.id}`} type="number" min="1" step="1" bind:value={cable.quantity} placeholder="1" class="w-20"/>
				</div>
				<Button icon=trash onclick={() => removeCable(cable.id)} class="shrink-0 p-1" />
			</div>
		{/each}
		<Button icon=plus variant=primary class="w-full rounded" onclick={addCable}>Add Cable Group</Button>
	</div>


	<div class="p-2">
		<div class="flex items-center justify-between w-full">
			<div>Cross-Section View</div>
			<div><Button icon=print onclick={e=>window.print()} variant=primary class="rounded print:hidden">Print</Button></div>
		</div>
		{#each cables as cable, index}<div>{cable.diameter}mm x {cable.quantity}</div>{/each}
		<canvas bind:this={canvas} width={600} height={600} class=""></canvas>
	</div>

</div>

<style>
	input { border: 1px solid #bbb; border-radius:4px; padding: 0 4px; width:5em;}
</style>
