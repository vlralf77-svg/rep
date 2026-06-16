import { Box, Typography, Card, CardContent, Chip } from '@mui/material';
import { BettingMarkets } from '../lib/predict';

interface Props {
  betting: BettingMarkets;
  homeTeam: string;
  awayTeam: string;
  isBaseball?: boolean;
}

function pct(v: number) {
  return `${(v * 100).toFixed(1)}%`;
}

function MarketRow({ label, options }: {
  label: string;
  options: { name: string; prob: number; highlight?: boolean }[];
}) {
  const best = options.reduce((a, b) => a.prob > b.prob ? a : b);
  return (
    <Box sx={{ mb: 2 }}>
      <Typography variant="caption" color="text.secondary" fontWeight={600} sx={{ textTransform: 'uppercase', letterSpacing: 0.5 }}>
        {label}
      </Typography>
      <Box sx={{ display: 'flex', gap: 1, mt: 0.5, flexWrap: 'wrap' }}>
        {options.map((opt) => {
          const isBest = opt.prob === best.prob;
          return (
            <Box
              key={opt.name}
              sx={{
                flex: 1,
                minWidth: 80,
                p: 1.5,
                borderRadius: 2,
                textAlign: 'center',
                border: isBest ? '2px solid' : '1px solid',
                borderColor: isBest ? 'primary.main' : 'rgba(255,255,255,0.1)',
                backgroundColor: isBest ? 'rgba(79,195,247,0.1)' : 'rgba(255,255,255,0.03)',
                position: 'relative',
              }}
            >
              {isBest && (
                <Chip label="예상" size="small" color="primary" sx={{ position: 'absolute', top: -10, left: '50%', transform: 'translateX(-50%)', fontSize: 10, height: 18 }} />
              )}
              <Typography variant="body2" color="text.secondary" fontSize={11} mb={0.5}>
                {opt.name}
              </Typography>
              <Typography variant="h6" fontWeight={700} color={isBest ? 'primary.main' : 'text.primary'} fontSize={16}>
                {pct(opt.prob)}
              </Typography>
            </Box>
          );
        })}
      </Box>
    </Box>
  );
}

export default function BettingMarketsCard({ betting, homeTeam, awayTeam, isBaseball }: Props) {
  return (
    <Card sx={{ mb: 3 }}>
      <CardContent>
        <Typography variant="h6" gutterBottom>
          {isBaseball ? '⚾' : '⚽'} 배팅 마켓 예측
        </Typography>
        <Typography variant="caption" color="text.secondary" display="block" mb={2}>
          통계 모델 기반 예측 확률 · 참고용
        </Typography>

        <MarketRow
          label={isBaseball ? '승/패' : '풀타임 승/무/패'}
          options={
            isBaseball
              ? [
                  { name: `${homeTeam} 승`, prob: betting.ftHomeWin },
                  { name: `${awayTeam} 승`, prob: betting.ftAwayWin },
                ]
              : [
                  { name: `${homeTeam} 승`, prob: betting.ftHomeWin },
                  { name: '무승부', prob: betting.ftDraw },
                  { name: `${awayTeam} 승`, prob: betting.ftAwayWin },
                ]
          }
        />

        {!isBaseball && (
          <>
            <MarketRow
              label="풀타임 오버/언더"
              options={[
                { name: '오버 1.5', prob: betting.over15 },
                { name: '언더 1.5', prob: betting.under15 },
              ]}
            />
            <MarketRow
              label=""
              options={[
                { name: '오버 2.5', prob: betting.over25 },
                { name: '언더 2.5', prob: betting.under25 },
              ]}
            />
            <MarketRow
              label=""
              options={[
                { name: '오버 3.5', prob: betting.over35 },
                { name: '언더 3.5', prob: betting.under35 },
              ]}
            />

            <Box sx={{ borderTop: '1px solid rgba(255,255,255,0.08)', pt: 2, mt: 1 }}>
              <MarketRow
                label="전반전 승/무/패"
                options={[
                  { name: `${homeTeam} 승`, prob: betting.htHomeWin },
                  { name: '무승부', prob: betting.htDraw },
                  { name: `${awayTeam} 승`, prob: betting.htAwayWin },
                ]}
              />
              <MarketRow
                label="전반전 오버/언더"
                options={[
                  { name: '오버 0.5', prob: betting.htOver05 },
                  { name: '언더 0.5', prob: betting.htUnder05 },
                ]}
              />
              <MarketRow
                label=""
                options={[
                  { name: '오버 1.5', prob: betting.htOver15 },
                  { name: '언더 1.5', prob: betting.htUnder15 },
                ]}
              />
            </Box>
          </>
        )}
      </CardContent>
    </Card>
  );
}
