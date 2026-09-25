// One authorised place-name set for the island. The index is the offline
// sign-atlas cell, so its order is part of the asset contract.
export const SIGN_ART = [
  { label: 'VILA', accent: '#2A9D8F', aspect: 3.8 / (2.5 * .62) },
  { label: 'MERCADÃO', accent: '#E76F51', aspect: 3.4 / (1.29 * .62) },
  { label: 'PORTO', accent: '#3D6FB6', aspect: 3.8 / (2.5 * .62) },
  { label: 'PRAIA', accent: '#F28DB2', aspect: 3.8 / (2.5 * .62) },
  { label: 'MIRANTE', accent: '#E9B44C', aspect: 3.8 / (2.5 * .62) },
] as const;
