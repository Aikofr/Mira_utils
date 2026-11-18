export const TeleportEvents = {
  /** serveur → client : se téléporter à (x, y, z | null = poser au sol, yaw | null = garder l'orientation). */
  To: 'mira:teleport:to',
  /** serveur → client : se téléporter au marqueur posé sur la carte (commande tpm). */
  ToMarker: 'mira:teleport:marker',
} as const;
