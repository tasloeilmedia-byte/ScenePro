// ============================================================
// ScènePro — Types TypeScript alignés sur le schéma Supabase
// ============================================================

export type UserRole        = 'artist' | 'company' | 'admin'
export type ArtistStatus    = 'pending' | 'approved' | 'suspended'
export type BookingStatus   = 'pending' | 'accepted' | 'refused' | 'paid' | 'completed' | 'disputed' | 'cancelled'
export type DisputeStatus   = 'open' | 'resolved_artist' | 'resolved_company' | 'resolved_partial'
export type PaymentStatus   = 'pending' | 'captured' | 'refunded' | 'partially_refunded'

// ── TABLES ──────────────────────────────────────────────────

export interface Profile {
  id:         string
  role:       UserRole
  email:      string
  first_name: string | null
  last_name:  string | null
  avatar_url: string | null
  created_at: string
  updated_at: string
}

export interface Artist {
  id:                 string
  profile_id:         string
  stage_name:         string
  category:           ArtistCategory
  bio:                string | null
  city:               string
  zone:               string
  languages:          string[]
  tags:               string[]
  price_min:          number          // en euros
  price_max:          number
  stripe_account_id:  string | null
  stripe_onboarded:   boolean
  status:             ArtistStatus
  total_bookings:     number
  rating_average:     number | null
  rating_count:       number
  referral_code:      string | null
  is_available:       boolean
  created_at:         string
  updated_at:         string
  // relations (jointures)
  profile?:           Profile
  media?:             ArtistMedia[]
}

export interface Company {
  id:             string
  profile_id:     string
  company_name:   string
  sector:         string | null
  siret:          string | null
  city:           string | null
  contact_name:   string | null
  website:        string | null
  total_bookings: number
  total_spent:    number              // en centimes
  created_at:     string
  updated_at:     string
  profile?:       Profile
}

export interface Booking {
  id:                   string
  reference:            string
  artist_id:            string
  company_id:           string
  event_date:           string        // YYYY-MM-DD
  event_duration_hours: number
  event_location:       string
  event_description:    string | null
  // Finances (en centimes)
  artist_price:         number
  company_fee_cents:    number
  artist_fee_cents:     number
  total_company_pays:   number
  artist_receives:      number
  platform_gross:       number
  referral_commission:  number
  platform_net:         number
  referral_id:          string | null
  stripe_payment_intent:string | null
  payment_status:       PaymentStatus
  status:               BookingStatus
  refused_reason:       string | null
  cancelled_reason:     string | null
  accepted_at:          string | null
  paid_at:              string | null
  completed_at:         string | null
  created_at:           string
  updated_at:           string
  // relations
  artist?:              Artist
  company?:             Company
  messages?:            Message[]
}

export interface Message {
  id:         string
  booking_id: string
  sender_id:  string
  content:    string
  read_at:    string | null
  created_at: string
  sender?:    Profile
}

export interface Referral {
  id:             string
  referrer_id:    string
  referred_id:    string
  referral_code:  string
  is_active:      boolean
  expires_at:     string
  total_earned:   number              // en centimes
  created_at:     string
  referrer?:      Artist
  referred?:      Artist
}

export interface Dispute {
  id:              string
  booking_id:      string
  opened_by:       string
  reason:          string
  artist_response: string | null
  admin_notes:     string | null
  status:          DisputeStatus
  resolved_at:     string | null
  refund_percent:  number | null
  created_at:      string
  updated_at:      string
  booking?:        Booking
}

export interface ArtistMedia {
  id:         string
  artist_id:  string
  type:       'photo' | 'video'
  url:        string
  thumbnail:  string | null
  caption:    string | null
  sort_order: number
  created_at: string
}

export interface Review {
  id:         string
  booking_id: string
  artist_id:  string
  company_id: string
  rating:     number              // 1-5
  comment:    string | null
  is_public:  boolean
  created_at: string
  company?:   Company
}

export interface BlogPost {
  id:           string
  title:        string
  slug:         string
  excerpt:      string | null
  content:      string
  cover_url:    string | null
  published:    boolean
  published_at: string | null
  author_id:    string | null
  views:        number
  created_at:   string
  updated_at:   string
}

export interface Favorite {
  id:         string
  company_id: string
  artist_id:  string
  created_at: string
  artist?:    Artist
}

// ── ENUMS / CONSTANTS ────────────────────────────────────────

export type ArtistCategory =
  | 'comedian' | 'magician' | 'musician' | 'dancer'
  | 'speaker'  | 'visual'   | 'circus'   | 'humorist'

export const ARTIST_CATEGORIES: Record<ArtistCategory, { label: string; emoji: string; count?: number }> = {
  comedian: { label: 'Comédien',        emoji: '🎭' },
  magician: { label: 'Magicien',        emoji: '🎩' },
  musician: { label: 'Musicien',        emoji: '🎵' },
  dancer:   { label: 'Danseur',         emoji: '💃' },
  speaker:  { label: 'Conférencier',    emoji: '🎤' },
  visual:   { label: 'Artiste visuel',  emoji: '🎨' },
  circus:   { label: 'Artiste de cirque', emoji: '🤹' },
  humorist: { label: 'Humoriste',       emoji: '😂' },
}

export const BOOKING_STATUS_CONFIG: Record<BookingStatus, { label: string; color: string }> = {
  pending:   { label: 'En attente',   color: '#e8a94a' },
  accepted:  { label: 'Accepté',      color: '#5b8cf5' },
  refused:   { label: 'Refusé',       color: '#e05555' },
  paid:      { label: 'Payé',         color: '#4caf7d' },
  completed: { label: 'Terminé',      color: '#c9a84c' },
  disputed:  { label: 'Litige',       color: '#e05555' },
  cancelled: { label: 'Annulé',       color: '#888' },
}

// ── HELPERS ──────────────────────────────────────────────────

/** Convertit des centimes en euros formatés */
export const centsToEuros = (cents: number): string =>
  new Intl.NumberFormat('fr-FR', { style: 'currency', currency: 'EUR' }).format(cents / 100)

/** Convertit des euros en centimes */
export const eurosToCents = (euros: number): number => Math.round(euros * 100)
