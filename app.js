(() => {
  const APP_CONFIG = {
    apiBaseUrl: "https://e3pyeerkgstf2covgz2yjkvj2m0bnqiq.lambda-url.us-east-1.on.aws",
  };
  const MAX_UPLOAD_MB = 3;
  const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;
  const LOADING_ACTIONS = [
    "Preparing the PDF for validation...",
    "Checking PDF container syntax and document flags...",
    "Verifying tagged-PDF structure and parent-child relationships...",
    "Validating metadata, title, and viewer preferences...",
    "Checking language declarations across document content...",
    "Reviewing headings, paragraphs, and inline semantics...",
    "Validating tables (headers, cells, spans, and layout consistency)...",
    "Validating list and table-of-contents structures...",
    "Checking alternative text for figures, formulas, links, and media...",
    "Reviewing annotations and form-field accessibility tagging...",
    "Validating embedded fonts, Unicode maps, and CMap usage...",
    "Running readability checks (contrast, text size, and styling cues)...",
    "Finalizing PDF/UA-1 and WCAG profile results...",
  ];
  const LOADING_INTERVAL_MS = 1600;
  let loadingActionTimer = null;
  let loadingActionIndex = 0;

  const form = document.getElementById("validator-form");
  const formPanel = document.querySelector(".form-panel");
  const fileInput = document.getElementById("pdf-file");
  const pdfUrlInput = document.getElementById("pdf-url");
  const submitButton = document.getElementById("submit-button");
  const statusText = document.getElementById("status-text");
  const resultPanel = document.getElementById("result-panel");
  const errorPanel = document.getElementById("error-panel");
  const currentYear = document.getElementById("current-year");
  const apiBaseUrlDisplay = document.getElementById("api-base-url-display");
  const postExample = document.getElementById("post-example");
  const getExample = document.getElementById("get-example");
  const copyButtons = Array.from(document.querySelectorAll(".copy-icon-btn"));
  const uploadMode = document.getElementById("upload-mode");
  const urlMode = document.getElementById("url-mode");
  const inputModeField = document.getElementById("input-mode");
  const modeTabs = Array.from(form.querySelectorAll(".mode-tab"));
  const profileTemplate = document.getElementById("profile-template");

  modeTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const mode = tab.dataset.mode || "upload";
      setSelectedMode(mode);
    });
  });
  copyButtons.forEach((button) => {
    button.addEventListener("click", () => copyExample(button));
  });

  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    clearOutput();

    const selectedMode = getSelectedMode();
    const lambdaBaseUrl = normalizeLambdaBaseUrl(APP_CONFIG.apiBaseUrl);

    if (!lambdaBaseUrl) {
      showError("Configure APP_CONFIG.apiBaseUrl in web/app.js with your Lambda/API base URL.");
      return;
    }

    setSubmitting(true);

    try {
      const validateUrl = buildValidateUrl(lambdaBaseUrl);
      const response = selectedMode === "upload"
        ? await runFileValidation(validateUrl)
        : await runUrlValidation(validateUrl);

      renderResponse(response);
      setSubmitting(false, "Validation complete.");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      showError(message);
      setSubmitting(false, "Validation failed.");
    }
  });

  setSelectedMode(inputModeField.value || "url");
  renderApiInstructions();
  if (currentYear) {
    currentYear.textContent = String(new Date().getFullYear());
  }

  function setSelectedMode(mode) {
    inputModeField.value = mode;

    modeTabs.forEach((tab) => {
      const isActive = tab.dataset.mode === mode;
      tab.classList.toggle("is-active", isActive);
      tab.setAttribute("aria-selected", String(isActive));
      tab.tabIndex = isActive ? 0 : -1;
    });

    syncModePanels();
  }

  function syncModePanels() {
    const mode = getSelectedMode();
    const showUpload = mode === "upload";

    uploadMode.classList.toggle("hidden", !showUpload);
    uploadMode.setAttribute("aria-hidden", String(!showUpload));

    urlMode.classList.toggle("hidden", showUpload);
    urlMode.setAttribute("aria-hidden", String(showUpload));

    fileInput.required = showUpload;
    pdfUrlInput.required = !showUpload;
  }

  function getSelectedMode() {
    return inputModeField.value || "upload";
  }

  async function runFileValidation(validateUrl) {
    const file = fileInput.files && fileInput.files[0];
    if (!file) {
      throw new Error("Select a PDF file to upload.");
    }
    if (file.size > MAX_UPLOAD_BYTES) {
      throw new Error(`PDF upload exceeds ${MAX_UPLOAD_MB} MB limit.`);
    }

    const pdfBase64 = await fileToBase64(file);
    const payload = {
      include_raw: true,
      pdf_base64: pdfBase64,
    };

    return requestJson(validateUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });
  }

  async function runUrlValidation(validateUrl) {
    const pdfUrl = pdfUrlInput.value.trim();
    if (!pdfUrl) {
      throw new Error("Enter a PDF URL.");
    }

    const url = new URL(validateUrl);
    url.searchParams.set("pdf_url", pdfUrl);
    url.searchParams.set("include_raw", "true");

    return requestJson(url.toString(), {
      method: "GET",
    });
  }

  async function requestJson(url, options) {
    let response;
    try {
      response = await fetch(url, options);
    } catch (error) {
      throw new Error("Network error while contacting Lambda endpoint.");
    }

    let payload;
    try {
      payload = await response.json();
    } catch (_error) {
      throw new Error(`Lambda returned non-JSON response (HTTP ${response.status}).`);
    }

    if (!response.ok) {
      const requestId = payload && payload.request_id ? `request_id=${payload.request_id}` : "";
      const reason = payload && payload.error ? payload.error : "Request failed";
      throw new Error(`${reason}${requestId ? ` (${requestId})` : ""}`);
    }

    return payload;
  }

  function renderResponse(data) {
    errorPanel.classList.add("hidden");

    const overallBadgeClass = data.passed ? "pass" : "fail";
    const overallBadgeText = data.passed ? "Overall: Pass" : "Overall: Fail";
    const resultStateClass = data.passed ? "result-pass" : "result-fail";

    const headerHtml = `
      <div class="result-header">
        <div>
          <h2>Validation Results</h2>
          <span class="badge overall-badge ${overallBadgeClass}">${overallBadgeText}</span>
        </div>
      </div>
      <p class="result-meta">${escapeHtml(data.disclaimer || "")}</p>
      <div class="profile-grid" id="profile-grid"></div>
    `;

    resultPanel.innerHTML = headerHtml;
    resultPanel.classList.remove("result-pass", "result-fail");
    resultPanel.classList.add(resultStateClass);
    resultPanel.classList.remove("hidden");
    animateResultPanel();

    const profileGrid = document.getElementById("profile-grid");
    const profileOrder = ["pdfua-1", "wcag-2-2-complete.xml"];

    const sortedResults = [...(data.results || [])].sort((a, b) => {
      return profileOrder.indexOf(a.profile) - profileOrder.indexOf(b.profile);
    });

    sortedResults.forEach((profileResult) => {
      const fragment = profileTemplate.content.cloneNode(true);

      const profileName = fragment.querySelector(".profile-name");
      const badge = fragment.querySelector(".badge");
      const summary = profileResult.summary || {};

      profileName.textContent = formatProfileName(profileResult.profile);
      badge.textContent = profileResult.passed ? "Pass" : "Fail";
      badge.classList.add(profileResult.passed ? "pass" : "fail");

      fragment.querySelector(".metric-errors").textContent = String(summary.errors ?? 0);
      fragment.querySelector(".metric-failed-rules").textContent = String(summary.failed_rules ?? 0);
      fragment.querySelector(".metric-checked-rules").textContent = summary.checked_rules == null ? "n/a" : String(summary.checked_rules);
      fragment.querySelector(".metric-duration").textContent = `${summary.duration_ms ?? 0} ms`;

      const issues = Array.isArray(profileResult.issues) ? profileResult.issues : [];
      renderBreakdown(fragment, issues);
      renderIssues(fragment, issues);
      renderRaw(fragment, profileResult.raw);

      profileGrid.appendChild(fragment);
    });
  }

  function animateResultPanel() {
    resultPanel.classList.remove("result-enter");
    void resultPanel.offsetHeight;
    resultPanel.classList.add("result-enter");
  }

  function renderBreakdown(fragment, issues) {
    const severityList = fragment.querySelector(".severity-list");
    const categoryList = fragment.querySelector(".category-list");

    const severityCounts = countBy(issues, (issue) => issue.severity || "unknown");
    const categoryCounts = countBy(issues, (issue) => issue.category || "uncategorized");

    severityList.innerHTML = buildChipList(severityCounts);
    categoryList.innerHTML = buildChipList(categoryCounts);
  }

  function renderIssues(fragment, issues) {
    const issuesBody = fragment.querySelector(".issues-body");
    const details = fragment.querySelector(".issues-details");

    if (!issues.length) {
      issuesBody.innerHTML = '<tr><td colspan="5">No issues found for this profile.</td></tr>';
      return;
    }

    issuesBody.innerHTML = issues.map((issue) => {
      return `
        <tr>
          <td>${escapeHtml(issue.severity || "")}</td>
          <td>${escapeHtml(issue.rule_id || "-")}</td>
          <td>${escapeHtml(issue.message || "")}</td>
          <td>${issue.page == null ? "-" : Number(issue.page)}</td>
          <td>${escapeHtml(issue.category || "-")}</td>
        </tr>
      `;
    }).join("");

    details.open = true;
  }

  function renderRaw(fragment, raw) {
    const rawDetails = fragment.querySelector(".raw-details");
    const rawPre = fragment.querySelector(".raw-pre");

    if (raw == null) {
      rawDetails.classList.add("hidden");
      return;
    }

    rawPre.textContent = typeof raw === "string" ? raw : JSON.stringify(raw, null, 2);
  }

  function buildChipList(counts) {
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    if (!entries.length) {
      return "<li>none</li>";
    }

    return entries
      .map(([name, count]) => `<li>${escapeHtml(name)}: <strong>${count}</strong></li>`)
      .join("");
  }

  function countBy(items, getKey) {
    const counts = {};
    for (const item of items) {
      const key = String(getKey(item));
      counts[key] = (counts[key] || 0) + 1;
    }
    return counts;
  }

  function setSubmitting(isSubmitting, message) {
    submitButton.disabled = isSubmitting;
    if (formPanel) {
      formPanel.classList.toggle("is-loading", isSubmitting);
    }
    if (isSubmitting) {
      submitButton.innerHTML = '<span class="button-spinner" aria-hidden="true"></span><span>Running...</span>';
    } else {
      submitButton.textContent = "Run Validation";
    }
    if (isSubmitting) {
      startLoadingActions();
      return;
    }
    stopLoadingActions();
    statusText.textContent = message || "";
  }

  function startLoadingActions() {
    stopLoadingActions();
    loadingActionIndex = 0;
    statusText.textContent = LOADING_ACTIONS[loadingActionIndex];
    loadingActionIndex += 1;

    loadingActionTimer = window.setInterval(() => {
      statusText.textContent = LOADING_ACTIONS[loadingActionIndex % LOADING_ACTIONS.length];
      loadingActionIndex += 1;
    }, LOADING_INTERVAL_MS);
  }

  function stopLoadingActions() {
    if (loadingActionTimer == null) {
      return;
    }
    window.clearInterval(loadingActionTimer);
    loadingActionTimer = null;
  }

  function clearOutput() {
    resultPanel.classList.add("hidden");
    resultPanel.classList.remove("result-pass", "result-fail");
    errorPanel.classList.add("hidden");
    errorPanel.textContent = "";
  }

  function showError(message) {
    resultPanel.classList.add("hidden");
    resultPanel.classList.remove("result-pass", "result-fail");
    errorPanel.textContent = message;
    errorPanel.classList.remove("hidden");
  }

  function normalizeLambdaBaseUrl(input) {
    const trimmed = input.trim();
    if (!trimmed) {
      return "";
    }

    try {
      const url = new URL(trimmed);
      return url.toString().replace(/\/$/, "");
    } catch (_error) {
      return "";
    }
  }

  function buildValidateUrl(baseUrl) {
    if (baseUrl.endsWith("/validate")) {
      return baseUrl;
    }
    return `${baseUrl}/validate`;
  }

  function renderApiInstructions() {
    const baseUrl = normalizeLambdaBaseUrl(APP_CONFIG.apiBaseUrl);
    const validateUrl = baseUrl ? buildValidateUrl(baseUrl) : "https://your-endpoint/validate";

    apiBaseUrlDisplay.textContent = validateUrl;
    postExample.textContent = [
      `curl -X POST "${validateUrl}" \\`,
      "  -H \"Content-Type: application/json\" \\",
      "  -d '{\"include_raw\":true,\"pdf_base64\":\"<base64-pdf>\"}'",
    ].join("\n");

    getExample.textContent = [
      `curl -G "${validateUrl}" \\`,
      "  --data-urlencode \"pdf_url=https://example.com/sample.pdf\" \\",
      "  --data-urlencode \"include_raw=true\"",
    ].join("\n");
  }

  async function copyExample(button) {
    const targetId = button.dataset.copyTarget;
    if (!targetId) {
      return;
    }

    const source = document.getElementById(targetId);
    if (!source) {
      return;
    }

    const text = source.textContent || "";
    if (!text.trim()) {
      return;
    }

    try {
      await copyText(text);
      flashCopiedState(button);
    } catch (_error) {
      showError("Could not copy to clipboard in this browser context.");
    }
  }

  async function copyText(text) {
    if (navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return;
    }

    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "absolute";
    textarea.style.left = "-9999px";
    document.body.appendChild(textarea);
    textarea.select();

    const successful = document.execCommand("copy");
    document.body.removeChild(textarea);
    if (!successful) {
      throw new Error("execCommand copy failed");
    }
  }

  function flashCopiedState(button) {
    button.classList.add("copied");
    const previousTitle = button.title;
    const previousAriaLabel = button.getAttribute("aria-label");
    button.title = "Copied";
    button.setAttribute("aria-label", "Copied!");

    window.setTimeout(() => {
      button.classList.remove("copied");
      button.title = previousTitle || "Copy to Clipboard";
      button.setAttribute("aria-label", previousAriaLabel || "Copy to Clipboard");
    }, 1000);
  }

  function formatProfileName(profile) {
    if (profile === "pdfua-1") {
      return "PDF/UA-1";
    }
    if (profile === "wcag-2-2-complete.xml") {
      return "WCAG 2.2 Profile";
    }
    return profile;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  function fileToBase64(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();

      reader.onerror = () => {
        reject(new Error("Could not read selected PDF file."));
      };

      reader.onload = () => {
        const dataUrl = reader.result;
        if (typeof dataUrl !== "string") {
          reject(new Error("Could not process selected PDF file."));
          return;
        }

        const marker = "base64,";
        const markerIndex = dataUrl.indexOf(marker);
        if (markerIndex < 0) {
          reject(new Error("Could not extract base64 content from selected file."));
          return;
        }

        resolve(dataUrl.slice(markerIndex + marker.length));
      };

      reader.readAsDataURL(file);
    });
  }
})();
