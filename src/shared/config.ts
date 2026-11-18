/**
 * Forme de la configuration (config.toml à la racine de la ressource).
 * Le serveur lit le fichier et garde tout ; il n'envoie aux clients que `ClientConfig`
 * (les listes d'admins et autres réglages sensibles restent côté serveur).
 */

/** Réglages utiles aux clients (envoyés par le réseau). */
export interface ClientConfig {
  /** Messages de diagnostic dans la console F8 ([general] debug). */
  debug: boolean;
  noclip: {
    speed: number;
    fastMultiplier: number;
    mouseCoefficient: number;
  };
}

/** Réglages réservés au serveur. */
export interface ServerConfig {
  /** Pseudos des admins, communs à tous les outils. */
  admins: readonly string[];
  /** Spawn provisoire au chargement (si aucun autre script ne spawne le joueur). */
  spawn: { enabled: boolean };
  noclip: { allowAll: boolean };
  teleport: { allowAll: boolean };
  vehicles: { allowAll: boolean; health: number };
}

export const DEFAULT_CLIENT_CONFIG: ClientConfig = {
  debug: false,
  noclip: { speed: 40, fastMultiplier: 2.5, mouseCoefficient: 0.01 },
};

export const DEFAULT_SERVER_CONFIG: ServerConfig = {
  admins: [],
  spawn: { enabled: true },
  noclip: { allowAll: true },
  teleport: { allowAll: true },
  vehicles: { allowAll: true, health: 2000 },
};

export const ConfigEvents = {
  /** client → serveur : « envoie-moi la config » (au chargement du script client). */
  Request: 'mira:config:request',
  /** serveur → client : la ClientConfig. */
  Sync: 'mira:config:sync',
} as const;
