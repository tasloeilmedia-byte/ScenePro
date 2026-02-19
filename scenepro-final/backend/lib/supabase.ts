// ============================================================
// lib/supabase.ts — Clients Supabase typés
// ============================================================

import { createClient } from '@supabase/supabase-js'
import type { Artist, Booking, Company, Message, Referral, Review, BlogPost } from '@/types'

const URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE = process.env.SUPABASE_SERVICE_ROLE_KEY!

// Client navigateur (composants client)
export const supabase = createClient(URL, ANON)

// Client serveur (Server Components / API Routes — ignore les sessions RLS)
export const supabaseAdmin = createClient(URL, SERVICE, {
  auth: { persistSession: false },
})

// ============================================================
// ARTISTS — requêtes typées
// ============================================================

export const artistQueries = {

  /** Liste paginée avec filtres */
  async search(params: {
    category?: string
    city?: string
    maxPrice?: number
    available?: boolean
    query?: string
    page?: number
    perPage?: number
    sortBy?: 'recommended' | 'price_asc' | 'price_desc' | 'bookings'
  }) {
    const { category, city, maxPrice, available, query, page = 1, perPage = 12, sortBy = 'recommended' } = params
    const from = (page - 1) * perPage

    let q = supabase
      .from('artists')
      .select('*, profile:profiles(first_name,last_name,avatar_url), media:artist_media(url,type,sort_order)', { count: 'exact' })
      .eq('status', 'approved')

    if (category && category !== 'all') q = q.eq('category', category)
    if (city)       q = q.eq('city', city)
    if (maxPrice)   q = q.lte('price_min', maxPrice)
    if (available)  q = q.eq('is_available', true)
    if (query)      q = q.or(`stage_name.ilike.%${query}%,tags.cs.{${query}}`)

    switch (sortBy) {
      case 'price_asc':  q = q.order('price_min', { ascending: true }); break
      case 'price_desc': q = q.order('price_min', { ascending: false }); break
      case 'bookings':   q = q.order('total_bookings', { ascending: false }); break
      default:           q = q.order('rating_average', { ascending: false, nullsFirst: false }); break
    }

    return q.range(from, from + perPage - 1)
  },

  /** Profil complet d'un artiste (public) */
  async getBySlug(stageNameSlug: string) {
    return supabase
      .from('artists')
      .select(`
        *,
        profile:profiles(first_name,last_name,avatar_url),
        media:artist_media(*, order:sort_order),
        reviews(rating,comment,created_at,company:companies(company_name))
      `)
      .eq('status', 'approved')
      .ilike('stage_name', stageNameSlug.replace(/-/g, ' '))
      .single()
  },

  /** Dashboard artiste — ses propres données */
  async getDashboard(profileId: string) {
    const { data: artist } = await supabase
      .from('artists')
      .select('*')
      .eq('profile_id', profileId)
      .single()

    if (!artist) return null

    const [bookingsRes, referralsRes] = await Promise.all([
      supabase
        .from('bookings')
        .select('*, company:companies(company_name,city)')
        .eq('artist_id', artist.id)
        .order('created_at', { ascending: false })
        .limit(10),

      supabase
        .from('referrals')
        .select('*, referred:artists!referred_id(stage_name,total_bookings)')
        .eq('referrer_id', artist.id)
        .order('created_at', { ascending: false }),
    ])

    // Stats rapides
    const bookings = bookingsRes.data ?? []
    const currentMonth = new Date().toISOString().slice(0, 7)
    const revenueThisMonth = bookings
      .filter(b => b.status === 'completed' && b.completed_at?.startsWith(currentMonth))
      .reduce((acc, b) => acc + (b.artist_receives / 100), 0)

    return {
      artist,
      bookings,
      referrals: referralsRes.data ?? [],
      stats: {
        revenueThisMonth,
        totalBookings: artist.total_bookings,
        pendingBookings: bookings.filter(b => b.status === 'pending').length,
        referralEarnings: (referralsRes.data ?? []).reduce((a, r) => a + r.total_earned / 100, 0),
      },
    }
  },
}

// ============================================================
// BOOKINGS — requêtes typées
// ============================================================

export const bookingQueries = {

  /** Créer un booking (company side) */
  async create(payload: {
    artist_id: string
    company_id: string
    event_date: string
    event_duration_hours: number
    event_location: string
    event_description?: string
    artist_price: number          // en euros
    referral_code?: string
  }) {
    // 1. Calculer les commissions
    const { calculateCommission } = await import('./commission')

    // 2. Chercher si un parrainage actif existe
    let referral: Referral | null = null
    if (payload.referral_code) {
      const { data } = await supabase
        .from('artists')
        .select('id, referrals_sent:referrals!referrer_id(id,referrer_id,is_active,expires_at)')
        .eq('referral_code', payload.referral_code)
        .single()

      if (data) {
        const active = data.referrals_sent?.find((r: any) =>
          r.referred_id === payload.artist_id && r.is_active
        )
        referral = active ?? null
      }
    }

    const commission = calculateCommission(payload.artist_price, !!referral)

    return supabase.from('bookings').insert({
      artist_id:            payload.artist_id,
      company_id:           payload.company_id,
      event_date:           payload.event_date,
      event_duration_hours: payload.event_duration_hours,
      event_location:       payload.event_location,
      event_description:    payload.event_description,
      artist_price:         commission.artist_price * 100,
      company_fee_cents:    commission.company_fee * 100,
      artist_fee_cents:     commission.artist_fee * 100,
      total_company_pays:   commission.total_company_pays * 100,
      artist_receives:      commission.artist_receives * 100,
      platform_gross:       commission.platform_gross * 100,
      referral_commission:  commission.referral_commission * 100,
      platform_net:         commission.platform_net * 100,
      referral_id:          referral?.id ?? null,
      status:               'pending',
    }).select().single()
  },

  /** Accepter un booking (artiste) */
  async accept(bookingId: string) {
    return supabase
      .from('bookings')
      .update({ status: 'accepted', accepted_at: new Date().toISOString() })
      .eq('id', bookingId)
      .select().single()
  },

  /** Refuser un booking (artiste) */
  async refuse(bookingId: string, reason: string) {
    return supabase
      .from('bookings')
      .update({ status: 'refused', refused_reason: reason })
      .eq('id', bookingId)
      .select().single()
  },

  /** Marquer comme terminé + déclencher paiement parrain */
  async markCompleted(bookingId: string) {
    const { data: booking } = await supabase
      .from('bookings')
      .update({ status: 'completed', completed_at: new Date().toISOString() })
      .eq('id', bookingId)
      .select()
      .single()

    // Créditer le parrain si parrainage actif
    if (booking?.referral_id && booking.referral_commission > 0) {
      await supabase
        .from('referrals')
        .update({ total_earned: supabase.raw(`total_earned + ${booking.referral_commission}`) })
        .eq('id', booking.referral_id)
    }

    return booking
  },
}

// ============================================================
// MESSAGES — temps réel
// ============================================================

export const messageQueries = {

  /** Envoyer un message */
  async send(bookingId: string, senderId: string, content: string) {
    return supabase.from('messages').insert({
      booking_id: bookingId,
      sender_id:  senderId,
      content,
    }).select().single()
  },

  /** Récupérer les messages d'un booking */
  async getByBooking(bookingId: string) {
    return supabase
      .from('messages')
      .select('*, sender:profiles(first_name,last_name,avatar_url,role)')
      .eq('booking_id', bookingId)
      .order('created_at', { ascending: true })
  },

  /** S'abonner en temps réel aux nouveaux messages */
  subscribe(bookingId: string, onMessage: (msg: Message) => void) {
    return supabase
      .channel(`booking:${bookingId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `booking_id=eq.${bookingId}` },
        (payload) => onMessage(payload.new as Message)
      )
      .subscribe()
  },

  /** Marquer les messages comme lus */
  async markRead(bookingId: string, userId: string) {
    return supabase
      .from('messages')
      .update({ read_at: new Date().toISOString() })
      .eq('booking_id', bookingId)
      .neq('sender_id', userId)
      .is('read_at', null)
  },
}

// ============================================================
// REFERRALS
// ============================================================

export const referralQueries = {

  /** Valider un code parrainage */
  async validateCode(code: string, newArtistId: string) {
    const { data: referrer } = await supabase
      .from('artists')
      .select('id, stage_name, status')
      .eq('referral_code', code.toUpperCase())
      .eq('status', 'approved')
      .single()

    if (!referrer) return { valid: false, error: 'Code invalide' }
    if (referrer.id === newArtistId) return { valid: false, error: 'Vous ne pouvez pas vous parrainer vous-même' }

    return { valid: true, referrer }
  },

  /** Créer un lien de parrainage après validation artiste */
  async createLink(referrerId: string, referredId: string, code: string) {
    const expiresAt = new Date()
    expiresAt.setMonth(expiresAt.getMonth() + 12)

    return supabase.from('referrals').insert({
      referrer_id:   referrerId,
      referred_id:   referredId,
      referral_code: code,
      expires_at:    expiresAt.toISOString(),
    })
  },
}

// ============================================================
// ADMIN — requêtes avec service role
// ============================================================

export const adminQueries = {

  /** Stats globales dashboard admin */
  async getKPIs() {
    const [artists, companies, bookings, revenue] = await Promise.all([
      supabaseAdmin.from('artists').select('status', { count: 'exact', head: false }),
      supabaseAdmin.from('companies').select('id', { count: 'exact', head: true }),
      supabaseAdmin.from('bookings').select('status,platform_net,created_at', { count: 'exact' }),
      supabaseAdmin.from('bookings').select('platform_net').eq('status', 'completed'),
    ])

    const totalRevenue = (revenue.data ?? []).reduce((a, b) => a + b.platform_net, 0)
    const pendingArtists = (artists.data ?? []).filter(a => a.status === 'pending').length
    const openDisputes = (bookings.data ?? []).filter(b => b.status === 'disputed').length

    return {
      totalArtists:      artists.count ?? 0,
      pendingArtists,
      totalCompanies:    companies.count ?? 0,
      totalBookings:     bookings.count ?? 0,
      openDisputes,
      totalRevenueCents: totalRevenue,
    }
  },

  /** Valider un artiste */
  async approveArtist(artistId: string) {
    return supabaseAdmin
      .from('artists')
      .update({ status: 'approved' })
      .eq('id', artistId)
      .select().single()
  },

  /** Suspendre un artiste */
  async suspendArtist(artistId: string) {
    return supabaseAdmin
      .from('artists')
      .update({ status: 'suspended' })
      .eq('id', artistId)
  },

  /** Résoudre un litige */
  async resolveDispute(disputeId: string, status: 'resolved_artist' | 'resolved_company' | 'resolved_partial', refundPercent?: number) {
    return supabaseAdmin
      .from('disputes')
      .update({
        status,
        refund_percent: refundPercent ?? null,
        resolved_at: new Date().toISOString(),
      })
      .eq('id', disputeId)
  },
}
