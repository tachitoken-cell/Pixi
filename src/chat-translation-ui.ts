import {chatLanguageValid} from './chat-languages.ts';
import type {ClientMessage,ServerMessage} from './shared';

export function mountChatTranslation({select,status,attribution,send,readLocal,saveLocal,beforeUpdate,afterUpdate}:{
 select:HTMLSelectElement;status:HTMLElement;attribution:HTMLElement;
 send:(message:ClientMessage)=>void;readLocal:(key:string)=>string|null;saveLocal:(key:string,value:string)=>void;
 beforeUpdate:()=>void;afterUpdate:()=>void;
}) {
 type Entry={row:HTMLElement;body:Text;original:string;button:HTMLButtonElement;translations:Map<string,string>;skipped:Set<string>;showOriginal:boolean;changed:(text:string)=>void};
 const entries=new Map<string,Entry>(),key='mossvale-chat-language';
 const saved=readLocal(key);let language=chatLanguageValid(saved)?saved:'',available=false,paused=false;
 let pending:{messageId:string;targetLanguage:string;timer:ReturnType<typeof setTimeout>}|undefined;
 select.value=language;
 function notice(text:string){status.textContent=text;status.hidden=!text;}
 function render(entry:Entry){
  const translation=available&&language&&entry.translations.get(language),translated=!!translation&&!entry.showOriginal;
  beforeUpdate();entry.body.textContent=translated?translation:entry.original;
  entry.button.hidden=!translation;entry.button.textContent=translated?'Original':'Translation';
  entry.button.setAttribute('aria-label',translated?'Show original message':'Show translated message');
  entry.button.setAttribute('aria-pressed',String(entry.showOriginal));
  entry.row.classList.toggle('chat-translated',translated);if(entry.body.parentElement)entry.body.parentElement.lang=translated?language:'';
  entry.changed(entry.body.textContent||'');afterUpdate();
 }
 function pump(){
  for(const [id,entry] of entries)if(!entry.row.isConnected)entries.delete(id);
  if(!available||!language||paused||pending)return;
  const next=[...entries].find(([,entry])=>!entry.translations.has(language)&&!entry.skipped.has(language));if(!next)return;
  const [messageId]=next,targetLanguage=language;
  const timer=setTimeout(()=>{pending=undefined;if(targetLanguage===language){paused=true;notice('Translation timed out. Change language to retry.');}else pump();},12000);
  pending={messageId,targetLanguage,timer};send({type:'translateChat',messageId,targetLanguage});
 }
 function refresh(){
  attribution.hidden=!available||!language;
  select.disabled=!available;
  notice(available?language?'Messages are sent to Google for translation.':'':'Translation is unavailable on this realm.');
  for(const entry of entries.values()){entry.showOriginal=false;render(entry);}pump();
 }
 select.onchange=()=>{language=chatLanguageValid(select.value)?select.value:'';saveLocal(key,language);paused=false;refresh();};
 refresh();
 return {
  configure(enabled:boolean){available=enabled;paused=false;refresh();},
  add(messageId:string,row:HTMLElement,body:Text,changed:(text:string)=>void){
   const button=document.createElement('button');button.type='button';button.className='chat-original';button.hidden=true;
   const entry:Entry={row,body,original:body.textContent||'',button,translations:new Map(),skipped:new Set(),showOriginal:false,changed};
   button.onclick=()=>{entry.showOriginal=!entry.showOriginal;render(entry);};row.append(button);
   entries.set(messageId,entry);while(entries.size>120)entries.delete(entries.keys().next().value!);pump();
  },
  receive(message:Extract<ServerMessage,{type:'chatTranslation'}>){
   if(!pending||pending.messageId!==message.messageId||pending.targetLanguage!==message.targetLanguage)return;
   clearTimeout(pending.timer);pending=undefined;
   const entry=entries.get(message.messageId);
   if(message.skipped){entry?.skipped.add(message.targetLanguage);}
   else if(message.error||typeof message.text!=='string'){if(message.targetLanguage===language){paused=true;notice(`${message.error||'Translation is unavailable.'} Change language to retry.`);}}
   else if(entry?.row.isConnected&&typeof message.text==='string'){
    // Decode entities without ever interpreting translation output as HTML markup.
    const decoder=document.createElement('textarea');decoder.innerHTML=message.text.replace(/</g,'&lt;');
    entry.translations.set(message.targetLanguage,decoder.value);render(entry);
   }
   pump();
  },
  reset(){
   if(pending)clearTimeout(pending.timer);pending=undefined;
   for(const entry of entries.values()){entry.translations.clear();render(entry);entry.button.remove();}
   entries.clear();available=false;paused=false;refresh();
  },
 };
}
