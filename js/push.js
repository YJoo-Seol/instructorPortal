// ============================================================
// B&K 창의배움터 Web Push
// 운영진 인증 버튼의 사용자 제스처에서 구독 등록
// iPhone / iPadOS Home Screen Web App 대응
// ============================================================

(function () {
  "use strict";

  const API_URL = "https://instructor-api.seol7518.workers.dev/";

  const PUSH_SW_PATH = "./js/push-sw.js";

  const VAPID_PUBLIC_KEY =
    "BJShc6OsyoOWt3ijM3E_UoWA9wXwqWmJlh4To582sFxYXqAIjUHH1QiHbnK21EWpveAf4ymhqcLd94VlZdYePoI";

  // ------------------------------------------------------------
  // VAPID 키 변경에 따른 기존 Subscription 1회 초기화
  // ------------------------------------------------------------

  const MIGRATION_KEY = "webPushVapidMigration_v4";

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
          const registration =
            await navigator.serviceWorker.register(PUSH_SW_PATH);

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

    const result = await response.json();

    console.log("[Web Push] Worker 구독 등록 응답:", result);

    if (!response.ok || !result.success) {
      throw new Error(result.message || "웹 푸시 구독 저장에 실패했습니다.");
    }

    return result;
  }

  // ============================================================
  // 기존 Subscription 서버 + 브라우저 삭제
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
      } catch (e) {
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
  // Web Push 설정
  //
  // 중요:
  // 이 함수는 운영진 확인 버튼 클릭에서 호출된다.
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

          return;
        }

        if (!("Notification" in window)) {
          console.log("[Web Push] Notification API 미지원");

          return;
        }

        console.log(
          "[Web Push] 현재 Notification 권한:",
          Notification.permission,
        );

        // ------------------------------------------------------
        // 알림 권한
        //
        // 운영진 확인 버튼 클릭에서 setupWebPush()가 호출됨
        // ------------------------------------------------------

        let permission = Notification.permission;

        if (permission !== "granted") {
          permission = await Notification.requestPermission();
        }

        console.log("[Web Push] 최종 Notification 권한:", permission);

        if (permission !== "granted") {
          console.warn("[Web Push] 알림 권한이 허용되지 않았습니다.");

          return;
        }

        // ------------------------------------------------------
        // Service Worker
        //
        // 페이지 로딩 시 이미 등록을 시작해 두었으므로
        // 여기서는 준비된 registration을 가져온다.
        // ------------------------------------------------------

        const registration = await prepareServiceWorker();

        if (!registration) {
          console.error(
            "[Web Push] Service Worker registration을 얻지 못했습니다.",
          );

          return;
        }

        // ------------------------------------------------------
        // 중요
        //
        // window.PushManager가 아니라
        // ServiceWorkerRegistration.pushManager 사용
        // ------------------------------------------------------

        const pushManager = registration.pushManager;

        if (!pushManager) {
          console.error(
            "[Web Push] ServiceWorkerRegistration.pushManager 미지원",
          );

          return;
        }

        console.log(
          "[Web Push] ServiceWorkerRegistration.pushManager 확인 완료",
        );

        // ------------------------------------------------------
        // 기존 Subscription 확인
        // ------------------------------------------------------

        let existingSubscription = await pushManager.getSubscription();

        console.log(
          "[Web Push] 기존 Subscription:",
          existingSubscription ? existingSubscription.endpoint : "없음",
        );

        // ------------------------------------------------------
        // VAPID 키 변경 후 기존 Subscription 1회 초기화
        // ------------------------------------------------------

        const migrated = localStorage.getItem(MIGRATION_KEY);

        if (!migrated && existingSubscription) {
          console.log("[Web Push] 기존 Subscription 초기화 시작");

          await removeSubscription(existingSubscription);

          existingSubscription = null;

          localStorage.setItem(MIGRATION_KEY, "true");

          console.log("[Web Push] 기존 VAPID Subscription 초기화 완료");
        }

        // ------------------------------------------------------
        // 새 Subscription 생성
        // ------------------------------------------------------

        let subscription = existingSubscription;

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
        }

        // ------------------------------------------------------
        // Worker KV 등록
        // ------------------------------------------------------

        const result = await saveSubscription(subscription);

        console.log("[Web Push] 최종 등록 완료");

        window.__BNK_PUSH_SUBSCRIPTION__ = subscription;

        window.__BNK_PUSH_READY__ = true;

        return result;
      } catch (error) {
        console.error("[Web Push] 설정 오류:", error);

        window.__BNK_PUSH_READY__ = false;

        // 인증 자체를 막지는 않도록
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

      localStorage.removeItem(MIGRATION_KEY);

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
