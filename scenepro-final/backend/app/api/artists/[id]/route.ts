import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const { data, error } = await supabase
    .from('artists')
    .select('*, profile:profiles(*), media:artist_media(*), reviews(*, company:companies(company_name))')
    .eq('id', params.id)
    .eq('status', 'approved')
    .single()

  if (error || !data) return NextResponse.json({ error: 'Artiste introuvable' }, { status: 404 })
  return NextResponse.json({ artist: data })
}
