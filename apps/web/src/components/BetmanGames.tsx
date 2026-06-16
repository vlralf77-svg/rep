import { useState, useEffect, useCallback } from 'react';
import {
  Box, Typography, Card, CardActionArea, CardContent, Chip,
  CircularProgress, Alert, Dialog, DialogTitle, DialogContent,
  Divider, LinearProgress, Button,
} from '@mui/material';
import { useBetmanData } from '../api/hooks';
import { BetmanGame, BetmanMarket } from '../lib/api';
import { analyzeMarket } from '../lib/betman-analyze';
import {
  savePredictions,
  setActualResult,
  getPredictions,
  getAccuracyStats,
  PredictionRecord,
  MarketPrediction,
} from '../lib/betman-history';

function OddsBox({ label, value }: { label: string; value: number }) {
  return (
    <Box sx={{
      flex: 1, textAlign: 'center', p: 1, borderRadius: 1.5, minWidth: 0,
      border: '1px solid', borderColor: 'rgba(255,255,255,0.1)',
      bgcolor: 'rgba(255,255,255,0.03)',
    }}>
      <Typography variant="caption" color="text.secondary" display="block" noWrap>{label}</Typography>
      <Typography variant="h6" fontWeight={700} color="text.primary" fontSize={15}>
        {value > 0 ? value.toFixed(2) : '-'}
      </Typography>
    </Box>
  );
}

// 시장 확률 + AI 확률을 한 줄에 같이 표시 (2가지 예측 비교)
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
      {/* 시장 배당 확률 */}
      <LinearProgress variant="determinate" value={marketProb * 100}
        sx={{ height: 5, borderRadius: 3, mb: 0.4, bgcolor: 'rgba(255,255,255,0.08)',
          '& .MuiLinearProgress-bar': { bgcolor: 'rgba(255,255,255,0.35)' } }} />
      {/* AI 보정 확률 */}
      <LinearProgress variant="determinate" value={aiProb * 100}
        sx={{ height: 5, borderRadius: 3, bgcolor: 'rgba(255,255,255,0.08)',
          '& .MuiLinearProgress-bar': { bgcolor: color } }} />
    </Box>
  );
}

const PALETTE = ['#4fc3f7', '#78909c', '#f48fb1', '#ce93d8', '#ffb74d'];
const CONF_LABEL = { HIGH: '높음', MEDIUM: '보통', LOW: '낮음' } as const;

// 마켓 한 개: 배당 박스 + 2가지 예측(시장/AI) + AI 추천
// + optional result-entry section for past games
function MarketBlock({
  market,
  matchId,
  isPast,
  savedPred,
  onActualSet,
}: {
  market: BetmanMarket;
  matchId: string;
  isPast: boolean;
  savedPred?: MarketPrediction;
  onActualSet?: () => void;
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
            <Chip label={`기준 ${market.line}`} size="small" sx={{ fontSize: 11, height: 20, bgcolor: 'rgba(255,183,77,0.15)', color: '#ffb74d', border: '1px solid rgba(255,183,77,0.4)' }} />
          )}
        </Box>
        <Typography variant="caption" color="text.secondary">마진 {a.margin.toFixed(1)}%</Typography>
      </Box>

      <Box sx={{ display: 'flex', gap: 1, mb: 1.5 }}>
        {market.selections.map((s, i) => (
          <OddsBox key={i} label={s.label} value={s.odds} />
        ))}
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
            : '💤 가치 베팅 없음 (배당 대비 기대값 부족)'}
        </Typography>
        <Typography variant="caption" display="block" color="text.disabled" sx={{ fontSize: 10, mt: 0.3 }}>
          ░ 시장(배당 역산) · ▓ AI(편향 보정) — 두 막대를 비교하세요
        </Typography>
      </Box>

      {isPast && (
        <Box sx={{ mt: 1, pt: 1, borderTop: '1px dashed rgba(255,255,255,0.1)' }}>
          <Typography variant="caption" display="block" color="text.secondary" mb={0.5}>
            결과 입력
          </Typography>
          <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
            {market.selections.map((s, i) => {
              const isSelected = savedPred?.actual === s.label;
              return (
                <Button
                  key={i}
                  size="small"
                  variant={isSelected ? 'contained' : 'outlined'}
                  onClick={() => handleActual(s.label)}
                  sx={{ minWidth: 0, px: 1, py: 0.3, fontSize: 11 }}
                >
                  {s.label}
                </Button>
              );
            })}
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

function GameDetail({ game, open, onClose }: { game: BetmanGame; open: boolean; onClose: () => void }) {
  const gameDateTime = game.gameDate
    ? new Date(game.gameDate).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', weekday: 'short' })
    : '';

  // 원하는 순서로 마켓 정렬
  const order = ['승무패', '승1패', '승패', '전반 승무패', '언더오버', '전반 언더오버', '핸디캡', '전반 핸디캡', 'SUM'];
  const sorted = [...game.markets].sort((a, b) => {
    const ia = order.indexOf(a.type); const ib = order.indexOf(b.type);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });

  const isPast = game.gameDate
    ? new Date(game.gameDate) < new Date(Date.now() - 24 * 60 * 60 * 1000)
    : false;

  // State to trigger re-render when actuals change
  const [tick, setTick] = useState(0);
  const refresh = useCallback(() => setTick((t) => t + 1), []);

  // Load saved predictions for this game
  const [savedRecord, setSavedRecord] = useState<PredictionRecord | undefined>(undefined);

  useEffect(() => {
    if (!open) return;
    const all = getPredictions();
    setSavedRecord(all.find((r) => r.matchId === game.matchId));
  }, [open, game.matchId, tick]);

  // Auto-save predictions when dialog opens (only for games not too far in the past)
  useEffect(() => {
    if (!open) return;
    if (!game.gameDate) return;

    const gameDate = new Date(game.gameDate);
    const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
    if (gameDate < yesterday) return;

    const predictions: MarketPrediction[] = game.markets.map((m) => {
      const a = analyzeMarket(m);
      return {
        marketType: m.type,
        aiPick: a.selections[a.aiBestIdx].label,
        aiProb: a.selections[a.aiBestIdx].aiProb,
        marketPick: a.selections[a.marketBestIdx].label,
      };
    });

    savePredictions({
      matchId: game.matchId,
      homeTeam: game.homeTeam,
      awayTeam: game.awayTeam,
      gameDate: game.gameDate,
      savedAt: new Date().toISOString(),
      predictions,
    });
  }, [open, game]);

  // Compute per-game accuracy badge
  let gameBadge: string | null = null;
  if (savedRecord) {
    const withActual = savedRecord.predictions.filter((p) => p.actual !== undefined);
    if (withActual.length > 0) {
      const correct = withActual.filter((p) => p.actual === p.aiPick).length;
      gameBadge = `✅ ${correct}/${withActual.length} 적중`;
    }
  }

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm"
      PaperProps={{ sx: { bgcolor: '#1a1a2e', borderRadius: 3 } }}>
      <DialogTitle sx={{ pb: 0.5 }}>
        <Box sx={{ display: 'flex', gap: 1, mb: 0.5, flexWrap: 'wrap', alignItems: 'center' }}>
          {game.sport && <Chip label={game.sport} size="small" variant="outlined" />}
          {gameDateTime && <Chip label={gameDateTime} size="small" variant="outlined" />}
          {gameBadge && <Chip label={gameBadge} size="small" color="success" />}
        </Box>
        <Typography variant="h6" fontWeight={700}>{game.homeTeam} vs {game.awayTeam}</Typography>
        <Typography variant="caption" color="text.secondary">{sorted.length}개 베팅 마켓</Typography>
      </DialogTitle>
      <DialogContent>
        <Divider sx={{ mb: 2 }} />
        {sorted.map((m, i) => (
          <MarketBlock
            key={i}
            market={m}
            matchId={game.matchId}
            isPast={isPast}
            savedPred={savedRecord?.predictions.find((p) => p.marketType === m.type)}
            onActualSet={refresh}
          />
        ))}
      </DialogContent>
    </Dialog>
  );
}

function GameRow({ game }: { game: BetmanGame }) {
  const [open, setOpen] = useState(false);
  const gameDateTime = game.gameDate
    ? new Date(game.gameDate).toLocaleString('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })
    : '';

  // 카드에는 대표 마켓(승무패/승1패 우선) 배당만 미리보기
  const primary = game.markets.find(m => m.type === '승무패' || m.type === '승1패' || m.type === '승패')
    || game.markets[0];

  return (
    <>
      <Card sx={{ mb: 1.5 }}>
        <CardActionArea onClick={() => setOpen(true)}>
          <CardContent sx={{ pb: '12px !important' }}>
            <Box sx={{ display: 'flex', justifyContent: 'space-between', mb: 0.5, alignItems: 'center' }}>
              <Typography variant="caption" color="text.secondary">
                {game.sport}{gameDateTime ? ' · ' + gameDateTime : ''}
              </Typography>
              <Chip label={`마켓 ${game.markets.length}`} size="small" sx={{ fontSize: 10, height: 18 }} />
            </Box>
            <Typography variant="body2" fontWeight={600} textAlign="center" mb={1}>
              {game.homeTeam} vs {game.awayTeam}
            </Typography>
            {primary && (
              <Box sx={{ display: 'flex', gap: 1 }}>
                {primary.selections.map((s, i) => (
                  <OddsBox key={i} label={s.label} value={s.odds} />
                ))}
              </Box>
            )}
            <Typography variant="caption" color="text.secondary" display="block" textAlign="center" mt={0.5}>
              탭하여 전체 베팅({game.markets.map(m => m.type).slice(0, 4).join('/')}…) 보기
            </Typography>
          </CardContent>
        </CardActionArea>
      </Card>
      <GameDetail game={game} open={open} onClose={() => setOpen(false)} />
    </>
  );
}

function AccuracyPanel() {
  const stats = getAccuracyStats();
  if (stats.total === 0) return null;

  const aiPct = (stats.aiCorrect / stats.total * 100).toFixed(0);
  const mktPct = (stats.marketCorrect / stats.total * 100).toFixed(0);

  return (
    <Box sx={{
      mb: 2, p: 1.5, borderRadius: 2,
      bgcolor: 'rgba(255,255,255,0.04)',
      border: '1px solid rgba(255,255,255,0.08)',
    }}>
      <Typography variant="caption" color="text.secondary" display="block" mb={0.5} fontWeight={600}>
        예측 적중률
      </Typography>
      <Box sx={{ display: 'flex', gap: 1, flexWrap: 'wrap' }}>
        <Chip
          label={`AI 예측 적중률: ${stats.aiCorrect}/${stats.total} (${aiPct}%)`}
          size="small"
          color="primary"
          variant="outlined"
        />
        <Chip
          label={`시장 배당 적중률: ${stats.marketCorrect}/${stats.total} (${mktPct}%)`}
          size="small"
          variant="outlined"
        />
      </Box>
    </Box>
  );
}

export default function BetmanGames({ type, sportFilter = '' }: { type: 'toto' | 'proto'; sportFilter?: string }) {
  const { data, isLoading, error } = useBetmanData();

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
        sorted.map((g) => <GameRow key={g.matchId} game={g} />)
      )}
    </Box>
  );
}
