"use strict";

// ============================================================
// Push 수신
// ============================================================

self.addEventListener("push", function (event) {
  console.log("[Push SW] push 이벤트 수신");

  event.waitUntil(
    (async function () {
      var payload = {};

      try {
        if (event.data) {
          var text = event.data.text();

          console.log("[Push SW] Push 원문:", text);

          if (text) {
            payload = JSON.parse(text);
          }
        }
      } catch (error) {
        console.error("[Push SW] Push 데이터 파싱 실패:", error);
      }

      // --------------------------------------------------------
      // Declarative Web Push 형식
      // --------------------------------------------------------

      var notification =
        payload && payload.notification ? payload.notification : null;

      var title =
        notification && notification.title
          ? String(notification.title)
          : String(payload.title || "창의배움터");

      var body =
        notification && notification.body
          ? String(notification.body)
          : String(payload.body || "새로운 알림이 있습니다.");

      var targetUrl =
        notification && notification.navigate
          ? String(notification.navigate)
          : String(
              payload.url ||
                "https://bnkedu.github.io/instructorPortal/admin.html",
            );

      console.log("[Push SW] 알림 표시 시작:", {
        title: title,
        body: body,
        url: targetUrl,
      });

      await self.registration.showNotification(title, {
        body: body,

        tag: "bnkedu-end-report",

        renotify: true,

        data: {
          url: targetUrl,
        },
      });

      console.log("[Push SW] showNotification 성공");
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
      ? event.notification.data.url
      : "https://bnkedu.github.io/instructorPortal/admin.html";

  event.waitUntil(
    (async function () {
      var windowClients = await clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });

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
