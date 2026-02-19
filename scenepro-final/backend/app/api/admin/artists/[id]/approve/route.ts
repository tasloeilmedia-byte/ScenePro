import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { adminQueries } from '@/lib/supabase'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const supabaseAuth = createRouteHandlerClient({ cookies })
  const { data: { session } } = await supabaseAuth.auth.getSession()

  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  const { data: profile } = await supabaseAuth
    .from('profiles')
    .select('role')
    .eq('id', session.user.id)
    .single()

  if (!profile || profile.role !== 'admin') {
    return NextResponse.json({ error: 'Accès interdit' }, { status: 403 })
  }

  const { data, error } = await adminQueries.approveArtist(params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // TODO: envoyer email de validation à l'artiste
  return NextResponse.json({ artist: data })
}
