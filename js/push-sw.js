/* ==========================================================
   창의배움터 Web Push Service Worker
   파일 위치:
   /js/push-sw.js
   ========================================================== */

"use strict";

// ==========================================================
// 푸시 수신
// ==========================================================

self.addEventListener("push", function (event) {
	let data = {};

	try {
		if (event.data) {
			data = event.data.json();
		}
	} catch (error) {
		console.warn("[WebPush SW] JSON 파싱 실패:", error);

		data = {
			title: "창의배움터",
			body: event.data ? event.data.text() : "새로운 알림이 있습니다.",
		};
	}

	const title = data.title || "창의배움터";

	const body = data.body || "새로운 알림이 있습니다.";

	const options = {
		body: body,

		icon: data.icon || "../icon-192.png",

		badge: data.badge || "../icon-192.png",

		tag: data.tag || "bnkedu-report",

		data: {
			url: data.url || "../admin.html",
		},
	};

	event.waitUntil(self.registration.showNotification(title, options));
});

// ==========================================================
// 알림 클릭
// ==========================================================

self.addEventListener("notificationclick", function (event) {
	event.notification.close();

	const notificationData = event.notification.data || {};

	const targetUrl = notificationData.url || "../admin.html";

	event.waitUntil(
		self.clients
			.matchAll({
				type: "window",
				includeUncontrolled: true,
			})

			.then(function (clientList) {
				// ----------------------------------------------------
				// 이미 열려 있는 포털이 있으면 해당 화면으로 이동
				// ----------------------------------------------------

				for (const client of clientList) {
					if (client.url && "focus" in client) {
						return client.navigate(targetUrl).then(function () {
							return client.focus();
						});
					}
				}

				// ----------------------------------------------------
				// 열려 있는 창이 없으면 새 창
				// ----------------------------------------------------

				if (self.clients.openWindow) {
					return self.clients.openWindow(targetUrl);
				}

				return undefined;
			}),
	);
});
