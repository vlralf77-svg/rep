export type Sport = 'football' | 'baseball';

export interface Team {
  id: number;
  name: string;
  shortName: string;
  crest: string;
  eloRating: number;
  sport: Sport;
}

export interface Match {
  id: number;
  homeTeam: Team;
  awayTeam: Team;
  utcDate: string;
  status: 'SCHEDULED' | 'LIVE' | 'IN_PLAY' | 'PAUSED' | 'FINISHED' | 'POSTPONED' | 'CANCELLED';
  matchday: number;
  stage: string;
  group?: string;
  lastUpdated: string;
  sport: Sport;
  homeScore?: number | null;
  awayScore?: number | null;
  winner?: string | null;
  competitionId: number;
  competitionName: string;
  competitionCode: string;
}

export interface Standing {
  position: number;
  team: Team;
  playedGames: number;
  won: number;
  draw: number;
  lost: number;
  points: number;
  goalsFor: number;
  goalsAgainst: number;
  goalDifference: number;
  form: string;
}

export interface H2HRecord {
  homeTeamId: number;
  awayTeamId: number;
  homeWins: number;
  draws: number;
  awayWins: number;
  homeGoals: number;
  awayGoals: number;
  matches: number;
}

export interface ScorePrediction {
  homeScore: number;
  awayScore: number;
  probability: number;
}

export interface BettingMarkets {
  // 풀타임 승/무/패
  ftHomeWin: number;
  ftDraw: number;
  ftAwayWin: number;
  // 풀타임 오버/언더
  over15: number;
  under15: number;
  over25: number;
  under25: number;
  over35: number;
  under35: number;
  // 전반 승/무/패
  htHomeWin: number;
  htDraw: number;
  htAwayWin: number;
  // 전반 오버/언더
  htOver05: number;
  htUnder05: number;
  htOver15: number;
  htUnder15: number;
}

export interface Prediction {
  matchId: number;
  homeWinProbability: number;
  drawProbability: number;
  awayWinProbability: number;
  expectedHomeGoals: number;
  expectedAwayGoals: number;
  topScorePredictions: ScorePrediction[];
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  betting?: BettingMarkets;
  generatedAt: string;
}

export interface PredictionResult {
  match: Match;
  prediction: Prediction;
  h2h: H2HRecord;
  homeTeamForm: string[];
  awayTeamForm: string[];
}

export interface LeagueInfo {
  code: string;
  name: string;
  sport: Sport;
  flag?: string;
}

export const FOOTBALL_LEAGUES: LeagueInfo[] = [
  { code: 'PL', name: '프리미어리그', sport: 'football', flag: '🏴󠁧󠁢󠁥󠁮󠁧󠁿' },
  { code: 'BL1', name: '분데스리가', sport: 'football', flag: '🇩🇪' },
  { code: 'SA', name: '세리에 A', sport: 'football', flag: '🇮🇹' },
  { code: 'PD', name: '라리가', sport: 'football', flag: '🇪🇸' },
  { code: 'FL1', name: '리그 앙', sport: 'football', flag: '🇫🇷' },
];

export const BASEBALL_LEAGUES: LeagueInfo[] = [
  { code: 'KBO', name: 'KBO 리그', sport: 'baseball', flag: '🇰🇷' },
];
