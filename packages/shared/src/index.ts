export interface Team {
  id: number;
  name: string;
  shortName: string;
  tla: string;
  crest?: string;
  eloRating: number;
}

export interface Match {
  id: number;
  homeTeam: Team;
  awayTeam: Team;
  utcDate: string;
  status: 'SCHEDULED' | 'LIVE' | 'IN_PLAY' | 'PAUSED' | 'FINISHED' | 'SUSPENDED' | 'POSTPONED' | 'CANCELLED' | 'AWARDED';
  matchday?: number;
  stage?: string;
  homeScore?: number;
  awayScore?: number;
  leagueId: string;
  leagueName: string;
  season: string;
}

export interface Standing {
  position: number;
  team: Team;
  playedGames: number;
  won: number;
  draw: number;
  lost: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  points: number;
  form?: string;
}

export interface H2HRecord {
  homeTeam: Team;
  awayTeam: Team;
  matches: Match[];
  homeWins: number;
  draws: number;
  awayWins: number;
}

export interface ScorePrediction {
  homeScore: number;
  awayScore: number;
  probability: number;
}

export interface PredictionResult {
  matchId: number;
  homeWinProbability: number;
  drawProbability: number;
  awayWinProbability: number;
  expectedHomeGoals: number;
  expectedAwayGoals: number;
  topScores: ScorePrediction[];
  homeElo: number;
  awayElo: number;
  rationale: string;
  computedAt: string;
}

export interface LeagueFilter {
  id: string;
  name: string;
  flag?: string;
}

export const SUPPORTED_LEAGUES: LeagueFilter[] = [
  { id: 'PL', name: '프리미어리그', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
  { id: 'BL1', name: '분데스리가', flag: '🇩🇪' },
  { id: 'SA', name: '세리에 A', flag: '🇮🇹' },
  { id: 'PD', name: '라리가', flag: '🇪🇸' },
  { id: 'FL1', name: '리그 앙', flag: '🇫🇷' },
];
