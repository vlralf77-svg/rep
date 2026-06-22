export type Selection = 'HOME' | 'DRAW' | 'AWAY';
export type MatchStatus = 'OPEN' | 'LOCKED' | 'FINISHED';
export type MatchResult = 'HOME' | 'DRAW' | 'AWAY' | null;

export interface UserProfile {
  uid: string;
  nickname: string;
  joinedAt: number;
  online: boolean;
}

export interface Match {
  id: string;
  gameNo: string;
  league: string;
  sport: string;
  homeTeam: string;
  awayTeam: string;
  startTime: number;
  oddsHome: number;
  oddsDraw: number;
  oddsAway: number;
  initialOddsHome?: number;
  initialOddsDraw?: number;
  initialOddsAway?: number;
  marketType: string;
  gameKey: string;
  line: number | null;
  status: MatchStatus;
  result: MatchResult;
}

export interface Pick {
  id: string;
  uid: string;
  nickname: string;
  matchId: string;
  selection: Selection;
  comboId?: string;
  stake?: number;
  updatedAt: number;
}

export interface Combo {
  uid: string;
  pickIds: string[];
  totalOdds: number;
  confirmedAt: number;
}

export interface PickSummary {
  HOME: number;
  DRAW: number;
  AWAY: number;
  users: Record<string, Selection>;
}
