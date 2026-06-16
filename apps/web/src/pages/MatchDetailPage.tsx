import { useParams, useNavigate } from 'react-router-dom';
import {
  Container, Typography, Box, Chip, Avatar, Grid, Card, CardContent,
  Table, TableBody, TableCell, TableHead, TableRow, CircularProgress,
  Alert, IconButton, AppBar, Toolbar, Divider,
} from '@mui/material';
import ArrowBackIcon from '@mui/icons-material/ArrowBack';
import { useMatchPrediction } from '../api/hooks';
import PredictionChart from '../components/PredictionChart';

function FormChip({ result }: { result: string }) {
  const color = result === 'W' ? 'success' : result === 'L' ? 'error' : 'default';
  return <Chip label={result} size="small" color={color as 'success' | 'error' | 'default'} sx={{ minWidth: 32 }} />;
}

export default function MatchDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const matchId = id ? parseInt(id) : null;

  const { data, isLoading, error } = useMatchPrediction(matchId);

  if (isLoading) {
    return (
      <Box sx={{ display: 'flex', justifyContent: 'center', alignItems: 'center', minHeight: '60vh' }}>
        <CircularProgress />
      </Box>
    );
  }

  if (error || !data) {
    return (
      <Container sx={{ py: 4 }}>
        <Alert severity="error">예측 데이터를 불러오는데 실패했습니다.</Alert>
      </Container>
    );
  }

  const { match, prediction, h2h, homeTeamForm, awayTeamForm } = data;

  return (
    <>
      <AppBar position="sticky" elevation={0} sx={{ borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <Toolbar>
          <IconButton onClick={() => navigate(-1)} edge="start" sx={{ mr: 1 }}>
            <ArrowBackIcon />
          </IconButton>
          <Typography variant="h6" fontWeight={700}>
            경기 분석
          </Typography>
        </Toolbar>
      </AppBar>

      <Container maxWidth="md" sx={{ py: 3 }}>
        {/* Match Header */}
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="caption" color="text.secondary" display="block" textAlign="center" mb={2}>
              {match.competitionName} · 매치데이 {match.matchday}
            </Typography>

            <Grid container alignItems="center" spacing={2}>
              <Grid item xs={5}>
                <Box sx={{ textAlign: 'center' }}>
                  <Avatar
                    src={match.homeTeam.crest}
                    sx={{ width: 64, height: 64, mx: 'auto', mb: 1 }}
                  />
                  <Typography variant="h6" fontWeight={700}>{match.homeTeam.shortName}</Typography>
                  <Typography variant="caption" color="text.secondary">{match.homeTeam.name}</Typography>
                </Box>
              </Grid>
              <Grid item xs={2}>
                <Typography variant="h4" textAlign="center" fontWeight={700}>
                  {match.status === 'FINISHED'
                    ? `${match.homeScore ?? 0} - ${match.awayScore ?? 0}`
                    : 'vs'
                  }
                </Typography>
              </Grid>
              <Grid item xs={5}>
                <Box sx={{ textAlign: 'center' }}>
                  <Avatar
                    src={match.awayTeam.crest}
                    sx={{ width: 64, height: 64, mx: 'auto', mb: 1 }}
                  />
                  <Typography variant="h6" fontWeight={700}>{match.awayTeam.shortName}</Typography>
                  <Typography variant="caption" color="text.secondary">{match.awayTeam.name}</Typography>
                </Box>
              </Grid>
            </Grid>
          </CardContent>
        </Card>

        {/* Prediction Chart */}
        {prediction && (
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <PredictionChart
                homeWin={prediction.homeWinProbability}
                draw={prediction.drawProbability}
                awayWin={prediction.awayWinProbability}
                homeTeamName={match.homeTeam.shortName}
                awayTeamName={match.awayTeam.shortName}
              />

              <Divider sx={{ my: 2 }} />

              <Box sx={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center' }}>
                <Box>
                  <Typography variant="h5" color="primary.main" fontWeight={700}>
                    {(prediction.homeWinProbability * 100).toFixed(0)}%
                  </Typography>
                  <Typography variant="caption" color="text.secondary">홈승</Typography>
                </Box>
                <Box>
                  <Typography variant="h5" fontWeight={700}>
                    {(prediction.drawProbability * 100).toFixed(0)}%
                  </Typography>
                  <Typography variant="caption" color="text.secondary">무승부</Typography>
                </Box>
                <Box>
                  <Typography variant="h5" color="secondary.main" fontWeight={700}>
                    {(prediction.awayWinProbability * 100).toFixed(0)}%
                  </Typography>
                  <Typography variant="caption" color="text.secondary">원정승</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        )}

        {/* Top Score Predictions */}
        {prediction?.topScorePredictions && (
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>예상 스코어 TOP 3</Typography>
              <Box sx={{ display: 'flex', gap: 2, flexWrap: 'wrap' }}>
                {prediction.topScorePredictions.map((score: { homeScore: number; awayScore: number; probability: number }, idx: number) => (
                  <Box key={idx} sx={{
                    textAlign: 'center',
                    p: 2,
                    border: '1px solid rgba(255,255,255,0.12)',
                    borderRadius: 2,
                    minWidth: 100,
                    flex: 1,
                  }}>
                    <Typography variant="h5" fontWeight={700}>
                      {score.homeScore} - {score.awayScore}
                    </Typography>
                    <Typography variant="body2" color="text.secondary">
                      {(score.probability * 100).toFixed(1)}%
                    </Typography>
                  </Box>
                ))}
              </Box>
            </CardContent>
          </Card>
        )}

        {/* Recent Form */}
        <Card sx={{ mb: 3 }}>
          <CardContent>
            <Typography variant="h6" gutterBottom>최근 폼</Typography>
            <Grid container spacing={2}>
              <Grid item xs={6}>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  {match.homeTeam.shortName}
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                  {homeTeamForm.length > 0
                    ? homeTeamForm.map((r: string, i: number) => <FormChip key={i} result={r} />)
                    : <Typography variant="body2" color="text.secondary">데이터 없음</Typography>
                  }
                </Box>
              </Grid>
              <Grid item xs={6}>
                <Typography variant="body2" color="text.secondary" gutterBottom>
                  {match.awayTeam.shortName}
                </Typography>
                <Box sx={{ display: 'flex', gap: 0.5, flexWrap: 'wrap' }}>
                  {awayTeamForm.length > 0
                    ? awayTeamForm.map((r: string, i: number) => <FormChip key={i} result={r} />)
                    : <Typography variant="body2" color="text.secondary">데이터 없음</Typography>
                  }
                </Box>
              </Grid>
            </Grid>
          </CardContent>
        </Card>

        {/* H2H */}
        {h2h && (
          <Card sx={{ mb: 3 }}>
            <CardContent>
              <Typography variant="h6" gutterBottom>상대 전적 (H2H)</Typography>
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell align="center">홈승</TableCell>
                    <TableCell align="center">무</TableCell>
                    <TableCell align="center">원정승</TableCell>
                    <TableCell align="center">총경기</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  <TableRow>
                    <TableCell align="center">
                      <Typography color="primary.main" fontWeight={700}>{h2h.homeWins}</Typography>
                    </TableCell>
                    <TableCell align="center">{h2h.draws}</TableCell>
                    <TableCell align="center">
                      <Typography color="secondary.main" fontWeight={700}>{h2h.awayWins}</Typography>
                    </TableCell>
                    <TableCell align="center">{h2h.totalMatches || h2h.homeWins + h2h.draws + h2h.awayWins}</TableCell>
                  </TableRow>
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}

        {/* Expected Goals */}
        {prediction && (
          <Card>
            <CardContent>
              <Typography variant="h6" gutterBottom>예상 득점</Typography>
              <Box sx={{ display: 'flex', justifyContent: 'space-around', textAlign: 'center' }}>
                <Box>
                  <Typography variant="h5" color="primary.main" fontWeight={700}>
                    {prediction.expectedHomeGoals.toFixed(2)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">{match.homeTeam.shortName}</Typography>
                </Box>
                <Box>
                  <Typography variant="h5" color="secondary.main" fontWeight={700}>
                    {prediction.expectedAwayGoals.toFixed(2)}
                  </Typography>
                  <Typography variant="caption" color="text.secondary">{match.awayTeam.shortName}</Typography>
                </Box>
              </Box>
            </CardContent>
          </Card>
        )}
      </Container>
    </>
  );
}
