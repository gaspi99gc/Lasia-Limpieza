import { clearSessionCookie } from '@/lib/authCookie';
import { NextResponse } from 'next/server';

export async function POST() {
    return clearSessionCookie(NextResponse.json({ ok: true }));
}
