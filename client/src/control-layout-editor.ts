import { defaultLayout, type MobileControlId, type MobileControlLayout } from './mobile-input';
import { arrangeControls, controlsOverlap, fitControl, type LayoutArea, type LayoutBox } from './control-layout-geometry';
import { registerUiBackLayer, uiBackPriority } from './ui-back-navigation';

const names: Record<MobileControlId,string> = {stick:'Joystick',throttle:'Speed lever',fire:'Fire',radar:'Radar'};
const ids = Object.keys(names) as MobileControlId[];
let editorOpen = false;

/** A noninteractive copy of existing controls: no second game or input handlers. */
export function openControlLayoutEditor(layout: MobileControlLayout, save: (layout: MobileControlLayout) => void): void {
  if (editorOpen) return;
  editorOpen = true;
  let draft = structuredClone(layout);
  const originalFocus = document.activeElement as HTMLElement | null;
  const overlay = document.createElement('div');
  overlay.className = 'control-layout-editor'; overlay.role = 'dialog';
  overlay.setAttribute('aria-modal','true'); overlay.setAttribute('aria-label','Customize controls');
  const toolbar = document.createElement('div'); toolbar.className='control-layout-toolbar';
  const title = document.createElement('strong'); title.textContent='DRAG CONTROLS TO MOVE';
  const status = document.createElement('span'); status.className='control-layout-status'; status.setAttribute('aria-live','polite');
  const size = document.createElement('input'); size.type='range'; size.min='.75'; size.max='1.25'; size.step='.05'; size.setAttribute('aria-label','Selected control size');
  const sizeLabel = document.createElement('label'); sizeLabel.textContent='Size '; sizeLabel.append(size);
  let selected: MobileControlId = 'stick';
  const handles = new Map<MobileControlId,HTMLElement>();
  const boxes = new Map<MobileControlId,LayoutBox>();
  let area: LayoutArea;
  const inertStates = [...document.body.children].filter((el): el is HTMLElement => el instanceof HTMLElement).map(el=>({el,inert:el.inert}));
  const close = () => {
    editorOpen=false; unregister(); window.removeEventListener('resize',resize);
    overlay.remove(); for(const {el,inert} of inertStates) el.inert=inert;
    originalFocus?.focus();
  };
  const unregister = registerUiBackLayer({id:'control-layout-editor',priority:uiBackPriority.blockingModal,isActive:()=>editorOpen,close});
  const action = (label:string, run:()=>void) => { const button=document.createElement('button'); button.type='button';button.textContent=label;button.addEventListener('click',run);return button; };
  const valid = (id:MobileControlId, point:typeof draft.stick) => ids.every(other=>other===id || !controlsOverlap(point,boxes.get(id)!,draft[other],boxes.get(other)!,area));
  const paint = () => {
    for(const id of ids){const button=handles.get(id)!; const p=draft[id];
      button.style.left=`${p.x}%`;button.style.top=`${p.y}%`;button.style.width=`${boxes.get(id)!.width*p.scale}px`;button.style.height=`${boxes.get(id)!.height*p.scale}px`;
      const visual=button.firstElementChild as HTMLElement;visual.style.transform=`scale(${p.scale})`;
      button.classList.toggle('selected',selected===id);
    }
    size.min=String(selected==='fire'?.8:.75);size.max=String(selected==='fire'?1.3:1.25);size.value=String(draft[selected].scale);size.setAttribute('aria-label',`${names[selected]} size`);
  };
  const choose = (id:MobileControlId) => {selected=id;status.textContent=names[id];paint();};
  const move = (id:MobileControlId, x:number,y:number,scale=draft[id].scale) => {
    const candidate=fitControl({x,y,scale},boxes.get(id)!,area);
    if(valid(id,candidate)){draft[id]=candidate;status.textContent=names[id];paint();}
    else {status.textContent='Keep controls apart';size.value=String(draft[selected].scale);}
  };
  size.addEventListener('input',()=>move(selected,draft[selected].x,draft[selected].y,Number(size.value)));
  const saveButton=action('SAVE',()=>{if(ids.some(id=>!valid(id,draft[id])))return;save(structuredClone(draft));close();});
  const resize=()=>{
    const styles=getComputedStyle(overlay), pad=(side:string)=>parseFloat(styles.getPropertyValue(`padding-${side}`))||0;
    area={width:innerWidth,height:innerHeight,left:pad('left')+8,right:pad('right')+8,top:pad('top')+60,bottom:pad('bottom')+8};
    const arranged=arrangeControls(ids,draft,Object.fromEntries(boxes) as Record<MobileControlId,LayoutBox>,area);
    if(arranged)draft=arranged;
    saveButton.disabled=!arranged;
    status.textContent=saveButton.disabled?'Use landscape for more space':names[selected];paint();
  };
  toolbar.append(title,sizeLabel,action('RESET',()=>{draft=structuredClone(defaultLayout);resize();}),action('CANCEL',close),saveButton);
  overlay.append(toolbar,status);
  for(const id of ids){
    const source=document.querySelector<HTMLElement>(id==='radar'?'#radar-panel':`[data-touch-control="${id}"]`)!;
    const visual=source.cloneNode(true) as HTMLElement;
    // Freeze the real control's appearance without copying listeners, IDs or input attributes.
    const remappedIds=new Map<string,string>();
    for(const node of [visual,...visual.querySelectorAll<HTMLElement>('[id]')]){if(node.id)remappedIds.set(node.id,`layout-preview-${node.id}`);}
    const originals=[source,...source.querySelectorAll<HTMLElement>('*')];const copies=[visual,...visual.querySelectorAll<HTMLElement>('*')];
    originals.forEach((node,index)=>{const copy=copies[index]; const computed=getComputedStyle(node);
      for(const property of computed)copy.style.setProperty(property,computed.getPropertyValue(property));
      if(node.id)copy.id=remappedIds.get(node.id)!;copy.removeAttribute('tabindex');copy.removeAttribute('data-hold');copy.removeAttribute('data-touch-control');copy.removeAttribute('role');
      copy.style.pointerEvents='none';copy.style.visibility='visible';copy.style.animation='none';copy.style.transition='none';
      if(node instanceof HTMLCanvasElement && copy instanceof HTMLCanvasElement)copy.getContext('2d')?.drawImage(node,0,0);
    });
    for(const node of [visual,...visual.querySelectorAll<HTMLElement>('*')])for(const attr of [...node.attributes]){let value=attr.value;for(const [oldId,newId] of remappedIds){if(attr.name!=='id')value=value.replaceAll(`#${oldId}`,`#${newId}`);}if(value!==attr.value)node.setAttribute(attr.name,value);}
    const width=source.offsetWidth||parseFloat(getComputedStyle(source).width)||116;
    const height=source.offsetHeight||parseFloat(getComputedStyle(source).height)||(id==='throttle'?150:116);
    boxes.set(id,{width,height});
    Object.assign(visual.style,{position:'absolute',left:'0',top:'0',right:'auto',bottom:'auto',width:`${width}px`,height:`${height}px`,margin:'0',transformOrigin:'top left',opacity:'1',display:getComputedStyle(source).display==='none'?(id==='fire'?'flex':'block'):getComputedStyle(source).display});
    const handle=document.createElement('div');handle.role='button';handle.tabIndex=0;handle.className='control-layout-handle';handle.setAttribute('aria-label',`Move ${names[id]}. Drag or use arrow keys.`);handle.append(visual);
    let drag:{pointer:number;x:number;y:number;startX:number;startY:number}|undefined;
    handle.addEventListener('pointerdown',event=>{if(event.button!==0)return;event.preventDefault();choose(id);handle.focus();drag={pointer:event.pointerId,x:event.clientX,y:event.clientY,startX:draft[id].x,startY:draft[id].y};handle.setPointerCapture(event.pointerId);});
    handle.addEventListener('pointermove',event=>{if(drag?.pointer!==event.pointerId)return;move(id,drag.startX+(event.clientX-drag.x)/area.width*100,drag.startY+(event.clientY-drag.y)/area.height*100);});
    const end=()=>{drag=undefined;};handle.addEventListener('pointerup',end);handle.addEventListener('pointercancel',end);handle.addEventListener('lostpointercapture',end);
    handle.addEventListener('focus',()=>choose(id));
    handle.addEventListener('keydown',event=>{const directions:Record<string,[number,number]>={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]};const delta=directions[event.key];if(!delta)return;event.preventDefault();event.stopPropagation();move(id,draft[id].x+delta[0],draft[id].y+delta[1]);});
    handles.set(id,handle);overlay.append(handle);
  }
  for(const {el} of inertStates)el.inert=true;
  document.body.append(overlay);window.addEventListener('resize',resize);resize();saveButton.focus();
  overlay.addEventListener('keydown',event=>{if(event.key!=='Tab')return;const buttons=[...overlay.querySelectorAll<HTMLElement>('button:not(:disabled),input,[role=button]')];const index=buttons.indexOf(document.activeElement as HTMLElement);event.preventDefault();buttons[(index+(event.shiftKey?-1:1)+buttons.length)%buttons.length]?.focus();});
}
