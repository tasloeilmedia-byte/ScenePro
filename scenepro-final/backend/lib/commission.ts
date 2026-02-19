// ============================================================
// lib/commission.ts — Calcul des commissions ScènePro
// ============================================================

const COMMISSION_RATE = 0.15      // 15% total
const COMPANY_SHARE   = 0.075     // 7,5% ajouté à la facture entreprise
const ARTIST_SHARE    = 0.075     // 7,5% déduit du paiement artiste
const REFERRAL_RATE   = 0.02      // 2% reversé au parrain sur chaque booking filleul

export interface CommissionBreakdown {
  artist_price:        number   // prix de base de l'artiste (€)
  company_fee:         number   // +7,5% ajouté à l'entreprise
  artist_fee:          number   // -7,5% déduit de l'artiste
  total_company_pays:  number   // ce que paie réellement l'entreprise
  artist_receives:     number   // ce que reçoit l'artiste net
  platform_gross:      number   // revenu brut plateforme
  referral_commission: number   // part reversée au parrain
  platform_net:        number   // revenu net plateforme après parrainage
}

/**
 * Calcule la répartition complète d'un booking.
 *
 * Exemple — booking à 1 000 € sans parrainage :
 *   company_fee:        75 €   → total entreprise :  1 075 €
 *   artist_fee:         75 €   → artiste reçoit :      925 €
 *   platform_gross:    150 €
 *   referral:            0 €
 *   platform_net:      150 €
 *
 * Même booking AVEC parrainage (2%) :
 *   referral_commission: 20 €  (2% × 1 000 €)
 *   platform_net:       130 €
 */
export function calculateCommission(
  artistPrice: number,
  hasActiveReferral = false
): CommissionBreakdown {
  const round = (n: number) => Math.round(n * 100) / 100

  const company_fee         = round(artistPrice * COMPANY_SHARE)
  const artist_fee          = round(artistPrice * ARTIST_SHARE)
  const total_company_pays  = round(artistPrice + company_fee)
  const artist_receives     = round(artistPrice - artist_fee)
  const platform_gross      = round(company_fee + artist_fee)
  const referral_commission = hasActiveReferral ? round(artistPrice * REFERRAL_RATE) : 0
  const platform_net        = round(platform_gross - referral_commission)

  return {
    artist_price:        artistPrice,
    company_fee,
    artist_fee,
    total_company_pays,
    artist_receives,
    platform_gross,
    referral_commission,
    platform_net,
  }
}

/** Formatage lisible pour affichage */
export function formatCommission(breakdown: CommissionBreakdown) {
  const fmt = (n: number) => n.toLocaleString('fr-FR', { style: 'currency', currency: 'EUR' })
  return {
    label_company:  `Prix artiste ${fmt(breakdown.artist_price)} + frais ${fmt(breakdown.company_fee)} = ${fmt(breakdown.total_company_pays)}`,
    label_artist:   `Prix ${fmt(breakdown.artist_price)} − commission ${fmt(breakdown.artist_fee)} = ${fmt(breakdown.artist_receives)} net`,
    label_platform: `Revenu brut ${fmt(breakdown.platform_gross)}${breakdown.referral_commission > 0 ? ` − parrainage ${fmt(breakdown.referral_commission)} = ${fmt(breakdown.platform_net)} net` : ''}`,
  }
}
