import type { FlightAction } from './flight-input';
import {joystickActions,normalizeGraphicsQuality,normalizeTouchMode,resolvedGraphicsQuality,type GraphicsQualityMode,type TouchControlsMode}from'../../shared/mobile-input-rules.mjs';
export{joystickActions,normalizeGraphicsQuality,normalizeTouchMode,resolvedGraphicsQuality,type GraphicsQualityMode,type TouchControlsMode};

const TOUCH_KEY='airport-chaos-touch-controls-v1';
const QUALITY_KEY='airport-chaos-graphics-quality-v1';
export function preferredTouchMode():TouchControlsMode{try{return normalizeTouchMode(localStorage.getItem(TOUCH_KEY));}catch{return'auto';}}
export function preferredGraphicsQuality():GraphicsQualityMode{try{return normalizeGraphicsQuality(localStorage.getItem(QUALITY_KEY));}catch{return'auto';}}

export class MobileInputControls{
  private mode=preferredTouchMode();private active=new Set<FlightAction>();private joystickPointer:number|undefined;private pitchPointer:number|undefined;
  constructor(private root:HTMLElement,private setAction:(action:FlightAction,active:boolean)=>void,private actions:{menu:()=>void;photo:()=>void}){
    root.querySelectorAll<HTMLElement>('[data-hold]').forEach(button=>this.bindHold(button,button.dataset.hold as FlightAction));
    this.bindPad(root.querySelector<HTMLElement>('[data-touch-stick]')!,false);this.bindPad(root.querySelector<HTMLElement>('[data-touch-pitch]')!,true);
    root.querySelector<HTMLElement>('[data-touch-menu]')?.addEventListener('click',actions.menu);root.querySelector<HTMLElement>('[data-touch-photo]')?.addEventListener('click',actions.photo);
    window.addEventListener('blur',()=>this.reset());document.addEventListener('visibilitychange',()=>{if(document.hidden)this.reset();});
    window.addEventListener('resize',()=>this.refresh());this.refresh();
  }
  getMode(){return this.mode;}setMode(mode:TouchControlsMode){this.mode=normalizeTouchMode(mode);try{localStorage.setItem(TOUCH_KEY,this.mode);}catch{/* optional */}this.reset();this.refresh();}
  reset(){for(const action of this.active)this.setAction(action,false);this.active.clear();this.joystickPointer=undefined;this.pitchPointer=undefined;}
  private visible(){return this.mode==='on'||(this.mode==='auto'&&(matchMedia('(pointer: coarse)').matches||innerWidth<=900));}
  private refresh(){this.root.hidden=!this.visible();document.documentElement.classList.toggle('touch-controls-active',!this.root.hidden);}
  private apply(next:FlightAction[],group:'stick'|'pitch'){const owned=group==='pitch'?new Set<FlightAction>(['pitchUp','pitchDown']):new Set<FlightAction>(['yawLeft','yawRight','rollLeft','rollRight']);for(const action of owned)if(this.active.has(action)&&!next.includes(action)){this.active.delete(action);this.setAction(action,false);}for(const action of next)if(!this.active.has(action)){this.active.add(action);this.setAction(action,true);}}
  private bindHold(button:HTMLElement,action:FlightAction){const start=(event:PointerEvent)=>{event.preventDefault();button.setPointerCapture(event.pointerId);this.active.add(action);this.setAction(action,true);};const stop=(event:PointerEvent)=>{event.preventDefault();this.active.delete(action);this.setAction(action,false);if(button.hasPointerCapture(event.pointerId))button.releasePointerCapture(event.pointerId);};button.addEventListener('pointerdown',start);button.addEventListener('pointerup',stop);button.addEventListener('pointercancel',stop);button.addEventListener('lostpointercapture',()=>{this.active.delete(action);this.setAction(action,false);});}
  private bindPad(pad:HTMLElement,pitchOnly:boolean){const move=(event:PointerEvent)=>{const rect=pad.getBoundingClientRect();const x=Math.max(-1,Math.min(1,(event.clientX-(rect.left+rect.width/2))/(rect.width*.42)));const y=Math.max(-1,Math.min(1,(event.clientY-(rect.top+rect.height/2))/(rect.height*.42)));this.apply(pitchOnly?joystickActions(0,y).filter(a=>a==='pitchUp'||a==='pitchDown'):joystickActions(x,0),pitchOnly?'pitch':'stick');pad.style.setProperty('--touch-x',`${x*28}px`);pad.style.setProperty('--touch-y',`${y*28}px`);};pad.addEventListener('pointerdown',event=>{event.preventDefault();pad.setPointerCapture(event.pointerId);if(pitchOnly)this.pitchPointer=event.pointerId;else this.joystickPointer=event.pointerId;move(event);});pad.addEventListener('pointermove',event=>{if((pitchOnly?this.pitchPointer:this.joystickPointer)===event.pointerId)move(event);});const stop=(event:PointerEvent)=>{if((pitchOnly?this.pitchPointer:this.joystickPointer)!==event.pointerId)return;this.apply([],pitchOnly?'pitch':'stick');pad.style.removeProperty('--touch-x');pad.style.removeProperty('--touch-y');if(pitchOnly)this.pitchPointer=undefined;else this.joystickPointer=undefined;if(pad.hasPointerCapture(event.pointerId))pad.releasePointerCapture(event.pointerId);};pad.addEventListener('pointerup',stop);pad.addEventListener('pointercancel',stop);}
}
