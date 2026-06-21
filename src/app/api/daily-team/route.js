import { NextResponse } from 'next/server';
import teamsData from '@/data/teams.json';

export async function GET() {
  // Simple algorithm: pick a team based on the current calendar day
  const dayOfYear = Math.floor((new Date() - new Date(new Date().getFullYear(), 0, 0)) / 86400000);
  const teamIndex = dayOfYear % teamsData.length;
  const dailyTeam = teamsData[teamIndex];

  // Create a safe metadata version for the client (hides player names initially)
  const clientTeamData = {
    year: dailyTeam.year,
    team_name: dailyTeam.team_name,
    season_finish: dailyTeam.season_finish,
    positions: Object.keys(dailyTeam.roster) // ['QB', 'RB', 'WR1', 'WR2', 'TE']
  };

  return NextResponse.json({
    challenge: clientTeamData,
    // For vibe-coding simplicity, we send the answers encrypted or compare them on a POST route.
    // To start quickly, you can pass them or verify them via a verify route.
    id: dailyTeam.id 
  });
}
