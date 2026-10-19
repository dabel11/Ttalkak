let loading;

function loadIdentity(browser = globalThis) {
  if (browser.google?.accounts?.id) return Promise.resolve(browser.google.accounts.id);
  if (!loading) loading = new Promise((resolve, reject) => {
    const script = browser.document.createElement("script");
    const finish = (error) => {
      browser.clearTimeout(timer);
      if (error) { script.remove(); loading = undefined; reject(error); }
      else resolve(browser.google.accounts.id);
    };
    const timer = browser.setTimeout(() => finish(new Error("Google 연결 실패. 다시 열어 주세요.")), 10000);
    script.src = "https://accounts.google.com/gsi/client";
    script.async = true;
    script.onload = () => finish(browser.google?.accounts?.id ? null : new Error("Google 연결 실패. 다시 열어 주세요."));
    script.onerror = () => finish(new Error("Google 연결 실패. 다시 열어 주세요."));
    browser.document.head.append(script);
  });
  return loading;
}

export async function mountGoogleIdentity(host, api, authenticate, browser = globalThis) {
  const config = await api.googleConfig();
  if (!config.clientId) throw new Error("Google 로그인을 준비 중입니다.");
  const identity = await loadIdentity(browser);
  if (!host.isConnected) return;
  let pending = false;
  identity.initialize({ client_id: config.clientId, auto_select: false, callback: async ({ credential }) => {
    if (!credential || pending || !host.isConnected) return;
    pending = true;
    try { await authenticate(credential); } finally { pending = false; }
  } });
  host.replaceChildren();
  identity.renderButton(host, { locale: "ko" });
}
