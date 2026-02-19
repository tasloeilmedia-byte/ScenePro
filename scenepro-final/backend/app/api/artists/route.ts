import { NextRequest, NextResponse } from 'next/server'
import { artistQueries } from '@/lib/supabase'
import { parsePositiveInt, parsePositiveNumber, parseEnum } from '@/lib/validation'

const SORT_OPTIONS = ['recommended', 'price_asc', 'price_desc', 'bookings'] as const
type SortOption = typeof SORT_OPTIONS[number]

export async function GET(req: NextRequest) {
  const { searchParams } = req.nextUrl

  const { data, count, error } = await artistQueries.search({
    category:  searchParams.get('category') ?? undefined,
    city:      searchParams.get('city') ?? undefined,
    maxPrice:  parsePositiveNumber(searchParams.get('maxPrice')),
    available: searchParams.get('available') === 'true',
    query:     searchParams.get('q') ?? undefined,
    page:      parsePositiveInt(searchParams.get('page'), 1),
    perPage:   parsePositiveInt(searchParams.get('perPage'), 12, 100),
    sortBy:    parseEnum<SortOption>(searchParams.get('sortBy'), SORT_OPTIONS, 'recommended'),
  })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ artists: data, total: count })
}
