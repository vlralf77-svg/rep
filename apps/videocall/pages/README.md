# WiFi 영상통화 — PeerJS 정적 웹 (배포·서버 불필요)

이 폴더는 **내 서버를 전혀 운영하지 않아도** 되는 버전입니다.
시그널링을 **PeerJS 공개 클라우드**(peerjs.com)에 맡기고, 영상·음성은 브라우저끼리
**P2P(WebRTC)** 로 직접 흐릅니다. 순수 정적 파일이라 GitHub Pages 로 그대로 배포됩니다.

## 접속 주소

**https://vlralf77-svg.github.io/rep/**

아무 기기(PC/폰)의 브라우저에서 열고 → 이름·방 코드 입력 → 같은 방 코드끼리 통화.

## 방(room) 동작 방식

- 방 코드에서 결정적인 "호스트 ID"(`wvcall-<코드>`)를 만든다.
- 처음 들어온 사람이 그 ID를 선점해 **호스트**가 되어 참가자 명단을 관리한다.
- 이미 호스트가 있으면 **게스트**로 접속하고, 호스트에게서 기존 참가자 명단을 받아
  각자에게 미디어 콜을 건다 → 모두가 서로 연결되는 **풀메시**.

> ⚠️ PeerJS 공개 클라우드의 ID는 전 세계 공용입니다. 방 코드는 겹치지 않게 특이하게
> 지어주세요(🎲 버튼). 더 안정적으로 쓰려면 자체 PeerServer 를 운영하고
> `?peerhost=…&peerport=…&peersecure=1` 파라미터로 지정할 수 있습니다.

## 로컬 테스트

```bash
# PeerServer(로컬) + 정적 서버를 띄운 뒤,
#   http://localhost:8080/?peerhost=localhost&peerport=9000&peersecure=0
# 로 접속하면 공개 클라우드 대신 로컬 시그널링으로 테스트할 수 있습니다.
```

## 구성

- `index.html` / `style.css` — UI (로비 + 통화 화면)
- `app-peer.js` — PeerJS 기반 방·풀메시 로직, 미디어 컨트롤
- `vendor/peerjs.min.js` — PeerJS 라이브러리 (벤더링, 외부 CDN 불필요)
