import { useMemo, useState, useEffect } from 'react';
import {
  Box, Typography, Card, CardContent, Chip, Divider, LinearProgress,
  ToggleButtonGroup, ToggleButton, Button,
} from '@mui/material';
import { getPredictions, setActualResult, clearPredictions, PredictionRecord, getModelAccuracyStats } from '../lib/betman-history';
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
  const gameStarted = isLive || isFinished;

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
            {gameStarted
              ? hasResults
                ? <Chip label={`AI ${aiCorrect}/${resolved.length} 적중`} size="small"
                    color={aiCorrect === resolved.length ? 'success' : aiCorrect === 0 ? 'error' : 'warning'} />
                : <Chip label="결과 대기" size="small" variant="outlined" sx={{ fontSize: 10, color: 'text.disabled' }} />
              : <Chip label="경기 전" size="small" variant="outlined" sx={{ fontSize: 10, color: 'text.disabled' }} />}
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
          const liveResult = gameStarted && score ? determineResult(p.marketType, score.homeScore, score.awayScore, p.line, score.homeHalfScore, score.awayHalfScore) : null;
          const actualOrLive = p.actual ?? liveResult;
          const hasActual = p.actual !== undefined;

          return (
            <Box key={i} sx={{ mb: 0.5, py: 0.5, px: 1, borderRadius: 1, bgcolor: 'rgba(255,255,255,0.03)' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', gap: 1 }}>
                <Chip
                  label={p.marketType + (p.line != null && (p.marketType.includes('핸디캡') || p.marketType.includes('언더오버')) ? ` (${p.line > 0 ? '+' : ''}${p.line})` : '')}
                  size="small" variant="outlined" sx={{ fontSize: 10, height: 20 }}
                />
                <Box sx={{ flex: 1, minWidth: 0 }}>
                  <Typography variant="caption" display="block" noWrap>
                    AI <b style={{ color: gameStarted && actualOrLive ? (actualOrLive === p.aiPick ? '#66bb6a' : '#ef5350') : 'inherit' }}>{p.aiPick}</b>
                    {' · '}시장 <b style={{ color: gameStarted && actualOrLive ? (actualOrLive === p.marketPick ? '#66bb6a' : '#ef5350') : 'inherit' }}>{p.marketPick}</b>
                  </Typography>
                  {gameStarted && actualOrLive && (
                    <Typography variant="caption" color="text.secondary">
                      {hasActual ? '결과' : isLive ? '현재' : '결과'}: <b>{actualOrLive}</b>
                      {!hasActual && isLive && <span style={{ color: '#ffb74d' }}> (진행중)</span>}
                    </Typography>
                  )}
                </Box>
                {gameStarted && actualOrLive ? (
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
type ResultFilter = 'all' | 'correct' | 'wrong';

export default function AccuracyDashboard() {
  const [selectedDate, setSelectedDate] = useState<string>(dayKey(new Date()));
  const [selectedSport, setSelectedSport] = useState<string>('all');
  const [resultFilter, setResultFilter] = useState<ResultFilter>('all');
  const [tick, setTick] = useState(0);
  const refresh = () => setTick((t) => t + 1);
  const { data: liveData } = useLiveScores();
  const liveScores = liveData?.scores;
  const liveLogs = liveData?.logs;

  // 실시간 스코어로 종료된 경기 결과 자동 저장
  useEffect(() => {
    if (!liveScores || liveScores.length === 0) return;
    const records = getPredictions();
    let changed = false;

    for (const rec of records) {
      if (!rec.gameDate) continue;
      const score = matchScore(rec, liveScores);
      if (!score || score.status !== 'FINISHED') continue;

      for (const p of rec.predictions) {
        if (p.actual !== undefined) continue;
        const result = determineResult(p.marketType, score.homeScore, score.awayScore, p.line, score.homeHalfScore, score.awayHalfScore);
        if (result) {
          setActualResult(rec.matchId, p.marketType, result);
          changed = true;
        }
      }
    }

    if (changed) refresh();
  }, [liveScores]);

  const { availableDates, availableSports, gamesByDate, overallAgg, dateAgg } = useMemo(() => {
    const allRecords = getPredictions();
    const sportSet = new Set<string>();
    for (const rec of allRecords) {
      if (rec.sport) sportSet.add(rec.sport);
    }
    const sports = Array.from(sportSet).sort();

    // 종목 필터 적용
    const records = selectedSport === 'all'
      ? allRecords
      : allRecords.filter((r) => r.sport === selectedSport);

    const byDate = new Map<string, PredictionRecord[]>();
    const oAgg = emptyAgg();

    for (const rec of records) {
      const gd = rec.gameDate ? new Date(rec.gameDate) : new Date(rec.savedAt);
      const gKey = dayKey(gd);
      if (!byDate.has(gKey)) byDate.set(gKey, []);
      byDate.get(gKey)!.push(rec);

      const resolved = rec.predictions.filter((p) => p.actual !== undefined);
      for (const p of resolved) {
        oAgg.total++;
        if (p.actual === p.aiPick) oAgg.aiCorrect++;
        if (p.actual === p.marketPick) oAgg.marketCorrect++;
      }
    }

    const dates = Array.from(byDate.keys()).sort().reverse();

    // 선택된 날짜의 통계
    const dAgg = emptyAgg();
    const dateGames = byDate.get(selectedDate) || [];
    for (const rec of dateGames) {
      const resolved = rec.predictions.filter((p) => p.actual !== undefined);
      for (const p of resolved) {
        dAgg.total++;
        if (p.actual === p.aiPick) dAgg.aiCorrect++;
        if (p.actual === p.marketPick) dAgg.marketCorrect++;
      }
    }

    for (const [, games] of byDate) {
      games.sort((a, b) => (a.gameDate || '').localeCompare(b.gameDate || ''));
    }

    return { availableDates: dates, availableSports: sports, gamesByDate: byDate, overallAgg: oAgg, dateAgg: dAgg };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick, liveScores, selectedDate, selectedSport]);

  const dateGames = gamesByDate.get(selectedDate) || [];
  const displayGames = useMemo(() => {
    if (resultFilter === 'correct') return dateGames.filter((r) => r.predictions.some((p) => p.actual !== undefined && p.actual === p.aiPick));
    if (resultFilter === 'wrong') return dateGames.filter((r) => r.predictions.some((p) => p.actual !== undefined && p.actual !== p.aiPick));
    return dateGames;
  }, [dateGames, resultFilter]);

  const dateLabel = (() => {
    const [, m, d] = selectedDate.split('-');
    return `${parseInt(m)}월 ${parseInt(d)}일`;
  })();

  // 스코어 매칭 함수 (livescore의 공용 매칭 로직 사용)
  const findScore = (rec: PredictionRecord): LiveScore | null => {
    if (!liveScores) return null;
    return matchScore(rec, liveScores);
  };

  return (
    <Box>
      {/* 스코어 소스 디버그 */}
      <Card sx={{ mb: 2, bgcolor: 'rgba(0,0,0,0.3)', border: '1px solid rgba(255,255,255,0.1)' }}>
        <CardContent sx={{ py: 1, px: 1.5, '&:last-child': { pb: 1 } }}>
          <Typography variant="caption" fontWeight={700} color="text.secondary" display="block" mb={0.5}>
            📡 실시간 스코어 상태
          </Typography>
          {liveLogs ? (
            liveLogs.map((log, i) => (
              <Typography key={i} variant="caption" display="block" sx={{
                fontSize: 10, color: log.includes('실패') ? '#ef5350' : log.includes('0건') ? '#ffb74d' : '#66bb6a',
                fontFamily: 'monospace',
              }}>
                {log}
              </Typography>
            ))
          ) : (
            <Typography variant="caption" color="text.disabled" sx={{ fontSize: 10 }}>
              로딩 중...
            </Typography>
          )}
        </CardContent>
      </Card>

      {/* 종목 선택 */}
      {availableSports.length > 0 && (
        <Box sx={{ mb: 1.2, display: 'flex', gap: 0.8, flexWrap: 'wrap', alignItems: 'center' }}>
          <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>종목</Typography>
          <Chip label="전체" size="small"
            onClick={() => setSelectedSport('all')}
            variant={selectedSport === 'all' ? 'filled' : 'outlined'}
            sx={{
              fontSize: 12, fontWeight: selectedSport === 'all' ? 700 : 400,
              bgcolor: selectedSport === 'all' ? 'secondary.main' : undefined,
              color: selectedSport === 'all' ? '#fff' : undefined,
            }}
          />
          {availableSports.map((sp) => (
            <Chip key={sp} label={sp} size="small"
              onClick={() => setSelectedSport(sp)}
              variant={sp === selectedSport ? 'filled' : 'outlined'}
              sx={{
                fontSize: 12, fontWeight: sp === selectedSport ? 700 : 400,
                bgcolor: sp === selectedSport ? 'secondary.main' : undefined,
                color: sp === selectedSport ? '#fff' : undefined,
              }}
            />
          ))}
        </Box>
      )}

      {/* 날짜 선택 */}
      <Box sx={{ mb: 2, display: 'flex', gap: 0.8, flexWrap: 'wrap' }}>
        {availableDates.map((d) => {
          const [, m, dd] = d.split('-');
          const isToday = d === dayKey(new Date());
          const label = isToday ? '오늘' : `${parseInt(m)}/${parseInt(dd)}`;
          return (
            <Chip key={d} label={label} size="small"
              onClick={() => setSelectedDate(d)}
              variant={d === selectedDate ? 'filled' : 'outlined'}
              sx={{
                fontSize: 12, fontWeight: d === selectedDate ? 700 : 400,
                bgcolor: d === selectedDate ? 'primary.main' : undefined,
                color: d === selectedDate ? '#fff' : undefined,
              }}
            />
          );
        })}
        {availableDates.length === 0 && (
          <Typography variant="caption" color="text.secondary">저장된 경기가 없습니다</Typography>
        )}
      </Box>

      {/* 선택 날짜 요약 */}
      <Card sx={{ mb: 2, border: '1px solid rgba(255,215,0,0.35)', bgcolor: 'rgba(255,215,0,0.05)' }}>
        <CardContent>
          <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1.5 }}>
            <Typography variant="subtitle1" fontWeight={700}>📅 {dateLabel} 경기</Typography>
            <Chip label={`총 ${dateGames.length}경기`} size="small" sx={{ bgcolor: 'rgba(255,215,0,0.2)', color: '#FFD700' }} />
          </Box>
          {dateAgg.total === 0 ? (
            <Typography variant="body2" color="text.secondary">
              {dateGames.length > 0
                ? '경기 결과를 자동으로 가져오는 중입니다...'
                : '해당 날짜에 저장된 경기가 없습니다.'}
            </Typography>
          ) : (
            <>
              <StatBar label="🤖 AI 예측" correct={dateAgg.aiCorrect} total={dateAgg.total} color="#4fc3f7" />
              <StatBar label="📊 시장 배당" correct={dateAgg.marketCorrect} total={dateAgg.total} color="#ffb74d" />
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

      {/* 모델별 적중률 */}
      {(() => {
        const modelStats = getModelAccuracyStats();
        if (modelStats.length === 0) return null;
        const modelColors: Record<string, string> = { 'De-Vig': '#4fc3f7', 'Platt': '#66bb6a', 'D-C': '#ffa726', 'Pyth': '#ab47bc', 'Meta': '#ef5350' };
        return (
          <Card sx={{ mb: 2 }}>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={700} mb={1.5}>📊 모델별 적중률</Typography>
              {modelStats.map(ms => (
                <StatBar key={ms.modelName} label={ms.modelName} correct={ms.correct} total={ms.total}
                  color={modelColors[ms.modelName] || '#78909c'} />
              ))}
            </CardContent>
          </Card>
        );
      })()}

      {/* 수익률 시뮬레이션 */}
      {(() => {
        const records = getPredictions();
        const resolved = records.flatMap(r => r.predictions.filter(p => p.actual !== undefined && p.odds));
        if (resolved.length === 0) return null;
        const FLAT = 10000;
        let totalWagered = 0, totalReturned = 0;
        let valueWagered = 0, valueReturned = 0;
        for (const p of resolved) {
          totalWagered += FLAT;
          if (p.actual === p.aiPick) totalReturned += FLAT * (p.odds || 0);
          if ((p.aiProb * (p.odds || 0)) > 1.03) {
            valueWagered += FLAT;
            if (p.actual === p.aiPick) valueReturned += FLAT * (p.odds || 0);
          }
        }
        const roi = totalWagered > 0 ? ((totalReturned - totalWagered) / totalWagered) * 100 : 0;
        const valueRoi = valueWagered > 0 ? ((valueReturned - valueWagered) / valueWagered) * 100 : 0;
        const fmt = (n: number) => Math.floor(n).toLocaleString('ko-KR') + '원';
        return (
          <Card sx={{ mb: 2, border: '1px solid rgba(79,195,247,0.3)' }}>
            <CardContent>
              <Typography variant="subtitle1" fontWeight={700} mb={1.5}>💰 수익률 시뮬레이션</Typography>
              <Typography variant="caption" color="text.secondary" display="block" mb={1}>
                매 경기 {fmt(FLAT)} 정액 베팅 기준
              </Typography>
              <Box sx={{ mb: 1.5 }}>
                <Typography variant="body2" fontWeight={600} mb={0.5}>전체 AI 추천</Typography>
                <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                  <Typography variant="caption">투자: {fmt(totalWagered)}</Typography>
                  <Typography variant="caption">회수: {fmt(totalReturned)}</Typography>
                  <Typography variant="caption" sx={{ color: roi >= 0 ? '#66bb6a' : '#ef5350' }}>
                    ROI: {roi >= 0 ? '+' : ''}{roi.toFixed(1)}%
                  </Typography>
                  <Typography variant="caption" sx={{ color: totalReturned - totalWagered >= 0 ? '#66bb6a' : '#ef5350' }}>
                    손익: {totalReturned - totalWagered >= 0 ? '+' : ''}{fmt(totalReturned - totalWagered)}
                  </Typography>
                </Box>
              </Box>
              {valueWagered > 0 && (
                <Box>
                  <Typography variant="body2" fontWeight={600} mb={0.5}>가치 베팅만 (EV {'>'} 1.03)</Typography>
                  <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                    <Typography variant="caption">투자: {fmt(valueWagered)}</Typography>
                    <Typography variant="caption">회수: {fmt(valueReturned)}</Typography>
                    <Typography variant="caption" sx={{ color: valueRoi >= 0 ? '#66bb6a' : '#ef5350' }}>
                      ROI: {valueRoi >= 0 ? '+' : ''}{valueRoi.toFixed(1)}%
                    </Typography>
                    <Typography variant="caption" sx={{ color: valueReturned - valueWagered >= 0 ? '#66bb6a' : '#ef5350' }}>
                      손익: {valueReturned - valueWagered >= 0 ? '+' : ''}{fmt(valueReturned - valueWagered)}
                    </Typography>
                  </Box>
                </Box>
              )}
            </CardContent>
          </Card>
        );
      })()}

      {/* 경기 목록 필터 */}
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Typography variant="subtitle2" fontWeight={700}>경기별 결과</Typography>
        <ToggleButtonGroup value={resultFilter} exclusive size="small"
          onChange={(_, v) => { if (v !== null) setResultFilter(v); }}
          sx={{ '& .MuiToggleButton-root': { px: 1.2, py: 0.4, fontSize: 11, textTransform: 'none' } }}>
          <ToggleButton value="all">전체</ToggleButton>
          <ToggleButton value="correct">✅ 적중</ToggleButton>
          <ToggleButton value="wrong">❌ 실패</ToggleButton>
        </ToggleButtonGroup>
      </Box>

      {displayGames.length === 0 ? (
        <Typography variant="body2" color="text.secondary" sx={{ py: 3, textAlign: 'center' }}>
          해당하는 경기가 없습니다.
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
