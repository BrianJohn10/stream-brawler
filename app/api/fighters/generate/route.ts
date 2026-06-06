import { NextResponse } from 'next/server';
import { createServerAdminClient } from '@/utils/supabase/server';
import { rollRandomSprite } from '@/lib/game/sprites'; // Adjust path if needed

export async function POST(request: Request) {
  const supabase = await createServerAdminClient();

  // 1. Authenticate user
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Verify user doesn't already have a living fighter
  const { data: activeFighter } = await supabase
    .from('fighters')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_dead', false)
    .maybeSingle();

  if (activeFighter) {
    return NextResponse.json({ error: 'You already have an active fighter' }, { status: 400 });
  }

// 3. Fetch the user's username, with robust fallbacks for local testing
  const { data: userData } = await supabase
    .from('users')
    .select('twitch_id')
    .eq('id', user.id)
    .single();

  const metaName = user.user_metadata?.preferred_username || user.user_metadata?.name || user.user_metadata?.full_name;
  const emailPrefix = user.email ? user.email.split('@')[0] : null;

  const fighterName = userData?.twitch_id || metaName || emailPrefix || 'Unknown_Brawler';

  // 4. Roll 4 points across 6 stats
  const stats = { power: 0, vitality: 0, toughness: 0, speed: 0, finesse: 0, luck: 0 };
  const statKeys = Object.keys(stats) as (keyof typeof stats)[];
  
  for (let i = 0; i < 4; i++) {
    const randomStat = statKeys[Math.floor(Math.random() * statKeys.length)];
    stats[randomStat]++;
  }

  const newSpriteId = rollRandomSprite();

  // 5. Save the new fighter
  const { data: newFighter, error: insertError } = await supabase
    .from('fighters')
    .insert({
      user_id: user.id,
      name: fighterName || 'Unknown Brawler',
      sprite_id: newSpriteId, 
      stat_power: stats.power,
      stat_vitality: stats.vitality,
      stat_toughness: stats.toughness,
      stat_speed: stats.speed,
      stat_finesse: stats.finesse,
      stat_luck: stats.luck,
    })
    .select()
    .single();

  if (insertError) {
    return NextResponse.json({ error: insertError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, fighter: newFighter });
}