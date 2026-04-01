import {
  Directive,
  ElementRef,
  NgZone,
  OnDestroy,
  AfterContentInit,
  ContentChild,
  inject,
  input,
  effect,
} from '@angular/core';
import { TooltipContentDirective } from './tooltip-content.directive';

/**
 * Portal-based tooltip that escapes overflow-hidden containers.
 *
 * Creates a clone of DaisyUI's .tooltip structure appended to <body>.
 * DaisyUI's CSS handles all styling, arrow rendering, and animations —
 * the directive just manages the portal lifecycle and position tracking.
 *
 * Two positioning strategies:
 *   1. CSS Anchor Positioning (Chrome/Edge 125+): the trigger gets a unique
 *      `anchor-name`, the portal uses `position-anchor` + `anchor()`/`anchor-size()`
 *      to match the trigger's exact viewport rect. The browser handles
 *      scroll/resize tracking natively — zero JS overhead.
 *   2. JS fallback (Safari/Firefox): a rAF loop reads `getBoundingClientRect()`
 *      and updates the portal's `left/top/width/height` every frame.
 *
 * Two content modes:
 *   - Text:  <button tooltip="Hello">Hover me</button>
 *   - Rich:  <div tooltip><div tooltipContent>HTML here</div><button>Hover</button></div>
 */
@Directive({
  selector: '[tooltip]',
  standalone: true,
  host: {
    '(mouseenter)': 'show()',
    '(mouseleave)': 'hide()',
    '(focusin)': 'show()',
    '(focusout)': 'hide()',
  },
})
export class TooltipDirective implements AfterContentInit, OnDestroy {
  static nextId = 0;

  readonly tooltip = input('');
  readonly tooltipPosition = input<'top' | 'bottom' | 'left' | 'right'>('top');
  readonly tooltipVariant = input('');
  readonly tooltipOpen = input(false);

  @ContentChild(TooltipContentDirective)
  private contentChild?: TooltipContentDirective;

  private readonly el = inject(ElementRef<HTMLElement>);
  private readonly zone = inject(NgZone);
  private readonly useAnchor = CSS.supports('anchor-name', '--a');

  private portal: HTMLElement | null = null;
  private anchorName: string | null = null;
  private raf = 0;
  private hideTimer = 0;

  constructor() {
    effect(() => {
      const open = this.tooltipOpen();
      if (open) this.show();
      else if (this.portal) this.hide();
    });
  }

  ngAfterContentInit(): void {
    if (this.tooltipOpen()) this.show();
  }

  ngOnDestroy(): void {
    this.destroy();
  }

  show(): void {
    clearTimeout(this.hideTimer);

    if (this.portal) {
      this.portal.classList.add('tooltip-open');
      return;
    }

    this.portal = this.buildPortal();
    document.body.appendChild(this.portal);

    if (this.useAnchor) {
      // Anchor positioning — browser handles tracking natively
      this.applyAnchorPositioning();
    } else {
      // JS fallback — rAF loop for position tracking
      this.updatePosition();
      this.startLoop();
    }

    this.zone.runOutsideAngular(() => {
      // Trigger DaisyUI's show transition in the next frame
      requestAnimationFrame(() => this.portal?.classList.add('tooltip-open'));
    });
  }

  hide(): void {
    if (!this.portal || this.tooltipOpen()) return;
    this.portal.classList.remove('tooltip-open');

    // Wait for DaisyUI's fade-out (75ms delay + 200ms transition)
    const ref = this.portal;
    this.hideTimer = window.setTimeout(() => {
      if (this.portal === ref) this.destroy();
    }, 300);
  }

  private buildPortal(): HTMLElement {
    const pos = this.tooltipPosition();
    const variant = this.tooltipVariant();

    const portal = document.createElement('div');
    portal.className = [
      'tooltip',
      pos !== 'top' ? `tooltip-${pos}` : '',
      variant ? `tooltip-${variant}` : '',
    ]
      .filter(Boolean)
      .join(' ');

    // Content — text via data-tip, or cloned rich content
    const text = this.tooltip();
    if (text) {
      portal.setAttribute('data-tip', text);
    } else if (this.contentChild) {
      const content = document.createElement('div');
      content.className = 'tooltip-content';
      content.innerHTML = this.contentChild.el.nativeElement.innerHTML;
      portal.appendChild(content);
    }

    // DaisyUI needs a last-child element (the "trigger" slot) for sizing.
    const spacer = document.createElement('span');
    spacer.style.display = 'contents';
    portal.appendChild(spacer);

    // Base styles — position: fixed escapes all overflow
    Object.assign(portal.style, {
      position: 'fixed',
      display: 'block',
      pointerEvents: 'none',
      zIndex: '9999',
    });

    return portal;
  }

  /**
   * CSS Anchor Positioning strategy.
   * Sets a unique anchor-name on the trigger and uses anchor()/anchor-size()
   * on the portal to match the trigger's exact viewport rect. The browser
   * handles repositioning on scroll/resize automatically — no JS loop needed.
   */
  private applyAnchorPositioning(): void {
    this.anchorName = `--tt-${TooltipDirective.nextId++}`;

    // Trigger becomes the anchor
    this.el.nativeElement.style.setProperty('anchor-name', this.anchorName);

    // Portal mirrors the anchor's position and size
    const s = this.portal!.style;
    s.setProperty('position-anchor', this.anchorName);
    s.setProperty('top', 'anchor(top)');
    s.setProperty('left', 'anchor(left)');
    s.setProperty('width', 'anchor-size(width)');
    s.setProperty('height', 'anchor-size(height)');
    s.setProperty('bottom', 'auto');
    s.setProperty('right', 'auto');
  }

  /**
   * JS fallback — rAF loop that syncs the portal's position with the trigger.
   */
  private startLoop(): void {
    this.zone.runOutsideAngular(() => {
      const loop = () => {
        if (!this.portal) return;
        this.updatePosition();
        this.raf = requestAnimationFrame(loop);
      };
      this.raf = requestAnimationFrame(loop);
    });
  }

  private updatePosition(): void {
    if (!this.portal) return;
    const r = this.el.nativeElement.getBoundingClientRect();
    const s = this.portal.style;
    s.left = `${r.left}px`;
    s.top = `${r.top}px`;
    s.width = `${r.width}px`;
    s.height = `${r.height}px`;
  }

  private destroy(): void {
    cancelAnimationFrame(this.raf);
    clearTimeout(this.hideTimer);

    // Clean up anchor name from trigger
    if (this.anchorName) {
      this.el.nativeElement.style.removeProperty('anchor-name');
      this.anchorName = null;
    }

    this.portal?.remove();
    this.portal = null;
  }
}
