let abs = Math.abs

export function isHorizontal(size){
  return abs(size.x2-size.x1) > abs(size.y2-size.y1)
}

export function dragDimension(size, handle, next){
    if (handle & 1)            Object.assign(size, { x1: next.x, y1: next.y });
    if (handle & 2 || !handle) Object.assign(size, { x2: next.x, y2: next.y });
    if (handle & 4) size.offset = isHorizontal(size) ? (size.y1 - next.y) : (next.x - size.x1);
    if (handle & 8){
      const dx = next.x - size.sx, dy = next.y - size.sy;
      Object.assign(size, { x1:size.x1+dx, y1:size.y1+dy, x2:size.x2+dx, y2:size.y2+dy });
    }
    let scale = size.scale || 1;
    size.distance = isHorizontal(size)
      ? (abs(size.x2 - size.x1) * scale).toFixed(1)
      : (abs(size.y2 - size.y1) * scale).toFixed(1)

}