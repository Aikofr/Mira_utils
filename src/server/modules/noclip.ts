import type { MpPlayer } from '@cybermp/server-types';
import type { MiraModule } from '../../shared/module';
import { NoclipEvents } from '../../shared/noclip-events';
import { debug } from '../../shared/log';
import { notify } from '../lib/notify';
import { canUse } from '../lib/permissions';
import { getServerConfig } from './config';

/** Délai minimal entre deux bascules d'un même joueur (anti-spam de l'événement). */
const TOGGLE_COOLDOWN_MS = 500;

/** Joueurs en noclip. Le serveur fait autorité sur cet état. */
const active = new Set<number>();
/** Dernière bascule acceptée ou refusée, par joueur. */
const lastToggle = new Map<number, number>();

/** Qui a le droit : `allow_all` de [noclip], sinon les admins de [admin] (config.toml). */
function isAllowed(player: MpPlayer): boolean {
  return canUse(player, getServerConfig().noclip.allowAll);
}

function setNoclip(playerId: number, enabled: boolean): void {
  if (enabled) active.add(playerId);
  else active.delete(playerId);
  if (!mp.players.exists(playerId)) return;
  mp.players.at(playerId).emit(NoclipEvents.Set, enabled);
}

/** Vrai si le joueur est en noclip (utilisable par d'autres modules du serveur). */
export function isInNoclip(playerId: number): boolean {
  return active.has(playerId);
}

/** Noclip : décide qui peut l'activer, protège et désarme les joueurs qui l'utilisent. */
export const noclip: MiraModule = {
  name: 'noclip',

  init() {
    mp.events.onClient(NoclipEvents.Request, (player) => {
      const now = Date.now();
      if (now - (lastToggle.get(player.id) ?? 0) < TOGGLE_COOLDOWN_MS) return; // spam ignoré sans log
      lastToggle.set(player.id, now);

      if (!isAllowed(player)) {
        debug('noclip', `refusé pour ${player.nickname} (${player.id})`);
        notify(player, 'noclip : réservé aux admins');
        return;
      }

      const enabled = !active.has(player.id);
      debug('noclip', `${player.nickname} (${player.id}) : ${enabled ? 'activé' : 'désactivé'}`);
      setNoclip(player.id, enabled);
    });

    // Dégâts : annulés si la victime OU l'attaquant est en noclip (décidé par le serveur).
    // Le 1er argument est l'attaquant qui envoie l'événement, la victime est dans data.victimId
    // (reference/lua/server : « playerId is the sending attacker », même usage dans freeroam ;
    // les exemples JS des guides le nomment à tort victimId).
    mp.events.on('damage', (attackerId, data) =>
      active.has(attackerId) || active.has(data?.victimId) ? false : undefined,
    );

    // Un joueur en noclip ne peut pas attaquer (tirer à travers un mur, grenade depuis le ciel…).
    // Ces événements serveur sont annulables en renvoyant false (guides/server/events).
    mp.events.on('shootAction', (playerId) => (active.has(playerId) ? false : undefined));
    mp.events.on('meleeAction', (playerId) => (active.has(playerId) ? false : undefined));
    mp.events.on('throwGrenade', (playerId) => (active.has(playerId) ? false : undefined));

    // Mort ou réapparition : on sort proprement du noclip.
    mp.events.on('playerDeath', (playerId) => {
      if (active.has(playerId)) setNoclip(playerId, false);
    });
    mp.events.on('playerRespawn', (playerId) => {
      if (active.has(playerId)) setNoclip(playerId, false);
    });

    mp.events.on('playerDisconnected', (playerId) => {
      active.delete(playerId);
      lastToggle.delete(playerId);
    });
  },

  dispose() {
    // Au redémarrage de la ressource, les clients rechargent aussi leur script et sortent du noclip.
    active.clear();
    lastToggle.clear();
  },
};
