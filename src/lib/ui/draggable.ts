interface DraggableState {
	cursor?: string
	onMove?: (dx: number, dy: number) => void
}

export function draggable(node: HTMLElement, data: DraggableState) {
  let state = data, sx = 0, sy = 0;
  if (state.cursor) node.style.cursor = state.cursor;
  node.addEventListener('mousedown', doDown);

  function doDown(e: MouseEvent) {
    if (e.button !== 0) return; // Only handle left-click
    e.preventDefault();
    e.stopPropagation();
    document.body.style.userSelect = 'none';
    document.addEventListener('mousemove', doMove);
    document.addEventListener('mouseup', doUp);
    sx = e.clientX; sy = e.clientY;
  }
  function doMove(e: MouseEvent) {
    e.preventDefault();
    if (state.onMove) state.onMove(e.clientX - sx, e.clientY - sy);
    sx = e.clientX; sy = e.clientY;
  }
  function doUp(_e: MouseEvent) {
    document.body.style.userSelect = '';
    document.removeEventListener('mousemove', doMove);
    document.removeEventListener('mouseup', doUp);
  }
  return {
    update(data: DraggableState) { state = data; },
    destroy() { node.removeEventListener('mousedown', doDown); }
  };
}
