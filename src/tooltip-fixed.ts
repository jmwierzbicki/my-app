/**
 * Global tooltip overflow fix — fallback for browsers without CSS Anchor Positioning.
 *
 * PROBLEM:
 *   DaisyUI tooltips use `position: absolute`, so any ancestor with
 *   `overflow: hidden` clips them. CSS Anchor Positioning (Chrome/Edge 125+)
 *   solves this with `position: fixed` + anchor-based placement — handled
 *   entirely in styles.css. Safari and Firefox don't support it yet.
 *
 * WHAT THIS SCRIPT DOES:
 *   For non-anchor-positioning browsers, it calculates the trigger element's
 *   viewport coordinates and writes them as --tt-x / --tt-y CSS custom
 *   properties on the .tooltip host. The companion CSS in styles.css consumes
 *   these to position the tooltip content with `position: fixed`.
 *
 * PERFORMANCE:
 *   - Uses event delegation on `document` — no per-element listeners or observers.
 *   - Only tracks "active" tooltips (hovered, focused, or .tooltip-open).
 *   - While any tooltip is active, a rAF loop updates positions every frame.
 *     This guarantees correct tracking during scroll, resize, and layout shifts.
 *   - The loop self-stops when no tooltips are active — zero idle cost.
 *
 * CLEANUP:
 *   - Hover/focus tooltips are removed from the active set via mouseout/focusout.
 *   - .tooltip-open elements are never removed by mouse/focus events.
 *   - Orphaned elements (removed from DOM) are pruned via `isConnected` checks.
 *
 * USAGE:
 *   Import this file once in main.ts as a side-effect:
 *     import './tooltip-fixed';
 *   No component-level imports needed — works globally for any .tooltip element.
 *
 * BROWSER SUPPORT CHECK:
 *   `CSS.supports('anchor-name', '--tt')` gates the entire script.
 *   In supporting browsers (Chrome/Edge), nothing below executes.
 */

if (!CSS.supports('anchor-name', '--tt')) {
  /**
   * Set of .tooltip elements that are currently visible (hovered, focused,
   * or forced open via .tooltip-open). Only these receive position updates.
   * When the set is empty, the rAF loop stops — zero idle cost.
   */
  const active = new Set<HTMLElement>();

  /** Whether the rAF loop is currently running. */
  let looping = false;

  /**
   * Reads the trigger's viewport position and writes --tt-x / --tt-y on the
   * tooltip host. The CSS `transform: translate(var(--_tx), var(--_ty))` in
   * styles.css uses these to place the fixed-position content.
   *
   * The anchor point depends on the tooltip direction:
   *   - top (default): center of trigger's top edge
   *   - bottom:        center of trigger's bottom edge
   *   - left:          center of trigger's left edge
   *   - right:         center of trigger's right edge
   */
  function update(el: HTMLElement): void {
    /**
     * DaisyUI convention: the trigger (button, link, etc.) is always
     * the last child of .tooltip. The tooltip-content comes before it.
     */
    const trigger = el.querySelector(':scope > :last-child') as HTMLElement;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const cl = el.classList;

    let x: number;
    let y: number;

    if (cl.contains('tooltip-bottom')) {
      x = rect.left + rect.width / 2;
      y = rect.bottom;
    } else if (cl.contains('tooltip-left')) {
      x = rect.left;
      y = rect.top + rect.height / 2;
    } else if (cl.contains('tooltip-right')) {
      x = rect.right;
      y = rect.top + rect.height / 2;
    } else {
      x = rect.left + rect.width / 2;
      y = rect.top;
    }

    el.style.setProperty('--tt-x', `${x}px`);
    el.style.setProperty('--tt-y', `${y}px`);
  }

  /**
   * Activates a tooltip — adds it to the active set, computes its position
   * immediately, and starts the rAF loop if not already running.
   */
  function activate(el: HTMLElement): void {
    if (active.has(el)) return;
    active.add(el);
    update(el);
    startLoop();
  }

  /**
   * rAF loop — runs every frame while any tooltip is active.
   * Updates all active tooltips' positions (handles scroll, resize, layout shifts)
   * and prunes disconnected elements.
   * Self-stops when the active set is empty.
   */
  function loop(): void {
    if (active.size === 0) {
      looping = false;
      return;
    }
    for (const el of active) {
      if (!el.isConnected) {
        active.delete(el);
        continue;
      }
      update(el);
    }
    requestAnimationFrame(loop);
  }

  function startLoop(): void {
    if (!looping) {
      looping = true;
      requestAnimationFrame(loop);
    }
  }

  // ── Delayed removal ──
  //
  // DaisyUI fades tooltips out over ~275ms (75ms delay + 200ms transition).
  // During that fade, the rAF loop must keep updating position so the tooltip
  // tracks the button instead of freezing at the cursor's position.
  // Removal is delayed by 300ms — the element stays in `active` through
  // the entire fade-out, then gets cleaned up.

  const FADE_OUT_MS = 300;
  const pendingRemoval = new Map<HTMLElement, ReturnType<typeof setTimeout>>();

  function deactivateLater(el: HTMLElement): void {
    if (pendingRemoval.has(el)) return;
    pendingRemoval.set(
      el,
      setTimeout(() => {
        active.delete(el);
        pendingRemoval.delete(el);
      }, FADE_OUT_MS),
    );
  }

  function cancelDeactivation(el: HTMLElement): void {
    const timeout = pendingRemoval.get(el);
    if (timeout) {
      clearTimeout(timeout);
      pendingRemoval.delete(el);
    }
  }

  // ── Hover (event delegation via mouseover/mouseout — they bubble) ──
  //
  // mouseover adds to active and computes position immediately (before the
  // CSS opacity transition reveals the content — avoids a wrong-position flash).
  //
  // mouseout schedules a delayed removal so the rAF loop keeps updating
  // position during DaisyUI's fade-out transition. If the user re-hovers
  // before the timeout, the pending removal is cancelled.

  document.addEventListener('mouseover', (e) => {
    const el = (e.target as HTMLElement).closest?.('.tooltip') as HTMLElement;
    if (!el) return;
    cancelDeactivation(el);
    activate(el);
  });

  document.addEventListener('mouseout', (e) => {
    const el = (e.target as HTMLElement).closest?.('.tooltip') as HTMLElement;
    if (!el || el.classList.contains('tooltip-open')) return;
    const related = (e as MouseEvent).relatedTarget as Node | null;
    if (!related || !el.contains(related)) {
      deactivateLater(el);
    }
  });

  // ── Focus ──
  //
  // DaisyUI shows tooltips on :has(:focus-visible). We track focusin/focusout
  // to match. Same relatedTarget guard as mouseout — ignore focus moves
  // between children of the same .tooltip.

  document.addEventListener('focusin', (e) => {
    const el = (e.target as HTMLElement).closest?.('.tooltip') as HTMLElement;
    if (!el) return;
    cancelDeactivation(el);
    activate(el);
  });

  document.addEventListener('focusout', (e) => {
    const el = (e.target as HTMLElement).closest?.('.tooltip') as HTMLElement;
    if (!el || el.classList.contains('tooltip-open')) return;
    const related = (e as FocusEvent).relatedTarget as Node | null;
    if (!related || !el.contains(related)) {
      deactivateLater(el);
    }
  });

  // ── .tooltip-open (always visible — pick up on DOM changes) ──
  //
  // Tooltips with the .tooltip-open class are forced visible without hover.
  // A MutationObserver watches for DOM changes (Angular adding/removing
  // components) and queries for .tooltip-open elements to activate them.
  //
  // Note: this doesn't watch for the class attribute changing on existing
  // elements (that would require `attributes: true` on the entire body,
  // which is expensive). If .tooltip-open is toggled on an existing element,
  // the position update will happen on the next hover or focusin event.

  const mo = new MutationObserver(() => {
    for (const el of active) {
      if (!el.isConnected) active.delete(el);
    }
    document.querySelectorAll<HTMLElement>('.tooltip.tooltip-open').forEach((el) => {
      activate(el);
    });
  });
  mo.observe(document.body, { childList: true, subtree: true });

  /** Initial pass — activate any .tooltip-open elements already in the DOM at boot. */
  document.querySelectorAll<HTMLElement>('.tooltip.tooltip-open').forEach((el) => {
    activate(el);
  });
}
