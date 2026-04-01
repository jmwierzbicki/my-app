import {
  Directive,
  ElementRef,
  OnInit,
  OnDestroy,
  NgZone,
  inject,
} from '@angular/core';

/**
 * Fallback for browsers without CSS Anchor Positioning.
 * Sets --tt-x / --tt-y custom properties on the .tooltip host
 * so the fixed-position CSS can place it relative to the trigger.
 *
 * In browsers that support anchor positioning the directive is a no-op.
 */
@Directive({
  selector: '.tooltip',
  standalone: true,
})
export class TooltipFixedDirective implements OnInit, OnDestroy {
  private el = inject(ElementRef<HTMLElement>);
  private zone = inject(NgZone);

  private supportsAnchor = CSS.supports('anchor-name', '--tt');
  private raf = 0;
  private observer: ResizeObserver | null = null;

  ngOnInit(): void {
    console.log(this.supportsAnchor)
    if (this.supportsAnchor) return;
    this.zone.runOutsideAngular(() => {
      this.update();
      this.observer = new ResizeObserver(() => this.scheduleUpdate());
      this.observer.observe(this.el.nativeElement);
      window.addEventListener('scroll', this.onScroll, true);
      window.addEventListener('resize', this.onResize);
    });
  }

  ngOnDestroy(): void {
    cancelAnimationFrame(this.raf);
    this.observer?.disconnect();
    window.removeEventListener('scroll', this.onScroll, true);
    window.removeEventListener('resize', this.onResize);
  }

  private onScroll = () => this.scheduleUpdate();
  private onResize = () => this.scheduleUpdate();

  private scheduleUpdate(): void {
    cancelAnimationFrame(this.raf);
    this.raf = requestAnimationFrame(() => this.update());
  }

  private getDirection(): 'top' | 'bottom' | 'left' | 'right' {
    const cl = this.el.nativeElement.classList;
    if (cl.contains('tooltip-bottom')) return 'bottom';
    if (cl.contains('tooltip-left')) return 'left';
    if (cl.contains('tooltip-right')) return 'right';
    return 'top';
  }

  private update(): void {
    const host = this.el.nativeElement;
    const trigger = host.querySelector(':scope > :last-child') as HTMLElement;
    if (!trigger) return;

    const rect = trigger.getBoundingClientRect();
    const dir = this.getDirection();

    let x: number;
    let y: number;

    switch (dir) {
      case 'bottom':
        x = rect.left + rect.width / 2;
        y = rect.bottom;
        break;
      case 'left':
        x = rect.left;
        y = rect.top + rect.height / 2;
        break;
      case 'right':
        x = rect.right;
        y = rect.top + rect.height / 2;
        break;
      default: // top
        x = rect.left + rect.width / 2;
        y = rect.top;
        break;
    }

    host.style.setProperty('--tt-x', `${x}px`);
    host.style.setProperty('--tt-y', `${y}px`);
  }
}
