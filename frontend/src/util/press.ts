// Tap vs. long press on one element, for touch and mouse alike.
//
// - tap: short press without moving
// - long press: held for LONG_PRESS_MS, or a right click / context menu
// On touch devices the browser also fires `contextmenu` after a long press;
// that must not open the control a second time.

export const LONG_PRESS_MS = 450;
const MOVE_TOLERANCE_PX = 10;

export interface PressHandlers {
  onTap: () => void;
  onLongPress: () => void;
}

export function attachPress(el: HTMLElement, handlers: PressHandlers): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let longFired = false;
  let start: { x: number; y: number } | undefined;

  const cancel = () => {
    clearTimeout(timer);
    timer = undefined;
    start = undefined;
    el.removeAttribute("pressed");
  };

  const onPointerDown = (ev: PointerEvent) => {
    longFired = false;
    if (ev.button !== 0) return;
    start = { x: ev.clientX, y: ev.clientY };
    el.setAttribute("pressed", "");
    timer = setTimeout(() => {
      longFired = true;
      cancel();
      navigator.vibrate?.(10);
      handlers.onLongPress();
    }, LONG_PRESS_MS);
  };
  const onPointerMove = (ev: PointerEvent) => {
    if (start && Math.hypot(ev.clientX - start.x, ev.clientY - start.y) > MOVE_TOLERANCE_PX) cancel();
  };
  const onClick = (ev: MouseEvent) => {
    if (longFired) {
      ev.preventDefault();
      return;
    }
    handlers.onTap();
  };
  const onContextMenu = (ev: MouseEvent) => {
    ev.preventDefault();
    cancel();
    if (!longFired) handlers.onLongPress();
  };

  const listeners: Array<[string, EventListener]> = [
    ["pointerdown", onPointerDown as EventListener],
    ["pointermove", onPointerMove as EventListener],
    ["pointerup", cancel],
    ["pointercancel", cancel],
    ["pointerleave", cancel],
    ["click", onClick as EventListener],
    ["contextmenu", onContextMenu as EventListener],
  ];
  listeners.forEach(([type, fn]) => el.addEventListener(type, fn));
  return () => listeners.forEach(([type, fn]) => el.removeEventListener(type, fn));
}
