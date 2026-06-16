export interface Team {
  id: number;
  name: string;
  shortName: string;
  crest: string;
  eloRating: number;
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
  score: {
    winner?: 'HOME_TEAM' | 'AWAY_TEAM' | 'DRAW';
    duration: string;
    fullTime: { home: number | null; away: number | null };
    halfTime: { home: number | null; away: number | null };
  };
  competition: {
    id: number;
    name: string;
    code: string;
    type: string;
    emblem: string;
  };
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

export interface Prediction {
  matchId: number;
  homeWinProbability: number;
  drawProbability: number;
  awayWinProbability: number;
  expectedHomeGoals: number;
  expectedAwayGoals: number;
  topScorePredictions: ScorePrediction[];
  confidence: 'HIGH' | 'MEDIUM' | 'LOW';
  generatedAt: string;
}

export interface ScorePrediction {
  homeScore: number;
  awayScore: number;
  probability: number;
}

export interface PredictionResult {
  match: Match;
  prediction: Prediction;
  h2h: H2HRecord;
  homeTeamForm: string[];
  awayTeamForm: string[];
}

export interface SyncStatus {
  lastSync: string;
  matchesSynced: number;
  status: 'success' | 'error' | 'running';
  message?: string;
}
