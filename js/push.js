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
		if (setupPromise) {
			return setupPromise;
		}

		setupPromise = (async () => {
			try {
				console.log("========== Web Push 설정 시작 ==========");

				// ----------------------------------------------------
				// 지원 여부
				// ----------------------------------------------------

				if (!("serviceWorker" in navigator)) {
					console.warn("[Web Push] Service Worker 미지원");

					return {
						success: false,
						message: "Service Worker를 지원하지 않는 환경입니다.",
					};
				}

				if (!("PushManager" in window)) {
					console.warn("[Web Push] Push API 미지원");

					return {
						success: false,
						message: "Web Push를 지원하지 않는 환경입니다.",
					};
				}

				if (!("Notification" in window)) {
					console.warn("[Web Push] Notification API 미지원");

					return {
						success: false,
						message: "알림 기능을 지원하지 않는 환경입니다.",
					};
				}

				// ----------------------------------------------------
				// 알림 권한
				// ----------------------------------------------------

				let permission = Notification.permission;

				console.log("[Web Push] 현재 권한:", permission);

				if (permission === "denied") {
					console.warn("[Web Push] 알림 권한이 차단되어 있습니다.");

					return {
						success: false,
						permission: "denied",
					};
				}

				if (permission === "default") {
					permission = await Notification.requestPermission();
				}

				if (permission !== "granted") {
					console.warn("[Web Push] 알림 권한 허용 안 됨:", permission);

					return {
						success: false,
						permission,
					};
				}

				// ----------------------------------------------------
				// Service Worker 등록
				// ----------------------------------------------------

				const registration = await navigator.serviceWorker.register(
					PUSH_SW_PATH,
					{
						scope: "./js/",
					},
				);

				console.log("[Web Push] Service Worker 등록 완료:", registration.scope);

				await waitForServiceWorkerActive(registration);

				// ----------------------------------------------------
				// 기존 구독 확인
				// ----------------------------------------------------

				let subscription = await registration.pushManager.getSubscription();

				// ----------------------------------------------------
				// 없으면 새로 구독
				// ----------------------------------------------------

				if (!subscription) {
					console.log("[Web Push] 새 PushSubscription 생성");

					const applicationServerKey = urlBase64ToUint8Array(VAPID_PUBLIC_KEY);

					subscription = await registration.pushManager.subscribe({
						userVisibleOnly: true,
						applicationServerKey,
					});

					console.log("[Web Push] 새 구독 생성 완료");
				} else {
					console.log("[Web Push] 기존 구독 사용");
				}

				// ----------------------------------------------------
				// Worker에 저장
				//
				// 기존 구독이어도 항상 다시 저장해서
				// KV가 비어 있어도 자동 복구
				// ----------------------------------------------------

				await saveSubscription(subscription);

				window.__BNK_PUSH_SUBSCRIPTION__ = subscription;

				window.__BNK_PUSH_READY__ = true;

				console.log("========== Web Push 설정 완료 ==========");

				return {
					success: true,
					subscription,
				};
			} catch (error) {
				console.error("========== Web Push 설정 오류 ==========", error);

				window.__BNK_PUSH_READY__ = false;

				return {
					success: false,
					error: error.message || String(error),
				};
			}
		})();

		return setupPromise;
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
