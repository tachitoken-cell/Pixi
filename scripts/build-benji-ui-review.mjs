import {readFileSync,existsSync,mkdirSync,writeFileSync} from 'node:fs';
import {resolve,dirname,extname} from 'node:path';
import {stripTypeScriptTypes} from 'node:module';
import {BENJI_UI_VIEWS as views} from './lib/benji-ui-review-cases.mjs';
const seen=new Set(),css=[];
function visit(file){if(seen.has(file)||!existsSync(file))return;seen.add(file);const source=readFileSync(file,'utf8');if(file.endsWith('.css')){css.push(file);return;}for(const [,spec] of source.matchAll(/^import\s+(?:[^;]*?\s+from\s+)?['"](\.[^'"]+)['"]/gm)){let target=resolve(dirname(file),spec);if(!extname(target))target+='.ts';if(/\.(?:ts|css)$/.test(target))visit(target);}}
visit(resolve('src/main.ts'));
const mainSource=readFileSync('src/main.ts','utf8');
const extract=(start,end)=>{const a=mainSource.indexOf(start),b=mainSource.indexOf(end,a);if(a<0||b<0)throw Error('Review renderer extraction boundary changed: '+start);return stripTypeScriptTypes(mainSource.slice(a,b));};
const dungeonRenderer=extract('function renderDungeonPanel(','function lootSummary(');
const dialogueRenderer=extract('function openDialogue(','let contractZone:');
const mainRenderers=`
import {DUNGEONS,getDungeon,dungeonStages,dungeonReturn,dungeonPreparation,inDungeonPreparation,DUNGEON_EXIT} from '/src/dungeon.ts';
import {renderDungeonResult,renderDungeonLeaderboard,revealDungeonRewards} from '/src/dungeon-results-ui.ts';
import {icon,$} from '/src/ui.ts';
import {VILLAGE_NPCS,SHADY_MERCHANT} from '/src/settlements.ts';
import {TRAINER_NPCS} from '/src/training.ts';
import {CITY_VENDORS} from '/src/city.ts';
import {NPCS} from '/src/content.ts';
import {HEARTHLING_NPC} from '/src/hearthling.ts';
import {GOLD_MERCHANT} from '/src/gold-merchant.ts';
import {renderStoryNpcChoices} from '/src/story-quest-ui.ts';
export function renderReviewDungeon(player,party){
 let output='',lastDungeonPanel='',dungeon=null,worldInstance=null,dungeonChoice='frosthollow';
 const position={...getDungeon(dungeonChoice).summonStone},usesArenaWorld=()=>false,replacePanelContent=html=>output=html;
 const dungeonBoard={dungeonId:dungeonChoice,partySize:2,requestId:1,loading:false,entries:[{id:'review-clear',dungeonId:dungeonChoice,partySize:2,durationMs:384250,kills:42,wipes:0,completedAt:1790600000000,realmId:'eu',members:[{id:'review-mira',name:'Mira',className:'Cleric',level:60},{id:player.id,name:player.name,className:player.appearance.className,level:60}]}]};
 ${dungeonRenderer}
 renderDungeonPanel();return output;
}
export function openReviewDialogue(player,openPanel,closePanel,send){
 const showNpcPortrait=()=>{},openJournal=()=>{},openTraining=()=>{},openHearthling=()=>{},goldMerchantUI={open(){}},treasureUI={open(){}};
 ${dialogueRenderer}
 const resident=VILLAGE_NPCS.find(n=>n.role==='merchant');
 openDialogue({npcId:resident.id,title:resident.name,lines:resident.lines,services:[{id:'trade',label:'Browse supplies'}]});
}
`;
const script=String.raw`
import {mountUI,$,icon} from '/src/ui.ts';
import {starterGear} from '/src/progression.ts';
import {DEFAULT_APPEARANCE,normalizeAppearance} from '/src/appearance.ts';
import {newContracts} from '/src/adventure.ts';
import {newAchievements} from '/src/achievements.ts';
import {newRaidProgress} from '/src/raid-progression.ts';
import {renderGear,renderBackpack} from '/src/character-ui.ts';
import {renderTalents,renderShop,mountTalentBranches} from '/src/progression-ui.ts';
import {skillTabs,renderSkills} from '/src/skills-ui.ts';
import {renderArenaMenu} from '/src/arena-menu.ts';
import {renderReviewDungeon,openReviewDialogue} from './main-renderers.js';
import {renderSpellbook,createHotbar} from '/src/hotbar.ts';
import {spellsForClass,defaultHotbar} from '/src/spells.ts';
import {renderTraining} from '/src/training-ui.ts';
import {TRAINER_NPCS} from '/src/training.ts';
import {VILLAGE_NPCS} from '/src/settlements.ts';
import {renderCrafting,renderContracts,renderAdventureTabs} from '/src/adventure-ui.ts';
import {renderStoryNpcChoices,renderStoryJournal,createStoryQuestUI,storyQuestTracker} from '/src/story-quest-ui.ts';
import {STORY_QUESTS} from '/src/story-quests.ts';
import {renderRaidPanel} from '/src/raid-ui.ts';
import {renderRaidProgression} from '/src/raid-progression-ui.ts';
import {renderInstantCombatPanel} from '/src/instant-combat-ui.ts';
import {renderPetCollection,renderMountCollection} from '/src/pet-ui.ts';
import {renderReferrals} from '/src/referral-ui.ts';
import {referralFeeBps} from '/src/referrals.ts';
import {renderGraphicsSettings,mountGraphicsSettings} from '/src/graphics-settings.ts';
import {renderBankContents} from '/src/bank-ui.ts';
import {mountAuctionUI} from '/src/auction-ui.ts';
import {mountStoreUI} from '/src/store-ui.ts';
import {mountFriendsUI} from '/src/friends-ui.ts';
import {mountAchievementsUI} from '/src/achievements-ui.ts';
import {mountNftUI} from '/src/nft-ui.ts';
import {NFT_HOUSES} from '/src/nfts.ts';
import {openTurnkeyWallet} from '/src/turnkey-ui.ts';
import {createMinimap} from '/src/minimap.ts';
import {mountUnitFrames} from '/src/unit-frames.ts';
import {createUnitPortraits} from '/src/unit-portraits.ts';
import {mountCharacterView} from '/src/character-view.ts';
import {loadCharacterAssets} from '/src/characters.ts';
import {loadRaidAssets} from '/src/raid-model.ts';
const params=new URLSearchParams(location.search),view=params.get('view')||'hud';
mountUI();$('loading').hidden=true;document.body.classList.toggle('mobile-controls',params.has('mobile')||view==='mobile-menu');
document.body.classList.toggle('at-entry',view==='login'||view==='loading');
const noop=()=>{}, sent=[];window.reviewSent=sent;
const fixtureNow=Date.UTC(2026,8,29,13,57),fixtureWallet='0x1111111111111111111111111111111111111111';
// All economic reads are local fixtures; no realm, wallet or chain is contacted.
const localFetch=window.fetch.bind(window);
window.fetch=async (input,options={})=>{const url=new URL(typeof input==='string'?input:input.url,location.href);
 if(url.href==='https://rpc.mainnet.chain.robinhood.com/'){const request=JSON.parse(options.body||'{}');let result;
  if(request.method==='eth_chainId')result='0x1237';else if(request.method==='eth_getBalance')result='0x2386f26fc10000';else if(request.method==='eth_call'&&request.params?.[0]?.data?.startsWith('0x70a08231'))result='0x'+(1250n*10n**18n).toString(16).padStart(64,'0');else throw Error('Read not included in wallet fixture');
  return new Response(JSON.stringify({jsonrpc:'2.0',id:request.id,result}),{status:200,headers:{'Content-Type':'application/json'}});}
 if(url.origin!==location.origin||url.pathname.startsWith('/api/'))throw Error('Network disabled in local UI review');
 return localFetch(input,options);
};
const until=async(predicate,label)=>{for(let i=0;i<200;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,25));}throw Error('Fixture did not become ready: '+label);};
const player={id:'ui-review',name:'Aster',characterCreated:true,level:60,xp:120,hp:350,maxHp:480,gold:1240,economyVersion:1,zone:'greenwood',x:0,z:0,appearance:normalizeAppearance(DEFAULT_APPEARANCE),...starterGear('Ranger'),inventory:{wood:32,crystal:14,herb:8,potion:6,relic:2},carriedItems:{'trail-bread':4,'treasure-map':1,'greater-tonic':3,'berry-tart':5,'slime-residue':12},talents:[],learnedSpells:spellsForClass('Ranger').filter(s=>!s.requiredTalent).map(s=>s.id),ownedBags:[],equippedBags:[],ownedPets:['moss-fox','moon-owl','death-apostle'],summonedPet:'moss-fox',nftPets:[],ownedMounts:['horse','verdant-revenant'],nftMounts:[],ridingRank:1,skills:{mining:300,woodcutting:120,herbalism:220,fishing:0},craftingXp:0,contracts:newContracts(),quest:{chapter:0,stage:1,progress:{},completed:false},storyQuests:{active:{},completed:[]},raidProgress:newRaidProgress(),achievements:newAchievements(),storeOrders:[],storePurchases:[],storeBoosts:{},storeConsumables:{}};
player.rotation=0;player.instanceId=null;player.zeppelin=null;
player.contracts.active={'greenwood-hunt':2,'greenwood-timber':6};
Object.assign(player.raidProgress,{clears:4,sigils:17,souls:1,evolutionCores:4,petEvolution:1,cosmetics:['apostle-wings'],equippedCosmetics:['apostle-wings']});
Object.assign(player.achievements,{kills:144,gathered:210,crafted:18,contracts:12,zones:['greenwood','amberwild'],dungeons:{rootvault:3,frosthollow:1},unlocked:{'growing-roots':fixtureNow-86400000,'first-victory':fixtureNow-86400000,'seasoned-adventurer':fixtureNow-80000000}});
const friend={id:'review-mira',name:'Mira',className:'Cleric',level:60,online:true,zone:'greenwood',hp:280,maxHp:350,instanceId:null};
const nearbyPlayers=[{...player,...friend,x:4,z:3,appearance:normalizeAppearance({...DEFAULT_APPEARANCE,className:'Cleric'})},{...player,id:'review-finn',name:'Finn',level:48,x:8,z:-4,appearance:normalizeAppearance({...DEFAULT_APPEARANCE,className:'Knight'})}];
const party={id:'review-party',leaderId:player.id,members:[{id:player.id,name:player.name,className:player.appearance.className,level:60,hp:player.hp,maxHp:player.maxHp,zone:'greenwood',instanceId:null},friend]};
const panel=$('panel'),content=$('panel-content');mountTalentBranches(content);
const open=(title,mode,html)=>{panel.dataset.mode=mode;$('panel-title').textContent=title;$('panel-eyebrow').textContent='MOSSVALE';content.innerHTML=html;panel.showModal();document.body.classList.add('mobile-panel-open');};
$('close-panel').onclick=()=>{panel.close();document.body.classList.remove('mobile-panel-open');};
const trigger=()=>{const b=document.createElement('button');b.hidden=true;document.body.append(b);return b;};
const send=msg=>sent.push(msg),common={send,getPlayer:()=>player,allowed:()=>true,onOpen:noop};
const frames=mountUnitFrames($('unit-frames'),{onPlayer:noop,onTargetContext:noop,onTargetOfTarget:noop});
frames.update({id:player.id,name:player.name,level:60,hp:350,maxHp:480,className:'Ranger',subtitle:'Wanderer',disposition:'self'},{id:friend.id,name:friend.name,level:60,hp:280,maxHp:350,className:'Cleric',subtitle:'Party · Cleric',disposition:'friendly'},{id:'review-finn',name:'Finn',level:48,hp:180,maxHp:300,className:'Knight',subtitle:'Target of target',disposition:'friendly'});
const hotbar=createHotbar({hud:$('hotbar'),book:content,canEdit:()=>true,rangeTarget:()=>null,cast:id=>send({type:'cast',abilityId:id}),save:()=>true,notify:noop});hotbar.sync(player);
for(const [id,name] of [['instant-combat','Instant Combat'],['raid','Raid'],['pets','Pets'],['referrals','Referrals'],['store','Store'],['nfts','NFTs']]){const b=document.createElement('button');b.id=id+'-button';b.title=name;b.setAttribute('aria-label',name);b.dataset.mobileLabel=name;b.innerHTML=icon('menu-'+(id==='referrals'?'referral':id));$('game-menus').append(b);}
// Match main's menu: Mount moves out of the touch tool strip into the labeled sheet.
$('game-menus').append($('mobile-mount'));
for(const b of $('game-menus').querySelectorAll(':scope > button'))b.dataset.mobileLabel=({'inventory-button':'Bags','journal-button':'Quests','customize-button':'Character','spells-button':'Skills','talents-button':'Talents','crafting-button':'Craft','raid-button':'Raid','instant-combat-button':'Instant Combat','arena-button':'Arena','pets-button':'Pets','achievements-button':'Achievements','friends-button':'Friends','referrals-button':'Referrals','account-button':'Account','settings-button':'Settings','store-button':'Store','nfts-button':'NFTs','mobile-mount':'Mount'})[b.id]||b.getAttribute('aria-label')||b.title||b.id;
if(view==='hud'||view==='mobile-menu'){await loadCharacterAssets();const portraits=createUnitPortraits(frames.canvases);portraits.update({player:{id:player.id,kind:'player',appearance:player.appearance,equipment:player.equipment},target:{id:friend.id,kind:'player',appearance:nearbyPlayers[0].appearance},focus:{id:'review-finn',kind:'player',appearance:nearbyPlayers[1].appearance}});portraits.render(performance.now());const minimap=createMinimap($('minimap'));minimap.update({player,players:nearbyPlayers,party});}
if(document.body.classList.contains('mobile-controls')){$('chat').classList.add('collapsed');$('chat-toggle').setAttribute('aria-expanded','false');$('chat-toggle-label').textContent='Show';$('chat-preview-messages').innerHTML='<span class="chat-preview-line">Mira · Anyone joining the next Instant Combat?</span><span class="chat-preview-line">Finn · Meet at the Moss Gate.</span>';}
$('chat-log-world').innerHTML='<p><strong>Mira</strong> · Anyone joining the next Instant Combat?</p><p><strong>Aster</strong> · Heading back to the lantern road.</p><p><strong>Finn</strong> · Meet at the Moss Gate.</p>';
$('world-time').textContent='14:32';
const stories=STORY_QUESTS.filter(q=>['story-welcome-to-lanternreach','story-a-bitter-remedy','story-crystals-for-the-road'].includes(q.id));for(const q of stories)player.storyQuests.active[q.id]=q.objectives.map((o,i)=>i===0?Math.min(o.count,1):0);
const tracked=storyQuestTracker(player,stories[1].id);
$('quest-meter').hidden=false;$('quest-meter').max=tracked.ready?tracked.total:tracked.objectiveTotal;$('quest-meter').value=tracked.ready?tracked.total:tracked.objectiveProgress;
$('chapter-label').textContent='STORY QUEST · LEVEL '+tracked.quest.requiredLevel;$('quest-state').textContent=tracked.ready?'Ready to return':'In progress';$('quest-reward').textContent=tracked.rewardText;
$('quest-progress').textContent=tracked.completed+' / '+tracked.total+' objectives complete';document.querySelector('.hud-job-xp-row').hidden=true;
$('level-label').textContent='Lv. 60';$('xp-label').textContent='MAX';$('xp-fill').style.width='100%';
$('connection').textContent='Local UI review';$('population').textContent='No realm connection';$('quest-title').textContent=tracked.quest.title;$('quest-summary').textContent=tracked.ready?'Return to Rowan':tracked.objective.label;
if(view==='mobile-menu'){document.body.classList.add('mobile-menu-open');$('mobile-menu-button').setAttribute('aria-expanded','true');$('mobile-menu-button').querySelector('span:last-child').textContent='Back';$('game-menus').setAttribute('role','dialog');$('game-menus').setAttribute('aria-modal','true');$('game-menus').setAttribute('aria-labelledby','mobile-menu-title');$('mobile-menu-close').onclick=()=>document.body.classList.remove('mobile-menu-open');}
else if(view==='login'){$('world').style.backgroundImage="url('/ui/benji-2026-09-28/screens/login-forest.jpg')";$('login').hidden=false;$('login-social').hidden=false;$('login-google').hidden=false;$('login-apple').hidden=false;$('login-wallet').hidden=false;}
else if(view==='loading')$('loading').hidden=false;
else if(view==='gear'||view==='inventory'){open(view==='gear'?'Character':'Backpack',view,view==='inventory'?renderBackpack(player,'item:greater-tonic',true,[],[],{activeBag:'all',filter:'all',sort:'slots'}):renderGear(player));await Promise.all([loadCharacterAssets(),loadRaidAssets()]);const stage=content.querySelector('.paper-doll-stage');if(stage){const preview=mountCharacterView(stage,player);const tick=t=>{preview.render(t/1000);requestAnimationFrame(tick);};requestAnimationFrame(tick);}}
else if(view==='spells')open('Spellbook','spells',renderSpellbook(player,defaultHotbar('Ranger',60)));
else if(view==='professions')open('Your professions','professions',skillTabs('professions')+renderSkills(player));
else if(view==='talents')open('Talents','talents',renderTalents(player));
else if(view==='training'){player.level=20;player.learnedSpells=['arrow'];const trainer=TRAINER_NPCS.find(t=>t.className==='Ranger');open(trainer.name,'training',renderTraining(player,trainer)+renderStoryNpcChoices(player,trainer.id));}
else if(view==='shop'){const merchant=VILLAGE_NPCS.find(n=>n.role==='merchant');open(merchant.name,'shop',renderShop(player,merchant.id,{tab:'sell',selected:'resource:wood'}));}
else if(view==='npc-talk')openReviewDialogue(player,(title,eyebrow,mode)=>open(title,mode,''),()=>$('close-panel').click(),send);
else if(view==='contracts')open('Adventure board','contracts',renderAdventureTabs('noticeboard')+renderContracts(player,'greenwood',true,fixtureNow));
else if(view==='journal'){createStoryQuestUI({getPlayer:()=>player,send,openPanel:(title,eyebrow,mode)=>open(title,mode,''),closePanel:()=>$('close-panel').click(),content:()=>content,npcName:()=> 'Rowan',showNpcPortrait:noop,findNpc:noop});open('Quest journal','journal',renderStoryJournal(player,()=> 'Rowan'));}
else if(view==='story'){const q=STORY_QUESTS[0],story=createStoryQuestUI({getPlayer:()=>player,send,openPanel:(title,eyebrow,mode)=>open(title,mode,''),closePanel:()=>$('close-panel').click(),content:()=>content,npcName:()=> 'Rowan',showNpcPortrait:noop,findNpc:noop});story.open({type:'storyQuestDialogue',questId:q.id,npcId:q.npcId,title:q.title,phase:'offer',lines:q.dialogue.intro});}
else if(view==='crafting')open('Workshop','crafting',renderCrafting(player,true));
else if(view==='raid')open('Horned Apostle','raid',renderRaidPanel(null,[],player,[],Date.now()));
else if(view==='raid-collection')open('Horned Apostle','raid','<nav class="raid-tabs"><button class="primary-button" aria-pressed="false">Encounter</button><button class="primary-button" aria-pressed="true">Raid collection</button></nav>'+renderRaidProgression(player));
else if(view==='arena')open('Arena','arena',renderArenaMenu({player:{...player,arenaRatings:{1:{rating:1320,wins:12,losses:5,draws:1},2:{rating:1155,wins:3,losses:2,draws:0}}},players:nearbyPlayers,party,queue:null,wagerMoss:'0',native:false,queueReason:size=>size===2?'':size===1?'Leave your party to queue solo.':'Form a party of 3.',challengeReason:(other,size)=>size===1?'':'Requires matching party sizes.',duelReason:()=>''}));
else if(view==='dungeon')open('Dungeons','dungeon',renderReviewDungeon(player,party));
else if(view==='instant-combat')open('Instant Combat','instant-combat',renderInstantCombatPanel({startsAt:fixtureNow+180000,registrationOpensAt:fixtureNow-120000,registrationOpen:true,registered:false,bracketId:'46-60',registeredCount:7,run:null},player,fixtureNow,true));
else if(view==='pets')open('Companions','pets',renderPetCollection(player,true));
else if(view==='mounts')open('Mounts','mounts',renderMountCollection(player,true,'horse','horse',true));
else if(view==='referrals')open('Invite friends','referrals',renderReferrals({code:'mossvale-review',canBind:false,referredBy:true,qualifiedCount:4,feeShareBps:referralFeeBps(4,2),feeVersion:2,petUnlocked:false,mountUnlocked:false,payoutWallet:null,programEnabled:true,referralsEnabled:true,progress:{level:60,daysPlayed:2,spentUsdCents:1000,qualified:true}},location.origin));
else if(view==='options'){open('Options','settings','<div class="settings-layout"><nav class="settings-nav"><span>System</span><button aria-current="page">Graphics</button><button>Wallet</button><button>Audio</button><span>Gameplay</span><button>Controls</button></nav><div class="settings-pages">'+renderGraphicsSettings()+'</div></div>');mountGraphicsSettings(content,noop);}
else if(view==='wallet'){
 const session={accounts:async()=>[{address:fixtureWallet,walletId:'review-only'}],assertIdentity:async id=>{if(id!=='ui-review')throw Error('Fixture account mismatch');},configureSponsorRpc:noop,pendingTransaction:()=>null,logout:async()=>{},dispose:noop,authenticateWithGame:async()=>{throw Error('No authentication in fixture');},sendTransaction:async()=>{throw Error('No payments in fixture');},sendPaidTransaction:async()=>{throw Error('No payments in fixture');}};
 void openTurnkeyWallet({organizationId:'ui-review',authProxyConfigId:'ui-review'},async()=>session,{manage:true,authentication:{getWalletIdentity:()=> 'ui-review',authorizeWallet:async()=>{throw Error('No authentication in fixture');}}}).catch(error=>{if(error.code!==4001)throw error;});
 await until(()=>document.querySelector('.turnkey-asset-amount')?.textContent.includes('MOSS'),'wallet balances');
}
else if(view==='bank'){const section=document.createElement('section');section.id='bank-window';section.innerHTML=renderBankContents(player,{bank:{gear:[],bags:[],items:{'trail-bread':6,'greater-tonic':2},resources:{wood:20,herb:12,crystal:8}},capacity:48,revision:1},{tab:'inventory',selected:'resource:wood',page:0,quantity:1});document.body.append(section);}
else if(view==='auction'){const auction=mountAuctionUI({...common,nearby:()=>true});auction.update({open:true,listings:[{id:'review-wood',sellerId:'review-seller',sellerName:'Mira',item:{kind:'resource',id:'wood',quantity:12},currency:'gold',price:'24',createdAt:fixtureNow-1000},{id:'review-herbs',sellerId:'review-seller-2',sellerName:'Rowan',item:{kind:'resource',id:'herb',quantity:8},currency:'gold',price:'16',createdAt:fixtureNow}],mine:[],sold:[],economyVersion:1,crypto:{enabled:false,moss:{enabled:false}},wallet:null});document.querySelector('[data-listing="review-wood"]')?.click();}
else if(view==='store'){const store=mountStoreUI({...common,trigger:trigger()});store.update({enabled:false,reason:'Offline UI review — no checkout',wallet:null,owned:[],orders:[],mobile:{apple:false,google:false}});store.open();}
else if(view==='friends'){const friends=mountFriendsUI({...common,trigger:trigger(),onWhisper:noop,onInvite:noop,onPartyRespond:noop,onPartyChat:noop,onDungeon:noop});friends.update({type:'friends',friends:[friend,{id:'review-orin',name:'Orin',className:'Mage',level:42,online:false,zone:null}],ignored:[],incoming:[{id:'review-finn',name:'Finn'}],outgoing:[]});friends.updateWho({player,players:nearbyPlayers,party,invites:[],lockReason:''});friends.open();document.querySelector('[data-friend-id="review-mira"]')?.click();}
else if(view==='achievements'){const achievements=mountAchievementsUI({...common,trigger:trigger(),onSelectTitle:noop});achievements.update(player);achievements.open();}
else if(view==='nfts'){const nfts=mountNftUI({...common,trigger:trigger()});nfts.open();nfts.update({configured:true,enabled:false,chainId:4663,wallet:fixtureWallet,ownershipVerified:true,walletBalanceWei:'12500000000000000000',refundWei:'0',feeBps:500,orders:[],ownedPets:['moon-owl'],ownedMounts:['verdant-revenant'],ownedHouses:[NFT_HOUSES[0].id],houses:NFT_HOUSES.map(h=>({...h,reserveWei:'10000000000000000000',highestBidWei:'0',startsAt:0,endsAt:0,settled:false}))});}
await document.fonts.ready;document.body.dataset.ready='true';
`;
mkdirSync('artifacts/benji-ui',{recursive:true});
writeFileSync('artifacts/benji-ui/main-renderers.js',mainRenderers);
writeFileSync('artifacts/benji-ui/views.json',JSON.stringify(views,null,2));
writeFileSync('artifacts/benji-ui/view.html',`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Mossvale UI review</title></head><body><div id="app"></div><script type="module">${css.map(file=>`import ${JSON.stringify('/'+file.slice(resolve('.').length+1))};`).join('\n')}\n${script}</script><style>#world{background:#304c38 url('/ui/benji-2026-09-28/screens/demo-scene.jpg') center/cover}.region-intro,.controls-hint{display:none}</style></body></html>`);
writeFileSync('artifacts/benji-ui/index.html',`<!doctype html><meta charset="utf-8"><title>Benji UI integration review</title><style>body{background:#101b15;color:#eef3ef;font:16px system-ui;margin:32px}nav{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}a{color:#8ce7ad;padding:16px;background:#1c3024;border-radius:8px}p{max-width:70ch;line-height:1.6}</style><h1>Benji UI integration review</h1><p>Actual Mossvale renderers and styles with local fixture data. The world background is Benji's supplied preview artwork. No game server, account, or payment connection. NPC access restrictions remain in the real game.</p><nav>${views.map(view=>`<a href="view.html?view=${view}">${view}</a>`).join('')}</nav>`);
console.log(`Created ${views.length} real-renderer UI review views at artifacts/benji-ui/index.html`);
