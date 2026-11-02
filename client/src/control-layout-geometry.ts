export type LayoutPoint = { x: number; y: number; scale: number };
export type LayoutBox = { width: number; height: number };
export type LayoutArea = { width: number; height: number; left: number; right: number; top: number; bottom: number };
export function fitControl(point: LayoutPoint, box: LayoutBox, area: LayoutArea): LayoutPoint {
  const scale = Math.min(point.scale, (area.width-area.left-area.right)/box.width, (area.height-area.top-area.bottom)/box.height);
  const halfW=box.width*scale/2, halfH=box.height*scale/2;
  return {scale, x: Math.max(area.left+halfW,Math.min(area.width-area.right-halfW,point.x*area.width/100))/area.width*100,
    y: Math.max(area.top+halfH,Math.min(area.height-area.bottom-halfH,point.y*area.height/100))/area.height*100};
}
export function controlsOverlap(a: LayoutPoint, aBox: LayoutBox, b: LayoutPoint, bBox: LayoutBox, area: LayoutArea): boolean {
  return Math.abs(a.x-b.x)*area.width/100 < (aBox.width*a.scale+bBox.width*b.scale)/2+8 &&
    Math.abs(a.y-b.y)*area.height/100 < (aBox.height*a.scale+bBox.height*b.scale)/2+8;
}

/** Only runs on editor/viewport changes; keeps saved relative positions where possible. */
export function arrangeControls<T extends string>(ids: readonly T[], points: Record<T,LayoutPoint>, boxes: Record<T,LayoutBox>, area: LayoutArea): Record<T,LayoutPoint> | null {
  const result = {} as Record<T,LayoutPoint>;
  const placed:T[]=[];
  for(const id of ids){
    let candidate=fitControl(points[id],boxes[id],area);
    const clear=(p:LayoutPoint)=>placed.every(other=>!controlsOverlap(p,boxes[id],result[other],boxes[other],area));
    if(!clear(candidate)){
      let best:LayoutPoint|undefined, distance=Infinity;
      for(let y=0;y<=100;y+=4)for(let x=0;x<=100;x+=4){
        const p=fitControl({...candidate,x,y},boxes[id],area),d=(p.x-candidate.x)**2+(p.y-candidate.y)**2;
        if(d<distance&&clear(p)){best=p;distance=d;}
      }
      if(!best)return null;
      candidate=best;
    }
    result[id]=candidate;placed.push(id);
  }
  return result;
}
