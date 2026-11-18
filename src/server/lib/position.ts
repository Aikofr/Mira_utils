import type { MpPlayer } from '@cybermp/server-types';

/**
 * Faux tant que le joueur n'a pas été spawné par script (mp.local.spawnPlayer) :
 * le serveur le voit alors en 0 0 0 (constaté en jeu le 2026-11-17).
 */
export function hasKnownPosition(player: MpPlayer): boolean {
  const [x, y, z] = player.position;
  return Math.abs(x) >= 1 || Math.abs(y) >= 1 || Math.abs(z) >= 1;
}
