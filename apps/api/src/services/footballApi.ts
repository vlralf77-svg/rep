import axios from 'axios';

const client = axios.create({
  baseURL: 'https://api.football-data.org/v4',
  headers: {
    'X-Auth-Token': process.env.FOOTBALL_DATA_API_KEY || '',
  },
  timeout: 10000,
});

export interface ApiTeam {
  id: number;
  name: string;
  shortName: string;
  tla: string;
  crest: string;
}

export interface ApiMatch {
  id: number;
  utcDate: string;
  status: string;
  matchday: number;
  stage: string;
  homeTeam: ApiTeam;
  awayTeam: ApiTeam;
  score: {
    fullTime: { home: number | null; away: number | null };
  };
  competition: { id: string; name: string };
  season: { startDate: string };
}

export interface ApiStanding {
  position: number;
  team: ApiTeam;
  playedGames: number;
  won: number;
  draw: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  form: string;
}

export async function fetchMatches(leagueCode: string, status?: string): Promise<ApiMatch[]> {
  const params: Record<string, string> = {};
  if (status) params.status = status;
  const res = await client.get(`/competitions/${leagueCode}/matches`, { params });
  return res.data.matches;
}

export async function fetchStandings(leagueCode: string): Promise<ApiStanding[]> {
  const res = await client.get(`/competitions/${leagueCode}/standings`);
  const table = res.data.standings.find((s: { type: string }) => s.type === 'TOTAL');
  return table ? table.table : [];
}

export async function fetchH2H(matchId: number): Promise<ApiMatch[]> {
  const res = await client.get(`/matches/${matchId}/head2head`, { params: { limit: 10 } });
  return res.data.matches;
}
