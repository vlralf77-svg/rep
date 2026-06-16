import { Box, Typography } from '@mui/material';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer } from 'recharts';
import { PredictionResult } from '@sports/shared';

interface Props {
  prediction: PredictionResult;
  homeTeamName: string;
  awayTeamName: string;
}

const COLORS = ['#00C896', '#8B95A8', '#FF6B35'];

export default function PredictionChart({ prediction, homeTeamName, awayTeamName }: Props) {
  const data = [
    { name: `${homeTeamName} 승`, value: prediction.homeWinProbability },
    { name: '무승부', value: prediction.drawProbability },
    { name: `${awayTeamName} 승`, value: prediction.awayWinProbability },
  ];

  return (
    <Box>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={55}
            outerRadius={85}
            paddingAngle={3}
            dataKey="value"
          >
            {data.map((_, i) => (
              <Cell key={i} fill={COLORS[i]} />
            ))}
          </Pie>
          <Tooltip formatter={(v) => `${v}%`} contentStyle={{ backgroundColor: '#131929', border: 'none', borderRadius: 8 }} />
        </PieChart>
      </ResponsiveContainer>

      <Box display="flex" justifyContent="center" gap={3} mt={1}>
        {data.map((d, i) => (
          <Box key={i} textAlign="center">
            <Box sx={{ width: 10, height: 10, borderRadius: '50%', backgroundColor: COLORS[i], mx: 'auto', mb: 0.5 }} />
            <Typography variant="caption" color="text.secondary" display="block">{d.name}</Typography>
            <Typography fontWeight={700} color={COLORS[i]}>{d.value}%</Typography>
          </Box>
        ))}
      </Box>
    </Box>
  );
}
