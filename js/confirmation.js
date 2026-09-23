const API_URL = "https://instructor-api.seol7518.workers.dev/";

let instructorData = null;
let currentMonth = "";
let canvas = null;
let ctx = null;
let drawing = false;
let confirmationPhone = "";

/* ============================================================
   페이지 시작
   ============================================================ */

document.addEventListener("DOMContentLoaded", function () {
  loadInstructorData();
});

/* ============================================================
   강사 포털에서 저장한 강사 정보 가져오기
   ============================================================ */

function loadInstructorData() {
  const stored = sessionStorage.getItem("instructorData");

  if (!stored) {
    showVerificationPrompt();
    return;
  }

  try {
    instructorData = JSON.parse(stored);
  } catch (error) {
    console.error("강사 정보 파싱 오류:", error);
    showVerificationPrompt();
    return;
  }

  const name = instructorData.instructorName || "";

  const role = instructorData.role || "";

  const instructorNo = instructorData.instructorNo || "";

  currentMonth = instructorData.month || "";

  // ----------------------------------------------------------
  // 상단 헤더
  // ----------------------------------------------------------

  const displayNameEls = document.querySelectorAll("#displayName");

  displayNameEls.forEach(function (element) {
    element.innerHTML = `안녕하세요, <b>${escapeHtml(name || "-")}</b>님`;
  });

  const instructorNoEl = document.getElementById("instructorNo");

  if (instructorNoEl) {
    instructorNoEl.textContent = instructorNo || "-";
  }

  // ----------------------------------------------------------
  // 기본 강사 정보
  // ----------------------------------------------------------

  const phoneElement = document.getElementById("displayPhone");

  if (phoneElement) {
    phoneElement.textContent = "-";
  }

  const roleElement = document.getElementById("displayRole");

  if (roleElement) {
    roleElement.textContent = normalizeRole(role) || "-";
  }

  const monthElement = document.getElementById("displayMonth");

  if (monthElement) {
    monthElement.textContent = currentMonth
      ? `${currentMonth}월 강사확인서`
      : "강사확인서";
  }

  // ----------------------------------------------------------
  // ★ 가장 먼저 제출 상태 확인
  // ----------------------------------------------------------

  checkConfirmationPreStatus();
}
async function checkConfirmationPreStatus() {
  if (!instructorData) {
    showVerificationPrompt();
    return;
  }

  const name = instructorData.instructorName || "";

  const instructorNo = instructorData.instructorNo || "";

  try {
    showMessage("강사확인서 상태를 확인하는 중입니다.", "loading");

    const response = await fetch(API_URL, {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        action: "searchInstructorData",

        name: name,

        phone: "",

        instructorNo: instructorNo,

        preCheck: true,
      }),
    });

    if (!response.ok) {
      throw new Error("서버 응답 오류 (" + response.status + ")");
    }

    const data = await response.json();

    console.log("강사확인서 사전 상태:", data);

    if (!data.success) {
      throw new Error(data.message || "강사확인서 상태를 확인할 수 없습니다.");
    }

    currentMonth = data.month || currentMonth;

    // ========================================
    // 제출 기간 종료
    // ========================================

    if (data.allowed === false && data.reason === "PERIOD_CLOSED") {
      hideConfirmationAreas();

      showMessage(
        data.message || "현재 강사확인서 제출 기간이 아닙니다.",
        "error",
      );

      return;
    }

    // ========================================
    // 이미 제출 완료
    // ========================================

    if (data.allowed === false && data.reason === "ALREADY_SUBMITTED") {
      hideConfirmationAreas();

      showMessage(
        data.message || "이번 달 강사확인서는 이미 제출이 완료되었습니다.",
        "error",
      );

      return;
    }

    // ========================================
    // 제출 가능
    // ========================================

    if (data.allowed === true) {
      proceedToPhoneVerification();

      return;
    }

    throw new Error("강사확인서 상태를 확인할 수 없습니다.");
  } catch (error) {
    console.error("강사확인서 사전 상태 확인 오류:", error);

    hideConfirmationAreas();

    showMessage(
      error.message || "강사확인서 상태를 확인하지 못했습니다.",
      "error",
    );
  }
}

function hideConfirmationAreas() {
  const verificationArea = document.getElementById("phoneVerificationArea");

  if (verificationArea) {
    verificationArea.style.display = "none";
  }

  const confirmationArea = document.getElementById("confirmationArea");

  if (confirmationArea) {
    confirmationArea.style.display = "none";
  }
}

function proceedToPhoneVerification() {
  if (!instructorData) {
    showVerificationPrompt();
    return;
  }

  const name = instructorData.instructorName || "";

  const instructorNo = instructorData.instructorNo || "";

  const phoneElement = document.getElementById("displayPhone");

  const cacheKey = "confirmationPhone_" + instructorNo;

  const cachedPhone = sessionStorage.getItem(cacheKey);

  // ----------------------------------------------------------
  // 이미 이번 세션에서 연락처 인증 완료
  // ----------------------------------------------------------

  if (cachedPhone) {
    confirmationPhone = cachedPhone;

    if (phoneElement) {
      phoneElement.textContent = instructorData.phone || "-";
    }

    const verificationArea = document.getElementById("phoneVerificationArea");

    if (verificationArea) {
      verificationArea.style.display = "none";
    }

    loadConfirmation(name, confirmationPhone).catch(function (error) {
      console.error("저장된 연락처로 강사확인서 조회 오류:", error);

      /*
       * 이미 제출된 상태에서 조회에 실패하더라도
       * 여기서 연락처 캐시를 바로 삭제하지 않음.
       *
       * 제출 상태 확인은 이미 앞 단계에서 끝났기 때문.
       */
    });

    return;
  }

  // ----------------------------------------------------------
  // 연락처 미인증 → 입력창 표시
  // ----------------------------------------------------------

  const verificationArea = document.getElementById("phoneVerificationArea");

  if (verificationArea) {
    verificationArea.style.display = "block";
  }

  showMessage("연락처 뒤 8자리를 입력해주세요.", "loading");

  const phoneInput = document.getElementById("confirmationPhoneInput");

  if (phoneInput) {
    phoneInput.value = "";

    phoneInput.focus();

    if (!phoneInput.dataset.enterBound) {
      phoneInput.addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
          event.preventDefault();

          verifyConfirmationPhone();
        }
      });

      phoneInput.dataset.enterBound = "true";
    }
  }
}
/* ============================================================
   연락처 본인확인
   ============================================================ */

async function verifyConfirmationPhone() {
  if (!instructorData) {
    showVerificationPrompt();
    return;
  }

  const input = document.getElementById("confirmationPhoneInput");

  const button = document.getElementById("phoneVerifyButton");

  if (!input) {
    return;
  }

  const phone = input.value.replace(/\D/g, "");

  if (!phone) {
    showMessage("연락처 뒤 8자리를 입력해주세요.", "error");
    input.focus();
    return;
  }

  if (phone.length !== 8) {
    showMessage("연락처 뒤 8자리를 정확하게 입력해주세요.", "error");
    input.focus();
    return;
  }

  if (button) {
    button.disabled = true;
    button.textContent = "확인 중...";
  }

  try {
    const name = instructorData.instructorName || "";

    /* --------------------------------------------------------
       기존 강사확인서 조회
       -------------------------------------------------------- */

    await loadConfirmation(name, phone);

    /* --------------------------------------------------------
       조회 성공했을 때만 연락처 저장
       -------------------------------------------------------- */

    confirmationPhone = phone;

    const instructorNo = instructorData.instructorNo || "";

    sessionStorage.setItem(
      "confirmationPhone_" + instructorNo,
      confirmationPhone,
    );

    const displayPhone = document.getElementById("displayPhone");

    if (displayPhone) {
      displayPhone.textContent = instructorData.phone || "-";
    }

    const verificationArea = document.getElementById("phoneVerificationArea");

    if (verificationArea) {
      verificationArea.style.display = "none";
    }
  } catch (error) {
    /*
     * loadConfirmation에서 이미 오류 메시지를 표시하므로
     * 여기서는 추가 처리만 하지 않음.
     */

    console.error("강사확인서 본인확인 오류:", error);
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "확인";
    }
  }
}

/* ============================================================
   세션 정보가 없을 때
   ============================================================ */

function showVerificationPrompt() {
  showMessage("본인인증 정보가 만료되었습니다. 다시 조회해주세요.", "error");

  setTimeout(function () {
    window.location.href = "index.html";
  }, 1500);
}

/* ============================================================
   역할 명칭 정규화
   ============================================================ */

function normalizeRole(role) {
  if (!role) return "";

  const value = String(role).trim();

  if (value === "주강사" || value === "주") {
    return "주강사";
  }

  if (value === "보조강사" || value === "보조") {
    return "보조강사";
  }

  return value;
}

/* ============================================================
   강사확인서 데이터 조회
   기존 searchInstructorData 사용
   ============================================================ */

async function loadConfirmation(name, phone) {
  showMessage("강사확인서를 불러오는 중입니다.", "loading");

  try {
    const response = await fetch(API_URL, {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        action: "searchInstructorData",
        name: name,
        phone: phone,
      }),
    });

    if (!response.ok) {
      throw new Error("서버 응답 오류 (" + response.status + ")");
    }

    const data = await response.json();

    console.log("강사확인서 조회 결과:", data);

    if (!data.success) {
      throw new Error(data.message || "강사확인서 정보를 불러오지 못했습니다.");
    }

    /*
     * searchInstructorData의 기존 응답 구조 그대로 사용
     */
    currentMonth = data.month || currentMonth;

    renderConfirmation(data);

    const confirmationArea = document.getElementById("confirmationArea");

    if (confirmationArea) {
      confirmationArea.style.display = "block";
    }

    hideMessage();

    initCanvas();

    return data;
  } catch (error) {
    console.error("강사확인서 조회 오류:", error);

    showMessage(error.message || "강사확인서를 불러오지 못했습니다.", "error");

    throw error;
  }
}

/* ============================================================
   기존 강사확인서 화면 출력
   ------------------------------------------------------------
   기존 코드의
   res.account
   res.summary
   res.mainData
   res.subData
   구조 그대로 사용
   ============================================================ */

function renderConfirmation(res) {
  const confirmationDocument = document.getElementById("confirmationDocument");

  if (!confirmationDocument) {
    throw new Error("강사확인서 영역을 찾을 수 없습니다.");
  }

  const name = res.name || instructorData.instructorName || "";

  const phone = res.phone || instructorData.phone || confirmationPhone || "";

  const role = res.role || instructorData.role || "";

  const summary = res.summary || {};

  const mainData = Array.isArray(res.mainData) ? res.mainData : [];

  const subData = Array.isArray(res.subData) ? res.subData : [];

  // ----------------------------------------------------------
  // 상단 강사정보
  // ----------------------------------------------------------

  const displayPhone = document.getElementById("displayPhone");

  if (displayPhone) {
    displayPhone.textContent = formatPhoneNumber(phone);
  }

  const displayRole = document.getElementById("displayRole");

  if (displayRole) {
    displayRole.textContent = normalizeRole(role);
  }

  const displayMonth = document.getElementById("displayMonth");

  if (displayMonth) {
    displayMonth.textContent = res.month
      ? `${res.month}월 강사확인서`
      : "강사확인서";
  }

  // ----------------------------------------------------------
  // 합계
  // ----------------------------------------------------------

  const mainHours = Number(summary.mainHours || 0);

  const mainPay = Number(summary.mainPay || 0);

  const subHours = Number(summary.subHours || 0);

  const subOtherPay = Number(summary.subOtherPay || 0);

  const subPay = Number(summary.subPay || 0);

  const grandTotal = Number(summary.grandTotal || 0);

  // ----------------------------------------------------------
  // 강사확인서 HTML
  // ----------------------------------------------------------

  let html = `
    <div class="sheet-box" id="confirmation-card">

      <div
        style="
          display: flex;
          justify-content: space-between;
          padding: 10px 15px;
          background: #f8fafc;
          border-radius: 8px;
          margin-bottom: 15px;
          border: 1px solid #e2e8f0;
          font-size: 14px;
          color: #334155;
        "
      >
        <div>
          <strong>강사명:</strong>
          <span id="pdf-instructor-name">
            ${escapeHtml(name || "-")}
          </span>
        </div>

        <div>
          <strong>연락처:</strong>
          <span id="pdf-instructor-phone">
            ${escapeHtml(formatPhoneNumber(phone) || "-")}
          </span>
        </div>
      </div>

      <div class="sheet-header">
        ${escapeHtml(res.month || currentMonth || "")}월 강사확인서
      </div>

      <div class="summary-card-container">

        <div class="summary-card">
          <div class="summary-label">
            입금계좌
          </div>

          <div class="summary-value">
            ${escapeHtml(res.account || "-")}
          </div>
        </div>

        <div class="summary-card total-card">
          <div class="summary-label">
            강사비 총계
          </div>

          <div class="summary-value">
            ${grandTotal.toLocaleString()} 원
          </div>
        </div>

      </div>

      <div
        class="total-card"
        style="
          text-align: right;
          font-size: 9px;
          color: #64748b;
          margin-top: -10px;
          margin-bottom: 15px;
          line-height: 1.3;
        "
      >
        ※ 위 금액은 세전 금액이며,
        원천징수세금(3.3%) 제외 후 지급됩니다.
      </div>

      <div class="section-title">
        1. 주강사
      </div>

      <table class="data-table">

        <colgroup>
          <col style="width: 28%;">
          <col style="width: 34%;">
          <col style="width: 14%;">
          <col style="width: 24%;">
        </colgroup>

        <tr>
          <th>일시</th>
          <th>일정</th>
          <th>차시</th>
          <th>일급</th>
        </tr>
  `;

  // ----------------------------------------------------------
  // 주강사
  // ----------------------------------------------------------

  if (mainData.length === 0) {
    html += `
      <tr>
        <td
          colspan="4"
        >
          배정된 주강사 일정이 없습니다.
        </td>
      </tr>
    `;
  } else {
    mainData.forEach(function (item) {
      html += `
        <tr>
    <td class="date-cell">
      <div class="cell-inner">${escapeHtml(item.colB || "")}</div>
    </td>

    <td>
      <div class="cell-inner">${escapeHtml(item.colC || "")}</div>
    </td>

    <td>
      <div class="cell-inner">${escapeHtml(item.colF || "")}</div>
    </td>

    <td>
      <div class="cell-inner">${Number(item.colG || 0).toLocaleString()}</div>
    </td>
  </tr>
      `;
    });

    html += `
      <tr
        style="
          background-color: #f3f4f6;
          font-weight: bold;
        "
      >
        <td colspan="2">
          <div class="cell-inner">합계</div>
        </td>

        <td>
          ${escapeHtml(String(mainHours))}
        </td>

        <td>
          ${mainPay.toLocaleString()} 원
        </td>
      </tr>
    `;
  }

  html += `
      </table>

      <div class="section-title">
        2. 보조강사 내역
      </div>

      <table class="data-table">

        <colgroup>
          <col style="width: 27%;">
          <col style="width: 31%;">
          <col style="width: 11%;">
          <col style="width: 13%;">
          <col style="width: 18%;">
        </colgroup>

        <tr>
          <th>일시</th>
          <th>일정</th>
          <th>차시</th>
          <th>기타시급</th>
          <th>보조 일급</th>
        </tr>
  `;

  // ----------------------------------------------------------
  // 보조강사
  // ----------------------------------------------------------

  if (subData.length === 0) {
    html += `
      <tr>
        <td
          colspan="5"
        >
          배정된 보조강사 일정이 없습니다.
        </td>
      </tr>
    `;
  } else {
    subData.forEach(function (item) {
      html += `
        <tr>
       <td class="date-cell">
        <div class="cell-inner">${escapeHtml(item.colB || "")}</div>
      </td>
      <td>
        <div class="cell-inner">${escapeHtml(item.colC || "")}</div>
      </td>
      <td>
        <div class="cell-inner">${escapeHtml(item.colH || "")}</div>
      </td>
      <td>
        <div class="cell-inner">${Number(item.colOther || 0).toLocaleString()}</div>
      </td>
      <td>
        <div class="cell-inner">${Number(item.colI || 0).toLocaleString()}</div>
      </td>
    </tr>
      `;
    });

    html += `
      <tr
        style="
          background-color: #f3f4f6;
          font-weight: bold;
        "
      >
        <td colspan="2">
          <div class="cell-inner">합계</div>
        </td>

        <td>
          ${escapeHtml(String(subHours))}
        </td>

        <td>
          ${subOtherPay.toLocaleString()}
        </td>

        <td>
          ${subPay.toLocaleString()} 원
        </td>
      </tr>
    `;
  }

  // ----------------------------------------------------------
  // 서명
  // ----------------------------------------------------------

  html += `
      </table>

      <div class="signature-area pdf-avoid-break">

        <div class="signature-title">
          본인은 위 내역을 최종 확인하였음을 서명합니다.
        </div>

        <div class="canvas-wrapper">
          <canvas
            id="sig-canvas"
            width="320"
            height="110"
          ></canvas>
        </div>

        <div style="margin-top: 6px;">
          <button
            type="button"
            class="btn-clear"
            onclick="clearCanvas()"
          >
            서명 초기화
          </button>
        </div>

      </div>

      <div
        class="pdf-avoid-break"
        style="
          text-align: center;
          margin-top: 20px;
          margin-bottom: 10px;
        "
      >
        <img
          src="https://lh3.googleusercontent.com/d/1X9wb2_e5g_gNzY_XRenSt5FU1o_08KQS"
          alt="회사 로고"
          style="
            width: 60%;
            max-width: 220px;
            height: auto;
            display: inline-block;
          "
        >
      </div>

    </div>
  `;

  // ----------------------------------------------------------
  // 확인서 본문 반영
  // ----------------------------------------------------------

  confirmationDocument.innerHTML = html;

  // ----------------------------------------------------------
  // 제출 버튼 상태
  // ----------------------------------------------------------

  const actionArea = document.getElementById("submit-action-area");

  if (actionArea) {
    if (res.alreadySubmitted) {
      actionArea.innerHTML = `
        <div
          style="
            display: flex;
            flex-direction: column;
            align-items: center;
            gap: 8px;
          "
        >
          <button
            type="button"
            class="btn-submit"
            onclick="downloadPDF()"
          >
            📄 PDF 저장
          </button>
        </div>
      `;
    } else {
      actionArea.innerHTML = `
        <button
          type="button"
          id="submitButton"
          class="btn-submit"
          onclick="submitSignature()"
        >
          서명 후 제출
        </button>
      `;
    }
  }
}

/* ============================================================
   Canvas 초기화
   ============================================================ */

function initCanvas() {
  canvas = document.getElementById("sig-canvas");

  if (!canvas) return;

  ctx = canvas.getContext("2d");

  ctx.strokeStyle = "#000000";
  ctx.lineWidth = 2;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  canvas.addEventListener("mousedown", startDrawing);

  canvas.addEventListener("mousemove", draw);

  canvas.addEventListener("mouseup", stopDrawing);

  canvas.addEventListener("mouseleave", stopDrawing);

  canvas.addEventListener("touchstart", startDrawing, { passive: false });

  canvas.addEventListener("touchmove", draw, { passive: false });

  canvas.addEventListener("touchend", stopDrawing, { passive: false });

  canvas.addEventListener("touchcancel", stopDrawing, { passive: false });
}

/* ============================================================
   서명 시작
   ============================================================ */

function startDrawing(event) {
  event.preventDefault();

  drawing = true;

  const point = getCanvasPoint(event);

  ctx.beginPath();

  ctx.moveTo(point.x, point.y);
}

/* ============================================================
   서명 그리기
   ============================================================ */

function draw(event) {
  if (!drawing) return;

  event.preventDefault();

  const point = getCanvasPoint(event);

  ctx.lineTo(point.x, point.y);

  ctx.stroke();
}

/* ============================================================
   서명 종료
   ============================================================ */

function stopDrawing(event) {
  if (event) {
    event.preventDefault();
  }

  drawing = false;

  if (ctx) {
    ctx.closePath();
  }
}

/* ============================================================
   Canvas 좌표 계산
   ============================================================ */

function getCanvasPoint(event) {
  const rect = canvas.getBoundingClientRect();

  let clientX;
  let clientY;

  if (event.touches && event.touches.length) {
    clientX = event.touches[0].clientX;

    clientY = event.touches[0].clientY;
  } else if (event.changedTouches && event.changedTouches.length) {
    clientX = event.changedTouches[0].clientX;

    clientY = event.changedTouches[0].clientY;
  } else {
    clientX = event.clientX;

    clientY = event.clientY;
  }

  return {
    x: (clientX - rect.left) * (canvas.width / rect.width),

    y: (clientY - rect.top) * (canvas.height / rect.height),
  };
}

/* ============================================================
   서명 지우기
   ============================================================ */

function clearCanvas() {
  if (!canvas || !ctx) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);

  drawing = false;
}

/* ============================================================
   Canvas 빈 상태 검사
   ============================================================ */

function isCanvasBlank(canvas) {
  const blank = document.createElement("canvas");

  blank.width = canvas.width;

  blank.height = canvas.height;

  return canvas.toDataURL() === blank.toDataURL();
}

/* ============================================================
   서명 제출
   기존 saveSignaturePDF 사용
   ============================================================ */

async function submitSignature() {
  if (!canvas) {
    alert("서명 영역을 불러오지 못했습니다.");

    return;
  }

  if (isCanvasBlank(canvas)) {
    alert("서명을 먼저 입력해주세요.");

    return;
  }

  const button = document.getElementById("submitButton");

  if (button) {
    if (button.disabled) {
      return;
    }

    button.disabled = true;

    button.textContent = "PDF 생성 중...";
  }

  try {
    /* --------------------------------------------------------
       강사 정보
       -------------------------------------------------------- */

    const name =
      instructorData && instructorData.instructorName
        ? instructorData.instructorName
        : "";

    let phone = confirmationPhone || "";

    if (!phone && instructorData && instructorData.instructorNo) {
      phone =
        sessionStorage.getItem(
          "confirmationPhone_" + instructorData.instructorNo,
        ) || "";
    }

    if (!name) {
      throw new Error("강사 정보를 확인할 수 없습니다.");
    }

    if (!phone) {
      throw new Error("연락처 본인확인이 필요합니다.");
    }

    const mVal = currentMonth || "";

    /* --------------------------------------------------------
       PDF 안의 강사명 / 연락처
       -------------------------------------------------------- */

    const elName = document.getElementById("pdf-instructor-name");

    const elPhone = document.getElementById("pdf-instructor-phone");

    if (elName) {
      elName.innerText = name || "-";
    }

    if (elPhone) {
      elPhone.innerText = formatPhoneNumber(phone) || "-";
    }

    /* --------------------------------------------------------
       서명 이미지를 화면에 고정
       -------------------------------------------------------- */

    const signatureArea = document.querySelector(".signature-area");

    if (signatureArea) {
      const signatureImgData = canvas.toDataURL("image/png");

      signatureArea.innerHTML = `
        <div
          class="signature-title"
          style="
            font-size: 13px;
            color: #475569;
            margin-bottom: 6px;
          "
        >
          본인은 위 내역을 최종 확인하였음을 서명합니다.
        </div>

        <div style="text-align: center;">

          <img
            src="${signatureImgData}"
            style="
              max-width: 220px;
              height: 70px;
              vertical-align: middle;
              border-bottom: 1px solid #cbd5e1;
            "
          />

        </div>
      `;
    }

    if (button) {
      button.textContent = "PDF 생성 중...";
    }

    /* --------------------------------------------------------
       서버 저장용 PDF 생성
       -------------------------------------------------------- */

    const pdfBase64 = await generateCustomPDF(name);

    if (button) {
      button.textContent = "저장 중...";
    }

    /* --------------------------------------------------------
       기존 saveSignaturePDF 호출
       -------------------------------------------------------- */

    const response = await fetch(API_URL, {
      method: "POST",

      headers: {
        "Content-Type": "application/json",
      },

      body: JSON.stringify({
        action: "saveSignaturePDF",

        name: name,

        phone: phone,

        month: mVal,

        pdfData: pdfBase64,
      }),
    });

    if (!response.ok) {
      throw new Error("저장 서버 응답 오류 (" + response.status + ")");
    }

    const result = await response.json();

    console.log("서명 저장 결과:", result);

    if (!result.success) {
      throw new Error(result.message || "강사확인서 저장에 실패했습니다.");
    }

    // --------------------------------------------------------
    // 제출 완료
    // --------------------------------------------------------
    alert("강사확인서가 제출되었습니다.");

    let actionArea = document.getElementById("submit-action-area");

    // 혹시 HTML에 ID가 빠져 있어도 기존 .action-area를 찾음
    if (!actionArea) {
      actionArea = document.querySelector(".action-area");
    }

    if (actionArea) {
      actionArea.innerHTML = `
    <div
      style="
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 8px;
      "
    >

      <button
        type="button"
        class="btn-submit"
        onclick="downloadPDF()"
      >
        📄 PDF 저장
      </button>

    </div>
  `;
    }
  } catch (error) {
    console.error("서명 제출 오류:", error);

    alert(error.message || "강사확인서 제출 중 오류가 발생했습니다.");

    if (button) {
      button.disabled = false;

      button.textContent = "서명 후 제출";
    }
  }
}

/* ============================================================
   기존 강사확인서 PDF 생성
   80% 축소 + Clone 방식 유지
   ============================================================ */

function generateCustomPDF(name) {
  return new Promise(function (resolve, reject) {
    const originalElement = document.getElementById("confirmation-card");

    if (!originalElement) {
      reject(new Error("확인서 영역을 찾을 수 없습니다."));

      return;
    }

    /* ------------------------------------------------------
         복사본 생성
         ------------------------------------------------------ */

    const clonedElement = originalElement.cloneNode(true);

    /* ------------------------------------------------------
         복사본 스타일
         ------------------------------------------------------ */

    clonedElement.style.width = "790px";

    clonedElement.style.height = "auto";

    clonedElement.style.maxHeight = "none";

    clonedElement.style.overflow = "visible";

    clonedElement.style.position = "relative";

    clonedElement.style.display = "block";

    clonedElement.style.background = "#ffffff";

    /* 기존 80% 축소 유지 */

    clonedElement.style.transform = "scale(0.8)";

    clonedElement.style.transformOrigin = "top center";

    /* ------------------------------------------------------
         내부 테이블 스타일
         ------------------------------------------------------ */

    const tables = clonedElement.querySelectorAll("table");

    tables.forEach(function (table) {
      table.style.width = "100%";

      table.style.height = "auto";

      table.style.tableLayout = "auto";

      table.style.borderCollapse = "collapse";
    });

    /* ------------------------------------------------------
         일시 셀 줄바꿈 유지
         ------------------------------------------------------ */

    const dateCells = clonedElement.querySelectorAll(
      ".data-table td:first-child",
    );

    dateCells.forEach(function (cell) {
      cell.style.whiteSpace = "pre-line";
    });

    /* ------------------------------------------------------
         PDF 옵션
         ------------------------------------------------------ */

    const opt = {
      margin: [10, 0, 0, 0],

      filename: "temp.pdf",

      pagebreak: {
        mode: ["css", "legacy"],
      },

      html2canvas: {
        scale: 2,

        scrollY: 0,

        scrollX: 0,

        useCORS: true,

        dpi: 300,

        windowHeight: Math.floor(clonedElement.scrollHeight * 0.8),

        letterRendering: true,

        allowTaint: false,
      },

      image: {
        type: "jpeg",
        quality: 0.98,
      },

      jsPDF: {
        unit: "mm",
        format: "a4",
        orientation: "portrait",
      },
    };

    /* ------------------------------------------------------
         PDF 생성
         ------------------------------------------------------ */

    html2pdf()
      .from(clonedElement)

      .set(opt)

      .toPdf()

      .get("pdf")

      .then(function (pdf) {
        return pdf.output("datauristring");
      })

      .then(function (pdfBase64) {
        resolve(pdfBase64);
      })

      .catch(function (error) {
        reject(error);
      });
  });
}

/* ============================================================
   강사 본인 PDF 다운로드
   ============================================================ */

function downloadPDF() {
  const originalElement = document.getElementById("confirmation-card");

  if (!originalElement) {
    alert("확인서 영역을 찾을 수 없습니다.");

    return;
  }

  const nameVal =
    instructorData && instructorData.instructorName
      ? instructorData.instructorName
      : "확인서";

  let phoneVal = confirmationPhone || "";

  if (!phoneVal && instructorData && instructorData.instructorNo) {
    phoneVal =
      sessionStorage.getItem(
        "confirmationPhone_" + instructorData.instructorNo,
      ) || "";
  }

  const elName = document.getElementById("pdf-instructor-name");

  const elPhone = document.getElementById("pdf-instructor-phone");

  if (elName) {
    elName.innerText = nameVal || "-";
  }

  if (elPhone) {
    elPhone.innerText = formatPhoneNumber(phoneVal) || "-";
  }

  const mVal = currentMonth ? currentMonth + "월_" : "";

  const filename = mVal + "강사확인서_" + (nameVal || "확인서") + ".pdf";

  /* ----------------------------------------------------------
     복사본 생성
     ---------------------------------------------------------- */

  const clonedElement = originalElement.cloneNode(true);

  /* ----------------------------------------------------------
     스타일 적용
     ---------------------------------------------------------- */

  clonedElement.style.width = "790px";

  clonedElement.style.height = "auto";

  clonedElement.style.maxHeight = "none";

  clonedElement.style.overflow = "visible";

  clonedElement.style.position = "relative";

  clonedElement.style.display = "block";

  clonedElement.style.background = "#ffffff";

  clonedElement.style.transform = "scale(0.8)";

  clonedElement.style.transformOrigin = "top center";

  /* ----------------------------------------------------------
     테이블 스타일
     ---------------------------------------------------------- */

  const tables = clonedElement.querySelectorAll("table");

  tables.forEach(function (table) {
    table.style.width = "100%";

    table.style.height = "auto";

    table.style.tableLayout = "auto";

    table.style.borderCollapse = "collapse";
  });

  /* ----------------------------------------------------------
     일시 셀 줄바꿈
     ---------------------------------------------------------- */

  const dateCells = clonedElement.querySelectorAll(
    ".data-table td:first-child",
  );

  dateCells.forEach(function (cell) {
    cell.style.whiteSpace = "pre-line";
  });

  /* ----------------------------------------------------------
     PDF 옵션
     ---------------------------------------------------------- */

  const opt = {
    margin: [10, 0, 0, 0],

    filename: filename,

    pagebreak: {
      mode: ["css", "legacy"],
    },

    html2canvas: {
      scale: 2,

      scrollY: 0,

      scrollX: 0,

      useCORS: true,

      dpi: 300,

      windowHeight: Math.floor(clonedElement.scrollHeight * 0.8),

      letterRendering: true,

      allowTaint: false,
    },

    image: {
      type: "jpeg",
      quality: 0.98,
    },

    jsPDF: {
      unit: "mm",
      format: "a4",
      orientation: "portrait",
    },
  };

  alert("PDF 파일 다운로드를 시작합니다.");

  html2pdf()
    .from(clonedElement)

    .set(opt)

    .toPdf()

    .save(filename)

    .catch(function (error) {
      console.error("PDF 다운로드 오류:", error);

      alert("다운로드 중 오류가 발생했습니다.");
    });
}

/* ============================================================
   날짜 포맷
   ============================================================ */

function formatDate(value) {
  if (!value) {
    return "";
  }

  const date = new Date(value);

  if (isNaN(date.getTime())) {
    return String(value);
  }

  const year = date.getFullYear();

  const month = String(date.getMonth() + 1).padStart(2, "0");

  const day = String(date.getDate()).padStart(2, "0");

  return `${year}.${month}.${day}`;
}

/* ============================================================
   금액 포맷
   ============================================================ */

function formatMoney(value) {
  if (value === null || value === undefined || value === "") {
    return "0원";
  }

  const number = Number(
    String(value).replace(/,/g, "").replace(/원/g, "").trim(),
  );

  if (isNaN(number)) {
    return String(value);
  }

  return number.toLocaleString("ko-KR") + "원";
}

/* ============================================================
   연락처 포맷
   ============================================================ */

function formatPhoneNumber(value) {
  const digits = String(value || "").replace(/\D/g, "");

  if (digits.length === 11) {
    return digits.replace(/(\d{3})(\d{4})(\d{4})/, "$1-$2-$3");
  }

  if (digits.length === 10) {
    return digits.replace(/(\d{3})(\d{3})(\d{4})/, "$1-$2-$3");
  }

  return value || "";
}

/* ============================================================
   HTML 이스케이프
   ============================================================ */

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")

    .replace(/</g, "&lt;")

    .replace(/>/g, "&gt;")

    .replace(/"/g, "&quot;")

    .replace(/'/g, "&#039;");
}

/* ============================================================
   메시지 표시
   ============================================================ */

function showMessage(text, type) {
  const message = document.getElementById("message");

  if (!message) {
    return;
  }

  message.textContent = text;

  message.className = "message show " + type;
}

/* ============================================================
   메시지 숨김
   ============================================================ */

function hideMessage() {
  const message = document.getElementById("message");

  if (!message) {
    return;
  }

  message.textContent = "";

  message.className = "message";
}
