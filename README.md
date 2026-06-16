# 스포츠토토 예측 앱

축구 경기 데이터를 수집·분석하여 승/무/패 및 스코어를 예측하는 웹 애플리케이션입니다.

> ⚠️ **면책 고지**: 이 앱은 통계 기반 정보 제공 도구입니다. 예측 결과는 참고용이며, 베팅 결과를 보장하지 않습니다. 모든 책임은 이용자 본인에게 있습니다.

## 기술 스택

- **Frontend**: React 18 + Vite + TypeScript + MUI v5
- **Backend**: Node.js + Express + TypeScript
- **DB**: SQLite (개발) / PostgreSQL (운영) via Prisma
- **예측 모델**: Poisson 분포 + Elo 레이팅
- **모바일**: Capacitor (Android APK)

## 설치 및 실행

### 사전 요구사항

- Node.js 18+
- pnpm (`npm install -g pnpm`)
- Android Studio (APK 빌드 시)

### 환경변수 설정

```bash
cp .env.example apps/api/.env
# apps/api/.env 파일에서 FOOTBALL_DATA_API_KEY 값을 실제 키로 교체
```

**API 키 발급**: [football-data.org](https://www.football-data.org/client/register) 에서 무료 등록

### 실행

```bash
# 의존성 설치
pnpm install

# 개발 서버 실행 (web: http://localhost:5173, api: http://localhost:3001)
pnpm dev

# DB 초기화
cd apps/api && npx prisma migrate dev --name init
```

### 데이터 동기화

API 서버가 실행 중인 상태에서:

```bash
curl -X POST http://localhost:3001/api/sync
```

## APK 빌드

```bash
# 1. 의존성 설치
pnpm install

# 2. 웹 앱 빌드
pnpm --filter @sports/web build

# 3. Capacitor Android 초기화 (최초 1회)
cd apps/web
npx cap add android

# 4. 동기화 및 APK 빌드
npx cap sync android
cd android && ./gradlew assembleDebug

# APK 위치: apps/web/android/app/build/outputs/apk/debug/app-debug.apk
```

## 프로젝트 구조

```
sports-toto-predict/
├─ apps/
│  ├─ web/          # React + Vite + MUI + Capacitor
│  └─ api/          # Express + Prisma
├─ packages/
│  └─ shared/       # 공통 TypeScript 타입
├─ .env.example
└─ pnpm-workspace.yaml
```

## 예측 알고리즘

- **Elo 레이팅**: 경기 결과에 따라 팀 강도 점수 갱신 (K=32)
- **Poisson 모델**: 팀별 평균 득점/실점으로 스코어 확률 분포 계산
- **홈 어드밴티지**: 홈팀 득점 기대값에 1.1배 계수 적용
- **최근 폼 가중치**: 최근 5경기에 더 높은 가중치 부여
