/** Existing Sky Duel collection motion, shared without changing its timing or artwork. */
export function animateCreditFlight(coin:HTMLElement,startX:number,startY:number,endX:number,endY:number,duration:number,delay=0):Animation[] {
  coin.style.left=`${startX}px`;coin.style.top=`${startY}px`;
  const timing={duration,delay,fill:'forwards' as const};
  return [coin.animate([
    {transform:'translate(-50%, -50%) scale(1)'},
    {transform:`translate(calc(-50% + ${endX-startX}px), calc(-50% + ${endY-startY}px)) scale(.72)`},
  ],{...timing,easing:'cubic-bezier(.3, 0, .2, 1)'}),coin.animate([
    {opacity:0,offset:0},{opacity:1,offset:.08},{opacity:1,offset:.88},{opacity:0,offset:1},
  ],timing)];
}
