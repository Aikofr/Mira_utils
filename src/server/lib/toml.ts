import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { parse } from 'smol-toml';
import { errorText, info } from '../../shared/log';

export type Table = Record<string, unknown>;

/** Nom du dossier de cette ressource (fonctionne même si le dossier est renommé). */
function resourceName(): string {
  try {
    return mp.resources.getCurrentName();
  } catch {
    return 'mira_utils';
  }
}

/**
 * Contenu d'un fichier à la racine de la ressource : via l'API CyberMP (`mp.resources.loadFile`),
 * sinon lecture directe sur le disque (le serveur tourne depuis le dossier de server.toml).
 */
function readResourceFile(name: string): string {
  const resource = resourceName();
  try {
    const content = mp.resources.loadFile(resource, name);
    if (typeof content === 'string' && content.length > 0) return content;
  } catch {
    /* repli sur le disque */
  }
  return readFileSync(resolve('resources', resource, name), 'utf8');
}

/** Lit un fichier TOML de la ressource ; null (avec un message) s'il est absent ou invalide. */
export function readToml(name: string): Table | null {
  try {
    return parse(readResourceFile(name));
  } catch (err) {
    info('config', `lecture impossible de ${name} (${errorText(err)})`);
    return null;
  }
}

/** Sous-table TOML, ou objet vide si absente / pas une table. */
export function table(value: unknown): Table {
  return value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as Table) : {};
}
