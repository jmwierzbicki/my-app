import { Component, signal } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { TooltipFixedDirective } from './tooltip-fixed.directive';
// TooltipFixedDirective matches `.tooltip` — import it in any component that uses tooltips

@Component({
  selector: 'app-root',
  imports: [RouterOutlet, TooltipFixedDirective],
  templateUrl: './app.html',
  styleUrl: './app.css'
})
export class App {
  protected readonly title = signal('my-app');
}
