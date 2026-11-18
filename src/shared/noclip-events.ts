/** Noms d'événements échangés entre le client et le serveur, préfixés par le domaine. */
export const NoclipEvents = {
  /** Client → serveur : le joueur demande à basculer le noclip. */
  Request: 'noclip:request',
  /** Serveur → client : état accordé (`true` = actif). */
  Set: 'noclip:set',
} as const;
