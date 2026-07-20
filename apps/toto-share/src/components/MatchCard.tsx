import {
  Card,
  CardContent,
  Box,
  Typography,
  Button,
  ButtonGroup,
  Chip,
  Stack,
} from '@mui/material';
import LockIcon from '@mui/icons-material/Lock';
import AccessTimeIcon from '@mui/icons-material/AccessTime';
import type { Match, Selection, PickSummary } from '../types';

interface Props {
  match: Match;
  mySelection?: Selection;
  pickSummary: PickSummary;
  onSelect: (matchId: string, sel: Selection) => void;
}

function formatTime(ts: number): string {
  const d = new Date(ts);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function getLabels(marketType?: string): { home: string; draw: string; away: string } {
  switch (marketType) {
    case '언더오버':
    case '전반 언더오버':
      return { home: '언더', draw: '', away: '오버' };
    case 'SUM':
      return { home: '홀', draw: '', away: '짝' };
    case '핸디캡':
    case '핸디캡2':
    case '소수핸디캡':
    case '세트핸디캡':
    case '전반 핸디캡':
      return { home: '승', draw: '무', away: '패' };
    case '승패':
      return { home: '승', draw: '', away: '패' };
    case '승1패':
      return { home: '승', draw: '1', away: '패' };
    default:
      return { home: '홈승', draw: '무', away: '원정승' };
  }
}

function marketColor(marketType?: string): string | undefined {
  switch (marketType) {
    case '핸디캡':
    case '핸디캡2':
    case '소수핸디캡':
    case '세트핸디캡':
    case '전반 핸디캡':
      return '#e65100';
    case '언더오버':
    case '전반 언더오버':
      return '#1565c0';
    case 'SUM':
      return '#6a1b9a';
    default:
      return undefined;
  }
}

function SelectionButton({
  label,
  odds,
  count,
  selected,
  disabled,
  color,
  onClick,
}: {
  label: string;
  odds: number;
  count: number;
  selected: boolean;
  disabled: boolean;
  color: 'primary' | 'warning' | 'secondary';
  onClick: () => void;
}) {
  return (
    <Button
      variant={selected ? 'contained' : 'outlined'}
      color={color}
      disabled={disabled}
      onClick={onClick}
      sx={{
        flex: 1,
        flexDirection: 'column',
        py: 1,
        minWidth: 0,
        position: 'relative',
      }}
    >
      <Typography variant="caption" sx={{ fontWeight: 700, fontSize: '0.7rem' }}>
        {label}
      </Typography>
      <Typography variant="body2" sx={{ fontWeight: 700 }}>
        {odds.toFixed(2)}
      </Typography>
      {count > 0 && (
        <Chip
          label={count}
          size="small"
          color={color}
          sx={{
            position: 'absolute',
            top: -8,
            right: -4,
            height: 18,
            fontSize: '0.65rem',
            '& .MuiChip-label': { px: 0.5 },
          }}
        />
      )}
    </Button>
  );
}

export default function MatchCard({ match, mySelection, pickSummary, onSelect }: Props) {
  const isLocked = match.status !== 'OPEN';
  const isStarted = Date.now() > match.startTime;
  const disabled = isLocked || isStarted;
  const labels = getLabels(match.marketType);
  const mColor = marketColor(match.marketType);

  return (
    <Card sx={{ mb: 1.5 }}>
      <CardContent sx={{ py: 1.5, px: 2, '&:last-child': { pb: 1.5 } }}>
        <Stack
          direction="row"
          alignItems="center"
          justifyContent="space-between"
          sx={{ mb: 1 }}
        >
          <Stack direction="row" spacing={0.5} alignItems="center">
            <Chip
              label={match.league}
              size="small"
              variant="outlined"
              sx={{ fontSize: '0.65rem', height: 20 }}
            />
            {match.marketType && match.marketType !== '승무패' && (
              <Chip
                label={match.marketType}
                size="small"
                sx={{
                  fontSize: '0.6rem',
                  height: 18,
                  bgcolor: mColor || 'grey.700',
                  color: '#fff',
                  fontWeight: 700,
                }}
              />
            )}
            <Typography variant="caption" color="text.secondary">
              #{match.gameNo}
            </Typography>
          </Stack>
          <Stack direction="row" spacing={0.5} alignItems="center">
            {disabled ? (
              <LockIcon sx={{ fontSize: 14, color: 'text.disabled' }} />
            ) : (
              <AccessTimeIcon sx={{ fontSize: 14, color: 'text.secondary' }} />
            )}
            <Typography
              variant="caption"
              color={disabled ? 'text.disabled' : 'text.secondary'}
            >
              {formatTime(match.startTime)}
            </Typography>
          </Stack>
        </Stack>

        <Box
          sx={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            mb: 1.5,
          }}
        >
          <Typography
            variant="subtitle2"
            sx={{
              flex: 1,
              textAlign: 'left',
              fontWeight: mySelection === 'HOME' ? 700 : 400,
              color: mySelection === 'HOME' ? 'primary.light' : 'text.primary',
            }}
          >
            {match.homeTeam}
          </Typography>
          <Typography
            variant="caption"
            color="text.secondary"
            sx={{ mx: 1.5, flexShrink: 0 }}
          >
            vs
          </Typography>
          <Typography
            variant="subtitle2"
            sx={{
              flex: 1,
              textAlign: 'right',
              fontWeight: mySelection === 'AWAY' ? 700 : 400,
              color: mySelection === 'AWAY' ? 'secondary.light' : 'text.primary',
            }}
          >
            {match.awayTeam}
          </Typography>
        </Box>

        <ButtonGroup fullWidth size="small" sx={{ gap: 0.5 }}>
          <SelectionButton
            label={labels.home}
            odds={match.oddsHome}
            count={pickSummary.HOME}
            selected={mySelection === 'HOME'}
            disabled={disabled}
            color="primary"
            onClick={() => onSelect(match.id, 'HOME')}
          />
          {match.oddsDraw > 0 && labels.draw && (
            <SelectionButton
              label={labels.draw}
              odds={match.oddsDraw}
              count={pickSummary.DRAW}
              selected={mySelection === 'DRAW'}
              disabled={disabled}
              color="warning"
              onClick={() => onSelect(match.id, 'DRAW')}
            />
          )}
          <SelectionButton
            label={labels.away}
            odds={match.oddsAway}
            count={pickSummary.AWAY}
            selected={mySelection === 'AWAY'}
            disabled={disabled}
            color="secondary"
            onClick={() => onSelect(match.id, 'AWAY')}
          />
        </ButtonGroup>
      </CardContent>
    </Card>
  );
}
