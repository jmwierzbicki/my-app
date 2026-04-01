import { Component, signal } from '@angular/core';
import { TooltipDirective } from './tooltip/tooltip.directive';
import { TooltipContentDirective } from './tooltip/tooltip-content.directive';

@Component({
  selector: 'app-root',
  imports: [TooltipDirective, TooltipContentDirective],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('my-app');
}
