import { NextResponse } from 'next/server';
import teamsData from '@/data/teams.json';

function getDailyIndex(total) {
  const now = new Date();
  const start = new Date(now.getFullYear(), 0, 0);
  const day = Math.floor((now - start) / 86400000);
  return day % total;
}

export async function POST(request) {
  const { pos, name } = await request.json();
  if (!pos || !name) return NextResponse.json({ correct: false, matchedPos: null });

  const idx = getDailyIndex(teamsData.length);
  const team = teamsData[idx];
  const roster = team.roster;

  const normalize = (s) => s.trim().toLowerCase();

  // WR: check both slots regardless of which was submitted
  if (pos === 'WR1' || pos === 'WR2') {
    if (normalize(roster['WR1']?.name) === normalize(name)) {
      return NextResponse.json({ correct: true, matchedPos: 'WR1' });
    }
    if (normalize(roster['WR2']?.name) === normalize(name)) {
      return NextResponse.json({ correct: true, matchedPos: 'WR2' });
    }
    return NextResponse.json({ correct: false, matchedPos: pos });
  }

  const correct = normalize(roster[pos]?.name) === normalize(name);
  return NextResponse.json({ correct, matchedPos: pos });
}
