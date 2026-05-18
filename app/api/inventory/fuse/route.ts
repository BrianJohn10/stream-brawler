import { NextResponse } from 'next/server';
import { createServerAdminClient } from '@/utils/supabase/server';
import { ITEM_TEMPLATES } from '@/utils/items';

export async function POST(request: Request) {
  const supabase = await createServerAdminClient();

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });

  const body = await request.json().catch(() => ({}));
  const { item1Id, item2Id } = body;

  if (!item1Id || !item2Id || item1Id === item2Id) {
    return NextResponse.json({ error: 'Must provide two distinct items to fuse' }, { status: 400 });
  }

  // 1. Fetch both items
  const { data: items, error: itemsError } = await supabase
    .from('inventory')
    .select('*')
    .in('id', [item1Id, item2Id])
    .eq('user_id', user.id)
    .is('equipped_to', null);

  if (itemsError || !items || items.length !== 2) {
    return NextResponse.json({ error: 'Items not found, unauthorized, or currently equipped' }, { status: 404 });
  }

  const [item1, item2] = items;

  // 2. Validate identical templates and current stat values
  if (item1.item_template_id !== item2.item_template_id) {
    return NextResponse.json({ error: 'Items must be of the exact same type' }, { status: 400 });
  }

  const statKey = Object.keys(item1.bonus_stats)[0];
  const item1Value = item1.bonus_stats[statKey];
  const item2Value = item2.bonus_stats[statKey];

  if (item1Value !== item2Value) {
    return NextResponse.json({ error: 'Items must have the exact same stat level to fuse' }, { status: 400 });
  }

  // 3. Process the gold fee (Scaling cost: Base 100g * current stat value)
  const template = ITEM_TEMPLATES[item1.item_template_id];
  const fusionCost = 100 * item1Value;

  const { data: userData } = await supabase
    .from('users')
    .select('wallet_balance')
    .eq('id', user.id)
    .single();

  if (!userData || userData.wallet_balance < fusionCost) {
    return NextResponse.json({ error: `Not enough gold. Fusion requires ${fusionCost}g` }, { status: 400 });
  }

  // 4. Execute Transaction: Deduct Gold, Delete Old Items, Mint New Item
  await supabase.from('users').update({ wallet_balance: userData.wallet_balance - fusionCost }).eq('id', user.id);
  await supabase.from('inventory').delete().in('id', [item1Id, item2Id]);

  const newBonusStats = { [statKey]: item1Value + Math.ceil(template.baseValue * 0.5) };

  const { error: insertError } = await supabase
    .from('inventory')
    .insert({
      user_id: user.id,
      item_template_id: template.id,
      bonus_stats: newBonusStats
    });

  if (insertError) return NextResponse.json({ error: insertError.message }, { status: 500 });

  return NextResponse.json({ success: true, newStatValue: newBonusStats[statKey], cost: fusionCost });
}