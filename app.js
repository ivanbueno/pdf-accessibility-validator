(() => {
  const API_BASE_URL_STORAGE_KEY = "pdf-audit.api-base-url.v1";
  const DEFAULT_API_BASE_URL = "https://e3pyeerkgstf2covgz2yjkvj2m0bnqiq.lambda-url.us-east-1.on.aws";
  const APP_CONFIG = {
    apiBaseUrl: resolveApiBaseUrl(DEFAULT_API_BASE_URL),
    // Set your GA4 Measurement ID (for example: G-ABC123XYZ9).
    // Leave empty to disable analytics tracking.
    gaMeasurementId: "G-N43MCS8JPD",
  };
  const MAX_UPLOAD_MB = 10;
  const MAX_UPLOAD_BYTES = MAX_UPLOAD_MB * 1024 * 1024;
  const GA_MEASUREMENT_ID_PATTERN = /^G-[A-Z0-9]+$/i;
  const ANALYTICS_EVENT_NAME_PATTERN = /^[a-z][a-z0-9_]{0,39}$/;
  const ANALYTICS_PARAM_NAME_PATTERN = /^[a-z][a-z0-9_]{0,39}$/;
  const ANALYTICS_MAX_PARAM_VALUE_LENGTH = 100;
  const PDFUA_LOADING_ACTIONS = [
    "Validating tagged-PDF structure tree integrity...",
    "Verifying RoleMap mappings and artifact usage...",
    "Reviewing headings, paragraphs, and section semantics...",
    "Validating list, table, and table-of-contents structures...",
    "Checking alternative text for figures and formulas...",
    "Reviewing annotations and form-field accessibility tagging...",
    "Validating metadata, title, and primary language declarations...",
    "Validating embedded fonts, Unicode maps, and CMap usage...",
    "Checking parent-child relationships and reading order...",
  ];
  const WCAG_LOADING_ACTIONS = [
    "Testing non-text alternatives and descriptive link purpose...",
    "Reviewing keyboard-friendly navigation and focus flow...",
    "Validating heading hierarchy and semantic structure cues...",
    "Checking table relationships and data/header associations...",
    "Evaluating form labels, instructions, and error messaging cues...",
    "Running color contrast and readability checks...",
    "Reviewing zoom/reflow adaptability and text spacing signals...",
    "Validating language-of-page and language-of-parts indicators...",
    "Checking consistent navigation and predictable interaction patterns...",
  ];
  const LOADING_ACTIONS = [
    "Preparing the PDF for validation...",
    "Checking PDF container syntax and document flags...",
    ...PDFUA_LOADING_ACTIONS,
    ...WCAG_LOADING_ACTIONS,
    "Correlating failed checks with rule evidence details...",
    "Finalizing PDF/UA-1 and WCAG profile results...",
  ];
  const LOADING_INTERVAL_MS = 1600;
  const UNCATEGORIZED_CATEGORY = "__uncategorized__";
  const UNCATEGORIZED_CATEGORY_LABEL = "uncategorized";
  const RUN_DELTA_STORAGE_KEY = "pdf-audit.run-snapshot.v1";
  const RUN_DELTA_DEFAULT_KEY = "__default__";
  const RUN_TRACK_RECORD_MAX_HISTORY = 30;
  const RUN_PROFILE_ORDER = ["pdfua-1", "wcag-2-2-complete.xml"];
  const COMPLIANCE_ERROR_WEIGHT = 0.5;
  const FIX_PLAN_MAX_STEPS = 6;
  const FIX_PLAN_MATCHED_ACTION_LIMIT = 3;
  const FIX_PLAN_DEFAULT_ACTION_LIMIT = 2;
  // Action guidance is phrased to stay tool-agnostic across remediation workflows.
  const FIX_PLAN_TEMPLATES = [
    {
      pattern: /\b(metadata|xmp|title|language|lang|viewer|displaydoctitle)\b/i,
      summary: "Document-level accessibility metadata is incomplete or inconsistent.",
      action: "Set document title and primary language so assistive technology announces the document correctly.",
      followUpActions: [
        {
          id: "metadata-title",
          pattern: /\b(title|document title|display\s*doc\s*title)\b/i,
          step: "Set a concise, descriptive document title in metadata fields.",
          defaultWhenNoMatch: true,
        },
        {
          id: "metadata-language",
          pattern: /\b(language|lang|primary language)\b/i,
          step: "Set the primary document language code on the catalog.",
          defaultWhenNoMatch: true,
        },
        {
          id: "metadata-language-parts",
          pattern: /\b(language of parts|foreign language|mixed language|passage)\b/i,
          step: "Mark language changes for passages that differ from the primary document language.",
        },
        {
          id: "metadata-xmp-sync",
          pattern: /\b(xmp|metadata|document info|info dictionary)\b/i,
          step: "Synchronize XMP and document info values so title and language are consistent.",
          defaultWhenNoMatch: true,
        },
        {
          id: "metadata-viewer-pref",
          pattern: /\b(viewer|displaydoctitle|file name|filename)\b/i,
          step: "Enable viewer preferences to show the title instead of the file name.",
        },
        {
          id: "metadata-validation",
          step: "Re-open the file in a reader and verify title and language are exposed correctly.",
          always: true,
        },
      ],
    },
    {
      pattern: /\b(structure|tag|tagged|parent|child|rolemap|heading|paragraph|reading order)\b/i,
      summary: "The semantic structure tree needs correction.",
      action: "Repair the tag hierarchy so headings, paragraphs, lists, and sections follow a valid parent-child order.",
      followUpActions: [
        {
          id: "structure-heading-levels",
          pattern: /\b(heading|h1|h2|h3|h4|h5|h6)\b/i,
          step: "Normalize heading levels so they progress logically without skipped levels.",
          defaultWhenNoMatch: true,
        },
        {
          id: "structure-rolemap",
          pattern: /\b(rolemap|custom tag|tag mapping|mapped)\b/i,
          step: "Map custom roles to valid standard structure types.",
        },
        {
          id: "structure-parent-tree",
          pattern: /\b(parent|child|kids|ancestor|descendant)\b/i,
          step: "Repair parent-child relationships so each structure element points to the correct parent.",
          defaultWhenNoMatch: true,
        },
        {
          id: "structure-reading-order",
          pattern: /\b(reading order|sequence|logical order|out of order)\b/i,
          step: "Reorder structure elements to match the intended reading order.",
          defaultWhenNoMatch: true,
        },
        {
          id: "structure-list-shape",
          pattern: /\b(list|li|lbl|lbody)\b/i,
          step: "Ensure lists use consistent list item, label, and body substructure.",
        },
        {
          id: "structure-artifacts",
          pattern: /\b(artifact|decorative|background|layout only)\b/i,
          step: "Mark decorative and layout-only content as artifacts.",
        },
        {
          id: "structure-validation",
          step: "Recheck the structure tree to confirm no orphaned or unreferenced tags remain.",
          always: true,
        },
      ],
    },
    {
      pattern: /\b(table|th|td|header cell|scope|rowspan|colspan)\b/i,
      summary: "Table semantics or header associations are broken.",
      action: "Tag the table structure correctly and associate header cells with data cells using proper scope or ID references.",
      followUpActions: [
        {
          id: "table-headers",
          pattern: /\b(header|th|scope)\b/i,
          step: "Identify header cells explicitly and define their scope.",
          defaultWhenNoMatch: true,
        },
        {
          id: "table-associations",
          pattern: /\b(headers|id|association|associated)\b/i,
          step: "Create explicit header-to-data associations for complex tables.",
        },
        {
          id: "table-structure",
          pattern: /\b(table|tr|td|th)\b/i,
          step: "Validate the table hierarchy so rows and cells are nested correctly.",
          defaultWhenNoMatch: true,
        },
        {
          id: "table-span",
          pattern: /\b(rowspan|colspan|merged cell|span)\b/i,
          step: "Verify merged-cell spans preserve correct header context across rows and columns.",
        },
        {
          id: "table-summary",
          pattern: /\b(summary|complex table|multi-level header)\b/i,
          step: "Add a short summary when the table requires extra context for interpretation.",
        },
        {
          id: "table-validation",
          step: "Test cell navigation with assistive technology to confirm announced headers are accurate.",
          always: true,
        },
      ],
    },
    {
      pattern: /\b(figure|image|alt text|alternate text|artifact)\b/i,
      summary: "Image semantics need alternative-text remediation.",
      action: "Add meaningful alternate text to informative images and mark decorative graphics as artifacts.",
      followUpActions: [
        {
          id: "image-alt",
          pattern: /\b(alt text|alternate text|missing alt|no alt)\b/i,
          step: "Write concise alternate text that captures the image purpose.",
          defaultWhenNoMatch: true,
        },
        {
          id: "image-decorative",
          pattern: /\b(artifact|decorative|ornamental|background)\b/i,
          step: "Mark decorative images as artifacts so they are skipped by assistive technology.",
          defaultWhenNoMatch: true,
        },
        {
          id: "image-symbols",
          pattern: /\b(icon|symbol|equation|formula|diagram)\b/i,
          step: "Provide text equivalents for symbols, formulas, or diagram-only meaning.",
        },
        {
          id: "image-caption",
          pattern: /\b(caption|duplicate alt|repeated description)\b/i,
          step: "Avoid duplicating nearby captions unless the caption omits key information.",
        },
        {
          id: "image-order",
          pattern: /\b(reading order|figure order|tag order)\b/i,
          step: "Place informative figures in the correct reading order within the tag tree.",
        },
        {
          id: "image-validation",
          step: "Verify each informative figure exposes useful text and each decorative image is ignored.",
          always: true,
        },
      ],
    },
    {
      pattern: /\b(form|field|annotation|widget|label|tooltip|link)\b/i,
      summary: "Interactive content lacks accessible properties.",
      action: "Ensure fields, annotations, and links are tagged and include accessible labels or text equivalents.",
      followUpActions: [
        {
          id: "interactive-labels",
          pattern: /\b(form|field|label|tooltip|tu|name)\b/i,
          step: "Set accessible names and descriptions for each form control and annotation.",
          defaultWhenNoMatch: true,
        },
        {
          id: "interactive-links",
          pattern: /\b(link|hyperlink|uri|destination)\b/i,
          step: "Ensure link text or alternate descriptions communicate the destination or action.",
          defaultWhenNoMatch: true,
        },
        {
          id: "interactive-widget-role",
          pattern: /\b(widget|button|checkbox|radio|combobox|listbox)\b/i,
          step: "Confirm widget annotations are mapped to the correct interactive structure roles.",
        },
        {
          id: "interactive-focus-order",
          pattern: /\b(tab order|keyboard|focus|navigation)\b/i,
          step: "Align keyboard focus order with the visual and reading sequence.",
        },
        {
          id: "interactive-errors",
          pattern: /\b(required|error|instruction|validation message)\b/i,
          step: "Expose required state, instructions, and error text programmatically.",
        },
        {
          id: "interactive-validation",
          step: "Complete a keyboard-only pass to verify all interactive controls are reachable and understandable.",
          always: true,
        },
      ],
    },
    {
      pattern: /\b(font|unicode|cmap|encoding|glyph|text extraction)\b/i,
      summary: "Text encoding or font mapping is preventing reliable screen-reader output.",
      action: "Embed fonts and repair Unicode mappings (ToUnicode/CMap) so extracted text matches visual text.",
      followUpActions: [
        {
          id: "font-unicode-map",
          pattern: /\b(unicode|tounicode|cmap|encoding)\b/i,
          step: "Repair Unicode mappings so each visible glyph resolves to the expected character.",
          defaultWhenNoMatch: true,
        },
        {
          id: "font-embed",
          pattern: /\b(embed|embedded|missing font|subset font)\b/i,
          step: "Embed missing fonts or replace problematic subsets that break text extraction.",
          defaultWhenNoMatch: true,
        },
        {
          id: "font-ligature-symbol",
          pattern: /\b(ligature|glyph|symbol|special character)\b/i,
          step: "Validate ligatures and symbols extract to meaningful Unicode sequences.",
        },
        {
          id: "font-spacing",
          pattern: /\b(text extraction|spacing|word break|copy|paste)\b/i,
          step: "Fix text spacing and token boundaries so copied text reads naturally.",
        },
        {
          id: "font-garbled",
          pattern: /\b(garbled|mojibake|invalid character|unreadable)\b/i,
          step: "Replace or remap fonts that produce garbled output for assistive technology.",
        },
        {
          id: "font-validation",
          step: "Spot-check copied text from affected pages to confirm extraction fidelity.",
          always: true,
        },
      ],
    },
    {
      pattern: /\b(color|contrast|readability)\b/i,
      summary: "Visual readability requirements may not be met.",
      action: "Adjust color contrast and visual styling so text remains perceivable across expected reading conditions.",
      followUpActions: [
        {
          id: "color-text-contrast",
          pattern: /\b(contrast|text contrast|low contrast)\b/i,
          step: "Increase foreground/background contrast for text to meet target ratios.",
          defaultWhenNoMatch: true,
        },
        {
          id: "color-non-text-contrast",
          pattern: /\b(non-text|icon|graphic|control boundary|indicator)\b/i,
          step: "Adjust non-text graphics and control boundaries to preserve distinguishability.",
        },
        {
          id: "color-not-alone",
          pattern: /\b(color alone|color only|state by color|meaning by color)\b/i,
          step: "Add text labels, patterns, or icons so meaning is not conveyed by color alone.",
          defaultWhenNoMatch: true,
        },
        {
          id: "color-focus",
          pattern: /\b(focus|hover|active|visited|link styling)\b/i,
          step: "Ensure focus and interaction states remain clearly visible on all backgrounds.",
        },
        {
          id: "color-zoom",
          pattern: /\b(zoom|reflow|200%|400%|text spacing)\b/i,
          step: "Verify readability and contrast after zoom and reflow changes.",
        },
        {
          id: "color-validation",
          step: "Re-test affected pages with automated contrast checks and manual visual review.",
          always: true,
        },
      ],
    },
  ];
  const DEFAULT_FIX_PLAN_TEMPLATE = {
    summary: "This issue requires targeted remediation for the failing rule.",
    action: "Apply the fix required by this rule, then keep the structural semantics consistent.",
    followUpActions: [
      {
        id: "default-targeted-fix",
        step: "Correct the specific object properties and tags referenced by the failing rule.",
        defaultWhenNoMatch: true,
      },
      {
        id: "default-similar-content",
        step: "Apply the same correction pattern to nearby content with the same structure.",
        defaultWhenNoMatch: true,
      },
      {
        id: "default-validation",
        step: "Re-run validation and confirm the fix did not introduce regressions.",
        always: true,
      },
    ],
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
  let runSnapshotStore = loadRunSnapshotStoreFromStorage();
  let activeRunDeltaKey = RUN_DELTA_DEFAULT_KEY;
  let activeRunDeltaComparisonIndex = 0;
  let failedProfilesForIssueExplanation = [];
  let explainIssuesToken = null;

  initAnalytics(APP_CONFIG.gaMeasurementId);
  setupUploadDropzone();

  modeTabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const mode = tab.dataset.mode || "upload";
      setSelectedMode(mode, {
        trackChange: true,
        changeSource: "click",
      });
    });
    tab.addEventListener("keydown", handleModeTabKeydown);
  });
  document.addEventListener("click", (event) => {
    const target = event.target;
    if (!(target instanceof Element)) {
      return;
    }

    const runDeltaNavButton = target.closest(".run-delta-nav-btn");
    if (runDeltaNavButton) {
      handleRunDeltaNavigation(runDeltaNavButton);
      return;
    }

    const explainIssuesButton = target.closest(".explain-issues-btn");
    if (explainIssuesButton) {
      handleExplainIssuesClick(explainIssuesButton);
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
    const runDeltaContext = buildRunDeltaContext(selectedMode);
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

      renderResponse(response, runDeltaContext);
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

  setSelectedMode(inputModeField.value || "url", {
    trackChange: false,
  });
  renderApiInstructions();
  if (currentYear) {
    currentYear.textContent = String(new Date().getFullYear());
  }

  function setSelectedMode(mode, options) {
    const normalizedMode = mode === "upload" ? "upload" : "url";
    const previousMode = getSelectedMode();
    inputModeField.value = normalizedMode;

    modeTabs.forEach((tab) => {
      const isActive = tab.dataset.mode === normalizedMode;
      tab.classList.toggle("is-active", isActive);
      tab.setAttribute("aria-selected", String(isActive));
      tab.tabIndex = isActive ? 0 : -1;
    });

    syncModePanels();

    if (
      options
      && options.trackChange
      && previousMode !== normalizedMode
    ) {
      trackEvent("input_mode_changed", {
        input_mode: normalizedMode,
        change_source: normalizeOptionalText(options.changeSource) || "unknown",
      });
    }
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
    setSelectedMode(nextTab.dataset.mode || "upload", {
      trackChange: true,
      changeSource: "keyboard",
    });
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

  function buildRunDeltaContext(mode) {
    if (mode === "upload") {
      const uploadFile = getSelectedUploadFile();
      const uploadName = normalizeOptionalText(uploadFile && uploadFile.name);
      if (!uploadName) {
        return {
          key: RUN_DELTA_DEFAULT_KEY,
          label: "upload",
        };
      }
      return {
        key: buildRunDeltaDocumentKey(uploadName),
        label: uploadName,
      };
    }

    const rawUrl = normalizeOptionalText(pdfUrlInput.value);
    if (!rawUrl) {
      return {
        key: RUN_DELTA_DEFAULT_KEY,
        label: "url",
      };
    }

    const urlFilename = extractFilenameFromUrl(rawUrl);
    const label = urlFilename || rawUrl;
    return {
      key: buildRunDeltaDocumentKey(label),
      label,
    };
  }

  function buildRunDeltaDocumentKey(value) {
    const token = normalizeRunDeltaKeyToken(value);
    return token || RUN_DELTA_DEFAULT_KEY;
  }

  function normalizeRunDeltaKeyToken(value) {
    const normalized = normalizeOptionalText(value);
    if (!normalized) {
      return "";
    }
    return normalized.toLowerCase();
  }

  function extractFilenameFromUrl(value) {
    try {
      const url = new URL(value);
      return extractFilenameFromPath(url.pathname);
    } catch (_error) {
      return extractFilenameFromPath(value);
    }
  }

  function extractFilenameFromPath(value) {
    const normalized = normalizeOptionalText(value);
    if (!normalized) {
      return "";
    }

    const path = normalized.split("?")[0].split("#")[0];
    const segments = path.split("/").filter(Boolean);
    if (!segments.length) {
      return "";
    }

    const tail = segments[segments.length - 1];
    try {
      const decoded = decodeURIComponent(tail);
      return normalizeOptionalText(decoded) || "";
    } catch (_error) {
      return tail;
    }
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

  function renderResponse(data, runDeltaContext) {
    errorPanel.classList.add("hidden");

    const overallState = getOverallResultState(data);
    const overallBadgeClass = overallState;
    const overallBadgeText = `Overall: ${overallState.charAt(0).toUpperCase()}${overallState.slice(1)}`;
    const resultStateClass = `result-${overallState}`;
    const sortedResults = [...(data.results || [])].sort(compareProfileResultsByPreferredOrder);
    const normalizedResults = sortedResults.map((profileResult) => {
      return {
        profileResult,
        issues: normalizeIssuesForDisplay(profileResult),
      };
    });
    const runDeltaKey = runDeltaContext && runDeltaContext.key
      ? runDeltaContext.key
      : RUN_DELTA_DEFAULT_KEY;
    const currentRunSnapshot = buildRunSnapshot(data, normalizedResults, runDeltaContext);
    const existingRunHistory = getRunHistoryByDocumentKey(runSnapshotStore, runDeltaKey);
    const nextRunHistory = appendRunSnapshotToHistory(existingRunHistory, currentRunSnapshot);

    activeRunDeltaKey = runDeltaKey;
    activeRunDeltaComparisonIndex = nextRunHistory.length >= 2 ? nextRunHistory.length - 1 : 0;
    const runDeltaModel = buildRunDeltaModelFromHistory(nextRunHistory, activeRunDeltaComparisonIndex);
    const isExplainActionVisible = overallState === "mixed" || overallState === "fail";
    explainIssuesToken = normalizeOptionalText(data && data.explain_issues_token);
    failedProfilesForIssueExplanation = buildFailedProfilesForIssueExplanation(normalizedResults);
    const hasExplainableFailedProfiles = failedProfilesForIssueExplanation.length > 0;

    const headerHtml = `
      <div class="result-header">
        <div>
          <h2>Validation Results</h2>
          <span class="badge overall-badge ${overallBadgeClass}">${overallBadgeText}</span>
        </div>
        ${isExplainActionVisible ? `
          <div class="result-header-actions">
            <button
              type="button"
              class="explain-issues-btn"
              aria-controls="issues-explainer-panel"
              ${hasExplainableFailedProfiles ? "" : "disabled"}
            >
              <svg
                class="explain-issues-icon"
                viewBox="0 0 24 24"
                aria-hidden="true"
                focusable="false"
              >
                <path d="M12 2.5 14.2 8l5.8 2.2-5.8 2.2L12 18l-2.2-5.6L4 10.2 9.8 8Zm7.2 10 1 2.6 2.8 1-2.8 1-1 2.6-1-2.6-2.8-1 2.8-1ZM4.8 14.8 6 18l3.2 1.2L6 20.4l-1.2 3.1-1.2-3.1L.4 19.2 3.6 18Z"/>
              </svg>
              <span class="explain-issues-label">Explain</span>
            </button>
          </div>
        ` : ""}
      </div>
      ${isExplainActionVisible ? '<section id="issues-explainer-panel" class="issues-explainer-panel hidden" aria-live="polite"></section>' : ""}
      ${renderRunDelta(runDeltaModel)}
      <div class="profile-grid" id="profile-grid"></div>
      <p class="result-meta">${escapeHtml(data.disclaimer || "")}</p>
    `;

    resultPanel.innerHTML = headerHtml;
    resultPanel.classList.remove("result-pass", "result-fail", "result-mixed");
    resultPanel.classList.add(resultStateClass);
    resultPanel.classList.remove("hidden");
    animateResultPanel();

    const profileGrid = document.getElementById("profile-grid");
    normalizedResults.forEach(({ profileResult, issues }) => {
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

      const complianceScore = computeProfileComplianceScore(summary);
      fragment.querySelector(".metric-compliance-score").textContent = formatComplianceScore(complianceScore);
      fragment.querySelector(".metric-errors").textContent = String(summary.errors ?? 0);
      fragment.querySelector(".metric-failed-rules").textContent = String(summary.failed_rules ?? 0);
      fragment.querySelector(".metric-checked-rules").textContent = summary.checked_rules == null ? "n/a" : String(summary.checked_rules);

      const renderRoot = profileCard || fragment;
      renderProfileIssues(renderRoot, issues);
      renderRaw(renderRoot, profileResult.raw);

      profileGrid.appendChild(fragment);
    });

    runSnapshotStore[runDeltaKey] = nextRunHistory;
    saveRunSnapshotStoreToStorage(runSnapshotStore);
  }

  function buildFailedProfilesForIssueExplanation(normalizedResults) {
    if (!Array.isArray(normalizedResults)) {
      return [];
    }

    return normalizedResults
      .filter(({ profileResult }) => profileResult && profileResult.passed === false)
      .map(({ profileResult }) => {
        const raw = normalizeRawOutputForIssueExplanation(profileResult && profileResult.raw);
        if (!raw) {
          return null;
        }

        return {
          profile: normalizeOptionalText(profileResult && profileResult.profile) || "unknown-profile",
          raw,
        };
      })
      .filter(Boolean);
  }

  function normalizeRawOutputForIssueExplanation(raw) {
    if (raw == null) {
      return "";
    }

    if (typeof raw === "string") {
      return raw.trim();
    }

    try {
      return JSON.stringify(raw);
    } catch (_error) {
      return String(raw).trim();
    }
  }

  async function handleExplainIssuesClick(button) {
    const explanationPanel = document.getElementById("issues-explainer-panel");
    if (!failedProfilesForIssueExplanation.length) {
      renderIssueExplanationError(explanationPanel, "No failed profile raw output is available to summarize.");
      return;
    }

    const lambdaBaseUrl = normalizeLambdaBaseUrl(APP_CONFIG.apiBaseUrl);
    if (!lambdaBaseUrl) {
      renderIssueExplanationError(explanationPanel, "Configure APP_CONFIG.apiBaseUrl in web/app.js with your Lambda/API base URL.");
      return;
    }

    const explainIssuesUrl = buildExplainIssuesUrl(lambdaBaseUrl);
    setExplainButtonLoadingState(button, true);
    renderIssueExplanationStatus(explanationPanel, "Analyzing the XML validation report and synthesizing key issues...");

    trackEvent("explain_issues_started", {
      profile_count: failedProfilesForIssueExplanation.length,
    });

    try {
      const headers = {
        "Content-Type": "application/json",
      };
      if (explainIssuesToken) {
        headers["X-Explain-Issues-Token"] = explainIssuesToken;
      }

      const response = await requestJson(explainIssuesUrl, {
        method: "POST",
        headers,
        body: JSON.stringify({
          failed_profiles: failedProfilesForIssueExplanation,
        }),
      });
      renderIssueExplanationSummary(explanationPanel, response && response.summary);
      trackEvent("explain_issues_succeeded", {
        profile_count: failedProfilesForIssueExplanation.length,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      renderIssueExplanationError(explanationPanel, message || "Could not summarize issues.");
      trackEvent("explain_issues_failed", {
        profile_count: failedProfilesForIssueExplanation.length,
      });
    } finally {
      setExplainButtonLoadingState(button, false);
    }
  }

  function setExplainButtonLoadingState(button, isLoading) {
    const labelNode = button.querySelector(".explain-issues-label");
    const labelText = labelNode ? labelNode.textContent : button.textContent;
    const defaultLabel = button.dataset.defaultLabel || labelText || "Explain";
    button.dataset.defaultLabel = defaultLabel;

    button.disabled = Boolean(isLoading);
    button.classList.toggle("is-loading", Boolean(isLoading));
    const nextLabel = isLoading ? "Synthesizing..." : defaultLabel;
    if (labelNode) {
      labelNode.textContent = nextLabel;
      return;
    }
    button.textContent = nextLabel;
  }

  function renderIssueExplanationStatus(explanationPanel, message) {
    if (!explanationPanel) {
      return;
    }

    explanationPanel.classList.remove("hidden", "is-error");
    explanationPanel.innerHTML = `
      <p class="issues-explainer-status">${escapeHtml(message || "Analyzing XML validation report...")}</p>
    `;
  }

  function renderIssueExplanationSummary(explanationPanel, summary) {
    if (!explanationPanel) {
      return;
    }

    const normalizedSummary = normalizeOptionalText(summary);
    if (!normalizedSummary) {
      renderIssueExplanationError(explanationPanel, "The summary service returned an empty summary.");
      return;
    }

    const paragraphs = normalizedSummary
      .split(/\n{2,}/)
      .map((block) => normalizeOptionalText(block))
      .filter(Boolean)
      .map((block) => `<p>${escapeHtml(block).replace(/\n/g, "<br>")}</p>`)
      .join("");

    explanationPanel.classList.remove("hidden", "is-error");
    explanationPanel.innerHTML = `
      ${paragraphs || `<p>${escapeHtml(normalizedSummary)}</p>`}
    `;
  }

  function renderIssueExplanationError(explanationPanel, message) {
    if (!explanationPanel) {
      return;
    }

    explanationPanel.classList.remove("hidden");
    explanationPanel.classList.add("is-error");
    explanationPanel.innerHTML = `
      <p>${escapeHtml(message || "Could not summarize issues.")}</p>
    `;
  }

  function compareProfileResultsByPreferredOrder(left, right) {
    const leftProfile = left && left.profile ? String(left.profile) : "";
    const rightProfile = right && right.profile ? String(right.profile) : "";
    return compareProfileNamesByPreferredOrder(leftProfile, rightProfile);
  }

  function compareProfileNamesByPreferredOrder(leftProfile, rightProfile) {
    const leftIndex = RUN_PROFILE_ORDER.indexOf(leftProfile);
    const rightIndex = RUN_PROFILE_ORDER.indexOf(rightProfile);

    if (leftIndex >= 0 || rightIndex >= 0) {
      if (leftIndex < 0) {
        return 1;
      }
      if (rightIndex < 0) {
        return -1;
      }
      return leftIndex - rightIndex;
    }

    return leftProfile.localeCompare(rightProfile);
  }

  function buildRunSnapshot(data, normalizedResults, runDeltaContext) {
    const profiles = {};
    const runDeltaKey = runDeltaContext && runDeltaContext.key
      ? runDeltaContext.key
      : RUN_DELTA_DEFAULT_KEY;
    const runDeltaLabel = runDeltaContext && runDeltaContext.label
      ? String(runDeltaContext.label)
      : runDeltaKey;

    normalizedResults.forEach(({ profileResult, issues }) => {
      const profileName = profileResult && profileResult.profile != null
        ? String(profileResult.profile)
        : "";
      if (!profileName) {
        return;
      }
      profiles[profileName] = buildRunSnapshotProfile(profileResult, issues);
    });

    return {
      documentKey: runDeltaKey,
      documentLabel: runDeltaLabel,
      requestId: normalizeOptionalText(data && data.request_id),
      runAt: new Date().toISOString(),
      passed: Boolean(data && data.passed),
      profiles,
    };
  }

  function getRunHistoryByDocumentKey(snapshotStore, documentKey) {
    if (!snapshotStore || typeof snapshotStore !== "object") {
      return [];
    }

    if (!documentKey || typeof documentKey !== "string") {
      return [];
    }

    return normalizeRunSnapshotHistory(snapshotStore[documentKey]);
  }

  function appendRunSnapshotToHistory(runHistory, snapshot) {
    if (!isRunSnapshotRecord(snapshot)) {
      return normalizeRunSnapshotHistory(runHistory);
    }

    const normalizedHistory = normalizeRunSnapshotHistory(runHistory);
    const nextHistory = [...normalizedHistory, snapshot];
    if (nextHistory.length <= RUN_TRACK_RECORD_MAX_HISTORY) {
      return nextHistory;
    }
    return nextHistory.slice(nextHistory.length - RUN_TRACK_RECORD_MAX_HISTORY);
  }

  function buildRunDeltaModelFromHistory(runHistory, comparisonIndex) {
    const history = normalizeRunSnapshotHistory(runHistory);
    const runComplianceSeries = buildRunComplianceSeries(history);
    if (history.length < 2) {
      const currentSnapshot = history.length ? history[history.length - 1] : null;
      const baseModel = buildRunDeltaModel(currentSnapshot, null);
      return {
        ...baseModel,
        historyLength: history.length,
        totalComparisons: Math.max(0, history.length - 1),
        comparisonIndex: 0,
        comparisonNumber: 0,
        canGoOlder: false,
        canGoNewer: false,
        currentLabel: formatRunSnapshotReference(currentSnapshot),
        runComplianceSeries,
      };
    }

    const maxIndex = history.length - 1;
    const boundedIndex = clampRunDeltaComparisonIndex(comparisonIndex, maxIndex);
    const currentSnapshot = history[boundedIndex];
    const previousSnapshot = history[boundedIndex - 1];
    const baseModel = buildRunDeltaModel(currentSnapshot, previousSnapshot);

    return {
      ...baseModel,
      historyLength: history.length,
      totalComparisons: maxIndex,
      comparisonIndex: boundedIndex,
      comparisonNumber: boundedIndex,
      canGoOlder: boundedIndex > 1,
      canGoNewer: boundedIndex < maxIndex,
      currentLabel: formatRunSnapshotReference(currentSnapshot),
      previousLabel: formatRunSnapshotReference(previousSnapshot),
      runComplianceSeries,
    };
  }

  function buildRunComplianceSeries(runHistory) {
    const history = normalizeRunSnapshotHistory(runHistory);
    if (!history.length) {
      return [];
    }

    return history.map((snapshot) => computeRunSnapshotComplianceScore(snapshot));
  }

  function computeRunSnapshotComplianceScore(snapshot) {
    if (!snapshot || typeof snapshot !== "object") {
      return null;
    }

    const profiles = snapshot.profiles && typeof snapshot.profiles === "object"
      ? Object.values(snapshot.profiles)
      : [];
    if (!profiles.length) {
      return null;
    }

    let totalCheckedRules = 0;
    let totalEffectiveFailedRules = 0;
    const fallbackScores = [];

    profiles.forEach((profile) => {
      if (!profile || typeof profile !== "object") {
        return;
      }

      const summary = profile.summary && typeof profile.summary === "object"
        ? profile.summary
        : {};
      const scoreInputs = getComplianceScoreInputs(summary);
      const checkedRules = scoreInputs.checkedRules;

      if (checkedRules != null && checkedRules > 0) {
        totalCheckedRules += checkedRules;
        totalEffectiveFailedRules += Math.min(scoreInputs.effectiveFailedRules, checkedRules);
        return;
      }

      const complianceScore = computeProfileComplianceScore(summary);
      if (Number.isFinite(complianceScore)) {
        fallbackScores.push(complianceScore);
      }
    });

    if (totalCheckedRules > 0) {
      const boundedEffectiveFailedRules = Math.min(totalEffectiveFailedRules, totalCheckedRules);
      const passedRules = Math.max(0, totalCheckedRules - boundedEffectiveFailedRules);
      const weightedScore = (passedRules / totalCheckedRules) * 100;
      return Math.max(0, Math.min(100, weightedScore));
    }

    if (!fallbackScores.length) {
      return null;
    }

    const averageScore = fallbackScores.reduce((sum, score) => sum + score, 0) / fallbackScores.length;
    return Math.max(0, Math.min(100, averageScore));
  }

  function clampRunDeltaComparisonIndex(value, maxIndex) {
    const parsed = Number.parseInt(String(value), 10);
    if (!Number.isFinite(parsed)) {
      return maxIndex;
    }
    if (parsed < 1) {
      return 1;
    }
    if (parsed > maxIndex) {
      return maxIndex;
    }
    return parsed;
  }

  function buildRunSnapshotProfile(profileResult, issues) {
    const summary = profileResult && profileResult.summary && typeof profileResult.summary === "object"
      ? profileResult.summary
      : {};

    return {
      passed: Boolean(profileResult && profileResult.passed),
      summary: {
        errors: parseNonNegativeInteger(summary.errors) ?? 0,
        failedRules: parseNonNegativeInteger(summary.failed_rules) ?? 0,
        checkedRules: parseNonNegativeInteger(summary.checked_rules),
        durationMs: parseNonNegativeInteger(summary.duration_ms) ?? 0,
      },
      issueKeys: buildRunIssueKeys(issues),
    };
  }

  function buildRunIssueKeys(issues) {
    if (!Array.isArray(issues) || !issues.length) {
      return [];
    }

    const keys = [];
    const seen = new Set();

    issues.forEach((issue) => {
      const key = buildIssueFingerprint(issue);
      if (!key || seen.has(key)) {
        return;
      }

      seen.add(key);
      keys.push(key);
    });

    return keys;
  }

  function buildIssueFingerprint(issue) {
    if (!issue || typeof issue !== "object") {
      return null;
    }

    const severity = normalizeOptionalText(issue.severity) || "error";
    const ruleId = normalizeOptionalText(issue.rule_id) || "-";
    const page = normalizePositivePageNumber(issue.page);
    const location = normalizeOptionalText(issue.location) || "";
    const message = normalizeOptionalText(issue.message) || "";

    return [
      severity.toLowerCase(),
      ruleId.toLowerCase(),
      page == null ? "-" : String(page),
      location.toLowerCase(),
      message.toLowerCase(),
    ].join("|");
  }

  function buildRunDeltaModel(currentSnapshot, previousSnapshot) {
    const currentProfiles = currentSnapshot && currentSnapshot.profiles && typeof currentSnapshot.profiles === "object"
      ? currentSnapshot.profiles
      : {};
    const previousProfiles = previousSnapshot && previousSnapshot.profiles && typeof previousSnapshot.profiles === "object"
      ? previousSnapshot.profiles
      : null;
    const currentProfileNames = Object.keys(currentProfiles).sort(compareProfileNamesByPreferredOrder);

    if (!previousProfiles) {
      return {
        available: false,
        state: "unavailable",
        documentKey: normalizeOptionalText(currentSnapshot && currentSnapshot.documentKey),
        documentLabel: normalizeOptionalText(currentSnapshot && currentSnapshot.documentLabel),
      };
    }

    const profileDeltas = currentProfileNames.map((profileName) => {
      return buildProfileDelta(profileName, currentProfiles[profileName], previousProfiles[profileName] || null);
    }).filter(Boolean);

    return {
      available: true,
      state: classifyRunDeltaState(profileDeltas),
      previousLabel: formatRunSnapshotReference(previousSnapshot),
      documentKey: normalizeOptionalText(currentSnapshot && currentSnapshot.documentKey),
      documentLabel: normalizeOptionalText(
        (currentSnapshot && currentSnapshot.documentLabel)
        || (previousSnapshot && previousSnapshot.documentLabel),
      ),
      profiles: profileDeltas,
    };
  }

  function buildProfileDelta(profile, currentProfile, previousProfile) {
    if (!currentProfile || typeof currentProfile !== "object") {
      return null;
    }

    const currentSummary = currentProfile.summary && typeof currentProfile.summary === "object"
      ? currentProfile.summary
      : {};
    const hasBaseline = Boolean(previousProfile && typeof previousProfile === "object");
    const summaryDelta = hasBaseline
      ? buildSummaryDelta(currentSummary, previousProfile.summary)
      : null;
    const issueDelta = hasBaseline
      ? diffIssueKeys(currentProfile.issueKeys, previousProfile.issueKeys)
      : {
        newIssues: 0,
        resolvedIssues: 0,
        unchangedIssues: Array.isArray(currentProfile.issueKeys) ? currentProfile.issueKeys.length : 0,
      };

    return {
      profile,
      hasBaseline,
      state: hasBaseline
        ? classifyProfileDeltaState({
          errorsDelta: summaryDelta.errorsDelta,
          failedRulesDelta: summaryDelta.failedRulesDelta,
          newIssues: issueDelta.newIssues,
          resolvedIssues: issueDelta.resolvedIssues,
        })
        : "new",
      currentPassed: Boolean(currentProfile.passed),
      previousPassed: hasBaseline ? Boolean(previousProfile.passed) : null,
      currentErrors: parseNonNegativeInteger(currentSummary.errors) ?? 0,
      currentFailedRules: parseNonNegativeInteger(
        currentSummary.failedRules ?? currentSummary.failed_rules,
      ) ?? 0,
      currentCheckedRules: parseNonNegativeInteger(
        currentSummary.checkedRules ?? currentSummary.checked_rules,
      ),
      currentComplianceScore: computeProfileComplianceScore(currentSummary),
      errorsDelta: summaryDelta ? summaryDelta.errorsDelta : null,
      failedRulesDelta: summaryDelta ? summaryDelta.failedRulesDelta : null,
      checkedRulesDelta: summaryDelta ? summaryDelta.checkedRulesDelta : null,
      complianceScoreDelta: summaryDelta ? summaryDelta.complianceScoreDelta : null,
      newIssues: issueDelta.newIssues,
      resolvedIssues: issueDelta.resolvedIssues,
      unchangedIssues: issueDelta.unchangedIssues,
    };
  }

  function buildSummaryDelta(currentSummary, previousSummary) {
    const currentErrors = parseNonNegativeInteger(currentSummary && currentSummary.errors) ?? 0;
    const previousErrors = parseNonNegativeInteger(previousSummary && previousSummary.errors) ?? 0;
    const currentFailedRules = parseNonNegativeInteger(
      currentSummary && (currentSummary.failedRules ?? currentSummary.failed_rules),
    ) ?? 0;
    const previousFailedRules = parseNonNegativeInteger(
      previousSummary && (previousSummary.failedRules ?? previousSummary.failed_rules),
    ) ?? 0;
    const currentCheckedRules = parseNonNegativeInteger(
      currentSummary && (currentSummary.checkedRules ?? currentSummary.checked_rules),
    );
    const previousCheckedRules = parseNonNegativeInteger(
      previousSummary && (previousSummary.checkedRules ?? previousSummary.checked_rules),
    );
    const currentComplianceScore = computeProfileComplianceScore(currentSummary);
    const previousComplianceScore = computeProfileComplianceScore(previousSummary);

    return {
      errorsDelta: currentErrors - previousErrors,
      failedRulesDelta: currentFailedRules - previousFailedRules,
      checkedRulesDelta: currentCheckedRules == null || previousCheckedRules == null
        ? null
        : currentCheckedRules - previousCheckedRules,
      complianceScoreDelta: currentComplianceScore == null || previousComplianceScore == null
        ? null
        : roundDelta(currentComplianceScore - previousComplianceScore, 1),
    };
  }

  function diffIssueKeys(currentIssueKeys, previousIssueKeys) {
    const currentSet = new Set(Array.isArray(currentIssueKeys) ? currentIssueKeys : []);
    const previousSet = new Set(Array.isArray(previousIssueKeys) ? previousIssueKeys : []);
    let newIssues = 0;
    let resolvedIssues = 0;

    currentSet.forEach((issueKey) => {
      if (!previousSet.has(issueKey)) {
        newIssues += 1;
      }
    });

    previousSet.forEach((issueKey) => {
      if (!currentSet.has(issueKey)) {
        resolvedIssues += 1;
      }
    });

    return {
      newIssues,
      resolvedIssues,
      unchangedIssues: Math.max(0, currentSet.size - newIssues),
    };
  }

  function classifyProfileDeltaState(delta) {
    const errorsDelta = delta && Number.isFinite(delta.errorsDelta) ? delta.errorsDelta : 0;
    const failedRulesDelta = delta && Number.isFinite(delta.failedRulesDelta) ? delta.failedRulesDelta : 0;
    const newIssues = delta && Number.isFinite(delta.newIssues) ? delta.newIssues : 0;
    const resolvedIssues = delta && Number.isFinite(delta.resolvedIssues) ? delta.resolvedIssues : 0;

    const improvementScore = Math.max(0, -errorsDelta) + Math.max(0, -failedRulesDelta) + Math.max(0, resolvedIssues);
    const regressionScore = Math.max(0, errorsDelta) + Math.max(0, failedRulesDelta) + Math.max(0, newIssues);

    if (improvementScore === 0 && regressionScore === 0) {
      return "unchanged";
    }
    if (improvementScore > regressionScore) {
      return "improved";
    }
    if (regressionScore > improvementScore) {
      return "regressed";
    }
    return "mixed";
  }

  function classifyRunDeltaState(profileDeltas) {
    let improvedCount = 0;
    let regressedCount = 0;
    let mixedCount = 0;

    profileDeltas.forEach((profileDelta) => {
      if (!profileDelta || !profileDelta.hasBaseline) {
        return;
      }
      if (profileDelta.state === "improved") {
        improvedCount += 1;
        return;
      }
      if (profileDelta.state === "regressed") {
        regressedCount += 1;
        return;
      }
      if (profileDelta.state === "mixed") {
        mixedCount += 1;
      }
    });

    if (regressedCount > 0 && improvedCount === 0 && mixedCount === 0) {
      return "regressed";
    }
    if (improvedCount > 0 && regressedCount === 0 && mixedCount === 0) {
      return "improved";
    }
    if (regressedCount === 0 && improvedCount === 0 && mixedCount === 0) {
      return "unchanged";
    }
    return "mixed";
  }

  function handleRunDeltaNavigation(button) {
    if (!(button instanceof HTMLElement)) {
      return;
    }

    const direction = String(button.dataset.direction || "").toLowerCase();
    const runHistory = getRunHistoryByDocumentKey(runSnapshotStore, activeRunDeltaKey);
    if (!runHistory.length) {
      return;
    }

    const maxIndex = runHistory.length - 1;
    if (maxIndex < 1) {
      return;
    }

    if (direction === "older" && activeRunDeltaComparisonIndex > 1) {
      activeRunDeltaComparisonIndex -= 1;
    } else if (direction === "newer" && activeRunDeltaComparisonIndex < maxIndex) {
      activeRunDeltaComparisonIndex += 1;
    } else {
      return;
    }

    trackEvent("run_delta_navigation", {
      direction,
      comparison_index: activeRunDeltaComparisonIndex,
      max_comparison_index: maxIndex,
    });
    rerenderRunDeltaSection({ expanded: true });
  }

  function rerenderRunDeltaSection(options) {
    const runDeltaElement = resultPanel.querySelector(".run-delta");
    if (!runDeltaElement) {
      return;
    }

    const runHistory = getRunHistoryByDocumentKey(runSnapshotStore, activeRunDeltaKey);
    const runDeltaModel = buildRunDeltaModelFromHistory(runHistory, activeRunDeltaComparisonIndex);
    activeRunDeltaComparisonIndex = runDeltaModel && Number.isFinite(runDeltaModel.comparisonIndex)
      ? runDeltaModel.comparisonIndex
      : activeRunDeltaComparisonIndex;

    const shouldExpand = options && typeof options.expanded === "boolean"
      ? options.expanded
      : runDeltaElement.hasAttribute("open");
    runDeltaElement.outerHTML = renderRunDelta(runDeltaModel, {
      expanded: shouldExpand,
    });
  }

  function renderRunDelta(deltaModel, options) {
    const shouldExpand = Boolean(options && options.expanded);
    const openAttribute = shouldExpand ? " open" : "";
    const summaryTitleHtml = renderRunDeltaSummaryTitle(deltaModel);
    if (!deltaModel || !deltaModel.available) {
      return `
        <details class="run-delta run-delta-unavailable" aria-label="Track Record"${openAttribute}>
          <summary class="run-delta-summary">
            ${summaryTitleHtml}
            <span class="run-delta-summary-toggle" aria-hidden="true"></span>
          </summary>
          <div class="run-delta-body">
            <p class="run-delta-note">Run validation again with the same document to compare against the previous run.</p>
          </div>
        </details>
      `;
    }

    const trackRecordProfiles = getTrackRecordProfiles(deltaModel.profiles);
    const profileCardsHtml = trackRecordProfiles.length
      ? trackRecordProfiles.map((profileDelta) => renderRunDeltaProfile(profileDelta)).join("")
      : "<p class=\"run-delta-note\">No comparable profiles were found.</p>";
    const headerStatesHtml = renderRunDeltaHeaderStates(trackRecordProfiles);
    const historyNavigatorHtml = renderRunDeltaHistoryNavigator(deltaModel);

    return `
      <details class="run-delta run-delta-${escapeHtml(deltaModel.state)}" aria-label="Track Record"${openAttribute}>
        <summary class="run-delta-summary">
          ${summaryTitleHtml}
          ${headerStatesHtml}
          <span class="run-delta-summary-toggle" aria-hidden="true"></span>
        </summary>
        <div class="run-delta-body">
          ${historyNavigatorHtml}
          <div class="run-delta-grid">
            ${profileCardsHtml}
          </div>
        </div>
      </details>
    `;
  }

  function renderRunDeltaSummaryTitle(deltaModel) {
    const sparklineHtml = renderRunDeltaSummarySparkline(deltaModel);
    if (!sparklineHtml) {
      return "<span class=\"run-delta-summary-title\">Track Record</span>";
    }

    return `
      <span class="run-delta-summary-title-group">
        <span class="run-delta-summary-title">Track Record</span>
        ${sparklineHtml}
      </span>
    `;
  }

  function renderRunDeltaSummarySparkline(deltaModel) {
    if (
      !deltaModel
      || !Number.isFinite(deltaModel.totalComparisons)
      || deltaModel.totalComparisons <= 1
    ) {
      return "";
    }

    const runComplianceSeries = Array.isArray(deltaModel.runComplianceSeries)
      ? deltaModel.runComplianceSeries
      : [];
    const sparklineModel = buildRunDeltaSparklineModel(runComplianceSeries);
    if (!sparklineModel) {
      return "";
    }

    const preferredIndex = Number.isFinite(deltaModel.comparisonIndex)
      ? deltaModel.comparisonIndex
      : runComplianceSeries.length - 1;
    const boundedIndex = Math.max(0, Math.min(preferredIndex, runComplianceSeries.length - 1));
    const selectedPoint = sparklineModel.points[boundedIndex];
    const selectedScore = Number.isFinite(runComplianceSeries[boundedIndex])
      ? runComplianceSeries[boundedIndex]
      : null;
    const selectedScoreLabel = formatComplianceScore(selectedScore);
    const minScoreLabel = formatComplianceScore(sparklineModel.minScore);
    const maxScoreLabel = formatComplianceScore(sparklineModel.maxScore);
    const trendLabel = `Compliance score trend across ${runComplianceSeries.length} runs. Current: ${selectedScoreLabel}. Range: ${minScoreLabel} to ${maxScoreLabel}.`;

    return `
      <span class="run-delta-title-sparkline" role="img" aria-label="${escapeHtml(trendLabel)}">
        <svg
          class="run-delta-sparkline"
          viewBox="0 0 ${sparklineModel.width} ${sparklineModel.height}"
          aria-hidden="true"
          focusable="false"
        >
          <path
            class="run-delta-sparkline-track"
            d="M ${sparklineModel.paddingX} ${sparklineModel.height - sparklineModel.paddingY} L ${sparklineModel.width - sparklineModel.paddingX} ${sparklineModel.height - sparklineModel.paddingY}"
          ></path>
          <path class="run-delta-sparkline-line" d="${sparklineModel.linePath}"></path>
          ${selectedPoint
            ? `<circle class="run-delta-sparkline-dot" cx="${formatSparklineCoordinate(selectedPoint.x)}" cy="${formatSparklineCoordinate(selectedPoint.y)}" r="1.9"></circle>`
            : ""}
        </svg>
        <span class="run-delta-sparkline-value">${escapeHtml(selectedScoreLabel)}</span>
      </span>
    `;
  }

  function buildRunDeltaSparklineModel(scoreSeries) {
    if (!Array.isArray(scoreSeries) || scoreSeries.length < 2) {
      return null;
    }

    const numericScores = scoreSeries.filter((score) => Number.isFinite(score));
    if (numericScores.length < 2) {
      return null;
    }

    const width = 122;
    const height = 24;
    const paddingX = 2;
    const paddingY = 3;
    const innerWidth = Math.max(1, width - (paddingX * 2));
    const innerHeight = Math.max(1, height - (paddingY * 2));
    const minScore = Math.min(...numericScores);
    const maxScore = Math.max(...numericScores);
    const scoreRange = maxScore - minScore;
    const step = scoreSeries.length > 1 ? innerWidth / (scoreSeries.length - 1) : 0;

    const points = scoreSeries.map((score, index) => {
      if (!Number.isFinite(score)) {
        return null;
      }

      const x = paddingX + (step * index);
      const y = scoreRange === 0
        ? paddingY + (innerHeight / 2)
        : paddingY + (((maxScore - score) / scoreRange) * innerHeight);

      return {
        x,
        y,
      };
    });

    const linePath = buildSparklinePathFromPoints(points);
    if (!linePath) {
      return null;
    }

    return {
      width,
      height,
      paddingX,
      paddingY,
      points,
      linePath,
      minScore,
      maxScore,
    };
  }

  function buildSparklinePathFromPoints(points) {
    if (!Array.isArray(points) || points.length === 0) {
      return "";
    }

    const segments = [];
    let currentSegment = [];

    points.forEach((point) => {
      if (!point) {
        if (currentSegment.length > 0) {
          segments.push(currentSegment);
          currentSegment = [];
        }
        return;
      }

      currentSegment.push(point);
    });

    if (currentSegment.length > 0) {
      segments.push(currentSegment);
    }

    return segments.map((segment) => {
      if (!segment.length) {
        return "";
      }

      return segment.map((point, index) => {
        const command = index === 0 ? "M" : "L";
        return `${command} ${formatSparklineCoordinate(point.x)} ${formatSparklineCoordinate(point.y)}`;
      }).join(" ");
    }).filter(Boolean).join(" ");
  }

  function formatSparklineCoordinate(value) {
    if (!Number.isFinite(value)) {
      return 0;
    }
    return Number.parseFloat(value.toFixed(2));
  }

  function renderRunDeltaHistoryNavigator(deltaModel) {
    if (
      !deltaModel
      || !deltaModel.available
      || !Number.isFinite(deltaModel.totalComparisons)
      || deltaModel.totalComparisons <= 1
    ) {
      return "";
    }

    return `
      <div class="run-delta-nav" role="group" aria-label="Track Record history navigation">
        <button
          type="button"
          class="run-delta-nav-btn"
          data-direction="older"
          ${deltaModel.canGoOlder ? "" : "disabled"}
        >
          &larr; Older
        </button>
        <button
          type="button"
          class="run-delta-nav-btn"
          data-direction="newer"
          ${deltaModel.canGoNewer ? "" : "disabled"}
        >
          Newer &rarr;
        </button>
      </div>
    `;
  }

  function getTrackRecordProfiles(profileDeltas) {
    if (!Array.isArray(profileDeltas) || profileDeltas.length === 0) {
      return [];
    }

    const profileByName = new Map();
    profileDeltas.forEach((profileDelta) => {
      if (!profileDelta || !profileDelta.profile) {
        return;
      }
      profileByName.set(String(profileDelta.profile), profileDelta);
    });

    return RUN_PROFILE_ORDER
      .map((profileName) => profileByName.get(profileName))
      .filter(Boolean);
  }

  function renderRunDeltaHeaderStates(profileDeltas) {
    if (!Array.isArray(profileDeltas) || profileDeltas.length === 0) {
      return "";
    }

    return `
      <span class="run-delta-header-states" aria-label="Track Record profile states">
        ${profileDeltas.map((profileDelta) => renderRunDeltaHeaderStateItem(profileDelta)).join("")}
      </span>
    `;
  }

  function renderRunDeltaHeaderStateItem(profileDelta) {
    if (!profileDelta) {
      return "";
    }

    const profileName = escapeHtml(formatProfileName(profileDelta.profile));
    const stateClass = getDeltaBadgeClass(profileDelta.state);
    const stateLabel = getDeltaBadgeLabel(profileDelta.state);

    return `
      <span class="run-delta-header-state">
        <span class="run-delta-state-name">${profileName}</span>
        <span class="badge run-delta-profile-badge ${stateClass}">${stateLabel}</span>
      </span>
    `;
  }

  function renderRunDeltaProfile(profileDelta) {
    if (!profileDelta) {
      return "";
    }

    const profileName = escapeHtml(formatProfileName(profileDelta.profile));
    const stateClass = getDeltaBadgeClass(profileDelta.state);
    const stateLabel = getDeltaBadgeLabel(profileDelta.state);
    const transitionLabel = getDeltaTransitionLabel(profileDelta.currentPassed, profileDelta.previousPassed);

    if (!profileDelta.hasBaseline) {
      return `
        <article class="run-delta-profile run-delta-profile-new">
          <header class="run-delta-profile-header">
            <h4>${profileName}</h4>
            <span class="badge run-delta-profile-badge mixed">${stateLabel}</span>
          </header>
          <p class="run-delta-transition">No baseline profile in the previous run.</p>
        </article>
      `;
    }

    return `
      <article class="run-delta-profile run-delta-profile-${escapeHtml(profileDelta.state)}">
        <header class="run-delta-profile-header">
          <h4>${profileName}</h4>
          <span class="badge run-delta-profile-badge ${stateClass}">${stateLabel}</span>
        </header>
        <p class="run-delta-transition">${escapeHtml(transitionLabel)}</p>
        <ul class="run-delta-metric-list">
          ${renderRunDeltaMetric("Errors", profileDelta.errorsDelta, {
            direction: "down",
            currentValue: profileDelta.currentErrors,
          })}
          ${renderRunDeltaMetric("Failed rules", profileDelta.failedRulesDelta, {
            direction: "down",
            currentValue: profileDelta.currentFailedRules,
          })}
          ${renderRunDeltaMetric("Compliance score", profileDelta.complianceScoreDelta, {
            direction: "up",
            suffix: "%",
            currentValue: profileDelta.currentComplianceScore,
            currentValueFormatter: formatComplianceScore,
          })}
          ${renderRunDeltaMetric("New issues", profileDelta.newIssues, { direction: "down", showSign: false })}
          ${renderRunDeltaMetric("Resolved issues", profileDelta.resolvedIssues, { direction: "up", showSign: false })}
          ${renderRunDeltaMetric("Unchanged issues", profileDelta.unchangedIssues, { direction: "neutral", showSign: false })}
        </ul>
      </article>
    `;
  }

  function renderRunDeltaMetric(label, value, options) {
    const direction = options && options.direction ? options.direction : "neutral";
    const suffix = options && options.suffix ? options.suffix : "";
    const showSign = !options || options.showSign !== false;
    const className = getMetricDeltaClass(value, direction);
    const valueLabel = formatSignedNumber(value, suffix, showSign);
    const hasCurrentValue = Boolean(
      options && Object.prototype.hasOwnProperty.call(options, "currentValue"),
    );
    const metricValueLabel = hasCurrentValue
      ? formatCurrentValueWithDeltaPercentage(options.currentValue, value, options)
      : valueLabel;

    return `
      <li>
        <span>${escapeHtml(label)}</span>
        <span class="run-delta-metric-values">
          <strong class="run-delta-pill run-delta-pill-${className}">${escapeHtml(metricValueLabel)}</strong>
        </span>
      </li>
    `;
  }

  function getMetricDeltaClass(value, direction) {
    if (!Number.isFinite(value) || value === 0 || direction === "neutral") {
      return "neutral";
    }

    if (direction === "down") {
      return value < 0 ? "good" : "bad";
    }
    if (direction === "up") {
      return value > 0 ? "good" : "bad";
    }

    return "neutral";
  }

  function formatSignedNumber(value, suffix, showSign) {
    if (!Number.isFinite(value)) {
      return "n/a";
    }

    const prefix = showSign && value > 0 ? "+" : "";
    return `${prefix}${value}${suffix || ""}`;
  }

  function formatCurrentMetricValue(value, options) {
    if (options && typeof options.currentValueFormatter === "function") {
      return options.currentValueFormatter(value);
    }
    if (!Number.isFinite(value)) {
      return "n/a";
    }

    const suffix = options && options.currentSuffix ? options.currentSuffix : "";
    return `${value}${suffix}`;
  }

  function formatCurrentValueWithDeltaPercentage(currentValue, deltaValue, options) {
    const currentValueLabel = formatCurrentMetricValue(currentValue, options);
    const deltaPercentageLabel = formatDeltaPercentageFromDelta(currentValue, deltaValue);
    return `${currentValueLabel} (${deltaPercentageLabel})`;
  }

  function formatDeltaPercentageFromDelta(currentValue, deltaValue) {
    if (!Number.isFinite(currentValue) || !Number.isFinite(deltaValue)) {
      return "n/a";
    }

    const previousValue = currentValue - deltaValue;
    if (!Number.isFinite(previousValue)) {
      return "n/a";
    }

    if (previousValue === 0) {
      return currentValue === 0 ? "0%" : "n/a";
    }

    const rawPercentage = (deltaValue / previousValue) * 100;
    const roundedPercentage = roundDelta(rawPercentage, 1);
    if (!Number.isFinite(roundedPercentage)) {
      return "n/a";
    }

    if (Number.isInteger(roundedPercentage)) {
      return `${roundedPercentage}%`;
    }
    return `${roundedPercentage.toFixed(1)}%`;
  }

  function roundDelta(value, decimalPlaces) {
    if (!Number.isFinite(value)) {
      return null;
    }

    const factor = 10 ** Math.max(0, decimalPlaces || 0);
    const rounded = Math.round(value * factor) / factor;
    return Object.is(rounded, -0) ? 0 : rounded;
  }

  function getDeltaBadgeClass(state) {
    if (state === "improved") {
      return "improved";
    }
    if (state === "regressed") {
      return "regressed";
    }
    if (state === "unchanged") {
      return "unchanged";
    }
    return "mixed";
  }

  function getDeltaBadgeLabel(state) {
    if (state === "improved") {
      return "Improved";
    }
    if (state === "regressed") {
      return "Regressed";
    }
    if (state === "unchanged") {
      return "Unchanged";
    }
    if (state === "new") {
      return "New Profile";
    }
    if (state === "unavailable") {
      return "Baseline pending";
    }
    return "Mixed";
  }

  function getDeltaTransitionLabel(currentPassed, previousPassed) {
    const currentStatus = currentPassed ? "Pass" : "Fail";
    if (previousPassed == null) {
      return `Current status: ${currentStatus}`;
    }

    const previousStatus = previousPassed ? "Pass" : "Fail";
    if (previousStatus === currentStatus) {
      return `Status unchanged: ${currentStatus}`;
    }
    return `Status changed: ${previousStatus} → ${currentStatus}`;
  }

  function formatRunSnapshotReference(snapshot) {
    const timestamp = formatRunTimestamp(snapshot && snapshot.runAt);

    if (timestamp) {
      return timestamp;
    }
    return "the previous run";
  }

  function formatRunTimestamp(value) {
    const date = new Date(value || "");
    if (!Number.isFinite(date.getTime())) {
      return "";
    }
    return date.toLocaleString();
  }

  function loadRunSnapshotStoreFromStorage() {
    try {
      const storage = window.localStorage;
      if (!storage) {
        return {};
      }

      const raw = storage.getItem(RUN_DELTA_STORAGE_KEY);
      if (!raw) {
        return {};
      }

      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") {
        return {};
      }

      const keyedSnapshots = parsed.snapshotsByDocumentKey;
      if (keyedSnapshots && typeof keyedSnapshots === "object") {
        return normalizeRunSnapshotStore(keyedSnapshots);
      }

      if (isRunSnapshotRecord(parsed)) {
        const key = buildRunDeltaDocumentKey(
          parsed.documentKey || parsed.documentLabel || RUN_DELTA_DEFAULT_KEY,
        );
        return {
          [key]: [parsed],
        };
      }

      return {};
    } catch (_error) {
      return {};
    }
  }

  function saveRunSnapshotStoreToStorage(snapshotStore) {
    if (!snapshotStore || typeof snapshotStore !== "object") {
      return;
    }

    try {
      const storage = window.localStorage;
      if (!storage) {
        return;
      }
      const normalizedStore = normalizeRunSnapshotStore(snapshotStore);
      storage.setItem(
        RUN_DELTA_STORAGE_KEY,
        JSON.stringify({
          snapshotsByDocumentKey: normalizedStore,
        }),
      );
    } catch (_error) {
      // Ignore storage quota/privacy errors.
    }
  }

  function normalizeRunSnapshotStore(snapshotStore) {
    if (!snapshotStore || typeof snapshotStore !== "object") {
      return {};
    }

    const normalizedStore = {};
    Object.entries(snapshotStore).forEach(([key, snapshotOrHistory]) => {
      const history = normalizeRunSnapshotHistory(snapshotOrHistory);
      if (!history.length) {
        return;
      }

      const latestSnapshot = history[history.length - 1];
      const normalizedKey = buildRunDeltaDocumentKey(
        key || latestSnapshot.documentKey || latestSnapshot.documentLabel || RUN_DELTA_DEFAULT_KEY,
      );
      normalizedStore[normalizedKey] = history;
    });

    return normalizedStore;
  }

  function normalizeRunSnapshotHistory(snapshotOrHistory) {
    if (Array.isArray(snapshotOrHistory)) {
      return snapshotOrHistory.filter((snapshot) => isRunSnapshotRecord(snapshot));
    }

    if (isRunSnapshotRecord(snapshotOrHistory)) {
      return [snapshotOrHistory];
    }

    return [];
  }

  function isRunSnapshotRecord(value) {
    if (!value || typeof value !== "object") {
      return false;
    }

    return Boolean(value.profiles && typeof value.profiles === "object");
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

      const ruleEvidence = buildIssueRuleEvidencePayload(normalizedIssue, ruleData, matchedEntry);
      if (ruleEvidence) {
        normalizedIssue.rule_evidence = ruleEvidence;
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
      const ruleMetadata = extractRuleMetadataFromNode(ruleNode);

      const existing = ruleDataByRuleId.get(ruleId) || {
        tags: [],
        entries: [],
        failedChecks: null,
        specification: null,
        clause: null,
        testNumber: null,
        description: null,
        test: null,
        object: null,
      };
      const mergedTags = dedupeCategoryValues([...existing.tags, ...ruleTags]);
      const mergedEntries = [...existing.entries, ...failedEntries];
      const mergedFailedChecks = sumNullableCounts(existing.failedChecks, failedChecks);
      const mergedRuleData = {
        tags: mergedTags,
        entries: mergedEntries,
        failedChecks: mergedFailedChecks,
        specification: coalesceText(existing.specification, ruleMetadata.specification),
        clause: coalesceText(existing.clause, ruleMetadata.clause),
        testNumber: coalesceText(existing.testNumber, ruleMetadata.testNumber),
        description: coalesceText(existing.description, ruleMetadata.description),
        test: coalesceText(existing.test, ruleMetadata.test),
        object: coalesceText(existing.object, ruleMetadata.object),
      };

      if (!mergedTags.length && !mergedEntries.length && mergedFailedChecks == null && !hasRuleMetadata(mergedRuleData)) {
        return;
      }

      ruleDataByRuleId.set(ruleId, mergedRuleData);
    });

    return ruleDataByRuleId;
  }

  function extractRuleMetadataFromNode(ruleNode) {
    return {
      specification: normalizeOptionalText(ruleNode.getAttribute("specification")),
      clause: normalizeOptionalText(ruleNode.getAttribute("clause")),
      testNumber: normalizeOptionalText(ruleNode.getAttribute("testNumber")),
      description: getFirstDirectChildText(ruleNode, "description"),
      test: getFirstDirectChildText(ruleNode, "test"),
      object: getFirstDirectChildText(ruleNode, "object"),
    };
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

      return normalizeEvidenceEntry({
        location,
        message,
        page: extractPageNumber(location || message),
        type: String(entryNode.localName || entryNode.nodeName || "entry").toLowerCase(),
        status: normalizeOptionalText(entryNode.getAttribute("status")) || "failed",
      });
    }).filter(Boolean);
  }

  function extractFailedChecksFromRuleNode(ruleNode, fallbackCount) {
    const explicitFailedChecks = parseNonNegativeInteger(ruleNode.getAttribute("failedChecks"));
    if (explicitFailedChecks != null) {
      return explicitFailedChecks;
    }

    const fallbackFailedChecks = parseNonNegativeInteger(fallbackCount);
    return fallbackFailedChecks;
  }

  function computeProfileComplianceScore(summary) {
    const scoreInputs = getComplianceScoreInputs(summary);
    const checkedRules = scoreInputs.checkedRules;
    if (checkedRules == null || checkedRules <= 0) {
      return null;
    }

    const boundedEffectiveFailedRules = Math.min(scoreInputs.effectiveFailedRules, checkedRules);
    const passedRules = Math.max(0, checkedRules - boundedEffectiveFailedRules);
    const score = (passedRules / checkedRules) * 100;
    return Math.max(0, Math.min(100, score));
  }

  function getComplianceScoreInputs(summary) {
    const checkedRules = parseNonNegativeInteger(
      summary && (summary.checked_rules ?? summary.checkedRules),
    );
    const failedRules = parseNonNegativeInteger(
      summary && (summary.failed_rules ?? summary.failedRules),
    ) ?? 0;
    const errors = parseNonNegativeInteger(summary && summary.errors) ?? 0;
    const additionalFailedChecks = Math.max(0, errors - failedRules);
    const weightedAdditionalFailedChecks = additionalFailedChecks * COMPLIANCE_ERROR_WEIGHT;

    return {
      checkedRules,
      effectiveFailedRules: failedRules + weightedAdditionalFailedChecks,
    };
  }

  function formatComplianceScore(score) {
    if (!Number.isFinite(score)) {
      return "n/a";
    }

    const rounded = Math.round(score * 10) / 10;
    if (Number.isInteger(rounded)) {
      return `${rounded}%`;
    }
    return `${rounded.toFixed(1)}%`;
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

  function normalizeOptionalText(value) {
    if (value == null) {
      return null;
    }

    const normalized = String(value).trim();
    return normalized ? normalized : null;
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

  function coalesceText(first, second) {
    return normalizeOptionalText(first) || normalizeOptionalText(second);
  }

  function hasRuleMetadata(ruleData) {
    if (!ruleData) {
      return false;
    }

    return Boolean(
      ruleData.specification
      || ruleData.clause
      || ruleData.testNumber
      || ruleData.description
      || ruleData.test
      || ruleData.object
    );
  }

  function buildIssueRuleEvidencePayload(issue, ruleData, matchedEntry) {
    if (!ruleData) {
      return null;
    }

    const evidenceEntries = collectRuleEvidenceEntries(ruleData.entries, matchedEntry);
    const payload = {
      ruleId: normalizeOptionalText(issue && issue.rule_id),
      specification: normalizeOptionalText(ruleData.specification),
      clause: normalizeOptionalText(ruleData.clause),
      testNumber: normalizeOptionalText(ruleData.testNumber),
      description: normalizeOptionalText(ruleData.description),
      test: normalizeOptionalText(ruleData.test),
      object: normalizeOptionalText(ruleData.object),
      failedChecks: parseNonNegativeInteger(ruleData.failedChecks),
      entries: evidenceEntries,
    };

    if (!hasIssueRuleEvidencePayload(payload)) {
      return null;
    }
    return payload;
  }

  function hasIssueRuleEvidencePayload(payload) {
    if (!payload) {
      return false;
    }

    return Boolean(
      payload.ruleId
      || payload.specification
      || payload.clause
      || payload.testNumber
      || payload.description
      || payload.test
      || payload.object
      || payload.failedChecks != null
      || (Array.isArray(payload.entries) && payload.entries.length)
    );
  }

  function collectRuleEvidenceEntries(entries, matchedEntry) {
    const evidenceEntries = [];
    const normalizedMatchedEntry = normalizeEvidenceEntry(matchedEntry);

    if (normalizedMatchedEntry) {
      evidenceEntries.push(normalizedMatchedEntry);
    }

    if (!Array.isArray(entries) || !entries.length) {
      return evidenceEntries;
    }

    for (const entry of entries) {
      if (evidenceEntries.length >= 5) {
        break;
      }

      const normalizedEntry = normalizeEvidenceEntry(entry);
      if (!normalizedEntry) {
        continue;
      }

      if (
        normalizedMatchedEntry
        && areEvidenceEntriesEquivalent(normalizedEntry, normalizedMatchedEntry)
      ) {
        continue;
      }

      evidenceEntries.push(normalizedEntry);
    }

    return evidenceEntries;
  }

  function normalizeEvidenceEntry(entry) {
    if (!entry || typeof entry !== "object") {
      return null;
    }

    const normalizedEntry = {
      location: normalizeOptionalText(entry.location),
      message: normalizeOptionalText(entry.message),
      page: normalizePositivePageNumber(entry.page),
      type: normalizeOptionalText(entry.type),
      status: normalizeOptionalText(entry.status),
    };

    if (
      normalizedEntry.location == null
      && normalizedEntry.message == null
      && normalizedEntry.page == null
      && normalizedEntry.type == null
      && normalizedEntry.status == null
    ) {
      return null;
    }

    return normalizedEntry;
  }

  function areEvidenceEntriesEquivalent(left, right) {
    if (!left || !right) {
      return false;
    }

    return (
      left.location === right.location
      && left.message === right.message
      && left.page === right.page
      && left.type === right.type
      && left.status === right.status
    );
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
    const breakdownGrid = renderRoot.querySelector(".breakdown-grid");
    if (!categoryList) {
      return;
    }

    const categoryCounts = countByMany(
      issues,
      (issue) => getIssueCategories(issue),
      UNCATEGORIZED_CATEGORY,
    );

    const hasCategories = Object.keys(categoryCounts).length > 0;
    if (breakdownGrid) {
      breakdownGrid.hidden = !hasCategories;
    }
    categoryList.hidden = !hasCategories;
    categoryList.innerHTML = buildChipList(categoryCounts, activeCategory);
  }

  function renderIssues(renderRoot, issues, activeCategory) {
    const issuesBody = renderRoot.querySelector(".issues-body");
    const details = renderRoot.querySelector(".issues-details");
    if (!issuesBody || !details) {
      return;
    }

    if (!issues.length) {
      if (activeCategory == null) {
        details.hidden = true;
        details.open = false;
        issuesBody.innerHTML = "";
        return;
      }

      const categoryLabel = activeCategory == null ? null : getCategoryLabel(activeCategory);
      const filterMessage = activeCategory == null
        ? " for this profile"
        : ` for category "${escapeHtml(categoryLabel)}"`;
      issuesBody.innerHTML = `<tr><td colspan="4">No issues found${filterMessage}.</td></tr>`;
      details.hidden = false;
      details.open = true;
      return;
    }

    details.hidden = false;
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
        </tr>
        <tr class="issue-message-row ${stripeClass}">
          <td colspan="4">
            <div class="issue-message">${escapeHtml(issue.message || "")}</div>
          </td>
        </tr>
        <tr class="issue-category-row ${stripeClass}">
          <td colspan="4">
            <div class="issue-category-row-content">${renderIssueCategoryPills(issue)}</div>
          </td>
        </tr>
        <tr class="issue-fix-plan-row ${stripeClass}">
          <td colspan="4">
            ${renderIssueFixPlan(issue)}
            ${renderIssueRuleEvidence(issue)}
          </td>
        </tr>
        ${isLastIssue ? "" : `
        <tr class="issue-gap-row" aria-hidden="true">
          <td colspan="4"></td>
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

  function renderIssueRuleEvidence(issue) {
    const evidence = buildIssueRuleEvidenceDrawerModel(issue);
    if (!evidence) {
      return "";
    }

    const facts = buildIssueRuleEvidenceFacts(evidence);
    const factsHtml = facts.length
      ? `<ul class="issue-fix-steps">${facts.map((fact) => `<li>${escapeHtml(fact)}</li>`).join("")}</ul>`
      : "";

    const entriesHtml = evidence.entries.length
      ? `
        <p>${escapeHtml(buildIssueRuleEvidenceEntriesLabel(evidence.entries.length))}</p>
        <ol class="issue-fix-steps">
          ${evidence.entries.map((entry, index) => `<li>${escapeHtml(formatIssueRuleEvidenceEntry(entry, index))}</li>`).join("")}
        </ol>
      `
      : "";

    return `
      <details class="issue-fix-plan issue-rule-evidence">
        <summary>Details</summary>
        <div class="issue-fix-plan-body">
          ${factsHtml}
          ${entriesHtml}
        </div>
      </details>
    `;
  }

  function buildIssueRuleEvidenceDrawerModel(issue) {
    const sourceEvidence = issue && issue.rule_evidence && typeof issue.rule_evidence === "object"
      ? issue.rule_evidence
      : null;

    const failedChecks = parseNonNegativeInteger(
      sourceEvidence && sourceEvidence.failedChecks != null
        ? sourceEvidence.failedChecks
        : issue && issue.failed_checks,
    );

    const categories = getIssueCategories(issue);
    const entries = buildIssueRuleEvidenceEntries(issue, sourceEvidence);
    const model = {
      ruleId: normalizeOptionalText(
        (sourceEvidence && sourceEvidence.ruleId)
        || (issue && issue.rule_id),
      ),
      severity: normalizeOptionalText(issue && issue.severity),
      category: categories.length ? categories.join(", ") : null,
      failedChecks,
      page: normalizePositivePageNumber(issue && issue.page),
      location: normalizeOptionalText(issue && issue.location),
      message: normalizeOptionalText(issue && issue.message),
      specification: normalizeOptionalText(sourceEvidence && sourceEvidence.specification),
      clause: normalizeOptionalText(sourceEvidence && sourceEvidence.clause),
      testNumber: normalizeOptionalText(sourceEvidence && sourceEvidence.testNumber),
      description: normalizeOptionalText(sourceEvidence && sourceEvidence.description),
      test: normalizeOptionalText(sourceEvidence && sourceEvidence.test),
      object: normalizeOptionalText(sourceEvidence && sourceEvidence.object),
      entries,
    };

    const hasContent = Boolean(
      model.ruleId
      || model.severity
      || model.category
      || model.failedChecks != null
      || model.page != null
      || model.location
      || model.message
      || model.specification
      || model.clause
      || model.testNumber
      || model.description
      || model.test
      || model.object
      || model.entries.length
    );

    return hasContent ? model : null;
  }

  function buildIssueRuleEvidenceEntries(issue, sourceEvidence) {
    const entries = [];
    const sourceEntries = sourceEvidence && Array.isArray(sourceEvidence.entries)
      ? sourceEvidence.entries
      : [];

    for (const entry of sourceEntries) {
      if (entries.length >= 5) {
        break;
      }

      const normalizedEntry = normalizeEvidenceEntry(entry);
      if (!normalizedEntry) {
        continue;
      }

      entries.push(normalizedEntry);
    }

    if (!entries.length) {
      const fallbackEntry = normalizeEvidenceEntry({
        type: "issue",
        status: issue && issue.severity,
        page: issue && issue.page,
        location: issue && issue.location,
        message: issue && issue.message,
      });

      if (fallbackEntry) {
        entries.push(fallbackEntry);
      }
    }

    return entries;
  }

  function buildIssueRuleEvidenceFacts(evidence) {
    const facts = [];

    pushIssueRuleEvidenceFact(facts, "Rule ID", evidence.ruleId);
    pushIssueRuleEvidenceFact(facts, "Severity", evidence.severity);
    pushIssueRuleEvidenceFact(facts, "Categories", evidence.category);
    pushIssueRuleEvidenceFact(facts, "Failed checks", evidence.failedChecks);
    pushIssueRuleEvidenceFact(facts, "Page", evidence.page);
    pushIssueRuleEvidenceFact(facts, "Location", evidence.location);
    pushIssueRuleEvidenceFact(facts, "Message", evidence.message);
    pushIssueRuleEvidenceFact(facts, "Specification", evidence.specification);
    pushIssueRuleEvidenceFact(facts, "Clause", evidence.clause);
    pushIssueRuleEvidenceFact(facts, "Test number", evidence.testNumber);
    pushIssueRuleEvidenceFact(facts, "Rule description", evidence.description);
    pushIssueRuleEvidenceFact(facts, "Rule test", evidence.test);
    pushIssueRuleEvidenceFact(facts, "Rule object", evidence.object);

    return facts;
  }

  function pushIssueRuleEvidenceFact(facts, label, value) {
    if (value == null || value === "") {
      return;
    }
    facts.push(`${label}: ${value}`);
  }

  function buildIssueRuleEvidenceEntriesLabel(entryCount) {
    if (entryCount <= 1) {
      return "Failed check";
    }
    return `Failed checks (showing ${entryCount})`;
  }

  function formatIssueRuleEvidenceEntry(entry, index) {
    const type = normalizeOptionalText(entry && entry.type) || `entry ${index + 1}`;
    const status = normalizeOptionalText(entry && entry.status);
    const page = normalizePositivePageNumber(entry && entry.page);
    const location = normalizeOptionalText(entry && entry.location);
    const message = normalizeOptionalText(entry && entry.message) || "No message provided.";

    const prefixParts = [type];
    if (status) {
      prefixParts.push(`status ${status}`);
    }

    const locatorParts = [];
    if (page != null) {
      locatorParts.push(`page ${page}`);
    }
    if (location) {
      locatorParts.push(location);
    }

    const locatorText = locatorParts.length ? ` (${locatorParts.join(" | ")})` : "";
    return `${prefixParts.join(", ")}${locatorText}: ${message}`;
  }

  function buildIssueFixPlan(issue) {
    const issueSearchableText = buildIssueSearchableText(issue);
    const template = resolveFixPlanTemplate(issue, issueSearchableText);
    const locatorStep = buildIssueLocatorStep(issue);
    const ruleId = issue && issue.rule_id != null ? String(issue.rule_id).trim() : "";
    const summary = ruleId
      ? `${template.summary} Rule: ${ruleId}.`
      : template.summary;
    const steps = dedupeFixPlanSteps([
      locatorStep,
      template.action,
      ...buildTemplateFollowUpSteps(template, issueSearchableText),
    ]);

    return {
      summary,
      steps,
    };
  }

  function buildTemplateFollowUpSteps(template, issueSearchableText) {
    if (!template || !Array.isArray(template.followUpActions)) {
      return [];
    }

    const matchedActions = [];
    const defaultActions = [];
    const alwaysActions = [];
    const seenActionIds = new Set();
    const searchableText = normalizeOptionalText(issueSearchableText) || "";

    for (const sourceAction of template.followUpActions) {
      const action = normalizeTemplateFollowUpAction(sourceAction);
      if (!action || seenActionIds.has(action.id)) {
        continue;
      }
      seenActionIds.add(action.id);

      if (action.always) {
        alwaysActions.push(action);
        continue;
      }

      if (action.pattern && action.pattern.test(searchableText)) {
        matchedActions.push(action);
        continue;
      }

      if (action.defaultWhenNoMatch) {
        defaultActions.push(action);
      }
    }

    const selectedActions = [];
    if (matchedActions.length) {
      selectedActions.push(...matchedActions.slice(0, FIX_PLAN_MATCHED_ACTION_LIMIT));
    } else {
      selectedActions.push(...defaultActions.slice(0, FIX_PLAN_DEFAULT_ACTION_LIMIT));
    }

    if (selectedActions.length < FIX_PLAN_DEFAULT_ACTION_LIMIT) {
      for (const action of defaultActions) {
        if (selectedActions.some((selected) => selected.id === action.id)) {
          continue;
        }
        selectedActions.push(action);
        if (selectedActions.length >= FIX_PLAN_DEFAULT_ACTION_LIMIT) {
          break;
        }
      }
    }

    const maxFollowUpSteps = Math.max(0, FIX_PLAN_MAX_STEPS - 2);
    const remainingSlots = Math.max(0, maxFollowUpSteps - selectedActions.length);
    if (remainingSlots > 0 && alwaysActions.length) {
      selectedActions.push(...alwaysActions.slice(0, remainingSlots));
    }

    return selectedActions
      .slice(0, maxFollowUpSteps)
      .map((action) => action.step);
  }

  function normalizeTemplateFollowUpAction(sourceAction) {
    if (typeof sourceAction === "string") {
      const text = normalizeOptionalText(sourceAction);
      if (!text) {
        return null;
      }
      const id = text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      return {
        id: id || text,
        step: text,
        pattern: null,
        defaultWhenNoMatch: true,
        always: false,
      };
    }

    if (!sourceAction || typeof sourceAction !== "object") {
      return null;
    }

    const step = normalizeOptionalText(sourceAction.step);
    if (!step) {
      return null;
    }

    const normalizedId = normalizeOptionalText(sourceAction.id)
      || step.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim()
      || step;
    const pattern = sourceAction.pattern instanceof RegExp ? sourceAction.pattern : null;
    const always = Boolean(sourceAction.always);
    const defaultWhenNoMatch = Boolean(
      sourceAction.defaultWhenNoMatch
      || (!pattern && !always)
    );

    return {
      id: normalizedId,
      step,
      pattern,
      defaultWhenNoMatch,
      always,
    };
  }

  function dedupeFixPlanSteps(steps) {
    const uniqueSteps = [];
    const seen = new Set();

    for (const step of steps) {
      const text = normalizeOptionalText(step);
      if (!text) {
        continue;
      }

      const stepKey = text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
      if (!stepKey || seen.has(stepKey)) {
        continue;
      }

      seen.add(stepKey);
      uniqueSteps.push(text);

      if (uniqueSteps.length >= FIX_PLAN_MAX_STEPS) {
        break;
      }
    }

    return uniqueSteps;
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

  function buildIssueSearchableText(issue) {
    const categories = getIssueCategories(issue);
    const sourceEvidence = issue && issue.rule_evidence && typeof issue.rule_evidence === "object"
      ? issue.rule_evidence
      : null;
    const sourceEntries = sourceEvidence && Array.isArray(sourceEvidence.entries)
      ? sourceEvidence.entries
      : [];
    const sourceEntryParts = sourceEntries.flatMap((entry) => [
      entry && entry.type,
      entry && entry.status,
      entry && entry.location,
      entry && entry.message,
    ]);

    return [
      issue && issue.rule_id,
      issue && issue.message,
      issue && issue.location,
      issue && issue.severity,
      ...categories,
      sourceEvidence && sourceEvidence.specification,
      sourceEvidence && sourceEvidence.clause,
      sourceEvidence && sourceEvidence.testNumber,
      sourceEvidence && sourceEvidence.description,
      sourceEvidence && sourceEvidence.test,
      sourceEvidence && sourceEvidence.object,
      ...sourceEntryParts,
    ]
      .filter((part) => part != null && String(part).trim() !== "")
      .join(" ");
  }

  function resolveFixPlanTemplate(issue, searchableText) {
    const normalizedSearchableText = normalizeOptionalText(searchableText)
      || buildIssueSearchableText(issue);

    for (const template of FIX_PLAN_TEMPLATES) {
      if (template.pattern.test(normalizedSearchableText)) {
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
      return "";
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
              ${escapeHtml(label)} <span class="category-chip-count">(${count})</span>
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
    explainIssuesToken = null;
    failedProfilesForIssueExplanation = [];
    resultPanel.classList.add("hidden");
    resultPanel.classList.remove("result-pass", "result-fail", "result-mixed");
    errorPanel.classList.add("hidden");
    errorPanel.textContent = "";
  }

  function showError(message) {
    explainIssuesToken = null;
    failedProfilesForIssueExplanation = [];
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

  function buildExplainIssuesUrl(baseUrl) {
    if (baseUrl.endsWith("/explain-issues")) {
      return baseUrl;
    }
    if (baseUrl.endsWith("/validate")) {
      return `${baseUrl.slice(0, -"/validate".length)}/explain-issues`;
    }
    return `${baseUrl}/explain-issues`;
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

    const normalizedEventName = normalizeAnalyticsEventName(eventName);
    if (!normalizedEventName) {
      return;
    }

    const eventParams = buildAnalyticsEventParams(params);
    window.gtag("event", normalizedEventName, eventParams);
  }

  function normalizeAnalyticsEventName(value) {
    const normalized = normalizeOptionalText(value);
    if (!normalized) {
      return "";
    }

    const safeName = normalized
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40);
    if (!ANALYTICS_EVENT_NAME_PATTERN.test(safeName)) {
      return "";
    }
    return safeName;
  }

  function normalizeAnalyticsParamName(value) {
    const normalized = normalizeOptionalText(value);
    if (!normalized) {
      return "";
    }

    const safeName = normalized
      .toLowerCase()
      .replace(/[^a-z0-9_]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 40);
    if (!ANALYTICS_PARAM_NAME_PATTERN.test(safeName)) {
      return "";
    }
    return safeName;
  }

  function normalizeAnalyticsParamValue(value) {
    if (value == null) {
      return null;
    }

    if (typeof value === "string") {
      const normalized = normalizeOptionalText(value);
      if (!normalized) {
        return null;
      }
      return normalized.slice(0, ANALYTICS_MAX_PARAM_VALUE_LENGTH);
    }

    if (typeof value === "number") {
      return Number.isFinite(value) ? value : null;
    }

    if (typeof value === "boolean") {
      return value ? 1 : 0;
    }

    return null;
  }

  function buildAnalyticsEventParams(params) {
    const eventParams = {
      app_surface: "spa",
    };

    const pagePath = normalizeOptionalText(`${window.location.pathname}${window.location.search}`);
    if (pagePath) {
      eventParams.page_path = pagePath.slice(0, ANALYTICS_MAX_PARAM_VALUE_LENGTH);
    }

    const pageTitle = normalizeOptionalText(document.title);
    if (pageTitle) {
      eventParams.page_title = pageTitle.slice(0, ANALYTICS_MAX_PARAM_VALUE_LENGTH);
    }

    if (!params || typeof params !== "object" || Array.isArray(params)) {
      return eventParams;
    }

    Object.entries(params).forEach(([rawName, rawValue]) => {
      const name = normalizeAnalyticsParamName(rawName);
      const value = normalizeAnalyticsParamValue(rawValue);
      if (!name || value == null) {
        return;
      }
      eventParams[name] = value;
    });

    return eventParams;
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

  function resolveApiBaseUrl(defaultBaseUrl) {
    const queryOverride = readApiBaseUrlOverrideFromQuery();
    if (queryOverride) {
      persistApiBaseUrlOverride(queryOverride);
      return queryOverride;
    }

    const storedOverride = readPersistedApiBaseUrlOverride();
    if (storedOverride) {
      return storedOverride;
    }

    return defaultBaseUrl;
  }

  function readApiBaseUrlOverrideFromQuery() {
    try {
      const search = window.location && window.location.search
        ? window.location.search
        : "";
      if (!search) {
        return "";
      }

      const query = new URLSearchParams(search);
      return normalizeLambdaBaseUrl(query.get("apiBaseUrl") || "") || "";
    } catch (_error) {
      return "";
    }
  }

  function readPersistedApiBaseUrlOverride() {
    try {
      if (!window.localStorage) {
        return "";
      }
      const stored = window.localStorage.getItem(API_BASE_URL_STORAGE_KEY) || "";
      return normalizeLambdaBaseUrl(stored) || "";
    } catch (_error) {
      return "";
    }
  }

  function persistApiBaseUrlOverride(baseUrl) {
    const normalizedBaseUrl = normalizeLambdaBaseUrl(baseUrl || "");
    if (!normalizedBaseUrl) {
      return;
    }

    try {
      if (!window.localStorage) {
        return;
      }
      window.localStorage.setItem(API_BASE_URL_STORAGE_KEY, normalizedBaseUrl);
    } catch (_error) {
      // Ignore storage quota/privacy errors.
    }
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
