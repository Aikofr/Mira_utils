export const VehicleEvents = {
  /** serveur → client : s'asseoir au volant du véhicule (ID réseau) dès qu'il est chargé. */
  SeatIn: 'mira:vehicle:seat',
  /** serveur → client : descendre du véhicule actuel (avant sa suppression). */
  Leave: 'mira:vehicle:leave',
} as const;
