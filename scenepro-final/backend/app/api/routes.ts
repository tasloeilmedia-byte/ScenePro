// ============================================================
// API ROUTES Next.js 14 (App Router)
// Chaque section correspond à un fichier route.ts séparé
// ============================================================

// ─────────────────────────────────────────────────────────────
// app/api/auth/register/route.ts
// POST /api/auth/register
// ─────────────────────────────────────────────────────────────
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

// POST /api/auth/register
export async function POST_REGISTER(req: NextRequest) {
  const { email, password, role, firstName, lastName, referralCode } = await req.json()

  const supabase = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )

  // 1. Créer le compte Supabase Auth
  const { data: auth, error: authError } = await supabase.auth.signUp({
    email,
    password,
    options: {
      data: { role, first_name: firstName, last_name: lastName },
    },
  })
  if (authError) return NextResponse.json({ error: authError.message }, { status: 400 })

  const userId = auth.user!.id

  // 2. Mettre à jour le profil (le trigger crée déjà la ligne)
  await supabase.from('profiles').update({ first_name: firstName, last_name: lastName }).eq('id', userId)

  // 3. Créer le profil métier selon le rôle
  if (role === 'artist') {
    await supabase.from('artists').insert({
      profile_id: userId,
      stage_name: `${firstName} ${lastName}`,
      category:   'comedian',
      city:       '',
      status:     'pending',
    })

    // 4. Valider le code parrainage si fourni
    if (referralCode) {
      const { data: referrer } = await supabase
        .from('artists')
        .select('id')
        .eq('referral_code', referralCode.toUpperCase())
        .single()

      if (referrer) {
        const { data: newArtist } = await supabase
          .from('artists')
          .select('id')
          .eq('profile_id', userId)
          .single()

        if (newArtist) {
          const expiresAt = new Date()
          expiresAt.setMonth(expiresAt.getMonth() + 12)
          await supabase.from('referrals').insert({
            referrer_id:   referrer.id,
            referred_id:   newArtist.id,
            referral_code: referralCode.toUpperCase(),
            expires_at:    expiresAt.toISOString(),
          })
        }
      }
    }
  } else if (role === 'company') {
    await supabase.from('companies').insert({
      profile_id:   userId,
      company_name: `${firstName} ${lastName}`,
      contact_name: `${firstName} ${lastName}`,
    })
  }

  return NextResponse.json({ user: auth.user, session: auth.session })
}


// ─────────────────────────────────────────────────────────────
// app/api/artists/route.ts
// GET /api/artists?category=comedian&city=Lyon&maxPrice=1500&page=1
// ─────────────────────────────────────────────────────────────
export async function GET_ARTISTS(req: NextRequest) {
  const { searchParams } = req.nextUrl
  const { artistQueries } = await import('@/lib/supabase')

  const { data, count, error } = await artistQueries.search({
    category:  searchParams.get('category') ?? undefined,
    city:      searchParams.get('city') ?? undefined,
    maxPrice:  searchParams.get('maxPrice') ? Number(searchParams.get('maxPrice')) : undefined,
    available: searchParams.get('available') === 'true',
    query:     searchParams.get('q') ?? undefined,
    page:      Number(searchParams.get('page') ?? 1),
    perPage:   Number(searchParams.get('perPage') ?? 12),
    sortBy:    (searchParams.get('sortBy') as any) ?? 'recommended',
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ artists: data, total: count })
}


// ─────────────────────────────────────────────────────────────
// app/api/artists/[id]/route.ts
// GET /api/artists/:id
// ─────────────────────────────────────────────────────────────
export async function GET_ARTIST(req: NextRequest, { params }: { params: { id: string } }) {
  const { supabase } = await import('@/lib/supabase')

  const { data, error } = await supabase
    .from('artists')
    .select('*, profile:profiles(*), media:artist_media(*), reviews(*, company:companies(company_name))')
    .eq('id', params.id)
    .eq('status', 'approved')
    .single()

  if (error || !data) return NextResponse.json({ error: 'Artiste introuvable' }, { status: 404 })
  return NextResponse.json({ artist: data })
}


// ─────────────────────────────────────────────────────────────
// app/api/bookings/route.ts
// POST /api/bookings — créer un booking
// ─────────────────────────────────────────────────────────────
export async function POST_BOOKING(req: NextRequest) {
  const body = await req.json()
  const { bookingQueries } = await import('@/lib/supabase')

  // Vérification auth côté serveur (via cookie de session)
  const { createRouteHandlerClient } = await import('@supabase/auth-helpers-nextjs')
  const { cookies } = await import('next/headers')
  const supabaseAuth = createRouteHandlerClient({ cookies })
  const { data: { session } } = await supabaseAuth.auth.getSession()

  if (!session) return NextResponse.json({ error: 'Non authentifié' }, { status: 401 })

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


// ─────────────────────────────────────────────────────────────
// app/api/bookings/[id]/accept/route.ts
// POST /api/bookings/:id/accept
// ─────────────────────────────────────────────────────────────
export async function POST_ACCEPT(req: NextRequest, { params }: { params: { id: string } }) {
  const { bookingQueries } = await import('@/lib/supabase')
  const { data, error } = await bookingQueries.accept(params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ booking: data })
}


// ─────────────────────────────────────────────────────────────
// app/api/bookings/[id]/refuse/route.ts
// POST /api/bookings/:id/refuse
// ─────────────────────────────────────────────────────────────
export async function POST_REFUSE(req: NextRequest, { params }: { params: { id: string } }) {
  const { reason } = await req.json()
  const { bookingQueries } = await import('@/lib/supabase')
  const { data, error } = await bookingQueries.refuse(params.id, reason)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ booking: data })
}


// ─────────────────────────────────────────────────────────────
// app/api/payments/intent/route.ts
// POST /api/payments/intent — créer un PaymentIntent Stripe
// ─────────────────────────────────────────────────────────────
export async function POST_PAYMENT_INTENT(req: NextRequest) {
  const { bookingId } = await req.json()
  const { supabase } = await import('@/lib/supabase')
  const { stripe } = await import('@/lib/stripe')

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


// ─────────────────────────────────────────────────────────────
// app/api/payments/webhook/route.ts
// POST /api/payments/webhook — Stripe webhook
// ─────────────────────────────────────────────────────────────
export async function POST_WEBHOOK(req: NextRequest) {
  const body = await req.text()
  const signature = req.headers.get('stripe-signature')!
  const { stripe } = await import('@/lib/stripe')
  const { supabaseAdmin, bookingQueries } = await import('@/lib/supabase')

  let event
  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch {
    return NextResponse.json({ error: 'Signature invalide' }, { status: 400 })
  }

  switch (event.type) {

    case 'payment_intent.succeeded': {
      const intent = event.data.object as any
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
      const intent = event.data.object as any
      console.error(`❌ Paiement échoué pour booking ${intent.metadata.booking_id}`)
      break
    }

    case 'account.updated': {
      // Artiste a finalisé son onboarding Stripe Connect
      const account = event.data.object as any
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


// ─────────────────────────────────────────────────────────────
// app/api/artists/stripe-onboarding/route.ts
// POST /api/artists/stripe-onboarding — créer le compte Connect
// ─────────────────────────────────────────────────────────────
export async function POST_STRIPE_ONBOARDING(req: NextRequest) {
  const { artistId, email } = await req.json()
  const { stripe } = await import('@/lib/stripe')
  const { supabaseAdmin } = await import('@/lib/supabase')

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
}


// ─────────────────────────────────────────────────────────────
// app/api/referrals/validate/route.ts
// POST /api/referrals/validate — valider un code parrainage
// ─────────────────────────────────────────────────────────────
export async function POST_VALIDATE_REFERRAL(req: NextRequest) {
  const { code, artistId } = await req.json()
  const { referralQueries } = await import('@/lib/supabase')
  const result = await referralQueries.validateCode(code, artistId)
  return NextResponse.json(result)
}


// ─────────────────────────────────────────────────────────────
// app/api/admin/artists/[id]/approve/route.ts
// POST /api/admin/artists/:id/approve
// ─────────────────────────────────────────────────────────────
export async function POST_APPROVE_ARTIST(req: NextRequest, { params }: { params: { id: string } }) {
  const { adminQueries } = await import('@/lib/supabase')
  const { data, error } = await adminQueries.approveArtist(params.id)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  // TODO: envoyer email de validation à l'artiste
  return NextResponse.json({ artist: data })
}


// ─────────────────────────────────────────────────────────────
// app/api/messages/route.ts
// GET  /api/messages?bookingId=xxx  — lister les messages
// POST /api/messages                — envoyer un message
// ─────────────────────────────────────────────────────────────
export async function GET_MESSAGES(req: NextRequest) {
  const bookingId = req.nextUrl.searchParams.get('bookingId')
  if (!bookingId) return NextResponse.json({ error: 'bookingId requis' }, { status: 400 })
  const { messageQueries } = await import('@/lib/supabase')
  const { data, error } = await messageQueries.getByBooking(bookingId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ messages: data })
}

export async function POST_MESSAGE(req: NextRequest) {
  const { bookingId, content, senderId } = await req.json()
  const { messageQueries } = await import('@/lib/supabase')
  const { data, error } = await messageQueries.send(bookingId, senderId, content)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ message: data }, { status: 201 })
}
