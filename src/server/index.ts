/**
 * mira_utils — serveur. Point d'entrée : uniquement la liste des modules.
 * Pour ajouter un outil : créer `modules/<nom>.ts` qui exporte un MiraModule, puis l'ajouter ici.
 */
import { startModules } from '../shared/module';
import { config } from './modules/config';
import { noclip } from './modules/noclip';
import { spawn } from './modules/spawn';
import { teleport } from './modules/teleport';
import { vehicles } from './modules/vehicles';

// `config` en premier : les autres modules lisent ses valeurs.
startModules([config, spawn, noclip, teleport, vehicles], (handler) => mp.events.on('resourceStop', handler), 'mira_utils');
