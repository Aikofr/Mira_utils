import type { MpPlayer } from '@cybermp/server-types';
import { plain } from '../../shared/log';
import { NotifyEvents } from '../../shared/notify-events';

/**
 * Message au joueur, affiché par le module client `notify` (console F8 + bandeau à l'écran).
 * Depuis le terminal du serveur (`player` null), le message va dans la console serveur.
 */
export function notify(player: MpPlayer | null, text: string): void {
  if (player) player.emit(NotifyEvents.Show, text);
  else plain(text);
}

/** Lignes écrites dans la console F8 du joueur uniquement (pas de bandeau) : listes, aide… */
export function printLines(player: MpPlayer | null, lines: readonly string[]): void {
  if (player) player.emit(NotifyEvents.Print, lines);
  else for (const line of lines) plain(line);
}
