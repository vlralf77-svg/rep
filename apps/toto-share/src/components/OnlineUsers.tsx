import { Box, Avatar, Chip, Stack, Typography } from '@mui/material';
import CircleIcon from '@mui/icons-material/Circle';
import type { UserProfile } from '../types';

interface Props {
  users: UserProfile[];
  currentUid?: string;
}

function stringToColor(str: string): string {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = str.charCodeAt(i) + ((hash << 5) - hash);
  }
  const hue = Math.abs(hash) % 360;
  return `hsl(${hue}, 60%, 45%)`;
}

export default function OnlineUsers({ users, currentUid }: Props) {
  return (
    <Stack direction="row" spacing={0.5} alignItems="center" sx={{ flexWrap: 'wrap', gap: 0.5 }}>
      <CircleIcon sx={{ fontSize: 8, color: 'success.main' }} />
      <Typography variant="caption" color="text.secondary" sx={{ mr: 0.5 }}>
        {users.length}명 접속
      </Typography>
      {users.map((u) => (
        <Chip
          key={u.uid}
          avatar={
            <Avatar sx={{ bgcolor: stringToColor(u.nickname), width: 20, height: 20, fontSize: '0.65rem' }}>
              {u.nickname[0]}
            </Avatar>
          }
          label={u.nickname}
          size="small"
          variant={u.uid === currentUid ? 'filled' : 'outlined'}
          color={u.uid === currentUid ? 'primary' : 'default'}
          sx={{ fontSize: '0.7rem', height: 24 }}
        />
      ))}
    </Stack>
  );
}
