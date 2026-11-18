import type { MiraModule } from '../../shared/module';
import { NotifyEvents } from '../../shared/notify-events';
import { showWarning } from '../lib/natives';

/** Affiche un message au joueur : console F8 (toujours) + bandeau à l'écran (si possible). */
export function showMessage(text: string): void {
  console.log(text);
  showWarning(text);
}

/** Nombre maximal de lignes acceptées en une fois (protection contre un envoi démesuré). */
const MAX_PRINT_LINES = 400;

/** Messages envoyés par le serveur (résultats de commandes, refus, listes…). */
export const notify: MiraModule = {
  name: 'notify',

  init() {
    mp.events.onServer(NotifyEvents.Show, (text: unknown) => {
      if (typeof text === 'string') showMessage(text);
    });
    mp.events.onServer(NotifyEvents.Print, (lines: unknown) => {
      if (!Array.isArray(lines)) return;
      for (const line of lines.slice(0, MAX_PRINT_LINES)) {
        if (typeof line === 'string') console.log(line);
      }
    });
  },
};
