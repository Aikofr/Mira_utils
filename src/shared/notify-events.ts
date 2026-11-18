export const NotifyEvents = {
  /** serveur → client : message à afficher au joueur (texte) : console F8 + bandeau à l'écran. */
  Show: 'mira:notify',
  /** serveur → client : lignes à écrire dans la console F8 seulement (listes longues). */
  Print: 'mira:notify:print',
} as const;
