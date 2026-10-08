// ============================================================
// B&K 창의배움터 Web Push
// 운영진 인증 버튼의 사용자 제스처에서 구독 등록
// iPhone / iPadOS Home Screen Web App 대응
// ============================================================

(function () {
  "use strict";

  const API_URL = "https://instructor-api.seol7518.workers.dev/";

  const PUSH_SW_PATH = "./push-sw.js";

  const VAPID_PUBLIC_KEY =
    "BJShc6OsyoOWt3ijM3E_UoWA9wXwqWmJlh4To582sFxYXqAIjUHH1QiHbnK21EWpveAf4ymhqcLd94VlZdYePoI";

  // ------------------------------------------------------------
  // 중복 실행 방지
  // ------------------------------------------------------------

  let setupPromise = null;

  // ------------------------------------------------------------
  // Service Worker 등록 Promise
  //
  // 페이지가 열릴 때 미리 Service Worker를 등록해 둔다.
  // 실제 Push Subscription은 운영진 확인 버튼에서 생성한다.
  // ------------------------------------------------------------

  let serviceWorkerRegistrationPromise = null;

  // ============================================================
  // Base64URL → Uint8Array
  // ============================================================

  function urlBase64ToUint8Array(base64String) {
    const padding = "=".repeat((4 - (base64String.length % 4)) % 4);

    const base64 = (base64String + padding)
      .replace(/-/g, "+")
      .replace(/_/g, "/");

    const rawData = window.atob(base64);

    const outputArray = new Uint8Array(rawData.length);

    for (let i = 0; i < rawData.length; i++) {
      outputArray[i] = rawData.charCodeAt(i);
    }

    return outputArray;
  }

  // ============================================================
  // Service Worker 활성화 대기
  // ============================================================

  async function waitForServiceWorkerActive(registration) {
    if (registration.active) {
      return registration;
    }

    return new Promise((resolve, reject) => {
      const worker = registration.installing || registration.waiting;

      if (!worker) {
        reject(new Error("Service Worker 상태를 확인할 수 없습니다."));

        return;
      }

      const timeout = setTimeout(() => {
        reject(new Error("Service Worker 활성화 시간이 초과되었습니다."));
      }, 15000);

      worker.addEventListener("statechange", () => {
        if (worker.state === "activated") {
          clearTimeout(timeout);

          resolve(registration);
        }

        if (worker.state === "redundant") {
          clearTimeout(timeout);

          reject(new Error("Service Worker가 비정상 종료되었습니다."));
        }
      });
    });
  }

  // ============================================================
  // Service Worker 준비
  //
  // 중요:
  // window.PushManager를 검사하지 않는다.
  //
  // 기존 Web Push는
  // ServiceWorkerRegistration.pushManager
  // 를 사용한다.
  // ============================================================

  async function prepareServiceWorker() {
    if (!("serviceWorker" in navigator)) {
      console.log("[Web Push] Service Worker 미지원");

      return null;
    }

    if (!serviceWorkerRegistrationPromise) {
      serviceWorkerRegistrationPromise = (async function () {
        try {
          const registration = await navigator.serviceWorker.register(
            PUSH_SW_PATH,
            {
              scope: "./",
            },
          );

          console.log(
            "[Web Push] Service Worker 등록 완료:",
            registration.scope,
          );

          await waitForServiceWorkerActive(registration);

          console.log("[Web Push] Service Worker 활성화 완료");

          // 전역 보관
          window.__BNK_PUSH_REGISTRATION__ = registration;

          return registration;
        } catch (error) {
          console.error("[Web Push] Service Worker 등록 실패:", error);

          serviceWorkerRegistrationPromise = null;

          throw error;
        }
      })();
    }

    return await serviceWorkerRegistrationPromise;
  }

  // ============================================================
  // Worker에 PushSubscription 저장
  // ============================================================

  async function saveSubscription(subscription) {
    const data = subscription.toJSON();

    console.log("[Web Push] Worker 구독 등록 요청");

    const response = await fetch(API_URL, {
      method: "POST",

      headers: {
        "Content-Type": "text/plain;charset=UTF-8",
      },

      body: JSON.stringify({
        action: "registerPushSubscription",

        subscription: data,
      }),
    });

    let result = null;

    try {
      result = await response.json();
    } catch (error) {
      console.error("[Web Push] Worker 응답 JSON 파싱 실패:", error);
    }

    console.log("[Web Push] Worker 구독 등록 응답:", result);

    if (!response.ok || !result || !result.success) {
      throw new Error(
        result?.message ||
          `웹 푸시 구독 저장에 실패했습니다. (HTTP ${response.status})`,
      );
    }

    return result;
  }

  // ============================================================
  // 기존 Subscription 서버 + 브라우저 삭제
  //
  // 사용자가 직접 구독 해제를 요청하는 경우에만 사용한다.
  // setupWebPush()에서는 기존 Subscription을 강제로 해제하지 않는다.
  // ============================================================

  async function removeSubscription(subscription) {
    if (!subscription) {
      return;
    }

    const subscriptionData = subscription.toJSON();

    // ----------------------------------------------------------
    // 1. Worker KV에서 삭제
    // ----------------------------------------------------------

    try {
      const response = await fetch(API_URL, {
        method: "POST",

        headers: {
          "Content-Type": "text/plain;charset=UTF-8",
        },

        body: JSON.stringify({
          action: "removePushSubscription",

          subscription: subscriptionData,
        }),
      });

      let result = null;

      try {
        result = await response.json();
      } catch (error) {
        result = null;
      }

      console.log("[Web Push] 기존 Subscription 서버 삭제 응답:", result);
    } catch (error) {
      console.warn("[Web Push] 기존 Subscription 서버 삭제 실패:", error);
    }

    // ----------------------------------------------------------
    // 2. 브라우저 Subscription 해제
    // ----------------------------------------------------------

    try {
      const unsubscribed = await subscription.unsubscribe();

      console.log("[Web Push] 기존 Subscription 브라우저 해제:", unsubscribed);
    } catch (error) {
      console.warn("[Web Push] 기존 Subscription 브라우저 해제 실패:", error);
    }
  }

  // ============================================================
  // 구버전 /js/push-sw.js 등록 정리
  //
  // 예전 코드에서 생성된 JS 폴더의 SW만 제거한다.
  // 현재 정상 사용 중인 루트 push-sw.js Subscription은 건드리지 않는다.
  // ============================================================

  async function cleanupLegacyServiceWorkers() {
    try {
      const registrations = await navigator.serviceWorker.getRegistrations();

      console.log("[Web Push] 기존 Service Worker 수:", registrations.length);

      for (const reg of registrations) {
        const scriptURL =
          (reg.active || reg.waiting || reg.installing)?.scriptURL || "";

        console.log("[Web Push] 기존 SW:", scriptURL);

        if (scriptURL.includes("/js/push-sw.js")) {
          console.log("[Web Push] 구버전 /js/push-sw.js 등록 제거");

          try {
            const oldSubscription = await reg.pushManager.getSubscription();

            if (oldSubscription) {
              console.log("[Web Push] 구버전 Subscription 서버 삭제");

              try {
                await removeSubscription(oldSubscription);
              } catch (error) {
                console.warn(
                  "[Web Push] 구버전 Subscription 삭제 실패:",
                  error,
                );
              }
            }
          } catch (error) {
            console.warn("[Web Push] 구버전 Subscription 확인 실패:", error);
          }

          try {
            await reg.unregister();

            console.log("[Web Push] 구버전 Service Worker unregister 완료");
          } catch (error) {
            console.warn(
              "[Web Push] 구버전 Service Worker unregister 실패:",
              error,
            );
          }
        }
      }
    } catch (error) {
      console.warn("[Web Push] 구버전 Service Worker 정리 실패:", error);
    }
  }

  // ============================================================
  // Web Push 설정
  //
  // 중요:
  // 이 함수는 운영진 확인 버튼 클릭에서 호출된다.
  //
  // 기존 Subscription이 있으면 그대로 사용한다.
  // Subscription이 없을 때만 새로 생성한다.
  // ============================================================

  async function setupWebPush() {
    // ----------------------------------------------------------
    // 중복 실행 방지
    // ----------------------------------------------------------

    if (setupPromise) {
      return setupPromise;
    }

    setupPromise = (async function () {
      try {
        console.log("[Web Push] 설정 시작");

        // ------------------------------------------------------
        // 기본 지원 여부
        // ------------------------------------------------------

        if (!("serviceWorker" in navigator)) {
          console.log("[Web Push] Service Worker 미지원");

          return {
            success: false,
            error: "Service Worker를 지원하지 않는 브라우저입니다.",
          };
        }

        if (!("Notification" in window)) {
          console.log("[Web Push] Notification API 미지원");

          return {
            success: false,
            error: "알림 기능을 지원하지 않는 브라우저입니다.",
          };
        }

        console.log(
          "[Web Push] 현재 Notification 권한:",
          Notification.permission,
        );

        // ------------------------------------------------------
        // 알림 권한
        //
        // granted이면 다시 권한 요청하지 않는다.
        // ------------------------------------------------------

        let permission = Notification.permission;

        if (permission !== "granted") {
          permission = await Notification.requestPermission();
        }

        console.log("[Web Push] 최종 Notification 권한:", permission);

        if (permission !== "granted") {
          console.warn("[Web Push] 알림 권한이 허용되지 않았습니다.");

          window.__BNK_PUSH_READY__ = false;

          return {
            success: false,
            error: "알림 권한이 허용되지 않았습니다.",
          };
        }

        // ------------------------------------------------------
        // 구버전 Service Worker 정리
        //
        // 현재 루트 push-sw.js는 건드리지 않는다.
        // ------------------------------------------------------

        await cleanupLegacyServiceWorkers();

        // ------------------------------------------------------
        // 현재 Service Worker 준비
        // ------------------------------------------------------

        const registration = await prepareServiceWorker();

        if (!registration) {
          throw new Error("Service Worker를 준비하지 못했습니다.");
        }

        if (!registration.active) {
          throw new Error("활성화된 Service Worker가 없습니다.");
        }

        console.log(
          "[Web Push] 활성 Service Worker 확인:",
          registration.active.scriptURL,
        );

        // ======================================================
        // PushManager
        // ======================================================

        const pushManager = registration.pushManager;

        if (!pushManager) {
          throw new Error(
            "ServiceWorkerRegistration.pushManager를 사용할 수 없습니다.",
          );
        }

        console.log("[Web Push] pushManager 확인 완료");

        // ======================================================
        // 기존 Subscription 재사용
        //
        // 중요:
        // 기존 Subscription을 여기서 unsubscribe 하지 않는다.
        // ======================================================

        let subscription = await pushManager.getSubscription();

        console.log(
          "[Web Push] 현재 Subscription:",
          subscription ? subscription.endpoint : "없음",
        );

        // ======================================================
        // Subscription이 없을 때만 새로 생성
        // ======================================================

        if (!subscription) {
          console.log("[Web Push] 새 Subscription 생성 시작");

          subscription = await pushManager.subscribe({
            userVisibleOnly: true,

            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
          });

          console.log(
            "[Web Push] 새 Subscription 생성 완료:",
            subscription.endpoint,
          );
        } else {
          console.log("[Web Push] 기존 Subscription 재사용");
        }

        // ======================================================
        // Worker KV 등록
        //
        // 기존 Subscription이어도 매번 서버에 다시 저장한다.
        // ======================================================

        const result = await saveSubscription(subscription);

        console.log("[Web Push] 최종 등록 완료");

        window.__BNK_PUSH_SUBSCRIPTION__ = subscription;

        window.__BNK_PUSH_READY__ = true;

        return result;
      } catch (error) {
        console.error("[Web Push] 설정 오류:", error);

        window.__BNK_PUSH_READY__ = false;

        return {
          success: false,
          error: error.message || String(error),
        };
      } finally {
        setupPromise = null;
      }
    })();

    return setupPromise;
  }

  // ============================================================
  // Push 구독 해제
  // ============================================================

  async function removeWebPush() {
    try {
      let registration = window.__BNK_PUSH_REGISTRATION__ || null;

      if (!registration) {
        registration = await prepareServiceWorker();
      }

      if (!registration) {
        return {
          success: true,
        };
      }

      const subscription = await registration.pushManager.getSubscription();

      if (!subscription) {
        return {
          success: true,
        };
      }

      await removeSubscription(subscription);

      window.__BNK_PUSH_SUBSCRIPTION__ = null;

      window.__BNK_PUSH_READY__ = false;

      return {
        success: true,
      };
    } catch (error) {
      console.error("[Web Push] 구독 해제 실패:", error);

      return {
        success: false,
        error: error.message || String(error),
      };
    }
  }

  // ============================================================
  // 페이지가 열리면 Service Worker 먼저 준비
  //
  // 실제 Subscription 생성은 하지 않는다.
  // 권한/구독은 운영진 확인 버튼에서 처리한다.
  // ============================================================

  prepareServiceWorker()
    .then(function (registration) {
      if (registration) {
        console.log("[Web Push] 페이지 로드 시 Service Worker 준비 완료");
      }
    })
    .catch(function (error) {
      console.warn(
        "[Web Push] 페이지 로드 시 Service Worker 준비 실패:",
        error,
      );
    });

  // ============================================================
  // 전역 노출
  // ============================================================

  window.setupWebPush = setupWebPush;

  window.removeWebPush = removeWebPush;
})();
