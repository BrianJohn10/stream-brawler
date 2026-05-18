import { NextResponse } from 'next/server';
import { createServerAdminClient } from '@/utils/supabase/server';

export async function POST(request: Request) {
  const supabase = await createServerAdminClient();

  // 1. Authenticate user
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  // 2. Validate payload
  const body = await request.json().catch(() => ({}));
  const { itemId } = body;

  if (!itemId) {
    return NextResponse.json({ error: 'Item ID is required' }, { status: 400 });
  }

  // 3. Nullify the equipped_to column, safely checking ownership
  const { error: unequipError } = await supabase
    .from('inventory')
    .update({ equipped_to: null })
    .eq('id', itemId)
    .eq('user_id', user.id);

  if (unequipError) {
    return NextResponse.json({ error: unequipError.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}