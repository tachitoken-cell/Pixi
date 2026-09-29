import type { SpellArtId } from './spells.ts';
import type { SpellArt } from './spell-choreography.ts';
import { SPELL_CHOREOGRAPHY_SOURCES } from './spell-visuals.ts';

/** Knight spells use recognisable weapons, fortifications and physical acts of resolve. */
export function drawKnightSpell(id: SpellArtId, a: SpellArt): boolean {
  id = SPELL_CHOREOGRAPHY_SOURCES[id] || id;
  const { phase, p, t, r, shape: s, line: l, ring, arc } = a;
  const R=Math.max(.05,r),fade=1-p,up=-Math.PI/2,turn=p*Math.PI*2;
  switch(id){
    case 'charge': {
      if(phase==='flight') { // An ironwood ram parts leaves as its low tusks cut a furrow.
        for(const side of [-1,1]) {
          l(side*.54,-.25,.80,side*.43,-.03,.77,.045,5);
          s('spark',side*.4,-.14,.42,.055,.045,.06,4);
          l(side*.5,-.2,-.1,side*.68,-.48,-.95,.04,2);
          s('slash',side*.42,-.52,-.35,.26,.13,1.25,2,side*.2);
          for(let i=0;i<a.detail(3);i++) {
            const tumble=t*5+i;
            s('shield',side*(.46+i*.16),-.66+i*.06,-.4-i*.4,.14,.08,.21,2,side*.4,tumble);
            s('leaf',side*(.6+i*.13),-.32+Math.sin(tumble)*.12,-.55-i*.36,.22,.16,.35,3,side*.7,tumble);
          }
        }
      }else { // Contact breaks two root-bound furrows, with heavy soil chunks landing first.
        const hit=Math.min(1,p*4),z=.2+hit*.65;
        for(const side of [-1,1]) {
          l(0,1.1,z,side*(.3+p*.8),.55,z-.35,.065*fade,5);
          l(side*.35,.07,-.9,side*(.4+p*.6),.07,z,.065*fade,2);
          l(side*.35,.07,-.45,side*(.55+p*.5),.09,-.7,.04*fade,3);
          s('shield',side*(.35+p*.7),.12+Math.sin(p*Math.PI)*.35,z,.3*fade,.16,.45,2,side*.6,p*2);
          s('leaf',side*(.46+p*.9),.2+Math.sin(p*Math.PI)*.55,z-.2,.32*fade,.18,.4,3,side*p*2,.5);
        }
        l(-.18,1.05,z,.18,1.05,z,.12*fade,1);
      }
      break;
    }
    case 'taunt': { // A fern-lynx challenge: twig antlers snap inward and layered cheek fronds bristle.
      const snap=Math.max(0,1-p*5),width=.58+snap*.7,y=phase==='flight'?0:1.75;
      for(const side of [-1,1]) {
        l(side*width,y-.35,0,side*(width+.18),y,0,.085,2);
        l(side*(width+.18),y,0,side*width,y+.35,0,.065,2);
        l(side*width,y+.35,0,side*(width+.16),y+.52,-.06,.045,5);
        l(side*width,y+.35,0,side*(width-.14),y+.58,0,.04,2);
        for(let frond=0;frond<3;frond++)s('leaf',side*(.48+frond*.1),y-.05-frond*.16,.03,.34,.25,.55,3,side*(.7+snap),-.3,side*(.3+Math.sin(t*7+frond)*.08));
        s('spark',side*(phase==='flight'?.24:.2),phase==='flight'?-.27:y+.13,phase==='flight'?.36:.28,.075,.055,.05,4);
        if(phase==='flight')l(side*.16,-.46,.49,side*.51,-.43,.55,.025,5);
        for(let i=0;i<2;i++) {
          const x=side*(.72+i*.28+p*.5),h=.2+i*.13;
          l(x,y-h,0,x+side*.12,y,0,.03*fade,1);l(x+side*.12,y,0,x,y+h,0,.03*fade,1);
        }
      }
      s('leaf',0,y+.52-p*.12,0,.2,.15,.4,3,0,-.65);
      break;
    }
    case 'powerful-throw': {
      if(phase==='flight') { // A briarwood buckler sheds tiny leaves as the carved rim spins.
        const spin=t*16;
        for(let i=0;i<4;i++) {
          const angle=spin+i*Math.PI/2,x=Math.cos(angle)*.61,y=Math.sin(angle)*.61;
          s('spark',x,y,0,.065,.065,.09,1);
          l(x,y,-.05,Math.cos(angle-.5)*.68,Math.sin(angle-.5)*.68,-.4,.035,2);
          s('leaf',x*1.2,y*1.2,-.3,.18,.1,.3,3,0,0,angle);
        }
        for(const side of [-1,1])l(side*.44,0,-.35,side*.2,0,-1.15,.045,1);
      }else { // Rebound scatters short wood splinters and leaves over an iron-edged scrape.
        const sparks=a.detail(7);
        for(let i=0;i<sparks;i++) {
          const angle=-1.2+i*2.4/Math.max(1,sparks-1),d=.25+p*1.5,y=.5+Math.sin(p*Math.PI)*(.4+i%2*.4);
          l(Math.sin(angle)*d*.6,y,Math.cos(angle)*d*.6,Math.sin(angle)*d,y+.12,Math.cos(angle)*d,.055*fade,i%2?2:1);
          s('leaf',Math.sin(angle)*d,y+.16,Math.cos(angle)*d,.2*fade,.12,.3,i%2?2:3,angle,p*4);
        }
        for(const side of [-1,1])l(side*.12,.15,-.2,side*(.25+p*.6),.15,.6+p*.4,.08*fade,0);
      }
      break;
    }
    case 'guard': { // Root latches close over a bark pavise; jade returns along its carved grain.
      const close=Math.min(1,p*5),width=.95-close*.28;
      for(const side of [-1,1]) {
        s('shield',side*width,1.03,.55,.42,1.38,.18,2,-side*(.75-close*.4));
        l(side*.12,.5,.85,side*.49,1.25,.85,.055,3);
        l(side*.49,1.25,.85,side*.24,1.65,.7,.045,3);
        l(side*.95,.065,.85,side*.58,.2,.62,.08,2);
        l(side*.58,.2,.62,side*width,1.03,.6,.07*close,2);
        s('leaf',side*.77,.4,.73,.35*close,.18,.5,3,side*.7,-.55);
        const out=Math.max(0,p-.3)*1.3;
        l(side*(.22+out),.92,.92+out,side*(.48+out),1.15,.92+out,.035*fade,4);
      }
      l(-.42,.3,.58,.42,.3,.58,.075,0);
      s('spark',-.4+p*.8,.55+p,.87,.06,.14,.06,4);
      break;
    }
    case 'adamant-guardian': {
      if(phase==='impact') { // Stored force lifts mossy stone slabs and parts the roots beneath them.
        const d=Math.max(.2,r)*Math.min(1,p*2.5);
        for(let i=0;i<6;i++) {
          const angle=i*Math.PI/3,x=Math.sin(angle)*d,z=Math.cos(angle)*d,y=.3+Math.sin(p*Math.PI)*.55;
          s('shield',x,y,z,(.5+.5*fade),(.8+.5*fade),.24,0,angle,p*.9);
          l(x-Math.cos(angle)*.24,y-.23,z+Math.sin(angle)*.24,x,y+.42,z,.055*fade,4);
          l(x,y+.42,z,x+Math.cos(angle)*.24,y-.23,z-Math.sin(angle)*.24,.055*fade,4);
          l(x*.35,.09,z*.35,x,.09,z,.11*fade,2);
          l(x*.72,.105,z*.72,x,.105,z,.06*fade,4);
          l(x*.7,.1,z*.7,x*.78+Math.cos(angle)*.3,.13,z*.78-Math.sin(angle)*.3,.055*fade,3);
          s('leaf',x*.9,.4+Math.sin(p*Math.PI)*.65,z*.9,.33*fade,.2,.5,3,angle,p*2);
        }
      }else { // Root buttresses climb around a moss-grown sentinel, leaving its jade heart visible.
        const lock=Math.min(1,p*5),spread=1.15-lock*.22;
        for(let i=0;i<6;i++) {
          const angle=.55+i*(Math.PI*2-1.1)/5,x=Math.sin(angle)*spread,z=Math.cos(angle)*spread;
          l(x*1.3,.065,z*1.3,x,.3,z,.1,2);
          l(x,.3,z,x*.95,1.8,z*.95,.09,2);
          l(x*.95,1.8,z*.95,x*.5,2.3,z*.5,.055,3);
          s('shield',x,1.3,z,.38,1.25,.24,0,angle);
          s('leaf',x*.75,1.92,z*.75,.3,.18,.55,3,angle,-.5+lock*.2);
        }
        for(const side of [-1,1])l(side*.34,.15,.45,side*.62,.15,1.0,.085,1);
      }
      break;
    }
    case 'courageous-call': { // A root-bound war horn stirs fern tips and three warm breath fronts.
      const lift=Math.sin(Math.min(1,p*2)*Math.PI/2);
      for(const side of [-1,1]) {
        l(0,1.35+lift*.4,0,side*.42,1.65+lift*.4,0,.05,2);
        s('leaf',side*.5,1.65+lift*.4,0,.55,.24,.8,3,side*.6,-.5,-side*(.5+Math.sin(t*6)*.1));
        s('leaf',side*.66,1.42+lift*.4,.05,.36,.18,.5,3,side*.85,-.4,-side*.6);
      }
      for(let i=0;i<3;i++) {
        const q=Math.max(0,p-i*.12),d=.45+q*1.9,y=.75+i*.26;
        for(const side of [-1,1]) {
          l(side*d,y,0,side*(d+.22),y+.22,.2,.03*(1-q),5);
          l(side*(d+.22),y+.22,.2,side*d,y+.44,.4,.03*(1-q),1);
        }
      }
      break;
    }
    case 'lord-of-battle': { // An antler circlet unfurls command leaves around a small jade heart.
      const settle=Math.max(0,1-p*4),y=1.9+settle*.5;
      for(let i=0;i<5;i++) {
        const angle=i*Math.PI*2/5,next=angle+Math.PI*2/5,d=.7;
        const x=Math.sin(angle)*d,z=Math.cos(angle)*d;
        l(x,y,z,Math.sin(next)*d,y,Math.cos(next)*d,.065,2);
        l(x,y,z,x*1.16,y+.28+(i%2)*.12,z*1.16,.045,5);
        l(x*1.16,y+.28+(i%2)*.12,z*1.16,x*1.28+Math.cos(angle)*.12,y+.4,z*1.28-Math.sin(angle)*.12,.03,2);
        s('leaf',x*.92,y-.18,z*.92,.35,.2,.55,3,angle,-.55+Math.sin(t*5+i)*.1);
      }
      for(const side of [-1,1]) {
        l(side*.3,.6,-.22,side*.55,1.25,-.22,.055,2);
        l(side*.55,1.25,-.22,side*.38,1.6,-.22,.045,2);
        s('leaf',side*.62,1.13,.1,.35,.24,.85,3,-side*.35,-.6,side*.2);
      }
      s('spark',0,1.7,.28,.08,.18,.07,4);
      break;
    }
    case 'strike': { // One descending diagonal edge, with a cut that opens behind it.
      const x=.85-1.7*p,y=1.9-1.3*p;
      l(x-.35,y+.45,R-.12,x+.35,y-.45,R+.08,.08+fade*.06,1);
      s('shard',x,y,R,.2,.12,.9,0,0,Math.PI/2,.7);
      l(-.65,.5,R,.65,1.9,R,.035*fade,0);
      for(let i=0;i<a.detail(5);i++)s('spark',x+(i-2)*.12,y+i*.06,R-.18*p,.06*fade,.13*fade,.06,1);
      break;
    }
    case 'crippling-strike': { // A low hooking blade closes a broken manacle around the ankles.
      arc(0,.25,R,.65,-Math.PI*.8,Math.PI*(p*.8-.2),.085,0);
      for(const side of [-1,1]){s('slash',side*.38,.28,R,.5,.12,.6,0,side*(1-p));l(side*.6,.22,R-.3,side*.18,.22,R+.3,.045,1);}
      if(p>.22){const spread=(1-p)*.35;arc(0,.3,R,.38,spread,Math.PI-spread,.07,1);arc(0,.3,R,.38,Math.PI+spread,2*Math.PI-spread,.07,1);}
      break;
    }
    case 'cleave': { // A broad crescent opens outward from a central blade hinge.
      const open=.3+p*.95;
      for(const side of [-1,1]){l(0,1.05,R-.65,side*Math.sin(open)*1.35,1.05,R-.65+Math.cos(open)*1.35,.12,1);s('slash',side*.7,1.05,R-.2,1.15,.14,.65,0,side*open);}
      arc(0,1.05,0,R,Math.PI/2-.95,Math.PI/2+.95,.10*fade+.035,0);
      s('spark',0,1.05,R,.17,.5*fade,.17,1);
      break;
    }
    case 'second-wind': { // Two breaths draw into the lungs and rise out as separate wisps.
      for(const side of [-1,1])for(let i=0;i<7;i++){const u=i/6,spread=(1-p)*(.95-u*.55),y=.7+u*.75+p*.55;l(side*spread,y,-.15,side*(spread-.1),y+.1,-.1,.035+fade*.025,1);}
      s('feather',-.22,1.25+p*.7,0,.3*fade,.45,.15,0,-.3,0,-.4);s('feather',.22,1.25+p*.7,0,.3*fade,.45,.15,0,.3,0,.4);
      s('spark',0,1.2,0,.18*Math.sin(p*Math.PI),.3,.15,1);
      break;
    }
    case 'shield-bash': { // A shield punches forward; a rectangular pressure face cracks on contact.
      const z=R-.4*(1-p);
      s('shield',0,1.1,z,1.25,1.4,.35,0);s('spark',0,1.1,z+.22,.17,.17,.4,1);
      for(const side of [-1,1]){l(side*.6,.45,z,side*.6,1.7,z,.065,1);l(side*.6,1.7,z,side*.35,1.95,z,.065,1);}
      if(p>.3)for(let i=0;i<5;i++){const angle=i/5*Math.PI*2; l(0,1.1,z+.25,Math.sin(angle)*p,1.1+Math.cos(angle)*p,z+.3,.035*fade,1);}
      break;
    }
    case 'iron-guard': { // Two iron plates clamp into a crossed, front-facing guard.
      for(const side of [-1,1]){const x=side*(.75-.45*p);s('shield',x,1.1,.65,.55,1.4,.25,0,side*(.75-.5*p));l(x-side*.28,.65,.85,x+side*.28,1.55,.85,.085,1);}
      l(-.4,.35,.72,.4,.35,.72,.08,0);s('rune',0,1.08,.88,.24,.24,.24,1,0,Math.PI/2);
      break;
    }
    case 'whirlwind': { // Three horizontal sword arms swing out from a rotating central spindle.
      for(let i=0;i<3;i++){const angle=turn+i*Math.PI*2/3,x=Math.sin(angle)*R,z=Math.cos(angle)*R;l(Math.sin(angle)*R*.35,.9,Math.cos(angle)*R*.35,x,.9,z,.085,1);s('shard',x,1,z,.2,.12,.95,0,angle+Math.PI/2);arc(0,.85,0,R,Math.PI/2-angle+.5,Math.PI/2-angle,.06,0);}
      s('slash',0,.9,0,.65,.1,.65,1,turn);
      break;
    }
    case 'heavy-slash': { // A heavy overhead blade falls vertically and leaves a long ground gouge.
      const y=2.4-p*1.8;
      s('shard',0,y,R,.38,.2,1.7,0,0,up);l(-.48,y-.7,R,.48,y-.7,R,.1,1);l(0,y-.7,R,0,y-1,R,.1,0);
      l(0,.06,R-1.2*p,0,.06,R,.16*fade,0);
      for(const side of [-1,1])s('slash',side*.28*p,.22,R-.5,.45*fade,.14,.9,1,side*.45);
      break;
    }
    case 'shockwave': { // Uneven stone plates tilt up into a travelling, scalloped earth wall.
      for(let i=0;i<12;i++){const angle=i*Math.PI/6,x=Math.sin(angle)*R,z=Math.cos(angle)*R,h=.18+Math.sin(p*Math.PI)*(.25+i%3*.15);s('shield',x,h,z,.6,h*2,.24,0,angle,up*.25);l(x,.07,z,x*.8,.07,z*.8,.07,1);}
      arc(0,.09,0,R,-Math.PI*.45,Math.PI*.45,.13*fade,1);
      break;
    }
    case 'shield-toss': {
      if(phase==='flight'){ // A spinning buckler with a visible boss and four metal spokes.
        s('shield',0,0,0,1.15,1.15,.24,0,t*10,0,.25);s('spark',0,0,.2,.24,.24,.18,1);
        for(let i=0;i<4;i++){const angle=t*10+i*Math.PI/2;l(0,0,.15,Math.cos(angle)*.55,Math.sin(angle)*.55,.15,.055,1);}
        arc(0,0,-.2,.65,t*10-1.8,t*10,.045,0,-Math.PI/2);
      }else{for(const side of [-1,1])s('shield',side*p*.8,.65+p*.6,0,.55*fade,.9*fade,.15,0,side*p*2);arc(0,.08,0,.35+p*.9,0,Math.PI*1.5,.06,1);}
      break;
    }
    case 'rallying-cry': { // A planted standard unfurls a pennant and projects three sound chevrons.
      const h=.6+Math.min(1,p*3)*1.6;l(-.55,.08,0,-.55,h,0,.07,1);s('shard',-.55,h+.12,0,.16,.13,.4,1,0,up);
      for(let i=0;i<5;i++)s('shield',-.45+i*.14,h-.36+Math.sin(t*8-i)*.05,0,.2,.55,.08,0,0,0,-.08*i);
      for(let i=0;i<3;i++){const x=.3+i*.22+p*.25;l(x,.85,0,x+.13,1.1,0,.045*fade,1);l(x+.13,1.1,0,x,1.35,0,.045*fade,1);}
      break;
    }
    case 'concussive-blow': { // A blunt spectral hammer strikes, then leaves orbiting stun stars.
      const y=2.2-1.6*Math.min(1,p*1.6);l(0,y+.55,R-.1,0,y-.35,R-.1,.12,0);s('shield',0,y,R,.95,.5,.7,0,0,Math.PI/2);
      for(const side of [-1,1])s('spark',side*.5,y,R,.2,.3,.4,1);
      if(p>.25)for(let i=0;i<4;i++){const angle=turn+i*Math.PI/2;s('spark',Math.cos(angle)*.55,1.8+Math.sin(angle)*.12,R+Math.sin(angle)*.2,.14*fade,.14,.14,1,angle);}
      break;
    }
    case 'steel-bulwark': { // A braced shield wall, with side wings and triangular rear supports.
      for(let i=-1;i<=1;i++){const x=i*.65,z=.85-Math.abs(i)*.18;s('shield',x,1.0,z,.68,1.8,.35,0,-i*.35);l(x,.1,z,x,1.7,z,.045,1);l(x,.1,z-.75,x,1.45,z,.09,0);}
      l(-.95,.2,.7,.95,.2,.7,.1,1);l(-.95,1.75,.7,.95,1.75,.7,.075,1);
      break;
    }
    case 'groundbreaker': { // Forked faults travel out, exposing teeth along each crack.
      for(let i=0;i<6;i++){const angle=i*Math.PI/3,x=Math.sin(angle)*R,z=Math.cos(angle)*R,bx=x*.62+.18*Math.cos(angle),bz=z*.62-.18*Math.sin(angle);l(0,.06,0,bx,.06,bz,.045,1);l(bx,.06,bz,x,.06,z,.08,0);l(bx,.06,bz,x*.85+Math.cos(angle)*.4,.06,z*.85-Math.sin(angle)*.4,.045,1);s('shard',x,.3,z,.22,.22,.65+Math.sin(p*Math.PI)*.5,0,angle,up);}
      break;
    }
    case 'crushing-sweep': { // An offset scythe blade descends across the frontal fan.
      const angle=-1.1+p*2.2,x=Math.sin(angle)*R,z=Math.cos(angle)*R,y=1.8-p*1.1;
      l(x*.35,y+.35,z*.35,x,y,z,.09,0);s('slash',x,y,z,1.8,.2,.9,1,angle+Math.PI/2,.4);
      for(let i=0;i<3;i++){const behind=angle-i*.2; s('slash',Math.sin(behind)*R,y+i*.1,Math.cos(behind)*R,1.2-i*.25,.08,.6,0,behind+Math.PI/2,.4);}
      break;
    }
    case 'bladestorm': { // A rising double helix of separate blades forms a hollow cutting funnel.
      for(let i=0;i<14;i++){const u=i/13,angle=t*9+u*Math.PI*4,rad=R*(.45+.55*u);s('shard',Math.sin(angle)*rad,.25+u*1.9,Math.cos(angle)*rad,.16,.1,.8, i%2,angle+Math.PI/2,.25);if(i%2===0)l(Math.sin(angle-.22)*rad,.25+u*1.9,Math.cos(angle-.22)*rad,Math.sin(angle)*rad,.25+u*1.9,Math.cos(angle)*rad,.035,1);}
      break;
    }
    case 'quick-recovery': { // A short bandage wraps the torso and closes with a bright stitch.
      for(let i=0;i<9;i++){const u=i/8,angle=u*Math.PI*2+p*2;s('ring',Math.sin(angle)*.48,.85+u*.55,Math.cos(angle)*.42,.16,.045,.16,0);}
      for(let i=0;i<4;i++){const y=.95+i*.13;l(-.16,y,.48,.16,y+.07,.48,.035,1);l(.16,y,.48,-.16,y+.07,.48,.035,1);}
      s('spark',0,1.65,0,.1+Math.sin(p*Math.PI)*.2,.2,.12,1);
      break;
    }
    case 'shattering-throw': {
      if(phase==='flight'){ // A tumbling double-edged throwing axe, not a recoloured bolt.
        const angle=t*11,c=Math.cos(angle),q=Math.sin(angle);l(-q*.6,-c*.6,0,q*.5,c*.5,0,.095,0);s('slash',q*.35,c*.35,0,.85,.16,.6,1,0,0,-angle);s('slash',-q*.1,-c*.1,0,.65,.16,.5,0,Math.PI,0,-angle);
        l(-q*.55,-c*.55,-.35,-q*.55,-c*.55,-.9,.04,1);
      }else{for(let i=0;i<6;i++){const angle=i*Math.PI/3;s('shield',Math.cos(angle)*p,Math.max(.2,.8+Math.sin(angle)*p),Math.sin(angle)*p,.38*fade,.65*fade,.16,0,angle,p*3);}l(-.6,.05,0,.6,.05,0,.09*fade,1);}
      break;
    }
    case 'earthshaker': { // A stomping boot drives a crater rim and six airborne slabs upward.
      s('shield',0,.2+Math.max(0,.4-p)*3,.4,.9,.5,1.1,0,0,Math.PI/2);s('shield',0,.75+Math.max(0,.4-p)*3,0,.55,1.15,.5,1);
      for(let i=0;i<8;i++){const angle=i*Math.PI/4,x=Math.sin(angle)*R,z=Math.cos(angle)*R;s('shield',x,.16+Math.sin(p*Math.PI)*.75,z,.65,.32,.8,0,angle,.5-p);l(x*.82,.08,z*.82,x,.08,z,.11,1);}
      break;
    }
    case 'guardian-oath': { // An oath knot links two arms into an arch over one protected ally.
      for(const side of [-1,1]){l(side*.95,.25,0,side*.65,1.8,0,.065,0);l(side*.65,1.8,0,0,2.2,0,.065,1);s('shield',side*.72,1.0,0,.45,1.35,.2,0,side*Math.PI/2);}
      ring(-.13,1.25,.62,.24,1,Math.PI/2);ring(.13,1.25,.62,.24,1,Math.PI/2);
      s('rune',0,2.2,0,.4,.15,.4,1,turn*.15);
      break;
    }
    case 'relentless-strike': { // A rapid crossing riposte: two narrow thrusts meet, then split apart.
      const spread=.5*fade;
      l(-spread,.65,R-.55,spread,1.65,R+.05,.11,1);l(spread,.65,R-.55,-spread,1.65,R+.05,.11,0);
      s('shard',-spread*.3,1.3,R,.16,.12,1,1,.3,up*.55);s('shard',spread*.3,1.3,R,.16,.12,1,0,-.3,up*.55);
      if(p>.3)for(const side of [-1,1])l(0,1.1,R,side*p*.9,1.1+p*.3,R,.04*fade,1);
      break;
    }
    case 'defiant-stand': { // A planted sword anchors three measured breath bars.
      s('shard',0,.8,.7,.22,.16,1.5,0,0,up);l(-.45,1.5,.7,.45,1.5,.7,.09,1);l(0,1.5,.7,0,1.95,.7,.09,0);
      for(let i=0;i<3;i++){const y=.5+i*.42,width=.3+Math.sin(Math.PI*Math.min(1,p*1.4+i*.12))*.4;l(-width,y,-.4,width,y,-.4,.055,1);}
      for(const side of [-1,1])s('shield',side*.45,.15,.35,.3,.15,.5,0,side*.35,Math.PI/2);
      break;
    }
    case 'chainbreaker': { // Interlocking links snap at the centre and whip to opposite sides.
      for(let i=-4;i<=4;i++){if(i===0&&p>.2)continue;const side=Math.sign(i),x=i*.25+side*p*.7,y=.85+Math.sin(Math.abs(i)*.5+p*2)*.2;ring(x,y,R-Math.abs(i)*.07,.17, i%2?0:1,Math.PI/2,i%2?Math.PI/2:0);}
      l(-.12-p*.45,.85,R,-.12-p*.45,.85+p*.4,R,.05*fade,1);l(.12+p*.45,.85,R,.12+p*.45,.85-p*.4,R,.05*fade,1);
      s('slash',0,.85,R,.65*fade,.15,.8,1,0,Math.PI/2);
      break;
    }
    case 'fortress': { // Four crenellated walls rise as a square keep, leaving the player readable.
      const rise=Math.min(1,p*4);
      for(let side=0;side<4;side++){const angle=side*Math.PI/2,x=Math.sin(angle)*1.05,z=Math.cos(angle)*1.05;s('shield',x,.75*rise,z,1.45,1.45*rise,.25,0,angle);for(let tooth=-1;tooth<=1;tooth++)s('shield',x+Math.cos(angle)*tooth*.4,1.55*rise,z-Math.sin(angle)*tooth*.4,.22,.38*rise,.3,1,angle);}
      for(const x of [-1,1])for(const z of [-1,1])s('shard',x,.95*rise,z,.23,.23,1.9*rise,0,0,up);
      break;
    }
    case 'thunderclap': { // Two palms meet; eight broken lightning forks race along the ground.
      for(const side of [-1,1])s('shield',side*.4*fade,.9,.3,.45,.6,.3,0,-side*p);
      s('spark',0,.85,.4,.15+fade*.3,.55*fade,.2,1);
      for(let i=0;i<8;i++){const angle=i*Math.PI/4,x=Math.sin(angle)*R,z=Math.cos(angle)*R,mx=x*.55+Math.cos(angle)*.25,mz=z*.55-Math.sin(angle)*.25;l(0,.12,0,mx,.12,mz,.07,1);l(mx,.12,mz,x,.12,z,.05,1);l(x*.8,.12,z*.8,x*.78+Math.cos(angle)*.4,.3,z*.78-Math.sin(angle)*.4,.035,0);}
      break;
    }
    case 'colossus-strike': { // A giant ceremonial sword drives down, with a distinct crossguard.
      const height=1.7-1.2*Math.min(1,p*1.7);
      s('shard',0,height,R,.7,.3,2.3,0,0,up);l(-.95,height+.8,R,.95,height+.8,R,.17,1);l(0,height+.8,R,0,height+1.25,R,.18,0);s('rune',0,height+.65,R,.34,.12,.34,1,0,Math.PI/2);
      for(const side of [-1,1]){l(0,.06,R,side*p*1.2,.06,R-.65*p,.12*fade,1);s('shard',side*p*.7,.2,R-.3,.2,.2,.65*fade,0,side*.5,up);}
      break;
    }
    case 'stalwart-company': { // Five shields march outward, linked shoulder to shoulder.
      const radius=.55+p*.55;
      for(let i=0;i<5;i++){const angle=i*Math.PI*2/5,x=Math.sin(angle)*radius,z=Math.cos(angle)*radius,next=angle+Math.PI*2/5;s('shield',x,1.05,z,.5,1.15,.22,0,angle);s('spark',x,1.35,z,.08,.25,.08,1);l(x,.65,z,Math.sin(next)*radius,.65,Math.cos(next)*radius,.04,1);}
      break;
    }
    case 'siegebreaker': {
      if(phase==='flight'){ // A metal battering ram carries a horned head and parallel rails.
        for(const side of [-1,1]){l(side*.27,0,-.9,side*.27,0,.35,.12,0);s('shard',side*.28,.18,.45,.2,.2,.85,1,side*.2,-.25);s('ring',side*.28,0,-.55,.2,.2,.2,1,0,Math.PI/2);}
        s('shield',0,0,.4,.85,.6,.35,0);s('spark',0,0,.65,.25,.22,.3,1);
      }else{ // The ram breaks a gate into four panels, exposing a central blast.
        for(let i=0;i<4;i++){const angle=i*Math.PI/2+.4;s('shield',Math.sin(angle)*p*1.5,.6+Math.sin(p*Math.PI),Math.cos(angle)*p*1.5,.5*fade,.9*fade,.2,0,angle,p*2);l(0,.15,0,Math.sin(angle)*p*1.7,.15,Math.cos(angle)*p*1.7,.085*fade,1);}s('spark',0,.8,0,.3*fade,1.3*fade,.3,1);
      }
      break;
    }
    case 'unyielding-blows': { // Three staggered piston heads hammer one point in sequence.
      for(let i=0;i<3;i++){const q=(p+i/3)%1,x=(i-1)*.48,y=.7+Math.abs(Math.sin(q*Math.PI))*1.2;l(x,y+.4,R,x,y-.15,R,.075,0);s('shield',x,y-.15,R,.48,.4,.42, i===Math.floor(p*3)%3?1:0,0,Math.PI/2);if(q<.3)l(x-.22,.08,R,x+.22,.08,R,.1*(1-q/.3),1);}
      break;
    }
    case 'battle-renewal': { // Light traces and reseals the seams of a complete suit of armor.
      const seal=Math.min(1,p*1.6);
      for(const side of [-1,1]){l(side*.18,.25,0,side*.28,.9*seal+.25,0,.055,1);l(side*.28,1.05,0,side*.6,1.55*seal,0,.055,1);l(side*.58,1.55,0,side*.82,.85+seal*.35,0,.045,1);s('shield',side*.5,1.45,0,.38,.4,.18,0,side*.3);}
      l(-.28,1.05,0,.28,1.05,0,.07,0);s('shield',0,1.2,.15,.65,.9,.22,0);s('rune',0,1.3,.32,.32,.15,.32,1,0,Math.PI/2);
      for(let i=0;i<a.detail(6);i++)s('spark',Math.sin(i*2.4)*.55,.2+p*1.8,Math.cos(i*2.4)*.55,.07*fade,.12,.07,1);
      break;
    }
    case 'last-bastion': { // Four buttresses hold a peaked sanctuary roof and central hanging crest.
      const build=Math.min(1,p*5);
      for(const x of [-.85,.85])for(const z of [-.85,.85]){l(x,.08,z,x,1.75*build,z,.12,0);l(x,1.75*build,z,0,2.4*build,0,.08,1);s('shield',x,.8,z,.5,1.35*build,.2,0,Math.atan2(x,z));}
      l(-.9,1.75,0,.9,1.75,0,.065,1);l(0,1.75,-.9,0,1.75,.9,.065,1);s('shield',0,1.85,.75,.55,.7,.12,1);s('rune',0,2.5*build,0,.35,.12,.35,1,turn*.1);
      break;
    }
    default:return false;
  }
  return true;
}
