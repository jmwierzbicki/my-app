import { Directive, ElementRef, inject } from '@angular/core';

/** Marks a child element as rich tooltip content. Hidden in-place; cloned into the portal on show. */
@Directive({
  selector: '[tooltipContent]',
  standalone: true,
  host: { style: 'display: none' },
})
export class TooltipContentDirective {
  readonly el = inject(ElementRef<HTMLElement>);
}
