import { NextRequest, NextResponse } from 'next/server'
import { referralQueries } from '@/lib/supabase'

export async function POST(req: NextRequest) {
  const { code, artistId } = await req.json()
  const result = await referralQueries.validateCode(code, artistId)
  return NextResponse.json(result)
}
