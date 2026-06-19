import { LiveScore } from './livescore';

const H2H_CACHE_KEY = 'team_h2h_v1';
const FORM_CACHE_KEY = 'team_form_v1';

export interface H2HRecord {
  date: string;
  homeTeam: string;
  awayTeam: string;
  homeScore: number;
  awayScore: number;
}

export interface H2HStats {
  matches: H2HRecord[];
  homeWins: number;
  awayWins: number;
  draws: number;
}

export interface TeamForm {
  team: string;
  results: ('W' | 'D' | 'L')[];
  goalsScored: number;
  goalsConceded: number;
}

interface FormCache {
  [team: string]: { results: H2HRecord[]; updatedAt: string };
}

function loadFormCache(): FormCache {
  try {
    const raw = localStorage.getItem(FORM_CACHE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch { return {}; }
}

function saveFormCache(cache: FormCache): void {
  localStorage.setItem(FORM_CACHE_KEY, JSON.stringify(cache));
}

export function updateFormFromScores(scores: LiveScore[]): void {
  const cache = loadFormCache();
  const now = new Date().toISOString();

  for (const s of scores) {
    if (s.status !== 'FINISHED') continue;

    const rec: H2HRecord = {
      date: new Date(s.timestamp || Date.now()).toISOString(),
      homeTeam: s.homeTeam,
      awayTeam: s.awayTeam,
      homeScore: s.homeScore,
      awayScore: s.awayScore,
    };

    for (const team of [s.homeTeam, s.awayTeam]) {
      if (!cache[team]) cache[team] = { results: [], updatedAt: now };
      const existing = cache[team].results;
      const dup = existing.some(r =>
        r.homeTeam === rec.homeTeam && r.awayTeam === rec.awayTeam &&
        r.homeScore === rec.homeScore && r.awayScore === rec.awayScore &&
        r.date.slice(0, 10) === rec.date.slice(0, 10)
      );
      if (!dup) {
        existing.push(rec);
        existing.sort((a, b) => b.date.localeCompare(a.date));
        if (existing.length > 20) existing.length = 20;
        cache[team].updatedAt = now;
      }
    }
  }

  saveFormCache(cache);
}

export function getTeamForm(teamName: string): TeamForm {
  const cache = loadFormCache();
  const entry = cache[teamName];
  const results: ('W' | 'D' | 'L')[] = [];
  let gs = 0, gc = 0;

  if (entry) {
    for (const r of entry.results.slice(0, 5)) {
      const isHome = r.homeTeam === teamName;
      const myScore = isHome ? r.homeScore : r.awayScore;
      const opScore = isHome ? r.awayScore : r.homeScore;
      gs += myScore;
      gc += opScore;
      if (myScore > opScore) results.push('W');
      else if (myScore === opScore) results.push('D');
      else results.push('L');
    }
  }

  return { team: teamName, results, goalsScored: gs, goalsConceded: gc };
}

export function getH2H(homeTeam: string, awayTeam: string): H2HStats {
  const cache = loadFormCache();
  const matches: H2HRecord[] = [];
  let homeWins = 0, awayWins = 0, draws = 0;

  const homeEntry = cache[homeTeam];
  if (homeEntry) {
    for (const r of homeEntry.results) {
      const isH2H = (r.homeTeam === homeTeam && r.awayTeam === awayTeam) ||
                     (r.homeTeam === awayTeam && r.awayTeam === homeTeam);
      if (!isH2H) continue;
      const dup = matches.some(m => m.date.slice(0, 10) === r.date.slice(0, 10) && m.homeScore === r.homeScore);
      if (dup) continue;
      matches.push(r);

      const homeGoals = r.homeTeam === homeTeam ? r.homeScore : r.awayScore;
      const awayGoals = r.homeTeam === homeTeam ? r.awayScore : r.homeScore;
      if (homeGoals > awayGoals) homeWins++;
      else if (homeGoals < awayGoals) awayWins++;
      else draws++;
    }
  }

  matches.sort((a, b) => b.date.localeCompare(a.date));
  return { matches: matches.slice(0, 10), homeWins, awayWins, draws };
}
