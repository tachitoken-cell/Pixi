const scrollRefresh = new WeakMap<HTMLElement, (render: () => void) => boolean>();

// Replacing a scrollport interrupts Android/WebKit's native swipe and momentum.
// Keep accepting state immediately; repaint its latest value after the gesture.
export function deferTouchRender(root: HTMLElement, render: () => void) {
  let defer = scrollRefresh.get(root);
  if (!defer) {
    let targets: Node[] = [], quietAt = 0, timer = 0, pending: (() => void) | undefined;
    const touching = () => targets.some(target => root.contains(target));
    const resume = () => {
      window.clearTimeout(timer);
      if (!pending || touching()) return;
      timer = window.setTimeout(() => {
        const work = pending; pending = undefined;
        work?.();
      }, Math.max(0, quietAt - performance.now()));
    };
    root.addEventListener('touchstart', event => { targets = [...event.touches].map(touch => touch.target as Node).filter(target => root.contains(target)); window.clearTimeout(timer); }, { passive: true, capture: true });
    for (const type of ['touchend', 'touchcancel']) window.addEventListener(type, event => {
      targets = [...(event as TouchEvent).touches].map(touch => touch.target as Node).filter(target => root.contains(target));
      resume();
    }, { passive: true, capture: true });
    root.addEventListener('scroll', () => { quietAt = performance.now() + 120; resume(); }, { passive: true, capture: true });
    for (const type of ['blur', 'pagehide']) window.addEventListener(type, () => { targets = []; resume(); });
    defer = work => {
      if (!touching() && performance.now() >= quietAt) { pending = undefined; window.clearTimeout(timer); return false; }
      pending = work; resume(); return true;
    };
    scrollRefresh.set(root, defer);
  }
  return defer(render);
}
