import { SPELL_EFFECT_IDS, type SpellArtId } from './spells.ts';
import type { SpellArt } from './spell-choreography.ts';

/** Each spell owns its construction and sequence. Shared meshes are only the brush strokes. */
export function drawMageSpell(id: SpellArtId, a: SpellArt): boolean {
  const {phase,p,t,r,shape:s,line:l,ring,arc,detail}=a, flight=phase==='flight', fade=1-p, TAU=Math.PI*2;
  switch(id){
    case SPELL_EFFECT_IDS.blink: {
      // A rune aperture shears into displaced panes and snaps inward at arrival.
      const open = Math.sin(p * Math.PI), radius = .55 + open * .5;
      for (let i = 0; i < 6; i++) {
        const angle = i * TAU / 6 + t * 2, x = Math.cos(angle) * radius, y = 1.1 + Math.sin(angle) * radius;
        s('rune', x, y, -.15 + (i % 2) * .3, .2 * fade, .2 * fade, .2 * fade, i % 2, -angle, Math.PI / 2, angle);
        l(x * .55, 1.1 + (y - 1.1) * .55, -.2, x * 1.2, 1.1 + (y - 1.1) * 1.2, .25 + open * .4, .025 * fade, 1);
      }
      for (const side of [-1, 1]) {
        arc(0, 1.1, side * .22, radius, side * t * 2, side * t * 2 + Math.PI * 1.3, .032 * fade, 1, Math.PI / 2);
        for (let i = 0; i < detail(5); i++) {
          const q = (p * 1.5 + i * .17) % 1;
          s('shard', side * (.25 + q * .65), .35 + i * .32, -.4 - q * .8, .06 * (1 - q), .06, .32, 0, side * .4, 0, t * side * 3);
        }
      }
      break;
    }
    case 'fireball': { // A tumbling molten ball with a tearing, single flame tail.
      if(flight){for(let i=0;i<5;i++){const q=t*5+i*TAU/5;s('flame',Math.cos(q)*.3,Math.sin(q)*.3,0,.8,.8,1.45,0,0,0,q);}s('spark',0,0,.12,.58,.58,.7,1);for(let i=0;i<detail(8);i++)s('flame',Math.sin(i+t*15)*.12,Math.cos(i*2)*.12,-.55-i*.2,.25-i*.018,.25-i*.018,.7,0,0,0,t*3);}
      else {for(let i=0;i<7;i++){const q=i*TAU/7,rr=.35+p*1.8;l(Math.sin(q)*.2,.2,Math.cos(q)*.2,Math.sin(q)*rr,.4+Math.sin(p*Math.PI),Math.cos(q)*rr,.11*fade);s('flame',Math.sin(q)*rr,.6+Math.sin(p*Math.PI),Math.cos(q)*rr,.5*fade,.5*fade,1.1*fade,0,q,-1.1);}s('spark',0,.8,0,fade,fade,fade,1);}
      break;
    }
    case 'arcane-missile': { // A spinning tetrahedral dart, shattering into triangular panels.
      const z=flight?0:.35, e=flight?.65:.3+p*1.4;
      for(let i=0;i<3;i++){const q=i*TAU/3+t*4,b=q+TAU/3,x=Math.cos(q)*e,y=Math.sin(q)*e+(flight?0:1);l(x,y,z,Math.cos(b)*e,Math.sin(b)*e+(flight?0:1),z,.055);l(x,y,z,0,flight?0:1,flight?.95:1-p,.06,1);if(!flight)s('rune',x,y,z,.25*fade,.25*fade,.25*fade,0,q,t*4);}
      if(flight)for(let i=1;i<5;i++)s('shard',0,0,-i*.37,.13,.13,.36,1,0,0,t*5+i);
      break;
    }
    case 'frostbolt': { // Serrated fishbone ice, then a branching frozen fracture.
      if(flight){s('shard',0,0,.1,.65,.65,1.7);for(let i=0;i<4;i++)for(const side of [-1,1])l(0,0,-i*.28,side*(.45-i*.07),.06,-i*.28-.22,.08,1);}
      else for(let i=0;i<6;i++){const q=i*TAU/6,rr=.3+p*1.3,x=Math.sin(q)*rr,z=Math.cos(q)*rr;l(0,.08,0,x,.08,z,.06*fade);for(const side of [-1,1])l(x*.6,.08,z*.6,x*.7+Math.cos(q)*side*.22,.12,z*.7-Math.sin(q)*side*.22,.045*fade,1);s('shard',x,.38,z,.2*fade,.2*fade,.7*fade,0,q,-Math.PI/2);}
      break;
    }
    case 'flame-barrier': { // Tall fire curtains close around the recipient, leaving a visible doorway.
      for(let i=0;i<7;i++){const q=-2.6+i*.74,rr=1.15+Math.sin(p*Math.PI)*.2;s('flame',Math.sin(q)*rr,1.1,Math.cos(q)*rr,.65,.5,2.6*Math.sin(Math.PI*p),i%2,q,-Math.PI/2);s('flame',Math.sin(q)*rr,2.1+Math.sin(t*10+i)*.15,Math.cos(q)*rr,.25,.25,.6*fade,1,q,-Math.PI/2);}
      break;
    }
    case 'nova': { // Six complete snowflake arms grow with the authoritative wave.
      for(let i=0;i<6;i++){const q=i*TAU/6,x=Math.sin(q)*r,z=Math.cos(q)*r;l(0,.09,0,x,.09,z,.07*fade,1);for(const f of [.5,.78])for(const side of [-1,1]){const b=q+side*.6;l(x*f,.1,z*f,x*f+Math.sin(b)*r*.22,.12,z*f+Math.cos(b)*r*.22,.06*fade);}s('shard',x,.3,z,.2*fade,.2*fade,(.7+Math.sin(p*Math.PI))*fade,0,q,-Math.PI/2);}
      break;
    }
    case 'ice-lance': { // A narrow spear with an isolated shock collar; impact slices vertically.
      if(flight){s('shard',0,0,.25,.25,.25,2.6,1);for(const side of [-1,1])s('shard',side*.16,0,-.5,.15,.1,.75,0,side*.4);ring(0,0,-.8,.24,0,Math.PI/2,t*2);}
      else {l(0,.1,0,0,2.9*fade,0,.11*fade,1);for(const side of [-1,1])s('shard',side*p*.65,1.1,0,.25*fade,.2*fade,1.8*fade,0,0,-Math.PI/2,side*p);}
      break;
    }
    case 'arcane-burst': { // An expanding wireframe cube fractures into its eight corner glyphs.
      const d=r*.64;for(const x of [-d,d])for(const z of [-d,d]){l(x,.15,z,x,.15+fade*1.1,z,.075*fade);l(x,.15,z,-x,.15,z,.035*fade,1);l(x,.15,z,x,.15,-z,.035*fade,1);s('rune',x,.6,z,.32*fade,.32*fade,.32*fade,0,t,Math.PI/2);}
      break;
    }
    case 'cinderbolt': { // Dark tumbling coals and falling hot ash, no halo or ornamental rings.
      for(let i=0;i<5;i++){const q=i*2.4+t*6;s('shard',Math.cos(q)*(flight?.22:p),flight?Math.sin(q)*.2:.2+Math.sin(p*Math.PI)*(i%3),flight?-i*.12:Math.sin(q)*p,.28*(flight?1:fade),.24*(flight?1:fade),.3*(flight?1:fade),2,q,t*3);s('spark',Math.cos(q)*.17,flight?Math.sin(q)*.15:.25,flight?-i*.2:Math.sin(q)*p,.12,.12,.12,0);}
      if(flight)for(let i=0;i<detail(8);i++)s('spark',Math.sin(i)*.1,-i*i*.014,-.3-i*.18,.06,.06,.06,1);
      break;
    }
    case 'meteor': { // A jagged boulder trailing two burning wakes; impact leaves a broken crater.
      if(flight){for(let i=0;i<9;i++){const q=i*2.4;s('shard',Math.sin(q)*.55,Math.cos(q)*.5,Math.sin(q*2)*.4,.8,.8,1,2,q,t*2);}for(const side of [-1,1])for(let i=0;i<detail(7);i++)s('flame',side*.4,Math.sin(i)*.15,-.5-i*.35,.5-i*.045,.5-i*.045,1.3,0,0,0,side*t);}
      else {for(let i=0;i<10;i++){const q=i*TAU/10,rr=.3+p*2.5;s('shard',Math.sin(q)*rr,.1+Math.sin(p*Math.PI)*(i%3+.4),Math.cos(q)*rr,.65*fade,.6*fade,.8*fade,2,q,p*4);l(Math.sin(q)*.4,.08,Math.cos(q)*.4,Math.sin(q)*rr,.09,Math.cos(q)*rr,.07*fade,0);}s('flame',0,1.5*fade,0,1.1*fade,1.1*fade,3.5*fade,0,t,-Math.PI/2);}
      break;
    }
    case 'arcane-restoration': { // An hourglass pours a stream of light through the torso.
      const e=.7;for(const y of [.4,2.5]){ring(0,y,0,e,0);for(let i=0;i<4;i++){const q=i*TAU/4;l(Math.sin(q)*e,y,Math.cos(q)*e,0,1.45,0,.05,1);}}
      for(let i=0;i<detail(12);i++){const h=2.4-((i/12+p*1.8)%1)*1.9;s('spark',Math.sin(i*2.4)*.1,h,Math.cos(i*2.4)*.1,.08,.16,.08,1);}
      break;
    }
    case 'frozen-orb': { // A spherical lattice of orbiting icicles splits into two hemispheres.
      const e=flight?.68:.65+p*.8,cy=flight?0:1;
      for(let i=0;i<3;i++)ring(0,cy,0,e,0,i*Math.PI/3,t*1.6+i);
      for(let i=0;i<8;i++){const q=i*TAU/8+t*2;s('shard',Math.sin(q)*e,cy+Math.cos(q)*e*(flight?1:1+p),Math.cos(q*2)*e*.4,.2,.2,.6*(flight?1:fade),1,q,t);}
      break;
    }
    case 'spellward': { // A book-sized rectangular sigil unfolds into four hovering rune panes.
      for(let i=0;i<4;i++){const q=i*Math.PI/2,rr=.55+p*.55,cx=Math.sin(q)*rr,cz=Math.cos(q)*rr;s('rune',cx,1.3,cz,.5,.5,.5,0,q,Math.PI/2);l(cx-.32,1,cz,cx-.32,1.8,cz,.04,1);l(cx+.32,1,cz,cx+.32,1.8,cz,.04,1);l(cx-.32,1.8,cz,cx+.32,1.8,cz,.04,1);}
      break;
    }
    case 'pyroblast': { // A rotating furnace iris: eight broad flame petals around a white-hot aperture.
      const e=flight?.7:.6+p*1.5,cy=flight?0:1;
      for(let i=0;i<8;i++){const q=i*TAU/8+t*3;s('flame',Math.sin(q)*e,cy+Math.cos(q)*e,flight?0:Math.sin(p*Math.PI)*.5,.65*(flight?1:fade),.65*(flight?1:fade),1.7*(flight?1:fade),0,0,q,q+.7);}
      if(flight){s('spark',0,0,.3,.8,.8,.35,1);for(let i=0;i<4;i++)s('flame',0,0,-.7-i*.45,.6-i*.1,.6-i*.1,1.2,0,0,0,t*5+i);}
      else s('flame',0,1+Math.sin(p*Math.PI)*1.7,0,1.2*fade,1.2*fade,3*fade,1,t,-Math.PI/2);
      break;
    }
    case 'arcane-barrage': { // Forked dart with three rectangular gates collapsing behind it.
      if(flight){for(let i=0;i<3;i++){const z=-i*.55,d=.3+i*.14;l(-d,-d,z,d,-d,z,.055);l(d,-d,z,d,d,z,.055);l(d,d,z,-d,d,z,.055);l(-d,d,z,-d,-d,z,.055);s('shard',(i-1)*.35,0,.2,.18,.18,1,1);}}
      else for(let i=0;i<3;i++){const d=.35+p*(i+1)*.5,y=.2+i*.45;l(-d,y,-d,d,y,d,.08*fade);l(d,y,-d,-d,y,d,.08*fade,1);}
      break;
    }
    case 'deep-freeze': { // An ice casket closes upward and inward, then breaks apart.
      const cy=flight?0:1,rr=flight?.4:.6+Math.abs(.5-p)*1.6;
      for(let i=0;i<4;i++){const q=i*Math.PI/2;s('shard',Math.sin(q)*rr,cy,Math.cos(q)*rr,.65,.6,(flight?1.2:2.6)*Math.sin(Math.PI*Math.min(.95,p+.08)),0,q,-Math.PI/2);}
      if(!flight){l(-rr,2.2,-rr,rr,2.2,rr,.06*fade,1);l(rr,2.2,-rr,-rr,2.2,rr,.06*fade,1);}
      break;
    }
    case 'arcane-beam': { // Measured geometric accelerator rails surround a straight ray.
      if(flight){for(let i=0;i<4;i++){const z=-i*.65;for(const side of [-1,1]){l(side*.3,-.3,z,side*.3,.3,z,.035);l(side*.3,0,z,side*.3,0,z-.5,.035,1);}}s('rune',0,0,.08,.55,.55,.55,0,0,Math.PI/2,t*3);}
      else for(let i=0;i<3;i++){const d=.3+p*(.4+i*.2),y=.35+i*.6;l(-d,y,0,d,y,0,.055*fade,1);l(0,y,-d,0,y,d,.055*fade);}
      break;
    }
    case 'ice-barrier': { // A faceted igloo, with ribs rooted on the ground and a locked apex.
      for(let i=0;i<6;i++){const q=i*TAU/6,rr=1.1;s('shard',Math.sin(q)*rr,1,Math.cos(q)*rr,.65,.4,2.3*fade,0,q,-Math.PI/2);l(Math.sin(q)*rr,.1,Math.cos(q)*rr,0,2.7*fade+.1,0,.06,1);}s('shard',0,2.5*fade+.1,0,.38,.38,.65,1,0,-Math.PI/2);
      break;
    }
    case 'flamewave': { // Scalloped fire sails sweep outward along the damaging front.
      for(let i=0;i<9;i++){const q=i*TAU/9,rr=r,dy=.5+Math.sin(p*Math.PI)*.6;s('flame',Math.sin(q)*rr,dy,Math.cos(q)*rr,.95*fade,.45,2.5*fade,0,q,-1.2);s('slash',Math.sin(q)*rr,.15,Math.cos(q)*rr,.7*fade,.1,.7*fade,1,q);}
      break;
    }
    case 'blizzard': { // A small storm cloud sheds vertical needles; impact is a fan of hail splashes.
      if(flight){for(let i=0;i<5;i++)s('shard',(i-2)*.27,.55,0,.65,.4,.6,2,t+i);for(let i=0;i<detail(12);i++){const h=.3-((p*3+i*.13)%1)*1.4;s('shard',Math.sin(i*2.4)*.65,h,Math.cos(i*2.4)*.35,.09,.09,.6,1,0,-Math.PI/2);}}
      else for(let i=0;i<10;i++){const x=Math.sin(i*2.4)*(p+ .2),z=Math.cos(i*2.4)*(p+.2);l(x,.08,z,x+.18,.3*fade,z,.06*fade,1);l(x,.08,z,x-.18,.3*fade,z,.06*fade);}
      break;
    }
    case 'ley-renewal': { // Three ley arches feed a vertical stream, opening one after another.
      for(let i=0;i<3;i++){const q=i*TAU/3+t*.8,h=1.1+Math.sin(p*Math.PI)*.8;for(const side of [-1,1])l(Math.sin(q)*side*.8,.1,Math.cos(q)*side*.8,0,h+.8,0,.08,side<0?0:1);s('rune',Math.sin(q)*.85,.16,Math.cos(q)*.85,.32,.32,.32,0,q);}
      for(let i=0;i<detail(9);i++)s('spark',0,((i/9+p*2)%1)*2.6,0,.12,.3,.12,1);
      break;
    }
    case 'glacial-spike': { // A massive triangular drill becomes an erupting glacial wedge.
      if(flight){s('shard',0,0,.1,1.1,1.1,2.8);for(let i=0;i<3;i++){const q=i*TAU/3+t*3;s('shard',Math.sin(q)*.5,Math.cos(q)*.5,-.5,.4,.4,1.5,1,0,0,q);}}
      else {s('shard',0,1.2*Math.sin(p*Math.PI),0,1.25*fade,1.25*fade,3.5*Math.sin(p*Math.PI),0,0,-Math.PI/2);for(const side of [-1,1])s('shard',side*.7,.55,0,.65*fade,.65*fade,1.8*fade,1,0,-1.1,side*.3);}
      break;
    }
    case 'comet-shower': { // Three trailing comets in an asymmetric constellation.
      for(let i=0;i<3;i++){const x=(i-1)*.6,y=flight?(i%2)*.55:.3+Math.sin(p*Math.PI+i*.4)*1.2,z=flight?-i*.55:Math.sin(i*2)*p*1.5;s('shard',x,y,z,.48*(flight?1:fade),.48*(flight?1:fade),.9*(flight?1:fade),1,t+i);if(flight)l(x,y,z-.3,x+.1,y+.1,z-1.7,.1,0);else arc(x,.12,z,.3+p*.7,0,Math.PI*1.6,.045*fade);}
      break;
    }
    case 'prismatic-guard': { // A rotating triangular prism, deliberately unlike an orb or shield ring.
      for(let i=0;i<3;i++){const q=i*TAU/3+t*.5,b=q+TAU/3,x=Math.sin(q)*1.2,z=Math.cos(q)*1.2;l(x,.15,z,x,2.5,z,.08,i+3);for(const y of [.15,2.5])l(x,y,z,Math.sin(b)*1.2,y,Math.cos(b)*1.2,.065,i+3);s('shard',x,1.3,z,.45,.45,1.6,1,q,-Math.PI/2);}
      break;
    }
    case 'chain-lightning': { // Forking lightning at the leading contact; the backbone follows real travel.
      const cy=flight?0:1;for(let i=0;i<5;i++){const q=i*TAU/5+t*3,e=flight?.9:.4+p*1.7,x=Math.cos(q)*e,y=cy+Math.sin(q)*e;l(0,cy,0,x*.45,y+.2,.12,.06,1);l(x*.45,y+.2,.12,x,y,0,.055,0);l(x*.45,y+.2,.12,x*.9,y+.35,.3,.035,1);}
      break;
    }
    case 'flash-freeze': { // A snapping frost iris contracts onto the caster before flinging short plates outward.
      for(let i=0;i<8;i++){const q=i*TAU/8,rr=r;s('shard',Math.sin(q)*rr,.45,Math.cos(q)*rr,.6*fade,.25,1.25*fade,1,q,-Math.PI/2);l(Math.sin(q)*rr,.1,Math.cos(q)*rr,Math.sin(q+.3)*rr*.8,.6*fade,Math.cos(q+.3)*rr*.8,.07*fade);}
      break;
    }
    case 'inferno-beam': { // A twisting blowtorch jet, widening into a vertical fan of flame at contact.
      for(let i=0;i<detail(18);i++){const q=i*.85+t*10,z=flight?-i*.16:0,rr=flight?.12+i*.014:p*.8,x=Math.sin(q)*rr,y=flight?Math.cos(q)*rr:.3+i*.1;s('flame',x,y,z,.3*fade+.12,.25,flight?.65:1.1*fade,i%4===0?1:0,flight?0:q,flight?0:-Math.PI/2,q);}
      break;
    }
    case 'blinkward': { // Two standing doorways trade brightness as a broken silhouette flickers between them.
      for(const side of [-1,1]){const x=side*(.65+p*.5),lit=Math.sin(t*16)*side>0?1:0;arc(x,1.2,0,.8,0,Math.PI*2,.06,lit,Math.PI/2);l(x-.55,.25,0,x-.55,2.1,0,.07,lit);l(x+.55,.25,0,x+.55,2.1,0,.07,lit);}
      for(let i=0;i<5;i++)s('shard',Math.sin(t*17+i)*.3,.4+i*.36,0,.22,.22,.4,1,0,t);
      break;
    }
    case 'starfire': { // A six-pointed luminous star turns edge-on, then blossoms into a six-ray supernova.
      const cy=flight?0:1,e=flight?.8:.35+p*1.8;for(let i=0;i<6;i++){const q=i*TAU/6+t*1.3,b=q+Math.PI;l(Math.sin(q)*.2,cy+Math.cos(q)*.2,0,Math.sin(q)*e,cy+Math.cos(q)*e,0,.1*(flight?1:fade),1);s('flame',Math.sin(q)*e,cy+Math.cos(q)*e,0,.28,.28,.8*(flight?1:fade),0,0,b);}
      if(flight)s('rune',0,0,0,.5,.5,.5,0,t,Math.PI/2);
      break;
    }
    case 'winterstorm': { // Three tall counter-rotating ice sickles enclose a hollow cyclone.
      const cy=flight?0:1;for(let j=0;j<3;j++){const q=j*TAU/3+t*(j%2?3:-3),rr=flight?.65:.65+p*.7;s('slash',Math.sin(q)*rr,cy+(j-1)*.45,Math.cos(q)*rr,.9*(flight?1:fade),.25,1.2*(flight?1:fade),0,q,Math.PI/2);for(let i=0;i<3;i++)s('shard',Math.sin(q+i*.3)*rr,cy-.6+i*.6,Math.cos(q+i*.3)*rr,.13,.13,.65,1,q,-Math.PI/2);}
      break;
    }
    case 'arcane-tempest': { // Twisting square frames rise along an expanding ground vortex.
      for(let j=0;j<3;j++){const d=r*(.4+j*.25),y=.2+j*.55,q=t*(j%2?2:-2);for(let i=0;i<4;i++){const b=i*Math.PI/2+q,c=b+Math.PI/2;l(Math.sin(b)*d,y,Math.cos(b)*d,Math.sin(c)*d,y,Math.cos(c)*d,.075*fade,j%2);}}
      break;
    }
    case 'aegis-of-the-archmage': { // A five-sided rune tower crowned by a hovering crystal.
      for(let i=0;i<5;i++){const q=i*TAU/5,rr=1.15,x=Math.sin(q)*rr,z=Math.cos(q)*rr;l(x,.1,z,x,2.2,z,.055,1);s('rune',x,1.4,z,.48,.48,.48,0,q,Math.PI/2);l(x,2.2,z,0,2.9,0,.055,0);}s('shard',0,2.85+Math.sin(t*4)*.12,0,.55,.55,.85,1,t,-Math.PI/2);
      break;
    }
    case 'arcane-volley': { // Each accepted missile is a kite with seven narrow prism vanes.
      const cy=flight?0:1;for(let i=0;i<7;i++){const q=i*TAU/7+t*4,rr=flight?.45:.3+p*1.2;s('shard',Math.sin(q)*rr,cy+Math.cos(q)*rr,flight?-.2:0,.16,.16,(flight?.75:1.2)* (flight?1:fade),i%2,q,flight?0:Math.PI/2);}
      if(flight){l(-.5,0,-.2,0,0,.9,.06,1);l(.5,0,-.2,0,0,.9,.06,1);l(0,.5,-.2,0,0,.9,.06);}
      break;
    }
    case 'combustion': { // A compressed pyre behind crossed bands ruptures into a towering fire column.
      if(flight){for(let i=0;i<3;i++)arc(0,0,0,.65+.08*Math.sin(t*14),0,TAU,.075,i%2,i*Math.PI/3);s('flame',0,0,0,1.1,1.1,1.3,1,0,0,t*5);for(let i=0;i<4;i++)s('flame',Math.sin(i*1.7)*.2,Math.cos(i*1.7)*.2,-.6-i*.3,.3,.3,.8);}
      else {const h=Math.sin(p*Math.PI)*3.7;s('flame',0,h*.5,0,1.1*fade,1.1*fade,h+.01,1,t,-Math.PI/2);for(let i=0;i<6;i++){const q=i*TAU/6,rr=.3+p*1.5;s('flame',Math.sin(q)*rr,.8+Math.sin(p*Math.PI),Math.cos(q)*rr,.5*fade,.5*fade,2.2*fade,0,q,-Math.PI/2);}}
      break;
    }
    case 'shatter': { // A broken frost shell bursts apart in three discrete bands.
      for(let j=0;j<3;j++)for(let i=0;i<8;i++){const q=i*TAU/8+j*.3,rr=(.45+p*1.6)*Math.sin((j+1)*Math.PI/4);s('shard',Math.sin(q)*rr,.45+j*.55+p*(j-1)*.4,Math.cos(q)*rr,.32*fade,.3*fade,.7*fade,j%2,q,p*4+i);}
      break;
    }
    default:return false;
  }
  return true;
}
