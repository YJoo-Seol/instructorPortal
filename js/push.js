/* ==========================================================
   창의배움터 Web Push
   ----------------------------------------------------------
   역할
   1. Service Worker 등록
   2. 알림 권한 요청
   3. 기존 PushSubscription 확인
   4. 실제 구독 생성/서버 저장은
      Cloudflare Worker VAPID 설정 후 연결
   ========================================================== */

(function () {
	"use strict";

	const PUSH_SW_PATH = "./js/push-sw.js";

	// ==========================================================
	// Web Push 초기화
	// ==========================================================

	async function setupWebPush() {
		try {
			console.log("[WebPush] 초기화 시작");

			// ------------------------------------------------------
			// 1. Service Worker 지원 확인
			// ------------------------------------------------------

			if (!("serviceWorker" in navigator)) {
				console.warn("[WebPush] Service Worker 미지원");

				return {
					success: false,
					message: "이 브라우저는 Service Worker를 지원하지 않습니다.",
				};
			}

			// ------------------------------------------------------
			// 2. Push API 지원 확인
			// ------------------------------------------------------

			if (!("PushManager" in window)) {
				console.warn("[WebPush] Push API 미지원");

				return {
					success: false,
					message: "이 브라우저는 Push API를 지원하지 않습니다.",
				};
			}

			// ------------------------------------------------------
			// 3. Notification API 지원 확인
			// ------------------------------------------------------

			if (!("Notification" in window)) {
				console.warn("[WebPush] Notification API 미지원");

				return {
					success: false,
					message: "이 브라우저는 알림 기능을 지원하지 않습니다.",
				};
			}

			// ------------------------------------------------------
			// 4. 현재 권한 상태
			// ------------------------------------------------------

			let permission = Notification.permission;

			console.log("[WebPush] 현재 알림 권한:", permission);

			// ------------------------------------------------------
			// 5. 사용자가 이전에 차단한 경우
			// ------------------------------------------------------

			if (permission === "denied") {
				console.warn("[WebPush] 알림 권한이 차단되어 있습니다.");

				return {
					success: false,
					message:
						"알림 권한이 차단되어 있습니다. 아이폰 설정에서 알림을 허용해주세요.",
				};
			}

			// ------------------------------------------------------
			// 6. 처음이면 권한 요청
			//
			// admin.js의 verifyAdminAccess() 성공 후
			// setupWebPush()가 호출되므로 사용자 클릭 흐름 안에서 실행됨.
			// ------------------------------------------------------

			if (permission === "default") {
				permission = await Notification.requestPermission();

				console.log("[WebPush] 알림 권한 결과:", permission);
			}

			if (permission !== "granted") {
				console.warn("[WebPush] 알림 권한 미허용:", permission);

				return {
					success: false,
					message: "알림 권한이 허용되지 않았습니다.",
				};
			}

			// ------------------------------------------------------
			// 7. Service Worker 등록
			// ------------------------------------------------------

			const registration = await navigator.serviceWorker.register(
				PUSH_SW_PATH,
				{
					scope: "./",
				},
			);

			console.log("[WebPush] Service Worker 등록 완료:", registration.scope);

			// ------------------------------------------------------
			// 8. Service Worker 준비 대기
			// ------------------------------------------------------

			const readyRegistration = await navigator.serviceWorker.ready;

			console.log("[WebPush] Service Worker 준비 완료");

			// ------------------------------------------------------
			// 9. 현재 구독 확인
			// ------------------------------------------------------

			const subscription =
				await readyRegistration.pushManager.getSubscription();

			if (subscription) {
				console.log("[WebPush] 기존 PushSubscription 발견");

				window.__BNK_PUSH_SUBSCRIPTION__ = subscription;

				return {
					success: true,
					alreadySubscribed: true,
					subscription: subscription,
				};
			}

			// ------------------------------------------------------
			// 10. 아직 구독되지 않음
			//
			// 현재는 여기까지.
			//
			// 실제 PushSubscription 생성에는
			// Cloudflare Worker의 VAPID 공개키가 필요하므로
			// Worker 설정 후 subscribe()를 연결한다.
			// ------------------------------------------------------

			console.log("[WebPush] 알림 권한 허용 완료 / 아직 푸시 구독 전");

			return {
				success: true,
				alreadySubscribed: false,
				needSubscribe: true,
			};
		} catch (error) {
			console.error("[WebPush] 초기화 오류:", error);

			return {
				success: false,
				message:
					error && error.message
						? error.message
						: "웹 푸시 초기화 중 오류가 발생했습니다.",
			};
		}
	}

	// ==========================================================
	// 외부 호출
	// ==========================================================

	window.setupWebPush = setupWebPush;
})();
