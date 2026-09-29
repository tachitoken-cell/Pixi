export function initControlMode() {
  const installed = matchMedia('(display-mode: standalone)');
  const touch = matchMedia('(pointer: coarse), (max-width: 800px)');
  const update = () => document.body.classList.toggle('mobile-controls', installed.matches || touch.matches || 'ReactNativeWebView' in window || (window as Window & { __MOSSVALE_NATIVE__?: boolean }).__MOSSVALE_NATIVE__ === true || (navigator as Navigator & { standalone?: boolean }).standalone === true);
  installed.addEventListener('change', update);
  touch.addEventListener('change', update);
  window.addEventListener('pageshow', update);
  const resetZoom = document.createElement('button');
  resetZoom.id = 'mobile-reset-zoom'; resetZoom.type = 'button'; resetZoom.textContent = 'Reset interface zoom'; resetZoom.hidden = true;
  resetZoom.onclick = () => {
    const meta = document.querySelector<HTMLMetaElement>('meta[name="viewport"]');
    if (!meta || resetZoom.disabled) return;
    const original = meta.content;
    // Only an explicit request resets page magnification. Restore reading zoom
    // immediately afterwards; never reload or change the game's camera distance.
    resetZoom.disabled = true;
    meta.content = `${original}, maximum-scale=1`;
    setTimeout(() => { meta.content = original; resetZoom.disabled = false; }, 100);
  };
  document.body.append(resetZoom);
  const viewport = () => {
    const view = window.visualViewport;
    for (const [name, value] of Object.entries({ vh: view?.height ?? window.innerHeight, vw: view?.width ?? window.innerWidth, vtop: view?.offsetTop ?? 0, vleft: view?.offsetLeft ?? 0 })) document.body.style.setProperty(`--mobile-${name}`, `${value}px`);
    document.body.style.setProperty('--mobile-inverse-scale', `${1 / (view?.scale || 1)}`);
    resetZoom.hidden = !view || view.scale <= 1.01;
  };
  window.addEventListener('resize', viewport);
  window.visualViewport?.addEventListener('resize', viewport);
  window.visualViewport?.addEventListener('scroll', viewport);
  viewport(); update();
}

export function bindJoystick(button: HTMLElement, keys: Set<string>, canMove: () => boolean, beforeMove: () => void) {
  const movement = { x: 0, y: 0 };
  let pointer: number | null = null;
  function reset() {
    pointer = null;
    movement.x = movement.y = 0;
    keys.delete('touch-move');
    button.style.setProperty('--stick-x', '0px');
    button.style.setProperty('--stick-y', '0px');
    button.classList.remove('is-held');
  }
  function move(event: PointerEvent) {
    if (event.pointerId !== pointer) return;
    if (!canMove()) { reset(); return; }
    const rect = button.getBoundingClientRect(), radius = rect.width * .3;
    const x = event.clientX - rect.left - rect.width / 2, y = event.clientY - rect.top - rect.height / 2;
    const length = Math.hypot(x, y), scale = Math.max(radius, length);
    movement.x = length < radius * .12 ? 0 : x / scale;
    movement.y = length < radius * .12 ? 0 : y / scale;
    if (movement.x || movement.y) { beforeMove(); keys.add('touch-move'); } else keys.delete('touch-move');
    button.style.setProperty('--stick-x', `${movement.x * radius}px`);
    button.style.setProperty('--stick-y', `${movement.y * radius}px`);
  }
  button.addEventListener('pointerdown', event => {
    if (event.button !== 0 || pointer !== null || !canMove()) return;
    event.preventDefault(); pointer = event.pointerId;
    button.setPointerCapture(pointer); button.classList.add('is-held'); move(event);
  });
  button.addEventListener('pointermove', move);
  const release = (event: Event) => { if ((event as PointerEvent).pointerId === pointer) reset(); };
  for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
    button.addEventListener(type, release);
    window.addEventListener(type, release, true);
  }
  // A WebView can lose pointer capture during multi-touch or rotation.
  for (const type of ['touchend', 'touchcancel']) window.addEventListener(type, event => {
    if (pointer !== null && ![...(event as TouchEvent).touches].some(touch => button.contains(touch.target as Node))) reset();
  }, { capture: true, passive: true });
  window.addEventListener('orientationchange', reset);
  window.addEventListener('blur', reset);
  window.addEventListener('pagehide', reset);
  window.addEventListener('mobile-ui-open', reset);
  document.addEventListener('visibilitychange', reset);
  return movement;
}

// Browsers can omit clicks while another finger holds the joystick. Route each
// completed HUD tap through its existing click action, once, for every finger.
export function bindTouchActions(root: HTMLElement) {
  const touches = new Map<number, { button: HTMLElement; target: Element; x: number; y: number; top: number; left: number }>();
  let handled: { x: number; y: number; at: number }[] = [];
  const buttonAt = (target: EventTarget | null) => target instanceof Element ? target.closest<HTMLElement>('button, summary') : null;
  // WKWebView can double-tap zoom controls despite touch-action and cancelled
  // pointer events. Cancel its touch default; the pointer handler still clicks once.
  root.addEventListener('touchend', event => {
    if ([...event.changedTouches].some(touch => {
      const button = buttonAt(touch.target);
      return button && (button.closest('#mobile-actions, #hotbar, #mobile-tools, #mobile-move') || handled.some(tap => performance.now() - tap.at <= 800 && Math.hypot(touch.clientX - tap.x, touch.clientY - tap.y) <= 12));
    })) event.preventDefault();
  }, { passive: false });
  root.addEventListener('pointerdown', event => {
    if (event.pointerType !== 'touch' || event.button !== 0) return;
    // A new press is intentional, including native links and form controls.
    handled = handled.filter(tap => Math.hypot(event.clientX - tap.x, event.clientY - tap.y) > 12);
    const button = buttonAt(event.target);
    if (!button || button.matches(':disabled') || button.closest('#mobile-joystick, [data-key], #chat-resize')) return;
    const { top, left } = button.getBoundingClientRect();
    touches.set(event.pointerId, { button, target: event.target as Element, x: event.clientX, y: event.clientY, top, left });
    event.preventDefault();
  }, true);
  root.addEventListener('pointermove', event => {
    const touch = touches.get(event.pointerId);
    if (touch && Math.hypot(event.clientX - touch.x, event.clientY - touch.y) > 12) touches.delete(event.pointerId);
  }, true);
  root.addEventListener('scroll', event => {
    for (const [id, touch] of touches) if (event.target instanceof Element && event.target.contains(touch.button)) touches.delete(id);
  }, { capture: true, passive: true });
  root.addEventListener('pointerup', event => {
    const touch = touches.get(event.pointerId); touches.delete(event.pointerId);
    if (!touch) return;
    const { button } = touch, rect = button.getBoundingClientRect();
    if (!button.isConnected || !button.contains(touch.target) || button.matches(':disabled') || button.closest('[hidden], [inert]') || Math.hypot(event.clientX - touch.x, event.clientY - touch.y) > 12 || Math.abs(rect.top - touch.top) > 1 || Math.abs(rect.left - touch.left) > 1
      || event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) return;
    event.preventDefault();
    const now = performance.now();
    // A tap can replace its button (pagination) or reveal another control beneath it.
    // Match the browser's follow-up click to the tap, not to a disposable DOM node.
    handled = handled.filter(tap => now - tap.at <= 800);
    handled.push({ x: event.clientX, y: event.clientY, at: now });
    touch.target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window,
      clientX: event.clientX, clientY: event.clientY, shiftKey: event.shiftKey, ctrlKey: event.ctrlKey, altKey: event.altKey, metaKey: event.metaKey }));
  }, true);
  root.addEventListener('click', event => {
    const pointer = event as PointerEvent;
    if (!event.detail || pointer.pointerType && pointer.pointerType !== 'touch' || !handled.some(tap => performance.now() - tap.at <= 800 && Math.hypot(event.clientX - tap.x, event.clientY - tap.y) <= 12)) return;
    event.preventDefault(); event.stopImmediatePropagation();
  }, true);
  for (const type of ['pointercancel', 'lostpointercapture']) root.addEventListener(type, event => touches.delete((event as PointerEvent).pointerId), true);
  for (const type of ['blur', 'pagehide', 'mobile-ui-open']) window.addEventListener(type, () => touches.clear());
  document.addEventListener('visibilitychange', () => touches.clear());
}

// Touch has its own pointer set so a second finger can zoom without selecting a target.
export function bindTouchCamera(canvas: HTMLElement, options: { enabled: () => boolean; orbit: (x: number, y: number) => void; zoom: (ratio: number) => void; select: (x: number, y: number) => void; jump: () => void }) {
  const points = new Map<number, { x: number; y: number }>();
  let moved = false, travel = 0, pressedAt = 0;
  let lastTap: { x: number; y: number; time: number } | null = null;
  const gap = () => { const [a, b] = [...points.values()]; return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0; };
  const reset = () => { points.clear(); moved = false; travel = 0; lastTap = null; };
  for (const type of ['pointerdown', 'pointermove', 'pointerup', 'pointercancel', 'lostpointercapture']) canvas.addEventListener(type, raw => {
    const event = raw as PointerEvent;
    if (event.pointerType !== 'touch') return;
    event.stopImmediatePropagation();
    if (!options.enabled()) { reset(); return; }
    if (type === 'pointerdown') {
      if (!points.size) { moved = false; travel = 0; pressedAt = event.timeStamp; }
      points.set(event.pointerId, { x: event.clientX, y: event.clientY });
      if (points.size > 1) { moved = true; lastTap = null; }
      canvas.setPointerCapture(event.pointerId); canvas.focus({ preventScroll: true });
    } else if (type === 'pointermove') {
      const previous = points.get(event.pointerId); if (!previous) return;
      const before = gap(), dx = event.clientX - previous.x, dy = event.clientY - previous.y;
      points.set(event.pointerId, { x: event.clientX, y: event.clientY });
      travel += Math.hypot(dx, dy); if (travel >= 6) { moved = true; lastTap = null; }
      if (points.size === 1) options.orbit(dx, dy);
      else { const after = gap(); if (before && after) options.zoom(before / after); }
    } else {
      if (!points.has(event.pointerId)) return;
      if (type === 'pointerup' && points.size === 1 && !moved) {
        const quick = event.timeStamp - pressedAt <= 300;
        if (quick && lastTap && event.timeStamp - lastTap.time <= 300 && Math.hypot(event.clientX - lastTap.x, event.clientY - lastTap.y) <= 32) {
          lastTap = null; options.jump();
        } else {
          lastTap = quick ? { x: event.clientX, y: event.clientY, time: event.timeStamp } : null;
          options.select(event.clientX, event.clientY);
        }
      } else { moved = true; lastTap = null; }
      points.delete(event.pointerId);
    }
  }, { capture: true });
  window.addEventListener('blur', reset);
  window.addEventListener('pagehide', reset);
  window.addEventListener('mobile-ui-open', reset);
  document.addEventListener('visibilitychange', reset);
}
