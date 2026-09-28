// ============================================================
// B&K 창의배움터 Web Push
// 운영진 인증 성공 후 자동으로 기기 구독 등록
// ============================================================

(function () {
  "use strict";

  const API_URL = "https://instructor-api.seol7518.workers.dev/";

  const PUSH_SW_PATH = "./js/push-sw.js";

  const VAPID_PUBLIC_KEY =
    "BJShc6OsyoOWt3ijM3E_UoWA9wXwqWmJlh4To582sFxYXqAIjUHH1QiHbnK21EWpveAf4ymhqcLd94VlZdYePoI";

  let setupPromise = null;

  // ==========================================================
  // Base64URL → Uint8Array
  // ==========================================================

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

  // ==========================================================
  // Service Worker 활성화 대기
  // ==========================================================

  function waitForServiceWorkerActive(registration) {
    if (registration.active) {
      return Promise.resolve(registration);
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

  // ==========================================================
  // Worker에 PushSubscription 저장
  // ==========================================================

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

  // ==========================================================
  // Web Push 설정
  // ==========================================================

  async function setupWebPush() {
    try {
      if (!("serviceWorker" in navigator)) {
        console.log("[Web Push] Service Worker 미지원");
        return;
      }

      if (!("PushManager" in window)) {
        console.log("[Web Push] Push API 미지원");
        return;
      }

      const permission = await Notification.requestPermission();

      if (permission !== "granted") {
        console.log("[Web Push] 알림 권한 없음:", permission);
        return;
      }

      const registration = await navigator.serviceWorker.register(PUSH_SW_PATH);
      console.log("[Web Push] Service Worker 등록 완료");

      const pushManager = registration.pushManager;

      // ============================================================
      // 기존 Subscription 확인
      // ============================================================

      let existingSubscription = await pushManager.getSubscription();

      console.log(
        "[Web Push] 기존 Subscription:",
        existingSubscription ? existingSubscription.endpoint : "없음",
      );

      // ============================================================
      // VAPID 키 변경에 따른 기존 Subscription 1회 초기화
      // ============================================================

      const MIGRATION_KEY = "webPushVapidMigration_v2";
      const migrated = localStorage.getItem(MIGRATION_KEY);

      if (!migrated && existingSubscription) {
        console.log("[Web Push] 기존 Subscription 초기화 시작");

        // ----------------------------------------------------------
        // 1. 기존 Subscription을 서버 KV에서 먼저 삭제
        // ----------------------------------------------------------
        try {
          await removeWebPush(existingSubscription);
          console.log("[Web Push] 기존 Subscription KV 삭제 완료");
        } catch (removeError) {
          console.warn(
            "[Web Push] 기존 Subscription KV 삭제 실패:",
            removeError,
          );
        }

        // ----------------------------------------------------------
        // 2. 브라우저 기존 Subscription 해제
        // ----------------------------------------------------------
        try {
          const unsubscribed = await existingSubscription.unsubscribe();

          console.log("[Web Push] 기존 Subscription 해제:", unsubscribed);
        } catch (unsubscribeError) {
          console.warn(
            "[Web Push] 기존 Subscription 해제 실패:",
            unsubscribeError,
          );
        }

        existingSubscription = null;

        localStorage.setItem(MIGRATION_KEY, "true");

        console.log("[Web Push] 기존 VAPID Subscription 초기화 완료");
      }

      // ============================================================
      // 새 Subscription 확인 / 생성
      // ============================================================

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

      // ============================================================
      // Worker에 Subscription 등록
      // ============================================================

      const response = await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          action: "registerPushSubscription",
          subscription: subscription,
        }),
      });

      const result = await response.json();

      console.log("[Web Push] Worker 등록 응답:", result);

      if (!result || !result.success) {
        console.error("[Web Push] Subscription 등록 실패:", result);
        return;
      }

      console.log("[Web Push] 최종 등록 완료");
    } catch (error) {
      console.error("[Web Push] 설정 오류:", error);
    }
  }

  // ==========================================================
  // Push 구독 해제
  // ==========================================================

  async function removeWebPush() {
    try {
      const registration =
        await navigator.serviceWorker.getRegistration("./js/");

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

      const subscriptionData = subscription.toJSON();

      await fetch(API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=UTF-8",
        },
        body: JSON.stringify({
          action: "removePushSubscription",
          subscription: subscriptionData,
        }),
      });

      await subscription.unsubscribe();

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

  // ==========================================================
  // 전역 노출
  // ==========================================================

  window.setupWebPush = setupWebPush;

  window.removeWebPush = removeWebPush;
})();
