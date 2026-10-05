import { useRef } from "react";
import type { Rect } from "./geometry";

export interface FlipItem {
  key: string;
  ctx: string;
  rect: Rect;
}

/** Where newly-entering tiles should animate from. */
export interface EnterAnim {
  ctx: string;
  origin: Rect;
  stagger?: boolean;
}

const MOVE_MS = 320;
export const FADE_MS = 260;
const STAGGER_MS = 22;
const EASE = "cubic-bezier(.2,.8,.2,1)";

/**
 * FLIP animation controller keyed on stable tile identity. Positions are taken
 * from the computed layout (not measured), so there is no layout thrash.
 */
export function useFlip(reducedMotion: boolean) {
  const elements = useRef(new Map<string, HTMLElement>());
  const prev = useRef(new Map<string, Rect>());
  const pending = useRef<EnterAnim | null>(null);

  const register = (key: string) => (el: HTMLElement | null) => {
    if (el) elements.current.set(key, el);
    else elements.current.delete(key);
  };

  /** Arm an enter animation for tiles added on the next render. */
  const setEnter = (anim: EnterAnim | null) => {
    pending.current = anim;
  };

  /** Run after each committed render (in a layout effect). */
  const play = (items: FlipItem[]) => {
    const anim = pending.current;
    pending.current = null;
    const nextRects = new Map<string, Rect>();
    let staggerIndex = 0;

    for (const it of items) {
      nextRects.set(it.key, it.rect);
      const el = elements.current.get(it.key);
      if (!el) continue;

      const old = prev.current.get(it.key);
      let from: Rect | null = null;
      let fade = false;

      if (old) {
        if (
          old.left !== it.rect.left ||
          old.top !== it.rect.top ||
          old.width !== it.rect.width ||
          old.height !== it.rect.height
        ) {
          from = old;
        }
      } else if (anim && it.ctx === anim.ctx) {
        from = anim.origin;
        fade = true;
      }

      if (!from) continue;

      if (reducedMotion) {
        el.style.opacity = "";
        el.style.transform = "";
        continue;
      }

      const sx = from.width / it.rect.width;
      const sy = from.height / it.rect.height;
      el.style.transformOrigin = "0 0";
      el.style.transition = "none";
      el.style.transform = `translate(${from.left - it.rect.left}px,${from.top - it.rect.top}px) scale(${sx},${sy})`;
      if (fade) el.style.opacity = "0";

      const delay = fade && anim?.stagger ? Math.min(staggerIndex++, 12) * STAGGER_MS : 0;
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          el.style.transition = `transform ${MOVE_MS}ms ${EASE} ${delay}ms, opacity ${FADE_MS}ms ${delay}ms`;
          el.style.transform = "";
          el.style.opacity = "";
        }),
      );
    }

    prev.current = nextRects;
  };

  /**
   * Animate all tiles in `ctx` converging to `origin` (scale + fade out),
   * then call `onDone`. Used for closing panels.
   */
  const playLeave = (ctx: string, origin: Rect, onDone: () => void) => {
    if (reducedMotion) {
      onDone();
      return;
    }
    const ctxPrefix = `${ctx}:`;
    for (const [key, el] of elements.current) {
      if (!key.startsWith(ctxPrefix)) continue;
      const current = prev.current.get(key);
      if (!current) continue;
      const tx = origin.left - current.left;
      const ty = origin.top - current.top;
      const sx = origin.width / current.width;
      const sy = origin.height / current.height;
      el.style.transformOrigin = "0 0";
      el.style.transition = `transform ${MOVE_MS}ms ${EASE}, opacity ${FADE_MS}ms`;
      el.style.transform = `translate(${tx}px,${ty}px) scale(${sx},${sy})`;
      el.style.opacity = "0";
    }
    window.setTimeout(onDone, MOVE_MS);
  };

  return { register, setEnter, play, playLeave };
}
