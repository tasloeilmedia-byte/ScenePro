import { NextRequest, NextResponse } from 'next/server'
import { bookingQueries } from '@/lib/supabase'
import { apiError } from '@/lib/validation'

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const { data, error } = await bookingQueries.accept(params.id)
  if (error) return apiError(error.message, error.code === 'PGRST116' ? 404 : 500)
  return NextResponse.json({ booking: data })
}
