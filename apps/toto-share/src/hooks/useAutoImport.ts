import { useEffect, useRef } from 'react';
import { doc, getDoc, setDoc } from 'firebase/firestore';
import { db } from '../firebase';
import { todayKey } from './useMatches';
import type { MatchStatus } from '../types';

const HOME_LABELS = ['승', '언더', '홀'];
const DRAW_LABELS = ['무', '1'];
const AWAY_LABELS = ['패', '오버', '짝'];

function kstDateStr(ts: number): string {
  return new Date(ts + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

async function importBetman(): Promise<number> {
  const res = await fetch(
    `https://raw.githubusercontent.com/vlralf77-svg/rep/claude/gracious-fermat-c195k9/data/betman.json?t=${Date.now()}`,
    { cache: 'no-store' },
  );
  const data = await res.json();
  const day = todayKey();
  const importDate = day;
  const allGames = [...(data.proto || []), ...(data.toto || [])];

  let count = 0;
  for (const game of allGames) {
    if (game.gameDate) {
      const gd = kstDateStr(new Date(game.gameDate).getTime());
      if (gd < importDate) continue;
    }

    const markets = game.markets || [];
    if (markets.length === 0) continue;

    for (const market of markets) {
      const marketType: string = market.type || '기타';
      const sels = market.selections || [];
      if (sels.length === 0) continue;

      const oddsHome = sels.find((s: any) => HOME_LABELS.includes(s.label))?.odds || 1.5;
      const oddsDraw = sels.find((s: any) => DRAW_LABELS.includes(s.label))?.odds || 0;
      const oddsAway = sels.find((s: any) => AWAY_LABELS.includes(s.label))?.odds || 2.5;

      const baseId = game.matchId || `${game.homeTeam}_${game.awayTeam}`;
      const gameKey = `betman_${baseId}`.replace(/[\/\.\#\$\[\]]/g, '_');
      const matchId = `${gameKey}_${marketType}`.replace(/[\/\.\#\$\[\]]/g, '_');

      const matchRef = doc(db, 'days', day, 'matches', matchId);
      const existing = await getDoc(matchRef);
      const prev = existing.exists() ? existing.data() : null;

      await setDoc(matchRef, {
        gameNo: game.matchId?.split('|')[0] || String(count + 1),
        league: game.league || game.sport || '미정',
        homeTeam: game.homeTeam,
        awayTeam: game.awayTeam,
        startTime: game.gameDate ? new Date(game.gameDate).getTime() : Date.now() + 3600000,
        oddsHome,
        oddsDraw,
        oddsAway,
        prevOddsHome: prev ? prev.oddsHome : null,
        prevOddsDraw: prev ? prev.oddsDraw : null,
        prevOddsAway: prev ? prev.oddsAway : null,
        marketType,
        gameKey,
        line: typeof market.line === 'number' ? market.line : null,
        status: 'OPEN' as MatchStatus,
        result: null,
      });
      count++;
    }
  }
  return count;
}

const INTERVAL_MS = 5 * 60 * 1000;

export function useAutoImport() {
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    importBetman().catch(() => {});

    const id = setInterval(() => {
      importBetman().catch(() => {});
    }, INTERVAL_MS);

    return () => clearInterval(id);
  }, []);
}
