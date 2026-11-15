/**
 * 인앱 결제 자리. 웹 버전에는 결제가 없고, 앱(Capacitor)으로 포장할 때 스토어 결제 플러그인을 여기에 붙인다.
 * 게임은 완전히 오프라인으로 돌아가고, 결제·광고·랭킹만 네트워크를 쓴다.
 *   purchase(productId) → Promise<{ ok, reason? }>
 *     웹: { ok:false, reason:'web' }  /  개발 모드: { ok:true } (테스트용으로 바로 지급)
 */
export function purchase(productId) {
  if (import.meta.env.DEV) return Promise.resolve({ ok: true, productId, test: true });
  return Promise.resolve({ ok: false, reason: 'web', productId });
}

/** 구매 복원 (앱 단계) */
export function restorePurchases() {
  return Promise.resolve({ ok: false, reason: 'web' });
}
