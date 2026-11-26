/** Unit firing direction for the existing fan or a center shot with a close surrounding ring. */
export function titanProjectileDirection(direction,index,count,spread=0,pattern='fan') {
  if(pattern!=='cluster') {
    const angle=(index-(count-1)/2)*spread,c=Math.cos(angle),s=Math.sin(angle);
    return {x:direction.x*c+direction.z*s,y:direction.y,z:direction.z*c-direction.x*s};
  }
  if(index===0||count<=1)return {...direction};
  const horizontal=Math.hypot(direction.x,direction.z);
  const rx=horizontal>1e-8?direction.z/horizontal:1,rz=horizontal>1e-8?-direction.x/horizontal:0;
  const ux=direction.y*rz,uy=direction.z*rx-direction.x*rz,uz=-direction.y*rx;
  const phase=(index-1)*Math.PI*2/(count-1),right=Math.cos(phase)*Math.sin(spread),up=Math.sin(phase)*Math.sin(spread),forward=Math.cos(spread);
  return {x:direction.x*forward+rx*right+ux*up,y:direction.y*forward+uy*up,z:direction.z*forward+rz*right+uz*up};
}
