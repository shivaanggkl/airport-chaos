import { scaleDallasPoint } from './dallas-world-scale.mjs';
// Authoring coordinates are converted once. Stable indexes are the pickup identities.
export const dallasCoinTrail = Object.freeze(Array.from({length:100},(_,i)=>Object.freeze(
  scaleDallasPoint({x:5200+900*Math.sin(i/99*Math.PI),z:-8500+i*140}))));
export const emptyCoinMask = '0'.repeat(25);
export function coinCollected(mask,index){return Boolean(parseInt(mask[Math.floor(index/4)]??'0',16)&(1<<(index%4)));}
/** Generic swept spherical pickup, fed only accepted transforms on the server. */
export function collectTrail(coins,altitude,mask,start,end,radius,limit){
 let bits;const dx=end.x-start.x,dy=end.y-start.y,dz=end.z-start.z;
 const length=dx*dx+dy*dy+dz*dz;let count=0;
 for(let i=0;i<coins.length&&count<limit;i++){
  if(coinCollected(mask,i))continue;
  const p=coins[i],t=length?Math.max(0,Math.min(1,((p.x-start.x)*dx+(altitude-start.y)*dy+(p.z-start.z)*dz)/length)):0;
  if((start.x+dx*t-p.x)**2+(start.y+dy*t-altitude)**2+(start.z+dz*t-p.z)**2>radius*radius)continue;
  bits??=mask.split('');const at=Math.floor(i/4);bits[at]=(parseInt(bits[at],16)|(1<<(i%4))).toString(16);count++;
 }
 return {mask:bits?bits.join(''):mask,count};
}
