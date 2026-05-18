"use client";

import { useEffect, useState } from "react";
import { createClient } from "@/utils/supabase/client";
import { ITEM_TEMPLATES } from "@/utils/items";

interface Fighter {
  id: string;
  name: string;
  sprite_id: string;
  wins: number;
  level: number;
  xp: number;
  stat_power: number;
  stat_vitality: number;
  stat_toughness: number;
  stat_speed: number;
  stat_finesse: number;
  stat_luck: number;
  is_dead: boolean;
  killed_by: string | null;
  died_at: string | null;
}

interface InventoryItem {
  id: string;
  item_template_id: string;
  bonus_stats: Record<string, number>;
  equipped_to: string | null;
}

const RARITY_COLORS = {
  common: "border-zinc-800 bg-zinc-900/40 text-zinc-400 text-zinc-500",
  rare: "border-blue-900/50 bg-blue-950/20 text-blue-400 text-blue-500/70",
  epic: "border-purple-900/50 bg-purple-950/20 text-purple-400 text-purple-500/70",
  legendary: "border-amber-900/60 bg-amber-950/20 text-amber-400 text-amber-500/70",
};

const SLOT_ICONS = {
  weapon: "🗡️",
  armor: "🛡️",
  trinket: "🐾",
};

export default function Dashboard() {
  const [activeTab, setActiveTab] = useState<"equipment" | "arena" | "forge" | "legacy">("equipment");
  const [isMobileExpanded, setIsMobileExpanded] = useState(false);
  const [fighter, setFighter] = useState<Fighter | null>(null);
  const [walletBalance, setWalletBalance] = useState<number>(0);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [battleLogs, setBattleLogs] = useState<string[]>([]);
  const [graveyard, setGraveyard] = useState<Fighter[]>([]);
  const [isFusing, setIsFusing] = useState(false);

  const [loading, setLoading] = useState(true);
  const [isRolling, setIsRolling] = useState(false);
  const [isFighting, setIsFighting] = useState(false);

  const supabase = createClient();

  const fetchActiveFighter = async () => {
    setLoading(true);
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (user) {
      const { data: userData } = await supabase.from("users").select("wallet_balance").eq("id", user.id).single();
      if (userData) setWalletBalance(userData.wallet_balance);

      const { data: fighterData } = await supabase.from("fighters").select("*").eq("user_id", user.id).eq("is_dead", false).maybeSingle();
      setFighter(fighterData);

      const { data: inventoryData } = await supabase.from("inventory").select("*").eq("user_id", user.id);
      if (inventoryData) setInventory(inventoryData);

      // Fetch Graveyard (Dead Fighters)
      const { data: graveyardData } = await supabase.from("fighters").select("*").eq("user_id", user.id).eq("is_dead", true).order("died_at", { ascending: false });

      if (graveyardData) setGraveyard(graveyardData);
    }
    setLoading(false);
  };

  useEffect(() => {
    fetchActiveFighter();
  }, []);

  const handleRollFighter = async () => {
    setIsRolling(true);
    try {
      const response = await fetch("/api/fighters/generate", { method: "POST" });
      const data = await response.json();
      if (data.success) setFighter(data.fighter);
    } finally {
      setIsRolling(false);
    }
  };

  const handleFight = async (tier: "safe" | "fair" | "suicide") => {
    setIsFighting(true);
    setBattleLogs(["Entering the Arena gates..."]);
    try {
      const response = await fetch("/api/arena/fight", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ tier }),
      });
      const data = await response.json();
      if (data.success) {
        setBattleLogs(data.battleLogs);
        await fetchActiveFighter();
      }
    } finally {
      setIsFighting(false);
    }
  };

  const handleEquipItem = async (itemId: string) => {
    try {
      const response = await fetch("/api/inventory/equip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId }),
      });
      const data = await response.json();
      if (data.success) await fetchActiveFighter();
    } catch (err) {
      console.error(err);
    }
  };

  const handleUnequipItem = async (itemId: string) => {
    try {
      const response = await fetch("/api/inventory/unequip", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId }),
      });
      const data = await response.json();
      if (data.success) await fetchActiveFighter();
    } catch (err) {
      console.error(err);
    }
  };

  const handleFuseItems = async (item1Id: string, item2Id: string) => {
    setIsFusing(true);
    try {
      const response = await fetch("/api/inventory/fuse", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item1Id, item2Id }),
      });
      const data = await response.json();

      if (data.success) {
        await fetchActiveFighter();
      } else {
        alert(data.error);
      }
    } finally {
      setIsFusing(false);
    }
  };

  const equippedItems = inventory.filter((item) => fighter && item.equipped_to === fighter.id);
  const unequippedItems = inventory.filter((item) => !fighter || item.equipped_to !== fighter.id);

  const fusionGroups = Object.values(
    unequippedItems.reduce(
      (acc, item) => {
        const statKey = Object.keys(item.bonus_stats)[0];
        const statValue = item.bonus_stats[statKey];
        const groupKey = `${item.item_template_id}_${statKey}_${statValue}`;

        if (!acc[groupKey]) acc[groupKey] = { items: [], templateId: item.item_template_id, statKey, statValue };
        acc[groupKey].items.push(item);
        return acc;
      },
      {} as Record<string, { items: InventoryItem[]; templateId: string; statKey: string; statValue: number }>,
    ),
  ).filter((group) => group.items.length >= 2);

  const bonusStats = { power: 0, speed: 0, vitality: 0, finesse: 0, toughness: 0, luck: 0 };

  equippedItems.forEach((item) => {
    Object.entries(item.bonus_stats).forEach(([key, value]) => {
      const cleanKey = key.replace("stat_", "") as keyof typeof bonusStats;
      if (bonusStats[cleanKey] !== undefined) {
        bonusStats[cleanKey] += value as number;
      }
    });
  });

  // Reusable Stat Row Component
  const StatRow = ({ label, base, bonus }: { label: string; base: number; bonus: number }) => (
    <div>
      <span className="text-zinc-500">{label}:</span> <span className="font-bold">{base}</span>
      {bonus > 0 && <span className="text-emerald-400 font-bold ml-1 text-[10px]">(+{bonus})</span>}
    </div>
  );

  if (loading) {
    return <div className="min-h-screen bg-zinc-950 text-zinc-500 flex items-center justify-center font-mono text-xs uppercase tracking-widest">Loading Profile...</div>;
  }

  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-100 flex flex-col md:flex-row">
      <aside className="w-full md:w-80 border-b md:border-b-0 md:border-r border-zinc-800 bg-zinc-900/50 p-4 md:h-screen md:sticky md:top-0 flex flex-col z-50">
        <div className="flex justify-between items-center pb-4 border-b border-zinc-800">
          <div>
            <h1 className="text-xl font-black tracking-wider text-purple-500">STREAM BRAWLER</h1>
            <div className="flex items-center gap-2 mt-0.5">
              <span className="w-2 h-2 rounded-full bg-red-500 animate-pulse" />
              <span className="text-xs text-zinc-400 font-medium tracking-wide">LIVE ON TWITCH</span>
            </div>
          </div>
          <div className="text-right">
            <span className="text-xs text-zinc-500 uppercase tracking-wider block">Wallet</span>
            <span className="font-bold text-amber-400 text-sm">💰 {walletBalance.toLocaleString()} Gold</span>
          </div>
        </div>

        {fighter ? (
          <div className="mt-4 bg-zinc-900 rounded-xl border border-zinc-800 overflow-hidden">
            <div onClick={() => setIsMobileExpanded(!isMobileExpanded)} className="p-4 flex items-center justify-between cursor-pointer md:cursor-default">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-zinc-800 rounded-lg flex items-center justify-center text-xs uppercase font-bold border border-zinc-700 text-zinc-400">{fighter.sprite_id.substring(0, 3)}</div>
                <div>
                  <h3 className="font-bold text-sm tracking-wide truncate max-w-[140px]">{fighter.name}</h3>
                  <div className="w-32 h-2 bg-zinc-800 rounded-full overflow-hidden border border-zinc-700">
                    <div className="h-full bg-amber-500" style={{ width: `${((fighter.xp || 0) / ((fighter.level || 1) * 100)) * 100}%` }}></div>
                  </div>
                  <span className="text-[10px] text-zinc-500 font-mono">
                    {fighter.xp || 0} / {(fighter.level || 1) * 100} XP
                  </span>
                  <p className="text-xs text-zinc-400">Level {fighter.level || 1} • {fighter.wins} Wins</p>
                </div>
              </div>
              <span className="text-zinc-500 text-xs font-semibold uppercase md:hidden">{isMobileExpanded ? "Hide Stats ▴" : "Show Stats ▾"}</span>
            </div>

            {/* 4. Display Bonus Stats visually in the Fighter Card */}
            <div className={`${isMobileExpanded ? "block" : "hidden"} md:block border-t border-zinc-800 bg-zinc-950/40 p-4 text-xs font-mono grid grid-cols-2 gap-3`}>
              <StatRow label="PWR" base={fighter.stat_power} bonus={bonusStats.power} />
              <StatRow label="SPD" base={fighter.stat_speed} bonus={bonusStats.speed} />
              <StatRow label="VIT" base={fighter.stat_vitality} bonus={bonusStats.vitality} />
              <StatRow label="FIN" base={fighter.stat_finesse} bonus={bonusStats.finesse} />
              <StatRow label="TGH" base={fighter.stat_toughness} bonus={bonusStats.toughness} />
              <StatRow label="LCK" base={fighter.stat_luck} bonus={bonusStats.luck} />
            </div>
          </div>
        ) : (
          <div className="mt-4 p-4 bg-zinc-900 rounded-xl border border-zinc-800 text-center">
            <p className="text-xs text-zinc-400 mb-3">You do not have an active fighter.</p>
            <button onClick={handleRollFighter} disabled={isRolling} className="w-full bg-purple-600 hover:bg-purple-500 disabled:bg-zinc-800 text-white font-bold py-2 px-4 rounded-lg text-xs uppercase tracking-wider transition-colors">
              {isRolling ? "Rolling Stats..." : "Roll New Fighter"}
            </button>
          </div>
        )}
      </aside>

      <main className="flex-1 flex flex-col min-h-0">
        <nav className="flex border-b border-zinc-800 bg-zinc-900/20 sticky top-0 md:top-auto z-40">
          {(["equipment", "arena", "forge", "legacy"] as const).map((tab) => (
            <button key={tab} onClick={() => setActiveTab(tab)} className={`flex-1 py-4 text-xs font-bold uppercase tracking-wider border-b-2 transition-colors ${activeTab === tab ? "border-purple-500 text-purple-400 bg-purple-500/5" : "border-transparent text-zinc-400 hover:text-zinc-200 hover:bg-zinc-900/40"}`}>
              {tab}
            </button>
          ))}
        </nav>

        <section className="p-4 md:p-6 flex-1 overflow-y-auto">
          {/* THE NEW EQUIPMENT VIEW */}
          {activeTab === "equipment" && (
            <div className="space-y-8">
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-bold tracking-tight">Equipment</h2>
                <span className="text-xs text-zinc-500 font-mono">Capacity: {inventory.length} / 100</span>
              </div>

              {/* SECTION: Equipped Items */}
              {equippedItems.length > 0 && (
                <div className="space-y-3">
                  <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest border-b border-zinc-800 pb-2">Currently Equipped</h3>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {equippedItems.map((item) => {
                      const template = ITEM_TEMPLATES[item.item_template_id];
                      if (!template) return null;
                      const statKey = Object.keys(item.bonus_stats)[0];
                      const statValue = item.bonus_stats[statKey];

                      return (
                        <div key={item.id} className={`p-3 rounded-xl border bg-linear-to-b from-zinc-900 to-zinc-900/40 flex flex-col justify-between group transition-transform ${RARITY_COLORS[template.rarity]}`}>
                          <div>
                            <div className="flex justify-between items-start">
                              <span className="text-xl">{SLOT_ICONS[template.slot]}</span>
                              <span className="text-[9px] font-black uppercase font-mono px-1.5 py-0.5 rounded bg-purple-950/60 text-purple-400 border border-purple-900/40 shadow-[0_0_10px_rgba(147,51,234,0.15)]">Equipped</span>
                            </div>
                            <h4 className="font-bold text-xs mt-2 text-zinc-200 truncate group-hover:text-white">{template.name}</h4>
                            <p className="text-[10px] font-mono mt-0.5 opacity-80 uppercase text-zinc-400">
                              +{statValue} {statKey.replace("stat_", "")}
                            </p>
                          </div>
                          <div className="mt-4 pt-2 border-t border-zinc-800/40 flex items-center justify-between h-6">
                            <button onClick={() => handleUnequipItem(item.id)} className="w-full text-center text-[10px] font-bold uppercase tracking-wider text-red-400 hover:text-red-300 font-mono transition-colors opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                              ✕ Remove Gear
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* SECTION: Unequipped Items */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-zinc-400 uppercase tracking-widest border-b border-zinc-800 pb-2">Stored Gear</h3>
                {unequippedItems.length === 0 ? (
                  <div className="border border-dashed border-zinc-800 rounded-xl p-12 text-center text-sm text-zinc-500">No stored items. Win brawls to secure item drops.</div>
                ) : (
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {unequippedItems.map((item) => {
                      const template = ITEM_TEMPLATES[item.item_template_id];
                      if (!template) return null;
                      const statKey = Object.keys(item.bonus_stats)[0];
                      const statValue = item.bonus_stats[statKey];

                      return (
                        <div key={item.id} className={`p-3 rounded-xl border bg-linear-to-b from-zinc-900 to-zinc-900/40 flex flex-col justify-between group transition-transform ${RARITY_COLORS[template.rarity]}`}>
                          <div>
                            <span className="text-xl">{SLOT_ICONS[template.slot]}</span>
                            <h4 className="font-bold text-xs mt-2 text-zinc-200 truncate group-hover:text-white">{template.name}</h4>
                            <p className="text-[10px] font-mono mt-0.5 opacity-80 uppercase text-zinc-400">
                              +{statValue} {statKey.replace("stat_", "")}
                            </p>
                          </div>
                          <div className="mt-4 pt-2 border-t border-zinc-800/40 flex items-center justify-between h-6">
                            <button onClick={() => handleEquipItem(item.id)} disabled={!fighter} className="w-full text-center text-[10px] font-bold uppercase tracking-wider text-emerald-400 hover:text-emerald-300 disabled:text-zinc-600 font-mono transition-colors opacity-100 sm:opacity-0 sm:group-hover:opacity-100">
                              {fighter ? "⚡ Equip Item" : "Requires Fighter"}
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            </div>
          )}

          {activeTab === "arena" && (
            <div className="space-y-6">
              <h2 className="text-lg font-bold tracking-tight">The Arena</h2>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                <button onClick={() => handleFight("safe")} disabled={isFighting || !fighter} className="p-4 rounded-xl bg-zinc-900 border border-emerald-950/40 hover:border-emerald-800/80 disabled:opacity-40 disabled:pointer-events-none transition-colors text-left flex justify-between items-center">
                  <div>
                    <span className="text-[10px] font-bold tracking-wider text-emerald-400 uppercase font-mono">Safe Bet</span>
                    <h4 className="font-bold text-sm mt-0.5">Fight Beggar</h4>
                  </div>
                  <div className="text-right font-mono text-xs">
                    <p className="text-zinc-500">Fee: 10g</p>
                    <p className="font-bold text-emerald-400 mt-0.5">Payout: +15g</p>
                  </div>
                </button>
                <button onClick={() => handleFight("fair")} disabled={isFighting || !fighter} className="p-4 rounded-xl bg-zinc-900 border border-amber-950/40 hover:border-amber-800/80 disabled:opacity-40 disabled:pointer-events-none transition-colors text-left flex justify-between items-center">
                  <div>
                    <span className="text-[10px] font-bold tracking-wider text-amber-400 uppercase font-mono">Fair Fight</span>
                    <h4 className="font-bold text-sm mt-0.5">Fight Guard</h4>
                  </div>
                  <div className="text-right font-mono text-xs">
                    <p className="text-zinc-500">Fee: 25g</p>
                    <p className="font-bold text-amber-400 mt-0.5">Payout: +50g</p>
                  </div>
                </button>
                <button onClick={() => handleFight("suicide")} disabled={isFighting || !fighter} className="p-4 rounded-xl bg-zinc-900 border border-red-950/40 hover:border-red-800/80 disabled:opacity-40 disabled:pointer-events-none transition-colors text-left flex justify-between items-center">
                  <div>
                    <span className="text-[10px] font-bold tracking-wider text-red-400 uppercase font-mono">Suicide Mission</span>
                    <h4 className="font-bold text-sm mt-0.5">Fight Knight</h4>
                  </div>
                  <div className="text-right font-mono text-xs">
                    <p className="text-zinc-500">Fee: 100g</p>
                    <p className="font-bold text-red-400 mt-0.5">Payout: +500g</p>
                  </div>
                </button>
              </div>

              {battleLogs.length > 0 && (
                <div className="bg-zinc-950 rounded-xl border border-zinc-800 p-4 font-mono text-xs text-zinc-400 space-y-1.5 max-h-96 overflow-y-auto shadow-inner">
                  <div className="text-zinc-500 uppercase tracking-widest text-[10px] font-bold border-b border-zinc-900 pb-2 mb-2 flex justify-between">
                    <span>Combat Simulation Feedback Output</span>
                    <span className="animate-pulse text-purple-400">● Core Active</span>
                  </div>
                  {battleLogs.map((log, index) => (
                    <p key={index} className={`${log.includes("Victory!") ? "text-emerald-400 font-bold" : log.includes("Defeat!") ? "text-red-500 font-bold" : log.includes("CRIT!") ? "text-amber-400" : "text-zinc-400"}`}>
                      {log}
                    </p>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* THE BLACKSMITH VIEW */}
          {activeTab === "forge" && (
            <div className="space-y-6">
              <div className="border-b border-zinc-800 pb-4">
                <h2 className="text-lg font-bold tracking-tight">The Blacksmith</h2>
                <p className="text-xs text-zinc-500 mt-1">Combine two identical pieces of gear to forge a stronger version.</p>
              </div>

              {fusionGroups.length === 0 ? (
                <div className="border border-dashed border-zinc-800 rounded-xl p-12 text-center text-sm text-zinc-500 flex flex-col items-center gap-3">
                  <span className="text-3xl opacity-50">⚒️</span>
                  <p>Your inventory does not contain any duplicate items at this time.</p>
                  <p className="text-xs text-zinc-600">Gather matching gear from the Arena to unlock fusion upgrades.</p>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {fusionGroups.map((group) => {
                    const template = ITEM_TEMPLATES[group.templateId];
                    if (!template) return null;

                    const fusionCost = 100 * group.statValue;
                    const canAfford = walletBalance >= fusionCost;

                    return (
                      <div key={`${group.templateId}-${group.statValue}`} className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/40 flex flex-col justify-between">
                        <div className="flex justify-between items-start border-b border-zinc-800/50 pb-3 mb-3">
                          <div className="flex gap-3 items-center">
                            <span className="text-2xl">{SLOT_ICONS[template.slot]}</span>
                            <div>
                              <h4 className="font-bold text-sm text-zinc-200">{template.name}</h4>
                              <p className="text-[10px] font-mono uppercase text-zinc-400">
                                Current: +{group.statValue} {group.statKey.replace("stat_", "")}
                              </p>
                            </div>
                          </div>
                          <div className="text-[10px] font-bold font-mono bg-zinc-800 px-2 py-1 rounded text-zinc-400">x{group.items.length}</div>
                        </div>

                        <button onClick={() => handleFuseItems(group.items[0].id, group.items[1].id)} disabled={isFusing || !canAfford} className="w-full bg-amber-600 hover:bg-amber-500 disabled:bg-zinc-800 text-white font-bold py-2 px-4 rounded-lg text-xs uppercase tracking-wider transition-colors flex justify-between items-center">
                          <span>{isFusing ? "Forging..." : "Fuse Items"}</span>
                          <span className={canAfford ? "text-amber-200" : "text-red-400"}>{fusionCost}g</span>
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {/* THE GRAVEYARD VIEW */}
          {activeTab === "legacy" && (
            <div className="space-y-4">
              <div className="flex justify-between items-center">
                <h2 className="text-lg font-bold tracking-tight">The Graveyard</h2>
                <span className="text-xs text-zinc-500 font-mono">Fallen Heroes: {graveyard.length}</span>
              </div>

              {graveyard.length === 0 ? (
                <div className="border border-dashed border-zinc-800 rounded-xl p-12 text-center text-sm text-zinc-500">No fallen champions recorded. Your legacy is clean.</div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {graveyard.map((deadFighter) => (
                    <div key={deadFighter.id} className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/40 flex flex-col justify-between group">
                      <div className="flex justify-between items-start border-b border-zinc-800 pb-3 mb-3">
                        <div>
                          <h4 className="font-bold text-md text-zinc-300">{deadFighter.name}</h4>
                          <p className="text-[10px] font-mono text-zinc-500 uppercase mt-0.5">Slain by {deadFighter.killed_by || "Unknown"}</p>
                        </div>
                        <div className="text-right">
                          <span className="text-2xl opacity-50 block mb-1">🪦</span>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-2 text-[10px] font-mono text-zinc-400">
                        <div>
                          <span className="text-zinc-600">Wins:</span> <span className="text-amber-400 font-bold">{deadFighter.wins}</span>
                        </div>
                        <div>
                          <span className="text-zinc-600">PWR:</span> {deadFighter.stat_power}
                        </div>
                        <div>
                          <span className="text-zinc-600">TGH:</span> {deadFighter.stat_toughness}
                        </div>
                        <div>
                          <span className="text-zinc-600">SPD:</span> {deadFighter.stat_speed}
                        </div>
                        <div>
                          <span className="text-zinc-600">VIT:</span> {deadFighter.stat_vitality}
                        </div>
                        <div>
                          <span className="text-zinc-600">LCK:</span> {deadFighter.stat_luck}
                        </div>
                      </div>

                      <div className="mt-3 pt-3 border-t border-zinc-800/50 text-[9px] text-zinc-600 font-mono text-right uppercase">Died: {new Date(deadFighter.died_at!).toLocaleDateString()}</div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
