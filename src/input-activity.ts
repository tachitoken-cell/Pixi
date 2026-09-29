export interface InputActivitySample {
  version:1;
  durationMs:number;
  viewportWidth:number;
  viewportHeight:number;
  clicks:number;
  keys:number;
  drags:number;
  touchClicks:number;
  syntheticClicks:number;
  clickIntervals:number;
  clickMeanMs:number;
  clickJitter:number;
  sameCellClicks:number;
  resizes:number;
}

export function createInputActivity({active,send}:{active:()=>boolean;send:(sample:InputActivitySample)=>void}) {
  let disposed=false,start:number|undefined,lastClick:number|undefined;
  let clicks=0,keys=0,drags=0,touchClicks=0,syntheticClicks=0,clickIntervals=0,mean=0,m2=0,sameCellClicks=0,resizes=0;
  let pointer:{id:number;x:number;y:number;moved:boolean}|undefined;
  const cells=new Uint32Array(144);
  const eligible=()=>!disposed&&active()&&document.visibilityState==='visible'&&document.hasFocus();
  function reset(){
    start=eligible()?performance.now():undefined;lastClick=undefined;pointer=undefined;
    clicks=keys=drags=touchClicks=syntheticClicks=clickIntervals=mean=m2=sameCellClicks=resizes=0;cells.fill(0);
  }
  function collecting(){
    if(!eligible()){reset();return false;}
    if(start===undefined)reset();
    return true;
  }
  function down(event:PointerEvent){
    if(!collecting()||!event.isTrusted||!event.isPrimary||event.button!==0)return;
    const now=performance.now();clicks++;if(event.pointerType==='touch')touchClicks++;
    if(lastClick!==undefined){const interval=now-lastClick,delta=interval-mean;clickIntervals++;mean+=delta/clickIntervals;m2+=delta*(interval-mean);}
    lastClick=now;
    const x=Math.max(0,Math.min(11,Math.floor(event.clientX/Math.max(1,window.innerWidth)*12)));
    const y=Math.max(0,Math.min(11,Math.floor(event.clientY/Math.max(1,window.innerHeight)*12)));
    sameCellClicks=Math.max(sameCellClicks,++cells[y*12+x]);
    pointer={id:event.pointerId,x:event.clientX,y:event.clientY,moved:false};
  }
  function move(event:PointerEvent){
    if(!collecting()||!event.isTrusted||!pointer||pointer.id!==event.pointerId)return;
    if((event.clientX-pointer.x)**2+(event.clientY-pointer.y)**2>=64)pointer.moved=true;
  }
  function up(event:PointerEvent){
    if(!collecting()||!event.isTrusted||!pointer||pointer.id!==event.pointerId)return;
    if(pointer.moved)drags++;pointer=undefined;
  }
  function cancel(event:PointerEvent){if(event.isTrusted&&pointer?.id===event.pointerId)pointer=undefined;}
  function key(event:KeyboardEvent){if(collecting()&&event.isTrusted&&!event.repeat)keys++;}
  function click(event:MouseEvent){if(collecting()&&!event.isTrusted&&event.button===0)syntheticClicks++;}
  function resize(event:Event){if(collecting()&&event.isTrusted)resizes++;}
  function tick(){
    if(!collecting())return;
    const duration=performance.now()-start!;
    if(duration<30000)return;
    // Suspended/throttled pages start a fresh window instead of reporting old activity.
    if(duration>60000){reset();return;}
    const sample:InputActivitySample={version:1,durationMs:Math.round(duration),viewportWidth:Math.max(100,Math.round(window.innerWidth/100)*100),viewportHeight:Math.max(100,Math.round(window.innerHeight/100)*100),clicks,keys,drags,touchClicks,syntheticClicks,clickIntervals,clickMeanMs:clickIntervals>=2?Math.round(mean):0,clickJitter:clickIntervals>=2&&mean>0?Math.round(Math.sqrt(Math.max(0,m2/clickIntervals))/mean*1000)/1000:0,sameCellClicks,resizes};
    reset();
    try{send(sample);}catch{/* Optional input summaries must not interrupt gameplay. */}
  }
  const listeners:[EventTarget,string,EventListener][]=[
    [document,'pointerdown',down as EventListener],[document,'pointermove',move as EventListener],[document,'pointerup',up as EventListener],[document,'pointercancel',cancel as EventListener],
    [document,'keydown',key as EventListener],[document,'click',click as EventListener],[document,'visibilitychange',reset],[window,'blur',reset],[window,'focus',reset],[window,'resize',resize],
  ];
  for(const [target,type,listener]of listeners)target.addEventListener(type,listener,{capture:target===document,passive:true});
  reset();const timer=setInterval(tick,1000);
  return {reset,dispose(){disposed=true;clearInterval(timer);for(const [target,type,listener]of listeners)target.removeEventListener(type,listener,target===document);reset();}};
}

export interface ClientCheckResponse { nonce:string; webdriver:boolean }
/** Forgeable supporting context only; this is not proof that a client is human. */
export function createClientCheck({active,send}:{active:()=>boolean;send:(response:ClientCheckResponse)=>void}) {
  let disposed=false,revision=0,frame:number|undefined;
  const eligible=()=>!disposed&&active()&&document.visibilityState==='visible'&&document.hasFocus();
  function reset(){revision++;if(frame!==undefined)cancelAnimationFrame(frame);frame=undefined;}
  function challenge(nonce:string){
    if(disposed||typeof nonce!=='string'||nonce.length>128||!/^[a-f0-9]{8}-[a-f0-9]{4}-[1-8][a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/i.test(nonce))return;
    reset();if(!eligible())return;
    const version=revision;let frames=0;
    const next=()=>{
      if(version!==revision||disposed)return;
      frame=undefined;
      if(!eligible()){reset();return;}
      if(++frames<2){frame=requestAnimationFrame(next);return;}
      reset();
      try{send({nonce,webdriver:navigator.webdriver===true});}catch{/* Missing optional context must not interrupt play. */}
    };
    frame=requestAnimationFrame(next);
  }
  document.addEventListener('visibilitychange',reset);
  window.addEventListener('blur',reset);
  return {challenge,reset,dispose(){disposed=true;reset();document.removeEventListener('visibilitychange',reset);window.removeEventListener('blur',reset);}};
}
