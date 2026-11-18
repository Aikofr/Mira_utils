import type { MpPlayer } from '@cybermp/server-types';
import { getServerConfig } from '../modules/config';

/** Vrai si le pseudo figure dans [admin] players de config.toml. */
export function isAdmin(player: MpPlayer): boolean {
  return getServerConfig().admins.includes(player.nickname);
}

/**
 * Règle commune aux outils : `allow_all = true` → tout le monde, sinon admins seulement.
 * (Provisoire : sera remplacé par la ressource admin.)
 */
export function canUse(player: MpPlayer, allowAll: boolean): boolean {
  return allowAll || isAdmin(player);
}
