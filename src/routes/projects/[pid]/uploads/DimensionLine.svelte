<script>
	import { isHorizontal, dragDimension } from './DimensionLine.ts'
	let {size={}, selected=false,stroke='black'} = $props();
	let {abs} = Math

	function parts(){
		let type = !isHorizontal(size)
		let ox = type ? size.offset : 0;
		let oy = type ? 0 : -size.offset;
		let x1 = size.x1 + ox, y1 = size.y1 + oy;
		let x2 = size.x2 + ox, y2 = size.y2 + oy;
		let distance = isHorizontal(size) ? abs(size.x2-size.x1) : abs(size.y2-size.y1)
		return {x1,y1,x2,y2,type,distance}
	}
	function dimension(part=0){
		let {x1,y1,x2,y2,type} = parts()
		if (part==0) return           {x1:size.x1, y1:size.y1, x2:x1, y2:y1, 'data-id':part}
		if (type)    return part==1 ? {x1:size.x2, y1:size.y2, x2:x1, y2:y2, 'data-id':part} : {x1, y1, x2:x1, y2, 'data-id':part}
		return              part==1 ? {x1:size.x2, y1:size.y2, x2:x2, y2:y1, 'data-id':part} : {x1, y1, x2, y2:y1, 'data-id':part}
	}
	function text(){
		let {x1,y1,x2,y2,type} = parts()
		return type ? {transform:`translate(${x1-10} ${(y1+y2)/2}) rotate(-90)`} : {x:(x1+x2)/2, y:y1-10}
	}
</script>

{#snippet Handle(type, x, y, w=0, h=0, rx=5, opacity=0.8, size=10, cursor="move")}
	{@const half=size/2}
	<rect data-id={type} x={x-half} y={y-half} width={w+size} height={h+size} {rx} {opacity} stroke-width=1 fill=transparent stroke=red {cursor}></rect>
{/snippet}

<g class="dimension hover-line no-panzoom" {stroke} fill={stroke} stroke-width=1>
	<marker id="arrowhead" fill="inherit" stroke="none" refX="20.4" refY="9" markerWidth="40.8" markerHeight="18" markerUnits="userSpaceOnUse" orient="auto-start-reverse"><path d="M 1 1 L 21 9 L 1 16.8 L 6 9 z"></path></marker>
	<line cursor=move {...dimension(0)} ></line>
	<line cursor=move {...dimension(1)} ></line>
	<line cursor=move {...dimension(2)}  marker-start="url(#arrowhead)" marker-end="url(#arrowhead)"></line>
	<text cursor=move {...text()} data-id=8 text-anchor=middle dominant-baseline=middle class="select-none">{size.distance}mm</text>
	{#if selected}
		{@const line=parts()}
		{@render Handle(1, size.x1, size.y1)}
		{@render Handle(2, size.x2, size.y2)}
		{@render Handle(4, line.x1, line.y1)}
	{/if}
</g>