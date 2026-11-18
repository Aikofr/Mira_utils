import type { MiraModule } from '../../shared/module';
import { copyToClipboard, getPlayer, getPosition, getYaw } from '../lib/natives';
import { showMessage } from './notify';

/**
 * `pos`  → affiche et copie « x, y, z » ;
 * `posh` → affiche et copie « x, y, z, orientation » (h = heading ; se colle tel quel après `tp`).
 * Purement local : lit la position dans le jeu, n'envoie rien au serveur.
 */
function copyPosition(command: string, withHeading: boolean): void {
  const player = getPlayer();
  if (!player) {
    showMessage(`${command} : joueur introuvable`);
    return;
  }

  const { x, y, z } = getPosition(player);
  const values = withHeading ? [x, y, z, getYaw(player)] : [x, y, z];
  const text = values.map((v) => v.toFixed(2)).join(', ');

  showMessage(copyToClipboard(text) ? `${command} copiée : ${text}` : `${command} (copie impossible) : ${text}`);
}

export const coords: MiraModule = {
  name: 'coords',

  init() {
    mp.commands.add('pos', () => copyPosition('pos', false));
    mp.commands.add('posh', () => copyPosition('posh', true));
  },

  dispose() {
    mp.commands.remove('pos');
    mp.commands.remove('posh');
  },
};
