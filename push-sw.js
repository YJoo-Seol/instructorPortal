"use strict";

// ============================================================
// B&K 창의배움터 Web Push Service Worker
// ============================================================

// ============================================================
// 앱 아이콘 배지 설정
// ============================================================

const BADGE_DB_NAME = "bnkeduPushBadge";
const BADGE_STORE_NAME = "badge";
const BADGE_KEY = "count";

// ============================================================
// 앱 아이콘 배지 DB 열기
// ============================================================

function openBadgeDatabase() {
  return new Promise(function (resolve, reject) {
    const request = indexedDB.open(BADGE_DB_NAME, 1);

    request.onupgradeneeded = function () {
      const db = request.result;

      if (!db.objectStoreNames.contains(BADGE_STORE_NAME)) {
        db.createObjectStore(BADGE_STORE_NAME);
      }
    };

    request.onsuccess = function () {
      resolve(request.result);
    };

    request.onerror = function () {
      reject(request.error);
    };
  });
}

// ============================================================
// 현재 저장된 앱 아이콘 배지 숫자 가져오기
// ============================================================

async function getStoredBadgeCount() {
  const db = await openBadgeDatabase();

  return new Promise(function (resolve, reject) {
    const transaction = db.transaction(BADGE_STORE_NAME, "readonly");

    const store = transaction.objectStore(BADGE_STORE_NAME);
    const request = store.get(BADGE_KEY);

    request.onsuccess = function () {
      const count = Number(request.result);

      resolve(Number.isFinite(count) && count >= 0 ? count : 0);
    };

    request.onerror = function () {
      reject(request.error);
    };

    transaction.oncomplete = function () {
      db.close();
    };

    transaction.onerror = function () {
      db.close();
    };
  });
}

// ============================================================
// 앱 아이콘 배지 숫자 저장
// ============================================================

async function saveBadgeCount(count) {
  const safeCount = Math.max(
    0,
    Number.isFinite(Number(count)) ? Number(count) : 0,
  );

  const db = await openBadgeDatabase();

  return new Promise(function (resolve, reject) {
    const transaction = db.transaction(BADGE_STORE_NAME, "readwrite");

    const store = transaction.objectStore(BADGE_STORE_NAME);

    store.put(safeCount, BADGE_KEY);

    transaction.oncomplete = function () {
      db.close();
      resolve(safeCount);
    };

    transaction.onerror = function () {
      db.close();
      reject(transaction.error);
    };

    transaction.onabort = function () {
      db.close();
      reject(transaction.error);
    };
  });
}

// ============================================================
// 앱 아이콘 배지 설정
// ============================================================

async function setPushAppBadge(count) {
  const safeCount = Math.max(
    0,
    Number.isFinite(Number(count)) ? Number(count) : 0,
  );

  // ----------------------------------------------------------
  // 숫자 저장
  // ----------------------------------------------------------

  await saveBadgeCount(safeCount);

  // ----------------------------------------------------------
  // 현재 환경에서 App Badging API 지원 여부 확인
  // ----------------------------------------------------------

  try {
    if (self.navigator && typeof self.navigator.setAppBadge === "function") {
      if (safeCount > 0) {
        await self.navigator.setAppBadge(safeCount);

        console.log("[Push SW] 앱 아이콘 배지 설정:", safeCount);
      } else if (typeof self.navigator.clearAppBadge === "function") {
        await self.navigator.clearAppBadge();

        console.log("[Push SW] 앱 아이콘 배지 초기화");
      }
    } else {
      console.log(
        "[Push SW] Service Worker에서 App Badge API를 사용할 수 없습니다.",
      );
    }
  } catch (error) {
    console.warn("[Push SW] 앱 아이콘 배지 표시 실패:", error);
  }

  // ----------------------------------------------------------
  // 이미 열려 있는 운영진 페이지에도 전달
  // ----------------------------------------------------------

  try {
    const windowClients = await clients.matchAll({
      type: "window",
      includeUncontrolled: true,
    });

    for (let i = 0; i < windowClients.length; i++) {
      try {
        windowClients[i].postMessage({
          type: "BNK_APP_BADGE_UPDATE",
          count: safeCount,
        });
      } catch (error) {
        console.warn("[Push SW] 운영진 페이지 배지 전달 실패:", error);
      }
    }
  } catch (error) {
    console.warn("[Push SW] 운영진 페이지 확인 실패:", error);
  }

  return safeCount;
}

// ============================================================
// Push 수신 시 앱 아이콘 배지 +1
// ============================================================

async function incrementPushAppBadge() {
  try {
    const currentCount = await getStoredBadgeCount();

    const nextCount = currentCount + 1;

    console.log("[Push SW] 앱 아이콘 배지 증가:", {
      previous: currentCount,
      next: nextCount,
    });

    return await setPushAppBadge(nextCount);
  } catch (error) {
    console.warn("[Push SW] 앱 아이콘 배지 증가 실패:", error);

    return 0;
  }
}

// ============================================================
// 앱 아이콘 배지 초기화
// ============================================================

async function clearPushAppBadge() {
  try {
    await saveBadgeCount(0);

    try {
      if (
        self.navigator &&
        typeof self.navigator.clearAppBadge === "function"
      ) {
        await self.navigator.clearAppBadge();
      }
    } catch (badgeError) {
      console.warn("[Push SW] App Badge API 초기화 실패:", badgeError);
    }

    console.log("[Push SW] 앱 아이콘 배지 전체 초기화 완료");

    return true;
  } catch (error) {
    console.warn("[Push SW] 앱 아이콘 배지 초기화 실패:", error);

    return false;
  }
}

// ============================================================
// Push 수신
// ============================================================

self.addEventListener("push", function (event) {
  console.log("[Push SW] push 이벤트 수신");

  event.waitUntil(
    (async function () {
      // --------------------------------------------------------
      // 기본값
      // --------------------------------------------------------

      var payload = {};

      var defaultTitle = "창의배움터";

      var defaultBody = "새로운 알림이 있습니다.";

      var defaultUrl = "https://bnkedu.github.io/instructorPortal/admin.html";

      // --------------------------------------------------------
      // Push 데이터 읽기
      // --------------------------------------------------------

      try {
        if (event.data) {
          var rawText = event.data.text();

          console.log("[Push SW] Push 원문:", rawText);

          if (rawText) {
            payload = JSON.parse(rawText);
          }
        }
      } catch (error) {
        console.error("[Push SW] Push 데이터 파싱 실패:", error);
      }

      // --------------------------------------------------------
      // 앱 아이콘 배지 +1
      // --------------------------------------------------------

      await incrementPushAppBadge();

      // --------------------------------------------------------
      // Declarative Web Push
      //
      // {
      //   "web_push": 8030,
      //   "notification": {
      //      ...
      //   }
      // }
      // --------------------------------------------------------

      var declarativeNotification =
        payload && payload.notification ? payload.notification : null;

      var title =
        declarativeNotification && declarativeNotification.title
          ? String(declarativeNotification.title).trim()
          : String(payload.title || defaultTitle).trim();

      var body =
        declarativeNotification && declarativeNotification.body
          ? String(declarativeNotification.body).trim()
          : String(payload.body || defaultBody).trim();

      var targetUrl =
        declarativeNotification && declarativeNotification.navigate
          ? String(declarativeNotification.navigate).trim()
          : String(payload.url || defaultUrl).trim();

      // --------------------------------------------------------
      // 알림 옵션
      // --------------------------------------------------------

      var notificationOptions = {
        body: body || defaultBody,

        tag: String(
          payload.tag ||
            (declarativeNotification && declarativeNotification.tag
              ? declarativeNotification.tag
              : "bnkedu-end-report"),
        ),

        renotify: true,

        silent:
          declarativeNotification &&
          typeof declarativeNotification.silent === "boolean"
            ? declarativeNotification.silent
            : false,

        data: {
          url: targetUrl || defaultUrl,
        },
      };

      // --------------------------------------------------------
      // icon / badge
      //
      // 앱 아이콘 배지는 Web App Badging API로 별도 처리.
      // Notification badge 옵션은 사용하지 않음.
      // --------------------------------------------------------

      console.log("[Push SW] 알림 표시 시작:", {
        title: title,

        body: body,

        url: targetUrl,

        declarative: !!declarativeNotification,
      });

      // --------------------------------------------------------
      // 실제 알림 표시
      // --------------------------------------------------------

      try {
        await self.registration.showNotification(
          title || defaultTitle,
          notificationOptions,
        );

        console.log("[Push SW] showNotification 성공");
      } catch (notificationError) {
        console.error("[Push SW] showNotification 실패:", notificationError);

        throw notificationError;
      }
    })(),
  );
});

// ============================================================
// 운영진 페이지에서 보내는 메시지
// ============================================================

self.addEventListener("message", function (event) {
  const data = event.data;

  if (!data || typeof data !== "object") {
    return;
  }

  // ----------------------------------------------------------
  // 앱 아이콘 배지 초기화
  // ----------------------------------------------------------

  if (data.type === "CLEAR_BNK_APP_BADGE") {
    console.log("[Push SW] 운영진 페이지에서 앱 아이콘 배지 초기화 요청");

    event.waitUntil(clearPushAppBadge());
  }
});

// ============================================================
// 알림 클릭
// ============================================================

self.addEventListener("notificationclick", function (event) {
  console.log("[Push SW] 알림 클릭");

  event.notification.close();

  var targetUrl =
    event.notification && event.notification.data && event.notification.data.url
      ? String(event.notification.data.url)
      : "https://bnkedu.github.io/instructorPortal/admin.html";

  event.waitUntil(
    (async function () {
      // ------------------------------------------------------
      // 현재 열려 있는 운영진 페이지 확인
      // ------------------------------------------------------

      var windowClients = await clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

      // ------------------------------------------------------
      // 기존 운영진 페이지가 있으면 해당 창으로 이동
      // ------------------------------------------------------

      for (var i = 0; i < windowClients.length; i++) {
        var client = windowClients[i];

        try {
          await client.navigate(targetUrl);

          await client.focus();

          return;
        } catch (error) {
          console.warn("[Push SW] 기존 창 이동 실패:", error);
        }
      }

      // ------------------------------------------------------
      // 열려 있는 창이 없으면 새 창
      // ------------------------------------------------------

      if (clients.openWindow) {
        await clients.openWindow(targetUrl);
      }
    })(),
  );
});

// ============================================================
// Install
// ============================================================

self.addEventListener("install", function () {
  console.log("[Push SW] install");

  self.skipWaiting();
});

// ============================================================
// Activate
// ============================================================

self.addEventListener("activate", function (event) {
  console.log("[Push SW] activate");

  event.waitUntil(self.clients.claim());
});
