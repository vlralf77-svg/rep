import { useMemo, useState } from 'react';
import {
  Box, Typography, Card, CardContent, Chip, Divider, LinearProgress,
  ToggleButtonGroup, ToggleButton, Button,
} from '@mui/material';
import { getPredictions, setActualResult, clearPredictions, PredictionRecord } from '../lib/betman-history';
import { useLiveScores } from '../api/hooks';
import { LiveScore, determineResult, matchScore } from '../lib/livescore';
import { BetmanGame } from '../lib/api';

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
function GameCard({ record, onActualSet, score }: { record: PredictionRecord; onActualSet: () => void; score?: LiveScore | null }) {
  const [editingMarket, setEditingMarket] = useState<string | null>(null);
  const resolved = record.predictions.filter((p) => p.actual !== undefined);
  const pending = record.predictions.filter((p) => p.actual === undefined);
  const aiCorrect = resolved.filter((p) => p.actual === p.aiPick).length;
  const hasResults = resolved.length > 0;
  const isLive = score?.status === 'LIVE';
  const isFinished = score?.status === 'FINISHED';

  const handleSetActual = (marketType: string, label: string) => {
    setActualResult(record.matchId, marketType, label);
    onActualSet();
  };

  // 종료된 경기: 스코어 기반 전체 마켓 결과 일괄 입력
  const handleAutoFill = () => {
    if (!score || score.status !== 'FINISHED') return;
    for (const p of pending) {
      const result = determineResult(p.marketType, score.homeScore, score.awayScore);
      if (result) {
        setActualResult(record.matchId, p.marketType, result);
      }
    }
    onActualSet();
  };

  function getOptions(marketType: string): string[] {
    const pred = record.predictions.find((p) => p.marketType === marketType);
    if (!pred) return [];
    const opts = new Set([pred.aiPick, pred.marketPick]);
    if (marketType.includes('승무패')) { opts.add('승'); opts.add('무'); opts.add('패'); }
    if (marketType.includes('승1패') || marketType.includes('승패')) { opts.add('승'); opts.add('패'); }
    if (marketType.includes('언더오버')) { opts.add('언더'); opts.add('오버'); }
    if (marketType.includes('핸디캡')) { opts.add('승'); opts.add('무'); opts.add('패'); }
    if (marketType === 'SUM' || marketType.includes('홀짝')) { opts.add('홀'); opts.add('짝'); }
    return Array.from(opts);
  }

  return (
    <Card sx={{ mb: 1.5,
      border: isLive ? '1px solid rgba(76,175,80,0.5)' : isFinished && pending.length > 0 ? '1px solid rgba(255,183,77,0.5)' : undefined,
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
            {hasResults
              ? <Chip label={`AI ${aiCorrect}/${resolved.length} 적중`} size="small"
                  color={aiCorrect === resolved.length ? 'success' : aiCorrect === 0 ? 'error' : 'warning'} />
              : <Chip label="결과 미입력" size="small" variant="outlined" sx={{ fontSize: 10, color: 'text.disabled' }} />}
          </Box>
        </Box>

        {/* 팀명 + 스코어 (실시간/종료 시 옆에 표시) */}
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

        {/* 종료된 경기 + 미입력 있으면 → 결과 자동입력 버튼 */}
        {isFinished && pending.length > 0 && (
          <Button fullWidth variant="contained" size="small" onClick={handleAutoFill}
            sx={{ mb: 1.5, bgcolor: '#ffb74d', color: '#1a1a2e', fontWeight: 700, fontSize: 12,
              '&:hover': { bgcolor: '#ffa726' } }}>
            경기 종료 — 결과 자동입력 ({score!.homeScore} : {score!.awayScore} 기준)
          </Button>
        )}

        {/* 결과 입력된 마켓 (탭하면 수정 가능) */}
        {resolved.map((p, i) => (
          <Box key={i} sx={{ mb: 0.5 }}>
            <Box sx={{ display: 'flex', alignItems: 'center', gap: 1,
              py: 0.5, px: 1, borderRadius: 1, bgcolor: 'rgba(255,255,255,0.03)',
              cursor: 'pointer' }}
              onClick={() => setEditingMarket(editingMarket === p.marketType ? null : p.marketType)}>
              <Chip label={p.marketType} size="small" variant="outlined" sx={{ fontSize: 10, height: 20 }} />
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="caption" display="block" noWrap>
                  AI <b style={{ color: p.actual === p.aiPick ? '#66bb6a' : '#ef5350' }}>{p.aiPick}</b>
                  {' · '}시장 <b style={{ color: p.actual === p.marketPick ? '#66bb6a' : '#ef5350' }}>{p.marketPick}</b>
                </Typography>
                <Typography variant="caption" color="text.secondary">실제: <b>{p.actual}</b></Typography>
              </Box>
              <Typography sx={{ fontSize: 16 }}>{p.actual === p.aiPick ? '✅' : '❌'}</Typography>
            </Box>
            {editingMarket === p.marketType && (
              <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap', mt: 0.3, pl: 1 }}>
                <Typography variant="caption" color="text.secondary" sx={{ width: '100%', mb: 0.2 }}>결과 수정:</Typography>
                {getOptions(p.marketType).map((opt) => (
                  <Button key={opt} size="small"
                    variant={p.actual === opt ? 'contained' : 'outlined'}
                    onClick={() => { handleSetActual(p.marketType, opt); setEditingMarket(null); }}
                    sx={{ py: 0.2, px: 1, fontSize: 11, minWidth: 0, textTransform: 'none' }}>
                    {opt}
                  </Button>
                ))}
              </Box>
            )}
          </Box>
        ))}

        {/* 결과 미입력 마켓 — 수동 입력 (종료 자동입력 버튼이 없을 때) */}
        {pending.length > 0 && !isFinished && (
          <>
            {resolved.length > 0 && <Divider sx={{ my: 1 }} />}
            {pending.map((p, i) => (
              <Box key={i} sx={{ mb: 1 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.5 }}>
                  <Chip label={p.marketType} size="small" variant="outlined" sx={{ fontSize: 10, height: 20 }} />
                  <Typography variant="caption" color="text.secondary">
                    AI: {p.aiPick} · 시장: {p.marketPick}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                  {getOptions(p.marketType).map((opt) => (
                    <Button key={opt} size="small" variant="outlined"
                      onClick={() => handleSetActual(p.marketType, opt)}
                      sx={{ py: 0.2, px: 1, fontSize: 11, minWidth: 0, textTransform: 'none' }}>
                      {opt}
                    </Button>
                  ))}
                </Box>
              </Box>
            ))}
          </>
        )}

        {/* 종료 + 자동입력 후 수동 개별 수정도 가능 */}
        {pending.length > 0 && isFinished && (
          <>
            <Divider sx={{ my: 1 }} />
            <Typography variant="caption" color="text.secondary" display="block" mb={0.5}>
              또는 마켓별 수동 입력:
            </Typography>
            {pending.map((p, i) => (
              <Box key={i} sx={{ mb: 0.8 }}>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5, mb: 0.3 }}>
                  <Chip label={p.marketType} size="small" variant="outlined" sx={{ fontSize: 10, height: 20 }} />
                  <Typography variant="caption" color="text.secondary">
                    AI: {p.aiPick} · 시장: {p.marketPick}
                  </Typography>
                </Box>
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                  {getOptions(p.marketType).map((opt) => (
                    <Button key={opt} size="small" variant="outlined"
                      onClick={() => handleSetActual(p.marketType, opt)}
                      sx={{ py: 0.2, px: 1, fontSize: 11, minWidth: 0, textTransform: 'none' }}>
                      {opt}
                    </Button>
                  ))}
                </Box>
              </Box>
            ))}
          </>
        )}
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
      // 아직 시작 안 한 경기는 대시보드에서 제외
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
  }, [tick]);

  const yestLabel = (() => {
    const [y, m, d] = yesterdayKey.split('-');
    return `${parseInt(m)}월 ${parseInt(d)}일 경기`;
  })();

  const filteredAll = useMemo(() => {
    if (mode === 'correct') return allGames.filter((r) => r.predictions.some((p) => p.actual !== undefined && p.actual === p.aiPick));
    if (mode === 'wrong') return allGames.filter((r) => r.predictions.some((p) => p.actual !== undefined && p.actual !== p.aiPick));
    return allGames;
  }, [allGames, mode]);

  const displayGames = mode === 'yesterday' ? yesterdayGames : filteredAll;

  return (
    <Box>
      {/* 전날 요약 (항상 상단) */}
      <Card sx={{ mb: 2, border: '1px solid rgba(255,215,0,0.35)', bgcolor: 'rgba(255,215,0,0.05)' }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
            <Typography variant="subtitle1" fontWeight={700}>📅 {yestLabel}</Typography>
            <Box sx={{ display: 'flex', gap: 0.5 }}>
              <Chip label={`총 ${yesterdayGames.length}경기`} size="small" sx={{ bgcolor: 'rgba(255,215,0,0.2)', color: '#FFD700' }} />
              {yesterdayAgg.total > 0 && <Chip label={`${yesterdayAgg.total}건 결과입력`} size="small" variant="outlined" />}
            </Box>
          </Box>
          {yesterdayAgg.total === 0 ? (
            <Typography variant="body2" color="text.secondary">
              {yesterdayGames.length > 0
                ? `${yesterdayGames.length}경기가 저장되어 있습니다. 아래 경기 카드에서 실제 결과를 입력하세요.`
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
        displayGames.map((r) => {
          const sc = liveScores?.find(s => {
            if (!r.gameDate) return false;
            return Math.abs(s.timestamp - new Date(r.gameDate).getTime()) < 30 * 60 * 1000;
          }) || null;
          return <GameCard key={r.matchId} record={r} onActualSet={refresh} score={sc} />;
        })
      )}

      {/* 데이터 초기화 */}
      <Box sx={{ mt: 4, textAlign: 'center' }}>
        <Button size="small" color="error" variant="outlined"
          onClick={() => {
            if (window.confirm('잘못된 적중률 데이터를 초기화합니다.\n저장된 베팅은 유지됩니다.\n계속하시겠습니까?')) {
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
