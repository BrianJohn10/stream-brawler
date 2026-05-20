import { NextResponse } from "next/server";
import { createServerAdminClient } from "@/utils/supabase/server";
import { ITEM_TEMPLATES } from "@/utils/items";

interface TierConfig {
  name: string;
  fee: number;
  payout: number;
  statPool: number;
  difficulty: number;
}

const TIER_CONFIGS: Record<string, TierConfig> = {
  safe: { name: "Beggar", fee: 10, payout: 15, statPool: 2, difficulty: 1 },
  fair: { name: "Guard", fee: 25, payout: 50, statPool: 5, difficulty: 2 },
  suicide: { name: "Knight", fee: 100, payout: 500, statPool: 12, difficulty: 5 },
};

export async function POST(request: Request) {
  const supabase = await createServerAdminClient();

  // 1. Authenticate user session
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // 2. Validate selected tier
  const body = await request.json().catch(() => ({}));
  const tierKey = body.tier as keyof typeof TIER_CONFIGS;
  const tier = TIER_CONFIGS[tierKey];

  if (!tier) {
    return NextResponse.json({ error: "Invalid tier selected" }, { status: 400 });
  }

  // 3. Verify user's wallet balance
  const { data: userData } = await supabase.from("users").select("wallet_balance").eq("id", user.id).single();

  if (!userData || userData.wallet_balance < tier.fee) {
    return NextResponse.json({ error: "Insufficient gold" }, { status: 400 });
  }

  // 4. Fetch the live fighter
  const { data: fighter } = await supabase.from("fighters").select("*").eq("user_id", user.id).eq("is_dead", false).maybeSingle();

  if (!fighter) {
    return NextResponse.json({ error: "No active fighter found" }, { status: 400 });
  }

  // 5. Deduct entry fee immediately to prevent exploitation
  await supabase
    .from("users")
    .update({ wallet_balance: userData.wallet_balance - tier.fee })
    .eq("id", user.id);

  // 6. Generate the NPC Opponent Profile
  const npc = {
    name: `NPC ${tier.name}`,
    sprite_id: "base_npc",
    hp: 10 + tier.statPool * 2,
    power: 1 + Math.floor(tier.statPool * 0.3),
    toughness: Math.floor(tier.statPool * 0.2),
    speed: 1 + Math.floor(tier.statPool * 0.2),
    luck: Math.floor(tier.statPool * 0.1),
  };

  // Map database stats to combat variables
  let fighterHp = 10 + fighter.stat_vitality * 2;
  const fPower = 1 + fighter.stat_power;
  const fToughness = fighter.stat_toughness;
  const fSpeed = 1 + fighter.stat_speed;
  const fLuck = fighter.stat_luck;

  const logs: string[] = [`Battle Start: ${fighter.name} vs ${npc.name}`];
  let turn = 1;

  const battleLog: any[] = [];
  battleLog.push({
    type: "start",
    message: `Battle Start: ${fighter.name} vs ${npc.name}`,
  });

  // 7. Combat Loop (Max 30 turns to prevent infinite stall loops)
  while (fighterHp > 0 && npc.hp > 0 && turn <= 30) {
    // Determine initiative per turn based on speed stat
    const fighterFirst = fSpeed + Math.random() * 5 >= npc.speed + Math.random() * 5;

    if (fighterFirst) {
      // Fighter Attacks
      const isCrit = Math.random() * 20 + fLuck >= 18;
      let dmg = Math.max(1, fPower + (isCrit ? fPower : 0) - npc.toughness);
      npc.hp -= dmg;
      battleLog.push({
        type: "action",
        turn,
        attacker: "fighter",
        damage: dmg,
        isCrit: isCrit,
        fighterHp: Math.max(0, fighterHp),
        npcHp: Math.max(0, npc.hp),
        message: `[Turn ${turn}] ${fighter.name} attacks for ${dmg} dmg${isCrit ? " (CRIT!)" : ""}. ${npc.name} has ${Math.max(0, npc.hp)} HP left.`,
      });

      if (npc.hp <= 0) break;

      // NPC Counters
      const isNpcCrit = Math.random() * 20 + npc.luck >= 18;
      let npcDmg = Math.max(1, npc.power + (isNpcCrit ? npc.power : 0) - fToughness);
      fighterHp -= npcDmg;
      battleLog.push({
        type: "action",
        turn,
        attacker: "npc",
        damage: npcDmg,
        isCrit: isNpcCrit,
        fighterHp: Math.max(0, fighterHp),
        npcHp: Math.max(0, npc.hp),
        message: `[Turn ${turn}] ${npc.name} counters for ${npcDmg} dmg${isNpcCrit ? " (CRIT!)" : ""}. ${fighter.name} has ${Math.max(0, fighterHp)} HP left.`,
      });
    } else {
      // NPC Attacks First
      const isNpcCrit = Math.random() * 20 + npc.luck >= 18;
      let npcDmg = Math.max(1, npc.power + (isNpcCrit ? npc.power : 0) - fToughness);
      fighterHp -= npcDmg;
      battleLog.push({
        type: "action",
        turn,
        attacker: "npc",
        damage: npcDmg,
        isCrit: isNpcCrit,
        fighterHp: Math.max(0, fighterHp),
        npcHp: Math.max(0, npc.hp),
        message: `[Turn ${turn}] ${npc.name} attacks for ${npcDmg} dmg${isNpcCrit ? " (CRIT!)" : ""}. ${fighter.name} has ${Math.max(0, fighterHp)} HP left.`,
      });

      if (fighterHp <= 0) break;

      // Fighter Counters
      const isCrit = Math.random() * 20 + fLuck >= 18;
      let dmg = Math.max(1, fPower + (isCrit ? fPower : 0) - npc.toughness);
      npc.hp -= dmg;
      battleLog.push({
        type: "action",
        turn,
        attacker: "fighter",
        damage: dmg,
        isCrit: isCrit,
        fighterHp: Math.max(0, fighterHp),
        npcHp: Math.max(0, npc.hp),
        message: `[Turn ${turn}] ${fighter.name} counters for ${dmg} dmg${isCrit ? " (CRIT!)" : ""}. ${npc.name} has ${Math.max(0, npc.hp)} HP left.`,
      });
    }
    turn++;
  }

  const fighterWon = fighterHp > 0 && npc.hp <= 0;

  // 8. Process Outcomes
  if (fighterWon) {
    battleLog.push({ type: "end", message: `Victory! ${fighter.name} has defeated ${npc.name}.` });

    // Experience and Leveling Logic
    const rewardGold = tier.payout;
    // Fallback just in case tier.difficulty is undefined
    const xpGained = tier.difficulty ? tier.difficulty * 50 : Math.floor(rewardGold * 1.5);
    let currentLevel = fighter.level || 1;
    let currentXp = (fighter.xp || 0) + xpGained;
    let xpNeeded = currentLevel * 100;

    const stats = {
      stat_power: fighter.stat_power,
      stat_vitality: fighter.stat_vitality,
      stat_toughness: fighter.stat_toughness,
      stat_speed: fighter.stat_speed,
      stat_finesse: fighter.stat_finesse,
      stat_luck: fighter.stat_luck,
    };

    // Process potential multiple level ups
    while (currentXp >= xpNeeded) {
      currentXp -= xpNeeded;
      currentLevel++;
      xpNeeded = currentLevel * 100;

      // Auto-allocate 1 random stat point per level
      const statKeys = Object.keys(stats) as (keyof typeof stats)[];
      const randomStat = statKeys[Math.floor(Math.random() * statKeys.length)];
      stats[randomStat]++;

      battleLog.push({
        type: "level_up",
        message: `Level Up! Reached Level ${currentLevel}. +1 to ${randomStat.replace("stat_", "").toUpperCase()}.`,
      });
    }

    battleLog.push({ type: "end", message: `Victory! Earned ${rewardGold}g and ${xpGained} XP.` });

    // Update fighter and economy
    await supabase
      .from("fighters")
      .update({
        wins: fighter.wins + 1,
        level: currentLevel,
        xp: currentXp,
        ...stats,
      })
      .eq("id", fighter.id);

    await supabase
      .from("users")
      .update({
        wallet_balance: userData.wallet_balance - tier.fee + rewardGold,
      })
      .eq("id", user.id);

    // Loot Drop Logic
    if (Math.random() <= 0.4) {
      const templateKeys = Object.keys(ITEM_TEMPLATES);
      const randomKey = templateKeys[Math.floor(Math.random() * templateKeys.length)];
      const item = ITEM_TEMPLATES[randomKey];

      const bonusModifier = item.rarity === "legendary" ? 4 : item.rarity === "epic" ? 2 : 0;
      const finalBonusValue = item.baseValue + Math.floor(Math.random() * 2) + bonusModifier;

      const { error: inventoryError } = await supabase.from("inventory").insert({
        user_id: user.id,
        item_template_id: item.id,
        bonus_stats: { [item.baseStat]: finalBonusValue },
      });

      if (!inventoryError) {
        const droppedItemName = `${item.name} (+${finalBonusValue} ${item.baseStat.toUpperCase()})`;
        battleLog.push({
          type: "loot",
          message: `Loot Drop! Found [${droppedItemName}] and sent it to The Vault.`,
        });
      }
    }
  } else {
    battleLog.push({ type: "end", message: `Defeat! ${fighter.name} was slain by ${npc.name}.` });

    // Permanent death execution
    await supabase
      .from("fighters")
      .update({
        is_dead: true,
        killed_by: npc.name,
        died_at: new Date().toISOString(),
      })
      .eq("id", fighter.id);

    // Permanently delete all items equipped to this dead fighter
    await supabase.from("inventory").delete().eq("user_id", user.id).eq("equipped_to", fighter.id);

    battleLog.push({
      type: "system",
      message: `System Notice: All equipped gear was lost forever in the arena.`,
    });
  }

  // 9. Save structured combat log to the new `battles` table (replaces match_queue)
  const { data: battleRecord, error: battleError } = await supabase
    .from("battles")
    .insert({
      user_id: user.id,
      fighter_id: fighter.id,
      npc_name: npc.name,
      npc_sprite_id: npc.sprite_id || "base_npc",
      is_victory: fighterWon,
      battle_log: battleLog,
    })
    .select("id")
    .single();

  if (battleError) console.error("Failed to save replay:", battleError);

  // If the fighter died, link their death record profile directly to this new battle log
  if (!fighterWon && battleRecord) {
    await supabase.from("fighters").update({ death_replay_id: battleRecord.id }).eq("id", fighter.id);
  }

  return NextResponse.json({
    success: true,
    victory: fighterWon,
    battleId: battleRecord?.id, // Pass this to the frontend so we can redirect to the replay URL!
    battleLogs: battleLog,
  });
}
