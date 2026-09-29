/* Server-rendered Keycloak forms remain responsible for every credential and validation. */
(() => {
 const source = document.currentScript;
 if (!source?.src || window.parent === window) return;
 const origin = new URL(source.src).searchParams.get('parent');
 if (!origin) return;
 let parent;
 try { parent = new URL(origin); } catch { return; }
 const game = ['https://mossvale.world', 'https://us.mossvale.world', 'https://asia.mossvale.world'].includes(origin);
 const local = parent.protocol === 'http:' && parent.port && ['localhost', '127.0.0.1', '[::1]'].includes(parent.hostname)
   && location.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(location.hostname);
 if (parent.origin !== origin || (!game && !local)) return;
 document.documentElement.classList.add('mossvale-embedded');
 function start() {
  // A cached or failed stylesheet must never reveal the full provider page inside the game.
  if (getComputedStyle(document.documentElement).getPropertyValue('--mossvale-embedded-layout').trim() !== 'compact-v1') return;
  const content = document.querySelector('.login-pf-page');
  if (!content) return;
  let lastHeight = -1;
  const resize = () => {
   const height = Math.ceil(content.getBoundingClientRect().height);
   if (height === lastHeight) return;
   lastHeight = height;
   window.parent.postMessage({ type: 'mossvale:auth-frame', ready: true, layout: 'compact-v1', height }, origin);
  };
  resize();
  const observer = new ResizeObserver(resize);
  observer.observe(content);
  window.addEventListener('pagehide', () => observer.disconnect(), { once: true });
 }
 if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
 else start();
})();
