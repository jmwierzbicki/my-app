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
 *   - Scroll/resize recalculations are batched in a single requestAnimationFrame.
 *   - When no tooltip is active, scroll/resize handlers are effectively free
 *     (the active set is empty, so the rAF callback does nothing).
 *
 * CLEANUP:
 *   - Elements are removed from the active set on mouseout / focusout.
 *   - Orphaned elements (removed from DOM without triggering mouseout) are
 *     pruned via `el.isConnected` checks during the next rAF cycle.
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
  /** Handle for the pending requestAnimationFrame, used to cancel/deduplicate. */
  let raf = 0;

  /**
   * Set of .tooltip elements that are currently visible (hovered, focused,
   * or forced open via .tooltip-open). Only these receive position updates
   * on scroll/resize — idle tooltips cost nothing.
   */
  const active = new Set<HTMLElement>();

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
   * Batches position updates into a single animation frame.
   * Called on every scroll/resize event, but the actual DOM reads
   * (getBoundingClientRect) only happen once per frame.
   *
   * Also prunes disconnected elements — if a tooltip was removed from the
   * DOM between frames (e.g. Angular destroyed the component), the
   * `isConnected` check catches it and cleans up the reference.
   */
  function scheduleUpdate(): void {
    cancelAnimationFrame(raf);
    raf = requestAnimationFrame(() => {
      for (const el of active) {
        if (!el.isConnected) {
          active.delete(el);
          continue;
        }
        update(el);
      }
    });
  }

  // ── Hover (event delegation via mouseover/mouseout — they bubble) ──
  //
  // We use mouseover/mouseout instead of mouseenter/mouseleave because
  // the latter don't bubble, so document-level delegation wouldn't work.

  /**
   * When the pointer enters any element inside a .tooltip, add it to the
   * active set and calculate its position immediately (before the CSS
   * opacity transition reveals the content — avoids a flash at the wrong spot).
   */
  document.addEventListener('mouseover', (e) => {
    const el = (e.target as HTMLElement).closest?.('.tooltip') as HTMLElement;
    if (!el || active.has(el)) return;
    active.add(el);
    update(el);
  });

  /**
   * When the pointer leaves, only deactivate if it actually left the .tooltip
   * boundary. mouseover/mouseout fire for child elements too — relatedTarget
   * tells us where the pointer went. If it moved to another child inside the
   * same .tooltip, we keep it active.
   */
  document.addEventListener('mouseout', (e) => {
    const el = (e.target as HTMLElement).closest?.('.tooltip') as HTMLElement;
    if (!el) return;
    const related = (e as MouseEvent).relatedTarget as Node | null;
    if (!related || !el.contains(related)) {
      active.delete(el);
    }
  });

  // ── Focus ──
  //
  // DaisyUI shows tooltips on :has(:focus-visible). We track focusin/focusout
  // to match. Same relatedTarget guard as mouseout — ignore focus moves
  // between children of the same .tooltip.

  document.addEventListener('focusin', (e) => {
    const el = (e.target as HTMLElement).closest?.('.tooltip') as HTMLElement;
    if (!el || active.has(el)) return;
    active.add(el);
    update(el);
  });

  document.addEventListener('focusout', (e) => {
    const el = (e.target as HTMLElement).closest?.('.tooltip') as HTMLElement;
    if (!el) return;
    const related = (e as FocusEvent).relatedTarget as Node | null;
    if (!related || !el.contains(related)) {
      active.delete(el);
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
  // the position update will happen on the next scroll/resize or hover.

  const mo = new MutationObserver(() => {
    for (const el of active) {
      if (!el.isConnected) active.delete(el);
    }
    document.querySelectorAll<HTMLElement>('.tooltip.tooltip-open').forEach((el) => {
      if (!active.has(el)) {
        active.add(el);
        update(el);
      }
    });
  });
  mo.observe(document.body, { childList: true, subtree: true });

  /** Initial pass — activate any .tooltip-open elements already in the DOM at boot. */
  document.querySelectorAll<HTMLElement>('.tooltip.tooltip-open').forEach((el) => {
    active.add(el);
    update(el);
  });

  // ── Scroll / resize — only recalc active (visible) tooltips ──
  //
  // Scroll uses `capture: true` so we also catch scrolls inside nested
  // scrollable containers (not just window-level scroll).

  window.addEventListener('scroll', scheduleUpdate, true);
  window.addEventListener('resize', scheduleUpdate);
}
