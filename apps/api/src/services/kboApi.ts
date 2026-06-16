import axios from 'axios';

const client = axios.create({
  baseURL: 'https://www.thesportsdb.com/api/v1/json/3',
  timeout: 15000,
});

// TheSportsDB KBO 리그 ID
const KBO_LEAGUE_ID = '4342';

export interface SportsDBTeam {
  idTeam: string;
  strTeam: string;
  strTeamShort: string;
  strBadge: string;
}

export interface SportsDBEvent {
  idEvent: string;
  strEvent: string;
  strHomeTeam: string;
  strAwayTeam: string;
  idHomeTeam: string;
  idAwayTeam: string;
  dateEvent: string;
  strTime: string | null;
  intHomeScore: string | null;
  intAwayScore: string | null;
  strStatus: string | null;
  strPostponed: string | null;
  strLeague: string;
  intRound: string | null;
  strTimestamp: string | null;
}

export async function fetchKBOTeams(): Promise<SportsDBTeam[]> {
  try {
    const res = await client.get(`/lookup_all_teams.php?id=${KBO_LEAGUE_ID}`);
    return res.data?.teams || [];
  } catch (e) {
    console.error('fetchKBOTeams error:', e);
    return [];
  }
}

export async function fetchKBOEventsBySeason(season: string): Promise<SportsDBEvent[]> {
  try {
    const res = await client.get(`/eventsseason.php?id=${KBO_LEAGUE_ID}&s=${season}`);
    return res.data?.events || [];
  } catch (e) {
    console.error(`fetchKBOEventsBySeason(${season}) error:`, e);
    return [];
  }
}

export async function fetchKBONextEvents(): Promise<SportsDBEvent[]> {
  try {
    const res = await client.get(`/eventsnextleague.php?id=${KBO_LEAGUE_ID}`);
    return res.data?.events || [];
  } catch (e) {
    console.error('fetchKBONextEvents error:', e);
    return [];
  }
}

export async function fetchKBOLastEvents(): Promise<SportsDBEvent[]> {
  try {
    const res = await client.get(`/eventspastleague.php?id=${KBO_LEAGUE_ID}`);
    return res.data?.events || [];
  } catch (e) {
    console.error('fetchKBOLastEvents error:', e);
    return [];
  }
}
