import { useState } from 'react';
import {
  Box, Typography, Card, CardActionArea, CardContent, Chip,
  CircularProgress, Alert, Dialog, DialogTitle, DialogContent,
  Divider, LinearProgress,
} from '@mui/material';
import { useBetmanData } from '../api/hooks';
import { BetmanGame, BetmanMarket } from '../lib/api';
import { analyzeMarket } from '../lib/betman-analyze';

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
function MarketBlock({ market }: { market: BetmanMarket }) {
  const a = analyzeMarket(market);
  const aiPick = a.selections[a.aiBestIdx];
  const value = a.valueIdx >= 0 ? a.selections[a.valueIdx] : null;

  return (
    <Box sx={{ mb: 2, bgcolor: 'rgba(255,255,255,0.02)', borderRadius: 2, p: 1.5 }}>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 1 }}>
        <Chip label={market.type} size="small" color="primary" variant="outlined" />
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

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm"
      PaperProps={{ sx: { bgcolor: '#1a1a2e', borderRadius: 3 } }}>
      <DialogTitle sx={{ pb: 0.5 }}>
        <Box sx={{ display: 'flex', gap: 1, mb: 0.5, flexWrap: 'wrap' }}>
          {game.sport && <Chip label={game.sport} size="small" variant="outlined" />}
          {gameDateTime && <Chip label={gameDateTime} size="small" variant="outlined" />}
        </Box>
        <Typography variant="h6" fontWeight={700}>{game.homeTeam} vs {game.awayTeam}</Typography>
        <Typography variant="caption" color="text.secondary">{sorted.length}개 베팅 마켓</Typography>
      </DialogTitle>
      <DialogContent>
        <Divider sx={{ mb: 2 }} />
        {sorted.map((m, i) => <MarketBlock key={i} market={m} />)}
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

export default function BetmanGames({ type }: { type: 'toto' | 'proto' }) {
  const { data, isLoading, error } = useBetmanData();

  if (isLoading) return <Box sx={{ display: 'flex', justifyContent: 'center', py: 4 }}><CircularProgress /></Box>;
  if (error) return <Alert severity="warning">배트맨 데이터를 불러올 수 없습니다.</Alert>;
  if (!data) return null;

  const games = (type === 'toto' ? data.toto : data.proto) || [];
  const updatedAt = data.updatedAt ? new Date(data.updatedAt).toLocaleString('ko-KR') : '';

  const sorted = [...games].sort((a, b) => (a.gameDate || '').localeCompare(b.gameDate || ''));

  return (
    <Box>
      <Box sx={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', mb: 2 }}>
        <Typography variant="subtitle2" color="text.secondary">
          {type === 'toto' ? '스포츠토토' : '프로토 승부식'}
        </Typography>
        {updatedAt && <Typography variant="caption" color="text.secondary">갱신: {updatedAt}</Typography>}
      </Box>

      {data.error && <Alert severity="warning" sx={{ mb: 2 }}>스크래핑 오류: {data.error}</Alert>}

      {sorted.length === 0 ? (
        <Box sx={{ textAlign: 'center', py: 4 }}>
          <Typography color="text.secondary">데이터가 없습니다.</Typography>
          <Typography variant="caption" color="text.secondary" display="block" mt={1}>
            GitHub Actions → Scrape Betman 워크플로우를 수동으로 실행해주세요.
          </Typography>
        </Box>
      ) : (
        sorted.map((g) => <GameRow key={g.matchId} game={g} />)
      )}
    </Box>
  );
}
