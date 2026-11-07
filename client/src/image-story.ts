export type ImageStoryScene = Readonly<{src:string;durationSeconds:number;narration:string}>;
export const IMAGE_STORY_FADE_MS=250;
export function imageStorySceneAt(scenes:readonly ImageStoryScene[],elapsedMs:number):number {
  let end=0;
  for(let index=0;index<scenes.length;index++){end+=scenes[index]!.durationSeconds*1000;if(elapsedMs<end)return index;}
  return -1;
}
type Slot={image:HTMLImageElement;index:number;ready:boolean};

/** Two decoded images, one existing cinematic clock, and CSS fades; no playback timers. */
export class ImageStorySequence {
  readonly durationMs:number;
  private readonly element=document.createElement('div');
  private readonly frame=document.createElement('div');
  private readonly caption=document.createElement('p');
  private readonly slots:Slot[]=[];
  private readonly pending=new Set<()=>void>();
  private readonly starts:number[]=[];
  private current=-1;
  private currentSlot=-1;
  private disposed=false;
  private leaving=false;
  failed=false;
  constructor(parent:HTMLElement,private readonly scenes:readonly ImageStoryScene[]){
    let duration=0;for(const scene of scenes){this.starts.push(duration);duration+=scene.durationSeconds*1000;}this.durationMs=duration;
    this.element.className='image-story-sequence';this.element.hidden=true;
    this.frame.className='image-story-frame';this.caption.className='image-story-caption';
    this.caption.setAttribute('aria-live','polite');this.caption.setAttribute('aria-atomic','true');
    for(let i=0;i<2;i++){
      const image=new Image();image.className='image-story-image';image.alt='';image.decoding='async';
      this.slots.push({image,index:-1,ready:false});this.frame.append(image);
    }
    this.frame.append(this.caption);this.element.append(this.frame);parent.append(this.element);
  }
  private load(slot:Slot,index:number):Promise<boolean>{
    if(this.disposed||!this.scenes[index])return Promise.resolve(false);
    slot.image.classList.remove('is-current','is-active');slot.index=index;slot.ready=false;
    return new Promise(resolve=>{
      let finished=false;
      const finish=(ready:boolean)=>{
        if(finished)return;finished=true;clearTimeout(timeout);this.pending.delete(cancel);
        if(!this.disposed&&slot.index===index){slot.ready=ready;if(!ready)this.failed=true;}
        resolve(ready&&!this.disposed);
      };
      const cancel=()=>finish(false),timeout=setTimeout(cancel,6000);this.pending.add(cancel);
      slot.image.src=this.scenes[index]!.src;
      slot.image.decode().then(()=>finish(slot.image.naturalWidth>0),()=>finish(false));
    });
  }
  async prepare():Promise<boolean>{
    if(!this.scenes.length)return false;
    const results=await Promise.all(this.slots.slice(0,Math.min(2,this.scenes.length)).map((slot,index)=>this.load(slot,index)));
    return !this.disposed&&!this.failed&&results.every(Boolean);
  }
  update(elapsedMs:number):boolean {
    if(this.disposed||this.failed||this.leaving)return false;
    const index=imageStorySceneAt(this.scenes,elapsedMs);if(index<0)return false;
    this.element.hidden=false;
    if(index!==this.current){
      const slotIndex=this.slots.findIndex(slot=>slot.index===index&&slot.ready);
      if(slotIndex<0){this.failed=true;return false;}
      const previous=this.currentSlot;
      this.current=index;this.currentSlot=slotIndex;
      this.caption.textContent=this.scenes[index]!.narration;
      const image=this.slots[slotIndex]!.image;
      image.style.setProperty('--story-scene-duration',`${this.scenes[index]!.durationSeconds}s`);
      image.style.zIndex='1';image.classList.add('is-active','is-current');
      if(previous>=0)this.slots[previous]!.image.style.zIndex='0';
    }
    const start=this.starts[index]!;
    // Reuse the outgoing layer only after its crossfade has completely finished.
    if(elapsedMs-start>=IMAGE_STORY_FADE_MS&&index+1<this.scenes.length&&!this.slots.some(slot=>slot.index===index+1))
      void this.load(this.slots[1-this.currentSlot]!,index+1);
    return true;
  }
  fadeOut():void {
    if(this.disposed||this.leaving)return;
    this.leaving=true;this.caption.hidden=true;this.element.classList.add('is-leaving');
  }
  dispose():void {
    if(this.disposed)return;this.disposed=true;
    for(const cancel of [...this.pending])cancel();
    for(const slot of this.slots){slot.image.removeAttribute('src');slot.image.remove();}
    this.element.remove();
  }
}
