import {apiFetch,apiUrl} from './transport';
import './sky-duel-presence.css';

/** Refresh only while the Sky Duel card is visible; never replace a failed count with zero. */
export class SkyDuelPresenceBadge {
  readonly element=document.createElement('span');
  private readonly text=document.createElement('span');
  private active=false;
  private generation=0;
  private timer:number|undefined;
  private request:AbortController|undefined;
  constructor(){
    this.element.className='sky-duel-presence is-unavailable';this.element.id='home-sky-duel-presence';
    const dot=document.createElement('i');dot.setAttribute('aria-hidden','true');
    this.text.textContent='— PLAYERS ONLINE';this.element.append(dot,this.text);
    this.element.setAttribute('aria-label','Sky Duel player count unavailable');
  }
  setVisible(visible:boolean):void{
    if(visible===this.active)return;
    this.active=visible;const generation=++this.generation;
    window.clearTimeout(this.timer);this.request?.abort();this.request=undefined;
    if(visible)void this.refresh(generation);
  }
  private async refresh(generation:number):Promise<void>{
    if(!this.active||generation!==this.generation)return;
    const request=new AbortController();this.request=request;
    try{
      const response=await apiFetch(apiUrl('/api/sky-duel/presence'),{cache:'no-store',signal:request.signal},8000);
      if(!response.ok)throw new Error('Count unavailable');
      const value=await response.json() as {online?:unknown};
      if(!Number.isSafeInteger(value.online)||(value.online as number)<0)throw new Error('Invalid count');
      if(!this.active||generation!==this.generation)return;
      const count=(value.online as number).toLocaleString();
      this.text.textContent=`${count} PLAYERS ONLINE`;this.element.classList.remove('is-unavailable');
      this.element.setAttribute('aria-label',`${count} players online in Sky Duel`);
    }catch{
      if(!this.active||generation!==this.generation)return;
      this.text.textContent='— PLAYERS ONLINE';this.element.classList.add('is-unavailable');
      this.element.setAttribute('aria-label','Sky Duel player count unavailable');
    }finally{
      if(this.active&&generation===this.generation){this.request=undefined;this.timer=window.setTimeout(()=>void this.refresh(generation),30_000);}
    }
  }
}
