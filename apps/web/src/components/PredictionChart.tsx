import { Box, Typography, useTheme } from '@mui/material';
import { PieChart, Pie, Cell, Tooltip, ResponsiveContainer, Legend } from 'recharts';

interface PredictionChartProps {
  homeWin: number;
  draw: number;
  awayWin: number;
  homeTeamName: string;
  awayTeamName: string;
}

export default function PredictionChart({
  homeWin,
  draw,
  awayWin,
  homeTeamName,
  awayTeamName,
}: PredictionChartProps) {
  const theme = useTheme();

  const data = [
    { name: `${homeTeamName} 승`, value: Math.round(homeWin * 100), color: theme.palette.primary.main },
    { name: '무승부', value: Math.round(draw * 100), color: theme.palette.grey[500] },
    { name: `${awayTeamName} 승`, value: Math.round(awayWin * 100), color: theme.palette.secondary.main },
  ];

  return (
    <Box>
      <Typography variant="h6" gutterBottom>
        승부 예측
      </Typography>
      <ResponsiveContainer width="100%" height={280}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={70}
            outerRadius={110}
            paddingAngle={3}
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={entry.color} />
            ))}
          </Pie>
          <Tooltip
            formatter={(value: number) => [`${value}%`, '']}
            contentStyle={{
              backgroundColor: theme.palette.background.paper,
              border: `1px solid ${theme.palette.divider}`,
              borderRadius: 8,
            }}
          />
          <Legend
            formatter={(value) => (
              <span style={{ color: theme.palette.text.primary, fontSize: 13 }}>{value}</span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
    </Box>
  );
}
