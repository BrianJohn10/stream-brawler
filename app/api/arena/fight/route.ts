import { NextResponse } from "next/server";
import { createServerAdminClient } from "@/utils/supabase/server";
import { ITEM_TEMPLATES } from "@/utils/items";

interface TierConfig {
  name: string;
  fee: number;
  payout: number;
  statPool: number;
}

const TIER_CONFIGS: Record<string, TierConfig> = {
  safe: { name: "Beggar", fee: 10, payout: 15, statPool: 2 },
  fair: { name: "Guard", fee: 25, payout: 50, statPool: 5 },
  suicide: { name: "Knight", fee: 100, payout: 500, statPool: 12 },
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

  // 7. Combat Loop (Max 30 turns to prevent infinite stall loops)
  while (fighterHp > 0 && npc.hp > 0 && turn <= 30) {
    // Determine initiative per turn based on speed stat
    const fighterFirst = fSpeed + Math.random() * 5 >= npc.speed + Math.random() * 5;

    if (fighterFirst) {
      // Fighter Attacks
      const isCrit = Math.random() * 20 + fLuck >= 18;
      let dmg = Math.max(1, fPower + (isCrit ? fPower : 0) - npc.toughness);
      npc.hp -= dmg;
      logs.push(`[Turn ${turn}] ${fighter.name} attacks for ${dmg} dmg${isCrit ? " (CRIT!)" : ""}. ${npc.name} has ${Math.max(0, npc.hp)} HP left.`);

      if (npc.hp <= 0) break;

      // NPC Counters
      const isNpcCrit = Math.random() * 20 + npc.luck >= 18;
      let npcDmg = Math.max(1, npc.power + (isNpcCrit ? npc.power : 0) - fToughness);
      fighterHp -= npcDmg;
      logs.push(`[Turn ${turn}] ${npc.name} counters for ${npcDmg} dmg${isNpcCrit ? " (CRIT!)" : ""}. ${fighter.name} has ${Math.max(0, fighterHp)} HP left.`);
    } else {
      // NPC Attacks First
      const isNpcCrit = Math.random() * 20 + npc.luck >= 18;
      let npcDmg = Math.max(1, npc.power + (isNpcCrit ? npc.power : 0) - fToughness);
      fighterHp -= npcDmg;
      logs.push(`[Turn ${turn}] ${npc.name} attacks for ${npcDmg} dmg${isNpcCrit ? " (CRIT!)" : ""}. ${fighter.name} has ${Math.max(0, fighterHp)} HP left.`);

      if (fighterHp <= 0) break;

      // Fighter Counters
      const isCrit = Math.random() * 20 + fLuck >= 18;
      let dmg = Math.max(1, fPower + (isCrit ? fPower : 0) - npc.toughness);
      npc.hp -= dmg;
      logs.push(`[Turn ${turn}] ${fighter.name} counters for ${dmg} dmg${isCrit ? " (CRIT!)" : ""}. ${npc.name} has ${Math.max(0, npc.hp)} HP left.`);
    }
    turn++;
  }

  const fighterWon = fighterHp > 0 && npc.hp <= 0;

  // 8. Process Outcomes
  if (fighterWon) {
    logs.push(`Victory! ${fighter.name} has defeated ${npc.name}.`);

    // Reward Gold and increment win count
    await supabase
      .from("users")
      .update({ wallet_balance: userData.wallet_balance - tier.fee + tier.payout })
      .eq("id", user.id);

    await supabase
      .from("fighters")
      .update({ wins: fighter.wins + 1 })
      .eq("id", fighter.id);

    // FIXED: Loot Drop System is now strictly isolated INSIDE the victory block
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
        logs.push(`Loot Drop! Found [${droppedItemName}] and sent it to The Vault.`);
      }
    }
  } else {
    logs.push(`Defeat! ${fighter.name} was slain by ${npc.name}.`);

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
    await supabase
      .from('inventory')
      .delete()
      .eq('user_id', user.id)
      .eq('equipped_to', fighter.id);
      
    logs.push(`System Notice: All equipped gear was lost forever in the arena.`);
  }

  // 9. Save combat log to match archive table
  const { data: matchRecord } = await supabase
    .from("match_queue")
    .insert({
      challenger_id: fighter.id,
      status: "completed",
      winner_id: fighterWon ? fighter.id : null,
      fight_log: { steps: logs },
    })
    .select()
    .single();

  // If the fighter died, link their death record profile directly to this match log
  if (!fighterWon && matchRecord) {
    await supabase.from("fighters").update({ death_replay_id: matchRecord.id }).eq("id", fighter.id);
  }

  return NextResponse.json({
    success: true,
    victory: fighterWon,
    battleLogs: logs,
  });
}
