# WiFi 영상통화 - Android APK

`apps/videocall` 서버에 접속하는 얇은 **WebView 래퍼** 안드로이드 앱입니다.
카메라/마이크 권한과 자체 서명 인증서(HTTPS)를 자동 처리해, 폰에서도 브라우저와
동일하게 영상통화에 참여할 수 있습니다.

## APK 받는 방법

이 저장소는 **GitHub Actions에서 APK를 자동 빌드**합니다
(`.github/workflows/videocall-apk.yml`).

- `apps/videocall-android/` 가 변경되어 push 되면 자동 빌드됩니다.
- 결과물은 두 곳에서 받을 수 있습니다.
  1. **Releases** 탭의 `videocall-apk` 릴리스에 첨부된 `wifi-videocall.apk`
  2. 해당 **Actions 실행 → Artifacts** 의 `wifi-videocall-apk`

## 사용 방법

1. PC에서 시그널링 서버를 실행합니다.
   ```bash
   pnpm --filter @sports/videocall start
   ```
   실행하면 접속 주소(예: `https://192.168.0.10:8443`)가 출력됩니다.
2. 안드로이드 폰에 `wifi-videocall.apk` 를 설치합니다.
   (설정에서 "알 수 없는 출처 앱 설치 허용" 필요)
3. 앱을 열고 위 서버 주소를 입력한 뒤 **접속**을 누릅니다.
   - 자체 서명 인증서는 앱이 자동으로 허용합니다.
   - 카메라/마이크 권한을 허용합니다.
4. 이름과 방 코드를 입력하면 통화가 시작됩니다.
   (상대는 같은 서버 주소를 브라우저 또는 이 앱으로 열면 됩니다.)

## 로컬에서 직접 빌드 (Android SDK 필요)

```bash
cd apps/videocall-android
# ANDROID_HOME 이 설정된 환경에서:
./gradlew assembleDebug
# 결과: app/build/outputs/apk/debug/app-debug.apk
```

## 구성

- `minSdk 26` (Android 8.0+), `targetSdk 34`
- 외부 의존성 없음 (안드로이드 프레임워크 API 만 사용)
- 핵심: `MainActivity.java`
  - `WebChromeClient.onPermissionRequest` → 웹의 카메라/마이크 요청 승인
  - `onReceivedSslError` → 자체 서명 인증서 허용
  - 런타임 `CAMERA` / `RECORD_AUDIO` 권한 요청
