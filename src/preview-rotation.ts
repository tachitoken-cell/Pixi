// A tap keeps the existing stepped rotation; holding smoothly turns the preview.
export function bindPreviewRotation(button: HTMLButtonElement, turn: (radians: number) => void, active: () => boolean) {
  let pointer: number | undefined, frame = 0, started = 0, last = 0, turned = false, ignoreClickUntil = 0;
  const stop = () => {
    if (turned) ignoreClickUntil = performance.now() + 500;
    pointer = undefined; turned = false; cancelAnimationFrame(frame); frame = 0;
  };
  const tick = (now: number) => {
    if (pointer === undefined || button.disabled || !active() || document.hidden) { stop(); return; }
    if (now - started >= 160) { turn(Math.min((now - last) / 1000, .05) * Math.PI); turned = true; }
    last = now; frame = requestAnimationFrame(tick);
  };
  button.style.touchAction = 'none';
  button.addEventListener('pointerdown', event => {
    if (event.button !== 0 || pointer !== undefined || button.disabled || !active()) return;
    event.preventDefault(); pointer = event.pointerId; turned = false; ignoreClickUntil = 0;
    started = last = performance.now(); button.setPointerCapture(pointer); frame = requestAnimationFrame(tick);
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(type, event => {
    if ((event as PointerEvent).pointerId === pointer) stop();
  });
  button.addEventListener('click', event => {
    if (turned || performance.now() < ignoreClickUntil) { event.preventDefault(); event.stopImmediatePropagation(); }
  }, true);
  button.addEventListener('keydown', () => { ignoreClickUntil = 0; });
  window.addEventListener('blur', stop);
  window.addEventListener('pagehide', stop);
  document.addEventListener('visibilitychange', stop);
}

export function bindPreviewDrag(canvas: HTMLCanvasElement, turn: (radians: number) => void, active: () => boolean) {
  let pointer: number | undefined, x = 0;
  const stop = () => { pointer = undefined; };
  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0 || pointer !== undefined || !active()) return;
    event.preventDefault(); pointer = event.pointerId; x = event.clientX; canvas.setPointerCapture(pointer);
  });
  canvas.addEventListener('pointermove', event => {
    if (event.pointerId !== pointer) return;
    if (!active() || document.hidden) { stop(); return; }
    turn((event.clientX - x) * .012); x = event.clientX;
  });
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(type, event => {
    if ((event as PointerEvent).pointerId === pointer) stop();
  });
  window.addEventListener('blur', stop);
  window.addEventListener('pagehide', stop);
  document.addEventListener('visibilitychange', stop);
}
