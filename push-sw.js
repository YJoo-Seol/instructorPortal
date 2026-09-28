"use strict";

// ============================================================
// B&K 창의배움터 Web Push Service Worker
// ============================================================

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
        badge: "/instructorPortal/push-badge.png",
        data: {
          url: targetUrl || defaultUrl,
        },
      };

      // --------------------------------------------------------
      // icon / badge
      //
      // 현재는 아이폰 표시 안정성 확인이 우선이므로
      // 명시적으로 지정하지 않음
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
