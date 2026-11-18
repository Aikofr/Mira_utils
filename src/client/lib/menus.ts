import { errorText, info } from '../../shared/log';

/**
 * Suivi et fermeture des menus du jeu (guides/client/teleporting-player).
 * Téléporter avec un menu pause ou paramètres ouvert peut bloquer les contrôles :
 * appeler `closeAllMenus()` avant toute téléportation.
 */

type PauseMenu = InstanceType<typeof mp.game.MenuScenario_PauseMenu>;
type SettingsMenu = InstanceType<typeof mp.game.SettingsMainGameController>;

let pauseMenu: PauseMenu | null = null;
let settingsMenu: SettingsMenu | null = null;
let tracking = false;

/** Enregistre les observers (une seule fois). À appeler depuis l'init d'un module. */
export function trackMenus(): void {
  if (tracking) return;
  tracking = true;
  mp.game.onInit(() => {
    mp.game.observe('SettingsMainGameController', 'OnMenuChanged', (self) => {
      settingsMenu = self as SettingsMenu;
    });
    mp.game.observe('SettingsMainGameController', 'RequestClose', () => {
      settingsMenu = null;
    });
    mp.game.observe('MenuScenario_PauseMenu', 'OnSwitchToSettings', (self) => {
      pauseMenu = self as PauseMenu;
    });
    mp.game.observe('MenuScenario_PauseMenu', 'OnEnterScenario', (self) => {
      pauseMenu = self as PauseMenu;
    });
    // Menu refermé : on oublie la référence (sinon on « fermerait » un menu qui n'existe plus).
    mp.game.observe('MenuScenario_PauseMenu', 'OnLeaveScenario', () => {
      pauseMenu = null;
    });
  });
}

/** Ferme le hub (inventaire, carte…), le menu pause et les paramètres s'ils sont ouverts. */
export function closeAllMenus(): void {
  try {
    mp.game.GetPlayer()?.QueueEvent(new mp.game.ForceCloseHubMenuEvent());
    pauseMenu?.OnClosePauseMenu();
    settingsMenu?.RequestClose();
  } catch (err) {
    info('menus', `fermeture impossible : ${errorText(err)}`);
  }
}
