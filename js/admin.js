const API_URL = "https://instructor-api.seol7518.workers.dev/";
// ==========================================================
// 운영진 인증 상태
// ==========================================================

const ADMIN_AUTH_KEY = "adminAuthenticated";
// ==========================================================
// 관리자 주간 전체 일정
// ==========================================================

let allAdminSchedules = [];

// ==========================================================
// 관리자 선택 날짜
// ==========================================================

let selectedAdminDate = new Date();
selectedAdminDate.setHours(0, 0, 0, 0);

// ==========================================================
// 운영진 대시보드 캐시
// ==========================================================

const ADMIN_CACHE_KEY = "adminDashboardCache";

// ==========================================================
// 초기화
// ==========================================================

document.addEventListener("DOMContentLoaded", function () {
	initAdminAuth();
});

// ==========================================================
// 운영진 인증 초기화
// ==========================================================

function initAdminAuth() {
	const authenticated = sessionStorage.getItem(ADMIN_AUTH_KEY);

	if (authenticated === "true") {
		showAdminDashboard();

		return;
	}

	showAdminLogin();
}
// ==========================================================
// 운영진 로그인 화면 표시
// ==========================================================

function showAdminLogin() {
	const loginScreen = document.getElementById("adminVerificationArea");

	const dashboard = document.getElementById("adminDashboardArea");

	if (loginScreen) {
		loginScreen.style.display = "block";
	}

	if (dashboard) {
		dashboard.style.display = "none";
	}
}
// ==========================================================
// 운영진 대시보드 표시
// ==========================================================

function showAdminDashboard() {
	const loginScreen = document.getElementById("adminVerificationArea");

	const dashboard = document.getElementById("adminDashboardArea");

	if (loginScreen) {
		loginScreen.style.display = "none";
	}

	if (dashboard) {
		dashboard.style.display = "block";
	}

	resetToToday();

	// 운영진 화면 자동 갱신 시작
	startAdminAutoRefresh();
}

// ==========================================================
// 운영진 확인번호 인증
// ==========================================================

async function verifyAdminAccess() {
	const input = document.getElementById("adminAuthInput");

	if (!input) {
		console.error("adminAuthInput 요소를 찾을 수 없습니다.");

		return;
	}

	const authCode = String(input.value || "").trim();

	if (!authCode) {
		alert("운영진 확인번호를 입력해주세요.");

		input.focus();

		return;
	}

	// 숫자만 허용
	if (!/^\d{8}$/.test(authCode)) {
		alert("운영진 확인번호 8자리를 입력해주세요.");

		input.focus();

		return;
	}

	const button = document.getElementById("adminVerifyButton");

	if (button) {
		button.disabled = true;

		button.textContent = "확인 중...";
	}

	try {
		const response = await fetch(API_URL, {
			method: "POST",

			headers: {
				"Content-Type": "text/plain;charset=UTF-8",
			},

			body: JSON.stringify({
				action: "adminLogin",

				authCode: authCode,
			}),
		});

		const result = await response.json();

		console.log("[운영진 인증 결과]", result);

		if (!response.ok || !result.success) {
			throw new Error(
				result && result.message
					? result.message
					: "운영진 확인번호가 올바르지 않습니다.",
			);
		}

		// ======================================================
		// 인증 성공
		// ======================================================

		sessionStorage.setItem(ADMIN_AUTH_KEY, "true");

		if (input) {
			input.value = "";
		}
		setupWebPush();
		showAdminDashboard();
	} catch (error) {
		console.error("운영진 인증 오류:", error);

		alert(error.message || "운영진 인증에 실패했습니다.");
	} finally {
		if (button) {
			button.disabled = false;

			button.textContent = "확인";
		}
	}
}

// ==========================================================
// Enter 키로 운영진 인증
// ==========================================================

function handleAdminAuthKeydown(event) {
	if (event.key === "Enter") {
		event.preventDefault();

		verifyAdminAccess();
	}
}

// ==========================================================
// 운영진 로그아웃
// ==========================================================

function logoutAdmin() {
	stopAdminAutoRefresh();

	sessionStorage.removeItem(ADMIN_AUTH_KEY);
	sessionStorage.removeItem(ADMIN_CACHE_KEY);

	allAdminSchedules = [];
	showAdminLogin();
}
// ============================================================
// 운영진 대시보드 캐시 저장
// ============================================================

function saveAdminDashboardCache() {
	try {
		const weekKey = getAdminWeekKey(selectedAdminDate);

		sessionStorage.setItem(
			ADMIN_CACHE_KEY,
			JSON.stringify({
				schedules: allAdminSchedules || [],
				weekKey: weekKey,
				savedAt: Date.now(),
			}),
		);
	} catch (e) {
		console.warn("운영진 대시보드 캐시 저장 실패:", e);
	}
}

// ============================================================
// 운영진 대시보드 캐시 불러오기
// ============================================================

function loadAdminDashboardCache() {
	try {
		const cached = sessionStorage.getItem(ADMIN_CACHE_KEY);

		if (!cached) {
			return false;
		}

		const data = JSON.parse(cached);

		if (!data || !Array.isArray(data.schedules)) {
			return false;
		}

		// 현재 선택된 날짜의 주간 데이터인지 확인
		const currentWeekKey = getAdminWeekKey(selectedAdminDate);

		if (data.weekKey && data.weekKey !== currentWeekKey) {
			return false;
		}

		allAdminSchedules = data.schedules;

		return true;
	} catch (e) {
		console.warn("운영진 대시보드 캐시 불러오기 실패:", e);

		return false;
	}
}

// ==========================================================
// 관리자 일정 조회
//
// 캐시가 있으면 먼저 즉시 표시
// 이후 최신 데이터를 다시 조회해서 갱신
// ==========================================================

async function loadAdminData() {
	if (sessionStorage.getItem(ADMIN_AUTH_KEY) !== "true") {
		showAdminLogin();

		return;
	}
	try {
		// --------------------------------------------------------
		// 현재 선택 날짜
		// --------------------------------------------------------

		const year = selectedAdminDate.getFullYear();

		const month = String(selectedAdminDate.getMonth() + 1).padStart(2, "0");

		const day = String(selectedAdminDate.getDate()).padStart(2, "0");

		const targetDate = `${year}-${month}-${day}`;

		// --------------------------------------------------------
		// 1. 캐시 먼저 확인
		// --------------------------------------------------------

		const hasCache = loadAdminDashboardCache();

		// --------------------------------------------------------
		// 2. 캐시가 있으면 즉시 화면 표시
		// --------------------------------------------------------

		if (hasCache) {
			console.log("[운영진 대시보드] 캐시 즉시 표시");

			renderFilteredAdminSchedules();
		} else {
			// 캐시가 없을 때만 로딩 표시

			const list = document.getElementById("adminList");

			if (list) {
				list.innerHTML = `
          <div class="loading-message">
            일정을 불러오는 중입니다.
          </div>
        `;
			}
		}

		// --------------------------------------------------------
		// 3. 최신 데이터 조회
		// --------------------------------------------------------

		console.log("[운영진 대시보드] 최신 데이터 조회:", targetDate);

		const response = await fetch(API_URL, {
			method: "POST",

			headers: {
				"Content-Type": "text/plain;charset=UTF-8",
			},

			body: JSON.stringify({
				action: "getAdminSchedules",
				date: targetDate,
			}),
		});

		// --------------------------------------------------------
		// 4. HTTP 확인
		// --------------------------------------------------------

		if (!response.ok) {
			throw new Error("HTTP 오류: " + response.status);
		}

		// --------------------------------------------------------
		// 5. JSON 변환
		// --------------------------------------------------------

		const result = await response.json();

		// --------------------------------------------------------
		// 6. 서버 결과 확인
		// --------------------------------------------------------

		if (!result || result.success === false) {
			throw new Error(
				result && result.message
					? result.message
					: "운영진 일정 조회에 실패했습니다.",
			);
		}

		// --------------------------------------------------------
		// 7. 최신 일정 반영
		// --------------------------------------------------------

		allAdminSchedules = Array.isArray(result.schedules) ? result.schedules : [];

		// --------------------------------------------------------
		// 8. 캐시 갱신
		// --------------------------------------------------------

		saveAdminDashboardCache();

		// --------------------------------------------------------
		// 9. 최신 화면 반영
		// --------------------------------------------------------

		renderFilteredAdminSchedules();

		console.log(
			"[운영진 대시보드] 최신 데이터 갱신 완료:",
			allAdminSchedules.length,
		);
	} catch (error) {
		console.error("운영진 대시보드 조회 오류:", error);

		// --------------------------------------------------------
		// 캐시가 있으면 기존 화면 유지
		// --------------------------------------------------------

		if (Array.isArray(allAdminSchedules) && allAdminSchedules.length > 0) {
			console.warn("[운영진 대시보드] 최신 조회 실패 → 기존 데이터 유지");

			renderFilteredAdminSchedules();

			return;
		}

		// --------------------------------------------------------
		// 캐시도 없을 때만 오류 표시
		// --------------------------------------------------------

		const list = document.getElementById("adminList");

		if (list) {
			list.innerHTML = `
        <div class="error-message">
          일정을 불러오지 못했습니다.<br>
          잠시 후 다시 시도해주세요.
        </div>
      `;
		}
	}
}

// ==========================================================
// 선택 날짜의 일정만 필터링해서 렌더링
//
// 서버 재호출 없음.
// allAdminSchedules에 저장된 주간 일정에서 현재 날짜만 추린다.
// ==========================================================

function renderFilteredAdminSchedules() {
	const year = selectedAdminDate.getFullYear();

	const month = String(selectedAdminDate.getMonth() + 1).padStart(2, "0");

	const day = String(selectedAdminDate.getDate()).padStart(2, "0");

	const targetKey = `${year}-${month}-${day}`;

	const filteredSchedules = allAdminSchedules.filter(function (schedule) {
		if (!schedule) {
			return false;
		}

		const scheduleDate = String(schedule.date || "").trim();

		return scheduleDate === targetKey;
	});

	console.log("[운영진 날짜 필터]", {
		선택날짜: targetKey,
		전체주간일정: allAdminSchedules.length,
		해당날짜: filteredSchedules.length,
	});

	renderAdminData(filteredSchedules);
}

// ==========================================================
// 날짜 표시
// ==========================================================

function updateAdminDateDisplay() {
	const display = document.getElementById("dateNavDisplay");

	const rangeDisplay = document.getElementById("dateNavRange");

	if (!display) {
		return;
	}

	const year = selectedAdminDate.getFullYear();

	const month = selectedAdminDate.getMonth() + 1;

	const day = selectedAdminDate.getDate();

	const weekdays = ["일", "월", "화", "수", "목", "금", "토"];

	const weekday = weekdays[selectedAdminDate.getDay()];

	display.textContent = `${year}.${String(month).padStart(2, "0")}.${String(day).padStart(2, "0")} (${weekday})`;

	// --------------------------------------------------------
	// 선택 날짜 ~ 해당 주 일요일
	// --------------------------------------------------------

	if (rangeDisplay) {
		const current = new Date(selectedAdminDate);

		current.setHours(0, 0, 0, 0);

		const dayOfWeek = current.getDay();

		const sunday = new Date(current);

		sunday.setDate(current.getDate() + (dayOfWeek === 0 ? 0 : 7 - dayOfWeek));

		const sundayMonth = sunday.getMonth() + 1;

		const sundayDay = sunday.getDate();

		const sundayWeekday = weekdays[sunday.getDay()];

		const currentMonth = current.getMonth() + 1;

		const currentDay = current.getDate();

		const currentWeekday = weekdays[current.getDay()];

		rangeDisplay.textContent = `${currentMonth}월 ${currentDay}일(${currentWeekday}) ~ ${sundayMonth}월 ${sundayDay}일(${sundayWeekday})까지 조회 가능`;
	}
}

// ==========================================================
// 이전 / 다음 날짜
// ==========================================================

function moveDate(offset) {
	const oldDate = new Date(selectedAdminDate);

	const newDate = new Date(selectedAdminDate);

	newDate.setDate(newDate.getDate() + offset);

	newDate.setHours(0, 0, 0, 0);

	selectedAdminDate = newDate;

	updateAdminDateDisplay();

	// ========================================================
	// 기존 날짜와 새 날짜가 같은 주인지 확인
	// ========================================================

	const oldWeek = getAdminWeekKey(oldDate);

	const newWeek = getAdminWeekKey(newDate);

	// ========================================================
	// 같은 주
	// → 서버 요청 없이 기존 데이터에서 필터링
	// ========================================================

	if (oldWeek === newWeek) {
		renderFilteredAdminSchedules();

		return;
	}

	// ========================================================
	// 다른 주
	// → 새로운 주간 데이터 조회
	// ========================================================

	console.log("[운영진 날짜 이동] 주간 범위 변경 → 새 주 조회");

	loadAdminData();
}

// ==========================================================
// 오늘 날짜로 이동
// ==========================================================

function resetToToday() {
	const today = new Date();

	today.setHours(0, 0, 0, 0);

	selectedAdminDate = today;

	updateAdminDateDisplay();

	// 현재 저장된 주간 데이터가 있으면
	// 서버 재조회 없이 날짜만 필터링
	if (Array.isArray(allAdminSchedules) && allAdminSchedules.length > 0) {
		renderFilteredAdminSchedules();

		return;
	}

	// 최초 페이지 로딩
	loadAdminData();
}

// ==========================================================
// 기존 함수명 호환
// ==========================================================

// 기존 HTML 또는 다른 코드에서
// setToday()를 호출하고 있어도 동작하도록 유지

function setToday() {
	resetToToday();
}

// 기존 HTML 또는 다른 코드에서
// changeDate()를 호출하고 있어도 동작하도록 유지

function changeDate(offset) {
	moveDate(offset);
}

// ==========================================================
// 요약
// ==========================================================

function updateSummary(total, complete, incomplete) {
	const totalElement = document.getElementById("totalCount");

	const completeElement = document.getElementById("completeCount");

	const incompleteElement = document.getElementById("incompleteCount");

	if (totalElement) {
		totalElement.textContent = total;
	}

	if (completeElement) {
		completeElement.textContent = complete;
	}

	if (incompleteElement) {
		incompleteElement.textContent = incomplete;
	}
}

// ==========================================================
// 로딩
// ==========================================================

function showLoading() {
	const loading = document.getElementById("loadingMessage");

	if (loading) {
		loading.style.display = "block";
	}

	const list = document.getElementById("adminList");

	if (list) {
		list.innerHTML = "";
	}
}

// ==========================================================
// 로딩 종료
// ==========================================================

function hideLoading() {
	const loading = document.getElementById("loadingMessage");

	if (loading) {
		loading.style.display = "none";
	}
}

// ==========================================================
// 오류
// ==========================================================

function showError(message) {
	const error = document.getElementById("errorMessage");

	if (!error) {
		return;
	}

	error.textContent = message;

	error.style.display = "block";
}

function hideError() {
	const error = document.getElementById("errorMessage");

	if (error) {
		error.style.display = "none";
	}
}

// ==========================================================
// 관리자 일정 목록 렌더링
// ==========================================================

function renderAdminData(schedules) {
	const list = document.getElementById("adminList");

	if (!list) {
		return;
	}

	list.innerHTML = "";

	schedules = Array.isArray(schedules) ? schedules : [];

	let completeCount = 0;
	let incompleteCount = 0;

	schedules.forEach(function (schedule) {
		const card = createScheduleCard(schedule);

		if (card) {
			list.appendChild(card);
		}

		// --------------------------------------------------------
		// 주강사 종료보고
		// --------------------------------------------------------

		const mainComplete = schedule.mainTeacher
			? schedule.mainEndReport === true
			: true;

		// --------------------------------------------------------
		// 보조강사 시작 + 종료보고
		// --------------------------------------------------------

		const assistantComplete =
			schedule.assistantStartReport === true &&
			schedule.assistantEndReport === true;

		// --------------------------------------------------------
		// 전체 완료 여부
		// --------------------------------------------------------

		const isComplete = mainComplete && assistantComplete;

		if (isComplete) {
			completeCount++;
		} else {
			incompleteCount++;
		}
	});

	updateSummary(schedules.length, completeCount, incompleteCount);

	const emptyMessage = document.getElementById("emptyMessage");

	if (emptyMessage) {
		emptyMessage.style.display = schedules.length === 0 ? "block" : "none";
	}
}

// ==========================================================
// 관리자 일정 카드 생성
// ==========================================================

function createScheduleCard(schedule) {
	if (!schedule) {
		return null;
	}

	const card = document.createElement("div");
	card.className = "dispatch-card";

	// ========================================================
	// 기본 정보
	// ========================================================

	const facilityName = escapeHtml(schedule.facilityName || "-");

	const startTime = String(schedule.startTime || schedule.time || "").trim();

	const endTime = String(schedule.endTime || "").trim();

	let timeText = "-";

	if (startTime && endTime) {
		timeText = startTime + "~" + endTime;
	} else if (startTime) {
		timeText = startTime;
	}

	const time = escapeHtml(timeText);

	const target = escapeHtml(schedule.target || "-");

	// ========================================================
	// 강사
	// ========================================================

	const mainTeacher = getInstructorName(schedule.mainTeacher);

	const assistantTeacher = getInstructorName(schedule.assistantTeacher);

	const assistantIsOperations = schedule.assistantIsOperations === true;

	// ========================================================
	// 보고 상태
	// ========================================================

	const mainComplete = schedule.mainEndReport === true;

	const assistantStartComplete = schedule.assistantStartReport === true;

	const assistantEndComplete = schedule.assistantEndReport === true;

	// ========================================================
	// 보고 제출 시간
	// ========================================================

	const mainEndReportTime = String(schedule.mainEndReportTime || "").trim();

	const assistantStartReportTime = String(
		schedule.assistantStartReportTime || "",
	).trim();

	const assistantEndReportTime = String(
		schedule.assistantEndReportTime || "",
	).trim();

	// ========================================================
	// 상태 클래스
	// ========================================================

	const mainStatusClass = mainComplete
		? "status-complete"
		: "status-incomplete";

	const assistantStartStatusClass = assistantStartComplete
		? "status-complete"
		: "status-incomplete";

	const assistantEndStatusClass = assistantEndComplete
		? "status-complete"
		: "status-incomplete";

	// ========================================================
	// 보고 문구
	//
	// 중요:
	// 시간은 전부 박스 밖으로 분리한다.
	//
	// 주강사
	//   [종료보고] 12:04
	//
	// 보조강사
	//   [시작보고] 10:04
	//   [종료보고] 12:30
	// ========================================================

	const mainReportText = mainComplete ? "종료보고" : "종료보고 미제출";

	const assistantStartReportText = assistantStartComplete
		? "시작보고"
		: "시작보고 미제출";

	const assistantEndReportText = assistantEndComplete
		? "종료보고"
		: "종료보고 미제출";

	// ========================================================
	// 카드 HTML
	// ========================================================

	card.innerHTML = `
    <div class="dispatch-header">
      <div class="dispatch-title">
        ${facilityName}
      </div>
    </div>

    <div class="dispatch-info">
      <span class="time">${time}</span>
      <span class="info-divider">|</span>
      <span>${target}</span>
    </div>

    <div class="teacher-list">

      <!-- ==================================================
           주강사
           ================================================== -->

      <div class="teacher-block">

        <div class="teacher-type">
          주강사
        </div>

        <div class="teacher-row">

          <div class="teacher-name">
            ${escapeHtml(mainTeacher || "-")}
          </div>

          <div class="report-status-wrap">

            <div class="report-item">

              <span class="status ${mainStatusClass}">
                ${escapeHtml(mainReportText)}
              </span>

              ${
								mainComplete && mainEndReportTime
									? `
                    <span class="report-time">
                      ${escapeHtml(mainEndReportTime)}
                    </span>
                  `
									: ""
							}

            </div>

          </div>

        </div>

      </div>


      <!-- ==================================================
           보조강사
           ================================================== -->

      <div class="teacher-block">

        <div class="teacher-type">
          보조강사
        </div>

        <div class="teacher-row">

          <div class="teacher-name">
            ${escapeHtml(
							assistantIsOperations ? "운영진 대체" : assistantTeacher || "-",
						)}
          </div>

          <div class="assistant-status">

            <!-- ----------------------------------------------
                 시작보고
                 ---------------------------------------------- -->

            <div class="assistant-report-item">

              <span class="status ${assistantStartStatusClass}">
                ${escapeHtml(assistantStartReportText)}
              </span>

              ${
								assistantStartComplete && assistantStartReportTime
									? `
                    <span class="report-time">
                      ${escapeHtml(assistantStartReportTime)}
                    </span>
                  `
									: ""
							}

            </div>


            <!-- ----------------------------------------------
                 종료보고
                 ---------------------------------------------- -->

            <div class="assistant-report-item">

              <span class="status ${assistantEndStatusClass}">
                ${escapeHtml(assistantEndReportText)}
              </span>

              ${
								assistantEndComplete && assistantEndReportTime
									? `
                    <span class="report-time">
                      ${escapeHtml(assistantEndReportTime)}
                    </span>
                  `
									: ""
							}

            </div>

          </div>

        </div>

      </div>

    </div>
  `;

	return card;
}

// ==========================================================
// 날짜 표시
// ==========================================================

function formatAdminDate(value) {
	if (!value) {
		return "";
	}

	const text = String(value).trim();

	if (/^\d{4}-\d{2}-\d{2}$/.test(text)) {
		const parts = text.split("-");

		return parts[0] + "." + parts[1] + "." + parts[2];
	}

	return text;
}

// ==========================================================
// 강사명 처리
// ==========================================================

function getInstructorName(value) {
	if (!value) {
		return "";
	}

	if (typeof value === "object") {
		return String(value.name || value.title || value.text || "").trim();
	}

	return String(value).trim();
}

// ==========================================================
// HTML escape
// ==========================================================

function escapeHtml(value) {
	return String(value == null ? "" : value)
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;")
		.replace(/"/g, "&quot;")
		.replace(/'/g, "&#039;");
}

// ==========================================================
// 날짜가 속한 주의 월요일을 YYYY-MM-DD로 반환
// ==========================================================

function getAdminWeekKey(date) {
	const d = new Date(date);

	d.setHours(0, 0, 0, 0);

	const day = d.getDay();

	const diff = day === 0 ? -6 : 1 - day;

	d.setDate(d.getDate() + diff);

	const year = d.getFullYear();

	const month = String(d.getMonth() + 1).padStart(2, "0");

	const dateDay = String(d.getDate()).padStart(2, "0");

	return `${year}-${month}-${dateDay}`;
}

// ==========================================================
// 운영진 대시보드 자동 갱신
// 1분마다 최신 일정 조회
// ==========================================================

let adminAutoRefreshTimer = null;

function startAdminAutoRefresh() {
	stopAdminAutoRefresh();

	adminAutoRefreshTimer = setInterval(
		function () {
			if (sessionStorage.getItem(ADMIN_AUTH_KEY) !== "true") {
				stopAdminAutoRefresh();
				return;
			}

			console.log("[운영진 자동 갱신] 최신 일정 조회");

			loadAdminData();
		},
		3 * 60 * 1000,
	);
}

function stopAdminAutoRefresh() {
	if (adminAutoRefreshTimer) {
		clearInterval(adminAutoRefreshTimer);
		adminAutoRefreshTimer = null;
	}
}
