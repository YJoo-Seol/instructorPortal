const API_URL = "https://instructor-api.seol7518.workers.dev/";

let instructorData = null;

/**
 * 강사번호로 강사 조회
 * 일정 유무와 관계없이 등록된 강사라면 조회 성공
 */

async function searchInstructor() {
  const input = document.getElementById("instructorNo");
  const button = document.getElementById("searchButton");
  const result = document.getElementById("result");
  const message = document.getElementById("message");

  const instructorNo = input.value.trim();

  result.classList.remove("show");
  message.className = "message";
  message.textContent = "";

  if (!instructorNo) {
    showMessage("강사번호를 입력해주세요.", "error");
    input.focus();
    return;
  }

  button.disabled = true;
  showInstructorLoading();

  // 서버 응답이 20초 이상 없으면 요청 중단
  const controller = new AbortController();
  const timeoutId = setTimeout(() => {
    controller.abort();
  }, 20000);

  try {
    const response = await fetch(API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        action: "searchInstructor",
        instructorNo: instructorNo,
      }),
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error("서버 응답 오류 (" + response.status + ")");
    }

    const data = await response.json();

    console.log("강사 조회 결과:", data);

    if (!data.success) {
      throw new Error(data.message || "등록된 강사 정보를 찾을 수 없습니다.");
    }

    instructorData = data;

    sessionStorage.setItem("instructorData", JSON.stringify(data));

    window.location.href = "schedule.html";
    return;
  } catch (error) {
    console.error("강사 조회 오류:", error);

    instructorData = null;
    sessionStorage.removeItem("instructorData");

    if (error.name === "AbortError") {
      showMessage(
        "서버 응답이 지연되고 있습니다. 잠시 후 다시 시도해주세요.",
        "error",
      );
    } else {
      showMessage(error.message || "강사 정보를 조회하지 못했습니다.", "error");
    }
  } finally {
    clearTimeout(timeoutId);

    // 요청 성공·실패·시간 초과와 관계없이 로딩창 제거
    hideInstructorLoading();

    // 혹시 남아 있는 오버레이도 제거
    const overlay = document.getElementById("instructorLoadingOverlay");

    if (overlay) {
      overlay.remove();
    }

    button.disabled = false;
    button.textContent = "조회";
  }
}

function goToConfirmation() {
  if (!instructorData) {
    showMessage("먼저 강사번호를 조회해주세요.", "error");
    return;
  }

  window.location.href = "confirmation.html";
}

/**
 * 출강 일정 페이지로 이동
 */
function goToSchedule() {
  if (!instructorData) {
    showMessage("먼저 강사번호를 조회해주세요.", "error");
    return;
  }

  window.location.href = "schedule.html";
}

/**
 * 메시지 표시
 */
function showMessage(text, type) {
  const message = document.getElementById("message");

  message.textContent = text;
  message.className = "message show " + type;
}

/**
 * Enter 키로 조회
 */
document
  .getElementById("instructorNo")
  .addEventListener("keydown", function (event) {
    if (event.key === "Enter") {
      searchInstructor();
    }
  });
// ========================================
// 강사 조회 로딩 UI
// 일정 화면과 동일한 디자인 사용
// ========================================

function showInstructorLoading(title = "강사 정보 조회 중...") {
  let overlay = document.getElementById("instructorLoadingOverlay");

  if (!overlay) {
    overlay = document.createElement("div");
    overlay.id = "instructorLoadingOverlay";
    overlay.className = "schedule-loading-overlay";

    overlay.innerHTML = `
      <div class="schedule-loading-box">
        <p class="schedule-loading-title" id="instructorLoadingTitle">
          ${title}
        </p>

        <p
          id="instructorLoadingSubtitle"
          class="schedule-loading-subtitle"
        >
          잠시만 기다려 주세요.
        </p>

        <div
          class="schedule-loading-bar"
          role="progressbar"
          aria-label="조회 중"
        ></div>
      </div>
    `;

    Object.assign(overlay.style, {
      position: "fixed",
      inset: "0",
      width: "100%",
      height: "100%",
      minHeight: "100%",
      boxSizing: "border-box",
      background: "#ffffff",
      zIndex: "9999",
    });

    document.body.appendChild(overlay);
  } else {
    const titleElement = overlay.querySelector("#instructorLoadingTitle");

    if (titleElement) {
      titleElement.textContent = title;
    }
  }

  overlay.classList.remove("hidden");
  overlay.setAttribute("aria-hidden", "false");
}
function hideInstructorLoading() {
  const overlay = document.getElementById("instructorLoadingOverlay");

  if (overlay) {
    overlay.classList.add("hidden");
    overlay.setAttribute("aria-hidden", "true");
  }
}
