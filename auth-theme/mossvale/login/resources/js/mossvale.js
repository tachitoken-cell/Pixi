/* Decoration only: native Keycloak forms work if WebGL or this script fails. */
(() => {
 const source = document.currentScript;
 if (!source?.src) return;
 const resources = new URL('../', source.src);
 function start() {
  if (document.documentElement.classList.contains('mossvale-embedded')) return;
  const canvas = document.createElement('canvas');
  canvas.id = 'mossvale-login-scene';
  canvas.setAttribute('aria-hidden', 'true');
  document.body.prepend(canvas);
  import(new URL('js/login-scene.js', resources).href).then(({createLoginScene}) => {
   const scene = createLoginScene(canvas, resources.href.replace(/\/$/, ''));
   scene.start();
   window.addEventListener('pagehide', event => event.persisted ? scene.stop() : scene.dispose());
   window.addEventListener('pageshow', () => scene.start());
  }).catch(() => { canvas.remove(); });
 }
 if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, {once:true});
 else start();
})();
