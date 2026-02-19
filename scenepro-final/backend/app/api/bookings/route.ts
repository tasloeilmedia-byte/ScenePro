import { NextRequest, NextResponse } from 'next/server'
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs'
import { cookies } from 'next/headers'
import { bookingQueries } from '@/lib/supabase'
import { apiError } from '@/lib/validation'

export async function POST(req: NextRequest) {
  const body = await req.json()

  // Vérification auth côté serveur (via cookie de session)
  const supabaseAuth = createRouteHandlerClient({ cookies })
  const { data: { session } } = await supabaseAuth.auth.getSession()

  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

  if (!body.artistPrice || body.artistPrice <= 0) {
    return apiError('Prix artiste invalide', 400)
  }

  const { data, error } = await bookingQueries.create({
    artist_id:            body.artistId,
    company_id:           body.companyId,
    event_date:           body.eventDate,
    event_duration_hours: body.durationHours,
    event_location:       body.location,
    event_description:    body.description,
    artist_price:         body.artistPrice,
    referral_code:        body.referralCode,
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ booking: data }, { status: 201 })
}
