'use client';

import { useEffect, useState } from 'react';
import { createClient } from '@/utils/supabase/client';

export default function Home() {
  const [userId, setUserId] = useState<string | null>(null);
  const supabase = createClient();

  useEffect(() => {
    const checkUser = async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (user) setUserId(user.id);
    };
    checkUser();

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      if (session?.user) setUserId(session.user.id);
    });

    return () => authListener.subscription.unsubscribe();
  }, [supabase]);

  const handleTwitchLogin = async () => {
    await supabase.auth.signInWithOAuth({
      provider: 'twitch',
      options: {
        redirectTo: `${window.location.origin}`,
      },
    });
  };

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-zinc-950 text-white gap-6">
      <h1 className="text-4xl font-bold">Stream Brawler ⚔️</h1>
      
      {userId ? (
        <div className="flex flex-col items-center gap-4">
          <p className="text-emerald-400 font-semibold tracking-wide">AUTHENTICATION SUCCESSFUL</p>
          <p className="text-zinc-400 text-sm">Your Secure Supabase ID:</p>
          <code className="bg-zinc-900 p-3 rounded-lg text-xs text-zinc-500 select-all border border-zinc-800">
            {userId}
          </code>
        </div>
      ) : (
        <button 
          onClick={handleTwitchLogin}
          className="bg-purple-600 hover:bg-purple-500 text-white font-bold py-3 px-8 rounded-lg transition-all shadow-[0_0_20px_rgba(147,51,234,0.4)] hover:shadow-[0_0_30px_rgba(147,51,234,0.6)]"
        >
          Login with Twitch
        </button>
      )}
    </main>
  );
}