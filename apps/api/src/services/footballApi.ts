import axios, { AxiosInstance } from 'axios';

interface FootballApiTeam {
  id: number;
  name: string;
  shortName: string;
  crest: string;
}

interface FootballApiScore {
  winner: string | null;
  duration: string;
  fullTime: { home: number | null; away: number | null };
  halfTime: { home: number | null; away: number | null };
}

interface FootballApiMatch {
  id: number;
  utcDate: string;
  status: string;
  matchday: number;
  stage: string;
  group: string | null;
  lastUpdated: string;
  homeTeam: FootballApiTeam;
  awayTeam: FootballApiTeam;
  score: FootballApiScore;
  competition: {
    id: number;
    name: string;
    code: string;
    type: string;
    emblem: string;
  };
}

interface MatchesResponse {
  matches: FootballApiMatch[];
  resultSet: {
    count: number;
    competitions: string;
    first: string;
    last: string;
    played: number;
  };
}

interface StandingsResponse {
  standings: Array<{
    stage: string;
    type: string;
    group: string | null;
    table: Array<{
      position: number;
      team: FootballApiTeam;
      playedGames: number;
      won: number;
      draw: number;
      lost: number;
      points: number;
      goalsFor: number;
      goalsAgainst: number;
      goalDifference: number;
      form: string;
    }>;
  }>;
}

interface H2HResponse {
  head2head: {
    numberOfMatches: number;
    totalGoals: number;
    homeTeam: { wins: number; draws: number; losses: number };
    awayTeam: { wins: number; draws: number; losses: number };
  };
  matches: FootballApiMatch[];
}

class FootballApiClient {
  private client: AxiosInstance;

  constructor() {
    this.client = axios.create({
      baseURL: process.env.FOOTBALL_API_URL || 'https://api.football-data.org/v4',
      headers: {
        'X-Auth-Token': process.env.FOOTBALL_API_KEY || '',
      },
      timeout: 10000,
    });
  }

  async getMatches(league: string = 'PL', status?: string, dateFrom?: string, dateTo?: string): Promise<FootballApiMatch[]> {
    const params: Record<string, string> = {};
    if (status) params.status = status;
    if (dateFrom) params.dateFrom = dateFrom;
    if (dateTo) params.dateTo = dateTo;

    const response = await this.client.get<MatchesResponse>(`/competitions/${league}/matches`, { params });
    return response.data.matches;
  }

  async getStandings(league: string = 'PL'): Promise<StandingsResponse['standings']> {
    const response = await this.client.get<StandingsResponse>(`/competitions/${league}/standings`);
    return response.data.standings;
  }

  async getH2H(matchId: number): Promise<H2HResponse> {
    const response = await this.client.get<H2HResponse>(`/matches/${matchId}/head2head`);
    return response.data;
  }

  async getMatch(matchId: number): Promise<FootballApiMatch> {
    const response = await this.client.get<{ match: FootballApiMatch }>(`/matches/${matchId}`);
    return response.data.match;
  }
}

export const footballApi = new FootballApiClient();
export type { FootballApiMatch, FootballApiTeam, FootballApiScore };
