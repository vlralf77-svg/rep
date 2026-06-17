import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Card, CardActionArea, CardContent, Chip,
  CircularProgress, Alert, Dialog, DialogTitle, DialogContent,
  Divider, LinearProgress, Button, TextField, IconButton, Collapse,
} from '@mui/material';
import DeleteIcon from '@mui/icons-material/Delete';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import ExpandLessIcon from '@mui/icons-material/ExpandLess';
import { useBetmanData, useLiveScores } from '../api/hooks';
import { BetmanGame, BetmanMarket } from '../lib/api';
import { analyzeMarket } from '../lib/betman-analyze';
import { LiveScore, matchScore, determineResult } from '../lib/livescore';
import {
  savePredictions,
  setActualResult,
  getPredictions,
  getAccuracyStats,
  PredictionRecord,
  MarketPrediction,
} from '../lib/betman-history';
import {
  loadPicks, savePicks, loadAmount, saveAmount,
  getSavedBets, addSavedBet, removeSavedBet, SavedBet,
} from '../lib/betman-betslip';

// ── 베팅 슬립 타입 ─────────────────────────────────────────────
export interface BetPick {
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  marketType: string;
  label: string;
  odds: number;
}

// ── 공통 컴포넌트 ───────────────────────────────────────────────
function OddsBox({ label, value, selected, onSelect }: {
  label: string; value: number; selected?: boolean; onSelect?: () => void;
}) {
  return (
    <Box
      onClick={onSelect}
      sx={{
        flex: 1, textAlign: 'center', p: 1, borderRadius: 1.5, minWidth: 0,
        border: selected ? '2px solid' : '1px solid',
        borderColor: selected ? '#FFD700' : 'rgba(255,255,255,0.1)',
        bgcolor: selected ? 'rgba(255,215,0,0.12)' : 'rgba(255,255,255,0.03)',
        cursor: onSelect ? 'pointer' : 'default',
        transition: 'all 0.15s',
        '&:active': onSelect ? { transform: 'scale(0.96)' } : {},
      }}>
      <Typography variant="caption" color="text.secondary" display="block" noWrap>{label}</Typography>
      <Typography variant="h6" fontWeight={700}
        color={selected ? '#FFD700' : 'text.primary'} fontSize={15}>
        {value > 0 ? value.toFixed(2) : '-'}
      </Typography>
      {selected && <Typography variant="caption" sx={{ color: '#FFD700', fontSize: 9 }}>✓ 선택</Typography>}
    </Box>
  );
}

function DualProbRow({ label, marketProb, aiProb, star, color }:
  { label: string; marketProb: number; aiProb: number; star: boolean; color: string }) {
  return (
    <Box mb={1.2}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.3 }}>
        <Typography variant="caption">{label} {star ? '⭐' : ''}</Typography>
        <Typography variant="caption" color="text.secondary">
          시장 {(marketProb * 100).toFixed(0)}% · AI {(aiProb * 100).toFixed(0)}%
        </Typography>
      </Box>
      <LinearProgress variant="determinate" value={marketProb * 100}
        sx={{ height: 5, borderRadius: 3, mb: 0.4, bgcolor: 'rgba(255,255,255,0.08)',
          '& .MuiLinearProgress-bar': { bgcolor: 'rgba(255,255,255,0.35)' } }} />
      <LinearProgress variant="determinate" value={aiProb * 100}
        sx={{ height: 5, borderRadius: 3, bgcolor: 'rgba(255,255,255,0.08)',
          '& .MuiLinearProgress-bar': { bgcolor: color } }} />
    </Box>
  );
}

const PALETTE = ['#4fc3f7', '#78909c', '#f48fb1', '#ce93d8', '#ffb74d'];
const CONF_LABEL = { HIGH: '높음', MEDIUM: '보통', LOW: '낮음' } as const;

// ── 마켓 블록 ───────────────────────────────────────────────────
function MarketBlock({
  market, matchId, homeTeam, awayTeam, isPast, savedPred, onActualSet,
  picks, onTogglePick, liveResult,
}: {
  market: BetmanMarket;
  matchId: string;
  homeTeam: string;
  awayTeam: string;
  isPast: boolean;
  savedPred?: MarketPrediction;
  onActualSet?: () => void;
  picks: BetPick[];
  onTogglePick: (pick: BetPick) => void;
  liveResult?: string | null;
}) {
  const a = analyzeMarket(market);
  const aiPick = a.selections[a.aiBestIdx];
  const value = a.valueIdx >= 0 ? a.selections[a.valueIdx] : null;

  const handleActual = (label: string) => {
    setActualResult(matchId, market.type, label);
    onActualSet?.();
  };

  return (
    <Box sx={{ mb: 2, bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 2, p: 1.5 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
          <Chip label={market.type} size="small" color="primary" variant="outlined" />
          {market.line != null && (
            <Chip label={`기준 ${market.line}`} size="small"
              sx={{ fontSize: 11, height: 20, bgcolor: 'rgba(255,183,77,0.15)', color: '#ffb74d', border: '1px solid rgba(255,183,77,0.4)' }} />
          )}
        </Box>
        <Typography variant="caption" color="text.secondary">마진 {a.margin.toFixed(1)}%</Typography>
      </Box>

      {/* 배당 박스 — 탭으로 선택 */}
      <Box sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
        {market.selections.map((s, i) => {
          const isSelected = picks.some(
            p => p.matchId === matchId && p.marketType === market.type && p.label === s.label
          );
          return (
            <OddsBox
              key={i} label={s.label} value={s.odds} selected={isSelected}
              onSelect={() => onTogglePick({ matchId, homeTeam, awayTeam, marketType: market.type, label: s.label, odds: s.odds })}
            />
          );
        })}
      </Box>

      {a.selections.map((s, i) => (
        <DualProbRow key={i} label={s.label} marketProb={s.marketProb} aiProb={s.aiProb}
          star={i === a.aiBestIdx} color={PALETTE[i % PALETTE.length]} />
      ))}

      <Box sx={{ mt: 1, pt: 1, borderTop: '1px dashed rgba(255,255,255,0.1)' }}>
        <Typography variant="caption" display="block">
          🤖 AI 추천: <b>{aiPick.label}</b> ({(aiPick.aiProb * 100).toFixed(0)}%) · 신뢰도 {CONF_LABEL[a.confidence]}
        </Typography>
        <Typography variant="caption" display="block" color={value ? 'success.main' : 'text.secondary'}>
          {value
            ? `💰 가치 베팅: ${value.label} (배당 ${value.odds.toFixed(2)}, 기대값 ${value.ev.toFixed(2)})`
            : '💤 가치 베팅 없음'}
        </Typography>
        <Typography variant="caption" display="block" color="text.disabled" sx={{ fontSize: 10, mt: 0.3 }}>
          ░ 시장(배당 역산) · ▓ AI(편향 보정) — 배당 박스를 탭하면 슬립에 추가
        </Typography>
        {liveResult && (
          <Box sx={{ mt: 0.5, p: 0.5, borderRadius: 1, bgcolor: liveResult === aiPick.label ? 'rgba(76,175,80,0.15)' : 'rgba(244,67,54,0.12)' }}>
            <Typography variant="caption" fontWeight={700}
              color={liveResult === aiPick.label ? '#4caf50' : '#f44336'}>
              {liveResult === aiPick.label ? '✅' : '❌'} 현재: {liveResult} (AI: {aiPick.label})
            </Typography>
          </Box>
        )}
      </Box>

      {isPast && (
        <Box sx={{ mt: 1, pt: 1, borderTop: '1px dashed rgba(255,255,255,0.1)' }}>
          <Typography variant="caption" display="block" color="text.secondary" mb={0.5}>결과 입력</Typography>
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
            {market.selections.map((s, i) => (
              <Button key={i} size="small"
                variant={savedPred?.actual === s.label ? 'contained' : 'outlined'}
                onClick={() => handleActual(s.label)}
                sx={{ minWidth: 0, px: 1, py: 0.3, fontSize: 11 }}>
                {s.label}
              </Button>
            ))}
          </Box>
          {savedPred?.actual !== undefined && (
            <Typography variant="caption" display="block" mt={0.5}
              color={savedPred.actual === savedPred.aiPick ? 'success.main' : 'error.main'}>
              {savedPred.actual === savedPred.aiPick ? '✅ AI 적중' : '❌ AI 오류'} (AI: {savedPred.aiPick} / 실제: {savedPred.actual})
            </Typography>
          )}
        </Box>
      )}
    </Box>
  );
}

// ── 게임 상세 다이얼로그 ────────────────────────────────────────
function GameDetail({ game, open, onClose, picks, onTogglePick, score }: {
  game: BetmanGame; open: boolean; onClose: () => void;
  picks: BetPick[]; onTogglePick: (pick: BetPick) => void;
  score?: LiveScore | null;
}) {
  const gameDateTime = game.gameDate
    ? new Date(game.gameDate).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', weekday: 'short' })
    : '';

  const order = ['승무패', '승1패', '승패', '전반 승무패', '언더오버', '전반 언더오버', '핸디캡', '핸디캡2', '전반 핸디캡', 'SUM'];
  const sorted = [...game.markets].sort((a, b) => {
    const ia = order.indexOf(a.type); const ib = order.indexOf(b.type);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });

  const isPast = game.gameDate
    ? new Date(game.gameDate) < new Date(Date.now() - 24 * 60 * 60 * 1000)
    : false;

  const isLive = score?.status === 'LIVE';
  const isFinished = score?.status === 'FINISHED';
  const hasScore = isLive || isFinished;

  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);
  const [savedRecord, setSavedRecord] = useState<PredictionRecord | undefined>(undefined);

  useEffect(() => {
    if (!open) return;
    const all = getPredictions();
    setSavedRecord(all.find((r) => r.matchId === game.matchId));
  }, [open, game.matchId, tick]);

  useEffect(() => {
    if (!open || !game.gameDate) return;
    const gameDate = new Date(game.gameDate);
    if (gameDate < new Date(Date.now() - 24 * 60 * 60 * 1000)) return;
    const predictions: MarketPrediction[] = game.markets.map((m) => {
      const a = analyzeMarket(m);
      return {
        marketType: m.type,
        aiPick: a.selections[a.aiBestIdx].label,
        aiProb: a.selections[a.aiBestIdx].aiProb,
        marketPick: a.selections[a.marketBestIdx].label,
        line: m.line,
      };
    });
    savePredictions({ matchId: game.matchId, homeTeam: game.homeTeam, awayTeam: game.awayTeam, gameDate: game.gameDate, savedAt: new Date().toISOString(), predictions });
  }, [open, game]);

  let gameBadge: string | null = null;
  if (savedRecord) {
    const withActual = savedRecord.predictions.filter((p) => p.actual !== undefined);
    if (withActual.length > 0) {
      const correct = withActual.filter((p) => p.actual === p.aiPick).length;
      gameBadge = `✅ ${correct}/${withActual.length} 적중`;
    }
  }

  // 현재 스코어 기준 예측 적중 여부 계산
  const liveResults: Record<string, string | null> = {};
  if (hasScore && score) {
    for (const m of game.markets) {
      liveResults[m.type] = determineResult(m.type, score.homeScore, score.awayScore, m.line, score.homeHalfScore, score.awayHalfScore);
    }
  }

  const selectedCount = picks.filter(p => p.matchId === game.matchId).length;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm"
      PaperProps={{ sx: { bgcolor: '#1a1a2e', borderRadius: 3 } }}>
      <DialogTitle sx={{ pb: 0.5 }}>
        <Box sx={{ display: 'flex', gap: 1, mb: 0.5, flexWrap: 'wrap', alignItems: 'center' }}>
          {game.sport && <Chip label={game.sport} size="small" variant="outlined" />}
          {gameDateTime && <Chip label={gameDateTime} size="small" variant="outlined" />}
          {isLive && (
            <Chip label={score?.inning ? `LIVE ${score.inning}` : score?.minute ? `LIVE ${score.minute}'` : 'LIVE'} size="small"
              sx={{ bgcolor: '#4caf50', color: '#fff', animation: 'pulse 1.5s infinite',
                '@keyframes pulse': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.6 } } }} />
          )}
          {isFinished && <Chip label="종료" size="small" sx={{ bgcolor: 'rgba(255,255,255,0.1)' }} />}
          {gameBadge && <Chip label={gameBadge} size="small" color="success" />}
          {selectedCount > 0 && <Chip label={`슬립 ${selectedCount}개 선택`} size="small" sx={{ bgcolor: 'rgba(255,215,0,0.2)', color: '#FFD700' }} />}
        </Box>

        {/* 실시간 스코어 표시 */}
        {hasScore && score ? (
          <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 2, my: 1 }}>
            <Typography variant="h6" fontWeight={700} sx={{ flex: 1, textAlign: 'right' }}>
              {game.homeTeam}
            </Typography>
            <Box sx={{ px: 2, py: 0.5, borderRadius: 2,
              bgcolor: isLive ? 'rgba(76,175,80,0.15)' : 'rgba(255,255,255,0.08)' }}>
              <Typography variant="h5" fontWeight={800} sx={{ color: isLive ? '#4caf50' : '#fff' }}>
                {score.homeScore} : {score.awayScore}
              </Typography>
            </Box>
            <Typography variant="h6" fontWeight={700} sx={{ flex: 1, textAlign: 'left' }}>
              {game.awayTeam}
            </Typography>
          </Box>
        ) : (
          <Typography variant="h6" fontWeight={700}>{game.homeTeam} vs {game.awayTeam}</Typography>
        )}
        <Typography variant="caption" color="text.secondary">{sorted.length}개 베팅 마켓 · 배당 박스를 탭하여 슬립에 추가</Typography>
      </DialogTitle>
      <DialogContent>
        <Divider sx={{ mb: 2 }} />
        {sorted.map((m, i) => (
          <MarketBlock key={i} market={m} matchId={game.matchId}
            homeTeam={game.homeTeam} awayTeam={game.awayTeam}
            isPast={isPast}
            savedPred={savedRecord?.predictions.find((p) => p.marketType === m.type)}
            onActualSet={refresh}
            picks={picks} onTogglePick={onTogglePick}
            liveResult={liveResults[m.type] || null}
          />
        ))}
      </DialogContent>
    </Dialog>
  );
}

// ── 게임 카드 ───────────────────────────────────────────────────
function GameRow({ game, picks, onTogglePick, score }: {
  game: BetmanGame; picks: BetPick[]; onTogglePick: (pick: BetPick) => void;
  score?: LiveScore | null;
}) {
  const [open, setOpen] = useState(false);
  const gameDateTime = game.gameDate
    ? new Date(game.gameDate).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '';
  const primary = game.markets.find(m => m.type === '승무패' || m.type === '승1패' || m.type === '승패') || game.markets[0];
  const selectedInGame = picks.filter(p => p.matchId === game.matchId).length;
  const isLive = score?.status === 'LIVE';
  const isFinished = score?.status === 'FINISHED';

  return (
    <>
      <Card sx={{ mb: 1.5,
        border: isLive ? '1px solid rgba(76,175,80,0.6)' : selectedInGame > 0 ? '1px solid rgba(255,215,0,0.4)' : undefined,
        bgcolor: isLive ? 'rgba(76,175,80,0.05)' : undefined,
      }}>
        <CardActionArea onClick={() => setOpen(true)}>
          <CardContent sx={{ pb: '12px !important' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5, alignItems: 'center' }}>
              <Box sx={{ display: 'flex', gap: 0.5, alignItems: 'center' }}>
                <Typography variant="caption" color="text.secondary">
                  {game.sport}{gameDateTime ? ' · ' + gameDateTime : ''}
                </Typography>
                {isLive && (
                  <Chip label={score?.inning ? `LIVE ${score.inning}` : score?.minute ? `LIVE ${score.minute}'` : 'LIVE'} size="small"
                    sx={{ fontSize: 10, height: 18, bgcolor: '#4caf50', color: '#fff', animation: 'pulse 1.5s infinite',
                      '@keyframes pulse': { '0%,100%': { opacity: 1 }, '50%': { opacity: 0.6 } } }} />
                )}
                {isFinished && <Chip label="종료" size="small" sx={{ fontSize: 10, height: 18, bgcolor: 'rgba(255,255,255,0.1)' }} />}
              </Box>
              <Box sx={{ display: 'flex', gap: 0.5 }}>
                {selectedInGame > 0 && <Chip label={`슬립 ${selectedInGame}`} size="small" sx={{ fontSize: 10, height: 18, bgcolor: 'rgba(255,215,0,0.2)', color: '#FFD700' }} />}
                <Chip label={`마켓 ${game.markets.length}`} size="small" sx={{ fontSize: 10, height: 18 }} />
              </Box>
            </Box>

            {/* 팀명 + 실시간 스코어 */}
            {(isLive || isFinished) && score ? (
              <Box sx={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 1.5, mb: 1, py: 0.5 }}>
                <Typography variant="body2" fontWeight={600} sx={{ flex: 1, textAlign: 'right' }}>
                  {game.homeTeam}
                </Typography>
                <Box sx={{ display: 'flex', alignItems: 'center', gap: 0.5,
                  px: 1.5, py: 0.3, borderRadius: 2,
                  bgcolor: isLive ? 'rgba(76,175,80,0.15)' : 'rgba(255,255,255,0.08)' }}>
                  <Typography variant="h6" fontWeight={800} sx={{ color: isLive ? '#4caf50' : '#fff', fontSize: 20 }}>
                    {score.homeScore}
                  </Typography>
                  <Typography variant="body2" color="text.secondary">:</Typography>
                  <Typography variant="h6" fontWeight={800} sx={{ color: isLive ? '#4caf50' : '#fff', fontSize: 20 }}>
                    {score.awayScore}
                  </Typography>
                </Box>
                <Typography variant="body2" fontWeight={600} sx={{ flex: 1, textAlign: 'left' }}>
                  {game.awayTeam}
                </Typography>
              </Box>
            ) : (
              <Typography variant="body2" fontWeight={600} textAlign="center" mb={1}>
                {game.homeTeam} vs {game.awayTeam}
              </Typography>
            )}

            {primary && (
              <Box sx={{ display: 'flex', gap: 1 }}>
                {primary.selections.map((s, i) => (
                  <OddsBox key={i} label={s.label} value={s.odds}
                    selected={picks.some(p => p.matchId === game.matchId && p.marketType === primary.type && p.label === s.label)}
                  />
                ))}
              </Box>
            )}
            <Typography variant="caption" color="text.secondary" display="block" textAlign="center" mt={0.5}>
              탭하여 전체 베팅 보기 · 배당 선택 가능
            </Typography>
          </CardContent>
        </CardActionArea>
      </Card>
      <GameDetail game={game} open={open} onClose={() => setOpen(false)} picks={picks} onTogglePick={onTogglePick} score={score} />
    </>
  );
}

// ── 베팅 슬립 패널 ──────────────────────────────────────────────
function BetSlip({ picks, amount, setAmount, onRemove, onClear, onSave }: {
  picks: BetPick[];
  amount: string;
  setAmount: (v: string) => void;
  onRemove: (matchId: string, marketType: string) => void;
  onClear: () => void;
  onSave: (amount: number, combinedOdds: number, payout: number) => void;
}) {
  const [expanded, setExpanded] = useState(true);

  if (picks.length === 0) return null;

  const combinedOdds = picks.reduce((acc, p) => acc * p.odds, 1);
  const inputAmount = parseInt(amount.replace(/,/g, '')) || 0;
  const payout = Math.floor(inputAmount * combinedOdds);
  const profit = payout - inputAmount;

  const formatKRW = (n: number) => n.toLocaleString('ko-KR') + '원';

  return (
    <Box sx={{
      mb: 2, borderRadius: 2, overflow: 'hidden',
      border: '1px solid rgba(255,215,0,0.4)',
      bgcolor: 'rgba(255,215,0,0.05)',
    }}>
      {/* 헤더 */}
      <Box sx={{ display: 'flex', alignItems: 'center', px: 1.5, py: 1, bgcolor: 'rgba(255,215,0,0.1)', cursor: 'pointer' }}
        onClick={() => setExpanded(e => !e)}>
        <Typography variant="subtitle2" fontWeight={700} sx={{ color: '#FFD700', flex: 1 }}>
          🎯 베팅 슬립 ({picks.length}경기)
        </Typography>
        <Typography variant="caption" sx={{ color: '#FFD700', mr: 1 }}>
          합산 배당 {combinedOdds.toFixed(2)}
        </Typography>
        {expanded ? <ExpandLessIcon sx={{ color: '#FFD700', fontSize: 18 }} /> : <ExpandMoreIcon sx={{ color: '#FFD700', fontSize: 18 }} />}
      </Box>

      <Collapse in={expanded}>
        <Box sx={{ p: 1.5 }}>
          {/* 픽 목록 */}
          {picks.map((p) => (
            <Box key={`${p.matchId}-${p.marketType}`}
              sx={{ display: 'flex', alignItems: 'center', mb: 0.8, gap: 1 }}>
              <Box sx={{ flex: 1, minWidth: 0 }}>
                <Typography variant="caption" color="text.secondary" noWrap display="block">
                  {p.homeTeam} vs {p.awayTeam}
                </Typography>
                <Typography variant="caption" fontWeight={600} noWrap>
                  {p.marketType} · <span style={{ color: '#FFD700' }}>{p.label}</span> @ {p.odds.toFixed(2)}
                </Typography>
              </Box>
              <IconButton size="small" onClick={() => onRemove(p.matchId, p.marketType)}
                sx={{ color: 'text.disabled', '&:hover': { color: 'error.main' } }}>
                <DeleteIcon sx={{ fontSize: 16 }} />
              </IconButton>
            </Box>
          ))}

          <Divider sx={{ my: 1.2 }} />

          {/* 금액 입력 */}
          <Box sx={{ display: 'flex', gap: 1, alignItems: 'center', mb: 1 }}>
            <TextField
              size="small" label="베팅 금액" placeholder="10,000"
              value={amount}
              onChange={(e) => {
                const raw = e.target.value.replace(/[^0-9]/g, '');
                setAmount(raw ? parseInt(raw).toLocaleString() : '');
              }}
              InputProps={{ endAdornment: <Typography variant="caption" color="text.secondary">원</Typography> }}
              sx={{ flex: 1, '& .MuiInputBase-input': { fontSize: 14 } }}
            />
            <Button size="small" variant="outlined" color="error" onClick={onClear}
              sx={{ whiteSpace: 'nowrap', fontSize: 12 }}>전체삭제</Button>
          </Box>

          {/* 빠른 금액 버튼 */}
          <Box sx={{ display: 'flex', gap: 0.5, mb: 1.2, flexWrap: 'wrap' }}>
            {[1000, 5000, 10000, 50000, 100000].map(v => (
              <Chip key={v} label={formatKRW(v)} size="small" variant="outlined"
                onClick={() => setAmount(v.toLocaleString())}
                sx={{ fontSize: 10, height: 22, cursor: 'pointer' }} />
            ))}
          </Box>

          {/* 계산 결과 */}
          {inputAmount > 0 && (
            <Box sx={{ bgcolor: 'rgba(255,215,0,0.08)', borderRadius: 1.5, p: 1.2 }}>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography variant="caption" color="text.secondary">베팅 금액</Typography>
                <Typography variant="caption">{formatKRW(inputAmount)}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5 }}>
                <Typography variant="caption" color="text.secondary">합산 배당</Typography>
                <Typography variant="caption" sx={{ color: '#FFD700' }}>× {combinedOdds.toFixed(2)}</Typography>
              </Box>
              <Divider sx={{ my: 0.5 }} />
              <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.3 }}>
                <Typography variant="body2" fontWeight={700}>예상 수익금</Typography>
                <Typography variant="body2" fontWeight={700} sx={{ color: '#4fc3f7' }}>{formatKRW(payout)}</Typography>
              </Box>
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="caption" color="text.secondary">순이익</Typography>
                <Typography variant="caption" color={profit >= 0 ? 'success.main' : 'error.main'}>
                  {profit >= 0 ? '+' : ''}{formatKRW(profit)}
                </Typography>
              </Box>
            </Box>
          )}

          {/* 저장 버튼 */}
          <Button fullWidth variant="contained" disabled={inputAmount <= 0}
            onClick={() => onSave(inputAmount, combinedOdds, payout)}
            sx={{ mt: 1.2, bgcolor: '#FFD700', color: '#1a1a2e', fontWeight: 700,
              '&:hover': { bgcolor: '#e6c200' } }}>
            💾 이 베팅 저장하기
          </Button>
        </Box>
      </Collapse>
    </Box>
  );
}

// ── 저장된 베팅 목록 ────────────────────────────────────────────
function SavedBets({ bets, onRemove }: { bets: SavedBet[]; onRemove: (id: string) => void }) {
  const [expanded, setExpanded] = useState(false);
  if (bets.length === 0) return null;
  const formatKRW = (n: number) => n.toLocaleString('ko-KR') + '원';

  return (
    <Box sx={{ mb: 2, borderRadius: 2, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.1)' }}>
      <Box sx={{ display: 'flex', alignItems: 'center', px: 1.5, py: 1, bgcolor: 'rgba(255,255,255,0.04)', cursor: 'pointer' }}
        onClick={() => setExpanded((e) => !e)}>
        <Typography variant="subtitle2" fontWeight={700} sx={{ flex: 1 }}>
          📒 저장된 베팅 ({bets.length})
        </Typography>
        {expanded ? <ExpandLessIcon sx={{ fontSize: 18 }} /> : <ExpandMoreIcon sx={{ fontSize: 18 }} />}
      </Box>
      <Collapse in={expanded}>
        <Box sx={{ p: 1.5 }}>
          {bets.map((b) => (
            <Box key={b.id} sx={{ mb: 1.2, p: 1.2, borderRadius: 1.5, bgcolor: 'rgba(255,255,255,0.03)' }}>
              <Box sx={{ display: 'flex', alignItems: 'center', mb: 0.5 }}>
                <Typography variant="caption" color="text.secondary" sx={{ flex: 1 }}>
                  {new Date(b.savedAt).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  {' · '}{b.picks.length}경기
                </Typography>
                <IconButton size="small" onClick={() => onRemove(b.id)}
                  sx={{ color: 'text.disabled', '&:hover': { color: 'error.main' } }}>
                  <DeleteIcon sx={{ fontSize: 16 }} />
                </IconButton>
              </Box>
              {b.picks.map((p) => (
                <Typography key={`${p.matchId}-${p.marketType}`} variant="caption" display="block" noWrap>
                  {p.homeTeam} vs {p.awayTeam} · {p.marketType} <span style={{ color: '#FFD700' }}>{p.label}</span> @ {p.odds.toFixed(2)}
                </Typography>
              ))}
              <Divider sx={{ my: 0.6 }} />
              <Box sx={{ display: 'flex', justifyContent: 'space-between' }}>
                <Typography variant="caption" color="text.secondary">
                  베팅 {formatKRW(b.amount)} · 배당 ×{b.combinedOdds.toFixed(2)}
                </Typography>
                <Typography variant="caption" fontWeight={700} sx={{ color: '#4fc3f7' }}>
                  {formatKRW(b.payout)}
                </Typography>
              </Box>
            </Box>
          ))}
        </Box>
      </Collapse>
    </Box>
  );
}

// ── 적중률 패널 ─────────────────────────────────────────────────
function AccuracyPanel() {
  const stats = getAccuracyStats();
  if (stats.total === 0) return null;
  const aiPct = (stats.aiCorrect / stats.total * 100).toFixed(0);
  const mktPct = (stats.marketCorrect / stats.total * 100).toFixed(0);
  return (
    <Box sx={{ mb: 2, p: 1.5, borderRadius: 2, bgcolor: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
      <Typography variant="caption" color="text.secondary" display="block" mb={0.5} fontWeight={600}>예측 적중률</Typography>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <Chip label={`AI 예측 적중률: ${stats.aiCorrect}/${stats.total} (${aiPct}%)`} size="small" color="primary" variant="outlined" />
        <Chip label={`시장 배당 적중률: ${stats.marketCorrect}/${stats.total} (${mktPct}%)`} size="small" variant="outlined" />
      </Box>
    </Box>
  );
}

// ── 메인 컴포넌트 ───────────────────────────────────────────────
export default function BetmanGames({ type, sportFilter = '' }: { type: 'toto' | 'proto'; sportFilter?: string }) {
  const { data, isLoading, error } = useBetmanData();
  const { data: liveData } = useLiveScores();
  const liveScores = liveData?.scores;
  const [picks, setPicks] = useState<BetPick[]>(() => loadPicks());
  const [amount, setAmountState] = useState<string>(() => loadAmount());
  const [savedBets, setSavedBets] = useState<SavedBet[]>(() => getSavedBets());

  // 슬립/금액 변경 시 localStorage에 영구 저장 (앱 재시작해도 유지)
  useEffect(() => { savePicks(picks); }, [picks]);
  const setAmount = useCallback((v: string) => { setAmountState(v); saveAmount(v); }, []);

  const handleTogglePick = useCallback((pick: BetPick) => {
    setPicks(prev => {
      const existing = prev.findIndex(p => p.matchId === pick.matchId && p.marketType === pick.marketType);
      if (existing >= 0) {
        // 같은 마켓에서 같은 항목이면 제거, 다른 항목이면 교체
        if (prev[existing].label === pick.label) {
          return prev.filter((_, i) => i !== existing);
        }
        return prev.map((p, i) => i === existing ? pick : p);
      }
      return [...prev, pick];
    });
  }, []);

  const handleRemove = useCallback((matchId: string, marketType: string) => {
    setPicks(prev => prev.filter(p => !(p.matchId === matchId && p.marketType === marketType)));
  }, []);

  const handleClear = useCallback(() => { setPicks([]); setAmount(''); }, [setAmount]);

  const handleSaveBet = useCallback((amt: number, combinedOdds: number, payout: number) => {
    addSavedBet({ picks, amount: amt, combinedOdds, payout });
    setSavedBets(getSavedBets());
    setPicks([]);
    setAmount('');
  }, [picks, setAmount]);

  const handleRemoveSaved = useCallback((id: string) => {
    removeSavedBet(id);
    setSavedBets(getSavedBets());
  }, []);

  // 데이터 로드 시 모든 경기 예측 자동 저장 (전날 대시보드용)
  useEffect(() => {
    if (!data) return;
    const allGames = [...(data.proto || []), ...(data.toto || [])];
    for (const game of allGames) {
      if (!game.gameDate) continue;
      const predictions: MarketPrediction[] = game.markets.map((m) => {
        const a = analyzeMarket(m);
        return {
          marketType: m.type,
          aiPick: a.selections[a.aiBestIdx].label,
          aiProb: a.selections[a.aiBestIdx].aiProb,
          marketPick: a.selections[a.marketBestIdx].label,
          line: m.line,
        };
      });
      savePredictions({ matchId: game.matchId, homeTeam: game.homeTeam, awayTeam: game.awayTeam, gameDate: game.gameDate, savedAt: new Date().toISOString(), predictions });
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data?.updatedAt]);

  if (isLoading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>;
  if (error) return <Alert severity="warning">배트맨 데이터를 불러올 수 없습니다.</Alert>;
  if (!data) return null;

  const games = (type === 'toto' ? data.toto : data.proto) || [];
  const updatedAt = data.updatedAt ? new Date(data.updatedAt).toLocaleString('ko-KR') : '';
  let sorted = [...games].sort((a, b) => (a.gameDate || '').localeCompare(b.gameDate || ''));
  if (sportFilter) sorted = sorted.filter(g => g.sport === sportFilter);

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'flex-end', mb: 2 }}>
        {updatedAt && <Typography variant="caption" color="text.secondary">갱신: {updatedAt}</Typography>}
      </Box>

      {/* 베팅 슬립 (상단 고정) */}
      <BetSlip picks={picks} amount={amount} setAmount={setAmount}
        onRemove={handleRemove} onClear={handleClear} onSave={handleSaveBet} />

      <SavedBets bets={savedBets} onRemove={handleRemoveSaved} />

      <AccuracyPanel />

      {data.error && <Alert severity="warning" sx={{ mb: 2 }}>스크래핑 오류: {data.error}</Alert>}

      {sorted.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Typography color="text.secondary">
            {sportFilter ? `${sportFilter} 경기 데이터가 없습니다.` : '데이터가 없습니다.'}
          </Typography>
          {!sportFilter && (
            <Typography variant="caption" color="text.secondary" display="block" mt={1}>
              GitHub Actions → Scrape Betman 워크플로우를 수동으로 실행해주세요.
            </Typography>
          )}
        </Box>
      ) : (
        sorted.map((g) => (
          <GameRow key={g.matchId} game={g} picks={picks} onTogglePick={handleTogglePick}
            score={liveScores ? matchScore(g, liveScores) : null} />
        ))
      )}
    </Box>
  );
}
