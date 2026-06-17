import axios from 'axios';
import { BetmanGame, BetmanMarket } from './api';

const FOOTBALL_API_KEY = '6942278d1b1e447bb04375f4b84ce286';
const FOOTBALL_BASE = 'https://api.football-data.org/v4';
const SPORTSDB_BASE = 'https://www.thesportsdb.com/api/v1/json/3';
const KBO_LEAGUE_ID = '4342';

export interface LiveScore {
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
  status: 'LIVE' | 'FINISHED' | 'SCHEDULED';
  minute?: number;
  timestamp: number;
  sport: string;
}

// KBO 팀 이름 매핑 (betman 한글 → TheSportsDB 영문)
const KBO_MAP: Record<string, string> = {
  'Doosan Bears': '두산', 'LG Twins': 'LG', 'Samsung Lions': '삼성',
  'Hanwha Eagles': '한화', 'Kiwoom Heroes': '키움', 'NC Dinos': 'NC',
  'SSG Landers': 'SSG', 'KT Wiz': 'KT', 'Lotte Giants': '롯데',
  'KIA Tigers': 'KIA', 'KIA Tigers FC': 'KIA',
};

function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

function yesterdayStr(): string {
  const d = new Date(Date.now() - 24 * 60 * 60 * 1000);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export async function fetchLiveScores(): Promise<LiveScore[]> {
  const scores: LiveScore[] = [];
  const today = todayStr();
  const yesterday = yesterdayStr();

  // Football (football-data.org) - 오늘+어제
  try {
    const res = await axios.get(`${FOOTBALL_BASE}/matches`, {
      headers: { 'X-Auth-Token': FOOTBALL_API_KEY },
      params: { dateFrom: yesterday, dateTo: today },
      timeout: 10000,
    });
    for (const m of (res.data.matches || [])) {
      const ts = new Date(m.utcDate).getTime();
      const st = m.status;
      const status: LiveScore['status'] =
        ['IN_PLAY', 'PAUSED', 'HALFTIME', 'EXTRA_TIME', 'PENALTY_SHOOTOUT'].includes(st) ? 'LIVE'
          : st === 'FINISHED' ? 'FINISHED' : 'SCHEDULED';
      scores.push({
        homeTeam: m.homeTeam?.name || '',
        awayTeam: m.awayTeam?.name || '',
        homeScore: m.score?.fullTime?.home ?? m.score?.halfTime?.home ?? 0,
        awayScore: m.score?.fullTime?.away ?? m.score?.halfTime?.away ?? 0,
        status,
        minute: m.minute ?? undefined,
        timestamp: ts,
        sport: '축구',
      });
    }
  } catch (e) {
    console.error('[livescore] football fetch failed', e);
  }

  // KBO Baseball (TheSportsDB) - 오늘+어제
  for (const day of [today, yesterday]) {
    try {
      const res = await axios.get(`${SPORTSDB_BASE}/eventsday.php`, {
        params: { d: day, l: KBO_LEAGUE_ID },
        timeout: 10000,
      });
      for (const e of (res.data.events || [])) {
        const ts = e.strTimestamp ? new Date(e.strTimestamp).getTime()
          : new Date(`${e.dateEvent}T${e.strTime || '18:00:00'}+09:00`).getTime();
        const hasScore = e.intHomeScore !== null && e.intHomeScore !== '';
        const hs = hasScore ? parseInt(e.intHomeScore) : 0;
        const as_ = hasScore ? parseInt(e.intAwayScore) : 0;
        let status: LiveScore['status'] = 'SCHEDULED';
        if (e.strStatus === 'FT' || e.strStatus === 'AOT') status = 'FINISHED';
        else if (hasScore && e.strStatus !== 'NS') status = 'LIVE';
        // TheSportsDB 영문 → 한글
        const homeKr = KBO_MAP[e.strHomeTeam] || e.strHomeTeam || '';
        const awayKr = KBO_MAP[e.strAwayTeam] || e.strAwayTeam || '';
        scores.push({
          homeTeam: homeKr, awayTeam: awayKr,
          homeScore: hs, awayScore: as_,
          status, timestamp: ts, sport: '야구',
        });
      }
    } catch (e) {
      console.error(`[livescore] KBO fetch failed for ${day}`, e);
    }
  }

  return scores;
}

// betman 경기와 라이브스코어 매칭 (시간 + 팀명)
export function matchScore(game: BetmanGame, scores: LiveScore[]): LiveScore | null {
  if (!game.gameDate) return null;
  const gameTs = new Date(game.gameDate).getTime();
  const TOLERANCE = 30 * 60 * 1000;

  const candidates = scores.filter(s => {
    if (s.sport !== game.sport) return false;
    return Math.abs(s.timestamp - gameTs) < TOLERANCE;
  });

  if (candidates.length === 0) return null;
  if (candidates.length === 1) return candidates[0];

  // 여러 후보가 있으면 팀명으로 매칭
  for (const c of candidates) {
    const homeMatch = game.homeTeam.includes(c.homeTeam) || c.homeTeam.includes(game.homeTeam);
    const awayMatch = game.awayTeam.includes(c.awayTeam) || c.awayTeam.includes(game.awayTeam);
    if (homeMatch || awayMatch) return c;
  }

  // 가장 시간 가까운 후보
  candidates.sort((a, b) => Math.abs(a.timestamp - gameTs) - Math.abs(b.timestamp - gameTs));
  return candidates[0];
}

// 스코어 → 마켓 결과 자동 판정
export function determineResult(
  marketType: string,
  homeScore: number,
  awayScore: number,
  line?: number,
): string | null {
  if (marketType.includes('승무패') || marketType === '전반 승무패') {
    return homeScore > awayScore ? '승' : homeScore === awayScore ? '무' : '패';
  }
  if (marketType.includes('승1패') || marketType === '승패') {
    return homeScore > awayScore ? '승' : '패';
  }
  if (marketType.includes('언더오버')) {
    if (line == null) return null;
    const total = homeScore + awayScore;
    return total > line ? '오버' : total < line ? '언더' : null;
  }
  if (marketType.includes('핸디캡')) {
    if (line == null) return null;
    const adj = homeScore + line;
    return adj > awayScore ? '승' : adj === awayScore ? '무' : '패';
  }
  return null;
}
