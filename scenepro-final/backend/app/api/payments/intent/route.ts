import { NextRequest, NextResponse } from 'next/server'
import { supabase } from '@/lib/supabase'
import { stripe } from '@/lib/stripe'

export async function POST(req: NextRequest) {
  const { bookingId } = await req.json()

  // 1. Récupérer le booking
  const { data: booking, error } = await supabase
    .from('bookings')
    .select('*, artist:artists(stripe_account_id, stripe_onboarded)')
    .eq('id', bookingId)
    .single()

  if (error || !booking) return NextResponse.json({ error: 'Booking introuvable' }, { status: 404 })
  if (booking.status !== 'accepted') return NextResponse.json({ error: 'Booking non accepté' }, { status: 400 })
  if (!booking.artist.stripe_onboarded) return NextResponse.json({ error: 'Artiste non configuré sur Stripe' }, { status: 400 })

  // 2. Créer le PaymentIntent avec transfert automatique vers l'artiste
  const intent = await stripe.paymentIntents.create({
    amount:   booking.total_company_pays,             // en centimes
    currency: 'eur',
    transfer_data: {
      destination: booking.artist.stripe_account_id!,
      amount:      booking.artist_receives,           // en centimes
    },
    metadata: {
      booking_id:  booking.id,
      booking_ref: booking.reference,
      artist_id:   booking.artist_id,
      company_id:  booking.company_id,
    },
    automatic_payment_methods: { enabled: true },
  })

  // 3. Sauvegarder l'intent dans le booking
  await supabase
    .from('bookings')
    .update({ stripe_payment_intent: intent.id })
    .eq('id', bookingId)

  return NextResponse.json({ clientSecret: intent.client_secret })
}
