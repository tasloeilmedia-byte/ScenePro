// ============================================================
// hooks/index.ts — Hooks React pour ScènePro
// ============================================================

'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import type { Artist, Booking, Message, Referral } from '@/types'

// ── TYPES PARTAGÉS ──────────────────────────────────────────

interface FetchState<T> {
  data:    T | null
  loading: boolean
  error:   string | null
  refetch: () => void
}

// ── HOOK GÉNÉRIQUE ──────────────────────────────────────────

function useFetch<T>(fetcher: () => Promise<{ data: T | null; error: any }>): FetchState<T> {
  const [data, setData]       = useState<T | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError]     = useState<string | null>(null)
  const ref = useRef(fetcher)
  ref.current = fetcher

  const fetch = useCallback(async () => {
    setLoading(true)
    setError(null)
    const { data, error } = await ref.current()
    if (error) setError(error.message)
    else setData(data)
    setLoading(false)
  }, [])

  useEffect(() => { fetch() }, [fetch])
  return { data, loading, error, refetch: fetch }
}

// ──────────────────────────────────────────────────────────────
// useArtists — liste avec filtres (page de recherche)
// ──────────────────────────────────────────────────────────────

interface ArtistFilters {
  category?: string
  city?:     string
  maxPrice?: number
  available?: boolean
  query?:    string
  page?:     number
  sortBy?:   string
}

export function useArtists(filters: ArtistFilters = {}) {
  const [artists, setArtists] = useState<Artist[]>([])
  const [total, setTotal]     = useState(0)
  const [loading, setLoading] = useState(true)

  const fetch = useCallback(async () => {
    setLoading(true)
    const params = new URLSearchParams()
    if (filters.category && filters.category !== 'all') params.set('category', filters.category)
    if (filters.city)      params.set('city', filters.city)
    if (filters.maxPrice)  params.set('maxPrice', String(filters.maxPrice))
    if (filters.available) params.set('available', 'true')
    if (filters.query)     params.set('q', filters.query)
    if (filters.page)      params.set('page', String(filters.page))
    if (filters.sortBy)    params.set('sortBy', filters.sortBy)

    const res = await fetch(`/api/artists?${params}`)
    const json = await res.json()
    setArtists(json.artists ?? [])
    setTotal(json.total ?? 0)
    setLoading(false)
  }, [JSON.stringify(filters)])

  useEffect(() => { fetch() }, [fetch])

  return { artists, total, loading }
}

// ──────────────────────────────────────────────────────────────
// useArtistProfile — profil complet d'un artiste
// ──────────────────────────────────────────────────────────────

export function useArtistProfile(artistId: string) {
  return useFetch(() =>
    supabase
      .from('artists')
      .select('*, profile:profiles(*), media:artist_media(*), reviews(*,company:companies(company_name))')
      .eq('id', artistId)
      .eq('status', 'approved')
      .single()
  )
}

// ──────────────────────────────────────────────────────────────
// useArtistDashboard — données dashboard artiste (auth requis)
// ──────────────────────────────────────────────────────────────

export function useArtistDashboard() {
  const [data, setData]       = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      const { data: artist } = await supabase
        .from('artists')
        .select('*')
        .eq('profile_id', user.id)
        .single()

      if (!artist) { setLoading(false); return }

      const [bookingsRes, referralsRes, messagesRes] = await Promise.all([
        supabase.from('bookings')
          .select('*, company:companies(company_name,city)')
          .eq('artist_id', artist.id)
          .order('created_at', { ascending: false })
          .limit(20),

        supabase.from('referrals')
          .select('*, referred:artists!referred_id(stage_name,total_bookings,city)')
          .eq('referrer_id', artist.id),

        supabase.from('messages')
          .select('*, booking:bookings(reference,company:companies(company_name)), sender:profiles(first_name,avatar_url,role)')
          .eq('read_at', null)
          .neq('sender_id', user.id)
          .order('created_at', { ascending: false })
          .limit(5),
      ])

      const bookings     = bookingsRes.data    ?? []
      const currentMonth = new Date().toISOString().slice(0, 7)

      setData({
        artist,
        bookings,
        referrals:     referralsRes.data ?? [],
        unreadMessages: messagesRes.data ?? [],
        stats: {
          revenueThisMonth: bookings
            .filter(b => b.status === 'completed' && b.completed_at?.startsWith(currentMonth))
            .reduce((a, b) => a + b.artist_receives / 100, 0),
          totalBookings:    artist.total_bookings,
          pendingCount:     bookings.filter(b => b.status === 'pending').length,
          referralEarnings: (referralsRes.data ?? []).reduce((a: number, r: any) => a + r.total_earned / 100, 0),
        },
      })
      setLoading(false)
    }
    load()
  }, [])

  return { data, loading }
}

// ──────────────────────────────────────────────────────────────
// useCompanyDashboard — données dashboard entreprise
// ──────────────────────────────────────────────────────────────

export function useCompanyDashboard() {
  const [data, setData]       = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const load = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { setLoading(false); return }

      const { data: company } = await supabase
        .from('companies')
        .select('*')
        .eq('profile_id', user.id)
        .single()

      if (!company) { setLoading(false); return }

      const [bookingsRes, favoritesRes] = await Promise.all([
        supabase.from('bookings')
          .select('*, artist:artists(stage_name,category,city,emoji:category)')
          .eq('company_id', company.id)
          .order('created_at', { ascending: false }),

        supabase.from('favorites')
          .select('*, artist:artists(stage_name,category,city,price_min,price_max,is_available)')
          .eq('company_id', company.id),
      ])

      const bookings = bookingsRes.data ?? []

      setData({
        company,
        bookings,
        favorites: favoritesRes.data ?? [],
        stats: {
          totalSpent:     company.total_spent / 100,
          totalBookings:  company.total_bookings,
          eventCount:     bookings.filter(b => b.status === 'completed').length,
          pendingCount:   bookings.filter(b => b.status === 'pending').length,
        },
        nextEvent: bookings
          .filter(b => ['accepted','paid'].includes(b.status) && new Date(b.event_date) > new Date())
          .sort((a, b) => new Date(a.event_date).getTime() - new Date(b.event_date).getTime())[0] ?? null,
      })
      setLoading(false)
    }
    load()
  }, [])

  return { data, loading }
}

// ──────────────────────────────────────────────────────────────
// useMessages — messagerie temps réel pour un booking
// ──────────────────────────────────────────────────────────────

export function useMessages(bookingId: string) {
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading]   = useState(true)

  useEffect(() => {
    if (!bookingId) return

    // Chargement initial
    supabase
      .from('messages')
      .select('*, sender:profiles(first_name,last_name,avatar_url,role)')
      .eq('booking_id', bookingId)
      .order('created_at', { ascending: true })
      .then(({ data }) => { setMessages(data ?? []); setLoading(false) })

    // Abonnement temps réel
    const channel = supabase
      .channel(`messages:${bookingId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'messages', filter: `booking_id=eq.${bookingId}` },
        (payload) => setMessages(prev => [...prev, payload.new as Message])
      )
      .subscribe()

    return () => { supabase.removeChannel(channel) }
  }, [bookingId])

  const sendMessage = async (content: string) => {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return
    await supabase.from('messages').insert({ booking_id: bookingId, sender_id: user.id, content })
  }

  return { messages, loading, sendMessage }
}

// ──────────────────────────────────────────────────────────────
// useAuth — utilisateur courant + profil métier
// ──────────────────────────────────────────────────────────────

export function useAuth() {
  const [user, setUser]       = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    // Chargement initial
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (user) {
        setUser(user)
        const { data } = await supabase.from('profiles').select('*').eq('id', user.id).single()
        setProfile(data)
      }
      setLoading(false)
    })

    // Écouter les changements d'auth
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        setUser(session.user)
        const { data } = await supabase.from('profiles').select('*').eq('id', session.user.id).single()
        setProfile(data)
      } else {
        setUser(null)
        setProfile(null)
      }
      setLoading(false)
    })

    return () => subscription.unsubscribe()
  }, [])

  const signOut = () => supabase.auth.signOut()

  return { user, profile, loading, signOut, isArtist: profile?.role === 'artist', isCompany: profile?.role === 'company', isAdmin: profile?.role === 'admin' }
}

// ──────────────────────────────────────────────────────────────
// useBooking — actions sur un booking (accept / refuse / pay)
// ──────────────────────────────────────────────────────────────

export function useBookingActions() {
  const [loading, setLoading] = useState(false)

  const accept = async (bookingId: string) => {
    setLoading(true)
    const res = await fetch(`/api/bookings/${bookingId}/accept`, { method: 'POST' })
    setLoading(false)
    return res.json()
  }

  const refuse = async (bookingId: string, reason: string) => {
    setLoading(true)
    const res = await fetch(`/api/bookings/${bookingId}/refuse`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
      headers: { 'Content-Type': 'application/json' },
    })
    setLoading(false)
    return res.json()
  }

  const createPaymentIntent = async (bookingId: string) => {
    setLoading(true)
    const res = await fetch('/api/payments/intent', {
      method: 'POST',
      body: JSON.stringify({ bookingId }),
      headers: { 'Content-Type': 'application/json' },
    })
    setLoading(false)
    return res.json()
  }

  return { accept, refuse, createPaymentIntent, loading }
}

// ──────────────────────────────────────────────────────────────
// useAvailability — disponibilités artiste
// ──────────────────────────────────────────────────────────────

export function useAvailability(artistId: string, year: number, month: number) {
  const [blocked, setBlocked] = useState<string[]>([])

  useEffect(() => {
    const start = `${year}-${String(month).padStart(2,'0')}-01`
    const end   = `${year}-${String(month).padStart(2,'0')}-31`

    supabase
      .from('artist_availabilities')
      .select('date')
      .eq('artist_id', artistId)
      .eq('is_blocked', true)
      .gte('date', start)
      .lte('date', end)
      .then(({ data }) => setBlocked((data ?? []).map(d => d.date)))
  }, [artistId, year, month])

  const toggleDay = async (date: string) => {
    if (blocked.includes(date)) {
      await supabase.from('artist_availabilities').delete().eq('artist_id', artistId).eq('date', date)
      setBlocked(prev => prev.filter(d => d !== date))
    } else {
      await supabase.from('artist_availabilities').upsert({ artist_id: artistId, date, is_blocked: true })
      setBlocked(prev => [...prev, date])
    }
  }

  return { blocked, toggleDay }
}
