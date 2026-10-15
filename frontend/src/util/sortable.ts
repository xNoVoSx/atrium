// Drag to reorder the items of a grid, with mouse or finger.
//
// Items are the container's children with a `data-sort-id`. A drag starts on
// mouse down + move, or for touch after holding still for HOLD_MS (so normal
// scrolling keeps working). While dragging, the list order is updated live
// (the host re-renders with the preview order) and the dragged item follows
// the pointer; on release the final order is reported.

export const HOLD_MS = 300;
const MOVE_START_PX = 6;

export interface SortableOptions {
  /** The grid that holds the items (its children carry data-sort-id). */
  container: () => HTMLElement | null;
  enabled: () => boolean;
  /** Current order shown. */
  order: () => string[];
  /** Preview while dragging; the host re-renders with it. */
  onPreview: (ids: string[]) => void;
  /** Final order after the drop (not called when nothing moved). */
  onDrop: (ids: string[]) => void;
}

interface Drag {
  id: string;
  el: HTMLElement;
  pointerId: number;
  offsetX: number;
  offsetY: number;
  startX: number;
  startY: number;
  active: boolean;
  initial: string[];
  hold?: ReturnType<typeof setTimeout>;
}

export function attachSortable(root: HTMLElement | ShadowRoot, opts: SortableOptions): () => void {
  let drag: Drag | null = null;

  const itemOf = (ev: PointerEvent): HTMLElement | null => {
    const container = opts.container();
    if (!container) return null;
    for (const node of ev.composedPath()) {
      if (node instanceof HTMLElement && node.parentElement === container && node.dataset.sortId) return node;
      if (node === container) break;
    }
    return null;
  };

  // Ignore the small edit buttons on a tile (star, hide).
  const onEditButton = (ev: PointerEvent) =>
    ev.composedPath().some((n) => n instanceof HTMLElement && n.classList.contains("edit-action"));

  const place = (ev: PointerEvent) => {
    if (!drag) return;
    const container = opts.container();
    if (!container) return;
    const box = container.getBoundingClientRect();
    const x = ev.clientX - box.left - drag.offsetX - drag.el.offsetLeft;
    const y = ev.clientY - box.top - drag.offsetY - drag.el.offsetTop;
    drag.el.style.transform = `translate(${x}px, ${y}px)`;
  };

  const start = (d: Drag) => {
    d.active = true;
    d.el.classList.add("dragging");
    navigator.vibrate?.(10);
  };

  const onDown = (ev: PointerEvent) => {
    if (!opts.enabled() || ev.button !== 0 || onEditButton(ev)) return;
    const el = itemOf(ev);
    const container = opts.container();
    if (!el || !container || !el.dataset.sortId) return;
    const box = container.getBoundingClientRect();
    drag = {
      id: el.dataset.sortId,
      el,
      pointerId: ev.pointerId,
      offsetX: ev.clientX - box.left - el.offsetLeft,
      offsetY: ev.clientY - box.top - el.offsetTop,
      startX: ev.clientX,
      startY: ev.clientY,
      active: false,
      initial: opts.order(),
    };
    if (ev.pointerType === "touch") {
      const d = drag;
      d.hold = setTimeout(() => {
        if (drag === d) {
          start(d);
          d.el.setPointerCapture?.(d.pointerId);
        }
      }, HOLD_MS);
    }
  };

  const onMove = (ev: PointerEvent) => {
    if (!drag || ev.pointerId !== drag.pointerId) return;
    const moved = Math.hypot(ev.clientX - drag.startX, ev.clientY - drag.startY);
    if (!drag.active) {
      if (moved < MOVE_START_PX) return;
      if (ev.pointerType === "touch") {
        // Moved before the hold finished: that is scrolling, not dragging.
        clearTimeout(drag.hold);
        drag = null;
        return;
      }
      start(drag);
      drag.el.setPointerCapture?.(drag.pointerId);
    }
    ev.preventDefault();
    const container = opts.container();
    if (!container) return;
    // Which item is under the pointer? Move the dragged one to its place.
    const over = [...container.children].find((child) => {
      if (!(child instanceof HTMLElement) || child === drag?.el || !child.dataset.sortId) return false;
      const r = child.getBoundingClientRect();
      return ev.clientX >= r.left && ev.clientX <= r.right && ev.clientY >= r.top && ev.clientY <= r.bottom;
    }) as HTMLElement | undefined;
    if (over?.dataset.sortId) {
      const order = opts.order().filter((id) => id !== drag?.id);
      order.splice(order.indexOf(over.dataset.sortId) + (isAfter(ev, over) ? 1 : 0), 0, drag.id);
      if (order.join() !== opts.order().join()) opts.onPreview(order);
    }
    place(ev);
  };

  const isAfter = (ev: PointerEvent, el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    return ev.clientX > r.left + r.width / 2;
  };

  const onUp = () => {
    if (!drag) return;
    clearTimeout(drag.hold);
    const d = drag;
    drag = null;
    if (!d.active) return;
    d.el.classList.remove("dragging");
    d.el.style.removeProperty("transform");
    const final = opts.order();
    if (final.join() !== d.initial.join()) opts.onDrop(final);
  };

  // In edit mode a click on a tile must not act on it (toggle a light);
  // the edit buttons (star, hide) still work.
  const onClick = (ev: MouseEvent) => {
    const onAction = ev
      .composedPath()
      .some((n) => n instanceof HTMLElement && n.classList.contains("edit-action"));
    if (opts.enabled() && !onAction) {
      ev.stopPropagation();
      ev.preventDefault();
    }
  };

  const listeners: Array<[string, EventListener, AddEventListenerOptions?]> = [
    ["pointerdown", onDown as EventListener],
    ["pointermove", onMove as EventListener, { passive: false }],
    ["pointerup", onUp],
    ["pointercancel", onUp],
    ["click", onClick as EventListener, { capture: true }],
  ];
  listeners.forEach(([type, fn, o]) => root.addEventListener(type, fn, o));
  return () => listeners.forEach(([type, fn, o]) => root.removeEventListener(type, fn, o));
}
