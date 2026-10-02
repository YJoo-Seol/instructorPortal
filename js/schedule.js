const API_URL = "https://instructor-api.seol7518.workers.dev/";
const REPORT_SCHEDULE_CACHE_KEY = "currentReportSchedulesCache";

// ========================================
// 역할별 Notion 확정 일정 페이지
// ========================================

const CONFIRMED_SCHEDULE_URLS = {
  주강사:
    "https://app.notion.com/p/3838ad55b53480a9a42edeac201a8f45?source=copy_link",

  보조강사:
    "https://app.notion.com/p/3838ad55b534808e9566c590456bd50a?source=copy_link",
};

// ========================================
// 초기 실행
// ========================================

document.addEventListener("DOMContentLoaded", () => {
  const storedData = sessionStorage.getItem("instructorData");

  if (!storedData) {
    showError("강사 정보를 찾을 수 없습니다. 다시 조회해주세요.");
    return;
  }

  try {
    const instructorData = JSON.parse(storedData);

    loadInstructorInfo(instructorData);

    // ------------------------------------
    // 이전에 조회한 일정이 있으면 캐시 사용
    // ------------------------------------

    const cached = getReportScheduleCache(instructorData.instructorNo);

    console.log("캐시된 출강 일정 사용:", cached);

    // ------------------------------------
    // 캐시가 없을 때만 서버 조회
    // ------------------------------------

    loadReportSchedules(instructorData);
  } catch (error) {
    console.error("강사 정보 처리 오류:", error);
    showError("강사 정보를 불러오는 중 오류가 발생했습니다.");
  }
});

// ========================================
// 출강 일정 sessionStorage 캐시
// ========================================

function saveReportScheduleCache(instructorNo, schedules, role, date) {
  try {
    const cache = {
      instructorNo: String(instructorNo || "").trim(),
      role: normalizeRole(role),
      date: String(date || "").trim(),
      schedules: Array.isArray(schedules) ? schedules : [],
    };

    sessionStorage.setItem(REPORT_SCHEDULE_CACHE_KEY, JSON.stringify(cache));

    console.log("출강 일정 캐시 저장:", cache);
  } catch (error) {
    console.error("출강 일정 캐시 저장 오류:", error);
  }
}

function getReportScheduleCache(instructorNo) {
  try {
    const raw = sessionStorage.getItem(REPORT_SCHEDULE_CACHE_KEY);

    if (!raw) {
      return null;
    }

    const cache = JSON.parse(raw);

    if (!cache || !Array.isArray(cache.schedules)) {
      return null;
    }

    if (
      String(cache.instructorNo || "").trim() !==
      String(instructorNo || "").trim()
    ) {
      return null;
    }

    // 날짜가 오늘과 다르면 캐시 사용하지 않음
    const today = new Date();

    const year = today.getFullYear();
    const month = today.getMonth() + 1;
    const day = today.getDate();

    const todayString = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

    if (cache.date !== todayString) {
      sessionStorage.removeItem(REPORT_SCHEDULE_CACHE_KEY);

      return null;
    }

    return cache;
  } catch (error) {
    console.error("출강 일정 캐시 확인 오류:", error);

    sessionStorage.removeItem(REPORT_SCHEDULE_CACHE_KEY);

    return null;
  }
}
// ========================================
// 일정 화면 헤더 갱신
// ========================================

function updateScheduleHeader(role, targetDate) {
  const instructorNo = document.getElementById("instructorNo");

  if (instructorNo) {
    try {
      const storedData = JSON.parse(
        sessionStorage.getItem("instructorData") || "null",
      );

      instructorNo.textContent = storedData?.instructorNo || "-";
    } catch (error) {
      instructorNo.textContent = "-";
    }
  }

  const date = new Date(targetDate + "T00:00:00");

  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];

  const scheduleDate = document.getElementById("scheduleDate");

  if (scheduleDate && !isNaN(date.getTime())) {
    scheduleDate.textContent = `${date.getFullYear()}. ${
      date.getMonth() + 1
    }. ${date.getDate()}. (${weekdays[date.getDay()]})`;
  }

  const confirmedScheduleLink = document.getElementById(
    "confirmedScheduleLink",
  );

  if (confirmedScheduleLink) {
    const normalizedRole = normalizeRole(role);

    const notionUrl = CONFIRMED_SCHEDULE_URLS[normalizedRole];

    if (notionUrl) {
      confirmedScheduleLink.href = notionUrl;
      confirmedScheduleLink.style.display = "inline-flex";
    } else {
      confirmedScheduleLink.style.display = "none";
    }
  }
}

// ============================================================
// Notion 운영진 DB 일정 + 보고 현황 조회
// 캐시로 즉시 표시 후 서버에서 최신 상태 갱신
// ============================================================

async function loadReportSchedules(data) {
  try {
    const today = new Date();
    const year = today.getFullYear();
    const month = today.getMonth() + 1;
    const day = today.getDate();

    const targetDate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

    // --------------------------------------------------------
    // 1. 캐시가 있으면 먼저 즉시 화면 표시
    // --------------------------------------------------------

    const cachedSchedules = getReportScheduleCache(data.instructorNo);

    console.log("캐시된 출강 일정 사용:", cachedSchedules);

    if (cachedSchedules && Array.isArray(cachedSchedules.schedules)) {
      const instructorNoEl = document.getElementById("instructorNo");

      if (instructorNoEl) {
        instructorNoEl.textContent =
          cachedSchedules.instructorNo || data.instructorNo || "-";
      }

      const cachedRole = normalizeRole(cachedSchedules.role || data.role);

      currentScheduleRole = cachedRole;

      // 확정 일정 링크
      const confirmedScheduleLink = document.getElementById(
        "confirmedScheduleLink",
      );

      if (confirmedScheduleLink) {
        const notionUrl = CONFIRMED_SCHEDULE_URLS[cachedRole];

        if (notionUrl) {
          confirmedScheduleLink.href = notionUrl;
          confirmedScheduleLink.style.display = "inline-flex";
        } else {
          confirmedScheduleLink.style.display = "none";
        }
      }

      // 캐시된 일정 즉시 사용
      allReportSchedules = cachedSchedules.schedules;

      console.log("캐시된 주간 전체 일정 즉시 표시:", {
        count: allReportSchedules.length,
        schedules: allReportSchedules,
      });

      hideLoading();
      updateDateDisplay();
      renderFilteredSchedules();

      // 여기서 return 하지 않는다.
      // 서버의 최신 보고 상태를 백그라운드에서 다시 확인한다.
    } else {
      // ------------------------------------------------------
      // 캐시가 없으면 서버 조회 중이라는 것만 표시
      // ------------------------------------------------------

      showLoading();
    }

    // --------------------------------------------------------
    // 2. 서버에서 최신 일정 + 최신 보고 현황 조회
    // --------------------------------------------------------

    console.log("========== 강사 일정 서버 조회 시작 ==========");

    const requestStart = performance.now();

    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "getInstructorReportSchedules",
        instructorNo: data.instructorNo,
        date: targetDate,
      }),
    });

    console.log(
      "강사 일정 서버 응답:",
      Math.round(performance.now() - requestStart) + "ms",
      "HTTP:",
      response.status,
    );

    if (!response.ok) {
      const errorText = await response.text();

      throw new Error("서버 응답 오류 (" + response.status + "): " + errorText);
    }

    const result = await response.json();

    // --------------------------------------------------------
    // 서버 결과 전체 확인
    // --------------------------------------------------------

    console.log("========== 강사 일정 서버 결과 ==========", {
      success: result.success,
      message: result.message,
      error: result.error,
      elapsedMs: result.elapsedMs,
      notionPageCount: result.notionPageCount,
      scheduleCount: result.schedules ? result.schedules.length : 0,
      timing: result.timing,
    });

    console.log("===== 서버 timing 상세 =====");

    console.table(result.timing || {});

    // --------------------------------------------------------
    // 서버 실패
    // --------------------------------------------------------

    if (!result.success) {
      console.error("========== 서버 일정 조회 실패 ==========");

      console.error("서버 오류 메시지:", result.message);

      console.error("서버 오류 상세:", result.error);

      // 캐시가 이미 화면에 표시된 경우
      // 기존 화면을 유지하고 오류만 기록
      if (cachedSchedules && Array.isArray(cachedSchedules.schedules)) {
        console.error("최신 일정 갱신 실패. 기존 캐시 화면을 유지합니다.");

        hideLoading();

        return;
      }

      hideLoading();

      showError(result.message || "출강 일정을 불러오지 못했습니다.");

      return;
    }

    hideLoading();

    // --------------------------------------------------------
    // 3. 최신 강사번호
    // --------------------------------------------------------

    const instructorNoEl = document.getElementById("instructorNo");

    if (instructorNoEl) {
      instructorNoEl.textContent =
        result.instructorNo || data.instructorNo || "-";
    }

    // --------------------------------------------------------
    // 4. 최신 역할
    // --------------------------------------------------------

    const role = normalizeRole(result.role || data.role);

    currentScheduleRole = role;

    // --------------------------------------------------------
    // 5. 확정 일정 링크
    // --------------------------------------------------------

    const confirmedScheduleLink = document.getElementById(
      "confirmedScheduleLink",
    );

    if (confirmedScheduleLink) {
      const notionUrl = CONFIRMED_SCHEDULE_URLS[role];

      if (notionUrl) {
        confirmedScheduleLink.href = notionUrl;

        confirmedScheduleLink.style.display = "inline-flex";
      } else {
        confirmedScheduleLink.style.display = "none";
      }
    }

    // --------------------------------------------------------
    // 6. 서버에서 받은 최신 일정으로 교체
    // --------------------------------------------------------

    const schedules = Array.isArray(result.schedules) ? result.schedules : [];

    allReportSchedules = schedules;

    console.log("서버 최신 주간 전체 일정:", {
      count: allReportSchedules.length,
      schedules: allReportSchedules,
    });

    // --------------------------------------------------------
    // 8. 최신 서버 결과를 캐시에 저장
    // --------------------------------------------------------

    saveReportScheduleCache(
      data.instructorNo,
      allReportSchedules,
      role,
      targetDate,
    );

    // --------------------------------------------------------
    // 9. 현재 선택된 날짜 기준으로 최신 데이터 다시 렌더링
    // --------------------------------------------------------

    updateDateDisplay();
    renderFilteredSchedules();

    console.log("========== 최신 일정/보고 현황 화면 갱신 완료 ==========", {
      현재선택날짜: formatScheduleDateKey(selectedScheduleDate),
    });
  } catch (error) {
    console.error("출강 일정 조회 오류:", error);

    hideLoading();

    // 캐시가 이미 화면에 표시되어 있었다면
    // 캐시 화면은 그대로 유지

    const cachedSchedules = getReportScheduleCache(data.instructorNo);

    if (cachedSchedules && Array.isArray(cachedSchedules.schedules)) {
      console.error("서버 최신화 실패. 캐시된 일정 화면을 유지합니다.");

      return;
    }

    showError("출강 일정을 불러오는 중 오류가 발생했습니다.");
  }
}
// ========================================
// 강사 정보
// ========================================

function loadInstructorInfo(data) {
  // 1. 강사 이름 처리
  const name = data.instructorName || "";

  const displayNameEl = document.getElementById("displayName");
  if (displayNameEl) {
    // displayNameEl.textContent = name || "-";
    displayNameEl.innerHTML = `안녕하세요, <b>${name || "-"}</b>님`;
  }

  // 2. 강사 번호 처리 (세션 데이터에서 즉시 반영)
  const instructorNoEl = document.getElementById("instructorNo");
  if (instructorNoEl) {
    instructorNoEl.textContent = data.instructorNo || "-";
  }

  // 3. 역할 처리
  const roleElement = document.getElementById("instructorRole");
  if (roleElement) {
    roleElement.textContent = normalizeRole(data.role) || "-";
  }
}

// ========================================
// 오늘 일정 렌더링
// ========================================

function renderScheduleList(schedules, role) {
  const emptyMessage = document.getElementById("scheduleEmptyMessage");

  const tableWrap = document.getElementById("scheduleTableWrap");

  const cardWrap = document.getElementById("scheduleCardWrap");

  const desktopArea = document.getElementById("desktopStartReportArea");

  currentReportSchedules = Array.isArray(schedules) ? schedules : [];

  // ============================================================
  // 일정 없음
  // ============================================================

  if (!schedules.length) {
    if (emptyMessage) {
      emptyMessage.style.display = "block";
    }

    if (tableWrap) {
      tableWrap.style.display = "none";
    }

    if (cardWrap) {
      cardWrap.style.display = "none";
    }

    if (desktopArea) {
      desktopArea.style.display = "none";
      desktopArea.innerHTML = "";
    }

    return;
  }

  // ============================================================
  // 일정 있음
  // ============================================================

  if (emptyMessage) {
    emptyMessage.style.display = "none";
  }

  // ------------------------------------------------------------
  // 중요:
  // 이전에 "일정 없음" 상태에서 tableWrap 내부가
  // empty-schedule-message로 교체되었을 수 있으므로
  // PC 테이블 구조가 없으면 다시 복원한다.
  // ------------------------------------------------------------

  if (tableWrap && !document.getElementById("scheduleTableBody")) {
    tableWrap.innerHTML = `
      <table class="schedule-table">
        <thead>
          <tr>
            <th>시설명</th>
            <th>주소</th>
            <th>시간</th>
            <th>차시</th>
            <th>대상</th>
            <th>보고</th>
          </tr>
        </thead>

        <tbody id="scheduleTableBody"></tbody>
      </table>
    `;
  }

  if (tableWrap) {
    tableWrap.style.display = "";
  }

  if (cardWrap) {
    cardWrap.style.display = "";
  }

  // ============================================================
  // PC
  // ============================================================

  renderDesktopTable(schedules, role);

  // ============================================================
  // 모바일
  // ============================================================

  renderMobileCards(schedules, role);
}

// ========================================
// 만족도 조사 표시
// ========================================

function getSatisfactionBadgeHtml(satisfaction) {
  const value = String(satisfaction || "").trim();

  if (value === "QR") {
    return `
      <span class="satisfaction-badge satisfaction-qr">
        📝만족도 진행
      </span>
    `;
  }

  if (value === "QR+출강부") {
    return `
      <span class="satisfaction-badge satisfaction-qr-book">
        🚨만족도 진행 및 출강부 회수
      </span>
    `;
  }

  return "";
}

// ========================================
// PC 일정 렌더링
// ========================================

function renderDesktopTable(schedules, role) {
  const tbody = document.getElementById("scheduleTableBody");

  console.log("[PC 일정 렌더링]", {
    tbody: !!tbody,

    scheduleCount: Array.isArray(schedules) ? schedules.length : 0,

    schedules: schedules,

    role: role,
  });

  if (!tbody) {
    console.error(
      "[PC 일정 렌더링 실패] #scheduleTableBody를 찾을 수 없습니다.",
    );

    return;
  }

  tbody.innerHTML = "";

  if (!Array.isArray(schedules) || schedules.length === 0) {
    return;
  }

  schedules.forEach((schedule, index) => {
    const tr = document.createElement("tr");

    tr.dataset.schedulePageId = String(schedule.pageId || "");

    const satisfactionBadge = getSatisfactionBadgeHtml(schedule.satisfaction);

    // --------------------------------------------------------
    // 반드시 개별 일정의 role 우선
    // --------------------------------------------------------

    const scheduleRole = normalizeRole(schedule.role || role || "");

    // --------------------------------------------------------
    // 종료보고 제출기한 경고
    //
    // 수업일이 오늘보다 이전이고
    // 종료보고가 아직 제출되지 않은 경우
    // --------------------------------------------------------

    const scheduleDate = parseDateValue(schedule.date);

    const today = new Date();

    today.setHours(0, 0, 0, 0);

    let showDeadlineWarning = false;

    if (scheduleDate) {
      scheduleDate.setHours(0, 0, 0, 0);

      const endReportSubmitted =
        schedule.myReport && schedule.myReport.end === true;

      showDeadlineWarning = scheduleDate < today && !endReportSubmitted;
    }

    tr.innerHTML = `

        <td>

          <div class="desktop-facility-info">

            ${satisfactionBadge}

            <strong class="desktop-facility-name">

              ${escapeHtml(schedule.facilityName || "-")}

            </strong>

          </div>

        </td>


        <td>

          ${escapeHtml(schedule.address || "-")}

        </td>


        <td>

          ${escapeHtml(schedule.time || "-")}

        </td>


        <td>

          ${escapeHtml(schedule.hours || "-")}

        </td>


        <td>

          ${escapeHtml(schedule.target || "-")}

        </td>


        <td>

          <div class="report-buttons">

            ${
              scheduleRole === "주강사"
                ? createReportButton("end", schedule, schedule.myReport?.end)
                : ""
            }


            ${
              scheduleRole === "보조강사"
                ? renderAssistantStartReport(schedule, index, "desktop")
                : ""
            }


            ${
              scheduleRole === "보조강사"
                ? createReportButton("end", schedule, schedule.myReport?.end)
                : ""
            }

          </div>


          ${
            showDeadlineWarning
              ? `
                <div class="end-report-deadline-warning">
                  *종료보고 제출 기한 엄수바랍니다.
                </div>
              `
              : ""
          }

        </td>

      `;

    tbody.appendChild(tr);
  });

  renderDesktopStartReportArea();
}

// ========================================
// 모바일 카드
// ========================================

function renderMobileCards(schedules, role) {
  const wrap = document.getElementById("scheduleCardWrap");

  if (!wrap) {
    return;
  }

  wrap.innerHTML = "";

  schedules.forEach((schedule, index) => {
    const card = document.createElement("div");

    card.className = "schedule-card";

    const satisfactionBadge = getSatisfactionBadgeHtml(schedule.satisfaction);

    const scheduleRole = normalizeRole(schedule.role || role || "");

    // --------------------------------------------------------
    // 종료보고 제출기한 경고
    // --------------------------------------------------------

    const scheduleDate = parseDateValue(schedule.date);

    const today = new Date();

    today.setHours(0, 0, 0, 0);

    let showDeadlineWarning = false;

    if (scheduleDate) {
      scheduleDate.setHours(0, 0, 0, 0);

      const endReportSubmitted =
        schedule.myReport && schedule.myReport.end === true;

      showDeadlineWarning = scheduleDate < today && !endReportSubmitted;
    }

    card.innerHTML = `

        <div class="card-top satisfaction-badge">

          ${satisfactionBadge}

        </div>


        <div class="card-title">

          ${escapeHtml(schedule.schedule || "-")}

        </div>


        <div class="card-info">

          <div class="info-row">

            <span class="info-label">
              주소
            </span>

            <span class="info-value">

              ${escapeHtml(schedule.address || "-")}

            </span>

          </div>


          <div class="info-row">

            <span class="info-label">
              시간
            </span>

            <span class="info-value">

              ${escapeHtml(schedule.time || "-")}

            </span>

          </div>


          <div class="info-row">

            <span class="info-label">
              차시
            </span>

            <span class="info-value">

              ${escapeHtml(schedule.hours || "-")}

            </span>

          </div>


          <div class="info-row">

            <span class="info-label">
              대상
            </span>

            <span class="info-value">

              ${escapeHtml(schedule.target || "-")}

            </span>

          </div>

        </div>


        <div class="card-actions">

          <div class="action-section">

            <div class="report-buttons">

              ${
                scheduleRole === "주강사"
                  ? createReportButton("end", schedule, schedule.myReport?.end)
                  : ""
              }


              ${
                scheduleRole === "보조강사"
                  ? renderAssistantStartReport(schedule, index, "mobile")
                  : ""
              }


              ${
                scheduleRole === "보조강사"
                  ? createReportButton("end", schedule, schedule.myReport?.end)
                  : ""
              }

            </div>


            ${
              showDeadlineWarning
                ? `
                  <div class="end-report-deadline-warning">
                    *종료보고 제출 기한 엄수바랍니다.
                  </div>
                `
                : ""
            }


            ${
              scheduleRole === "보조강사"
                ? renderAssistantStartForm(index, "mobile")
                : ""
            }

          </div>

        </div>

      `;

    wrap.appendChild(card);
  });
}

// ========================================
// PC 시작보고 사진 업로드 영역
// ========================================

function renderDesktopStartReportArea() {
  let area = document.getElementById("desktopStartReportArea");

  if (!area) {
    area = document.createElement("div");
    area.id = "desktopStartReportArea";
    area.style.display = "none";

    const tableWrap = document.getElementById("scheduleTableWrap");
    if (tableWrap && tableWrap.parentNode) {
      tableWrap.parentNode.insertBefore(area, tableWrap.nextSibling);
    }
  }
}

// ========================================
// 보조강사 시작보고 완료 여부
// ========================================

function isStartReportCompleted(schedule) {
  const value = schedule?.myReport?.start;
  return (
    value === true ||
    value === "true" ||
    value === "완료" ||
    value === "시작보고 완료"
  );
}

// ========================================
// 보조강사 시작보고 영역
// ========================================

function renderAssistantStartReport(schedule, index, device) {
  const completed = isStartReportCompleted(schedule);

  if (completed) {
    return `
      <div class="assistant-start-report">
        <button type="button" class="report-btn completed" disabled>
          시작보고 완료
        </button>
      </div>
    `;
  }

  return `
    <div class="assistant-start-report">
      <button
        type="button"
        id="assistantStartOpen_${device}_${index}"
        class="report-btn disabled"
        onclick="toggleAssistantStartReport(${index}, '${device}')"
      >
        시작보고
      </button>
    </div>
  `;
}

// ========================================
// 보조강사 시작보고 입력폼 (PC/모바일 통합)
// ========================================
function renderAssistantStartForm(index, device = "mobile") {
  const isDesktop = device === "desktop";
  const photoInputId = isDesktop
    ? `desktopStartPhoto_${index}`
    : `assistantStartPhoto_mobile_${index}`;
  const previewId = isDesktop
    ? `desktopStartPreview_${index}`
    : `assistantStartPreview_mobile_${index}`;
  const previewImageId = isDesktop
    ? `desktopStartPreviewImage_${index}`
    : `assistantStartPreviewImage_mobile_${index}`;
  const submitBtnId = isDesktop
    ? `desktopStartSubmit_${index}`
    : `assistantStartSubmit_mobile_${index}`;
  const formId = isDesktop
    ? `assistantStartForm_desktop_${index}`
    : `assistantStartForm_mobile_${index}`;

  return `
    <div
      id="${formId}"
      class="assistant-start-report assistant-start-form ${device}"
    >
      <!-- 클래스명을 start-photo-input-wrap으로 통일 -->
      <div class="start-photo-input-wrap">
        <input
          type="file"
          id="${photoInputId}"
          class="start-photo-input"
          accept="image/*,.heic,.heif"
          onchange="handleStartPhotoSelect(${index}, '${device}', this)"
        />
      </div>

      <div
        id="${previewId}"
        class="start-photo-preview"
        style="display:none;"
      >
        <img
          id="${previewImageId}"
          src=""
          alt="시작 사진 미리보기"
        />
      </div>
      
      <button
        type="button"
        id="${submitBtnId}"
        class="report-btn"
        disabled
        onclick="submitAssistantStartReport(${index}, '${device}')"
      >
        시작보고 제출
      </button>
    </div>
  `;
}

// ========================================
// 모든 시작/종료 보고 폼 닫기 헬퍼 함수
// ========================================

function closeAllEndReports() {
  const endReportIds = [
    "desktopAssistantEndReportArea",
    "assistantEndReportArea",
    "mainTeacherEndReportArea",
    "desktopMainTeacherEndReportRow",
  ];

  endReportIds.forEach((id) => {
    const el = document.getElementById(id);
    if (el) el.remove();
  });

  window.currentAssistantEndReportSchedule = null;
  window.currentMainTeacherEndReportSchedule = null;
}

function closeAllStartReports() {
  const existingStartRow = document.getElementById("desktopStartReportRow");
  if (existingStartRow) {
    existingStartRow.remove();
  }

  const mobileStartForms = document.querySelectorAll(".assistant-start-form");
  mobileStartForms.forEach((form) => {
    if (form.classList.contains("desktop")) return;
    form.style.display = "none";
    const photoInput = form.querySelector(".start-photo-input");
    const preview = form.querySelector(".start-photo-preview");
    const previewImage = form.querySelector("img");
    const submitBtn = form.querySelector("button[type='button']");

    if (photoInput) photoInput.value = "";
    if (previewImage) previewImage.src = "";
    if (preview) preview.style.display = "none";
    if (submitBtn) submitBtn.disabled = true;
  });
}

// ========================================
// 보조강사 시작보고 입력창 열기 / 닫기
// ========================================

function toggleAssistantStartReport(index, device) {
  if (device === "desktop") {
    closeAllEndReports();

    const existingStartRow = document.getElementById("desktopStartReportRow");
    if (existingStartRow) {
      const isSameIndex =
        existingStartRow.getAttribute("data-index") === String(index);
      existingStartRow.remove();
      if (isSameIndex) return;
    }

    const btn = document.getElementById(`assistantStartOpen_desktop_${index}`);
    if (!btn) return;
    const targetTr = btn.closest("tr");
    if (!targetTr) return;

    const newTr = document.createElement("tr");
    newTr.id = "desktopStartReportRow";
    newTr.setAttribute("data-index", index);

    newTr.innerHTML = `
      <td colspan="6" class="report-form-td">
        ${renderAssistantStartForm(index, "desktop")}
      </td>
    `;

    targetTr.after(newTr);
    return;
  }

  closeAllEndReports();

  const form = document.getElementById(`assistantStartForm_mobile_${index}`);
  if (!form) return;

  const isOpen = form.style.display === "flex";
  closeAllStartReports();

  if (!isOpen) {
    form.style.display = "flex";
  }
}

// ========================================
// 보고 버튼 생성
// ========================================

function createReportButton(type, schedule, completed) {
  const label = type === "start" ? "시작보고" : "종료보고";

  if (completed) {
    return `
      <button type="button" class="report-btn completed" disabled>
        ${label} 완료
      </button>
    `;
  }

  if (!schedule) {
    return "";
  }

  const scheduleData = encodeURIComponent(JSON.stringify(schedule));

  return `
    <button
      type="button"
      class="report-btn"
      onclick="openReport('${type}', '${scheduleData}')"
    >
      ${label}
    </button>
  `;
}

// ========================================
// 보고서 열기
// ========================================

function openReport(type, encodedSchedule) {
  let schedule;

  try {
    schedule = JSON.parse(decodeURIComponent(encodedSchedule));
  } catch (error) {
    console.error("일정 데이터 파싱 오류:", error);
    alert("일정 정보를 불러오지 못했습니다.");
    return;
  }

  if (!schedule) {
    alert("출강 일정 정보를 찾을 수 없습니다.");
    return;
  }

  // 현재 일정에 저장된 역할을 우선 사용
  let role = normalizeRole(
    schedule.role || schedule.teacherRole || schedule.instructorRole || "",
  );

  // 현재 일정에 역할이 없는 경우에만 강사정보 사용
  if (!role) {
    try {
      const storedData = sessionStorage.getItem("instructorData");

      if (storedData) {
        const instructorData = JSON.parse(storedData);
        role = normalizeRole(instructorData.role);
      }
    } catch (error) {
      console.error("강사 역할 정보 확인 오류:", error);
    }
  }

  if (!role) {
    role = normalizeRole(
      document.getElementById("instructorRole")?.textContent,
    );
  }

  console.log("[보고 열기]", {
    type: type,
    schedule: schedule,
    scheduleRole: schedule.role,
    teacherRole: schedule.teacherRole,
    instructorRole: schedule.instructorRole,
    최종역할: role,
  });

  // 주강사 종료보고
  if (type === "end" && role === "주강사") {
    openMainTeacherEndReport(schedule);
    return;
  }

  // 보조강사 시작보고
  if (type === "start" && role === "보조강사") {
    openAssistantStartReport(schedule);
    return;
  }

  // 보조강사 종료보고
  if (type === "end" && role === "보조강사") {
    openAssistantEndReport(schedule);
    return;
  }

  console.error("[보고 종류 확인 실패]", {
    type: type,
    role: role,
    schedule: schedule,
  });

  alert("현재 일정의 강사 역할을 확인할 수 없습니다.");
}
// ========================================
// 주강사 종료보고 열기 / 닫기
// ========================================

function openMainTeacherEndReport(schedule) {
  if (!schedule) {
    alert("출강 일정 정보를 찾을 수 없습니다.");
    return;
  }

  const index = currentReportSchedules.findIndex(
    (item) => String(item.pageId || "") === String(schedule.pageId || ""),
  );

  if (index < 0) {
    alert("출강 일정 정보를 찾을 수 없습니다.");
    return;
  }

  const isMobile = window.innerWidth <= 768;
  const existingMobileArea = document.getElementById(
    "mainTeacherEndReportArea",
  );
  const existingDesktopArea = document.getElementById(
    "desktopMainTeacherEndReportRow",
  );

  if (isMobile && existingMobileArea) {
    existingMobileArea.remove();
    return;
  }
  if (!isMobile && existingDesktopArea) {
    existingDesktopArea.remove();
    return;
  }

  closeAllStartReports();
  closeAllEndReports();

  if (isMobile) {
    const cards = document.querySelectorAll(".schedule-card");
    const card = cards[index];

    if (!card) {
      alert("출강 일정 카드를 찾을 수 없습니다.");
      return;
    }

    const actionSection = card.querySelector(".action-section");
    if (!actionSection) {
      alert("출강 일정의 보고 영역을 찾을 수 없습니다.");
      return;
    }

    const area = document.createElement("div");
    area.id = "mainTeacherEndReportArea";
    area.className = "main-teacher-end-report-area";
    area.innerHTML = renderMainTeacherEndReportForm(index, "mobile");

    actionSection.appendChild(area);

    setTimeout(() => {
      area.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 50);

    return;
  }

  const btn = document.getElementById(`mainTeacherEndOpen_desktop_${index}`);

  let targetTr = null;

  if (btn) {
    targetTr = btn.closest("tr");
  }

  // 버튼 ID가 없는 경우 pageId로 해당 행 찾기
  if (!targetTr) {
    const tbody = document.getElementById("scheduleTableBody");

    if (tbody) {
      const rows = tbody.querySelectorAll("tr");

      rows.forEach((row) => {
        if (targetTr) return;

        if (
          String(row.dataset.schedulePageId || "") ===
          String(schedule.pageId || "")
        ) {
          targetTr = row;
        }
      });
    }
  }

  if (!targetTr) {
    alert("출강 일정 행을 찾을 수 없습니다.");
    return;
  }

  const newTr = document.createElement("tr");

  newTr.id = "desktopMainTeacherEndReportRow";
  newTr.setAttribute("data-index", String(index));

  newTr.innerHTML = `
  <td colspan="7" class="report-form-td">
    <div class="desktop-end-report-wrapper">
      ${renderMainTeacherEndReportForm(index, "desktop")}
    </div>
  </td>
`;

  targetTr.after(newTr);

  setTimeout(() => {
    newTr.scrollIntoView({
      behavior: "smooth",
      block: "nearest",
    });
  }, 50);
}

// ========================================
// 주강사 종료보고 입력폼
// ========================================

function renderMainTeacherEndReportForm(index, device) {
  const schedule = currentReportSchedules[index];
  if (!schedule) return "";

  const prefix = `mainTeacherEnd_${device}_${index}`;
  const hoursText = String(schedule.hours || "").trim();

  let sessionCount = 1;
  if (
    hoursText.includes("3차시") ||
    hoursText === "3" ||
    hoursText.includes("3시간")
  ) {
    sessionCount = 3;
  } else if (
    hoursText.includes("2차시") ||
    hoursText === "2" ||
    hoursText.includes("2시간")
  ) {
    sessionCount = 2;
  }

  let attendanceFields = "";
  for (let i = 1; i <= sessionCount; i++) {
    attendanceFields += `
      <div class="main-teacher-end-report-field">
        <label for="${prefix}_attendance${i}">${i}차시 출석</label>
        <input
          type="number"
          id="${prefix}_attendance${i}"
          min="0"
          max="12"
          inputmode="numeric"
          placeholder="출석 인원"
        />
      </div>
    `;
  }

  return `
    <div class="main-teacher-end-report-form">
      ${attendanceFields}

      <div class="main-teacher-end-report-field">
        <label for="${prefix}_storage">출강부 보관</label>
        <textarea
          id="${prefix}_storage"
          rows="3"
          placeholder="출강부 보관 위치를 작성해주세요."
        ></textarea>
      </div>

      <div class="main-teacher-end-report-field">
        <label for="${prefix}_photo">출강부 위치</label>
        <div class="file-upload-area">
          <input
            type="file"
            id="${prefix}_photo"
            accept="image/*,.heic,.heif"
            onchange="handleSinglePhotoSelect('${prefix}_preview', '${prefix}_previewImage', this)"
          />
          <div
            id="${prefix}_preview"
            class="assistant-document-preview"
            style="display:none;"
          >
            <img
              id="${prefix}_previewImage"
              src=""
              alt="출강부 위치 사진 미리보기"
            />
          </div>
        </div>
      </div>

      <div class="main-teacher-end-report-field">
        <label for="${prefix}_otherNote">기타 특이사항</label>
        <textarea
          id="${prefix}_otherNote"
          rows="3"
          placeholder="기타 특이사항이 있으면 작성해주세요."
        ></textarea>
      </div>

      <div class="main-teacher-end-report-actions">
        <button
          type="button"
          id="${prefix}_submit"
          class="report-btn"
          onclick="submitMainTeacherEndReport(${index}, '${device}')"
        >
          종료보고 제출
        </button>
      </div>
    </div>
  `;
}

// ========================================
// 단일 파일 미리보기 (공용)
// ========================================

async function handleSinglePhotoSelect(
  previewContainerId,
  previewImageId,
  input,
) {
  const preview = document.getElementById(previewContainerId);
  const previewImage = document.getElementById(previewImageId);

  if (!input) {
    return;
  }

  // 이전 변환/미리보기 데이터 초기화
  input.__preparedFile = null;

  if (input.__previewObjectUrl) {
    try {
      URL.revokeObjectURL(input.__previewObjectUrl);
    } catch (error) {
      console.warn("기존 미리보기 URL 해제 실패:", error);
    }

    input.__previewObjectUrl = null;
  }

  if (!input.files || input.files.length === 0) {
    if (previewImage) {
      previewImage.src = "";
    }

    if (preview) {
      preview.style.display = "none";
    }

    return;
  }

  const originalFile = input.files[0];

  if (!preview || !previewImage) {
    return;
  }

  if (!isImageFile(originalFile) && !isPdfFile(originalFile)) {
    alert("이미지 파일 또는 PDF 파일만 첨부할 수 있습니다.");

    input.value = "";
    input.__preparedFile = null;

    previewImage.src = "";
    preview.style.display = "none";

    return;
  }

  try {
    // HEIC / HEIF면 실제 JPEG로 변환
    const preparedFile = await prepareUploadFile(originalFile);

    input.__preparedFile = preparedFile;

    // PDF는 기존처럼 미리보기 없음
    if (isPdfFile(preparedFile)) {
      previewImage.src = "";
      preview.style.display = "none";

      return;
    }

    if (!isImageFile(preparedFile)) {
      throw new Error("지원하지 않는 이미지 형식입니다.");
    }

    const objectUrl = URL.createObjectURL(preparedFile);

    input.__previewObjectUrl = objectUrl;

    previewImage.onload = function () {
      try {
        URL.revokeObjectURL(objectUrl);
      } catch (error) {
        console.warn("미리보기 URL 해제 실패:", error);
      }

      if (input.__previewObjectUrl === objectUrl) {
        input.__previewObjectUrl = null;
      }
    };

    previewImage.onerror = function () {
      try {
        URL.revokeObjectURL(objectUrl);
      } catch (error) {
        console.warn("미리보기 URL 해제 실패:", error);
      }

      if (input.__previewObjectUrl === objectUrl) {
        input.__previewObjectUrl = null;
      }

      input.__preparedFile = null;
      previewImage.src = "";
      preview.style.display = "none";

      alert(
        `"${originalFile.name}" 사진을 미리보기할 수 없습니다.\n\n사진을 다시 선택해주세요.`,
      );
    };

    previewImage.src = objectUrl;
    preview.style.display = "flex";
  } catch (error) {
    console.error("단일 파일 처리 오류:", error);

    input.value = "";
    input.__preparedFile = null;

    previewImage.src = "";
    preview.style.display = "none";

    alert(
      error.message || `"${originalFile.name}" 사진을 처리하지 못했습니다.`,
    );
  }
}

function handleMainTeacherPhotoSelect(index, device, input) {
  const prefix = `mainTeacherEnd_${device}_${index}`;
  handleSinglePhotoSelect(`${prefix}_preview`, `${prefix}_previewImage`, input);
}

// ========================================
// 주강사 종료보고 제출
// ========================================

async function submitMainTeacherEndReport(index, device) {
  try {
    const schedule = currentReportSchedules[index];
    if (!schedule) {
      alert("선택한 출강 일정 정보를 찾을 수 없습니다.");
      return;
    }

    const instructorData = JSON.parse(
      sessionStorage.getItem("instructorData") || "null",
    );
    if (!instructorData) {
      alert("강사 정보를 찾을 수 없습니다. 다시 로그인해주세요.");
      return;
    }

    const prefix = `mainTeacherEnd_${device}_${index}`;
    const hoursText = String(schedule.hours || "").trim();

    let sessionCount = 1;
    if (
      hoursText.includes("3차시") ||
      hoursText === "3" ||
      hoursText.includes("3시간")
    ) {
      sessionCount = 3;
    } else if (
      hoursText.includes("2차시") ||
      hoursText === "2" ||
      hoursText.includes("2시간")
    ) {
      sessionCount = 2;
    }

    const attendance1 =
      document.getElementById(`${prefix}_attendance1`)?.value.trim() || "";
    const attendance2 =
      document.getElementById(`${prefix}_attendance2`)?.value.trim() || "";
    const attendance3 =
      document.getElementById(`${prefix}_attendance3`)?.value.trim() || "";
    const storage =
      document.getElementById(`${prefix}_storage`)?.value.trim() || "";
    const otherNote =
      document.getElementById(`${prefix}_otherNote`)?.value.trim() || "";
    const photoInput = document.getElementById(`${prefix}_photo`);

    if (!attendance1) {
      alert("1차시 출석 인원을 입력해주세요.");
      return;
    }
    if (sessionCount >= 2 && !attendance2) {
      alert("2차시 출석 인원을 입력해주세요.");
      return;
    }
    if (sessionCount >= 3 && !attendance3) {
      alert("3차시 출석 인원을 입력해주세요.");
      return;
    }

    if (
      Number(attendance1) > 12 ||
      (sessionCount >= 2 && Number(attendance2) > 12) ||
      (sessionCount >= 3 && Number(attendance3) > 12)
    ) {
      alert("출석 인원은 차시당 최대 12명까지 입력할 수 있습니다.");
      return;
    }

    if (!storage) {
      alert("출강부 보관 위치를 작성해주세요.");
      return;
    }

    if (!photoInput || !photoInput.files || photoInput.files.length === 0) {
      alert("출강부 위치 사진을 첨부해주세요.");
      return;
    }

    const originalFile = photoInput.files[0];

    if (reportSubmitLoading) {
      return;
    }

    showReportSubmitLoading("주강사 종료보고를 제출하고 있습니다.");

    const base64Start = performance.now();

    const file =
      photoInput.__preparedFile || (await prepareUploadFile(originalFile));

    const base64 = await fileToBase64(file);

    console.log(
      "주강사 종료보고 사진 변환 완료:",
      Math.round(performance.now() - base64Start) + "ms",
      "파일:",
      file.name,
      "크기:",
      Math.round(file.size / 1024) + "KB",
      "base64:",
      base64.length,
    );

    const payload = {
      action: "saveMainTeacherEndReport",
      instructorNo: instructorData.instructorNo || "",
      pageId: schedule.pageId || "",
      attendance1: attendance1,
      attendance2: sessionCount >= 2 ? attendance2 : "",
      attendance3: sessionCount >= 3 ? attendance3 : "",
      storage: storage,
      otherNote: otherNote,
      photoData: base64,
      photoName: file.name,
    };

    const submitButton = document.getElementById(`${prefix}_submit`);
    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "제출 중...";
    }

    console.log("========== 주강사 종료보고 서버 요청 시작 ==========");
    console.log("서버 요청:", {
      instructorNo: payload.instructorNo,
      pageId: payload.pageId,
      hasPhotoData: !!payload.photoData,
      photoSize: payload.photoData ? payload.photoData.length : 0,
    });

    const requestStart = performance.now();
    const response = await fetch(API_URL, {
      method: "POST",
      headers: { "Content-Type": "text/plain;charset=utf-8" },
      body: JSON.stringify(payload),
    });
    console.log(
      "========== 주강사 종료보고 서버 응답 도착 ==========",
      Math.round(performance.now() - requestStart) + "ms",
      "HTTP:",
      response.status,
    );

    const result = await response.json();
    console.log("========== 주강사 종료보고 서버 결과 ==========", {
      success: result.success,
      message: result.message,
      timing: result.timing || null,
    });

    if (!result.success) {
      if (result.alreadySubmitted) {
        hideReportSubmitLoading();

        alert(result.message);
        schedule.myReport = schedule.myReport || {};
        schedule.myReport.end = true;
        renderScheduleList(
          currentReportSchedules,
          normalizeRole(instructorData.role),
        );
        return;
      }

      hideReportSubmitLoading();

      alert(result.message || "종료보고 제출에 실패했습니다.");

      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = "종료보고 제출";
      }
      return;
    }

    schedule.myReport = schedule.myReport || {};
    schedule.myReport.end = true;

    hideReportSubmitLoading();

    alert(result.message || "주강사 종료보고가 제출되었습니다.");

    sessionStorage.removeItem(REPORT_SCHEDULE_CACHE_KEY);

    window.currentMainTeacherEndReportSchedule = null;
    renderScheduleList(
      currentReportSchedules,
      normalizeRole(instructorData.role),
    );
  } catch (error) {
    hideReportSubmitLoading();

    console.error("주강사 종료보고 제출 오류:", error);
    alert("종료보고 제출 중 오류가 발생했습니다.\n\n" + error.message);
  }
}

// ========================================
// 시작보고 사진 선택
// ========================================

async function handleStartPhotoSelect(index, device, input) {
  const submitId =
    device === "desktop"
      ? `desktopStartSubmit_${index}`
      : `assistantStartSubmit_mobile_${index}`;

  const previewId =
    device === "desktop"
      ? `desktopStartPreview_${index}`
      : `assistantStartPreview_mobile_${index}`;

  const previewImageId =
    device === "desktop"
      ? `desktopStartPreviewImage_${index}`
      : `assistantStartPreviewImage_mobile_${index}`;

  const submitButton = document.getElementById(submitId);
  const preview = document.getElementById(previewId);
  const previewImage = document.getElementById(previewImageId);

  if (!submitButton || !preview || !previewImage || !input) {
    return;
  }

  input.__preparedFile = null;

  if (input.__previewObjectUrl) {
    try {
      URL.revokeObjectURL(input.__previewObjectUrl);
    } catch (error) {
      console.warn("기존 시작보고 미리보기 URL 해제 실패:", error);
    }

    input.__previewObjectUrl = null;
  }

  if (!input.files || input.files.length === 0) {
    previewImage.src = "";
    preview.style.display = "none";
    submitButton.disabled = true;
    return;
  }

  const originalFile = input.files[0];

  if (!isImageFile(originalFile)) {
    alert("이미지 파일만 선택할 수 있습니다.");

    input.value = "";
    input.__preparedFile = null;

    previewImage.src = "";
    preview.style.display = "none";
    submitButton.disabled = true;

    return;
  }

  submitButton.disabled = true;
  preview.style.display = "none";

  try {
    const preparedFile = await prepareUploadFile(originalFile);

    if (!isImageFile(preparedFile)) {
      throw new Error("이미지 파일로 변환되지 않았습니다.");
    }

    input.__preparedFile = preparedFile;

    const objectUrl = URL.createObjectURL(preparedFile);

    input.__previewObjectUrl = objectUrl;

    previewImage.onload = function () {
      try {
        URL.revokeObjectURL(objectUrl);
      } catch (error) {
        console.warn("시작보고 미리보기 URL 해제 실패:", error);
      }

      if (input.__previewObjectUrl === objectUrl) {
        input.__previewObjectUrl = null;
      }
    };

    previewImage.onerror = function () {
      try {
        URL.revokeObjectURL(objectUrl);
      } catch (error) {
        console.warn("시작보고 미리보기 URL 해제 실패:", error);
      }

      input.__previewObjectUrl = null;
      input.__preparedFile = null;

      previewImage.src = "";
      preview.style.display = "none";
      submitButton.disabled = true;

      alert(
        `"${originalFile.name}" 사진을 미리보기할 수 없습니다.\n\n사진을 다시 선택해주세요.`,
      );
    };

    previewImage.src = objectUrl;
    preview.style.display = "flex";

    submitButton.disabled = false;
  } catch (error) {
    console.error("시작보고 사진 처리 오류:", error);

    input.value = "";
    input.__preparedFile = null;

    previewImage.src = "";
    preview.style.display = "none";
    submitButton.disabled = true;

    alert(
      error.message || `"${originalFile.name}" 사진을 처리하지 못했습니다.`,
    );
  }
}

// ==========================================================
// 보조강사 시작보고 제출
// ==========================================================
async function submitAssistantStartReport(index, device) {
  const totalStart = performance.now();

  console.log("========== 보조강사 시작보고 제출 시작 ==========");

  const schedule = currentReportSchedules[index];

  if (!schedule) {
    alert("일정 정보를 찾을 수 없습니다.");
    return;
  }

  const storedData = sessionStorage.getItem("instructorData");

  if (!storedData) {
    alert("강사 정보를 찾을 수 없습니다. 다시 조회해주세요.");
    return;
  }

  let instructorData;

  try {
    instructorData = JSON.parse(storedData);
  } catch (error) {
    alert("강사 정보를 불러오지 못했습니다.");
    return;
  }

  const photoInputId =
    device === "desktop"
      ? `desktopStartPhoto_${index}`
      : `assistantStartPhoto_mobile_${index}`;

  const submitButtonId =
    device === "desktop"
      ? `desktopStartSubmit_${index}`
      : `assistantStartSubmit_mobile_${index}`;

  const photoInput = document.getElementById(photoInputId);
  const submitButton = document.getElementById(submitButtonId);

  if (!photoInput || !photoInput.files || photoInput.files.length === 0) {
    alert("출강 사진을 선택해주세요.");
    return;
  }

  const originalFile = photoInput.files[0];

  if (!isImageFile(originalFile)) {
    alert("이미지 파일만 선택할 수 있습니다.");
    return;
  }

  // 이미 다른 보고서를 제출 중이면 중복 제출 방지
  if (reportSubmitLoading) {
    return;
  }

  showReportSubmitLoading("보조강사 시작보고를 제출하고 있습니다.");

  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = "제출 중...";
  }

  try {
    // HEIC/HEIF는 선택 단계에서 이미 변환되었으면
    // 변환된 파일을 사용하고,
    // 아직 변환되지 않았다면 여기서 한 번만 변환
    const file =
      photoInput.__preparedFile || (await prepareUploadFile(originalFile));

    // ==========================================================
    // 1. 사진 용량 축소 + Base64 변환
    // ==========================================================

    const compressStart = performance.now();

    const compressedPhoto = await compressImageFile(file);

    console.log(
      "[시간측정] 시작보고 사진 압축:",
      Math.round(performance.now() - compressStart) + "ms",
    );

    // ==========================================================
    // 2. 서버 요청
    // ==========================================================

    const requestStart = performance.now();

    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "saveAssistantStartReport",

        instructorName: instructorData.instructorName || "",

        instructorNo:
          instructorData.instructorNo || schedule.instructorNo || "",

        pageId: schedule.pageId || "",

        date: schedule.date || "",

        endDate: schedule.endDate || "",

        facilityName: schedule.facilityName || "",

        address: schedule.address || "",

        schedule: schedule.schedule || "",

        time: schedule.time || "",

        target: schedule.target || "",

        hours: schedule.hours || "",

        role: "보조강사",

        startPhoto: compressedPhoto.base64,

        photoName: compressedPhoto.fileName,

        photoType: compressedPhoto.fileType,
      }),
    });

    const requestElapsed = performance.now() - requestStart;

    console.log(
      "========== 보조강사 시작보고 서버 응답 ==========",
      Math.round(requestElapsed) + "ms",
      "HTTP:",
      response.status,
    );

    // ==========================================================
    // 3. 응답 JSON
    // ==========================================================

    const jsonStart = performance.now();

    const result = await response.json();

    const jsonElapsed = performance.now() - jsonStart;

    console.log(
      "[시간측정] 시작보고 응답 JSON 파싱:",
      Math.round(jsonElapsed) + "ms",
    );

    // ==========================================================
    // 4. 서버 결과 확인
    // ==========================================================

    console.log("========== 보조강사 시작보고 서버 결과 ==========", {
      success: result.success,
      message: result.message,
      timing: result.timing,
    });

    // ==========================================================
    // 5. HTTP 오류 확인
    // ==========================================================

    if (!response.ok) {
      throw new Error(
        "서버 오류 (" +
          response.status +
          "): " +
          (result.message || "서버에서 오류가 발생했습니다."),
      );
    }

    // ==========================================================
    // 6. 서버 작업 실패
    // ==========================================================

    if (!result.success) {
      throw new Error(result.message || "시작보고 제출에 실패했습니다.");
    }

    // ==========================================================
    // 제출 성공 → 로딩 종료
    // ==========================================================

    hideReportSubmitLoading();

    // ==========================================================
    // 7. 화면 상태 업데이트
    // ==========================================================

    schedule.myReport = schedule.myReport || {};

    schedule.myReport.start = true;

    const role = normalizeRole(instructorData.role);

    renderDesktopTable(currentReportSchedules, role);

    renderMobileCards(currentReportSchedules, role);

    // ==========================================================
    // 8. 전체 시간
    // ==========================================================

    const totalElapsed = performance.now() - totalStart;

    console.log(
      "========== 보조강사 시작보고 제출 완료 ==========",
      Math.round(totalElapsed) + "ms",
    );
  } catch (error) {
    // 오류 발생 시 로딩 종료
    hideReportSubmitLoading();

    const errorElapsed = performance.now() - totalStart;

    console.error("보조강사 시작보고 제출 오류:", error);

    console.log(
      "[시간측정] 시작보고 오류 발생 시점까지:",
      Math.round(errorElapsed) + "ms",
    );

    alert(error.message || "시작보고 제출에 실패했습니다.");

    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = "시작보고 제출";
    }
  }
}

// ========================================
// 날짜 표시
// ========================================

function formatDate(value) {
  if (!value) return "-";
  const date = parseDateValue(value);
  if (!date) return String(value);

  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];

  return `${year}.${month}.${day}(${weekdays[date.getDay()]})`;
}

function parseDateValue(value) {
  if (!value) return null;
  const match = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (match) {
    const date = new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3]),
    );
    if (!isNaN(date.getTime())) return date;
  }
  const date = new Date(value);
  return isNaN(date.getTime()) ? null : date;
}

function isSameDate(value, targetDate) {
  const date = parseDateValue(value);
  if (!date) return false;
  return (
    date.getFullYear() === targetDate.getFullYear() &&
    date.getMonth() === targetDate.getMonth() &&
    date.getDate() === targetDate.getDate()
  );
}

function normalizeRole(role) {
  if (!role) return "";
  const value = String(role).trim();
  if (value === "주강사" || value === "주") return "주강사";
  if (value === "보조강사" || value === "보조") return "보조강사";
  return value;
}

function showLoading() {
  const loading = document.getElementById("loadingMessage");
  if (loading) loading.style.display = "block";
}

function hideLoading() {
  const loading = document.getElementById("loadingMessage");
  if (loading) loading.style.display = "none";
}

function showError(message) {
  hideLoading();
  const errorBox = document.getElementById("errorMessage");
  if (!errorBox) return;
  errorBox.textContent = message;
  errorBox.style.display = "block";
}

function goBack() {
  window.location.href = "index.html";
}

function escapeHtml(value) {
  if (value === null || value === undefined) return "";
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
// ============================================================
// 이미지 파일 공통 처리
// HEIC / HEIF → 실제 JPEG 변환
// ============================================================

function isHeicCandidate(file) {
  if (!file) {
    return false;
  }

  const type = String(file.type || "")
    .toLowerCase()
    .split(";")[0]
    .trim();

  const name = String(file.name || "").toLowerCase();

  return (
    type === "image/heic" ||
    type === "image/heif" ||
    type === "image/heic-sequence" ||
    type === "image/heif-sequence" ||
    /\.heic$/i.test(name) ||
    /\.heif$/i.test(name)
  );
}

function isImageFile(file) {
  if (!file) {
    return false;
  }

  const type = String(file.type || "")
    .toLowerCase()
    .split(";")[0]
    .trim();

  const name = String(file.name || "");

  return (
    type.startsWith("image/") ||
    /\.(jpg|jpeg|png|gif|webp|heic|heif)$/i.test(name)
  );
}

function isPdfFile(file) {
  if (!file) {
    return false;
  }

  const type = String(file.type || "")
    .toLowerCase()
    .split(";")[0]
    .trim();

  const name = String(file.name || "");

  return type === "application/pdf" || /\.pdf$/i.test(name);
}

function makeJpegFileName(originalName) {
  const name = String(originalName || "image");

  const baseName = name.replace(/\.[^/.]+$/, "");

  return `${baseName}.jpg`;
}

async function convertHeicToJpeg(file) {
  if (!file) {
    throw new Error("변환할 이미지 파일이 없습니다.");
  }

  if (
    typeof window.HeicTo !== "function" ||
    typeof window.HeicTo.isHeic !== "function"
  ) {
    throw new Error(
      "HEIC 사진 변환 기능을 불러오지 못했습니다.\n\n페이지를 새로고침한 뒤 다시 시도해주세요.",
    );
  }

  let isHeic = false;

  try {
    isHeic = await window.HeicTo.isHeic(file);
  } catch (error) {
    console.error("HEIC 파일 확인 오류:", error);

    throw new Error(
      `"${file.name || "사진"}" 파일 형식을 확인하지 못했습니다.`,
    );
  }

  if (!isHeic) {
    return file;
  }

  console.log("[HEIC 변환 시작]", {
    name: file.name,
    type: file.type,
    size: file.size,
  });

  try {
    let jpegBlob = await window.HeicTo({
      blob: file,
      type: "image/jpeg",
      quality: 0.88,
    });

    // 라이브러리 버전에 따라 배열로 반환될 가능성 대응
    if (Array.isArray(jpegBlob)) {
      jpegBlob = jpegBlob[0];
    }

    if (!jpegBlob) {
      throw new Error("JPEG 변환 결과가 없습니다.");
    }

    const jpegFile = new File([jpegBlob], makeJpegFileName(file.name), {
      type: "image/jpeg",
      lastModified: file.lastModified || Date.now(),
    });

    // 원본 파일 정보 보존
    try {
      Object.defineProperties(jpegFile, {
        __originalName: {
          value: file.name,
          enumerable: false,
          configurable: true,
        },
        __originalSize: {
          value: file.size,
          enumerable: false,
          configurable: true,
        },
        __originalLastModified: {
          value: file.lastModified,
          enumerable: false,
          configurable: true,
        },
      });
    } catch (metaError) {
      console.warn("변환 파일 메타정보 추가 실패:", metaError);
    }

    console.log("[HEIC 변환 완료]", {
      originalName: file.name,
      convertedName: jpegFile.name,
      originalSize: file.size,
      convertedSize: jpegFile.size,
    });

    return jpegFile;
  } catch (error) {
    console.error("HEIC → JPEG 변환 오류:", error);

    throw new Error(
      `"${file.name || "사진"}" HEIC 사진을 JPEG로 변환하지 못했습니다.\n\n사진을 다시 선택해주세요.`,
    );
  }
}

async function prepareUploadFile(file) {
  if (!file) {
    throw new Error("업로드할 파일이 없습니다.");
  }

  // HEIC / HEIF인 경우 실제 JPEG 데이터로 변환
  if (isHeicCandidate(file)) {
    return await convertHeicToJpeg(file);
  }

  // 일반 JPG / PNG / WebP / PDF 등은 기존 파일 그대로 사용
  return file;
}

async function fileToBase64(file) {
  // 혹시 호출자가 원본 HEIC를 직접 넘긴 경우까지 방어
  const preparedFile = await prepareUploadFile(file);

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onload = () => {
      const result = String(reader.result || "");

      const commaIndex = result.indexOf(",");

      if (commaIndex === -1) {
        reject(new Error("사진 데이터를 읽을 수 없습니다."));
        return;
      }

      const base64 = result.substring(commaIndex + 1);

      if (!base64) {
        reject(new Error("사진 데이터가 비어 있습니다."));
        return;
      }

      resolve(base64);
    };

    reader.onerror = () => {
      reject(
        new Error(`"${preparedFile.name || "파일"}" 파일을 읽지 못했습니다.`),
      );
    };

    reader.onabort = () => {
      reject(
        new Error(
          `"${preparedFile.name || "파일"}" 파일 읽기가 중단되었습니다.`,
        ),
      );
    };

    reader.readAsDataURL(preparedFile);
  });
}

async function compressImageFile(file) {
  const preparedFile = await prepareUploadFile(file);

  if (!isImageFile(preparedFile)) {
    throw new Error(
      `"${preparedFile.name || "파일"}"은 이미지 파일이 아닙니다.`,
    );
  }

  return new Promise(function (resolve, reject) {
    const reader = new FileReader();

    reader.onload = function () {
      const img = new Image();

      img.onload = function () {
        try {
          const maxWidth = 1600;
          const maxHeight = 1600;

          let width = img.width;
          let height = img.height;

          if (!width || !height) {
            reject(
              new Error(
                `"${preparedFile.name || "사진"}" 이미지 크기를 확인할 수 없습니다.`,
              ),
            );
            return;
          }

          if (width > maxWidth || height > maxHeight) {
            const ratio = Math.min(maxWidth / width, maxHeight / height);

            width = Math.round(width * ratio);
            height = Math.round(height * ratio);
          }

          const canvas = document.createElement("canvas");

          canvas.width = width;
          canvas.height = height;

          const ctx = canvas.getContext("2d");

          if (!ctx) {
            reject(new Error("이미지 처리 공간을 만들 수 없습니다."));
            return;
          }

          ctx.drawImage(img, 0, 0, width, height);

          const dataUrl = canvas.toDataURL("image/jpeg", 0.8);

          if (!dataUrl || dataUrl === "data:,") {
            reject(
              new Error(
                `"${preparedFile.name || "사진"}" 이미지를 JPEG로 변환하지 못했습니다.`,
              ),
            );
            return;
          }

          const commaIndex = dataUrl.indexOf(",");

          if (commaIndex === -1) {
            reject(new Error("JPEG 이미지 데이터를 읽지 못했습니다."));
            return;
          }

          const base64 = dataUrl.substring(commaIndex + 1);

          const baseName = String(preparedFile.name || "image").replace(
            /\.[^/.]+$/,
            "",
          );

          resolve({
            base64: base64,
            fileName: baseName + ".jpg",
            fileType: "image/jpeg",
          });
        } catch (error) {
          console.error("이미지 압축 처리 오류:", error);

          reject(
            new Error(
              `"${preparedFile.name || "사진"}" 이미지를 처리하지 못했습니다.`,
            ),
          );
        }
      };

      img.onerror = function () {
        reject(
          new Error(
            `"${preparedFile.name || "사진"}" 이미지를 불러오지 못했습니다.`,
          ),
        );
      };

      img.src = reader.result;
    };

    reader.onerror = function () {
      reject(
        new Error(
          `"${preparedFile.name || "사진"}" 이미지 파일을 읽지 못했습니다.`,
        ),
      );
    };

    reader.onabort = function () {
      reject(
        new Error(
          `"${preparedFile.name || "사진"}" 이미지 읽기가 중단되었습니다.`,
        ),
      );
    };

    reader.readAsDataURL(preparedFile);
  });
}

// ========================================
// 보조강사 종료보고 열기 / 닫기
// ========================================

function openAssistantEndReport(schedule) {
  if (!schedule) {
    alert("출강 일정 정보를 찾을 수 없습니다.");
    return;
  }

  const index = currentReportSchedules.findIndex(
    (item) => String(item.pageId || "") === String(schedule.pageId || ""),
  );

  if (index < 0) {
    alert("출강 일정 정보를 찾을 수 없습니다.");
    return;
  }

  const isMobile = window.innerWidth <= 768;
  const existingMobileArea = document.getElementById("assistantEndReportArea");
  const existingDesktopArea = document.getElementById(
    "desktopAssistantEndReportArea",
  );

  if (isMobile && existingMobileArea) {
    existingMobileArea.remove();
    window.currentAssistantEndReportSchedule = null;
    return;
  }
  if (!isMobile && existingDesktopArea) {
    existingDesktopArea.remove();
    window.currentAssistantEndReportSchedule = null;
    return;
  }

  closeAllStartReports();
  closeAllEndReports();
  window.assistantAttendanceOver10Warning = false;

  if (isMobile) {
    const cards = document.querySelectorAll(".schedule-card");
    const card = cards[index];
    if (!card) return;

    const actionSection = card.querySelector(".action-section");
    if (!actionSection) return;

    const area = document.createElement("div");
    area.id = "assistantEndReportArea";
    area.className = "assistant-end-report-area";
    area.innerHTML = renderAssistantEndReportForm(index, "mobile");

    actionSection.appendChild(area);
    window.currentAssistantEndReportSchedule = schedule;

    setTimeout(() => {
      area.scrollIntoView({ behavior: "smooth", block: "nearest" });
    }, 50);
    return;
  }

  const tbody = document.getElementById("scheduleTableBody");
  if (!tbody) return;

  const targetPageId = String(schedule.pageId || "");
  const scheduleRows = tbody.querySelectorAll("tr[data-schedule-page-id]");
  let targetRow = null;

  scheduleRows.forEach((row) => {
    if (String(row.dataset.schedulePageId || "") === targetPageId) {
      targetRow = row;
    }
  });

  if (!targetRow) return;

  const reportRow = document.createElement("tr");
  reportRow.id = "desktopAssistantEndReportArea";

  const reportCell = document.createElement("td");
  reportCell.colSpan = targetRow.children.length;
  reportCell.className = "desktop-assistant-end-report-cell";

  reportCell.innerHTML = `
    <div class="desktop-end-report-wrapper">
      ${renderAssistantEndReportForm(index, "desktop")}
    </div>
  `;

  reportRow.appendChild(reportCell);
  targetRow.parentNode.insertBefore(reportRow, targetRow.nextSibling);

  window.currentAssistantEndReportSchedule = schedule;

  setTimeout(() => {
    reportRow.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }, 50);
}

// ========================================
// 보조강사 종료보고 입력폼
// ========================================

function renderAssistantEndReportForm(index, device) {
  const schedule = currentReportSchedules[index];
  if (!schedule) return "";

  const prefix = `assistantEnd_${device}_${index}`;
  const sessionCount = getSessionCount(schedule);

  console.log("[보조강사 종료보고 차시 확인]", {
    pageId: schedule.pageId,
    facilityName: schedule.facilityName,
    hours: schedule.hours,
    sessionCount: sessionCount,
  });
  const targetText = String(schedule.target || "").trim();
  const targetParts = targetText.split(",").map((v) => String(v || "").trim());

  function getSessionTarget(session) {
    if (targetParts.length >= session) return targetParts[session - 1];
    return session === 1 ? targetText : "";
  }

  let sessionHtml = "";
  for (let session = 1; session <= sessionCount; session++) {
    const sessionTarget = getSessionTarget(session);
    const safeTarget = sessionTarget
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

    sessionHtml += `
      <div class="assistant-attendance-session">
        <div class="assistant-attendance-session-title">
          ${session}차시 <span>${safeTarget}</span>
        </div>

        <div class="assistant-attendance-input-row">
          <div class="assistant-attendance-input-group">
            <label for="${prefix}_attendance${session}">출석</label>
            <input
              type="number"
              id="${prefix}_attendance${session}"
              min="0"
              max="12"
              step="1"
              inputmode="numeric"
              pattern="[0-9]*"
              placeholder="0"
              oninput="updateAssistantAttendanceTotal('${device}', ${index}, ${session})"
            />
          </div>

          <div class="assistant-attendance-input-group">
            <label for="${prefix}_absence${session}">결석</label>
            <input
              type="number"
              id="${prefix}_absence${session}"
              min="0"
              max="12"
              step="1"
              inputmode="numeric"
              pattern="[0-9]*"
              placeholder="0"
              oninput="updateAssistantAttendanceTotal('${device}', ${index}, ${session})"
            />
          </div>

          <div class="assistant-attendance-input-group">
            <label>총원</label>
            <div id="${prefix}_total${session}" class="assistant-attendance-total">0명</div>
          </div>
        </div>
      </div>
    `;
  }

  return `
    <div class="main-teacher-end-report-form assistant-end-report-form">
      <div class="main-teacher-end-report-field assistant-attendance-field">
        <label>출결 현황</label>
        <div class="assistant-attendance-list">
          ${sessionHtml}
        </div>
        <div id="${prefix}_attendanceError" class="attendance-error" style="display:none;"></div>
      </div>

      <div class="main-teacher-end-report-field">
        <label>수업사진</label>
        <div class="file-upload-area">
          <input
  type="file"
  id="${prefix}_classPhotos"
  accept="image/*,.heic,.heif"
  multiple
  onchange="previewAssistantClassPhotos('${device}', ${index})"
/>
          <div id="${prefix}_classPhotosCount" class="assistant-file-count">
            ※ 수업사진은 최소 6장 이상 첨부해주세요.
          </div>
          <div
            id="${prefix}_classPhotosPreview"
            class="assistant-file-preview"
            style="display:none;"
          ></div>
        </div>
      </div>

      <div class="main-teacher-end-report-field">
        <label for="${prefix}_attendanceBook">출강부</label>
        <div class="file-upload-area">
          <input
            type="file"
            id="${prefix}_attendanceBook"
            accept="image/*,.heic,.heif,.pdf"
            onchange="handleSinglePhotoSelect('${prefix}_attendanceBookPreview', '${prefix}_attendanceBookPreviewImage', this)"
          />
          <div
            id="${prefix}_attendanceBookPreview"
            class="assistant-file-preview start-photo-preview"
            style="display:none;"
          >
            <img
              id="${prefix}_attendanceBookPreviewImage"
              src=""
              alt="출강부 미리보기"
            />
          </div>
        </div>
      </div>

      <div class="main-teacher-end-report-field">
        <label for="${prefix}_consent">사진 및 영상촬영 활용 동의서</label>
        <div class="file-upload-area">
          <input
            type="file"
            id="${prefix}_consent"
            accept="image/*,.heic,.heif,.pdf"
            onchange="handleSinglePhotoSelect('${prefix}_consentPreview', '${prefix}_consentPreviewImage', this)"
          />
          <div
            id="${prefix}_consentPreview"
            class="assistant-file-preview start-photo-preview"
            style="display:none;"
          >
            <img
              id="${prefix}_consentPreviewImage"
              src=""
              alt="사진 및 영상촬영 활용 동의서 미리보기"
            />
          </div>
        </div>
      </div>

      <div class="main-teacher-end-report-field">
        <label for="${prefix}_otherNote">기타 특이사항</label>
        <textarea
          id="${prefix}_otherNote"
          rows="3"
          placeholder="기타 특이사항이 있으면 작성해주세요."
        ></textarea>
      </div>

      <div class="main-teacher-end-report-field">
        <label for="${prefix}_reason">미첨부 사유</label>
        <textarea
          id="${prefix}_reason"
          rows="3"
          placeholder="사진을 올리지 못한 경우, 사유를 작성해주세요."
        ></textarea>
      </div>

      <div class="main-teacher-end-report-actions">
        <button
          type="button"
          id="${prefix}_submit"
          class="report-btn"
          onclick="submitAssistantEndReport(${index}, '${device}')"
        >
          종료보고 제출
        </button>
      </div>
    </div>
  `;
}

// ========================================
// 보조강사 출결 총원 자동 계산
// ========================================

function updateAssistantAttendanceTotal(device, index, session) {
  const prefix = `assistantEnd_${device}_${index}`;
  const attendanceInput = document.getElementById(
    `${prefix}_attendance${session}`,
  );
  const absenceInput = document.getElementById(`${prefix}_absence${session}`);
  const totalElement = document.getElementById(`${prefix}_total${session}`);

  if (!attendanceInput || !absenceInput || !totalElement) return;

  const attendance =
    attendanceInput.value === "" ? 0 : Number(attendanceInput.value);
  const absence = absenceInput.value === "" ? 0 : Number(absenceInput.value);

  if (!Number.isInteger(attendance) || !Number.isInteger(absence)) {
    totalElement.textContent = "0명";
    return;
  }

  const total = attendance + absence;

  if (total > 12) {
    totalElement.textContent = "12명 초과";
    if (!window.assistantAttendanceOver12Warning) {
      window.assistantAttendanceOver12Warning = true;
      alert(`${session}차시 출결 총원은 최대 12명까지 입력할 수 있습니다.`);
    }
    return;
  }

  totalElement.textContent = `${total}명`;
  window.assistantAttendanceOver12Warning = false;

  if (total > 10 && !window.assistantAttendanceOver10Warning) {
    window.assistantAttendanceOver10Warning = true;
    alert("총원이 10명을 초과했습니다.\n총원을 다시 확인해주세요.");
  }
}

// ============================================================
// 보조강사 종료보고 제출
// ============================================================
async function submitAssistantEndReport(index, device) {
  try {
    const schedule = currentReportSchedules[index];

    if (!schedule) {
      alert("선택한 출강 일정 정보를 찾을 수 없습니다.");
      return;
    }

    const storedData = sessionStorage.getItem("instructorData");

    if (!storedData) {
      alert("강사 정보를 찾을 수 없습니다. 다시 조회해주세요.");
      return;
    }

    let instructorData = JSON.parse(storedData);

    const prefix = `assistantEnd_${device}_${index}`;

    const sessionCount = getSessionCount(schedule);

    console.log("[보조강사 종료보고 제출 차시 확인]", {
      pageId: schedule.pageId,
      facilityName: schedule.facilityName,
      hours: schedule.hours,
      sessionCount: sessionCount,
    });

    // ============================================================
    // 출결
    // ============================================================

    const attendance1 =
      document.getElementById(`${prefix}_attendance1`)?.value.trim() || "";

    const absence1 =
      document.getElementById(`${prefix}_absence1`)?.value.trim() || "";

    const attendance2 =
      document.getElementById(`${prefix}_attendance2`)?.value.trim() || "";

    const absence2 =
      document.getElementById(`${prefix}_absence2`)?.value.trim() || "";

    const attendance3 =
      document.getElementById(`${prefix}_attendance3`)?.value.trim() || "";

    const absence3 =
      document.getElementById(`${prefix}_absence3`)?.value.trim() || "";

    function calculateTotal(session, attendance, absence) {
      if (attendance === "" || absence === "") {
        alert(`${session}차시 출석과 결석 인원을 모두 입력해주세요.`);
        return null;
      }

      const attNum = Number(attendance);

      const absNum = Number(absence);

      if (!Number.isInteger(attNum) || !Number.isInteger(absNum)) {
        alert(`${session}차시 출석과 결석 인원은 정수로 입력해주세요.`);
        return null;
      }

      if (attNum < 0 || absNum < 0) {
        alert(`${session}차시 출석과 결석 인원은 0명 이상이어야 합니다.`);
        return null;
      }

      if (attNum > 12 || absNum > 12) {
        alert(
          `${session}차시 출석/결석 인원은 각각 최대 12명까지 입력 가능합니다.`,
        );
        return null;
      }

      const total = attNum + absNum;

      if (total > 12) {
        alert(`${session}차시 출결 총원은 최대 12명까지 입력할 수 있습니다.`);
        return null;
      }

      return String(total);
    }

    const total1 = calculateTotal(1, attendance1, absence1);

    if (total1 === null) {
      return;
    }

    let total2 = "";

    if (sessionCount >= 2) {
      total2 = calculateTotal(2, attendance2, absence2);

      if (total2 === null) {
        return;
      }
    }

    let total3 = "";

    if (sessionCount >= 3) {
      total3 = calculateTotal(3, attendance3, absence3);

      if (total3 === null) {
        return;
      }
    }

    const otherNote =
      document.getElementById(`${prefix}_otherNote`)?.value.trim() || "";

    const reason =
      document.getElementById(`${prefix}_reason`)?.value.trim() || "";

    // ============================================================
    // 보조강사 종료보고 - 프로그램 사진
    // 누적 선택된 사진 전체 제출
    // ============================================================

    const photoKey = `${device}_${index}`;
    const classPhotoInput = document.getElementById(`${prefix}_classPhotos`);

    if (classPhotoInput?.__processingClassPhotos) {
      alert("사진 처리가 완료될 때까지 잠시 기다려주세요.");
      return;
    }

    const selectedPhotoFiles =
      window.assistantClassPhotoFiles?.[photoKey] || [];

    if (selectedPhotoFiles.length < 6) {
      alert(
        `수업사진은 최소 6장 이상 첨부해주세요.\n현재 ${selectedPhotoFiles.length}장입니다.`,
      );
      return;
    }

    // 이미 다른 보고서를 제출 중이면 중복 제출 방지
    if (reportSubmitLoading) {
      return;
    }

    // 이미지 파일 확인
    const invalidFile = selectedPhotoFiles.find((file) => !isImageFile(file));

    if (invalidFile) {
      alert(`"${invalidFile.name || "사진"}" 파일은 이미지 파일이 아닙니다.`);
      return;
    }

    // ============================================================
    // 전체 화면 제출 중 표시
    // ============================================================

    showReportSubmitLoading("보조강사 종료보고를 제출하고 있습니다.");

    // ============================================================
    // 프로그램 사진 압축
    // ============================================================

    const photoDataList = [];

    for (const file of selectedPhotoFiles) {
      const preparedFile = await prepareUploadFile(file);

      const compressedPhoto = await compressImageFile(preparedFile);

      photoDataList.push({
        data: compressedPhoto.base64,
        name: compressedPhoto.fileName,
        type: compressedPhoto.fileType,
      });
    }

    // ============================================================
    // 출강부
    // ============================================================

    const attendanceBookInput = document.getElementById(
      `${prefix}_attendanceBook`,
    );

    let attendanceBookData = "";
    let attendanceBookName = "";
    let attendanceBookType = "";

    if (
      attendanceBookInput &&
      attendanceBookInput.files &&
      attendanceBookInput.files.length > 0
    ) {
      const originalFile = attendanceBookInput.files[0];

      const file =
        attendanceBookInput.__preparedFile ||
        (await prepareUploadFile(originalFile));

      attendanceBookData = await fileToBase64(file);

      attendanceBookName = file.name;

      attendanceBookType = file.type;
    }

    // ============================================================
    // 촬영동의
    // ============================================================

    const consentInput = document.getElementById(`${prefix}_consent`);

    let consentData = "";
    let consentName = "";
    let consentType = "";

    if (consentInput && consentInput.files && consentInput.files.length > 0) {
      const originalFile = consentInput.files[0];

      const file =
        consentInput.__preparedFile || (await prepareUploadFile(originalFile));

      consentData = await fileToBase64(file);

      consentName = file.name;

      consentType = file.type;
    }

    // ============================================================
    // 제출 버튼
    // ============================================================

    const submitButton = document.getElementById(`${prefix}_submit`);

    if (submitButton) {
      submitButton.disabled = true;
      submitButton.textContent = "제출 중...";
    }

    // ============================================================
    // Payload
    // ============================================================

    const payload = {
      action: "saveAssistantEndReport",

      instructorName: instructorData.instructorName || "",

      instructorNo: instructorData.instructorNo || schedule.instructorNo || "",

      pageId: schedule.pageId || "",

      date: schedule.date || "",

      endDate: schedule.endDate,

      facilityName: schedule.facilityName || "",

      target1:
        document.getElementById(`${prefix}_target1`)?.value.trim() ||
        String(schedule.target || "")
          .split(",")[0]
          ?.trim() ||
        "",

      attendance1: attendance1,

      absence1: absence1,

      total1: total1,

      target2:
        document.getElementById(`${prefix}_target2`)?.value.trim() ||
        String(schedule.target || "")
          .split(",")[1]
          ?.trim() ||
        "",

      attendance2: sessionCount >= 2 ? attendance2 : "",

      absence2: sessionCount >= 2 ? absence2 : "",

      total2: sessionCount >= 2 ? total2 : "",

      target3:
        document.getElementById(`${prefix}_target3`)?.value.trim() ||
        String(schedule.target || "")
          .split(",")[2]
          ?.trim() ||
        "",

      attendance3: sessionCount >= 3 ? attendance3 : "",

      absence3: sessionCount >= 3 ? absence3 : "",

      total3: sessionCount >= 3 ? total3 : "",

      session2Progress: "",

      session3Progress: "",

      attendanceBookData: attendanceBookData,

      attendanceBookName: attendanceBookName,

      attendanceBookType: attendanceBookType,

      consentData: consentData,

      consentName: consentName,

      consentType: consentType,

      otherNote: otherNote,

      reason: reason,

      photoDataList: photoDataList,
    };

    // ============================================================
    // 서버 요청
    // ============================================================

    const serverStart = performance.now();

    console.log("========== 서버 요청 시작 ==========", {
      action: payload.action,

      instructorNo: payload.instructorNo || "",

      pageId: payload.pageId || "",
    });

    const response = await fetch(API_URL, {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify(payload),
    });

    const serverTime = Math.round(performance.now() - serverStart);

    console.log("========== 서버 응답 도착 ==========", {
      elapsedMs: serverTime,

      httpStatus: response.status,
    });

    if (!response.ok) {
      const errorText = await response.text();

      throw new Error("서버 오류 (" + response.status + "): " + errorText);
    }

    const result = await response.json();

    console.log("========== 보조강사 종료보고 서버 결과 ==========", {
      success: result.success,

      message: result.message,

      timing: result.timing || null,
    });

    if (result.timing) {
      console.table(result.timing);
    }

    // ============================================================
    // 서버 작업 실패
    // ============================================================

    if (!result.success) {
      hideReportSubmitLoading();

      alert(result.message || "보조강사 종료보고 제출에 실패했습니다.");

      if (submitButton) {
        submitButton.disabled = false;
        submitButton.textContent = "종료보고 제출";
      }

      return;
    }

    // ============================================================
    // 제출 성공
    // ============================================================

    hideReportSubmitLoading();

    const submittedPageId = String(schedule.pageId || "").trim();

    const targetSchedule = currentReportSchedules.find(
      (item) => String(item.pageId || "").trim() === submittedPageId,
    );

    if (targetSchedule) {
      targetSchedule.myReport = targetSchedule.myReport || {};

      targetSchedule.myReport.end = true;
    }

    window.currentAssistantEndReportSchedule = null;

    alert(result.message || "보조강사 종료보고가 제출되었습니다.");

    // ============================================================
    // 기존 보고서 폼 제거
    // ============================================================

    const mobileArea = document.getElementById("assistantEndReportArea");

    if (mobileArea) {
      mobileArea.remove();
    }

    const desktopArea = document.getElementById(
      "desktopAssistantEndReportArea",
    );

    if (desktopArea) {
      desktopArea.remove();
    }

    renderScheduleList(
      currentReportSchedules,
      normalizeRole(instructorData.role),
    );
  } catch (error) {
    // 오류 발생 시 로딩 종료
    hideReportSubmitLoading();

    console.error("보조강사 종료보고 제출 오류:", error);

    alert("종료보고 제출 중 오류가 발생했습니다.\n\n" + error.message);

    const prefix = `assistantEnd_${device}_${index}`;

    const submitButton = document.getElementById(`${prefix}_submit`);

    if (submitButton) {
      submitButton.disabled = false;
      submitButton.textContent = "종료보고 제출";
    }
  }
}

// ========================================
// 보조강사 종료보고 수업사진 미리보기
// ========================================

async function previewAssistantClassPhotos(device, index) {
  const prefix = `assistantEnd_${device}_${index}`;

  const input = document.getElementById(`${prefix}_classPhotos`);
  const preview = document.getElementById(`${prefix}_classPhotosPreview`);
  const count = document.getElementById(`${prefix}_classPhotosCount`);
  const submitButton = document.getElementById(`${prefix}_submit`);

  if (!input || !preview || !count) {
    return;
  }

  if (!input.files || input.files.length === 0) {
    return;
  }

  // 이미 사진 처리 중이면 중복 실행 방지
  if (input.__processingClassPhotos) {
    return;
  }

  const newFiles = Array.from(input.files);

  // ------------------------------------------------------
  // 파일 자체가 이미지인지 먼저 확인
  // ------------------------------------------------------
  const invalidFile = newFiles.find((file) => !isImageFile(file));

  if (invalidFile) {
    alert(
      `"${invalidFile.name || "사진"}" 파일은 이미지 파일만 첨부할 수 있습니다.`,
    );

    input.value = "";
    return;
  }

  // ------------------------------------------------------
  // 실제 제출용 사진 저장소
  // ------------------------------------------------------
  if (!window.assistantClassPhotoFiles) {
    window.assistantClassPhotoFiles = {};
  }

  const photoKey = `${device}_${index}`;

  if (!window.assistantClassPhotoFiles[photoKey]) {
    window.assistantClassPhotoFiles[photoKey] = [];
  }

  const files = window.assistantClassPhotoFiles[photoKey];

  // ------------------------------------------------------
  // 원본 파일 메타정보 저장
  // ------------------------------------------------------
  function saveOriginalMeta(preparedFile, originalFile) {
    try {
      if (!preparedFile.__originalName) {
        Object.defineProperties(preparedFile, {
          __originalName: {
            value: originalFile.name,
            enumerable: false,
            configurable: true,
          },
          __originalSize: {
            value: originalFile.size,
            enumerable: false,
            configurable: true,
          },
          __originalLastModified: {
            value: originalFile.lastModified,
            enumerable: false,
            configurable: true,
          },
        });
      }
    } catch (metaError) {
      console.warn("수업사진 원본 메타정보 저장 실패:", metaError);
    }

    return preparedFile;
  }

  // ------------------------------------------------------
  // 동일 파일 중복 확인
  // ------------------------------------------------------
  function isDuplicateFile(newFile) {
    return files.some((existingFile) => {
      const existingOriginalName =
        existingFile.__originalName || existingFile.name;

      const existingOriginalSize =
        existingFile.__originalSize ?? existingFile.size;

      const existingOriginalLastModified =
        existingFile.__originalLastModified ?? existingFile.lastModified;

      return (
        existingOriginalName === newFile.name &&
        existingOriginalSize === newFile.size &&
        existingOriginalLastModified === newFile.lastModified
      );
    });
  }

  // ------------------------------------------------------
  // 미리보기 전체 렌더링
  // ------------------------------------------------------
  function renderPreviews() {
    preview.innerHTML = "";

    if (files.length === 0) {
      preview.style.display = "none";
      return;
    }

    preview.style.display = "grid";

    files.forEach((file, fileIndex) => {
      const objectUrl = URL.createObjectURL(file);

      const wrapper = document.createElement("div");
      wrapper.className = "assistant-photo-preview-item";

      const img = document.createElement("img");

      img.src = objectUrl;
      img.alt = `수업사진 ${fileIndex + 1}`;
      img.loading = "lazy";

      img.onload = () => {
        try {
          URL.revokeObjectURL(objectUrl);
        } catch (error) {
          console.warn("수업사진 미리보기 URL 해제 실패:", error);
        }
      };

      img.onerror = () => {
        try {
          URL.revokeObjectURL(objectUrl);
        } catch (error) {
          console.warn("수업사진 미리보기 URL 해제 실패:", error);
        }
      };

      wrapper.appendChild(img);
      preview.appendChild(wrapper);
    });
  }

  // ------------------------------------------------------
  // 첨부 개수 표시
  // ------------------------------------------------------
  function updateCount(totalCount, pendingCount) {
    if (pendingCount > 0) {
      count.textContent =
        `※ 수업사진 ${totalCount}장 첨부됨 · ` +
        `사진 ${pendingCount}장 변환 중...`;
      return;
    }

    if (files.length >= 6) {
      count.textContent = `※ 수업사진 ${files.length}장 첨부됨`;
    } else {
      count.textContent = `※ 수업사진 ${files.length}장 첨부됨 (최소 6장 필요)`;
    }
  }

  // ------------------------------------------------------
  // 사진 처리 시작
  // ------------------------------------------------------
  input.__processingClassPhotos = true;

  // 파일 선택창도 처리 중에는 잠시 비활성화
  input.disabled = true;

  if (submitButton) {
    submitButton.disabled = true;
    submitButton.textContent = "사진 확인 중...";
  }

  // ------------------------------------------------------
  // 새 파일 분류
  // 일반 사진 → 즉시 추가
  // HEIC/HEIF → 별도 변환
  // ------------------------------------------------------
  const normalFiles = [];
  const heicFiles = [];

  for (const newFile of newFiles) {
    if (isDuplicateFile(newFile)) {
      continue;
    }

    if (isHeicCandidate(newFile)) {
      heicFiles.push(newFile);
    } else {
      normalFiles.push(newFile);
    }
  }

  try {
    // ======================================================
    // 1. 일반 사진은 변환 없이 즉시 추가
    // ======================================================
    normalFiles.forEach((newFile) => {
      const preparedFile = saveOriginalMeta(newFile, newFile);

      if (!isImageFile(preparedFile)) {
        throw new Error(
          `"${newFile.name || "사진"}" 파일을 이미지로 처리하지 못했습니다.`,
        );
      }

      files.push(preparedFile);
    });

    // 일반 사진은 여기서 바로 미리보기 표시
    renderPreviews();

    const totalSelectedCount = files.length + heicFiles.length;

    if (totalSelectedCount > 0) {
      updateCount(totalSelectedCount, heicFiles.length);
    }

    // ------------------------------------------------------
    // 중요:
    // 브라우저가 먼저 일반 사진 미리보기를 화면에 그리도록
    // 한 번 화면 갱신 기회를 준 뒤 HEIC 변환 시작
    // ------------------------------------------------------
    if (normalFiles.length > 0 && heicFiles.length > 0) {
      await new Promise((resolve) => {
        requestAnimationFrame(resolve);
      });
    }

    // ======================================================
    // 2. HEIC / HEIF만 변환
    // ======================================================
    const failedFiles = [];

    for (let i = 0; i < heicFiles.length; i++) {
      const newFile = heicFiles[i];

      updateCount(files.length + (heicFiles.length - i), heicFiles.length - i);

      try {
        const preparedFile = await prepareUploadFile(newFile);

        if (!isImageFile(preparedFile)) {
          throw new Error(
            `"${newFile.name || "사진"}" 파일을 이미지로 처리하지 못했습니다.`,
          );
        }

        saveOriginalMeta(preparedFile, newFile);

        files.push(preparedFile);

        // 변환된 사진이 완료될 때마다 미리보기에 반영
        renderPreviews();

        updateCount(
          files.length + (heicFiles.length - i - 1),
          heicFiles.length - i - 1,
        );

        // 다음 HEIC 변환 전에 브라우저 화면 갱신
        await new Promise((resolve) => {
          requestAnimationFrame(resolve);
        });
      } catch (error) {
        console.error(`HEIC/HEIF 사진 변환 실패: ${newFile.name}`, error);

        failedFiles.push(newFile.name || "사진");
      }
    }

    // ======================================================
    // 3. 최종 상태
    // ======================================================
    if (files.length === 0) {
      preview.style.display = "none";
      count.textContent = "※ 수업사진은 최소 6장 이상 첨부해주세요.";
    } else if (files.length >= 6) {
      count.textContent = `※ 수업사진 ${files.length}장 첨부됨`;
    } else {
      count.textContent = `※ 수업사진 ${files.length}장 첨부됨 (최소 6장 필요)`;
    }

    // ======================================================
    // 4. 변환 실패 사진이 있는 경우
    // 정상 처리된 사진은 그대로 유지
    // ======================================================
    if (failedFiles.length > 0) {
      alert(
        "일부 사진을 변환하지 못했습니다.\n\n" +
          failedFiles.map((name) => `- ${name}`).join("\n") +
          "\n\n해당 사진만 다시 선택해주세요.",
      );
    }

    // ======================================================
    // 5. 제출 버튼 상태
    // ======================================================
    if (submitButton) {
      submitButton.disabled = files.length < 6;
      submitButton.textContent = "종료보고 제출";
    }
  } catch (error) {
    console.error("보조강사 수업사진 처리 오류:", error);

    input.value = "";

    if (files.length > 0) {
      count.textContent =
        files.length >= 6
          ? `※ 수업사진 ${files.length}장 첨부됨`
          : `※ 수업사진 ${files.length}장 첨부됨 (최소 6장 필요)`;
    } else {
      count.textContent = "※ 수업사진은 최소 6장 이상 첨부해주세요.";
    }

    renderPreviews();

    alert(
      error.message ||
        "수업사진을 처리하지 못했습니다.\n\n사진을 다시 선택해주세요.",
    );

    if (submitButton) {
      submitButton.disabled = files.length < 6;
      submitButton.textContent = "종료보고 제출";
    }
  } finally {
    input.__processingClassPhotos = false;
    input.disabled = false;
  }
}
// ============================================================
// 날짜 네비게이션
// ============================================================

// 백엔드에서 받은 해당 주의 전체 일정
let allReportSchedules = [];

// 현재 선택된 날짜
let selectedScheduleDate = new Date();

// 현재 강사 역할
let currentScheduleRole = "";

// ============================================================
// 날짜 → YYYY-MM-DD
// ============================================================

function formatScheduleDateKey(date) {
  if (!(date instanceof Date)) {
    return "";
  }

  if (isNaN(date.getTime())) {
    return "";
  }

  const year = date.getFullYear();

  const month = String(date.getMonth() + 1).padStart(2, "0");

  const day = String(date.getDate()).padStart(2, "0");

  return `${year}-${month}-${day}`;
}

// ============================================================
// 날짜 네비게이션 화면 표시
// ============================================================

function updateDateDisplay() {
  const display = document.getElementById("dateNavDisplay");
  const rangeDisplay = document.getElementById("dateNavRange");

  if (!display) {
    return;
  }

  const year = selectedScheduleDate.getFullYear();
  const month = selectedScheduleDate.getMonth() + 1;
  const day = selectedScheduleDate.getDate();

  const weekdays = ["일", "월", "화", "수", "목", "금", "토"];
  const weekday = weekdays[selectedScheduleDate.getDay()];

  display.textContent = `${year}.${String(month).padStart(2, "0")}.${String(day).padStart(2, "0")} (${weekday})`;

  // ------------------------------------------------------------
  // 현재 선택된 날짜가 포함된 주의
  // "선택된 날짜 ~ 해당 주 일요일"까지 조회 가능
  // ------------------------------------------------------------
  if (rangeDisplay) {
    const current = new Date(selectedScheduleDate);
    current.setHours(0, 0, 0, 0);

    const dayOfWeek = current.getDay();

    // 해당 주의 일요일 계산
    const sunday = new Date(current);
    sunday.setDate(current.getDate() + ((7 - dayOfWeek) % 7));

    const currentMonth = current.getMonth() + 1;
    const currentDay = current.getDate();

    const sundayMonth = sunday.getMonth() + 1;
    const sundayDay = sunday.getDate();

    const currentWeekday = ["일", "월", "화", "수", "목", "금", "토"][
      dayOfWeek
    ];

    rangeDisplay.textContent = `${currentMonth}월 ${currentDay}일(${currentWeekday}) ~ ${sundayMonth}월 ${sundayDay}일(일)까지 조회 가능`;
  }
  updateDateArrowState();
}

// ============================================================
// 이전 / 다음 날짜
//
// HTML:
// onclick="moveDate(-1)"
// onclick="moveDate(1)"
//
// ※ 이번 주 월요일 ~ 일요일까지만 이동 가능
// ============================================================

function moveDate(offset) {
  const current = new Date(selectedScheduleDate);

  current.setHours(0, 0, 0, 0);

  // ----------------------------------------------------------
  // 오늘 날짜
  // ----------------------------------------------------------

  const today = new Date();

  today.setHours(0, 0, 0, 0);

  // ----------------------------------------------------------
  // 오늘이 포함된 주의 월요일
  // ----------------------------------------------------------

  const dayOfWeek = today.getDay();

  const monday = new Date(today);

  monday.setDate(today.getDate() + (dayOfWeek === 0 ? -6 : 1 - dayOfWeek));

  monday.setHours(0, 0, 0, 0);

  // ----------------------------------------------------------
  // 오늘이 포함된 주의 일요일
  // ----------------------------------------------------------

  const sunday = new Date(monday);

  sunday.setDate(monday.getDate() + 6);

  sunday.setHours(0, 0, 0, 0);

  // ----------------------------------------------------------
  // 이동할 날짜
  // ----------------------------------------------------------

  const targetDate = new Date(current);

  targetDate.setDate(current.getDate() + offset);

  targetDate.setHours(0, 0, 0, 0);

  // ----------------------------------------------------------
  // 이번 주 범위 밖이면 이동 차단
  // ----------------------------------------------------------

  if (targetDate < monday || targetDate > sunday) {
    return;
  }

  // ----------------------------------------------------------
  // 정상 이동
  // ----------------------------------------------------------

  selectedScheduleDate = targetDate;

  updateDateDisplay();

  updateDateArrowState();

  // ----------------------------------------------------------
  // 해당 날짜 일정 다시 표시
  // ----------------------------------------------------------

  renderFilteredSchedules();
}
// ============================================================
// 날짜 클릭 → 오늘
// HTML:
// onclick="resetToToday()"
// ============================================================

function resetToToday() {
  console.log("오늘 날짜로 이동");

  const today = new Date();

  today.setHours(0, 0, 0, 0);

  selectedScheduleDate = today;

  updateDateDisplay();

  // 오늘 날짜 일정 다시 렌더링
  renderFilteredSchedules();
}

// ============================================================
// 선택 날짜의 일정만 필터링
// ============================================================

function renderFilteredSchedules() {
  const targetKey = formatScheduleDateKey(selectedScheduleDate);

  const filteredSchedules = allReportSchedules.filter((schedule) => {
    const scheduleDate = parseDateValue(schedule.date);

    if (!scheduleDate) {
      return false;
    }

    return formatScheduleDateKey(scheduleDate) === targetKey;
  });

  console.log("날짜별 일정 렌더링:", {
    선택날짜: targetKey,
    전체일정: allReportSchedules.length,
    해당날짜: filteredSchedules.length,
  });

  // 현재 선택 날짜의 일정만 전역 일정으로 사용
  currentReportSchedules = filteredSchedules;

  // ------------------------------------------------------------
  // 날짜 이동 시 기존에 렌더링되어 있던 일정만 초기화
  // ※ PC 테이블 자체(innerHTML)는 절대 삭제하지 않음
  // ------------------------------------------------------------

  const tableWrap = document.getElementById("scheduleTableWrap");
  const tableBody = document.getElementById("scheduleTableBody");
  const cardWrap = document.getElementById("scheduleCardWrap");

  if (tableBody) {
    tableBody.innerHTML = "";
  }

  if (tableWrap) {
    tableWrap.style.display = "none";
  }

  if (cardWrap) {
    cardWrap.innerHTML = "";
    cardWrap.style.display = "none";
  }

  // ------------------------------------------------------------
  // 선택 날짜에 일정이 없으면
  // ------------------------------------------------------------

  if (filteredSchedules.length === 0) {
    // 기존 렌더링에서 생성된 추가 영역 제거
    const oldDesktopReport = document.getElementById(
      "desktopMainTeacherEndReportRow",
    );

    if (oldDesktopReport) {
      oldDesktopReport.remove();
    }

    const oldMobileReport = document.getElementById("mainTeacherEndReportArea");

    if (oldMobileReport) {
      oldMobileReport.remove();
    }

    /* PC 테이블 자체는 건드리지 않음 */

    /* 별도의 빈 일정 메시지를 사용 */

    const emptyMessage = document.getElementById("scheduleEmptyMessage");

    if (emptyMessage) {
      let weekday = "";

      const selectedDateKey = formatScheduleDateKey(selectedScheduleDate);

      if (selectedDateKey) {
        const parts = selectedDateKey.split("-");

        const year = Number(parts[0]);
        const month = Number(parts[1]);
        const day = Number(parts[2]);

        const selectedDate = new Date(year, month - 1, day);

        if (!isNaN(selectedDate.getTime())) {
          const weekdays = [
            "일요일",
            "월요일",
            "화요일",
            "수요일",
            "목요일",
            "금요일",
            "토요일",
          ];

          weekday = weekdays[selectedDate.getDay()];
        }
      }

      if (weekday) {
        emptyMessage.textContent = `${weekday} 출강 일정 없음`;
      } else {
        emptyMessage.textContent = "출강 일정 없음";
      }

      emptyMessage.style.display = "block";
    }

    if (cardWrap) {
      cardWrap.style.display = "none";
    }

    return;
  }

  // ------------------------------------------------------------
  // 일정이 있으면 빈 일정 메시지 숨김
  // ------------------------------------------------------------

  const emptyMessage = document.getElementById("scheduleEmptyMessage");

  if (emptyMessage) {
    emptyMessage.style.display = "none";
  }

  // ------------------------------------------------------------
  // 정상 일정 렌더링
  // ------------------------------------------------------------

  renderScheduleList(filteredSchedules, currentScheduleRole);
}
// ========================================
// 차시 수 추출
// ========================================

function getSessionCount(schedule) {
  if (!schedule) {
    return 1;
  }

  const rawValue = schedule.hours;

  if (rawValue === null || rawValue === undefined || rawValue === "") {
    console.warn("[차시 확인] schedule.hours 값이 비어있음:", schedule);
    return 1;
  }

  const text = String(rawValue).trim();

  // 숫자만 있는 경우
  const numericValue = Number(text);

  if (Number.isFinite(numericValue) && numericValue >= 1) {
    return Math.min(3, Math.max(1, Math.floor(numericValue)));
  }

  // 문자열 안의 숫자 추출
  const match = text.match(/(\d+(?:\.\d+)?)/);

  if (match) {
    const parsed = Number(match[1]);

    if (Number.isFinite(parsed) && parsed >= 1) {
      return Math.min(3, Math.max(1, Math.floor(parsed)));
    }
  }

  console.warn("[차시 해석 실패]", {
    hours: rawValue,
    text: text,
  });

  return 1;
}
let reportSubmitLoading = false;

// ============================================================
// 보고서 제출 공통 전체 화면 로딩
// ============================================================

function showReportSubmitLoading(message) {
  // 이미 표시 중이면 중복 실행하지 않음
  if (reportSubmitLoading) {
    return;
  }

  reportSubmitLoading = true;

  // 브라우저 이탈 경고 활성화
  window.__reportSubmitInProgress = true;

  // 기존 로딩 화면 제거
  const existing = document.getElementById("reportSubmitLoadingOverlay");

  if (existing) {
    existing.remove();
  }

  const overlay = document.createElement("div");

  overlay.id = "reportSubmitLoadingOverlay";

  overlay.innerHTML = `
    <div class="report-submit-loading-box">

      <div class="report-submit-loading-spinner"></div>

      <div class="report-submit-loading-title">
        ${message || "보고서를 제출하고 있습니다."}
      </div>

      <div class="report-submit-loading-warning">
        제출이 완료될 때까지<br>
        페이지를 새로고침하거나 이동하지 마세요.
      </div>

    </div>
  `;

  document.body.appendChild(overlay);

  // 화면 스크롤 방지
  document.body.style.overflow = "hidden";
}

// ------------------------------------------------------------
// 제출 로딩 화면 제거
// ------------------------------------------------------------

function hideReportSubmitLoading() {
  reportSubmitLoading = false;

  // 브라우저 이탈 경고 해제
  window.__reportSubmitInProgress = false;

  const overlay = document.getElementById("reportSubmitLoadingOverlay");

  if (overlay) {
    overlay.remove();
  }

  document.body.style.overflow = "";
}

// ------------------------------------------------------------
// 제출 중 페이지 이탈 경고
// ------------------------------------------------------------

window.addEventListener("beforeunload", function (event) {
  if (!window.__reportSubmitInProgress) {
    return;
  }

  event.preventDefault();

  // Chrome 등 일부 브라우저에서는
  // 사용자 지정 문구가 아닌 기본 경고문이 표시될 수 있음
  event.returnValue =
    "보고서 제출이 완료되지 않았습니다. 페이지를 나가시겠습니까?";
});

// ============================================================
// 날짜 이동 화살표 활성화 / 비활성화
// ============================================================

// ============================================================
// 날짜 이동 화살표 활성화 / 비활성화
// ============================================================

function updateDateArrowState() {
  const prevArrow = document.getElementById("prevDateArrow");

  const nextArrow = document.getElementById("nextDateArrow");

  if (!prevArrow && !nextArrow) {
    return;
  }

  // ----------------------------------------------------------
  // 현재 선택 날짜
  // ----------------------------------------------------------

  const current = new Date(selectedScheduleDate);

  if (isNaN(current.getTime())) {
    return;
  }

  current.setHours(0, 0, 0, 0);

  // ----------------------------------------------------------
  // 오늘이 포함된 주의 월요일
  // ----------------------------------------------------------

  const today = new Date();

  today.setHours(0, 0, 0, 0);

  const dayOfWeek = today.getDay();

  const monday = new Date(today);

  monday.setDate(today.getDate() + (dayOfWeek === 0 ? -6 : 1 - dayOfWeek));

  monday.setHours(0, 0, 0, 0);

  // ----------------------------------------------------------
  // 오늘이 포함된 주의 일요일
  // ----------------------------------------------------------

  const sunday = new Date(monday);

  sunday.setDate(monday.getDate() + 6);

  sunday.setHours(0, 0, 0, 0);

  // ----------------------------------------------------------
  // 이동 가능 여부
  // ----------------------------------------------------------

  const canGoPrevious = current > monday;

  const canGoNext = current < sunday;

  // ----------------------------------------------------------
  // 회색 비활성 표시
  // ----------------------------------------------------------

  if (prevArrow) {
    prevArrow.classList.toggle("disabled", !canGoPrevious);
  }

  if (nextArrow) {
    nextArrow.classList.toggle("disabled", !canGoNext);
  }
}

// ============================================================
// 종료보고 제출기한 경고 여부
// ============================================================

function shouldShowEndReportDeadlineWarning(schedule) {
  if (!schedule) {
    return false;
  }

  // 종료보고가 이미 완료된 경우
  if (schedule.endReport === true || schedule.endReport === "완료") {
    return false;
  }

  const scheduleDate = parseDateValue(schedule.date);

  if (!scheduleDate) {
    return false;
  }

  scheduleDate.setHours(0, 0, 0, 0);

  const today = new Date();

  today.setHours(0, 0, 0, 0);

  // 수업일이 오늘보다 이전이면
  // 종료보고 제출기한 경고
  return scheduleDate < today;
}
