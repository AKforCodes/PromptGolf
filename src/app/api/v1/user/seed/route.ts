import { cookies } from 'next/headers'
import { NextResponse } from 'next/server'
import { getEnv } from '@/lib/env'

export async function GET() {
  const cookieStore = await cookies()
  let userId = cookieStore.get('user_id')?.value

  if (!userId) {
    userId = crypto.randomUUID()
    cookieStore.set('user_id', userId, {
      httpOnly: true,
      secure: getEnv('NODE_ENV', 'development') === 'production',
      sameSite: 'lax',
      path: '/',
      maxAge: 365 * 24 * 60 * 60,
    })
  }

  return NextResponse.json({ user_id: userId })
}
