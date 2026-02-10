(() => {
  const APP_CONFIG = {
    apiBaseUrl: "https://e3pyeerkgstf2covgz2yjkvj2m0bnqiq.lambda-url.us-east-1.on.aws",
    // Set your GA4 Measurement ID (for example: G-ABC123XYZ9).
    // Leave empty to disable analytics tracking.
    gaMeasurementId: "G-N43MCS8JPD",
  };
  const MAX_UPLOAD_MB = 3;
  const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;
  const GA_MEASUREMENT_ID_PATTERN = /^G-[A-Z0-9]+$/i;
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
  const UNCATEGORIZED_CATEGORY = "__uncategorized__";
  const UNCATEGORIZED_CATEGORY_LABEL = "uncategorized";
  const FIX_PLAN_TEMPLATES = [
    {
      pattern: /\b(metadata|xmp|title|language|lang|viewer|displaydoctitle)\b/i,
      summary: "Document-level accessibility metadata is incomplete or inconsistent.",
      action: "Set document title, primary language, and related viewer metadata so assistive tech announces the document correctly.",
    },
    {
      pattern: /\b(structure|tag|tagged|parent|child|rolemap|heading|paragraph|reading order)\b/i,
      summary: "The semantic structure tree needs correction.",
      action: "Repair the tag hierarchy so headings, paragraphs, lists, and sections follow a valid parent-child order.",
    },
    {
      pattern: /\b(table|th|td|header cell|scope|rowspan|colspan)\b/i,
      summary: "Table semantics or header associations are broken.",
      action: "Tag the table structure correctly and associate header cells with data cells using proper scope or ID references.",
    },
    {
      pattern: /\b(figure|image|alt text|alternate text|artifact)\b/i,
      summary: "Image semantics need alternative-text remediation.",
      action: "Add meaningful alternate text to informative images and mark decorative graphics as artifacts.",
    },
    {
      pattern: /\b(form|field|annotation|widget|label|tooltip|link)\b/i,
      summary: "Interactive content lacks accessible properties.",
      action: "Ensure fields, annotations, and links are tagged and include accessible labels or text equivalents.",
    },
    {
      pattern: /\b(font|unicode|cmap|encoding|glyph|text extraction)\b/i,
      summary: "Text encoding or font mapping is preventing reliable screen-reader output.",
      action: "Embed fonts and repair Unicode mappings (ToUnicode/CMap) so extracted text matches visual text.",
    },
    {
      pattern: /\b(color|contrast|readability)\b/i,
      summary: "Visual readability requirements may not be met.",
      action: "Adjust color contrast and visual styling so text remains perceivable across expected reading conditions.",
    },
  ];
  const DEFAULT_FIX_PLAN_TEMPLATE = {
    summary: "This issue requires targeted remediation for the failing rule.",
    action: "Apply the fix required by this rule in your remediation tool, then keep the structural semantics consistent.",
  };
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
  const uploadMode = document.getElementById("upload-mode");
  const urlMode = document.getElementById("url-mode");
  const inputModeField = document.getElementById("input-mode");
  const modeTabs = Array.from(form.querySelectorAll(".mode-tab"));
  const profileTemplate = document.getElementById("profile-template");
  const uploadDropzone = document.getElementById("upload-dropzone");
  const uploadDropHint = document.getElementById("upload-drop-hint");
  let pendingUploadFile = null;

  initAnalytics(APP_CONFIG.gaMeasurementId);
  setupUploadDropzone();

  modeTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const mode = tab.dataset.mode || "upload";
      setSelectedMode(mode);
    });
    tab.addEventListener("keydown", handleModeTabKeydown);
  });
  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const button = target.closest(".copy-icon-btn");
    if (!button) {
      return;
    }

    copyExample(button);
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
    trackEvent("validate_request_started", {
      input_mode: selectedMode,
    });

    try {
      const validateUrl = buildValidateUrl(lambdaBaseUrl);
      const response = selectedMode === "upload"
        ? await runFileValidation(validateUrl)
        : await runUrlValidation(validateUrl);

      renderResponse(response);
      trackEvent("validate_request_succeeded", {
        input_mode: selectedMode,
        overall_pass: Boolean(response.passed),
        profile_count: Array.isArray(response.results) ? response.results.length : 0,
      });
      setSubmitting(false, "Validation complete.");
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      showError(message);
      trackEvent("validate_request_failed", {
        input_mode: selectedMode,
      });
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

  function handleModeTabKeydown(event) {
    const key = event.key;
    const currentIndex = modeTabs.indexOf(event.currentTarget);
    if (currentIndex < 0) {
      return;
    }

    let nextIndex = -1;
    if (key === "ArrowRight" || key === "ArrowDown") {
      nextIndex = (currentIndex + 1) % modeTabs.length;
    } else if (key === "ArrowLeft" || key === "ArrowUp") {
      nextIndex = (currentIndex - 1 + modeTabs.length) % modeTabs.length;
    } else if (key === "Home") {
      nextIndex = 0;
    } else if (key === "End") {
      nextIndex = modeTabs.length - 1;
    } else {
      return;
    }

    event.preventDefault();
    const nextTab = modeTabs[nextIndex];
    if (!nextTab) {
      return;
    }

    nextTab.focus();
    setSelectedMode(nextTab.dataset.mode || "upload");
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
    const file = getSelectedUploadFile();
    if (!file) {
      throw new Error("Select a PDF file to upload.");
    }
    if (!isPdfFile(file)) {
      throw new Error("Only PDF files are accepted.");
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

  function setupUploadDropzone() {
    if (!uploadDropzone) {
      return;
    }

    const defaultHint = uploadDropHint ? uploadDropHint.textContent.trim() : "";
    let dragDepth = 0;

    const prevent = (event) => {
      event.preventDefault();
      event.stopPropagation();
    };

    const setDragOver = (isActive) => {
      uploadDropzone.classList.toggle("is-dragover", isActive);
    };

    uploadDropzone.addEventListener("keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }
      event.preventDefault();
      fileInput.click();
    });

    ["dragenter", "dragover", "dragleave", "drop"].forEach((eventName) => {
      uploadDropzone.addEventListener(eventName, prevent);
    });

    uploadDropzone.addEventListener("dragenter", () => {
      dragDepth += 1;
      setDragOver(true);
    });

    uploadDropzone.addEventListener("dragover", () => {
      setDragOver(true);
    });

    uploadDropzone.addEventListener("dragleave", () => {
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) {
        setDragOver(false);
      }
    });

    uploadDropzone.addEventListener("drop", (event) => {
      dragDepth = 0;
      setDragOver(false);

      const droppedFiles = event.dataTransfer && event.dataTransfer.files;
      if (!droppedFiles || droppedFiles.length === 0) {
        return;
      }

      const file = droppedFiles[0];
      if (!isPdfFile(file)) {
        pendingUploadFile = null;
        updateUploadDropHint(defaultHint);
        showError("Only PDF files are accepted.");
        return;
      }
      if (file.size > MAX_UPLOAD_BYTES) {
        pendingUploadFile = null;
        updateUploadDropHint(defaultHint);
        showError(`PDF upload exceeds ${MAX_UPLOAD_MB} MB limit.`);
        return;
      }

      pendingUploadFile = file;
      fileInput.value = "";
      updateUploadDropHint(defaultHint);
    });

    fileInput.addEventListener("change", () => {
      pendingUploadFile = null;
      updateUploadDropHint(defaultHint);
    });

    updateUploadDropHint(defaultHint);
  }

  function getSelectedUploadFile() {
    return pendingUploadFile || (fileInput.files && fileInput.files[0]) || null;
  }

  function updateUploadDropHint(defaultHint) {
    if (!uploadDropHint) {
      return;
    }

    const file = getSelectedUploadFile();
    if (!file) {
      uploadDropHint.textContent = defaultHint;
      return;
    }

    uploadDropHint.textContent = `Selected: ${file.name} (${formatFileSize(file.size)}). Maximum upload size: ${MAX_UPLOAD_MB} MB.`;
  }

  function isPdfFile(file) {
    const name = String(file.name || "").toLowerCase();
    return file.type === "application/pdf" || name.endsWith(".pdf");
  }

  function formatFileSize(bytes) {
    if (bytes >= 1024 * 1024) {
      return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
    }
    return `${Math.max(1, Math.round(bytes / 1024))} KB`;
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

    const overallState = getOverallResultState(data);
    const overallBadgeClass = overallState;
    const overallBadgeText = `Overall: ${overallState.charAt(0).toUpperCase()}${overallState.slice(1)}`;
    const resultStateClass = `result-${overallState}`;

    const headerHtml = `
      <div class="result-header">
        <div>
          <h2>Validation Results</h2>
          <span class="badge overall-badge ${overallBadgeClass}">${overallBadgeText}</span>
        </div>
      </div>
      <div class="profile-grid" id="profile-grid"></div>
      <p class="result-meta">${escapeHtml(data.disclaimer || "")}</p>
    `;

    resultPanel.innerHTML = headerHtml;
    resultPanel.classList.remove("result-pass", "result-fail", "result-mixed");
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

      const profileCard = fragment.querySelector(".profile-card");
      const profileName = fragment.querySelector(".profile-name");
      const badge = fragment.querySelector(".badge");
      const summary = profileResult.summary || {};

      if (profileCard) {
        profileCard.classList.remove("profile-pass", "profile-fail");
        profileCard.classList.add(profileResult.passed ? "profile-pass" : "profile-fail");
      }

      profileName.textContent = formatProfileName(profileResult.profile);
      badge.textContent = profileResult.passed ? "Pass" : "Fail";
      badge.classList.add(profileResult.passed ? "pass" : "fail");

      fragment.querySelector(".metric-errors").textContent = String(summary.errors ?? 0);
      fragment.querySelector(".metric-failed-rules").textContent = String(summary.failed_rules ?? 0);
      fragment.querySelector(".metric-checked-rules").textContent = summary.checked_rules == null ? "n/a" : String(summary.checked_rules);
      fragment.querySelector(".metric-duration").textContent = `${summary.duration_ms ?? 0} ms`;

      const renderRoot = profileCard || fragment;
      const issues = normalizeIssuesForDisplay(profileResult);
      renderProfileIssues(renderRoot, issues);
      renderRaw(renderRoot, profileResult.raw);

      profileGrid.appendChild(fragment);
    });
  }

  function getOverallResultState(data) {
    const results = Array.isArray(data.results) ? data.results : [];
    const hasPassingProfile = results.some((profileResult) => profileResult && profileResult.passed === true);
    const hasFailingProfile = results.some((profileResult) => profileResult && profileResult.passed === false);

    if (hasPassingProfile && hasFailingProfile) {
      return "mixed";
    }

    return data.passed ? "pass" : "fail";
  }

  function animateResultPanel() {
    resultPanel.classList.remove("result-enter");
    void resultPanel.offsetHeight;
    resultPanel.classList.add("result-enter");
  }

  function normalizeIssuesForDisplay(profileResult) {
    const issues = Array.isArray(profileResult.issues) ? profileResult.issues : [];
    if (!issues.length) {
      return issues;
    }
    return enrichIssuesFromRawXml(issues, profileResult.raw);
  }

  function enrichIssuesFromRawXml(issues, raw) {
    const ruleDataByRuleId = extractRuleDataFromRaw(raw);
    const ruleEntryCursorByRuleId = new Map();

    return issues.map((issue) => {
      let hasChanges = false;
      const normalizedIssue = { ...issue };
      if (normalizedIssue.page == null) {
        const derivedPage = extractPageNumber(normalizedIssue.location || normalizedIssue.message);
        if (derivedPage != null) {
          normalizedIssue.page = derivedPage;
          hasChanges = true;
        }
      }

      const ruleId = issue && issue.rule_id != null ? String(issue.rule_id) : "";
      const ruleData = ruleDataByRuleId.get(ruleId);
      if (!ruleData) {
        return hasChanges ? normalizedIssue : issue;
      }

      const matchedEntry = matchRawEntryForIssue(
        issue,
        ruleId,
        ruleData.entries,
        ruleEntryCursorByRuleId,
      );

      const existingTags = [];
      if (Array.isArray(issue.tags)) {
        existingTags.push(...issue.tags);
      } else if (issue.tags != null) {
        existingTags.push(issue.tags);
      }

      const mergedTags = dedupeCategoryValues([...existingTags, ...ruleData.tags]);
      if (mergedTags.length) {
        normalizedIssue.tags = mergedTags;
        hasChanges = true;
        if (!normalizedIssue.category) {
          normalizedIssue.category = mergedTags[0];
        }
      }

      if (normalizedIssue.page == null && matchedEntry && matchedEntry.page != null) {
        normalizedIssue.page = matchedEntry.page;
        hasChanges = true;
      }

      if (!normalizedIssue.location && matchedEntry && matchedEntry.location) {
        normalizedIssue.location = matchedEntry.location;
        hasChanges = true;
      }

      if (ruleData.failedChecks != null && normalizedIssue.failed_checks !== ruleData.failedChecks) {
        normalizedIssue.failed_checks = ruleData.failedChecks;
        hasChanges = true;
      }

      return hasChanges ? normalizedIssue : issue;
    });
  }

  function matchRawEntryForIssue(issue, ruleId, entries, cursorByRuleId) {
    if (!Array.isArray(entries) || !entries.length) {
      return null;
    }

    const startIndex = cursorByRuleId.get(ruleId) || 0;
    const issueLocation = issue && issue.location != null ? String(issue.location).trim() : "";
    const issueMessage = issue && issue.message != null ? String(issue.message).trim() : "";

    let matchIndex = -1;
    if (issueLocation) {
      matchIndex = findEntryIndex(entries, startIndex, (entry) => entry.location === issueLocation);
    }
    if (matchIndex < 0 && issueMessage) {
      matchIndex = findEntryIndex(entries, startIndex, (entry) => entry.message === issueMessage);
    }
    if (matchIndex < 0 && startIndex < entries.length) {
      matchIndex = startIndex;
    }
    if (matchIndex < 0) {
      return null;
    }

    cursorByRuleId.set(ruleId, matchIndex + 1);
    return entries[matchIndex];
  }

  function findEntryIndex(entries, startIndex, predicate) {
    for (let index = startIndex; index < entries.length; index += 1) {
      if (predicate(entries[index])) {
        return index;
      }
    }
    return -1;
  }

  function extractRuleDataFromRaw(raw) {
    if (typeof raw !== "string" || raw.indexOf("<rule") === -1 || typeof DOMParser !== "function") {
      return new Map();
    }

    let xmlDoc;
    try {
      xmlDoc = new DOMParser().parseFromString(raw, "application/xml");
    } catch (_error) {
      return new Map();
    }

    if (!xmlDoc || xmlDoc.getElementsByTagName("parsererror").length > 0) {
      return new Map();
    }

    const ruleDataByRuleId = new Map();
    const ruleNodes = Array.from(xmlDoc.getElementsByTagName("rule"));

    ruleNodes.forEach((ruleNode) => {
      const ruleId = buildRuleIdFromXmlRule(ruleNode);
      if (!ruleId) {
        return;
      }

      const ruleTags = splitCategoryValue(ruleNode.getAttribute("tags"));
      const failedEntries = extractFailedEntriesFromRuleNode(ruleNode);
      const failedChecks = extractFailedChecksFromRuleNode(ruleNode, failedEntries.length);

      const existing = ruleDataByRuleId.get(ruleId) || { tags: [], entries: [], failedChecks: null };
      const mergedTags = dedupeCategoryValues([...existing.tags, ...ruleTags]);
      const mergedEntries = [...existing.entries, ...failedEntries];
      const mergedFailedChecks = sumNullableCounts(existing.failedChecks, failedChecks);

      if (!mergedTags.length && !mergedEntries.length && mergedFailedChecks == null) {
        return;
      }

      ruleDataByRuleId.set(ruleId, {
        tags: mergedTags,
        entries: mergedEntries,
        failedChecks: mergedFailedChecks,
      });
    });

    return ruleDataByRuleId;
  }

  function buildRuleIdFromXmlRule(ruleNode) {
    const explicitRuleId = ruleNode.getAttribute("ruleId") || ruleNode.getAttribute("id");
    if (explicitRuleId) {
      return explicitRuleId;
    }

    const parts = [
      ruleNode.getAttribute("specification"),
      ruleNode.getAttribute("clause"),
      ruleNode.getAttribute("testNumber"),
    ].filter((part) => part && String(part).trim());

    if (!parts.length) {
      return null;
    }
    return parts.join(":");
  }

  function extractFailedEntriesFromRuleNode(ruleNode) {
    const assertionNodes = getFailedDescendantsByTagName(ruleNode, "assertion");
    const checkNodes = getFailedDescendantsByTagName(ruleNode, "check");
    const entryNodes = assertionNodes.length ? assertionNodes : checkNodes;
    if (!entryNodes.length) {
      return [];
    }

    const fallbackMessage = (
      getFirstDirectChildText(ruleNode, "description")
      || getFirstDirectChildText(ruleNode, "test")
      || "veraPDF rule failed"
    );
    const fallbackLocation = getFirstDirectChildText(ruleNode, "object");

    return entryNodes.map((entryNode) => {
      const location = (
        getFirstDirectChildText(entryNode, "context")
        || getFirstDirectChildText(entryNode, "location")
        || fallbackLocation
        || null
      );
      const message = (
        getFirstDirectChildText(entryNode, "errorMessage")
        || getFirstDirectChildText(entryNode, "message")
        || getFirstDirectChildText(entryNode, "description")
        || fallbackMessage
      );

      return {
        location,
        message,
        page: extractPageNumber(location || message),
      };
    });
  }

  function extractFailedChecksFromRuleNode(ruleNode, fallbackCount) {
    const explicitFailedChecks = parseNonNegativeInteger(ruleNode.getAttribute("failedChecks"));
    if (explicitFailedChecks != null) {
      return explicitFailedChecks;
    }

    const fallbackFailedChecks = parseNonNegativeInteger(fallbackCount);
    return fallbackFailedChecks;
  }

  function parseNonNegativeInteger(value) {
    if (value == null || value === "") {
      return null;
    }

    const parsed = Number.parseInt(String(value), 10);
    if (!Number.isFinite(parsed) || parsed < 0) {
      return null;
    }
    return parsed;
  }

  function sumNullableCounts(first, second) {
    if (first == null) {
      return second;
    }
    if (second == null) {
      return first;
    }
    return first + second;
  }

  function getFailedDescendantsByTagName(element, tagName) {
    const failedNodes = [];
    const nodes = Array.from(element.getElementsByTagName(tagName));

    nodes.forEach((node) => {
      const status = ((node.getAttribute("status") || "failed")).trim().toLowerCase();
      if (status === "failed") {
        failedNodes.push(node);
      }
    });

    return failedNodes;
  }

  function getFirstDirectChildText(element, tagName) {
    const normalizedTagName = String(tagName).toLowerCase();
    const children = Array.from(element.children || []);

    for (const child of children) {
      const childName = String(child.localName || child.nodeName || "").toLowerCase();
      if (childName !== normalizedTagName) {
        continue;
      }

      const text = String(child.textContent || "").trim();
      if (text) {
        return text;
      }
    }

    return null;
  }

  function extractPageNumber(text) {
    if (text == null) {
      return null;
    }

    const normalizedText = String(text);
    const pageMatch = normalizedText.match(/\bpage\s*(\d+)\b/i);
    if (pageMatch) {
      const explicitPage = Number.parseInt(pageMatch[1], 10);
      return Number.isFinite(explicitPage) && explicitPage > 0 ? explicitPage : null;
    }

    const indexedPageMatch = normalizedText.match(/\bpages?\[(\d+)\]/i);
    if (!indexedPageMatch) {
      return null;
    }

    const zeroBasedPage = Number.parseInt(indexedPageMatch[1], 10);
    if (!Number.isFinite(zeroBasedPage) || zeroBasedPage < 0) {
      return null;
    }
    return zeroBasedPage + 1;
  }

  function renderProfileIssues(renderRoot, issues) {
    const categoryList = renderRoot.querySelector(".category-list");
    let activeCategory = null;

    const rerender = () => {
      renderBreakdown(renderRoot, issues, activeCategory);
      renderIssues(
        renderRoot,
        filterIssuesByCategory(issues, activeCategory),
        activeCategory,
      );
    };

    if (categoryList) {
      categoryList.addEventListener("click", (event) => {
        const target = event.target;
        if (!(target instanceof Element)) {
          return;
        }

        const chip = target.closest(".category-chip");
        if (!chip || !categoryList.contains(chip)) {
          return;
        }

        const nextCategory = chip.dataset.category || null;
        activeCategory = activeCategory === nextCategory ? null : nextCategory;
        rerender();
      });
    }

    rerender();
  }

  function renderBreakdown(renderRoot, issues, activeCategory) {
    const categoryList = renderRoot.querySelector(".category-list");
    if (!categoryList) {
      return;
    }

    const categoryCounts = countByMany(
      issues,
      (issue) => getIssueCategories(issue),
      UNCATEGORIZED_CATEGORY,
    );

    categoryList.innerHTML = buildChipList(categoryCounts, activeCategory);
  }

  function renderIssues(renderRoot, issues, activeCategory) {
    const issuesBody = renderRoot.querySelector(".issues-body");
    const details = renderRoot.querySelector(".issues-details");
    if (!issuesBody || !details) {
      return;
    }

    if (!issues.length) {
      const categoryLabel = activeCategory == null ? null : getCategoryLabel(activeCategory);
      const filterMessage = activeCategory == null
        ? " for this profile"
        : ` for category "${escapeHtml(categoryLabel)}"`;
      issuesBody.innerHTML = `<tr><td colspan="5">No issues found${filterMessage}.</td></tr>`;
      details.open = true;
      return;
    }

    const sortedIssues = [...issues].sort((left, right) => {
      return getIssueFailedChecks(right) - getIssueFailedChecks(left);
    });

    issuesBody.innerHTML = sortedIssues.map((issue, index) => {
      const errorCount = getIssueFailedChecks(issue);
      const isLastIssue = index === sortedIssues.length - 1;
      const stripeClass = index % 2 === 0 ? "issue-stripe-a" : "issue-stripe-b";
      return `
        <tr class="issue-main-row ${stripeClass}">
          <td>${errorCount}</td>
          <td>${escapeHtml(issue.severity || "")}</td>
          <td>${escapeHtml(issue.rule_id || "-")}</td>
          <td>${issue.page == null ? "-" : Number(issue.page)}</td>
          <td>${renderIssueCategoryPills(issue)}</td>
        </tr>
        <tr class="issue-message-row ${stripeClass}">
          <td colspan="5">
            <div class="issue-message">${escapeHtml(issue.message || "")}</div>
          </td>
        </tr>
        <tr class="issue-fix-plan-row ${stripeClass}">
          <td colspan="5">${renderIssueFixPlan(issue)}</td>
        </tr>
        ${isLastIssue ? "" : `
        <tr class="issue-gap-row" aria-hidden="true">
          <td colspan="5"></td>
        </tr>
        `}
      `;
    }).join("");

    details.open = true;
  }

  function getIssueFailedChecks(issue) {
    const failedChecks = parseNonNegativeInteger(issue && issue.failed_checks);
    return failedChecks == null ? 1 : failedChecks;
  }

  function renderIssueFixPlan(issue) {
    const fixPlan = buildIssueFixPlan(issue);
    const stepsHtml = fixPlan.steps
      .map((step) => `<li>${escapeHtml(step)}</li>`)
      .join("");

    return `
      <details class="issue-fix-plan">
        <summary>Fix plan</summary>
        <div class="issue-fix-plan-body">
          <p>${escapeHtml(fixPlan.summary)}</p>
          <ol class="issue-fix-steps">${stepsHtml}</ol>
        </div>
      </details>
    `;
  }

  function buildIssueFixPlan(issue) {
    const template = resolveFixPlanTemplate(issue);
    const locatorStep = buildIssueLocatorStep(issue);
    const ruleId = issue && issue.rule_id != null ? String(issue.rule_id).trim() : "";
    const summary = ruleId
      ? `${template.summary} Rule: ${ruleId}.`
      : template.summary;

    return {
      summary,
      steps: [
        locatorStep,
        template.action,
      ],
    };
  }

  function buildIssueLocatorStep(issue) {
    const page = normalizePositivePageNumber(issue && issue.page);
    const location = issue && issue.location != null ? String(issue.location).trim() : "";

    if (page != null && location) {
      return `Inspect page ${page} at location "${location}" and identify the failing object.`;
    }
    if (page != null) {
      return `Inspect page ${page} and locate the failing object in the tag tree.`;
    }
    if (location) {
      return `Inspect the reported location "${location}" and identify the failing object.`;
    }
    return "Locate the failing object in your PDF structure tree and object properties panel.";
  }

  function normalizePositivePageNumber(value) {
    const parsedPage = parseNonNegativeInteger(value);
    if (parsedPage == null || parsedPage <= 0) {
      return null;
    }
    return parsedPage;
  }

  function resolveFixPlanTemplate(issue) {
    const categories = getIssueCategories(issue);
    const searchableParts = [
      issue && issue.rule_id,
      issue && issue.message,
      issue && issue.location,
      ...categories,
    ];
    const searchableText = searchableParts
      .filter((part) => part != null && String(part).trim() !== "")
      .join(" ");

    for (const template of FIX_PLAN_TEMPLATES) {
      if (template.pattern.test(searchableText)) {
        return template;
      }
    }
    return DEFAULT_FIX_PLAN_TEMPLATE;
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

  function buildChipList(counts, activeCategory) {
    const entries = Object.entries(counts).sort((a, b) => b[1] - a[1]);
    if (!entries.length) {
      return "<li>none</li>";
    }

    return entries
      .map(([name, count]) => {
        const label = getCategoryLabel(name);
        const isActive = activeCategory === name;
        const classes = isActive ? "category-chip is-active" : "category-chip";
        return `
          <li>
            <button
              type="button"
              class="${classes}"
              data-category="${escapeHtml(name)}"
              aria-pressed="${isActive}"
            >
              ${escapeHtml(label)} <strong>(${count})</strong>
            </button>
          </li>
        `;
      })
      .join("");
  }

  function getCategoryLabel(category) {
    if (category === UNCATEGORIZED_CATEGORY) {
      return UNCATEGORIZED_CATEGORY_LABEL;
    }
    return category;
  }

  function filterIssuesByCategory(issues, category) {
    if (category == null) {
      return issues;
    }
    return issues.filter((issue) => issueMatchesCategory(issue, category));
  }

  function issueMatchesCategory(issue, category) {
    const categories = getIssueCategories(issue);
    if (category === UNCATEGORIZED_CATEGORY) {
      return categories.length === 0;
    }
    return categories.includes(category);
  }

  function countByMany(items, getKeys, emptyKey) {
    const counts = {};

    for (const item of items) {
      const keys = getKeys(item);
      if (!Array.isArray(keys) || !keys.length) {
        const fallbackKey = String(emptyKey);
        counts[fallbackKey] = (counts[fallbackKey] || 0) + 1;
        continue;
      }

      for (const key of keys) {
        const normalizedKey = String(key);
        counts[normalizedKey] = (counts[normalizedKey] || 0) + 1;
      }
    }

    return counts;
  }

  function renderIssueCategoryPills(issue) {
    const categories = getIssueCategories(issue);
    if (!categories.length) {
      return "-";
    }

    return `
      <ul class="issue-category-pills" aria-label="Issue categories">
        ${categories.map((category) => `<li><span class="issue-category-pill">${escapeHtml(category)}</span></li>`).join("")}
      </ul>
    `;
  }

  function getIssueCategories(issue) {
    const categoryValues = [];

    if (Array.isArray(issue.tags)) {
      categoryValues.push(...issue.tags);
    } else if (issue.tags != null) {
      categoryValues.push(issue.tags);
    }

    if (Array.isArray(issue.category)) {
      categoryValues.push(...issue.category);
    } else if (issue.category != null) {
      categoryValues.push(issue.category);
    }
    return dedupeCategoryValues(categoryValues);
  }

  function splitCategoryValue(value) {
    if (value == null) {
      return [];
    }

    if (typeof value === "string") {
      return value
        .split(/[;,|]+/)
        .map((part) => part.trim())
        .filter(Boolean);
    }

    const normalized = String(value).trim();
    return normalized ? [normalized] : [];
  }

  function dedupeCategoryValues(values) {
    const categories = [];
    const seen = new Set();

    values
      .flatMap(splitCategoryValue)
      .forEach((value) => {
        if (!value || seen.has(value)) {
          return;
        }
        seen.add(value);
        categories.push(value);
      });

    return categories;
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
    resultPanel.classList.remove("result-pass", "result-fail", "result-mixed");
    errorPanel.classList.add("hidden");
    errorPanel.textContent = "";
  }

  function showError(message) {
    resultPanel.classList.add("hidden");
    resultPanel.classList.remove("result-pass", "result-fail", "result-mixed");
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
    const copyTarget = resolveCopyTarget(button);
    if (!copyTarget) {
      return;
    }

    const { source, targetName } = copyTarget;

    const text = source.textContent || "";
    if (!text.trim()) {
      return;
    }

    try {
      await copyText(text);
      flashCopiedState(button);
      trackEvent("copy_to_clipboard", {
        target: targetName,
      });
    } catch (_error) {
      showError("Could not copy to clipboard in this browser context.");
    }
  }

  function resolveCopyTarget(button) {
    const targetId = String(button.dataset.copyTarget || "").trim();
    if (targetId) {
      const source = document.getElementById(targetId);
      return source ? { source, targetName: targetId } : null;
    }

    const sourceSelector = String(button.dataset.copySelector || "").trim();
    if (!sourceSelector) {
      return null;
    }

    const scopeSelector = String(button.dataset.copyScope || "").trim();
    const scope = scopeSelector ? button.closest(scopeSelector) : button.parentElement;
    if (!scope) {
      return null;
    }

    const source = scope.querySelector(sourceSelector);
    if (!source) {
      return null;
    }

    const targetName = String(button.dataset.copyEventTarget || sourceSelector);
    return { source, targetName };
  }

  function initAnalytics(measurementId) {
    const id = String(measurementId || "").trim();
    if (!id || !GA_MEASUREMENT_ID_PATTERN.test(id)) {
      return;
    }

    const existingTag = document.querySelector(`script[src*="gtag/js?id=${id}"]`);
    if (!existingTag) {
      const script = document.createElement("script");
      script.async = true;
      script.src = `https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`;
      document.head.appendChild(script);
    }

    window.dataLayer = window.dataLayer || [];
    window.gtag = function gtag() {
      window.dataLayer.push(arguments);
    };
    window.gtag("js", new Date());
    window.gtag("config", id, {
      anonymize_ip: true,
    });
  }

  function trackEvent(eventName, params) {
    if (typeof window.gtag !== "function") {
      return;
    }
    window.gtag("event", eventName, params || {});
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
