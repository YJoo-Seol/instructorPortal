// ============================================================
// B&K 창의배움터 Web Push
// 운영진 인증 버튼의 사용자 제스처에서 구독 등록
// ============================================================

(function () {
  "use strict";

  const API_URL = "https://instructor-api.seol7518.workers.dev/";

  const PUSH_SW_PATH = "./js/push-sw.js";

  const VAPID_PUBLIC_KEY =
    "BJShc6OsyoOWt3ijM3E_UoWA9wXqWmJlh4To582sFxYXqAIjUHH1QiHbnK21EWpveAf4ymhqcLd94VlZdYePoI";

  // VAPID 키 변경 후 새 구독을 강제하는 버전
  const MIGRATION_KEY = "webPushVapidMigration_v3";

  let setupPromise = null;

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

    for (let i = 0; i < rawData.length; ++i) {
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
  // Worker에 PushSubscription 저장
  // ============================================================

  async function saveSubscription(subscription) {
    const data = subscription.toJSON();

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

    if (!response.ok || !result.success) {
      throw new Error(result.message || "웹 푸시 구독 저장에 실패했습니다.");
    }

    return result;
  }

  // ============================================================
  // 기존 PushSubscription 삭제
  // ============================================================

  async function removeSubscription(subscription) {
    if (!subscription) {
      return;
    }

    const subscriptionData = subscription.toJSON();

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

      const result = await response.json();

      console.log("[Web Push] 기존 Subscription 서버 삭제 응답:", result);
    } catch (error) {
      console.warn("[Web Push] 기존 Subscription 서버 삭제 실패:", error);
    }

    try {
      const unsubscribed = await subscription.unsubscribe();

      console.log("[Web Push] 기존 Subscription 브라우저 해제:", unsubscribed);
    } catch (error) {
      console.warn("[Web Push] 기존 Subscription 브라우저 해제 실패:", error);
    }
  }

  // ============================================================
  // Web Push 설정
  // ============================================================

  async function setupWebPush() {
    // 중복 실행 방지
    if (setupPromise) {
      return setupPromise;
    }

    setupPromise = (async function () {
      try {
        console.log("[Web Push] 설정 시작");

        // --------------------------------------------------------
        // 지원 여부
        // --------------------------------------------------------

        if (!("serviceWorker" in navigator)) {
          console.log("[Web Push] Service Worker 미지원");
          return;
        }

        if (!("PushManager" in window)) {
          console.log("[Web Push] Push API 미지원");
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

        // --------------------------------------------------------
        // 권한 요청
        // 중요: 이 함수 자체가 사용자 버튼 클릭에서 직접 호출되어야 함
        // --------------------------------------------------------

        let permission = Notification.permission;

        if (permission !== "granted") {
          permission = await Notification.requestPermission();
        }

        console.log("[Web Push] 최종 Notification 권한:", permission);

        if (permission !== "granted") {
          console.warn("[Web Push] 알림 권한이 허용되지 않았습니다.");
          return;
        }

        // --------------------------------------------------------
        // Service Worker 등록
        // --------------------------------------------------------

        const registration =
          await navigator.serviceWorker.register(PUSH_SW_PATH);

        console.log("[Web Push] Service Worker 등록 완료");

        await waitForServiceWorkerActive(registration);

        console.log("[Web Push] Service Worker 활성화 완료");

        const pushManager = registration.pushManager;

        // --------------------------------------------------------
        // 기존 Subscription 확인
        // --------------------------------------------------------

        let existingSubscription = await pushManager.getSubscription();

        console.log(
          "[Web Push] 기존 Subscription:",
          existingSubscription ? existingSubscription.endpoint : "없음",
        );

        // --------------------------------------------------------
        // VAPID 변경에 따른 기존 구독 1회 초기화
        // --------------------------------------------------------

        const migrated = localStorage.getItem(MIGRATION_KEY);

        if (!migrated && existingSubscription) {
          console.log("[Web Push] 기존 Subscription 초기화 시작");

          await removeSubscription(existingSubscription);

          existingSubscription = null;

          localStorage.setItem(MIGRATION_KEY, "true");

          console.log("[Web Push] 기존 VAPID Subscription 초기화 완료");
        }

        // --------------------------------------------------------
        // 새 Subscription 생성
        // --------------------------------------------------------

        let subscription = existingSubscription;

        if (!subscription) {
          console.log("[Web Push] 새 Subscription 생성");

          subscription = await pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
          });

          console.log(
            "[Web Push] 새 Subscription 생성 완료:",
            subscription.endpoint,
          );
        }

        // --------------------------------------------------------
        // Worker에 저장
        // --------------------------------------------------------

        const result = await saveSubscription(subscription);

        console.log("[Web Push] Worker 등록 응답:", result);

        console.log("[Web Push] 최종 등록 완료");

        window.__BNK_PUSH_SUBSCRIPTION__ = subscription;

        window.__BNK_PUSH_READY__ = true;

        return result;
      } catch (error) {
        console.error("[Web Push] 설정 오류:", error);

        throw error;
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
      const registration = await navigator.serviceWorker.getRegistration();

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
  // 전역 노출
  // ============================================================

  window.setupWebPush = setupWebPush;

  window.removeWebPush = removeWebPush;
})();
