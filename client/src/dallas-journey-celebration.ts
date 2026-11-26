import './dallas-journey-celebration.css';

/** Presentation only: credits have already been committed and their flight has finished. */
export function showDallasJourneyCelebration():()=>void {
  const element=document.createElement('section');
  element.className='dallas-journey-celebration';
  element.setAttribute('role','status');element.setAttribute('aria-live','polite');
  const title=document.createElement('strong');title.textContent='DALLAS COMPLETED';
  const subtitle=document.createElement('p');subtitle.textContent='You saved the city!';
  const message=document.createElement('div');message.className='dallas-journey-celebration__message';message.append(title,subtitle);
  const rain=document.createElement('div');rain.className='dallas-journey-celebration__rain';rain.setAttribute('aria-hidden','true');
  for(let i=0;i<72;i++){
    const particle=document.createElement('i');
    if(i%3===0)particle.className='is-star';
    particle.style.setProperty('--x',`${(i*61.8034)%100}%`);
    particle.style.setProperty('--delay',`${-(i%17)*.21}s`);
    particle.style.setProperty('--duration',`${2.6+i%7*.24}s`);
    particle.style.setProperty('--drift',`${(i%9-4)*12}px`);
    particle.style.setProperty('--color',['#ffe36c','#fff4be','#dc143c'][i%3]!);
    rain.append(particle);
  }
  element.append(rain,message);document.body.append(element);
  let stopped=false;
  const stop=()=>{if(stopped)return;stopped=true;window.clearTimeout(timer);element.remove();};
  const timer=window.setTimeout(stop,5500);
  return stop;
}
