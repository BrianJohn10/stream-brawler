"use client";

import { useEffect, useState, useRef } from 'react';
import { createClient } from '@supabase/supabase-js';

// 1. Added ATTACK and LOSE poses (Update x/y to match your sprite sheet!)
const POSES = { 
  IDLE: { x: 0, y: 0 }, 
  WALK: { x: 2, y: 1 },
  ATTACK: { x: 1, y: 0 }, 
  LOSE: { x: 1, y: 1 }    
};

// --- WANDERING FIGHTER COMPONENT ---
function WanderingFighter({ fighter }: { fighter: any }) {
  const initialX = Math.floor(Math.random() * 70) + 10;
  const initialY = Math.floor(Math.random() * 60) + 10;
  
  const [pos, setPos] = useState({ x: initialX, y: initialY });
  const posRef = useRef({ x: initialX, y: initialY }); 
  
  const [pose, setPose] = useState(POSES.IDLE);
  const [flip, setFlip] = useState(Math.random() > 0.5 ? 1 : -1);
  const [speedMs, setSpeedMs] = useState(0);
  
  // NEW: State for the level-up glow
  const [highlight, setHighlight] = useState(false);

  // NEW: A "brain" reference to track what the fighter is currently doing
  const statusRef = useRef({
    isDead: fighter.is_dead,
    isBusy: false,
    level: fighter.level,
    xp: fighter.xp
  });

  // 1. REACTION ENGINE: Listen for Supabase updates
  useEffect(() => {
    const prev = statusRef.current;
    
    // A. DID THEY DIE?
    if (fighter.is_dead && !prev.isDead) {
      statusRef.current.isDead = true;
      setPose(POSES.LOSE);
      setSpeedMs(0); // Stop sliding immediately
    }
    // B. DID THEY LEVEL UP?
    else if (fighter.level > prev.level) {
      setHighlight(true);
      setTimeout(() => setHighlight(false), 3000); // Glow for 3 seconds
    }
    // C. DID THEY FIGHT? (XP changed, but they didn't die)
    else if (fighter.xp !== prev.xp && !fighter.is_dead) {
      statusRef.current.isBusy = true; // Lock the wander loop
      setPose(POSES.ATTACK);
      
      // Hold the attack pose for 2 seconds, then unlock
      setTimeout(() => {
        statusRef.current.isBusy = false;
      }, 2000); 
    }

    // Save current stats for the next comparison
    statusRef.current.level = fighter.level;
    statusRef.current.xp = fighter.xp;
  }, [fighter.is_dead, fighter.level, fighter.xp]);

  // 2. WANDER ENGINE
  useEffect(() => {
    let isCancelled = false;

    const wanderLoop = async () => {
      while (!isCancelled) {
        // If dead, permanently kill the loop
        if (statusRef.current.isDead) {
          setPose(POSES.LOSE);
          break; 
        }

        // If they are currently fighting, pause and check again in a moment
        if (statusRef.current.isBusy) {
          await new Promise(res => setTimeout(res, 500));
          continue;
        }

        // --- IDLE PHASE ---
        setPose(POSES.IDLE);
        const idleTime = Math.floor(Math.random() * 10000) + 5000;
        
        // We wait in 500ms chunks. This allows them to instantly snap 
        // into an ATTACK pose if a fight triggers while they are standing still!
        let waited = 0;
        while (waited < idleTime) {
          if (isCancelled || statusRef.current.isDead || statusRef.current.isBusy) break;
          await new Promise(res => setTimeout(res, 500));
          waited += 500;
        }

        if (isCancelled || statusRef.current.isDead || statusRef.current.isBusy) continue;

        // --- WALK PHASE ---
        const newX = Math.floor(Math.random() * 75) + 5;
        const newY = Math.floor(Math.random() * 60) + 10;
        const currentPos = posRef.current;
        
        setFlip(newX > currentPos.x ? 1 : -1);
        const dist = Math.hypot(newX - currentPos.x, newY - currentPos.y);
        const travelTime = dist * 120;

        setPose(POSES.WALK);
        setSpeedMs(travelTime);
        setPos({ x: newX, y: newY });
        posRef.current = { x: newX, y: newY };

        await new Promise(res => setTimeout(res, travelTime));
      }
    };

    wanderLoop();
    return () => { isCancelled = true; };
  }, []); 

  return (
    <div 
      className="absolute flex flex-col items-center pointer-events-none"
      style={{ 
        left: `${pos.x}%`, 
        top: `${pos.y}%`,
        transitionProperty: 'left, top', 
        transitionDuration: `${speedMs}ms`,
        transitionTimingFunction: 'linear',
        zIndex: Math.floor(pos.y) 
      }}
    >
      {/* Nameplate with dynamic Level-Up Glow */}
      <div className={`bg-black/80 text-white text-[10px] font-mono px-2 py-0.5 rounded-sm mb-1 border whitespace-nowrap transition-all duration-300 ${
        highlight 
          ? 'border-amber-400 shadow-[0_0_12px_rgba(251,191,36,1)] scale-125 text-amber-300' 
          : 'border-zinc-700/50 scale-100'
      }`}>
        {fighter.name} <span className={highlight ? "text-white" : "text-amber-400"}>Lv.{fighter.level || 1}</span>
      </div>

      <div 
        className="w-[128px] h-[128px] origin-bottom transition-transform"
        style={{
          transform: `scaleX(${flip})`,
          backgroundImage: `url(/sprites/fighters/${fighter.sprite_id || 'base_peasant'}.webp)`,
          backgroundPosition: `-${pose.x * 128}px -${pose.y * 128}px`,
          imageRendering: 'pixelated',
          // Optional: Make dead fighters slightly transparent
          opacity: fighter.is_dead ? 0.7 : 1 
        }}
      />
    </div>
  );
}

// --- MAIN WATCHER PAGE ---
export default function WatcherPage() {
  const [fighters, setFighters] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!, 
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
    );
    
    const fetchFighters = async () => {
      const { data } = await supabase
        .from('fighters')
        .select('*')
        .eq('is_dead', false);

      if (data) setFighters(data);
      setLoading(false);
    };

    fetchFighters();
    
    const channel = supabase
      .channel('fighters-lobby-changes')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'fighters' },
        (payload) => {
          
          if (payload.eventType === 'INSERT' && !payload.new.is_dead) {
            setFighters(prev => [...prev, payload.new]);
          }

          if (payload.eventType === 'UPDATE') {
            // NEW: The 60-Second Death Timer
            if (payload.new.is_dead) {
              setTimeout(() => {
                setFighters(current => current.filter(f => f.id !== payload.new.id));
              }, 60000); // 60,000 ms = 1 minute
            }

            // Update their data so the child component can trigger the animations
            setFighters(prev => {
              const exists = prev.some(f => f.id === payload.new.id);
              if (exists) {
                return prev.map(f => f.id === payload.new.id ? payload.new : f);
              } else if (!payload.new.is_dead) {
                return [...prev, payload.new];
              }
              return prev;
            });
          }

          if (payload.eventType === 'DELETE') {
            setFighters(prev => prev.filter(f => f.id !== payload.old.id));
          }
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  if (loading) return null; 

  return (
    <div className="w-screen h-screen overflow-hidden relative bg-transparent">
      {fighters.map(fighter => (
        <WanderingFighter key={fighter.id} fighter={fighter} />
      ))}
    </div>
  );
}