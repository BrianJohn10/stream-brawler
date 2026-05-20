"use client";

import { useEffect, useState, useRef } from "react";
import { useParams } from "next/navigation";
import { createClient } from "@supabase/supabase-js";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

// Frame mapping based on 6-frame layout
const POSES = {
  IDLE: { x: 0, y: 0 },
  ATTACK: { x: 1, y: 0 },
  HURT: { x: 2, y: 0 },
  WIN: { x: 0, y: 1 },
  LOSE: { x: 1, y: 1 },
  WALK: { x: 2, y: 1 },
};
// Animation pacing variable (adjust this to speed up or slow down fights)
const TURN_SPEED_MS = 2000;

export default function ReplayPage() {
  const { id } = useParams();
  const [battle, setBattle] = useState<any>(null);
  const [loading, setLoading] = useState(true);

  // Playback Control
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [combatText, setCombatText] = useState("Ready...");

  // Actor States
  const [fighterHp, setFighterHp] = useState(100);
  const [npcHp, setNpcHp] = useState(100);
  const [fPose, setFPose] = useState(POSES.IDLE);
  const [nPose, setNPose] = useState(POSES.IDLE);

  // Facing States (1 = facing right, -1 = facing left)
  const [fFlip, setFFlip] = useState(1);
  const [nFlip, setNFlip] = useState(-1);

  // Position States (distance from their starting edges)
  const [fPos, setFPos] = useState(10); // 10% from left
  const [nPos, setNPos] = useState(10); // 10% from right

  // Floating Damage State
  const [damageIndicators, setDamageIndicators] = useState<{ id: number; text: string; isCrit: boolean; side: "left" | "right" }[]>([]);
  const nextDmgId = useRef(0);

  useEffect(() => {
    const fetchReplay = async () => {
      const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
      const { data } = await supabase.from("battles").select("*").eq("id", id).single();
      if (data) setBattle(data);
      setLoading(false);
    };
    if (id) fetchReplay();
  }, [id]);

  useEffect(() => {
    if (!isPlaying || !battle || currentStep >= battle.battle_log.length) {
      if (currentStep >= battle?.battle_log?.length && battle) {
        setIsPlaying(false);
        // Set end-of-battle poses
        setFPose(battle.is_victory ? POSES.WIN : POSES.LOSE);
        setNPose(battle.is_victory ? POSES.LOSE : POSES.WIN);
      }
      return;
    }

    let isCancelled = false; // Prevents race conditions if paused

    const executeTurn = async () => {
      const frame = battle.battle_log[currentStep];
      setCombatText(frame.message);

      if (frame.type === "action") {
        const isFighterAttacking = frame.attacker === "fighter";
        const walkTime = TURN_SPEED_MS * 0.25;
        const impactTime = TURN_SPEED_MS * 0.25;
        const returnTime = TURN_SPEED_MS * 0.25;
        const restTime = TURN_SPEED_MS * 0.25;

        // 1. RUN UP
        if (isFighterAttacking) {
          setFPose(POSES.WALK);
          setFPos(40);
        }
        else {
          setNPose(POSES.WALK);
          setNPos(40);
        }
        await sleep(walkTime);
        if (isCancelled) return;

        // 2. STRIKE & HURT
        if (isFighterAttacking) {
          setFPose(POSES.ATTACK);
          setNPose(POSES.HURT);
        } else {
          setNPose(POSES.ATTACK);
          setFPose(POSES.HURT);
        }

        // Spawn Floating Damage Text
        const dmgId = nextDmgId.current++;
        setDamageIndicators((prev) => [
          ...prev,
          {
            id: dmgId,
            text: `-${frame.damage}`,
            isCrit: frame.isCrit,
            side: isFighterAttacking ? "right" : "left",
          },
        ]);

        // Update HP Bars
        setFighterHp(frame.fighterHp);
        setNpcHp(frame.npcHp);

        await sleep(impactTime);
        if (isCancelled) return;

        // 3. RUN BACK or DIE
        const isLethal = frame.fighterHp <= 0 || frame.npcHp <= 0;

        if (isLethal) {
          // Lethal Blow: Loser gets knocked back, Winner walks back
          if (frame.fighterHp <= 0) {
            setFPose(POSES.LOSE);
            setFPos(10);
            setNPose(POSES.WALK);
            setNPos(10);
            setNFlip(1); // Face right to walk home
          } else {
            setNPose(POSES.LOSE);
            setNPos(10);
            setFPose(POSES.WALK);
            setFPos(10);
            setFFlip(-1); // Face left to walk home
          }
          await sleep(returnTime);
          if (isCancelled) return;

          // 4. FINAL POSES
          if (frame.fighterHp <= 0) {
            setNPose(POSES.WIN);
            setNFlip(-1); // Snap to face the defeated enemy
          } else {
            setFPose(POSES.WIN);
            setFFlip(1); // Snap to face the defeated enemy
          }
          await sleep(restTime);
        } else {
          // Normal non-lethal run back
          if (isFighterAttacking) {
            setFPose(POSES.WALK);
            setFPos(10);
            setNPose(POSES.IDLE);
            setFFlip(-1);
          } else {
            setNPose(POSES.WALK);
            setNPos(10);
            setFPose(POSES.IDLE);
            setNFlip(1);
          }
          await sleep(returnTime);
          if (isCancelled) return;

          // 4. RESET TO IDLE
          setFPose(POSES.IDLE);
          setNPose(POSES.IDLE);
          setFFlip(1);
          setNFlip(-1);
          await sleep(restTime);
        }
      } else {
        // Non-action frames (start, end, loot)
        await sleep(TURN_SPEED_MS * 0.5);
      }

      if (!isCancelled) setCurrentStep((prev) => prev + 1);
    };

    executeTurn();

    return () => {
      isCancelled = true;
    };
  }, [isPlaying, currentStep, battle]);

  const handlePlayPause = () => {
    if (currentStep >= battle?.battle_log.length) {
      setCurrentStep(0);
      setFighterHp(100);
      setNpcHp(100);
      setFPose(POSES.IDLE);
      setNPose(POSES.IDLE);
      setFPos(10);
      setNPos(10);
      setFFlip(1); // Reset facing
      setNFlip(-1); // Reset facing
    }
    setIsPlaying(!isPlaying);
  };

  if (loading) return <div className="p-12 text-center text-zinc-400">Loading...</div>;
  if (!battle) return <div className="p-12 text-center text-red-500">Replay not found.</div>;

  return (
    <div className="min-h-screen bg-black text-zinc-200 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-4xl bg-zinc-950 border border-zinc-800 rounded-xl p-8 shadow-2xl relative">
        {/* Top Health Bars */}
        <div className="flex justify-between items-center mb-6 font-mono bg-zinc-900/80 p-4 rounded-lg border border-zinc-800">
          <div className="flex-1 text-left">
            <div className="text-sm font-bold text-blue-400 mb-1">Challenger</div>
            <div className="text-xl font-black text-red-500">{fighterHp} HP</div>
          </div>
          <div className="text-sm font-mono text-amber-500 max-w-sm text-center px-4 h-12 flex items-center justify-center">{combatText}</div>
          <div className="flex-1 text-right">
            <div className="text-sm font-bold text-orange-400 mb-1">{battle.npc_name}</div>
            <div className="text-xl font-black text-red-500">{npcHp} HP</div>
          </div>
        </div>

        {/* The Battle Stage */}
        <div className="h-64 border-b border-zinc-800 bg-zinc-900/30 rounded-lg relative overflow-hidden mb-8">
          {/* Fighter Sprite */}
          <div
            className="absolute bottom-8 transition-all ease-in-out"
            style={{
              left: `${fPos}%`,
              transitionDuration: `${TURN_SPEED_MS * 0.25}ms`,
            }}
          >
            <div
              className="w-[128px] h-[128px] origin-bottom"
              style={{
                transform: `scaleX(${fFlip})`,
                backgroundImage: `url(/sprites/fighters/lttp-link-2x.webp)`,
                backgroundPosition: `-${fPose.x * 128}px -${fPose.y * 128}px`,
                imageRendering: "pixelated",
              }}
            />
            {/* Damage indicator anchor */}
            <div className="absolute -top-8 left-1/2 -translate-x-1/2 pointer-events-none">
              {damageIndicators
                .filter((d) => d.side === "left")
                .map((dmg) => (
                  <div key={dmg.id} className={`absolute animate-float-damage font-black text-xl whitespace-nowrap ${dmg.isCrit ? "text-amber-400 scale-125" : "text-red-500"}`}>
                    {dmg.text} {dmg.isCrit && "!"}
                  </div>
                ))}
            </div>
          </div>

          {/* NPC Sprite */}
          <div
            className="absolute bottom-8 transition-all ease-in-out"
            style={{
              right: `${nPos}%`,
              transitionDuration: `${TURN_SPEED_MS * 0.25}ms`,
            }}
          >
            <div
              className="w-[128px] h-[128px] origin-bottom"
              style={{
                transform: `scaleX(${nFlip})`,
                // backgroundImage: `url(/sprites/enemies/${battle.npc_sprite_id}.png)`,
                backgroundImage: `url(/sprites/fighters/megaman-x-2x.webp)`,
                backgroundPosition: `-${nPose.x * 128}px -${nPose.y * 128}px`,
                imageRendering: "pixelated",
              }}
            />
            {/* Damage indicator anchor */}
            <div className="absolute -top-8 left-1/2 -translate-x-1/2 pointer-events-none">
              {damageIndicators
                .filter((d) => d.side === "right")
                .map((dmg) => (
                  <div key={dmg.id} className={`absolute animate-float-damage font-black text-xl whitespace-nowrap ${dmg.isCrit ? "text-amber-400 scale-125" : "text-red-500"}`}>
                    {dmg.text} {dmg.isCrit && "!"}
                  </div>
                ))}
            </div>
          </div>
        </div>

        {/* Controls */}
        <div className="flex justify-center">
          <button onClick={handlePlayPause} className="bg-amber-600 hover:bg-amber-500 text-white font-bold py-3 px-8 rounded-full uppercase tracking-widest">
            {isPlaying ? "Pause" : currentStep >= battle.battle_log.length ? "Restart" : "Play"}
          </button>
        </div>
      </div>
    </div>
  );
}
