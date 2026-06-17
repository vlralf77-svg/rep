import { useMemo, useState, useEffect } from 'react';
import {
  Box, Typography, Card, CardContent, Chip, Divider, LinearProgress,
  ToggleButtonGroup, ToggleButton, Button,
} from '@mui/material';
import { getPredictions, setActualResult, clearPredictions, PredictionRecord } from '../lib/betman-history';
import { useLiveScores } from '../api/hooks';
import { LiveScore, determineResult, matchScore } from '../lib/livescore';

// ── 날짜 유틸 ───────────────────────────────────────────────────
function dayKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
function startOfToday(): Date {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate());
}

interface Agg { total: number; aiCorrect: number; marketCorrect: number; }
function emptyAgg(): Agg { return { total: 0, aiCorrect: 0, marketCorrect: 0 }; }

// ── 통계 막대 ───────────────────────────────────────────────────
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

// ── 개별 경기 카드 ──────────────────────────────────────────────
function GameCard({ record, score }: { record: PredictionRecord; score?: LiveScore | null }) {
  const resolved = record.predictions.filter((p) => p.actual !== undefined);
  const aiCorrect = resolved.filter((p) => p.actual === p.aiPick).length;
  const hasResults = resolved.length > 0;
  const isLive = score?.status === 'LIVE';
  const isFinished = score?.status === 'FINISHED';

  return (
    <Card sx={{ mb: 1.5,
      border: isLive ? '1px solid rgba(76,175,80,0.5)' : isFinished ? '1px solid rgba(255,183,77,0.3)' : undefined,
    }}>
      <CardContent sx={{ pb: '12px !important' }}>
        <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 0.5 }}>
          <Typography variant="caption" color="text.secondary">
            {record.gameDate
              ? new Date(record.gameDate).toLocaleString('ko-KR', { month: 'short', day: 'numeric', weekday: 'short', hour: '2-digit', minute: '2-digit' })
              : ''}
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.5 }}>
            {isLive && (
              <Chip label={score?.inning ? `LIVE ${score.inning}` : score?.minute ? `LIVE ${score.minute}'` : 'LIVE'} size="small"
                sx={{ fontSize: 10, height: 18, bgcolor: '#4caf50', color: '#fff',
                  animation: 'pulse 1.5s infinite',
                  '@keyframes pulse': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.6 } } }} />
            )}
            {isFinished && <Chip label="종료" size="small" sx={{ fontSize: 10, height: 18, bgcolor: 'rgba(255,255,255,0.1)' }} />}
            {!isLive && !isFinished && !score && (
              <Chip label="스코어 대기" size="small" variant="outlined" sx={{ fontSize: 10, height: 18, color: 'text.disabled' }} />
            )}
            {hasResults
              ? <Chip label={`AI ${aiCorrect}/${resolved.length} 적중`} size="small"
                  color={aiCorrect === resolved.length ? 'success' : aiCorrect === 0 ? 'error' : 'warning'} />
              : <Chip label="결과 대기" size="small" variant="outlined" sx={{ fontSize: 10, color: 'text.disabled' }} />}
          </Box>
        </Box>

        {/* 팀명 + 스코어 */}
        <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5, mb: 1, py: 0.3 }}>
          <Typography variant="body2" fontWeight={700} sx={{ flex: 1, textAlign: 'right' }}>
            {record.homeTeam}
          </Typography>
          {(isLive || isFinished) && score ? (
            <Box sx={{ px: 1.5, py: 0.3, borderRadius: 2,
              bgcolor: isLive ? 'rgba(76,175,80,0.15)' : 'rgba(255,255,255,0.08)' }}>
              <Typography variant="h6" fontWeight={800} sx={{ color: isLive ? '#4caf50' : '#fff', fontSize: 20 }}>
                {score.homeScore} : {score.awayScore}
              </Typography>
            </Box>
          ) : (
            <Typography variant="body2" color="text.secondary">vs</Typography>
          )}
          <Typography variant="body2" fontWeight={700} sx={{ flex: 1, textAlign: 'left' }}>
            {record.awayTeam}
          </Typography>
        </Box>

        {/* 마켓별 예측 결과 */}
        {record.predictions.map((p, i) => {
          const liveResult = score ? determineResult(p.marketType, score.homeScore, score.awayScore) : null;
          const actualOrLive = p.actual ?? liveResult;
          const hasActual = p.actual !== undefined;

          return (
            <Box key={i} sx={{ mb: 0.5, py: 0.5, px: 1, borderRadius: 1, bgcolor: 'rgba(255,255,255,0.03)' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Chip label={p.marketType} size="small" variant="outlined" sx={{ fontSize: 10, height: 20 }} />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="caption" display="block" noWrap>
                    AI <b style={{ color: actualOrLive ? (actualOrLive === p.aiPick ? '#66bb6a' : '#ef5350') : 'inherit' }}>{p.aiPick}</b>
                    {' · '}시장 <b style={{ color: actualOrLive ? (actualOrLive === p.marketPick ? '#66bb6a' : '#ef5350') : 'inherit' }}>{p.marketPick}</b>
                  </Typography>
                  {actualOrLive && (
                    <Typography variant="caption" color="text.secondary">
                      {hasActual ? '결과' : isLive ? '현재' : '결과'}: <b>{actualOrLive}</b>
                      {!hasActual && isLive && <span style={{ color: '#ffb74d' }}> (진행중)</span>}
                    </Typography>
                  )}
                </Box>
                {actualOrLive ? (
                  <Typography sx={{ fontSize: 16 }}>
                    {actualOrLive === p.aiPick ? '✅' : '❌'}
                  </Typography>
                ) : (
                  <Typography variant="caption" color="text.disabled">—</Typography>
                )}
              </Box>
            </Box>
          );
        })}
      </CardContent>
    </Card>
  );
}

// ── 메인 ────────────────────────────────────────────────────────
type FilterMode = 'yesterday' | 'all' | 'correct' | 'wrong';

export default function AccuracyDashboard() {
  const [mode, setMode] = useState<FilterMode>('yesterday');
  const [tick, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);
  const { data: liveScores } = useLiveScores();

  // 실시간 스코어로 종료된 경기 결과 자동 저장
  useEffect(() => {
    if (!liveScores || liveScores.length === 0) return;
    const records = getPredictions();
    let changed = false;

    for (const rec of records) {
      if (!rec.gameDate) continue;
      // 이 경기에 매칭되는 스코어 찾기
      const score = liveScores.find(s => {
        const gameTs = new Date(rec.gameDate!).getTime();
        if (Math.abs(s.timestamp - gameTs) > 3 * 60 * 60 * 1000) return false;
        const hm = rec.homeTeam.includes(s.homeTeam) || s.homeTeam.includes(rec.homeTeam);
        const am = rec.awayTeam.includes(s.awayTeam) || s.awayTeam.includes(rec.awayTeam);
        return hm && am;
      }) || liveScores.find(s => {
        const gameTs = new Date(rec.gameDate!).getTime();
        if (Math.abs(s.timestamp - gameTs) > 3 * 60 * 60 * 1000) return false;
        const hm = rec.homeTeam.includes(s.homeTeam) || s.homeTeam.includes(rec.homeTeam);
        const am = rec.awayTeam.includes(s.awayTeam) || s.awayTeam.includes(rec.awayTeam);
        return hm || am;
      });

      if (!score || score.status !== 'FINISHED') continue;

      for (const p of rec.predictions) {
        if (p.actual !== undefined) continue;
        const result = determineResult(p.marketType, score.homeScore, score.awayScore);
        if (result) {
          setActualResult(rec.matchId, p.marketType, result);
          changed = true;
        }
      }
    }

    if (changed) refresh();
  }, [liveScores]);

  const { yesterdayGames, allGames, yesterdayAgg, overallAgg, yesterdayKey } = useMemo(() => {
    const records = getPredictions();
    const today0 = startOfToday();
    const yest = new Date(today0.getTime() - 24 * 60 * 60 * 1000);
    const yKey = dayKey(yest);

    const yGames: PredictionRecord[] = [];
    const aGames: PredictionRecord[] = [];
    const yAgg = emptyAgg();
    const oAgg = emptyAgg();

    const now = Date.now();
    for (const rec of records) {
      const gd = rec.gameDate ? new Date(rec.gameDate) : new Date(rec.savedAt);
      if (gd.getTime() > now) continue;
      const gKey = dayKey(gd);
      const resolved = rec.predictions.filter((p) => p.actual !== undefined);
      for (const p of resolved) {
        oAgg.total++;
        if (p.actual === p.aiPick) oAgg.aiCorrect++;
        if (p.actual === p.marketPick) oAgg.marketCorrect++;
        if (gKey === yKey) {
          yAgg.total++;
          if (p.actual === p.aiPick) yAgg.aiCorrect++;
          if (p.actual === p.marketPick) yAgg.marketCorrect++;
        }
      }
      if (gKey === yKey) yGames.push(rec);
      aGames.push(rec);
    }

    yGames.sort((a, b) => (a.gameDate || '').localeCompare(b.gameDate || ''));
    aGames.sort((a, b) => (b.gameDate || b.savedAt).localeCompare(a.gameDate || a.savedAt));

    return { yesterdayGames: yGames, allGames: aGames, yesterdayAgg: yAgg, overallAgg: oAgg, yesterdayKey: yKey };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, liveScores]);

  const yestLabel = (() => {
    const [, m, d] = yesterdayKey.split('-');
    return `${parseInt(m)}월 ${parseInt(d)}일 경기`;
  })();

  const filteredAll = useMemo(() => {
    if (mode === 'correct') return allGames.filter((r) => r.predictions.some((p) => p.actual !== undefined && p.actual === p.aiPick));
    if (mode === 'wrong') return allGames.filter((r) => r.predictions.some((p) => p.actual !== undefined && p.actual !== p.aiPick));
    return allGames;
  }, [allGames, mode]);

  const displayGames = mode === 'yesterday' ? yesterdayGames : filteredAll;

  // 스코어 매칭 함수
  const findScore = (rec: PredictionRecord): LiveScore | null => {
    if (!liveScores || !rec.gameDate) return null;
    const gameTs = new Date(rec.gameDate).getTime();
    return liveScores.find(s => {
      if (Math.abs(s.timestamp - gameTs) > 3 * 60 * 60 * 1000) return false;
      const hm = rec.homeTeam.includes(s.homeTeam) || s.homeTeam.includes(rec.homeTeam);
      const am = rec.awayTeam.includes(s.awayTeam) || s.awayTeam.includes(rec.awayTeam);
      return hm && am;
    }) || liveScores.find(s => {
      if (Math.abs(s.timestamp - gameTs) > 3 * 60 * 60 * 1000) return false;
      const hm = rec.homeTeam.includes(s.homeTeam) || s.homeTeam.includes(rec.homeTeam);
      const am = rec.awayTeam.includes(s.awayTeam) || s.awayTeam.includes(rec.awayTeam);
      return hm || am;
    }) || null;
  };

  return (
    <Box>
      {/* 전날 요약 */}
      <Card sx={{ mb: 2, border: '1px solid rgba(255,215,0,0.35)', bgcolor: 'rgba(255,215,0,0.05)' }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
            <Typography variant="subtitle1" fontWeight={700}>📅 {yestLabel}</Typography>
            <Chip label={`총 ${yesterdayGames.length}경기`} size="small" sx={{ bgcolor: 'rgba(255,215,0,0.2)', color: '#FFD700' }} />
          </Box>
          {yesterdayAgg.total === 0 ? (
            <Typography variant="body2" color="text.secondary">
              {yesterdayGames.length > 0
                ? '경기 결과를 자동으로 가져오는 중입니다...'
                : '전날 경기 데이터가 없습니다. 배당 화면을 열면 자동으로 저장됩니다.'}
            </Typography>
          ) : (
            <>
              <StatBar label="🤖 AI 예측" correct={yesterdayAgg.aiCorrect} total={yesterdayAgg.total} color="#4fc3f7" />
              <StatBar label="📊 시장 배당" correct={yesterdayAgg.marketCorrect} total={yesterdayAgg.total} color="#ffb74d" />
            </>
          )}
        </CardContent>
      </Card>

      {/* 전체 누적 요약 */}
      {overallAgg.total > 0 && (
        <Card sx={{ mb: 2 }}>
          <CardContent>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
              <Typography variant="subtitle1" fontWeight={700}>🏆 전체 누적 적중률</Typography>
              <Chip label={`${overallAgg.total}건`} size="small" />
            </Box>
            <StatBar label="🤖 AI 예측" correct={overallAgg.aiCorrect} total={overallAgg.total} color="#4fc3f7" />
            <StatBar label="📊 시장 배당" correct={overallAgg.marketCorrect} total={overallAgg.total} color="#ffb74d" />
            <Typography variant="caption" color="text.secondary">
              {overallAgg.aiCorrect > overallAgg.marketCorrect
                ? `AI가 시장보다 ${overallAgg.aiCorrect - overallAgg.marketCorrect}건 더 적중`
                : overallAgg.aiCorrect < overallAgg.marketCorrect
                  ? `시장이 AI보다 ${overallAgg.marketCorrect - overallAgg.aiCorrect}건 더 적중`
                  : 'AI와 시장 적중 동일'}
            </Typography>
          </CardContent>
        </Card>
      )}

      {/* 경기 목록 필터 */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography variant="subtitle2" fontWeight={700}>경기별 결과</Typography>
        <ToggleButtonGroup value={mode} exclusive size="small"
          onChange={(_, v) => { if (v !== null) setMode(v); }}
          sx={{ '& .MuiToggleButton-root': { px: 1.2, py: 0.4, fontSize: 11, textTransform: 'none' } }}>
          <ToggleButton value="yesterday">전날</ToggleButton>
          <ToggleButton value="all">전체</ToggleButton>
          <ToggleButton value="correct">✅ 적중</ToggleButton>
          <ToggleButton value="wrong">❌ 실패</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {displayGames.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
          {mode === 'yesterday' ? '전날 저장된 경기가 없습니다.' : '해당하는 경기가 없습니다.'}
        </Typography>
      ) : (
        displayGames.map((r) => (
          <GameCard key={r.matchId} record={r} score={findScore(r)} />
        ))
      )}

      {/* 데이터 초기화 */}
      <Box sx={{ mt: 4, textAlign: 'center' }}>
        <Button size="small" color="error" variant="outlined"
          onClick={() => {
            if (window.confirm('적중률 데이터를 초기화합니다.\n저장된 베팅은 유지됩니다.\n계속하시겠습니까?')) {
              clearPredictions();
              refresh();
            }
          }}
          sx={{ fontSize: 11, textTransform: 'none' }}>
          적중률 데이터 초기화
        </Button>
        <Typography variant="caption" color="text.secondary" display="block" mt={0.5}>
          잘못된 데이터 삭제 시 사용 (저장된 베팅은 유지)
        </Typography>
      </Box>
    </Box>
  );
}
