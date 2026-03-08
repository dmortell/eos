<script>
import { onMount } from "svelte";

// ---------------- basic state and UI ----------------
let W, H;
let canvas = $state()
let ctx = $derived(canvas?.getContext('2d'))
let innerWidth = $state(800), innerHeight = $state(600);

let nodes = $state([]); // {id,x,y}
let edges = $state([]); // {id,a,b,thickness}

let mode = $state('DRAW'); // DRAW | SELECT
let drawingStartNode = $state(null);
let draggingNode = $state(null);
let hoveredNode = $state(null);
let hoveredEdge = $state(null);
let selectedNodeId = $state(null);
let selectedEdgeId = $state(null);
let lastMousePos = $state(null);

let lineWidth = $state(20);
let snapRadius = $state(15);
let miterLimit = $state(4.0);

onMount(()=>{
  window.addEventListener('resize', onResize);
  onResize();
  loadDemo();
  render();
  return ()=>{
    window.removeEventListener('resize', onResize);
  }
})

function onResize(){
  canvas.width = innerWidth - 300;
  canvas.height = innerHeight;
  W=canvas.width; H=canvas.height;
  render();
}

// ---------------- utilities ----------------
const genId = ()=>Math.random().toString(36).slice(2,9);
const sub = (a, b) => ({ x: a.x - b.x, y: a.y - b.y });
const len = (v) => Math.hypot(v.x, v.y);
const dist = (a, b) => len(sub(a, b));

function findNodeAt(pt, r=8){ for (let n of nodes) if (dist(n,pt) <= r) return n; return null; }
function pointToSegmentDistance(pt,a,b){
  const ab = sub(b, a), ap = sub(pt, a), ab2 = ab.x * ab.x + ab.y * ab.y;
  if (ab2 === 0) return dist(pt, a);
  const t = Math.max(0, Math.min(1, (ap.x * ab.x + ap.y * ab.y) / ab2));
  return dist(pt, { x: a.x + ab.x * t, y: a.y + ab.y * t });
}
function projectPointOnSegment(pt,a,b){
  const ab = sub(b,a), ap = sub(pt,a), ab2 = ab.x*ab.x+ab.y*ab.y;
  if (ab2===0) return { x: a.x, y: a.y };
  const t = Math.max(0, Math.min(1, (ap.x*ab.x + ap.y*ab.y)/ab2));
  return { x: a.x + ab.x*t, y: a.y + ab.y*t };
}
function findEdgeAt(pt){
  for (let e of edges){
    const a = nodes.find(n=>n.id===e.a), b = nodes.find(n=>n.id===e.b);
    if (a && b && pointToSegmentDistance(pt,a,b) <= Math.max(6, e.thickness/2+4)) return e;
  }
  return null;
}

// Graph manipulation helpers
function createNode(x,y){
  const id=genId(); nodes.push({id,x,y}); return nodes[nodes.length-1];
}
function createEdge(a,b,thickness=null){
  edges.push({ id: genId(), a, b, thickness: thickness ?? lineWidth });
  return edges[edges.length - 1];
}
function mergeNodes(keepId, removeId){
  if (keepId===removeId) return;
  edges.forEach(e => {
    if (e.a === removeId) e.a = keepId;
    if (e.b === removeId) e.b = keepId;
  });
  nodes = nodes.filter(n=>n.id!==removeId);
  edges = edges.filter(e=>e.a!==e.b);
}

function makePolygons(nodes, edges, miterLimit = 4.0) {
  const v = {    // Vector math helpers
    sub: (a, b) => ({ x: a.x - b.x, y: a.y - b.y }),
    add: (a, b) => ({ x: a.x + b.x, y: a.y + b.y }),
    scale: (v, s) => ({ x: v.x * s, y: v.y * s }),
    len: (v) => Math.sqrt(v.x * v.x + v.y * v.y),
    norm: (w) => { const l = v.len(w); return l ? { x: w.x / l, y: w.y / l } : { x: 0, y: 0 }; },
    perp: (v) => ({ x: -v.y, y: v.x }), // 90° CCW rotation (right side in canvas coords)
    cross: (a, b) => a.x * b.y - a.y * b.x,
    distSq: (a, b) => (a.x - b.x) ** 2 + (a.y - b.y) ** 2
  };

  // Build adjacency list with angle-sorted neighbors
  const nodeMap = new Map(nodes.map(n => [n.id, { ...n, adj: [] }]));
  edges.forEach(e => {
    const u = nodeMap.get(e.a), v = nodeMap.get(e.b);
    if (!u || !v) return;
    u.adj.push({ targetId: v.id, thickness: e.thickness, edgeId: e.id });
    v.adj.push({ targetId: u.id, thickness: e.thickness, edgeId: e.id });
  });

  // Sort neighbors by angle for proper traversal
  nodeMap.forEach(node => {
    node.adj.forEach(nb => {
      const target = nodeMap.get(nb.targetId);
      nb.angle = Math.atan2(target.y - node.y, target.x - node.x);
    });
    node.adj.sort((a, b) => a.angle - b.angle);
  });

  // Traverse half-edges to build polygon loops
  const polygons = [], visited = new Set();

  for (const startNode of nodeMap.values()) {
    for (const edgeInfo of startNode.adj) {
      const key = `${startNode.id}|${edgeInfo.targetId}`;
      if (visited.has(key)) continue;
      // Follow right-hand rule around the outline
      const poly = [];
      let currId = startNode.id, nextId = edgeInfo.targetId;
      while (!visited.has(`${currId}|${nextId}`)) {
        visited.add(`${currId}|${nextId}`);
        const curr = nodeMap.get(currId), next = nodeMap.get(nextId);
        const arrivalIdx = next.adj.findIndex(n => n.targetId === currId);
        const nextIdx = (arrivalIdx - 1 + next.adj.length) % next.adj.length;
        const nextEdge = next.adj[nextIdx];
        const prev = nodeMap.get(currId), upcoming = nodeMap.get(nextEdge.targetId);
        const thIn = next.adj[arrivalIdx].thickness, thOut = nextEdge.thickness;
        const dirIn = v.norm(v.sub(next, prev)), dirOut = v.norm(v.sub(upcoming, next));
        const rightIn = v.perp(dirIn), rightOut = v.perp(dirOut);
        const r1 = thIn / 2, r2 = thOut / 2;

        // Handle dead-end (180° turn) or general joint
        if (currId === nextEdge.targetId) {
          poly.push(v.add(next, v.scale(rightIn, r1)), v.add(next, v.scale(rightOut, r2)));
        } else {
          const p1 = v.add(next, v.scale(rightIn, r1)), p2 = v.add(next, v.scale(rightOut, r2));
          const det = v.cross(dirIn, dirOut);
          if (Math.abs(det) < 1e-5) {
            poly.push(p1); // Parallel edges
          } else {
            const t = v.cross(v.sub(p2, p1), dirOut) / det;
            const intersection = v.add(p1, v.scale(dirIn, t));
            const distToNode = Math.sqrt(v.distSq(intersection, next));
            const maxDist = Math.min(thIn, thOut) * miterLimit;
            if (distToNode > maxDist) {
              poly.push(p1, p2); // Bevel sharp corners
            } else {
              poly.push(intersection); // Miter joint
            }
          }
        }
        currId = next.id;
        nextId = nextEdge.targetId;
      }
      if (poly.length > 0) polygons.push(poly);
    }
  }
  return polygons;
}

function generateRandomGraph() {
  let nodeCount = 8, edgeId = 0;
  nodes = [], edges = [];
  for(let i=0; i<nodeCount; i++) {
      nodes.push({ id: i, x: Math.random() * (W * 0.6) + W * 0.2, y: Math.random() * (H * 0.6) + H * 0.2, });
  }
  for (let i=1; i<nodeCount; i++) {		// Create Edges (Spanning tree + random cycles)
    const target = Math.floor(Math.random() * i);
    edges.push({ id: edgeId++, a: i, b: target, thickness: 20 + Math.random() * 30 });
  }
  for(let i=0; i<3; i++) {		// Add extra random edges for cycles
    const n1 = Math.floor(Math.random() * nodeCount);
    const n2 = Math.floor(Math.random() * nodeCount);
    if (n1 !== n2 && !edges.find(e => (e.a===n1 && e.b===n2) || (e.a===n2 && e.b===n1))) {
        edges.push({ id: edgeId++, a: n1, b: n2, thickness: 10 + Math.random() * 20 });
    }
  }
  render();
}

// ---------------- rendering + debug overlay ----------------
function render(){
  if (!ctx) return;
  ctx.clearRect(0,0,W,H);
  drawGrid();

    // 1. Generate Polygons using the Algorithm
    const polys = makePolygons(nodes, edges, miterLimit);

    // 2. Draw Generated Polygons (The "Extruded" Result)
    ctx.beginPath();
    polys.forEach((poly) => {
      poly.forEach((p,i) => i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))
      ctx.closePath();
    });
    // "evenodd" or default (non-zero) works here because inner loops wind opposite to outer loops
    ctx.lineWidth = 2; ctx.lineJoin = 'round';
    ctx.fillStyle = `rgba(56, 189, 248, 0.3)`; ctx.fill();
    ctx.strokeStyle = `rgb(56, 189, 248)`;     ctx.stroke();

    // 3. Draw edges
    if (selectedEdgeId || hoveredEdge){
      ctx.lineWidth = 1; ctx.globalAlpha = 0.8;
      for (const e of edges){
        ctx.strokeStyle = e.id==selectedEdgeId ? 'red' : e==hoveredEdge ? 'blue' :  '#9ca3af';
        const a = nodes.find(n=>n.id===e.a), b = nodes.find(n=>n.id===e.b);
        if (a && b) ctx.beginPath(); ctx.moveTo(a.x,a.y); ctx.lineTo(b.x,b.y); ctx.stroke();
      }
    }

    // Draw Nodes
  for (const n of nodes){
    ctx.beginPath(); ctx.arc(n.x,n.y,4,0,Math.PI*2);
    ctx.fillStyle='#fff'; ctx.fill();
    ctx.strokeStyle = n.id==selectedNodeId ? 'red' : n==hoveredNode ? 'blue' : '#374151'; ctx.stroke();
  }

  // hovered edge highlight
  if (hoveredEdge){
    const p = polys.find(x=>x.edgeId===hoveredEdge.id);
    if (p){
      ctx.beginPath(); p.points.forEach((pt,i)=> i ? ctx.lineTo(pt.x,pt.y) : ctx.moveTo(pt.x,pt.y)); ctx.closePath();
      ctx.globalAlpha = 0.06; ctx.fillStyle = '#0ea5a4'; ctx.fill(); ctx.globalAlpha = 1;
      ctx.strokeStyle = '#059669'; ctx.lineWidth = 1.5; ctx.stroke();
    }
  }

  // // draw provisional dashed segment when drawing
  if (mode === 'DRAW' && drawingStartNode && lastMousePos){
    ctx.beginPath(); ctx.moveTo(drawingStartNode.x,drawingStartNode.y); ctx.lineTo(lastMousePos.x,lastMousePos.y);
    ctx.setLineDash([6,6]); ctx.strokeStyle = '#111827'; ctx.lineWidth = 1; ctx.stroke(); ctx.setLineDash([]);
  }
}

function drawGrid(){
  const gap = 40;
  ctx.save(); ctx.strokeStyle = '#eef2ff'; ctx.lineWidth = 1;
  for (let x=0;x<W;x+=gap){ ctx.beginPath(); ctx.moveTo(x,0); ctx.lineTo(x,H); ctx.stroke(); }
  for (let y=0;y<H;y+=gap){ ctx.beginPath(); ctx.moveTo(0,y); ctx.lineTo(W,y); ctx.stroke(); }
  ctx.restore();
}


// ---------------- mouse interactions ----------------
function getPos(ev){
  const rect = canvas.getBoundingClientRect();
  return { x: ev.clientX - rect.left, y: ev.clientY - rect.top };
}

function splitEdge(e, proj){
    const newNode = createNode(proj.x, proj.y);
    edges = edges.filter(edge => edge.id !== e.id);     // Remove the old edge
    createEdge(e.a, newNode.id, e.thickness);           // create two new edges through the new node
    createEdge(newNode.id, e.b, e.thickness);
    selectedNodeId = newNode.id
    return newNode;
}

const onmousedown = (ev)=>{
  const pt = getPos(ev);
  if (mode === 'DRAW'){
    let n = findNodeAt(pt), add=0;
    if (!n){
      const e = findEdgeAt(pt);
      if (e){
        // clicked edge, either drag edge, or insert a node for dragging, or start a new segment from a new node on this edge
        selectedEdgeId = e.id; lineWidth = e.thickness;
        // Snap the click to the nearest point along the clicked edge, then create node
        const nodeA = nodes.find(node => node.id === e.a);
        const nodeB = nodes.find(node => node.id === e.b);
        const proj = projectPointOnSegment(pt, nodeA, nodeB);

        if (ev.shiftKey) {    // this add a bend to the line
          draggingNode = splitEdge(e,proj)
        }
        else if (ev.ctrlKey){   // this connects a new segment to the line
          drawingStartNode = splitEdge(e,proj);    // this connects a new segment to the line
        }
      }
      else {    // clicked an empty area, add a new line
        selectedEdgeId = null;
        n = createNode(pt.x, pt.y);
        drawingStartNode = n;
        selectedNodeId = n.id
        if (!ev.ctrlKey) draggingNode = n;
      }
    }
    else {
      drawingStartNode = n;
      selectedNodeId = n.id
      if (!ev.ctrlKey) draggingNode = n;
    }
  } else {
    selectedEdgeId = null;
    selectedNodeId = null;
    const node = findNodeAt(pt,8);
    if (node){ draggingNode = node; selectedNodeId = n.id; return; }
    const e = findEdgeAt(pt);
    if (e){ selectedEdgeId = e.id; lineWidth = e.thickness; }

    render();
  }
}

const onmousemove = (ev) => {
  const pt = getPos(ev);
  lastMousePos = pt;
  hoveredNode = findNodeAt(pt, 8);
  hoveredEdge = findEdgeAt(pt);
  if (draggingNode){ draggingNode.x = pt.x; draggingNode.y = pt.y; }
  render();
}

const onmouseup = (ev)=>{
  const pt = getPos(ev);
  if (mode === 'DRAW'){
    if (drawingStartNode){
      let end = findNodeAt(pt, snapRadius);
      if (!end) end = createNode(pt.x, pt.y);
      if (dist(drawingStartNode, end) > 4){
        const exists = edges.some(e => (e.a===drawingStartNode.id && e.b===end.id) || (e.b===drawingStartNode.id && e.a===end.id));
        if (!exists) createEdge(drawingStartNode.id, end.id, lineWidth);
      }
    }
    drawingStartNode = null;
  }

  if (draggingNode){
    const others = nodes.filter(n=>n.id !== draggingNode.id);
    for (let n of others){
      if (dist(n, draggingNode) <= snapRadius){
        mergeNodes(n.id, draggingNode.id);		// merge draggingNode into existing nodes
        draggingNode = null;
        render();
        return;
      }
    }
  }
  draggingNode = null;
  render();
}

const ondblclick = (ev)=>{
  const pt = getPos(ev);
  const n = findNodeAt(pt,8);
  if (n){
    nodes = nodes.filter(x=>x.id!==n.id);
    edges = edges.filter(e=>e.a!==n.id && e.b!==n.id);
    render();
  }
}

const onkeydown = (ev)=>{
  if (ev.key === 'Delete' || ev.key === 'Backspace'){
		if (selectedEdgeId){
      edges = edges.filter(e=>e.id!==selectedEdgeId); selectedEdgeId=null; render();
    }
	}
}

// ---------------- demo data and initial load ----------------
function loadDemo(){
  nodes = []; edges = [];
  const n1 = createNode(240,220), n2 = createNode(520,220), n3 = createNode(520,420), n4 = createNode(240,420);
  createEdge(n1.id, n2.id, 20);
  createEdge(n2.id, n3.id, 20);
  createEdge(n3.id, n4.id, 20);
  createEdge(n4.id, n1.id, 20);
  // T / 3-way and an acute 3-way
  const nt = createNode(360,100);
  createEdge(nt.id, n1.id, 18);
  const na = createNode(600,160);
  createEdge(n2.id, na.id, 14);
  createEdge(n2.id, nt.id, 12);
  render();
}

function updateWidth(ev){
  if (selectedEdgeId){
    const e = edges.find(x=>x.id===selectedEdgeId);
    if (e){ e.thickness = Number(ev.target.value); render(); }
  }
}

</script>

<svelte:window bind:innerHeight bind:innerWidth {onkeydown} />

<main class="bg-white xh-full overflow-hidden text-black text-sm">
  <div id="wrap" class="flex gap-2">
    <div class="panel p-2 border-r" style:width='300px'>
      <a href='/' class="text-blue">Back</a> GPT
      <div class="row flex justify-center gap-4">
        <button id="drawBtn"   onclick={e=>mode='DRAW'  } class:active={mode=='DRAW'  }>Draw</button>
        <button id="selectBtn" onclick={e=>mode='SELECT'} class:active={mode=='SELECT'}>Select</button>
        <button id="clearBtn"  onclick={e=>{ nodes=[]; edges=[]; selectedEdgeId=null; render()}} >Clear</button>
        <button onclick={loadDemo}>Reset</button>
      </div>

      <label for=w1>Selected width: {lineWidth} px</label>					<input id=w1 bind:value={lineWidth}  oninput={updateWidth}  type="range" min="2" max="200" />
      <label for=w3>Miter limit:    {miterLimit.toFixed(2)}</label>	<input id=w3 bind:value={miterLimit} oninput={e=>render()}  type="range" min="1" max="20" step="0.1"/>

      <p class="small" style="margin-top:8px">
        <strong>Draw:</strong> Click to start/end line. Shift+click edge to add bend. Ctrl+click edge to branch.<br/>
        <strong>Select:</strong> Drag nodes. Drag near another to merge. Click edge to adjust width.<br/>
        Double-click node to delete. Delete key removes selected edge.
      </p>
      <textarea class="text-xs">{JSON.stringify({ nodes: nodes, edges: edges }, null, 2)}</textarea>
    </div>

    <canvas bind:this={canvas} {onmousedown} {onmousemove} {onmouseup} {ondblclick} width="800px" height="800px" style:cursor={mode=='DRAW' ? 'pointer':'default'}></canvas>
  </div>
</main>

<style>
  button{padding:6px 10px;border-radius:6px;border:1px solid #d1d5db;background:#fff;cursor:pointer; color:#000;}
  button.active{background:#111827;color:#fff;border-color:#111827}
  label{font-size:13px;color:#374151;display:block;margin-top:8px}
  input[type=range]{width:100%}
  textarea{width:100%;height:160px;font-family:monospace;font-size:12px;margin-top:6px}
  .small{font-size:12px;color:#6b7280}
</style>