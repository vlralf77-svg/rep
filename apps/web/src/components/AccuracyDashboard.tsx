import { useMemo, useState } from 'react';
import {
  Box, Typography, Card, CardContent, Chip, Divider, LinearProgress,
  ToggleButtonGroup, ToggleButton,
} from '@mui/material';
import { getPredictions, PredictionRecord } from '../lib/betman-history';

// ── 날짜 유틸 ───────────────────────────────────────────────────
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function startOfToday(): Date {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

interface Resolved {
  marketType: string;
  aiPick: string;
  marketPick: string;
  actual: string;
  aiCorrect: boolean;
  marketCorrect: boolean;
}
interface ResolvedGame {
  record: PredictionRecord;
  dateLabel: string;
  dayKey: string;
  resolved: Resolved[];
}

interface Agg { total: number; aiCorrect: number; marketCorrect: number; }
function emptyAgg(): Agg { return { total: 0, aiCorrect: 0, marketCorrect: 0 }; }

// ── 통계 카드 ───────────────────────────────────────────────────
function StatBar({ label, correct, total, color }: { label: string; correct: number; total: number; color: string }) {
  const pct = total > 0 ? (correct / total) * 100 : 0;
  return (
    <Box mb={1.2}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.4 }}>
        <Typography variant="body2" fontWeight={600}>{label}</Typography>
        <Typography variant="body2" sx={{ color }}>
          {correct}/{total} · {pct.toFixed(1)}%
        </Typography>
      </Box>
      <LinearProgress variant="determinate" value={pct}
        sx={{ height: 8, borderRadius: 4, bgcolor: 'rgba(255,255,255,0.08)',
          '& .MuiLinearProgress-bar': { bgcolor: color } }} />
    </Box>
  );
}

function SummaryCard({ title, agg, highlight }: { title: string; agg: Agg; highlight?: boolean }) {
  return (
    <Card sx={{ mb: 2, border: highlight ? '1px solid rgba(255,215,0,0.4)' : undefined,
      bgcolor: highlight ? 'rgba(255,215,0,0.05)' : undefined }}>
      <CardContent>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
          <Typography variant="subtitle1" fontWeight={700}>{title}</Typography>
          <Chip label={`총 ${agg.total}건`} size="small"
            sx={highlight ? { bgcolor: 'rgba(255,215,0,0.2)', color: '#FFD700' } : {}} />
        </Box>
        {agg.total === 0 ? (
          <Typography variant="body2" color="text.secondary">결과가 입력된 예측이 없습니다.</Typography>
        ) : (
          <>
            <StatBar label="🤖 AI 예측" correct={agg.aiCorrect} total={agg.total} color="#4fc3f7" />
            <StatBar label="📊 시장 배당" correct={agg.marketCorrect} total={agg.total} color="#ffb74d" />
            <Divider sx={{ my: 1 }} />
            <Typography variant="caption" color="text.secondary">
              {agg.aiCorrect > agg.marketCorrect
                ? `AI가 시장보다 ${agg.aiCorrect - agg.marketCorrect}건 더 적중`
                : agg.aiCorrect < agg.marketCorrect
                  ? `시장이 AI보다 ${agg.marketCorrect - agg.aiCorrect}건 더 적중`
                  : 'AI와 시장 적중 동일'}
            </Typography>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ── 경기별 결과 카드 ────────────────────────────────────────────
function GameResultCard({ g }: { g: ResolvedGame }) {
  const correct = g.resolved.filter((r) => r.aiCorrect).length;
  return (
    <Card sx={{ mb: 1.5 }}>
      <CardContent sx={{ pb: '12px !important' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
          <Typography variant="caption" color="text.secondary">{g.dateLabel}</Typography>
          <Chip label={`AI ${correct}/${g.resolved.length} 적중`} size="small"
            color={correct === g.resolved.length ? 'success' : correct === 0 ? 'error' : 'warning'} />
        </Box>
        <Typography variant="body2" fontWeight={700} mb={1}>
          {g.record.homeTeam} vs {g.record.awayTeam}
        </Typography>
        {g.resolved.map((r, i) => (
          <Box key={i} sx={{ display: 'flex', alignItems: 'center', gap: 1, mb: 0.5,
            py: 0.5, px: 1, borderRadius: 1, bgcolor: 'rgba(255,255,255,0.03)' }}>
            <Chip label={r.marketType} size="small" variant="outlined" sx={{ fontSize: 10, height: 20 }} />
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="caption" display="block" noWrap>
                AI <b style={{ color: r.aiCorrect ? '#66bb6a' : '#ef5350' }}>{r.aiPick}</b>
                {' · '}시장 <b style={{ color: r.marketCorrect ? '#66bb6a' : '#ef5350' }}>{r.marketPick}</b>
              </Typography>
              <Typography variant="caption" color="text.secondary" noWrap>
                실제 결과: <b>{r.actual}</b>
              </Typography>
            </Box>
            <Typography sx={{ fontSize: 18 }}>{r.aiCorrect ? '✅' : '❌'}</Typography>
          </Box>
        ))}
      </CardContent>
    </Card>
  );
}

// ── 메인 ────────────────────────────────────────────────────────
type FilterMode = 'all' | 'yesterday' | 'correct' | 'wrong';

export default function AccuracyDashboard() {
  const [mode, setMode] = useState<FilterMode>('all');

  const { games, overall, yesterday, yesterdayKey } = useMemo(() => {
    const records = getPredictions();
    const today0 = startOfToday();
    const yest = new Date(today0.getTime() - 24 * 60 * 60 * 1000);
    const yKey = dayKey(yest);

    const resolvedGames: ResolvedGame[] = [];
    const ov = emptyAgg();
    const yd = emptyAgg();

    for (const rec of records) {
      const resolved: Resolved[] = rec.predictions
        .filter((p) => p.actual !== undefined)
        .map((p) => ({
          marketType: p.marketType,
          aiPick: p.aiPick,
          marketPick: p.marketPick,
          actual: p.actual as string,
          aiCorrect: p.actual === p.aiPick,
          marketCorrect: p.actual === p.marketPick,
        }));
      if (resolved.length === 0) continue;

      const gd = rec.gameDate ? new Date(rec.gameDate) : new Date(rec.savedAt);
      const gKey = dayKey(gd);
      const dateLabel = gd.toLocaleString('ko-KR', { month: 'short', day: 'numeric', weekday: 'short' });

      for (const r of resolved) {
        ov.total++; if (r.aiCorrect) ov.aiCorrect++; if (r.marketCorrect) ov.marketCorrect++;
        if (gKey === yKey) { yd.total++; if (r.aiCorrect) yd.aiCorrect++; if (r.marketCorrect) yd.marketCorrect++; }
      }

      resolvedGames.push({ record: rec, dateLabel, dayKey: gKey, resolved });
    }

    resolvedGames.sort((a, b) => b.dayKey.localeCompare(a.dayKey));
    return { games: resolvedGames, overall: ov, yesterday: yd, yesterdayKey: yKey };
  }, []);

  const filtered = useMemo(() => {
    if (mode === 'yesterday') return games.filter((g) => g.dayKey === yesterdayKey);
    if (mode === 'correct') {
      return games
        .map((g) => ({ ...g, resolved: g.resolved.filter((r) => r.aiCorrect) }))
        .filter((g) => g.resolved.length > 0);
    }
    if (mode === 'wrong') {
      return games
        .map((g) => ({ ...g, resolved: g.resolved.filter((r) => !r.aiCorrect) }))
        .filter((g) => g.resolved.length > 0);
    }
    return games;
  }, [games, mode, yesterdayKey]);

  if (overall.total === 0) {
    return (
      <Box sx={{ py: 6, textAlign: 'center' }}>
        <Typography variant="h6" mb={1}>📊 적중률 대시보드</Typography>
        <Typography variant="body2" color="text.secondary">
          아직 결과가 입력된 예측이 없습니다.<br />
          경기 상세 화면에서 종료된 경기의 실제 결과를 입력하면<br />
          이곳에서 AI·시장 예측 적중률을 한눈에 볼 수 있습니다.
        </Typography>
      </Box>
    );
  }

  return (
    <Box>
      <SummaryCard title="🏆 전체 적중률" agg={overall} />
      <SummaryCard title="📅 전날 경기 적중률" agg={yesterday} highlight />

      <Typography variant="subtitle2" fontWeight={700} sx={{ mt: 1, mb: 1 }}>경기별 결과</Typography>
      <ToggleButtonGroup
        value={mode} exclusive size="small"
        onChange={(_, v) => { if (v !== null) setMode(v); }}
        sx={{ mb: 1.5, '& .MuiToggleButton-root': { px: 1.5, py: 0.4, fontSize: 12, textTransform: 'none' } }}
      >
        <ToggleButton value="all">전체</ToggleButton>
        <ToggleButton value="yesterday">전날</ToggleButton>
        <ToggleButton value="correct">✅ 적중</ToggleButton>
        <ToggleButton value="wrong">❌ 실패</ToggleButton>
      </ToggleButtonGroup>

      {filtered.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
          해당하는 경기가 없습니다.
        </Typography>
      ) : (
        filtered.map((g) => <GameResultCard key={g.record.matchId + g.dayKey} g={g} />)
      )}
    </Box>
  );
}
