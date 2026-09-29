/** Keep desktop talent details beside the cursor, above the scrolling panel. */
export function mountTalentHover(content: HTMLElement) {
  const desktop = matchMedia('(any-hover: hover) and (any-pointer: fine)');
  let tooltip: HTMLElement | null = null;
  let pointer: { x: number; y: number } | null = null;
  const nodeAt = (target: EventTarget | null) => target instanceof Element && content.contains(target) ? target.closest<HTMLElement>('.talent-node') : null;
  const hide = () => {
    if (tooltip?.matches(':popover-open')) tooltip.hidePopover();
    tooltip?.removeAttribute('popover');
    if (tooltip) { tooltip.style.left = ''; tooltip.style.top = ''; }
    tooltip = null;
  };
  const show = (node: HTMLElement | null) => {
    if (!desktop.matches || !content.classList.contains('talent-cursor-tooltips') || !node) { hide(); return; }
    const detail = node.querySelector<HTMLElement>('.talent-node-detail');
    if (!detail) { hide(); return; }
    if (tooltip !== detail) {
      hide(); tooltip = detail; tooltip.setAttribute('popover', 'manual'); tooltip.showPopover();
    }
    const anchor = node.getBoundingClientRect(), box = detail.getBoundingClientRect();
    const x = pointer?.x ?? anchor.right, y = pointer?.y ?? anchor.top;
    const left = x + 16 + box.width <= innerWidth - 10 ? x + 16 : x - box.width - 16;
    const top = y + 16 + box.height <= innerHeight - 10 ? y + 16 : y - box.height - 16;
    detail.style.left = `${Math.max(10, Math.min(left, innerWidth - box.width - 10))}px`;
    detail.style.top = `${Math.max(10, Math.min(top, innerHeight - box.height - 10))}px`;
  };
  const refresh = () => show(nodeAt(pointer ? document.elementFromPoint(pointer.x, pointer.y) : document.activeElement));
  const move = (event: PointerEvent) => {
    content.classList.toggle('talent-cursor-tooltips', desktop.matches && event.pointerType !== 'touch');
    if (event.pointerType === 'touch') { reset(); return; }
    pointer = { x: event.clientX, y: event.clientY };
    show(nodeAt(event.target));
  };
  const reset = () => { pointer = null; hide(); };
  content.addEventListener('pointerover', move);
  content.addEventListener('pointermove', move);
  content.addEventListener('pointerleave', reset);
  content.addEventListener('focusin', event => show(nodeAt(event.target)));
  content.addEventListener('focusout', event => { if (!pointer) show(nodeAt(event.relatedTarget)); });
  document.addEventListener('keydown', event => {
    if (event.key === 'Tab') { pointer = null; content.classList.toggle('talent-cursor-tooltips', desktop.matches); }
    if (event.key === 'Escape') reset();
  });
  document.addEventListener('scroll', reset, true);
  window.addEventListener('resize', reset);
  window.addEventListener('blur', reset);
  content.closest('dialog')?.addEventListener('close', reset);
  const configure = () => { reset(); content.classList.toggle('talent-cursor-tooltips', desktop.matches); };
  desktop.addEventListener('change', configure);
  configure();
  return refresh;
}
