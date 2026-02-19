import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { supabaseAdmin } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const body = await req.text()
  const signature = req.headers.get('stripe-signature')!

  let event
  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch {
    return NextResponse.json({ error: 'Signature invalide' }, { status: 400 })
  }

  switch (event.type) {

    case 'payment_intent.succeeded': {
      const intent = event.data.object as { metadata: { booking_id: string }; amount: number }
      const bookingId = intent.metadata.booking_id
      await supabaseAdmin
        .from('bookings')
        .update({ status: 'paid', payment_status: 'captured', paid_at: new Date().toISOString() })
        .eq('id', bookingId)

      // Envoyer email de confirmation (à connecter avec Resend/SendGrid)
      console.log(`✅ Booking ${bookingId} payé — ${intent.amount / 100} €`)
      break
    }

    case 'payment_intent.payment_failed': {
      const intent = event.data.object as { metadata: { booking_id: string } }
      console.error(`❌ Paiement échoué pour booking ${intent.metadata.booking_id}`)
      break
    }

    case 'account.updated': {
      // Artiste a finalisé son onboarding Stripe Connect
      const account = event.data.object as { id: string; charges_enabled: boolean }
      if (account.charges_enabled) {
        await supabaseAdmin
          .from('artists')
          .update({ stripe_onboarded: true })
          .eq('stripe_account_id', account.id)
      }
      break
    }
  }

  return NextResponse.json({ received: true })
}
