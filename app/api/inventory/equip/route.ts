import { NextResponse } from 'next/server';
import { createServerAdminClient } from '@/utils/supabase/server';
import { ITEM_TEMPLATES } from '@/utils/items';

export async function POST(request: Request) {
  const supabase = await createServerAdminClient();

  // 1. Authenticate user session
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Validate payload data
  const body = await request.json().catch(() => ({}));
  const { itemId } = body;

  if (!itemId) {
    return NextResponse.json({ error: 'Item ID is required' }, { status: 400 });
  }

  // 3. Fetch item and confirm ownership
  const { data: item, error: itemError } = await supabase
    .from('inventory')
    .select('*')
    .eq('id', itemId)
    .eq('user_id', user.id)
    .single();

  if (itemError || !item) {
    return NextResponse.json({ error: 'Item not found or unauthorized' }, { status: 404 });
  }

  // 4. Fetch the user's active living fighter
  const { data: fighter, error: fighterError } = await supabase
    .from('fighters')
    .select('id')
    .eq('user_id', user.id)
    .eq('is_dead', false)
    .maybeSingle();

  if (fighterError || !fighter) {
    return NextResponse.json({ error: 'No active living fighter to equip gear on' }, { status: 400 });
  }

  // 5. Look up the item's slot from the static registry
  const template = ITEM_TEMPLATES[item.item_template_id];
  if (!template) {
    return NextResponse.json({ error: 'Invalid item data structure' }, { status: 500 });
  }

  const targetSlot = template.slot;

  // 6. FIXED: Query database for ALL currently equipped items for this specific fighter
  const { data: currentEquipment } = await supabase
    .from('inventory')
    .select('id, item_template_id')
    .eq('user_id', user.id)
    .eq('equipped_to', fighter.id);

  // 7. FIXED: Explicitly isolate items that match the target category slot from the registry blueprints
  if (currentEquipment && currentEquipment.length > 0) {
    const conflictingItemIds: string[] = [];

    for (const eqItem of currentEquipment) {
      const eqTemplate = ITEM_TEMPLATES[eqItem.item_template_id];
      // If the currently equipped item shares the same gear slot as the new item, mark it for removal
      if (eqTemplate && eqTemplate.slot === targetSlot) {
        conflictingItemIds.push(eqItem.id);
      }
    }

    // Unbind matching conflicts safely
    if (conflictingItemIds.length > 0) {
      await supabase.from("inventory").update({ equipped_to: null }).in("id", conflictingItemIds);
    }
  }

  // 8. Equip the target item to the active fighter
  const { error: equipError } = await supabase
    .from('inventory')
    .update({ equipped_to: fighter.id })
    .eq('id', itemId);

  if (equipError) {
    return NextResponse.json({ error: equipError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true, slot: targetSlot });
}