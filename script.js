const STANDARD_VALUES = {
  wallThickness: 3,
  ceilingThickness: 7
};

const state = {
  projectCount: 0,
  lastResults: null
};

const projectList = document.getElementById("project-list");
const projectTemplate = document.getElementById("project-template");
const form = document.getElementById("estimate-form");
const addProjectBtn = document.getElementById("add-project-btn");
const resetBtn = document.getElementById("reset-btn");
const projectEmptyState = document.getElementById("project-empty-state");
const resultsPanel = document.getElementById("results-panel");
const summaryEmpty = document.getElementById("summary-empty");
const projectResults = document.getElementById("project-results");
const combinedTotals = document.getElementById("combined-totals");
const savePdfBtn = document.getElementById("save-pdf-btn");
const summaryEmptyText = summaryEmpty.querySelector("p");
const projectEmptyStateText = projectEmptyState.querySelector("p");
const defaultSummaryMessage = "Add a project and start entering details. The scorecard updates as you go.";
const defaultProjectEmptyMessage = "Click Add Project to start your estimate.";

initialize();

function initialize() {
  bindTopLevelEvents();
  syncProjectStartState();
  updateLiveScorecard();
}

function bindTopLevelEvents() {
  addProjectBtn.addEventListener("click", function () {
    addProject();
    updateLiveScorecard();
    scrollToProjectEnd();
  });

  resetBtn.addEventListener("click", function () {
    resetEstimate();
  });

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    clearAllErrors();

    if (!projectList.children.length) {
      showProjectEmptyState("Add a project to get started.");
      updateLiveScorecard();
      return;
    }

    const calculations = collectAndCalculate();
    updateLiveScorecard();

    if (!calculations.isValid) {
      renderValidationState(calculations.errors);
      return;
    }
  });

  savePdfBtn.addEventListener("click", function () {
    if (state.lastResults) {
      downloadEstimatePdf(state.lastResults);
    }
  });
}

function addProject() {
  state.projectCount += 1;
  const fragment = projectTemplate.content.cloneNode(true);
  const card = fragment.querySelector("[data-project-card]");
  const title = fragment.querySelector(".project-title");
  const removeBtn = fragment.querySelector("[data-remove-project]");

  card.dataset.projectIndex = String(state.projectCount);
  title.textContent = `Project ${state.projectCount}`;

  if (state.projectCount > 1) {
    removeBtn.classList.remove("hidden");
  }

  projectList.appendChild(fragment);
  const appendedCard = projectList.lastElementChild;
  configureProjectCard(appendedCard);
  updateProjectTitles();
  syncProjectStartState();
  focusProjectName(appendedCard);
}

function configureProjectCard(card) {
  card.querySelector("[data-remove-project]").addEventListener("click", function () {
    card.remove();
    updateProjectTitles();
    syncProjectStartState();
    refreshAllPreviews();
    updateLiveScorecard();
  });

  card.addEventListener("input", function (event) {
    clearAllErrors();
    if (event.target.name === "projectName") {
      syncProjectTitle(card);
    }
    refreshProjectCard(card);
  });

  card.addEventListener("change", function () {
    clearAllErrors();
    applyProjectDefaults(card);
    refreshProjectCard(card);
  });

  applyProjectDefaults(card);
  refreshProjectCard(card);
}

function refreshProjectCard(card) {
  updateThicknessMode(card);
  updateConditionalSteps(card);
  refreshPreview(card);
  updateLiveScorecard();
}

function updateThicknessMode(card) {
  const mode = card.querySelector('select[name="thicknessMode"]').value;
  const customFields = card.querySelector("[data-custom-fields]");
  customFields.classList.toggle("hidden", mode !== "custom");
}

function applyProjectDefaults(card) {
  const projectType = card.querySelector('select[name="projectType"]').value;
  const scopeSelect = card.querySelector('select[name="scope"]');
  const thicknessMode = card.querySelector('select[name="thicknessMode"]').value;
  const roofPitchInput = card.querySelector('input[name="roofPitch"]');
  const wallThicknessInput = card.querySelector('input[name="wallThickness"]');
  const ceilingThicknessInput = card.querySelector('input[name="ceilingThickness"]');

  if (projectType === "Crawl Space" && !scopeSelect.value) {
    scopeSelect.value = "Walls";
  }

  if (projectType === "Enclosed Trailer" && Number(roofPitchInput.value || 0) === 0) {
    roofPitchInput.value = "1";
  }

  if (thicknessMode === "standard") {
    wallThicknessInput.value = String(STANDARD_VALUES.wallThickness);
    ceilingThicknessInput.value = String(STANDARD_VALUES.ceilingThickness);
  }
}

function updateConditionalSteps(card) {
  const projectType = card.querySelector('select[name="projectType"]').value;
  const scope = card.querySelector('select[name="scope"]').value;
  const ceilingMode = card.querySelector('select[name="ceilingMode"]').value;
  const { needsWalls, needsCeiling } = getScopeFlags(scope);
  const dimensionsStep = card.querySelector("[data-step-dimensions]");
  const dimensionsTitle = card.querySelector("[data-dimensions-title]");
  const bothDimensionsNote = card.querySelector("[data-both-dimensions-note]");
  const wallHeading = card.querySelector("[data-wall-heading]");
  const ceilingHeading = card.querySelector("[data-ceiling-heading]");

  card.querySelector("[data-step-scope]").classList.toggle("hidden", !projectType);
  dimensionsStep.classList.toggle("hidden", !projectType || !scope);
  card.querySelector("[data-wall-dimensions]").classList.toggle("hidden", !needsWalls);
  card.querySelector("[data-ceiling-dimensions]").classList.toggle("hidden", !needsCeiling);
  card.querySelector("[data-height-field]").classList.toggle("hidden", !needsWalls);
  card.querySelector("[data-ceiling-mode-field]").classList.toggle("hidden", !needsCeiling);
  card.querySelector("[data-roof-pitch-field]").classList.toggle("hidden", !(needsCeiling && ceilingMode === "Pitched Roof"));
  card.querySelector("[data-wall-thickness-field]").classList.toggle("hidden", !needsWalls);
  card.querySelector("[data-ceiling-thickness-field]").classList.toggle("hidden", !needsCeiling);
  dimensionsStep.classList.toggle("two-set-layout", needsWalls && needsCeiling);

  if (needsWalls && needsCeiling) {
    dimensionsTitle.textContent = "Building Dimensions - Two Sets";
    bothDimensionsNote.classList.remove("hidden");
    wallHeading.textContent = "Set 1 - Walls";
    ceilingHeading.textContent = "Set 2 - Roof/Ceiling";
    return;
  }

  bothDimensionsNote.classList.add("hidden");

  if (needsWalls) {
    dimensionsTitle.textContent = "Building Dimensions - Walls";
    wallHeading.textContent = "Building Dimensions - Walls";
    ceilingHeading.textContent = "Building Dimensions - Roof/Ceiling";
    return;
  }

  if (needsCeiling) {
    dimensionsTitle.textContent = "Building Dimensions - Roof/Ceiling";
    wallHeading.textContent = "Building Dimensions - Walls";
    ceilingHeading.textContent = "Building Dimensions - Roof/Ceiling";
    return;
  }

  dimensionsTitle.textContent = "Building Dimensions";
  wallHeading.textContent = "Building Dimensions - Walls";
  ceilingHeading.textContent = "Building Dimensions - Roof/Ceiling";
}

function refreshPreview(card) {
  const previewSquareFootage = card.querySelector("[data-preview-square-footage]");
  const previewBoardFeet = card.querySelector("[data-preview-board-feet]");
  const previewCost = card.querySelector("[data-preview-cost]");
  const projectData = getProjectData(card);
  const calculation = calculateProject(projectData, {
    strictValidation: false,
    requirePricing: false
  });

  if (!calculation.isValid) {
    previewSquareFootage.textContent = "Square Footage: 0 sq ft";
    previewBoardFeet.textContent = "Board Feet: 0";
    previewCost.textContent = "Add pricing";
    return;
  }

  previewSquareFootage.textContent = `Square Footage: ${formatNumber(calculation.totalSquareFootage)} sq ft`;
  previewBoardFeet.textContent = `Board Feet: ${formatNumber(calculation.totalBoardFeet)}`;
  previewCost.textContent = calculation.hasPricing ? formatCurrency(calculation.totalCost) : "Add pricing";
}

function refreshAllPreviews() {
  Array.from(projectList.children).forEach(function (card) {
    refreshPreview(card);
  });
}

function collectAndCalculate() {
  const projects = [];
  const errors = [];

  Array.from(projectList.children).forEach(function (card, index) {
    const projectData = getProjectData(card);
    const result = calculateProject(projectData, {
      strictValidation: true,
      requirePricing: false
    });

    if (!result.isValid) {
      errors.push({
        card,
        index,
        messages: result.errors
      });
      return;
    }

    projects.push(result);
  });

  if (errors.length) {
    return { isValid: false, errors };
  }

  const totals = projects.reduce(
    function (accumulator, project) {
      accumulator.totalSquareFootage += project.totalSquareFootage;
      accumulator.totalBoardFeet += project.totalBoardFeet;
      accumulator.totalCost += project.totalCost || 0;
      return accumulator;
    },
    {
      totalSquareFootage: 0,
      totalBoardFeet: 0,
      totalCost: 0
    }
  );

  return {
    isValid: true,
    projects,
    totals
  };
}

function getProjectData(card) {
  return {
    card,
    projectName: card.querySelector('input[name="projectName"]').value.trim(),
    projectType: card.querySelector('select[name="projectType"]').value,
    scope: card.querySelector('select[name="scope"]').value,
    wallWidth: parseNumber(card.querySelector('input[name="wallWidth"]').value),
    wallLength: parseNumber(card.querySelector('input[name="wallLength"]').value),
    wallHeight: parseNumber(card.querySelector('input[name="wallHeight"]').value),
    ceilingWidth: parseNumber(card.querySelector('input[name="ceilingWidth"]').value),
    ceilingLength: parseNumber(card.querySelector('input[name="ceilingLength"]').value),
    roofPitch: parseNumber(card.querySelector('input[name="roofPitch"]').value),
    ceilingMode: card.querySelector('select[name="ceilingMode"]').value,
    thicknessMode: card.querySelector('select[name="thicknessMode"]').value,
    wallThickness: parseNumber(card.querySelector('input[name="wallThickness"]').value),
    ceilingThickness: parseNumber(card.querySelector('input[name="ceilingThickness"]').value),
    costPerBoardFoot: parseNumber(card.querySelector('input[name="costPerBoardFoot"]').value)
  };
}

function calculateProject(projectData, options) {
  const settings = {
    strictValidation: false,
    requirePricing: false,
    ...options
  };
  const errors = validateProject(projectData, settings);
  if (errors.length) {
    return { isValid: false, errors };
  }

  const { needsWalls, needsCeiling } = getScopeFlags(projectData.scope);
  const slopeFactor = needsCeiling && projectData.ceilingMode === "Pitched Roof"
    ? Math.sqrt(1 + (projectData.roofPitch / 12) ** 2)
    : 1;

  const wallArea = needsWalls
    ? 2 * projectData.wallLength * projectData.wallHeight + 2 * projectData.wallWidth * projectData.wallHeight
    : 0;
  const ceilingOrRoofArea = needsCeiling
    ? projectData.ceilingLength * projectData.ceilingWidth * slopeFactor
    : 0;
  const wallBoardFeet = needsWalls ? wallArea * projectData.wallThickness : 0;
  const ceilingBoardFeet = needsCeiling ? ceilingOrRoofArea * projectData.ceilingThickness : 0;
  const totalSquareFootage = wallArea + ceilingOrRoofArea;
  const totalBoardFeet = wallBoardFeet + ceilingBoardFeet;
  const pricingIncluded = hasPricing(projectData);

  return {
    isValid: true,
    projectName: projectData.projectName,
    projectType: projectData.projectType,
    scope: projectData.scope,
    needsWalls,
    needsCeiling,
    wallWidth: projectData.wallWidth,
    wallLength: projectData.wallLength,
    wallHeight: projectData.wallHeight,
    ceilingWidth: projectData.ceilingWidth,
    ceilingLength: projectData.ceilingLength,
    roofPitch: projectData.roofPitch,
    ceilingMode: projectData.ceilingMode,
    wallThickness: projectData.wallThickness,
    ceilingThickness: projectData.ceilingThickness,
    costPerBoardFoot: pricingIncluded ? projectData.costPerBoardFoot : null,
    slopeFactor,
    wallArea,
    ceilingOrRoofArea,
    ceilingAreaLabel: projectData.ceilingMode === "Flat Ceiling" ? "Ceiling Square Footage" : "Roof Square Footage",
    totalSquareFootage,
    wallBoardFeet,
    ceilingBoardFeet,
    wallCost: pricingIncluded && needsWalls ? wallBoardFeet * projectData.costPerBoardFoot : null,
    ceilingCost: pricingIncluded && needsCeiling ? ceilingBoardFeet * projectData.costPerBoardFoot : null,
    totalBoardFeet,
    totalCost: pricingIncluded ? totalBoardFeet * projectData.costPerBoardFoot : null,
    hasPricing: pricingIncluded
  };
}

function validateProject(projectData, options) {
  const settings = {
    strictValidation: false,
    requirePricing: false,
    ...options
  };
  const errors = [];
  const { needsWalls, needsCeiling } = getScopeFlags(projectData.scope);

  if (!projectData.projectName) {
    errors.push("Enter a project name.");
  }

  if (!projectData.projectType) {
    errors.push("Select a project type.");
  }

  if (!projectData.scope) {
    errors.push("Select what needs sprayed.");
  }

  if (needsWalls && !hasPositiveNumber(projectData.wallWidth)) {
    errors.push("Enter a wall width in feet.");
  }

  if (needsWalls && !hasPositiveNumber(projectData.wallLength)) {
    errors.push("Enter a wall length in feet.");
  }

  if (needsWalls && !hasPositiveNumber(projectData.wallHeight)) {
    errors.push("Enter a wall height in feet.");
  }

  if (needsCeiling && !hasPositiveNumber(projectData.ceilingWidth)) {
    errors.push("Enter a roof or ceiling width in feet.");
  }

  if (needsCeiling && !hasPositiveNumber(projectData.ceilingLength)) {
    errors.push("Enter a roof or ceiling length in feet.");
  }

  if (needsCeiling && projectData.ceilingMode === "Pitched Roof" && !hasZeroOrGreaterNumber(projectData.roofPitch)) {
    errors.push("Enter a roof pitch value.");
  }

  if (settings.strictValidation || projectData.thicknessMode === "custom") {
    if (needsWalls && !hasPositiveNumber(projectData.wallThickness)) {
      errors.push("Enter a wall thickness.");
    }

    if (needsCeiling && !hasPositiveNumber(projectData.ceilingThickness)) {
      errors.push("Enter a ceiling thickness.");
    }
  }

  if (settings.requirePricing && !hasPricing(projectData)) {
    errors.push("Enter a cost per board foot.");
  }

  return errors;
}

function getScopeFlags(scope) {
  return {
    needsWalls: scope === "Walls" || scope === "Both",
    needsCeiling: scope === "Ceiling or Roof" || scope === "Both"
  };
}

function hasPricing(projectData) {
  return hasPositiveNumber(projectData.costPerBoardFoot);
}

function hasPositiveNumber(value) {
  return Number.isFinite(value) && value > 0;
}

function hasZeroOrGreaterNumber(value) {
  return Number.isFinite(value) && value >= 0;
}

function getWallMathText(projectData, wallArea) {
  const width = formatFormulaNumber(projectData.wallWidth, "width");
  const length = formatFormulaNumber(projectData.wallLength, "length");
  const height = formatFormulaNumber(projectData.wallHeight, "height");
  const areaText = Number.isFinite(wallArea) ? `${formatNumber(wallArea)} sq ft` : "0 sq ft";

  return `2 x ${length} x ${height} + 2 x ${width} x ${height} = ${areaText}`;
}

function getCeilingMathText(projectData, ceilingArea) {
  const width = formatFormulaNumber(projectData.ceilingWidth, "width");
  const length = formatFormulaNumber(projectData.ceilingLength, "length");
  const areaText = Number.isFinite(ceilingArea) ? `${formatNumber(ceilingArea)} sq ft` : "0 sq ft";

  if (projectData.ceilingMode === "Flat Ceiling") {
    return `${length} x ${width} = ${areaText}`;
  }

  const pitch = hasZeroOrGreaterNumber(projectData.roofPitch) ? projectData.roofPitch : null;
  const slopeFactor = pitch === null ? "slope factor" : formatNumber(Math.sqrt(1 + (pitch / 12) ** 2));

  return `${length} x ${width} x ${slopeFactor} = ${areaText}`;
}

function formatFormulaNumber(value, fallback) {
  return hasPositiveNumber(value) ? formatNumber(value) : fallback;
}

function renderResults(projects, totals) {
  summaryEmpty.classList.add("hidden");
  resultsPanel.classList.remove("hidden");
  projectResults.innerHTML = "";
  combinedTotals.innerHTML = "";

  projects.forEach(function (project) {
    projectResults.appendChild(createCompleteResultCard(project));
  });

  appendCombinedTotals(totals, {
    completedCount: projects.length,
    totalCount: projects.length,
    pricedCount: projects.filter(function (project) {
      return project.hasPricing;
    }).length
  });
}

function metricRow(label, value) {
  return `
    <div class="metric-row">
      <p class="metric-label">${escapeHtml(label)}</p>
      <p class="metric-value">${escapeHtml(value)}</p>
    </div>
  `;
}

function createMetricRow(label, value) {
  const wrapper = document.createElement("div");
  wrapper.className = "metric-row";
  wrapper.innerHTML = `
    <p class="metric-label">${escapeHtml(label)}</p>
    <p class="metric-value">${escapeHtml(value)}</p>
  `;
  return wrapper;
}

function renderValidationState(errors) {
  errors.forEach(function ({ card, messages }, index) {
    let banner = card.querySelector(".error-banner");
    if (!banner) {
      banner = document.createElement("div");
      banner.className = "error-banner";
      card.prepend(banner);
    }

    banner.textContent = `Project ${index + 1}: ${messages[0]}`;
  });

  if (errors[0]?.card) {
    errors[0].card.scrollIntoView({ behavior: "smooth", block: "start" });
  }
}

function clearAllErrors() {
  document.querySelectorAll(".error-banner").forEach(function (banner) {
    banner.remove();
  });
}

function resetEstimate() {
  projectList.innerHTML = "";
  state.projectCount = 0;
  state.lastResults = null;
  projectResults.innerHTML = "";
  combinedTotals.innerHTML = "";
  resultsPanel.classList.add("hidden");
  summaryEmpty.classList.remove("hidden");
  summaryEmptyText.textContent = defaultSummaryMessage;
  syncProjectStartState();
  updateLiveScorecard();
}

function updateProjectTitles() {
  Array.from(projectList.children).forEach(function (card, index) {
    const position = index + 1;
    card.dataset.defaultTitle = `Project ${position}`;
    syncProjectTitle(card);
    const removeBtn = card.querySelector("[data-remove-project]");
    removeBtn.classList.toggle("hidden", projectList.children.length === 1);
  });
}

function scrollToProjectEnd() {
  projectList.lastElementChild?.scrollIntoView({ behavior: "smooth", block: "center" });
}

function syncProjectTitle(card) {
  const input = card.querySelector('input[name="projectName"]');
  const title = card.querySelector(".project-title");
  const fallbackTitle = card.dataset.defaultTitle || "Project";

  title.textContent = input.value.trim() || fallbackTitle;
}

function syncProjectStartState() {
  const hasProjects = projectList.children.length > 0;
  projectEmptyState.classList.toggle("hidden", hasProjects);
  if (!hasProjects) {
    projectEmptyStateText.textContent = defaultProjectEmptyMessage;
  }
}

function showProjectEmptyState(message) {
  projectEmptyStateText.textContent = message;
  projectEmptyState.classList.remove("hidden");
  projectEmptyState.scrollIntoView({ behavior: "smooth", block: "start" });
}

function focusProjectName(card) {
  const input = card.querySelector('input[name="projectName"]');
  input.focus();
}

function parseNumber(value) {
  const parsed = Number.parseFloat(value);
  return Number.isFinite(parsed) ? parsed : NaN;
}

function formatNumber(value) {
  return new Intl.NumberFormat("en-US", {
    maximumFractionDigits: 2
  }).format(value);
}

function formatCurrency(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2
  }).format(value);
}

function invalidateResults() {
  updateLiveScorecard();
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function downloadEstimatePdf(results) {
  const lines = buildPdfLines(results);
  const pdf = createSimplePdf(lines);
  const blob = new Blob([pdf], { type: "application/pdf" });
  const link = document.createElement("a");
  const safeName = results.projects[0]?.projectName
    ? results.projects[0].projectName.replace(/[^a-z0-9]+/gi, "-").replace(/^-+|-+$/g, "").toLowerCase()
    : "estimate";

  link.href = URL.createObjectURL(blob);
  link.download = `xtreme-alaska-estimate-${safeName || "estimate"}.pdf`;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(link.href);
}

function buildPdfLines(results) {
  const lines = [
    { text: "XTREME ALASKA SPRAY FOAM", size: 18, gapAfter: 10 },
    { text: "Customer Estimate", size: 13, gapAfter: 6 },
    { text: "Troy | (907)315-0862 | xtremealaskasprayfoam@gmail.com", size: 11, gapAfter: 16 },
    { text: "This estimate is based on closed cell spray foam, a high performance insulation used for Alaska climates.", size: 10, gapAfter: 6 },
    { text: "Walls use a standard recommendation of R21 at about 3 inches. Ceilings use a standard recommendation of R49 at about 7 inches.", size: 10, gapAfter: 14 }
  ];

  results.projects.forEach(function (project, index) {
    lines.push({ text: `Project ${index + 1}: ${project.projectName}`, size: 14, gapAfter: 8 });
    lines.push({ text: `Project Type: ${project.projectType}`, size: 10 });
    lines.push({ text: `Scope: ${project.scope}`, size: 10, gapAfter: 6 });

    if (project.needsWalls) {
      lines.push({ text: `Wall Dimensions: ${formatNumber(project.wallWidth)} ft wide, ${formatNumber(project.wallLength)} ft long, ${formatNumber(project.wallHeight)} ft high`, size: 10 });
      lines.push({ text: `Wall Sq Ft Math: ${getWallMathText(project, project.wallArea)}`, size: 10 });
      lines.push({ text: `Wall Thickness: ${formatNumber(project.wallThickness)} inches`, size: 10 });
      lines.push({ text: `Wall Square Footage: ${formatNumber(project.wallArea)} sq ft`, size: 10 });
      lines.push({ text: `Wall Board Feet: ${formatNumber(project.wallBoardFeet)}`, size: 10 });
      lines.push({ text: `Wall Cost: ${formatCurrency(project.wallCost)}`, size: 10, gapAfter: 6 });
    }

    if (project.needsCeiling) {
      lines.push({ text: `Roof/Ceiling Dimensions: ${formatNumber(project.ceilingWidth)} ft wide, ${formatNumber(project.ceilingLength)} ft long`, size: 10 });
      lines.push({ text: `Ceiling Type: ${project.ceilingMode}`, size: 10 });

      if (project.ceilingMode === "Pitched Roof") {
        lines.push({ text: `Roof Pitch: ${formatNumber(project.roofPitch)} in 12`, size: 10 });
      }

      lines.push({ text: `Roof/Ceiling Sq Ft Math: ${getCeilingMathText(project, project.ceilingOrRoofArea)}`, size: 10 });
      lines.push({ text: `Ceiling Thickness: ${formatNumber(project.ceilingThickness)} inches`, size: 10 });
      lines.push({ text: `${project.ceilingAreaLabel}: ${formatNumber(project.ceilingOrRoofArea)} sq ft`, size: 10 });
      lines.push({ text: `Ceiling Board Feet: ${formatNumber(project.ceilingBoardFeet)}`, size: 10 });
      lines.push({ text: `Ceiling Cost: ${formatCurrency(project.ceilingCost)}`, size: 10, gapAfter: 6 });
    }

    lines.push({ text: `Total Square Footage: ${formatNumber(project.totalSquareFootage)} sq ft`, size: 10 });
    lines.push({ text: `Total Board Feet: ${formatNumber(project.totalBoardFeet)}`, size: 10 });
    lines.push({ text: `Cost per Board Foot: ${formatCurrency(project.costPerBoardFoot)}`, size: 10 });
    lines.push({ text: `Estimated Total Cost: ${formatCurrency(project.totalCost)}`, size: 10, gapAfter: 14 });
  });

  lines.push({ text: "Combined Totals", size: 13, gapAfter: 8 });
  lines.push({ text: `Total Square Footage: ${formatNumber(results.totals.totalSquareFootage)} sq ft`, size: 10 });
  lines.push({ text: `Total Board Feet: ${formatNumber(results.totals.totalBoardFeet)}`, size: 10 });
  lines.push({ text: `Total Estimated Cost: ${formatCurrency(results.totals.totalCost)}`, size: 10, gapAfter: 14 });
  lines.push({ text: "Estimate based on standard insulation values: Walls R21 at about 3 inches. Ceiling R49 at about 7 inches.", size: 10, gapAfter: 6 });
  lines.push({ text: "Estimates are for informational purposes only. Final pricing may vary based on site conditions, materials, and project requirements. Contact Xtreme Alaska Spray Foam for an official quote.", size: 10, gapAfter: 6 });
  lines.push({ text: "Call Troy at (907)315-0862 or email xtremealaskasprayfoam@gmail.com.", size: 10, gapAfter: 0 });

  return lines;
}

function createSimplePdf(lines) {
  const pageWidth = 612;
  const pageHeight = 792;
  const leftMargin = 54;
  const rightMargin = 54;
  const topMargin = 54;
  const bottomMargin = 54;
  const usableWidth = pageWidth - leftMargin - rightMargin;
  const pages = [[]];
  let cursorY = pageHeight - topMargin;

  lines.forEach(function (line) {
    const size = line.size || 11;
    const lineHeight = size + 5;
    const wrappedLines = wrapText(line.text, usableWidth, size);

    wrappedLines.forEach(function (wrappedLine, index) {
      if (cursorY - lineHeight < bottomMargin) {
        pages.push([]);
        cursorY = pageHeight - topMargin;
      }

      pages[pages.length - 1].push({
        text: wrappedLine,
        x: leftMargin,
        y: cursorY,
        size
      });
      cursorY -= lineHeight;

      if (index === wrappedLines.length - 1) {
        cursorY -= line.gapAfter || 0;
      }
    });
  });

  const objects = [];
  const addObject = function (content) {
    objects.push(content);
    return objects.length;
  };

  const catalogId = addObject("<< /Type /Catalog /Pages 0 0 R >>");
  const pagesId = addObject("<< /Type /Pages /Count 0 /Kids [] >>");
  const fontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const pageIds = [];

  pages.forEach(function (pageLines) {
    const stream = pageLines.map(function (entry) {
      const safeText = escapePdfText(entry.text);
      return `BT /F1 ${entry.size} Tf 1 0 0 1 ${entry.x} ${entry.y} Tm (${safeText}) Tj ET`;
    }).join("\n");

    const contentsId = addObject(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    const pageId = addObject(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 ${pageWidth} ${pageHeight}] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentsId} 0 R >>`);
    pageIds.push(pageId);
  });

  objects[catalogId - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objects[pagesId - 1] = `<< /Type /Pages /Count ${pageIds.length} /Kids [${pageIds.map(function (id) { return `${id} 0 R`; }).join(" ")}] >>`;

  let pdf = "%PDF-1.4\n";
  const offsets = [0];

  objects.forEach(function (object, index) {
    offsets.push(pdf.length);
    pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });

  const xrefOffset = pdf.length;
  pdf += `xref\n0 ${objects.length + 1}\n`;
  pdf += "0000000000 65535 f \n";
  offsets.slice(1).forEach(function (offset) {
    pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
  });
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\nstartxref\n${xrefOffset}\n%%EOF`;

  return pdf;
}

function wrapText(text, maxWidth, fontSize) {
  const words = text.split(/\s+/);
  const lines = [];
  let current = "";
  const averageWidth = fontSize * 0.52;
  const maxChars = Math.max(20, Math.floor(maxWidth / averageWidth));

  words.forEach(function (word) {
    const next = current ? `${current} ${word}` : word;
    if (next.length > maxChars && current) {
      lines.push(current);
      current = word;
    } else {
      current = next;
    }
  });

  if (current) {
    lines.push(current);
  }

  return lines;
}

function escapePdfText(text) {
  return text
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "")
    .replace(/\\/g, "\\\\")
    .replace(/\(/g, "\\(")
    .replace(/\)/g, "\\)");
}

function updateLiveScorecard() {
  const projectCards = Array.from(projectList.children);
  projectResults.innerHTML = "";
  combinedTotals.innerHTML = "";

  if (!projectCards.length) {
    state.lastResults = null;
    resultsPanel.classList.add("hidden");
    summaryEmpty.classList.remove("hidden");
    summaryEmptyText.textContent = defaultSummaryMessage;
    setSaveEstimateState(false);
    return;
  }

  summaryEmpty.classList.add("hidden");
  resultsPanel.classList.remove("hidden");

  const snapshots = projectCards.map(function (card) {
    return getProjectSnapshot(card);
  });

  const completedProjects = [];
  const totals = {
    totalSquareFootage: 0,
    totalBoardFeet: 0,
    totalCost: 0
  };
  let pricedProjects = 0;

  snapshots.forEach(function (snapshot) {
    if (snapshot.isComplete && snapshot.result) {
      projectResults.appendChild(createCompleteResultCard(snapshot.result));
      completedProjects.push(snapshot.result);
      totals.totalSquareFootage += snapshot.result.totalSquareFootage;
      totals.totalBoardFeet += snapshot.result.totalBoardFeet;

      if (snapshot.result.hasPricing) {
        pricedProjects += 1;
        totals.totalCost += snapshot.result.totalCost;
      }

      return;
    }

    projectResults.appendChild(createInProgressResultCard(snapshot));
  });

  appendCombinedTotals(totals, {
    completedCount: completedProjects.length,
    totalCount: snapshots.length,
    pricedCount: pricedProjects
  });

  if (completedProjects.length === snapshots.length && pricedProjects === snapshots.length) {
    state.lastResults = {
      isValid: true,
      projects: completedProjects,
      totals
    };
    setSaveEstimateState(true);
    return;
  }

  state.lastResults = null;
  setSaveEstimateState(false);
}

function getProjectSnapshot(card) {
  const projectData = getProjectData(card);
  const result = calculateProject(projectData, {
    strictValidation: true,
    requirePricing: false
  });
  const missingFields = getMissingFields(projectData);

  return {
    data: projectData,
    displayName: projectData.projectName || card.dataset.defaultTitle || "Project",
    missingFields,
    isComplete: result.isValid,
    canSave: result.isValid && result.hasPricing,
    result: result.isValid ? result : null
  };
}

function getMissingFields(projectData) {
  const missingFields = [];
  const { needsWalls, needsCeiling } = getScopeFlags(projectData.scope);

  if (!projectData.projectName) {
    missingFields.push("Project name");
  }

  if (!projectData.projectType) {
    missingFields.push("Project type");
  }

  if (!projectData.scope) {
    missingFields.push("Scope");
  }

  if (needsWalls && !hasPositiveNumber(projectData.wallWidth)) {
    missingFields.push("Wall width");
  }

  if (needsWalls && !hasPositiveNumber(projectData.wallLength)) {
    missingFields.push("Wall length");
  }

  if (needsWalls && !hasPositiveNumber(projectData.wallHeight)) {
    missingFields.push("Wall height");
  }

  if (needsCeiling && !hasPositiveNumber(projectData.ceilingWidth)) {
    missingFields.push("Roof or ceiling width");
  }

  if (needsCeiling && !hasPositiveNumber(projectData.ceilingLength)) {
    missingFields.push("Roof or ceiling length");
  }

  if (needsCeiling && projectData.ceilingMode === "Pitched Roof" && !hasZeroOrGreaterNumber(projectData.roofPitch)) {
    missingFields.push("Roof pitch");
  }

  if (projectData.thicknessMode === "custom" && needsWalls && !hasPositiveNumber(projectData.wallThickness)) {
    missingFields.push("Wall thickness");
  }

  if (projectData.thicknessMode === "custom" && needsCeiling && !hasPositiveNumber(projectData.ceilingThickness)) {
    missingFields.push("Ceiling thickness");
  }

  return missingFields;
}

function createCompleteResultCard(project) {
  const article = document.createElement("article");
  article.className = "result-card";
  const metaRows = [
    metricRow("Project Type", project.projectType),
    metricRow("Scope", project.scope)
  ];
  const metricRows = [];

  if (project.needsWalls) {
    metricRows.push(metricRow("Wall Width", `${formatNumber(project.wallWidth)} ft`));
    metricRows.push(metricRow("Wall Length", `${formatNumber(project.wallLength)} ft`));
    metricRows.push(metricRow("Wall Height", `${formatNumber(project.wallHeight)} ft`));
    metricRows.push(metricRow("Wall Sq Ft Math", getWallMathText(project, project.wallArea)));
    metricRows.push(metricRow("Wall Square Footage", `${formatNumber(project.wallArea)} sq ft`));
    metricRows.push(metricRow("Wall Thickness", `${formatNumber(project.wallThickness)} inches`));
    metricRows.push(metricRow("Wall Board Feet", formatNumber(project.wallBoardFeet)));
  }

  if (project.needsCeiling) {
    metaRows.push(metricRow("Ceiling Type", project.ceilingMode));
    metricRows.push(metricRow("Roof/Ceiling Width", `${formatNumber(project.ceilingWidth)} ft`));
    metricRows.push(metricRow("Roof/Ceiling Length", `${formatNumber(project.ceilingLength)} ft`));

    if (project.ceilingMode === "Pitched Roof") {
      metricRows.push(metricRow("Roof Pitch", `${formatNumber(project.roofPitch)} in 12`));
    }

    metricRows.push(metricRow("Roof/Ceiling Sq Ft Math", getCeilingMathText(project, project.ceilingOrRoofArea)));
    metricRows.push(metricRow(project.ceilingAreaLabel, `${formatNumber(project.ceilingOrRoofArea)} sq ft`));
    metricRows.push(metricRow("Ceiling Thickness", `${formatNumber(project.ceilingThickness)} inches`));
    metricRows.push(metricRow("Ceiling Board Feet", formatNumber(project.ceilingBoardFeet)));
  }

  metricRows.push(metricRow("Total Square Footage", `${formatNumber(project.totalSquareFootage)} sq ft`));
  metricRows.push(metricRow("Total Board Feet", formatNumber(project.totalBoardFeet)));

  if (project.hasPricing) {
    metricRows.push(metricRow("Cost per Board Foot", formatCurrency(project.costPerBoardFoot)));

    if (project.needsWalls) {
      metricRows.push(metricRow("Wall Cost", formatCurrency(project.wallCost)));
    }

    if (project.needsCeiling) {
      metricRows.push(metricRow("Ceiling Cost", formatCurrency(project.ceilingCost)));
    }

    metricRows.push(metricRow("Estimated Total Cost", formatCurrency(project.totalCost)));
  }

  article.innerHTML = `
    <h3>${escapeHtml(project.projectName)}</h3>
    <div class="result-meta">${metaRows.join("")}</div>
    <div class="metric-grid">${metricRows.join("")}</div>
    ${project.hasPricing ? "" : '<p class="result-note">Add pricing when you are ready to show cost.</p>'}
  `;
  return article;
}

function createInProgressResultCard(snapshot) {
  const article = document.createElement("article");
  article.className = "result-card";
  const { needsWalls, needsCeiling } = getScopeFlags(snapshot.data.scope);
  const metaRows = [];
  const metricRows = [];

  if (snapshot.data.projectType) {
    metaRows.push(metricRow("Project Type", snapshot.data.projectType));
  }

  if (snapshot.data.scope) {
    metaRows.push(metricRow("Scope", snapshot.data.scope));
  }

  if (needsCeiling) {
    metaRows.push(metricRow("Ceiling Type", snapshot.data.ceilingMode));
  }

  if (needsWalls) {
    if (hasPositiveNumber(snapshot.data.wallWidth)) {
      metricRows.push(metricRow("Wall Width", `${formatNumber(snapshot.data.wallWidth)} ft`));
    }

    if (hasPositiveNumber(snapshot.data.wallLength)) {
      metricRows.push(metricRow("Wall Length", `${formatNumber(snapshot.data.wallLength)} ft`));
    }

    if (hasPositiveNumber(snapshot.data.wallHeight)) {
      metricRows.push(metricRow("Wall Height", `${formatNumber(snapshot.data.wallHeight)} ft`));
    }

    metricRows.push(metricRow("Wall Sq Ft Math", getWallMathText(snapshot.data, null)));

    if (hasPositiveNumber(snapshot.data.wallThickness)) {
      metricRows.push(metricRow("Wall Thickness", `${formatNumber(snapshot.data.wallThickness)} inches`));
    }
  }

  if (needsCeiling) {
    if (hasPositiveNumber(snapshot.data.ceilingWidth)) {
      metricRows.push(metricRow("Roof/Ceiling Width", `${formatNumber(snapshot.data.ceilingWidth)} ft`));
    }

    if (hasPositiveNumber(snapshot.data.ceilingLength)) {
      metricRows.push(metricRow("Roof/Ceiling Length", `${formatNumber(snapshot.data.ceilingLength)} ft`));
    }

    if (snapshot.data.ceilingMode === "Pitched Roof" && hasZeroOrGreaterNumber(snapshot.data.roofPitch)) {
      metricRows.push(metricRow("Roof Pitch", `${formatNumber(snapshot.data.roofPitch)} in 12`));
    }

    metricRows.push(metricRow("Roof/Ceiling Sq Ft Math", getCeilingMathText(snapshot.data, null)));

    if (hasPositiveNumber(snapshot.data.ceilingThickness)) {
      metricRows.push(metricRow("Ceiling Thickness", `${formatNumber(snapshot.data.ceilingThickness)} inches`));
    }
  }

  if (hasPricing(snapshot.data)) {
    metricRows.push(metricRow("Cost per Board Foot", formatCurrency(snapshot.data.costPerBoardFoot)));
  }

  article.innerHTML = `
    <h3>${escapeHtml(snapshot.displayName)}</h3>
    ${metaRows.length ? `<div class="result-meta">${metaRows.join("")}</div>` : ""}
    ${metricRows.length ? `<div class="metric-grid">${metricRows.join("")}</div>` : ""}
    <p class="result-note">Complete these items: ${escapeHtml(snapshot.missingFields.join(", "))}.</p>
  `;
  return article;
}

function appendCombinedTotals(totals, status) {
  combinedTotals.appendChild(createMetricRow("Total Square Footage", `${formatNumber(totals.totalSquareFootage)} sq ft`));
  combinedTotals.appendChild(createMetricRow("Total Board Feet", formatNumber(totals.totalBoardFeet)));

  if (status.completedCount && status.pricedCount === status.completedCount && status.completedCount === status.totalCount) {
    combinedTotals.appendChild(createMetricRow("Total Estimated Cost", formatCurrency(totals.totalCost)));
  }

  const note = document.createElement("p");
  note.className = "totals-note";

  if (!status.completedCount) {
    note.textContent = "Complete the required wall or roof fields to calculate totals.";
  } else if (status.completedCount < status.totalCount) {
    note.textContent = "Totals include projects with enough details to calculate square footage and board feet.";
  } else if (status.pricedCount < status.completedCount) {
    note.textContent = "Add pricing to show total cost and save the estimate.";
  } else {
    note.textContent = "All projects are complete and ready to save.";
  }

  combinedTotals.appendChild(note);
}

function setSaveEstimateState(canSave) {
  savePdfBtn.disabled = !canSave;
}
