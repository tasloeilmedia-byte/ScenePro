import { NextRequest, NextResponse } from 'next/server'
import { stripe } from '@/lib/stripe'
import { supabaseAdmin } from '@/lib/supabase'
import { apiError } from '@/lib/validation'

export async function POST(req: NextRequest) {
  const { artistId, email } = await req.json()

  try {
    // 1. Créer le compte Express Stripe
    const account = await stripe.accounts.create({
      type: 'express', email, country: 'FR',
      capabilities: {
        card_payments: { requested: true },
        transfers:     { requested: true },
      },
    })

    // 2. Sauvegarder l'ID dans la base
    await supabaseAdmin
      .from('artists')
      .update({ stripe_account_id: account.id })
      .eq('id', artistId)

    // 3. Générer le lien d'onboarding
    const link = await stripe.accountLinks.create({
      account:     account.id,
      refresh_url: `${process.env.NEXT_PUBLIC_APP_URL}/artist/dashboard?stripe=refresh`,
      return_url:  `${process.env.NEXT_PUBLIC_APP_URL}/artist/dashboard?stripe=success`,
      type:        'account_onboarding',
    })

    return NextResponse.json({ url: link.url })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Erreur Stripe'
    return apiError(message, 500)
  }
}
