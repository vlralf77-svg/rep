import axios from 'axios';

const client = axios.create({
  baseURL: 'https://www.thesportsdb.com/api/v1/json/3',
  timeout: 10000,
});

const KBO_LEAGUE_ID = '4342';

export interface SportsDBTeam {
  idTeam: string;
  strTeam: string;
  strTeamShort: string;
  strBadge: string;
  strLeague: string;
}

export interface SportsDBEvent {
  idEvent: string;
  strEvent: string;
  strHomeTeam: string;
  strAwayTeam: string;
  idHomeTeam: string;
  idAwayTeam: string;
  dateEvent: string;
  strTime: string;
  intHomeScore: string | null;
  intAwayScore: string | null;
  strStatus: string;
  strLeague: string;
  intRound: string;
}

export async function fetchKBOTeams(): Promise<SportsDBTeam[]> {
  const res = await client.get(`/lookup_all_teams.php?id=${KBO_LEAGUE_ID}`);
  return res.data.teams || [];
}

export async function fetchKBOEvents(season: string = '2025'): Promise<SportsDBEvent[]> {
  const res = await client.get(`/eventsseason.php?id=${KBO_LEAGUE_ID}&s=${season}`);
  return res.data.events || [];
}

export async function fetchKBONextEvents(): Promise<SportsDBEvent[]> {
  const res = await client.get(`/eventsnextleague.php?id=${KBO_LEAGUE_ID}`);
  return res.data.events || [];
}

export async function fetchKBOLastEvents(): Promise<SportsDBEvent[]> {
  const res = await client.get(`/eventspastleague.php?id=${KBO_LEAGUE_ID}`);
  return res.data.events || [];
}
