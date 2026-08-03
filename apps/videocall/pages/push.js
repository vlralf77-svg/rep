'use strict';

/**
 * 웹푸시 클라이언트 헬퍼.
 *  - 서비스워커를 등록하고, 이 페이지가 "푸시 백엔드"에서 서빙될 때만 푸시를 구독한다.
 *  - GitHub Pages(백엔드 없음)에서는 조용히 비활성화되어, 온라인일 때의 통화는 그대로 동작한다.
 *
 * 전역 함수:
 *  - window.pushInit(userId)  : SW 등록 + 구독 + 백엔드에 등록
 *  - window.pushCall(from,to) : 상대에게 전화 알림(푸시) 발송 요청
 *  - window.pushAvailable()   : 백엔드 푸시 사용 가능 여부
 */

let swReg = null;
let pushOn = false;

function urlB64ToUint8Array(base64) {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const arr = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) arr[i] = raw.charCodeAt(i);
  return arr;
}

async function registerSW() {
  if (!('serviceWorker' in navigator)) return null;
  try {
    swReg = await navigator.serviceWorker.register('sw.js');
    return swReg;
  } catch (e) {
    console.warn('SW 등록 실패', e);
    return null;
  }
}

window.pushInit = async function (userId) {
  const reg = await registerSW();
  if (!reg) return false;
  if (!('PushManager' in window)) return false;

  // 백엔드가 있는지 확인 (없으면 조용히 비활성화)
  let key;
  try {
    const r = await fetch('vapidPublicKey', { cache: 'no-store' });
    if (!r.ok) throw new Error('no backend');
    key = (await r.json()).key;
  } catch (e) {
    console.log('푸시 백엔드 없음 → 푸시 비활성화(온라인 통화만 동작)');
    return false;
  }

  try {
    const perm = await Notification.requestPermission();
    if (perm !== 'granted') return false;

    let sub = await reg.pushManager.getSubscription();
    if (!sub) {
      sub = await reg.pushManager.subscribe({
        userVisibleOnly: true,
        applicationServerKey: urlB64ToUint8Array(key),
      });
    }
    await fetch('subscribe', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ userId: userId, subscription: sub }),
    });
    pushOn = true;
    return true;
  } catch (e) {
    console.warn('푸시 구독 실패', e);
    return false;
  }
};

window.pushCall = async function (from, to) {
  if (!pushOn) return { ok: false, skipped: true };
  try {
    const r = await fetch('call', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ from: from, to: to }),
    });
    return await r.json();
  } catch (e) {
    return { ok: false, error: String(e) };
  }
};

window.pushAvailable = function () { return pushOn; };
