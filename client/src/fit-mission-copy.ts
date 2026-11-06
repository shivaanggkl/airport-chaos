/** Fit complete mission copy within an existing card, without truncating words. */
export function observeMissionCopyFit(root:HTMLElement,titleSelector:string,objectiveSelector:string):void {
  let frame=0;
  const fit=()=>{
    frame=0;
    if(!root.isConnected){resize.disconnect();mutation.disconnect();return;}
    if(root.clientHeight===0)return;
    const title=root.querySelector<HTMLElement>(titleSelector),objective=root.querySelector<HTMLElement>(objectiveSelector);
    if(!title||!objective)return;
    title.style.removeProperty('font-size');objective.style.removeProperty('font-size');
    const available=root.clientHeight;
    const required=()=>{
      const style=getComputedStyle(root);
      const children=Array.from(root.children).filter(child=>getComputedStyle(child).display!=='none') as HTMLElement[];
      return children.reduce((height,child)=>{
        const css=getComputedStyle(child);
        return height+child.getBoundingClientRect().height+parseFloat(css.marginTop||'0')+parseFloat(css.marginBottom||'0');
      },0)+Math.max(0,children.length-1)*(parseFloat(style.rowGap)||0)+(parseFloat(style.paddingTop)||0)+(parseFloat(style.paddingBottom)||0);
    };
    for(const [element,minimum] of [[objective,10],[title,12],[objective,8]] as const){
      let size=parseFloat(getComputedStyle(element).fontSize);
      while(required()>available+1&&size>minimum){
        size=Math.max(minimum,size-.5);element.style.setProperty('font-size',`${size}px`,'important');
      }
    }
  };
  const schedule=()=>{if(!frame)frame=requestAnimationFrame(fit);};
  const resize=new ResizeObserver(schedule);resize.observe(root);
  const mutation=new MutationObserver(schedule);mutation.observe(root,{childList:true,characterData:true,subtree:true});
  document.fonts.ready.then(schedule);
  schedule();
}
