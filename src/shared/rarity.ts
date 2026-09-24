// Weapon rarity tiers shared by the HUD, interaction prompts and ground loot glow.
export const RARITY = [
  { name: 'Comum', color: '#c9c2b2' },
  { name: 'Rara', color: '#3fa9f5' },
  { name: 'Épica', color: '#a468ff' },
  { name: 'Lendária', color: '#ffb81c' },
] as const;

export const rarityOf = (rarity: number | undefined) => RARITY[rarity ?? 0] || RARITY[0];
