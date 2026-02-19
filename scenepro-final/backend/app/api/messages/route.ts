import { NextRequest, NextResponse } from 'next/server'
import { messageQueries } from '@/lib/supabase'

export async function GET(req: NextRequest) {
  const bookingId = req.nextUrl.searchParams.get('bookingId')
  if (!bookingId) return NextResponse.json({ error: 'bookingId requis' }, { status: 400 })
  const { data, error } = await messageQueries.getByBooking(bookingId)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ messages: data })
}

export async function POST(req: NextRequest) {
  const { bookingId, content, senderId } = await req.json()
  const { data, error } = await messageQueries.send(bookingId, senderId, content)
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ message: data }, { status: 201 })
}
