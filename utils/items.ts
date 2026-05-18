export interface ItemTemplate {
  id: string;
  name: string;
  slot: 'weapon' | 'armor' | 'trinket';
  rarity: 'common' | 'rare' | 'epic' | 'legendary';
  baseStat: 'power' | 'toughness' | 'vitality' | 'speed' | 'finesse' | 'luck';
  baseValue: number;
}

export const ITEM_TEMPLATES: Record<string, ItemTemplate> = {
  rusty_dagger: { id: 'rusty_dagger', name: 'Rusty Dagger', slot: 'weapon', rarity: 'common', baseStat: 'power', baseValue: 1 },
  iron_sword: { id: 'iron_sword', name: 'Iron Sword', slot: 'weapon', rarity: 'rare', baseStat: 'power', baseValue: 3 },
  knight_greatsword: { id: 'knight_greatsword', name: 'Knight Greatsword', slot: 'weapon', rarity: 'epic', baseStat: 'power', baseValue: 6 },
  excalibur: { id: 'excalibur', name: 'Excalibur', slot: 'weapon', rarity: 'legendary', baseStat: 'finesse', baseValue: 12 },
  
  padded_vest: { id: 'padded_vest', name: 'Padded Vest', slot: 'armor', rarity: 'common', baseStat: 'toughness', baseValue: 1 },
  chainmail: { id: 'chainmail', name: 'Chainmail Tunic', slot: 'armor', rarity: 'rare', baseStat: 'toughness', baseValue: 3 },
  plate_armor: { id: 'plate_armor', name: 'Guardian Plate', slot: 'armor', rarity: 'epic', baseStat: 'vitality', baseValue: 5 },
  
  rabbit_foot: { id: 'rabbit_foot', name: "Lucky Rabbit Foot", slot: 'trinket', rarity: 'rare', baseStat: 'luck', baseValue: 2 },
};