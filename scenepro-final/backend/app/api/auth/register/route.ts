import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
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
