# 📹 WiFi 영상통화 (OS 독립 · WebRTC)

같은 WiFi(또는 인터넷)에 연결된 기기끼리 **브라우저만으로** 영상통화를 할 수 있는 앱입니다.
설치가 필요 없고 **Windows / macOS / Linux / Android / iOS** 어디서나 동작합니다.

## ⭐ 가장 쉬운 방법 — 서버도, 배포도 필요 없음 (`pages/`)

`pages/` 폴더는 **PeerJS 공개 클라우드**로 신호를 주고받아, **내가 서버를 전혀 운영하지 않아도**
바로 통화됩니다. 이 폴더는 GitHub Pages 로 자동 배포됩니다
(`.github/workflows/pages.yml`).

- **접속 주소**: https://vlralf77-svg.github.io/rep/
- 아무 기기(PC/폰)나 위 주소를 브라우저로 열고 → 이름·방 코드 입력 → 통화 🎉
- 영상·음성은 여전히 기기끼리 **P2P**로 직접 흐릅니다. (신호 교환만 공개 서버 경유)
- ⚠️ 방 코드는 **전 세계 공용**이라 겹치지 않게 특이하게 지어주세요 (🎲 버튼 추천).

> 아래 "실행 방법 / 클라우드 배포"는 **내 시그널링 서버를 직접 운영**하고 싶을 때의 대안입니다.
> 그냥 쓰실 거면 위 주소만으로 충분합니다.

---

## 왜 OS에 상관없나요?

- **클라이언트**: 표준 웹 브라우저의 **WebRTC** 만 사용합니다. 앱 설치가 필요 없습니다.
- **서버**: 신호 교환(시그널링)과 정적 파일만 담당하는 가벼운 Node.js 서버입니다.
- **영상/음성**: 브라우저끼리 **P2P**로 직접 흐릅니다. 같은 WiFi 안에서는 서버를 거의 거치지 않아
  빠르고, 데이터가 외부로 나가지 않습니다.

## ☁️ 무료 클라우드 배포 (권장 · PC 안 켜도 됨)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/vlralf77-svg/rep)

**Render** 무료 웹 서비스에 올리면, 내 PC가 꺼져 있어도 **인터넷 어디서나** `https://주소` 하나로
통화할 수 있습니다. Render 가 **정식 HTTPS 인증서**를 자동으로 붙여주므로 "안전하지 않음" 경고도 없습니다.

**배포 순서**
1. https://render.com 가입 (GitHub 계정으로 무료).
2. 위 **Deploy to Render** 버튼을 누르거나, 대시보드에서 **New → Blueprint** → 이 저장소 선택.
   - 저장소 루트의 `render.yaml` 을 읽어 `wifi-videocall` 서비스가 자동 구성됩니다.
   - (수동으로 할 경우) New → Web Service → Root Directory `apps/videocall`,
     Build `npm install`, Start `node server.js`, 환경변수 `HTTP=1` 추가.
3. 배포가 끝나면 `https://wifi-videocall-xxxx.onrender.com` 같은 주소가 생깁니다.
4. 이 주소를 폰(APK)·PC 브라우저에서 열고, 같은 방 코드로 통화하세요.

> 무료 플랜은 15분간 아무도 접속하지 않으면 잠들었다가, 다음 접속 시 깨어나는 데 30~60초쯤 걸립니다.
> (개인용으로는 충분합니다.)

## 실행 방법 (내 PC를 서버로 · 같은 WiFi)

클라우드 없이 **같은 WiFi 안에서만** 쓰려면 내 PC에서 직접 실행해도 됩니다.

```bash
# 1) 의존성 설치 (모노레포 루트에서)
pnpm install

# 2) 서버 실행
pnpm --filter @sports/videocall start
#  또는  cd apps/videocall && node server.js
```

실행하면 접속 주소가 출력됩니다:

```
    https://localhost:8443
    https://192.168.0.10:8443   ← 같은 WiFi의 다른 기기는 이 주소로 접속
```

## 사용 방법

1. 통화할 기기들을 **같은 WiFi**에 연결합니다.
2. 각 기기의 브라우저에서 위의 `https://<서버IP>:8443` 로 접속합니다.
   - 자체 서명 인증서라 "안전하지 않음" 경고가 뜹니다 → **고급 → 계속 진행**을 누릅니다.
     (카메라/마이크 사용은 HTTPS(보안 컨텍스트)를 요구하므로 필요합니다.)
3. **이름**과 **같은 방 코드**를 입력하고 **입장하기**를 누르면 통화가 시작됩니다.
4. 상단의 **🔗 초대링크 복사** 로 방 링크를 공유할 수도 있습니다.

## 기능

- 다자간 통화 (풀메시 방식, 소규모 그룹에 적합)
- 마이크 / 카메라 on-off
- 화면 공유
- 전/후면 카메라 전환 (모바일)
- 방 코드 기반 입장 · 초대 링크

## 환경 변수

| 변수 | 설명 | 기본값 |
|------|------|--------|
| `PORT` | 서버 포트 | `8443` |
| `HTTP` | `1` 이면 HTTP로 구동 (앞단에서 HTTPS 종단하는 리버스 프록시 뒤에서 사용) | (off) |
| `TURN_URL` | TURN 서버 URL (모바일 데이터/대칭형 NAT 통과용) | 없음 |
| `TURN_USERNAME` / `TURN_CREDENTIAL` | TURN 자격증명 | 없음 |

> 같은 WiFi(LAN) 내 통화에는 STUN/TURN이 없어도 대부분 잘 연결됩니다.
> 서로 다른 네트워크(인터넷 너머)로 통화하려면 방화벽/NAT 환경에 따라 **TURN 서버**가 필요할 수 있습니다.

## 구조

```
apps/videocall/
├── server.js          # HTTPS 정적 서버 + WebSocket 시그널링
├── public/
│   ├── index.html     # UI
│   ├── style.css
│   └── app.js         # WebRTC 메시 로직 (offer/answer/ICE, 화면공유 등)
└── certs/             # 자동 생성되는 자체 서명 인증서 (git 무시)
```
