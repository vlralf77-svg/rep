import { useParams, useNavigate } from 'react-router-dom';
import {
  Container, Box, Typography, CircularProgress, Alert, Card, CardContent,
  Chip, Avatar, Grid, Divider, Button, Table, TableBody, TableRow, TableCell,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useMatches, usePrediction } from '../api/hooks';
import PredictionChart from '../components/PredictionChart';
import Disclaimer from '../components/Disclaimer';

function FormChips({ form }: { form?: string }) {
  if (!form) return null;
  return (
    <Box display="flex" gap={0.5} flexWrap="wrap">
      {form.split('').slice(0, 5).map((r, i) => (
        <Chip
          key={i}
          label={r}
          size="small"
          sx={{
            width: 28, height: 28, fontSize: 12, fontWeight: 700,
            backgroundColor: r === 'W' ? 'rgba(0,200,150,0.2)' : r === 'D' ? 'rgba(139,149,168,0.2)' : 'rgba(255,107,53,0.2)',
            color: r === 'W' ? '#00C896' : r === 'D' ? '#8B95A8' : '#FF6B35',
          }}
        />
      ))}
    </Box>
  );
}

export default function MatchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const matchId = parseInt(id!);

  const { data: matches, isLoading: matchLoading } = useMatches();
  const { data: prediction, isLoading: predLoading, error: predError } = usePrediction(matchId);

  const match = matches?.find((m: any) => m.id === matchId);

  if (matchLoading) return <Box textAlign="center" py={6}><CircularProgress /></Box>;
  if (!match) return <Alert severity="error">경기를 찾을 수 없습니다.</Alert>;

  const date = new Date(match.utcDate).toLocaleString('ko-KR', {
    year: 'numeric', month: 'long', day: 'numeric', weekday: 'long', hour: '2-digit', minute: '2-digit',
  });

  return (
    <Container maxWidth="sm" sx={{ py: 3 }}>
      <Button startIcon={<ArrowBackIcon />} onClick={() => navigate(-1)} sx={{ mb: 2 }} size="small">
        목록으로
      </Button>

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="caption" color="text.secondary">{match.leagueName} · {date}</Typography>
          <Box display="flex" alignItems="center" justifyContent="space-between" mt={2}>
            <Box textAlign="center" flex={1}>
              {match.homeTeam.crest && <Avatar src={match.homeTeam.crest} sx={{ width: 48, height: 48, mx: 'auto', mb: 1 }} variant="square" />}
              <Typography fontWeight={700}>{match.homeTeam.name}</Typography>
              <Typography variant="caption" color="text.secondary">홈</Typography>
            </Box>

            <Box textAlign="center" mx={2}>
              {match.status === 'FINISHED' ? (
                <Typography variant="h4" fontWeight={800}>
                  {match.homeScore} – {match.awayScore}
                </Typography>
              ) : (
                <Typography variant="h6" color="text.secondary">VS</Typography>
              )}
              <Chip label={match.status === 'FINISHED' ? '종료' : '예정'} size="small" sx={{ mt: 1 }} />
            </Box>

            <Box textAlign="center" flex={1}>
              {match.awayTeam.crest && <Avatar src={match.awayTeam.crest} sx={{ width: 48, height: 48, mx: 'auto', mb: 1 }} variant="square" />}
              <Typography fontWeight={700}>{match.awayTeam.name}</Typography>
              <Typography variant="caption" color="text.secondary">원정</Typography>
            </Box>
          </Box>
        </CardContent>
      </Card>

      <Card sx={{ mb: 2 }}>
        <CardContent>
          <Typography variant="h6" mb={2}>AI 예측</Typography>
          {predLoading && <Box textAlign="center"><CircularProgress size={32} /></Box>}
          {predError && <Alert severity="warning">예측 데이터를 계산할 수 없습니다. 경기 데이터가 부족할 수 있습니다.</Alert>}
          {prediction && (
            <>
              <PredictionChart
                prediction={prediction}
                homeTeamName={match.homeTeam.shortName}
                awayTeamName={match.awayTeam.shortName}
              />

              <Divider sx={{ my: 2 }} />

              <Typography variant="subtitle2" mb={1}>예상 스코어 Top 3</Typography>
              <Box display="flex" gap={1} flexWrap="wrap">
                {prediction.topScores.map((s, i) => (
                  <Chip
                    key={i}
                    label={`${s.homeScore}:${s.awayScore} (${s.probability}%)`}
                    variant="outlined"
                    color={i === 0 ? 'primary' : 'default'}
                    size="small"
                  />
                ))}
              </Box>

              <Divider sx={{ my: 2 }} />

              <Typography variant="subtitle2" mb={1}>분석 근거</Typography>
              <Typography variant="body2" color="text.secondary" lineHeight={1.8}>
                {prediction.rationale.split(' | ').map((line, i) => (
                  <span key={i}>{line}<br /></span>
                ))}
              </Typography>

              <Box display="flex" gap={2} mt={2}>
                <Typography variant="caption" color="text.secondary">
                  예상 득점 — 홈: {prediction.expectedHomeGoals} / 원정: {prediction.expectedAwayGoals}
                </Typography>
              </Box>

              <Box display="flex" gap={2} mt={0.5}>
                <Typography variant="caption" color="text.secondary">
                  Elo — 홈: {prediction.homeElo.toFixed(0)} / 원정: {prediction.awayElo.toFixed(0)}
                </Typography>
              </Box>
            </>
          )}
        </CardContent>
      </Card>

      <Disclaimer />
    </Container>
  );
}
