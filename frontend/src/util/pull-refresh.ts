// Pull down at the top of the page to reload, like native apps.
//
// The Android Companion app has no pull-to-refresh of its own, so Atrium
// brings one. It only starts when the page is scrolled to the very top and the
// touch moves mostly downwards; scrolling and horizontal swipes are untouched.

export const PULL_THRESHOLD_PX = 80;
const MAX_PULL_PX = 120;

export interface PullRefreshOptions {
  /** Element whose touches are watched (the panel). */
  target: HTMLElement;
  /** Current scroll position of whatever scrolls the page. */
  scrollTop: () => number;
  /** Return false to ignore a gesture (e.g. a sheet is open). */
  enabled: () => boolean;
  /** Called with the pull distance (0 when released) to draw the indicator. */
  onPull: (distance: number) => void;
  onRefresh: () => void;
}

export function attachPullRefresh(opts: PullRefreshOptions): () => void {
  let startY: number | null = null;
  let startX = 0;
  let distance = 0;
  let active = false;

  const reset = () => {
    startY = null;
    active = false;
    distance = 0;
    opts.onPull(0);
  };

  const onStart = (ev: TouchEvent) => {
    const touch = ev.touches[0];
    if (ev.touches.length !== 1 || !touch || !opts.enabled() || opts.scrollTop() > 0) return;
    startY = touch.clientY;
    startX = touch.clientX;
    active = false;
  };

  const onMove = (ev: TouchEvent) => {
    const touch = ev.touches[0];
    if (startY === null || !touch) return;
    const dy = touch.clientY - startY;
    const dx = touch.clientX - startX;
    if (!active) {
      // Decide once: a clear downward pull at the top, else leave it to scrolling.
      if (Math.abs(dy) < 8) return;
      if (dy < 0 || Math.abs(dx) > Math.abs(dy) || opts.scrollTop() > 0) {
        startY = null;
        return;
      }
      active = true;
    }
    // Resistance: the indicator follows slower than the finger.
    distance = Math.min(MAX_PULL_PX, dy * 0.5);
    opts.onPull(distance);
    if (ev.cancelable) ev.preventDefault();
  };

  const onEnd = () => {
    if (active && distance >= PULL_THRESHOLD_PX) opts.onRefresh();
    reset();
  };

  const target = opts.target;
  target.addEventListener("touchstart", onStart, { passive: true });
  target.addEventListener("touchmove", onMove, { passive: false });
  target.addEventListener("touchend", onEnd);
  target.addEventListener("touchcancel", reset);
  return () => {
    target.removeEventListener("touchstart", onStart);
    target.removeEventListener("touchmove", onMove);
    target.removeEventListener("touchend", onEnd);
    target.removeEventListener("touchcancel", reset);
  };
}
