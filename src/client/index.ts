/**
 * mira_utils — client. Point d'entrée : uniquement la liste des modules.
 * Pour ajouter un outil : créer `modules/<nom>.ts` qui exporte un MiraModule, puis l'ajouter ici.
 */
import { startModules } from '../shared/module';
import { config } from './modules/config';
import { coords } from './modules/coords';
import { noclip } from './modules/noclip';
import { spawn } from './modules/spawn';
import { notify } from './modules/notify';
import { teleport } from './modules/teleport';
import { vehicles } from './modules/vehicles';

// `config` et `notify` en premier : les autres modules s'en servent.
startModules([config, notify, spawn, noclip, teleport, coords, vehicles], (handler) => mp.events.on('resourceStop', handler));
