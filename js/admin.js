const API_URL = "https://instructor-api.seol7518.workers.dev/";
// ==========================================================
// 운영진 인증 상태
// ==========================================================

const ADMIN_AUTH_KEY = "adminAuthenticated";
// ==========================================================
// 관리자 주간 전체 일정
// ==========================================================

let allAdminSchedules = [];

// 운영진 일정 조회 중 여부
let adminSchedulesLoading = false;

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
// 새 보고 배지 상태
// ==========================================================

// 보고 상태의 이전값을 저장
const ADMIN_REPORT_STATE_KEY = "adminReportState";

// 읽지 않은 새 보고 건수
const ADMIN_UNREAD_REPORT_COUNT_KEY = "adminUnreadReportCount";

// ==========================================================
// 초기화
// ==========================================================

document.addEventListener("DOMContentLoaded", function () {
  initNewReportBadge();
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

// ==========================================================
// 운영진 확인번호 인증
// + Web Push 사용자 제스처 연결
// ==========================================================

// ==========================================================
// 운영진 확인번호 인증
// Web Push를 운영진 확인 버튼의 사용자 제스처에서 바로 시작
// ==========================================================

async function verifyAdminAccess() {
  const input = document.getElementById("adminAuthInput");

  if (!input) {
    console.error("adminAuthInput 요소를 찾을 수 없습니다.");
    return;
  }

  const authCode = String(input.value || "").trim();
  console.log("[운영진 확인번호]", {
    value: authCode,
    length: authCode.length,
  });

  if (!authCode) {
    alert("운영진 확인번호를 입력해주세요.");
    input.focus();
    return;
  }

  // 숫자만 허용
  if (!/^\d{4}$/.test(authCode)) {
    alert("운영진 확인번호 4자리를 입력해주세요.");
    input.focus();
    return;
  }

  const button = document.getElementById("adminVerifyButton");

  if (button) {
    button.disabled = true;
    button.textContent = "확인 중...";
  }

  // ======================================================
  // Web Push 시작
  // 운영진 확인 버튼의 직접 사용자 동작에서 즉시 실행
  // ======================================================

  let pushPromise = null;

  if (
    typeof setupWebPush === "function" &&
    "Notification" in window &&
    "serviceWorker" in navigator &&
    "PushManager" in window
  ) {
    try {
      console.log("[Web Push] 운영진 확인 버튼에서 Push 준비 시작");

      pushPromise = setupWebPush();
    } catch (pushStartError) {
      console.warn("[Web Push] Push 준비 시작 실패:", pushStartError);
    }
  } else {
    console.log("[Web Push] 현재 환경에서 Push 기능을 사용할 수 없습니다.");
  }

  try {
    // ======================================================
    // 운영진 인증
    // ======================================================

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

    // ======================================================
    // 인증 실패
    // ======================================================

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

    input.value = "";

    // ======================================================
    // Push 처리 완료 대기
    // Push 실패가 운영진 인증 실패로 처리되지는 않음
    // ======================================================

    if (pushPromise) {
      try {
        await pushPromise;

        console.log("[Web Push] 운영진 인증 후 Push 처리 완료");
      } catch (pushError) {
        console.warn("[Web Push] Push 처리 실패:", pushError);
      }
    }

    // ======================================================
    // 대시보드 표시
    // ======================================================

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
//
// 주간별로 각각 저장
// 예:
// {
//   "2026-10-05": {
//      schedules: [...],
//      savedAt: 123456789
//   },
//   "2026-10-12": {
//      schedules: [...],
//      savedAt: 123456789
//   }
// }
//
// 기존 단일 주간 캐시와도 호환
// ============================================================

function saveAdminDashboardCache() {
  try {
    const currentWeekKey = getAdminWeekKey(selectedAdminDate);

    let cacheData = {
      weeks: {},
    };

    const cached = sessionStorage.getItem(ADMIN_CACHE_KEY);

    if (cached) {
      try {
        const parsed = JSON.parse(cached);

        // ----------------------------------------------------
        // 새 다중 주간 캐시
        // ----------------------------------------------------

        if (parsed && parsed.weeks && typeof parsed.weeks === "object") {
          cacheData = parsed;
        }

        // ----------------------------------------------------
        // 기존 단일 주간 캐시
        // → 새 구조로 자동 변환
        // ----------------------------------------------------
        else if (parsed && Array.isArray(parsed.schedules)) {
          const oldWeekKey = String(parsed.weekKey || "").trim();

          if (oldWeekKey) {
            cacheData.weeks[oldWeekKey] = {
              schedules: parsed.schedules,
              savedAt: parsed.savedAt || Date.now(),
            };
          }
        }
      } catch (parseError) {
        console.warn("[운영진 대시보드] 기존 캐시 변환 실패:", parseError);
      }
    }

    // --------------------------------------------------------
    // 현재 주 캐시 저장
    // --------------------------------------------------------

    cacheData.weeks[currentWeekKey] = {
      schedules: Array.isArray(allAdminSchedules) ? allAdminSchedules : [],
      savedAt: Date.now(),
    };

    sessionStorage.setItem(ADMIN_CACHE_KEY, JSON.stringify(cacheData));

    console.log("[운영진 대시보드] 주간 캐시 저장:", {
      weekKey: currentWeekKey,
      schedules: Array.isArray(allAdminSchedules)
        ? allAdminSchedules.length
        : 0,
      cachedWeeks: Object.keys(cacheData.weeks).length,
    });
  } catch (e) {
    console.warn("운영진 대시보드 캐시 저장 실패:", e);
  }
}

// ============================================================
// 운영진 대시보드 캐시 불러오기
//
// 현재 선택 날짜가 속한 주의 캐시를 찾는다.
//
// 캐시가 있으면:
//   true 반환
//   allAdminSchedules에 캐시 데이터 저장
//
// 캐시가 없으면:
//   false 반환
// ============================================================

function loadAdminDashboardCache() {
  try {
    const cached = sessionStorage.getItem(ADMIN_CACHE_KEY);

    if (!cached) {
      return false;
    }

    const data = JSON.parse(cached);

    // --------------------------------------------------------
    // 새 다중 주간 캐시
    // --------------------------------------------------------

    if (data && data.weeks && typeof data.weeks === "object") {
      const currentWeekKey = getAdminWeekKey(selectedAdminDate);

      const weekCache = data.weeks[currentWeekKey];

      if (!weekCache || !Array.isArray(weekCache.schedules)) {
        return false;
      }

      allAdminSchedules = weekCache.schedules;

      console.log("[운영진 대시보드] 주간 캐시 적중:", {
        weekKey: currentWeekKey,
        schedules: allAdminSchedules.length,
      });

      return true;
    }

    // --------------------------------------------------------
    // 기존 단일 주간 캐시 호환
    // --------------------------------------------------------

    if (data && Array.isArray(data.schedules)) {
      const currentWeekKey = getAdminWeekKey(selectedAdminDate);

      if (data.weekKey && data.weekKey !== currentWeekKey) {
        return false;
      }

      allAdminSchedules = data.schedules;

      return true;
    }

    return false;
  } catch (e) {
    console.warn("운영진 대시보드 캐시 불러오기 실패:", e);

    return false;
  }
}

// ==========================================================
// 관리자 일정 조회
//
// 동작
// 1. 현재 선택 날짜가 속한 주간 캐시 확인
// 2. 최신 데이터 조회 중에는 "일정 없음" 표시 안 함
// 3. 이미 조회 중이면 중복 서버 요청 방지
// 4. 최신 데이터 조회 완료 후에만 실제 일정 없음 판단
// 5. 조회 실패 시 기존 데이터가 있으면 기존 화면 유지
// ==========================================================

async function loadAdminData() {
  if (sessionStorage.getItem(ADMIN_AUTH_KEY) !== "true") {
    showAdminLogin();
    return;
  }

  // --------------------------------------------------------
  // 이미 서버 조회 중이면 중복 요청 방지
  // --------------------------------------------------------

  if (adminSchedulesLoading) {
    console.log("[운영진 대시보드] 이미 일정 조회 중 → 중복 조회 방지");
    return;
  }

  adminSchedulesLoading = true;

  try {
    // --------------------------------------------------------
    // 현재 선택 날짜
    // --------------------------------------------------------

    const year = selectedAdminDate.getFullYear();

    const month = String(selectedAdminDate.getMonth() + 1).padStart(2, "0");

    const day = String(selectedAdminDate.getDate()).padStart(2, "0");

    const targetDate = `${year}-${month}-${day}`;

    // --------------------------------------------------------
    // 1. 현재 선택 날짜가 속한 주간 캐시 확인
    //
    // 캐시는 서버 조회 실패 시 기존 데이터 유지용으로도 사용.
    // 캐시가 있더라도 새 주 이동 시 최신 서버 조회는 진행.
    // --------------------------------------------------------

    const hasCache = loadAdminDashboardCache();

    const emptyMessage = document.getElementById("emptyMessage");

    const loading = document.getElementById("loadingMessage");

    if (hasCache) {
      // 캐시는 확보만 해두고,
      // 최신 데이터를 불러오는 동안에는 카드 대신 로딩 문구 표시
      if (emptyMessage) {
        emptyMessage.style.display = "none";
      }

      showLoading();

      console.log("[운영진 대시보드] 캐시 확인 → 최신 데이터 조회");
    } else {
      // --------------------------------------------------------
      // 캐시가 없으면 일정 목록을 비우고 로딩 표시
      // --------------------------------------------------------

      showLoading();

      if (emptyMessage) {
        emptyMessage.style.display = "none";
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
    console.log("[운영진 API 전체 응답]", result);

    console.log(
      "[운영진 만족도 데이터]",
      (Array.isArray(result.schedules) ? result.schedules : []).map(
        (schedule) => ({
          facilityName: schedule.facilityName,
          satisfaction: schedule.satisfaction,
        }),
      ),
    );

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

    const latestSchedules = Array.isArray(result.schedules)
      ? result.schedules
      : [];

    // --------------------------------------------------------
    // 새 제출 보고 감지
    // --------------------------------------------------------

    detectNewAdminReports(latestSchedules, false);

    // --------------------------------------------------------
    // 최신 일정 저장
    // --------------------------------------------------------

    allAdminSchedules = latestSchedules;

    // --------------------------------------------------------
    // 8. 캐시 갱신
    // --------------------------------------------------------

    saveAdminDashboardCache();

    // --------------------------------------------------------
    // 9. 서버 조회 완료
    // --------------------------------------------------------

    adminSchedulesLoading = false;

    hideLoading();

    // --------------------------------------------------------
    // 10. 최신 화면 반영
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

    if (hasCache && Array.isArray(allAdminSchedules)) {
      console.warn("[운영진 대시보드] 최신 조회 실패 → 해당 주 캐시 유지");
      hideLoading();
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

    // 오류 시에도 "일정 없음"은 숨김
    const emptyMessage = document.getElementById("emptyMessage");

    if (emptyMessage) {
      emptyMessage.style.display = "none";
    }
  } finally {
    // --------------------------------------------------------
    // 조회 종료
    //
    // renderAdminData()에서 이 값을 확인해서
    // 조회 중에는 "일정 없음"을 표시하지 않도록 함
    // --------------------------------------------------------

    adminSchedulesLoading = false;
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

  // --------------------------------------------------------
  // 선택 날짜 표시
  // --------------------------------------------------------

  display.textContent = `${year}.${String(month).padStart(2, "0")}.${String(day).padStart(2, "0")} (${weekday})`;

  // --------------------------------------------------------
  // 선택 날짜가 속한 주간 범위 표시
  // --------------------------------------------------------

  if (rangeDisplay) {
    const current = new Date(selectedAdminDate);

    current.setHours(0, 0, 0, 0);

    const dayOfWeek = current.getDay();

    const monday = new Date(current);

    const mondayOffset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;

    monday.setDate(current.getDate() + mondayOffset);
    monday.setHours(0, 0, 0, 0);

    const sunday = new Date(monday);

    sunday.setDate(monday.getDate() + 6);
    sunday.setHours(0, 0, 0, 0);

    const mondayMonth = monday.getMonth() + 1;
    const mondayDay = monday.getDate();
    const mondayWeekday = weekdays[monday.getDay()];

    const sundayMonth = sunday.getMonth() + 1;
    const sundayDay = sunday.getDate();
    const sundayWeekday = weekdays[sunday.getDay()];

    rangeDisplay.textContent =
      `${mondayMonth}월 ${mondayDay}일(${mondayWeekday}) ~ ` +
      `${sundayMonth}월 ${sundayDay}일(${sundayWeekday})`;
  }

  updateAdminDateArrowState();
}
// ==========================================================
// 이전 / 다음 날짜
//
// - 같은 주 이동:
//   기존 주간 데이터에서 날짜만 필터링
//
// - 다른 주 이동:
//   기존 데이터를 화면에 필터링하지 않고
//   새 주 데이터를 서버에서 다시 조회
//
// - 날짜 이동 제한 없음
// ==========================================================

function moveDate(offset) {
  console.log("[운영진 날짜 이동 실행]:", offset);

  const current = new Date(selectedAdminDate);
  current.setHours(0, 0, 0, 0);

  // --------------------------------------------------------
  // 이동할 날짜 계산
  // --------------------------------------------------------

  const newDate = new Date(current);

  newDate.setDate(current.getDate() + offset);
  newDate.setHours(0, 0, 0, 0);

  // --------------------------------------------------------
  // 현재 주와 이동한 날짜의 주 비교
  // --------------------------------------------------------

  const currentWeekKey = getAdminWeekKey(current);
  const newWeekKey = getAdminWeekKey(newDate);

  // --------------------------------------------------------
  // 선택 날짜 변경
  // --------------------------------------------------------

  selectedAdminDate = newDate;

  updateAdminDateDisplay();

  // --------------------------------------------------------
  // 같은 주
  //
  // 서버 재조회 없이 기존 데이터에서 날짜만 필터링
  // --------------------------------------------------------

  if (currentWeekKey === newWeekKey) {
    renderFilteredAdminSchedules();
    return;
  }

  // --------------------------------------------------------
  // 다른 주
  //
  // 여기서는 renderFilteredAdminSchedules()를 호출하지 않음.
  //
  // 호출하면 이전 주 데이터에서 새 날짜를 찾게 되어
  // "해당 날짜에 등록된 출강 일정이 없습니다."가
  // 먼저 표시되는 문제가 발생함.
  //
  // loadAdminData()가 캐시 확인 → 로딩 표시 → 서버 조회
  // 순서로 처리함.
  // --------------------------------------------------------

  console.log("[운영진 날짜 이동] 다른 주 → 새 주 일정 조회", {
    이전주: currentWeekKey,
    이동주: newWeekKey,
    선택날짜: `${newDate.getFullYear()}-${String(
      newDate.getMonth() + 1,
    ).padStart(2, "0")}-${String(newDate.getDate()).padStart(2, "0")}`,
  });

  // --------------------------------------------------------
  // 새 주 조회 시작
  // 캐시가 있더라도 최신 데이터 확인 중임을 표시
  // --------------------------------------------------------

  // showLoading();

  loadAdminData();
}
// ==========================================================
// 오늘 날짜로 이동
// ==========================================================

function resetToToday() {
  const today = new Date();

  today.setHours(0, 0, 0, 0);

  const currentWeekKey = getAdminWeekKey(selectedAdminDate);

  const todayWeekKey = getAdminWeekKey(today);

  selectedAdminDate = today;

  updateAdminDateDisplay();

  // --------------------------------------------------------
  // 현재 가지고 있는 데이터가 오늘과 같은 주라면
  // 서버 재조회 없이 날짜만 변경
  // --------------------------------------------------------

  if (
    currentWeekKey === todayWeekKey &&
    Array.isArray(allAdminSchedules) &&
    allAdminSchedules.length > 0
  ) {
    renderFilteredAdminSchedules();

    return;
  }

  // --------------------------------------------------------
  // 다른 주 데이터를 보고 있었다면
  // 오늘이 속한 주를 다시 조회
  // --------------------------------------------------------

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

  // ============================================================
  // 일정 없음 표시
  // ============================================================

  const emptyMessage = document.getElementById("emptyMessage");

  if (emptyMessage) {
    // ----------------------------------------------------------
    // 아직 서버 조회 중이면
    // "일정 없음"을 절대 표시하지 않음
    // ----------------------------------------------------------

    if (adminSchedulesLoading) {
      emptyMessage.style.display = "none";
    }

    // ----------------------------------------------------------
    // 서버 조회가 끝난 후 실제 일정이 있으면 숨김
    // ----------------------------------------------------------
    else if (schedules.length > 0) {
      emptyMessage.style.display = "none";
    }

    // ----------------------------------------------------------
    // 서버 조회가 끝났고 실제 일정도 없을 때만 표시
    // ----------------------------------------------------------
    else {
      emptyMessage.style.display = "block";
    }
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

  const satisfactionBadge = getSatisfactionBadgeHtml(schedule.satisfaction);

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
  // 보고 지연 여부
  // 수업 당일 자정(23:59:59)까지 정상
  // 다음 날 00:00:00부터 지연
  // ========================================================

  const mainLate =
    mainComplete && isLateReport(schedule.date, mainEndReportTime);

  const assistantStartLate =
    assistantStartComplete &&
    isLateReport(schedule.date, assistantStartReportTime);

  const assistantEndLate =
    assistantEndComplete && isLateReport(schedule.date, assistantEndReportTime);
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
  <span class="facility-name">${facilityName}</span>
  ${satisfactionBadge}
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
                    <span class="report-time ${mainLate ? "report-time-late" : ""}">
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
                    <span class="report-time ${assistantStartLate ? "report-time-late" : ""}">
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
                    <span class="report-time ${assistantEndLate ? "report-time-late" : ""}">
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
// 보고 지연 여부
//
// 수업 당일 23:59:59까지 정상
// 다음 날 00:00:00부터 지연
// ==========================================================
function isLateReport(scheduleDate, reportTime) {
  if (!scheduleDate || !reportTime) {
    return false;
  }

  const classText = String(scheduleDate).trim();

  // 수업일 추출
  // 예: 2026-10-06
  //     2026. 10. 6
  //     2026/10/6
  const classMatch = classText.match(
    /^(\d{4})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})/,
  );

  if (!classMatch) {
    console.log("[지연판정] 수업일 파싱 실패:", {
      scheduleDate,
      reportTime,
    });
    return false;
  }

  const classYear = Number(classMatch[1]);
  const classMonth = Number(classMatch[2]);
  const classDay = Number(classMatch[3]);

  // 다음 날 00:00
  const nextDay = new Date(classYear, classMonth - 1, classDay + 1, 0, 0, 0, 0);

  const reportDate = parseAdminReportDateTime(reportTime);

  if (!reportDate) {
    console.log("[지연판정] 제출일시 파싱 실패:", {
      scheduleDate,
      reportTime,
    });
    return false;
  }

  const isLate = reportDate >= nextDay;

  console.log("[지연판정]", {
    수업일: `${classYear}-${String(classMonth).padStart(2, "0")}-${String(classDay).padStart(2, "0")}`,
    제출일시: reportTime,
    제출일: `${reportDate.getFullYear()}-${String(
      reportDate.getMonth() + 1,
    ).padStart(2, "0")}-${String(reportDate.getDate()).padStart(2, "0")}`,
    지연여부: isLate,
  });

  return isLate;
}

// ==========================================================
// 제출 일시에서 제출 날짜만 추출
//
// 지원 예:
// 2026. 10. 7 오후 4:40:00
// 2026. 10. 7 오후 4:40
// 2026-10-07 16:40:00
// 2026-10-07T16:40:00
// 2026/10/07 오후 4:40:00
// ==========================================================
function getAdminReportDateOnly(value) {
  const text = String(value || "").trim();

  if (!text) {
    return null;
  }

  const match = text.match(/(\d{4})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})/);

  if (!match) {
    return null;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);

  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return [
    year,
    String(month).padStart(2, "0"),
    String(day).padStart(2, "0"),
  ].join("-");
}
// ==========================================================
// Date → YYYY-MM-DD
// ==========================================================
function formatAdminDateKey(date) {
  if (!(date instanceof Date) || Number.isNaN(date.getTime())) {
    return "";
  }

  return [
    date.getFullYear(),
    String(date.getMonth() + 1).padStart(2, "0"),
    String(date.getDate()).padStart(2, "0"),
  ].join("-");
}

// ==========================================================
// 제출일시 파싱
//
// 예:
// 2026. 10. 7 오후 4:40:00
// 2026. 10. 7 오후 4:40
// 2026-10-07 16:40:00
// 2026-10-07 16:40
// 2026-10-07T16:40:00
// ==========================================================
function parseAdminReportDateTime(value) {
  const text = String(value || "").trim();

  if (!text) {
    return null;
  }

  // --------------------------------------------------------
  // 한국식 날짜 + 오전/오후
  // --------------------------------------------------------
  const koreanMatch = text.match(
    /^(\d{4})[.\-/]\s*(\d{1,2})[.\-/]\s*(\d{1,2})\s*(오전|오후)?\s*(\d{1,2}):(\d{2})(?::(\d{2}))?\s*$/,
  );

  if (koreanMatch) {
    const year = Number(koreanMatch[1]);
    const month = Number(koreanMatch[2]);
    const day = Number(koreanMatch[3]);
    const period = koreanMatch[4] || "";
    let hour = Number(koreanMatch[5]);
    const minute = Number(koreanMatch[6]);
    const second = Number(koreanMatch[7] || 0);

    if (period === "오후" && hour < 12) {
      hour += 12;
    }

    if (period === "오전" && hour === 12) {
      hour = 0;
    }

    const result = new Date(year, month - 1, day, hour, minute, second);

    if (!Number.isNaN(result.getTime())) {
      return result;
    }
  }

  // --------------------------------------------------------
  // YYYY-MM-DD HH:mm:ss
  // YYYY-MM-DD HH:mm
  // --------------------------------------------------------
  const standardMatch = text.match(
    /^(\d{4})-(\d{1,2})-(\d{1,2})\s+(\d{1,2}):(\d{2})(?::(\d{2}))?\s*$/,
  );

  if (standardMatch) {
    const result = new Date(
      Number(standardMatch[1]),
      Number(standardMatch[2]) - 1,
      Number(standardMatch[3]),
      Number(standardMatch[4]),
      Number(standardMatch[5]),
      Number(standardMatch[6] || 0),
    );

    if (!Number.isNaN(result.getTime())) {
      return result;
    }
  }

  // --------------------------------------------------------
  // ISO 날짜시간
  // --------------------------------------------------------
  const parsed = new Date(text);

  if (!Number.isNaN(parsed.getTime())) {
    return parsed;
  }

  return null;
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
// ==========================================================
// 새로 제출된 보고 배지
// ==========================================================
//
// 대상
// - 주강사 종료보고
// - 보조강사 시작보고
// - 보조강사 종료보고
//
// 기준
// false → true 로 변경된 보고만 새 제출로 판단
//
// 최초 로드
// 현재 상태를 기준값으로 저장하고 알림을 발생시키지 않음.
// ==========================================================

// ----------------------------------------------------------
// 일정별 고유 키 생성
// ----------------------------------------------------------

function getAdminReportScheduleKey(schedule) {
  if (!schedule) {
    return "";
  }

  // 서버에서 안정적인 ID가 내려오는 경우 우선 사용
  const directId =
    schedule.id ||
    schedule.scheduleId ||
    schedule.pageId ||
    schedule.notionPageId ||
    "";

  if (directId) {
    return String(directId).trim();
  }

  // ID가 없는 경우 일정 정보를 조합해서 키 생성
  const date = String(schedule.date || "").trim();

  const facility = String(schedule.facilityName || "").trim();

  const startTime = String(schedule.startTime || schedule.time || "").trim();

  const endTime = String(schedule.endTime || "").trim();

  const mainTeacher = getInstructorName(schedule.mainTeacher);

  const assistantTeacher = getInstructorName(schedule.assistantTeacher);

  const assistantIsOperations =
    schedule.assistantIsOperations === true ? "operations" : "assistant";

  return [
    date,
    facility,
    startTime,
    endTime,
    mainTeacher,
    assistantTeacher,
    assistantIsOperations,
  ].join("|");
}

// ----------------------------------------------------------
// 현재 보고 상태 추출
// ----------------------------------------------------------

function getAdminReportState(schedule) {
  if (!schedule) {
    return null;
  }

  return {
    mainEndReport: schedule.mainEndReport === true,

    assistantStartReport: schedule.assistantStartReport === true,

    assistantEndReport: schedule.assistantEndReport === true,
  };
}

// ----------------------------------------------------------
// 저장된 보고 상태 불러오기
// ----------------------------------------------------------

function loadAdminReportStates() {
  try {
    const saved = localStorage.getItem(ADMIN_REPORT_STATE_KEY);

    if (!saved) {
      return {};
    }

    const parsed = JSON.parse(saved);

    if (!parsed || typeof parsed !== "object") {
      return {};
    }

    return parsed;
  } catch (error) {
    console.warn("[새 보고 배지] 상태 불러오기 실패:", error);

    return {};
  }
}

// ----------------------------------------------------------
// 보고 상태 저장
// ----------------------------------------------------------

function saveAdminReportStates(states) {
  try {
    localStorage.setItem(ADMIN_REPORT_STATE_KEY, JSON.stringify(states));
  } catch (error) {
    console.warn("[새 보고 배지] 상태 저장 실패:", error);
  }
}

// ----------------------------------------------------------
// 읽지 않은 보고 건수 불러오기
// ----------------------------------------------------------

function getUnreadAdminReportCount() {
  try {
    const value = localStorage.getItem(ADMIN_UNREAD_REPORT_COUNT_KEY);

    const count = parseInt(value, 10);

    if (Number.isNaN(count) || count < 0) {
      return 0;
    }

    return count;
  } catch (error) {
    return 0;
  }
}

// ----------------------------------------------------------
// 읽지 않은 보고 건수 저장
// ----------------------------------------------------------

function saveUnreadAdminReportCount(count) {
  try {
    const safeCount = Math.max(0, parseInt(count, 10) || 0);

    localStorage.setItem(ADMIN_UNREAD_REPORT_COUNT_KEY, String(safeCount));
  } catch (error) {
    console.warn("[새 보고 배지] 읽지 않은 건수 저장 실패:", error);
  }
}

// ==========================================================
// 새 보고 배지 표시
// ==========================================================
function updateNewReportBadge() {
  const badge = document.getElementById("newReportBadge");
  const countElement = document.getElementById("newReportBadgeCount");

  if (!badge || !countElement) {
    return;
  }

  const count = getUnreadAdminReportCount();

  console.log("[새 보고 배지] 현재 미확인 건수:", count);

  if (count > 0) {
    countElement.textContent = String(count);

    badge.style.display = "flex";

    if (count >= 10) {
      badge.classList.add("has-many");
    } else {
      badge.classList.remove("has-many");
    }
  } else {
    badge.style.display = "none";
    badge.classList.remove("has-many");
  }
}

// ----------------------------------------------------------
// 새 제출 보고 감지
// ----------------------------------------------------------
//
// 이전 상태
// false
//
// 현재 상태
// true
//
// → 새 제출 1건
//
// 최초로 발견한 일정은 현재 상태를 기준값으로만 저장.
// 기존에 이미 완료된 보고를 새 알림으로 세지 않음.
// ----------------------------------------------------------

function detectNewAdminReports(schedules, isInitialState) {
  if (!Array.isArray(schedules)) {
    return;
  }

  const savedStates = loadAdminReportStates();

  let unreadCount = getUnreadAdminReportCount();

  let stateChanged = false;

  schedules.forEach(function (schedule) {
    if (!schedule) {
      return;
    }

    const scheduleKey = getAdminReportScheduleKey(schedule);

    if (!scheduleKey) {
      return;
    }

    const currentState = getAdminReportState(schedule);

    if (!currentState) {
      return;
    }

    const previousState = savedStates[scheduleKey];
    console.log("[새 보고 감지]", {
      facility: schedule.facilityName,
      date: schedule.date,
      previousState: previousState,
      currentState: currentState,
    });

    // ------------------------------------------------------
    // 최초 발견
    // ------------------------------------------------------
    //
    // 현재 상태를 기준값으로 저장만 한다.
    // 기존 완료 보고를 새 알림으로 세지 않는다.
    // ------------------------------------------------------

    if (!previousState) {
      savedStates[scheduleKey] = currentState;
      stateChanged = true;
      return;
    }

    // ------------------------------------------------------
    // 이후 조회
    // false → true만 새 제출로 인정
    // ------------------------------------------------------

    if (
      previousState.mainEndReport === false &&
      currentState.mainEndReport === true
    ) {
      console.log("[새 보고 감지] 주강사 종료보고:", schedule.facilityName);
      unreadCount++;
    }

    if (
      previousState.assistantStartReport === false &&
      currentState.assistantStartReport === true
    ) {
      console.log("[새 보고 감지] 보조강사 시작보고:", schedule.facilityName);
      unreadCount++;
    }

    if (
      previousState.assistantEndReport === false &&
      currentState.assistantEndReport === true
    ) {
      console.log("[새 보고 감지] 보조강사 종료보고:", schedule.facilityName);
      unreadCount++;
    }

    // 현재 상태로 갱신
    savedStates[scheduleKey] = currentState;

    stateChanged = true;
  });

  if (stateChanged) {
    saveAdminReportStates(savedStates);
  }

  saveUnreadAdminReportCount(unreadCount);

  updateNewReportBadge();
}

// ==========================================================
// 날짜 이동 화살표 활성화 / 비활성화
//
// 운영진 대시보드는 날짜 조회 제한 없음
// ==========================================================

function updateAdminDateArrowState() {
  const prevArrow = document.getElementById("prevDateArrow");

  const nextArrow = document.getElementById("nextDateArrow");

  if (prevArrow) {
    prevArrow.classList.remove("disabled");
  }

  if (nextArrow) {
    nextArrow.classList.remove("disabled");
  }
}

// ========================================
// 만족도 조사 표시
// ========================================

function getSatisfactionBadgeHtml(satisfaction) {
  const value = String(satisfaction || "").trim();

  if (value === "QR") {
    return `
      <span class="satisfaction-badge satisfaction-qr">
        📝 만족도 진행
      </span>
    `;
  }

  if (value === "QR+출강부") {
    return `
      <span class="satisfaction-badge satisfaction-qr-book">
        🚨 만족도 진행 및 출강부 회수
      </span>
    `;
  }

  return "";
}

function initNewReportBadge() {
  updateNewReportBadge();
}
/* ============================================================
   일정 조회 로딩 UI
   ============================================================ */

let scheduleLoadingTimer = null;
let scheduleLoadingMessageIndex = 0;

const scheduleLoadingMessages = [
  "확정된 출강 일정을 확인하고 있습니다.",
  "일정 정보를 불러오고 있습니다.",
  "출강 일정을 정리하고 있습니다.",
  "잠시만 기다려주세요.",
];

function showScheduleLoading() {
  const overlay = document.getElementById("scheduleLoadingOverlay");

  const subtitle = document.getElementById("scheduleLoadingSubtitle");

  if (!overlay) {
    return;
  }

  scheduleLoadingMessageIndex = 0;

  if (subtitle) {
    subtitle.textContent = scheduleLoadingMessages[0];
  }

  overlay.classList.remove("hidden");
  overlay.setAttribute("aria-hidden", "false");

  /*
   * 문구를 일정 간격으로 변경
   * 실제 진행률을 의미하는 것은 아니고
   * 사용자가 로딩 상태임을 자연스럽게 인식하도록 함
   */

  clearInterval(scheduleLoadingTimer);

  scheduleLoadingTimer = setInterval(function () {
    scheduleLoadingMessageIndex =
      (scheduleLoadingMessageIndex + 1) % scheduleLoadingMessages.length;

    if (subtitle) {
      subtitle.style.opacity = "0";

      setTimeout(function () {
        subtitle.textContent =
          scheduleLoadingMessages[scheduleLoadingMessageIndex];

        subtitle.style.opacity = "1";
      }, 150);
    }
  }, 1800);
}

function hideScheduleLoading() {
  const overlay = document.getElementById("scheduleLoadingOverlay");

  if (!overlay) {
    return;
  }

  clearInterval(scheduleLoadingTimer);
  scheduleLoadingTimer = null;

  overlay.classList.add("hidden");
  overlay.setAttribute("aria-hidden", "true");
}
