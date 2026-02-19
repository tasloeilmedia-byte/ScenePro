import { calculateCommission, formatCommission } from '../commission'

describe('calculateCommission', () => {
  test('1000€ booking without referral', () => {
    const result = calculateCommission(1000, false)
    expect(result.artist_price).toBe(1000)
    expect(result.company_fee).toBe(75)
    expect(result.artist_fee).toBe(75)
    expect(result.total_company_pays).toBe(1075)
    expect(result.artist_receives).toBe(925)
    expect(result.platform_gross).toBe(150)
    expect(result.referral_commission).toBe(0)
    expect(result.platform_net).toBe(150)
  })

  test('1000€ booking with active referral (2%)', () => {
    const result = calculateCommission(1000, true)
    expect(result.referral_commission).toBe(20)
    expect(result.platform_net).toBe(130)
    // referral does not change what company pays or artist receives
    expect(result.total_company_pays).toBe(1075)
    expect(result.artist_receives).toBe(925)
  })

  test('rounding: 333€ booking without referral', () => {
    const result = calculateCommission(333, false)
    expect(result.company_fee).toBe(Math.round(333 * 0.075 * 100) / 100)
    expect(result.artist_fee).toBe(Math.round(333 * 0.075 * 100) / 100)
    expect(result.platform_net).toBe(result.platform_gross)
    expect(result.referral_commission).toBe(0)
  })

  test('zero price returns all zeros', () => {
    const result = calculateCommission(0, false)
    expect(result.artist_price).toBe(0)
    expect(result.company_fee).toBe(0)
    expect(result.artist_fee).toBe(0)
    expect(result.total_company_pays).toBe(0)
    expect(result.artist_receives).toBe(0)
    expect(result.platform_gross).toBe(0)
    expect(result.referral_commission).toBe(0)
    expect(result.platform_net).toBe(0)
  })

  test('hasActiveReferral defaults to false', () => {
    const withDefault = calculateCommission(1000)
    const withFalse = calculateCommission(1000, false)
    expect(withDefault).toEqual(withFalse)
  })

  test('commission totals are internally consistent', () => {
    const result = calculateCommission(500, true)
    expect(result.total_company_pays).toBe(result.artist_price + result.company_fee)
    expect(result.artist_receives).toBe(result.artist_price - result.artist_fee)
    expect(result.platform_gross).toBe(result.company_fee + result.artist_fee)
    expect(result.platform_net).toBe(result.platform_gross - result.referral_commission)
  })
})

describe('formatCommission', () => {
  test('no-referral label does not mention parrainage', () => {
    const breakdown = calculateCommission(1000, false)
    const labels = formatCommission(breakdown)
    expect(labels.label_platform).not.toContain('parrainage')
  })

  test('referral label includes parrainage', () => {
    const breakdown = calculateCommission(1000, true)
    const labels = formatCommission(breakdown)
    expect(labels.label_platform).toContain('parrainage')
  })

  test('company label contains total amount', () => {
    const breakdown = calculateCommission(1000, false)
    const labels = formatCommission(breakdown)
    // 1075€ formatted in fr-FR locale contains '1 075'
    expect(labels.label_company).toContain('1\u202f075')
  })

  test('artist label contains net amount', () => {
    const breakdown = calculateCommission(1000, false)
    const labels = formatCommission(breakdown)
    expect(labels.label_artist).toContain('925')
  })
})
