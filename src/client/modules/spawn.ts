import { debug, errorText } from '../../shared/log';
import type { MiraModule } from '../../shared/module';
import { SpawnEvents } from '../../shared/spawn-events';
import { getPlayer, getPosition, getYaw, setPlayerHealth } from '../lib/natives';
import { showMessage } from './notify';

/**
 * SPAWN MINIMAL (désactivable : [spawn] enabled = false dans config.toml, si un autre script
 * de ton serveur spawne déjà les joueurs).
 *
 * CyberMP ne synchronise un joueur qu'après `mp.local.spawnPlayer` (guides/client/spawning-player) :
 * sans lui, le serveur voit le joueur en 0 0 0 et ne lui envoie pas les véhicules créés près de lui.
 * Ici, on spawne le joueur À L'ENDROIT OÙ IL SE TROUVE (aucun déplacement), seulement si le serveur
 * ne connaît pas encore sa position. `respawn` (F8) force l'opération.
 */

/** Vie de départ : même valeur que le core officiel (HealthController.DEFAULT_HEALTH). */
const SPAWN_HEALTH = 300;
/** Repli si la position du jeu est inutilisable : près de l'appartement de V (exemple de la doc). */
const FALLBACK_SPAWN = { x: -1392.637, y: 1271.536, z: 123.082, yaw: 1.0 };

function spawnHere(reason: string): void {
  const player = getPlayer();
  if (!player) {
    showMessage('respawn : joueur introuvable');
    return;
  }
  try {
    const pos = getPosition(player);
    const unusable = Math.abs(pos.x) < 1 && Math.abs(pos.y) < 1 && Math.abs(pos.z) < 1;
    const target = unusable ? FALLBACK_SPAWN : { ...pos, yaw: getYaw(player) };

    setPlayerHealth(player, SPAWN_HEALTH);
    mp.local.spawnPlayer(target.x, target.y, target.z, target.yaw);
    debug('spawn', `${reason} : spawn à ${target.x.toFixed(1)} ${target.y.toFixed(1)} ${target.z.toFixed(1)}`);
  } catch (err) {
    showMessage(`respawn : échec (${errorText(err)})`);
  }
}

export const spawn: MiraModule = {
  name: 'spawn',

  init() {
    // Le serveur décide : on ne respawne pas à chaque `restart mira_utils` si la position est déjà connue.
    mp.events.onServer(SpawnEvents.Needed, () => spawnHere('position inconnue du serveur'));
    mp.game.onGameLoaded(() => mp.events.emitServer(SpawnEvents.Check));
    mp.commands.add('respawn', () => {
      spawnHere('commande respawn');
      showMessage('respawn : fait');
    });
  },

  dispose() {
    mp.commands.remove('respawn');
  },
};
