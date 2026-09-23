// ============================================================
// B&K 창의배움터 Web Push Service Worker
// ============================================================

"use strict";

// ============================================================
// Push 수신
// ============================================================

self.addEventListener("push", function (event) {
	console.log("[Push SW] push 이벤트 수신");

	let data = {
		title: "창의배움터",
		body: "새로운 알림이 있습니다.",
		url: "../admin.html",
	};

	try {
		if (event.data) {
			const json = event.data.json();

			data = {
				...data,
				...json,
			};
		}
	} catch (error) {
		console.error("[Push SW] Push 데이터 파싱 실패:", error);

		try {
			if (event.data) {
				data.body = event.data.text();
			}
		} catch (textError) {
			console.error("[Push SW] Push text 파싱 실패:", textError);
		}
	}

	// ----------------------------------------------------------
	// 아이콘
	//
	// push-sw.js 위치:
	// /instructorCheck/js/push-sw.js
	//
	// icon:
	// /instructorCheck/icon-192.png
	// ----------------------------------------------------------

	const iconUrl = new URL(
		"../icon-192.png",
		self.registration.scope,
	).toString();

	const adminUrl = new URL("../admin.html", self.registration.scope).toString();

	const targetUrl = data.url || adminUrl;

	const options = {
		body: data.body || "새로운 알림이 있습니다.",

		icon: data.icon || iconUrl,

		badge: data.badge || iconUrl,

		tag: data.tag || "bnkedu-push",

		renotify: true,

		data: {
			url: targetUrl,
		},
	};

	event.waitUntil(
		self.registration.showNotification(data.title || "창의배움터", options),
	);
});

// ============================================================
// 알림 클릭
// ============================================================

self.addEventListener("notificationclick", function (event) {
	console.log("[Push SW] 알림 클릭");

	event.notification.close();

	const targetUrl =
		event.notification?.data?.url ||
		new URL("../admin.html", self.registration.scope).toString();

	event.waitUntil(
		(async () => {
			const windowClients = await clients.matchAll({
				type: "window",
				includeUncontrolled: true,
			});

			// ------------------------------------------------------
			// 이미 포털 창이 열려 있으면 그 창으로 이동
			// ------------------------------------------------------

			for (const client of windowClients) {
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
