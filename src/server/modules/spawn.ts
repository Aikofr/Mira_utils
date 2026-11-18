import { debug } from '../../shared/log';
import type { MiraModule } from '../../shared/module';
import { SpawnEvents } from '../../shared/spawn-events';
import { hasKnownPosition } from '../lib/position';
import { getServerConfig } from './config';

/** Délai minimal entre deux vérifications pour un même joueur (anti-spam). */
const CHECK_COOLDOWN_MS = 5000;
const lastCheck = new Map<number, number>();

/**
 * SPAWN MINIMAL (désactivable : [spawn] enabled dans config.toml) : quand le jeu d'un joueur est chargé, son client demande si le serveur
 * connaît sa position ; sinon (0 0 0), on lui demande de se spawner sur place.
 */
export const spawn: MiraModule = {
  name: 'spawn',

  init() {
    mp.events.onClient(SpawnEvents.Check, (player) => {
      // Désactivé dans config.toml : un autre script s'occupe du spawn des joueurs.
      if (!getServerConfig().spawn.enabled) return;
      const now = Date.now();
      if (now - (lastCheck.get(player.id) ?? 0) < CHECK_COOLDOWN_MS) return;
      lastCheck.set(player.id, now);

      if (hasKnownPosition(player)) {
        debug('spawn', `${player.nickname} (${player.id}) : position déjà connue`);
        return;
      }
      debug('spawn', `${player.nickname} (${player.id}) : position inconnue (0 0 0), spawn demandé`);
      player.emit(SpawnEvents.Needed);
    });

    mp.events.on('playerSpawn', (playerId) => {
      debug('spawn', `joueur ${playerId} spawné (événement playerSpawn)`);
    });

    mp.events.on('playerDisconnected', (playerId) => {
      lastCheck.delete(playerId);
    });
  },

  dispose() {
    lastCheck.clear();
  },
};
