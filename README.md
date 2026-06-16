# Sports Prediction App

A sports match prediction web app with Android APK support.

## Tech Stack
- **Frontend**: React 18 + Vite + TypeScript + MUI v5
- **Backend**: Node.js + Express + TypeScript + Prisma + SQLite
- **Prediction**: Poisson model + Elo rating
- **Mobile**: Capacitor (Android APK)

## Setup

### Prerequisites
- Node.js 18+
- pnpm 8+
- Android Studio (for APK builds)
- Java 17+

### Install
```bash
cp .env.example .env
# Edit .env with your football-data.org API key
pnpm install
```

### Development
```bash
pnpm dev
```

### Build
```bash
pnpm build
```

### Build Android APK
```bash
pnpm build:apk
# APK will be at apps/web/android/app/build/outputs/apk/debug/app-debug.apk
```

### Initialize Android Project
```bash
cd apps/web
npx cap add android
npx cap sync android
```

## API Endpoints
- `GET /api/matches?league=PL&status=SCHEDULED` - List matches
- `GET /api/matches/:id/prediction` - Get prediction for a match
- `POST /api/sync` - Trigger data sync from football-data.org

## Disclaimer
이 예측은 통계적 분석 기반 참고 정보입니다. 베팅 결과를 보장하지 않으며, 모든 책임은 이용자 본인에게 있습니다.
