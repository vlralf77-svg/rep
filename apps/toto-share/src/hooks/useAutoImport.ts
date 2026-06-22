import { useEffect, useRef, useState, useCallback } from 'react';
import { doc, getDoc, writeBatch } from 'firebase/firestore';
import { db } from '../firebase';
import { todayKey } from './useMatches';
import type { MatchStatus } from '../types';

const HOME_LABELS = ['승', '언더', '홀'];
const DRAW_LABELS = ['무', '1'];
const AWAY_LABELS = ['패', '오버', '짝'];

function kstDateStr(ts: number): string {
  return new Date(ts + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

interface PendingMatch {
  matchId: string;
  data: Record<string, any>;
  oddsHome: number;
  oddsDraw: number;
  oddsAway: number;
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

  const pending: PendingMatch[] = [];
  let idx = 0;

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
      idx++;

      pending.push({
        matchId,
        data: {
          gameNo: game.matchId?.split('|')[0] || String(idx),
          league: game.league || game.sport || '미정',
          sport: game.sport || '기타',
          homeTeam: game.homeTeam,
          awayTeam: game.awayTeam,
          startTime: game.gameDate ? new Date(game.gameDate).getTime() : Date.now() + 3600000,
          marketType,
          gameKey,
          line: typeof market.line === 'number' ? market.line : null,
          status: 'OPEN' as MatchStatus,
          result: null,
        },
        oddsHome,
        oddsDraw,
        oddsAway,
      });
    }
  }

  if (pending.length === 0) return 0;

  const existingDocs = await Promise.all(
    pending.map((p) => getDoc(doc(db, 'days', day, 'matches', p.matchId))),
  );

  const BATCH_LIMIT = 499;
  for (let i = 0; i < pending.length; i += BATCH_LIMIT) {
    const batch = writeBatch(db);
    const chunk = pending.slice(i, i + BATCH_LIMIT);

    for (let j = 0; j < chunk.length; j++) {
      const p = chunk[j];
      const existing = existingDocs[i + j];
      const prev = existing.exists() ? existing.data() : null;

      batch.set(doc(db, 'days', day, 'matches', p.matchId), {
        ...p.data,
        oddsHome: p.oddsHome,
        oddsDraw: p.oddsDraw,
        oddsAway: p.oddsAway,
        initialOddsHome: prev?.initialOddsHome ?? prev?.oddsHome ?? p.oddsHome,
        initialOddsDraw: prev?.initialOddsDraw ?? prev?.oddsDraw ?? p.oddsDraw,
        initialOddsAway: prev?.initialOddsAway ?? prev?.oddsAway ?? p.oddsAway,
      });
    }

    await batch.commit();
  }

  return pending.length;
}

const INTERVAL_MS = 5 * 60 * 1000;

export function useAutoImport() {
  const ran = useRef(false);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const doImport = useCallback(async () => {
    setRefreshing(true);
    try {
      await importBetman();
      setLastUpdated(new Date());
    } catch {}
    setRefreshing(false);
  }, []);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    doImport();

    const id = setInterval(doImport, INTERVAL_MS);
    return () => clearInterval(id);
  }, [doImport]);

  return { lastUpdated, refreshing, refresh: doImport };
}
