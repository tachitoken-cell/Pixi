import './chat-bubbles.css';

const bubbles=new Map<HTMLElement,{authorId:string;node:HTMLElement;timer:ReturnType<typeof setTimeout>}>();

function removeBubble(label:HTMLElement){
 const current=bubbles.get(label);if(!current)return;
 clearTimeout(current.timer);current.node.remove();bubbles.delete(label);
}

export function showChatBubble(authorId:string,text:string,channel:string,ownPlayerId:string){
 if(channel!=='world'||!authorId)return;
 const message=Array.from(text.trim()).slice(0,160).join('');if(!message)return;
 const label=document.getElementById(authorId===ownPlayerId?'label-you':`label-${authorId}`);if(!label)return;
 removeBubble(label);
 const node=document.createElement('span');node.className='chat-bubble';node.textContent=message;
 // The chat log announces the message; keep it out of the nameplate's button label.
 node.ariaHidden='true';node.translate=false;label.append(node);
 const timer=setTimeout(()=>{if(bubbles.get(label)?.node===node)removeBubble(label);},5000);
 bubbles.set(label,{authorId,node,timer});
}

export function clearChatBubbles(authorIds?:Iterable<string>){
 const authors=authorIds&&new Set(authorIds);
 for(const [label,bubble] of bubbles)if(!authors||authors.has(bubble.authorId))removeBubble(label);
}
