export const SpawnEvents = {
  /** client → serveur : « mon jeu est chargé, connais-tu ma position ? ». */
  Check: 'mira:spawn:check',
  /** serveur → client : « je ne te connais pas : spawne-toi » (position serveur encore à 0 0 0). */
  Needed: 'mira:spawn:needed',
} as const;
