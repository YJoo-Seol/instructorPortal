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

  // 이전 결과 초기화
  result.classList.remove("show");
  message.className = "message";
  message.textContent = "";

  if (!instructorNo) {
    showMessage("강사번호를 입력해주세요.", "error");
    input.focus();
    return;
  }

  button.disabled = true;
  button.textContent = "조회 중...";
  showMessage("강사 정보를 조회하고 있습니다.", "loading");

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
    });

    if (!response.ok) {
      throw new Error("서버 응답 오류 (" + response.status + ")");
    }

    const data = await response.json();

    console.log("강사 조회 결과:", data);

    /*
     * 중요
     * 강사 등록 여부와 출강 일정 존재 여부는 별도로 판단한다.
     *
     * success === false인 경우만
     * '강사 정보를 찾을 수 없습니다'로 처리한다.
     */
    if (!data.success) {
      throw new Error(data.message || "등록된 강사 정보를 찾을 수 없습니다.");
    }

    instructorData = data;
    sessionStorage.setItem("instructorData", JSON.stringify(data));

    // 강사번호 조회 성공 → 일정 페이지로 자동 이동
    window.location.href = "schedule.html";
    return;
  } catch (error) {
    console.error("강사 조회 오류:", error);

    instructorData = null;
    sessionStorage.removeItem("instructorData");

    showMessage(error.message || "강사 정보를 조회하지 못했습니다.", "error");
  } finally {
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
 * 강사확인서 페이지로 이동
 */
function goToConfirmation() {
  if (!instructorData) {
    showMessage("먼저 강사번호를 조회해주세요.", "error");
    return;
  }

  window.location.href = "confirmation.html";
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
