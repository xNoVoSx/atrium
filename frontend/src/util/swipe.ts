// Horizontal swipe on an element (room to room). Vertical scrolling stays
// untouched: the gesture only counts when it is clearly sideways.

export const SWIPE_MIN_PX = 60;

export interface SwipeHandlers {
  onLeft: () => void;
  onRight: () => void;
  /** Return false to ignore a gesture, e.g. while a sheet is open. */
  enabled?: () => boolean;
}

/** Touches that start on these never count (sliders, horizontally scrolling rows). */
const IGNORE = (el: EventTarget) =>
  el instanceof HTMLElement &&
  (el.tagName === "INPUT" || el.classList.contains("slider") || el.classList.contains("zones"));

export function attachSwipe(el: HTMLElement, handlers: SwipeHandlers): () => void {
  let start: { x: number; y: number; t: number } | null = null;

  const onStart = (ev: TouchEvent) => {
    const touch = ev.touches[0];
    if (ev.touches.length !== 1 || !touch || handlers.enabled?.() === false) return;
    if (ev.composedPath().some(IGNORE)) return;
    start = { x: touch.clientX, y: touch.clientY, t: Date.now() };
  };

  const onEnd = (ev: TouchEvent) => {
    const touch = ev.changedTouches[0];
    if (!start || !touch) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    const quick = Date.now() - start.t < 800;
    start = null;
    if (!quick || Math.abs(dx) < SWIPE_MIN_PX || Math.abs(dx) < Math.abs(dy) * 1.8) return;
    if (dx < 0) handlers.onLeft();
    else handlers.onRight();
  };

  const onCancel = () => (start = null);

  el.addEventListener("touchstart", onStart, { passive: true });
  el.addEventListener("touchend", onEnd);
  el.addEventListener("touchcancel", onCancel);
  return () => {
    el.removeEventListener("touchstart", onStart);
    el.removeEventListener("touchend", onEnd);
    el.removeEventListener("touchcancel", onCancel);
  };
}
