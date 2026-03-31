// app/api/admin/db/route.ts
// view via: GET http://localhost:3000/api/admin/db
// remove this file before going to production!

import { NextResponse } from 'next/server';
import { getSessions, getHistory } from '../../../db/memory';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const session = searchParams.get('session');

  if (session) {
    // GET /api/admin/db?session=session_123 → all turns for that session
    const turns = getHistory(session, 9999);
    return NextResponse.json({ session, total: turns.length, turns });
  }

  // GET /api/admin/db → all sessions summary
  const sessions = getSessions();
  const totalTurns = sessions.reduce((acc, s) => acc + s.turns, 0);

  return NextResponse.json({
    info: {
      total_sessions: sessions.length,
      total_turns: totalTurns,
      db_location: '.data/conversations.db',
      context_window_limit: 10,
      storage_limit: '281 terabytes (SQLite max)',
    },
    sessions,
  });
}