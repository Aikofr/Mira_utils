/**
 * Messages de la console (serveur et F8), en deux niveaux :
 * - `info`  : toujours affiché (erreurs, valeurs de config invalides, modules chargés) ;
 * - `debug` : affiché seulement si `debug = true` dans config.toml, section [general].
 * Chaque environnement (serveur, client) a sa propre copie de cet état.
 */

let debugEnabled = false;

/** Appelé par le module config (serveur : au chargement du fichier ; client : à la réception). */
export function setDebug(enabled: boolean): void {
  debugEnabled = enabled;
}

/** Vrai si `debug = true` (pour éviter de préparer un diagnostic qui ne sera pas affiché). */
export function isDebug(): boolean {
  return debugEnabled;
}

export function info(tag: string, message: string): void {
  console.log(`[${tag}] ${message}`);
}

/** Message sans étiquette (réponses aux commandes, messages au joueur). */
export function plain(message: string): void {
  console.log(message);
}

export function debug(tag: string, message: string): void {
  if (debugEnabled) console.log(`[${tag}] ${message}`);
}

/** Texte lisible d'une erreur attrapée. */
export function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}
