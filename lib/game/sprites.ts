// lib/game/sprites.ts

// 1. Define all available sprites by their exact file names (without the .webp extension)
export const SPRITE_ROSTER = {
  common: [
    'lttp-link', 
    'megaman-x',
  ],
  uncommon: [
  ],
  rare: [
  ],
  epic: [
  ],
  legendary: [
  ],
  heirloom: [
  ]
};

// 2. The function to roll a random sprite based on our exact rarity distribution
export function rollRandomSprite(): string {
  const roll = Math.random() * 100;
  let tier: keyof typeof SPRITE_ROSTER;

  // The 60/25/10/4/0.9/0.1 Distribution
  if (roll < 0.1) tier = 'heirloom';
  else if (roll < 1.0) tier = 'legendary';
  else if (roll < 5.0) tier = 'epic';
  else if (roll < 15.0) tier = 'rare';
  else if (roll < 40.0) tier = 'uncommon';
  else tier = 'common';

  const availableSprites = SPRITE_ROSTER[tier];

  // Safety net: If you haven't drawn any sprites for a tier yet, default to common
  if (!availableSprites || availableSprites.length === 0) {
    const fallbacks = SPRITE_ROSTER['common'];
    return fallbacks[Math.floor(Math.random() * fallbacks.length)];
  }

  // Pick a random sprite from the selected tier
  const randomIndex = Math.floor(Math.random() * availableSprites.length);
  return availableSprites[randomIndex];
}