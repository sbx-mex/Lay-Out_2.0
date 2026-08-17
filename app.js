"use strict";

const DATA_URL = "data/layouts.json";
const MEMORY_KEY = "layout20-state-v2";
const PDF_MARGIN = 12;
const MAX_EVIDENCE_PX = 2000;
const MAX_EVIDENCE_BYTES = 18 * 1024 * 1024;
const $ = id => document.getElementById(id);

let catalog = null;
let activeStationId = null;
let activeCode = null;
let activeSubgroup = "all";
let deferredInstall = null;
let evidenceDataUrl = null;
let toastTimer = null;

function station() {
  return catalog?.stations.find(item => item.id === activeStationId) || catalog?.stations[0];
}

function stationVariants() {
  const current = station();
  if (!current) return [];
  return activeSubgroup === "all"
    ? current.variants
    : current.variants.filter(item => item.subgroup === activeSubgroup);
}

function activeVariant() {
  const current = station();
  return current?.variants.find(item => item.code === activeCode) || stationVariants()[0] || current?.variants[0];
}

function allVariants() {
  if (!catalog) return [];
  return catalog.stations.flatMap(current => current.variants.map(variant => ({ station: current, variant })));
}

function cleanFilename(value) {
  return String(value || "sin-definir")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9_-]+/g, "_")
    .replace(/^_+|_+$/g, "") || "sin-definir";
}

function announce(message) {
  const toast = $("toast");
  toast.textContent = message;
  toast.classList.remove("hidden");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toast.classList.add("hidden"), 3200);
}

function saveState() {
  const state = {
    station: activeStationId,
    code: activeCode,
    store: $("storeName").value.trim(),
    notes: $("notes").value
  };
  localStorage.setItem(MEMORY_KEY, JSON.stringify(state));
}

function loadState() {
  try {
    return JSON.parse(localStorage.getItem(MEMORY_KEY) || "{}");
  } catch {
    return {};
  }
}

async function loadCatalog() {
  const response = await fetch(DATA_URL, { cache: "no-store" });
  if (!response.ok) throw new Error("No se pudo cargar el catálogo de estaciones.");
  catalog = await response.json();
  if (!Array.isArray(catalog.stations) || !catalog.stations.length) throw new Error("El catálogo no contiene estaciones válidas.");

  const saved = loadState();
  activeStationId = catalog.stations.some(item => item.id === saved.station) ? saved.station : catalog.stations[0].id;
  $("storeName").value = saved.store || "";
  $("notes").value = saved.notes || "";

  const current = station();
  activeCode = current.variants.some(item => item.code === saved.code) ? saved.code : current.variants[0].code;
  $("catalogSummary").textContent = `${catalog.stations.length} estaciones · ${allVariants().length} configuraciones`;
  renderAll();
}

function renderAll() {
  renderStationNav();
  renderStation();
  renderComparison();
  updateCompletion();
  saveState();
}

function renderStationNav() {
  const nav = $("stationNav");
  nav.innerHTML = "";
  catalog.stations.forEach((item, index) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "station-tab";
    button.setAttribute("role", "tab");
    button.setAttribute("aria-selected", String(item.id === activeStationId));
    button.dataset.stationId = item.id;
    button.innerHTML = `<span aria-hidden="true">${item.icon}</span><strong></strong><small></small>`;
    button.querySelector("strong").textContent = item.label;
    button.querySelector("small").textContent = `${item.variants.length} opciones`;
    button.addEventListener("click", () => selectStation(item.id));
    button.addEventListener("keydown", event => navigateStationTabs(event, index));
    nav.appendChild(button);
  });
}

function navigateStationTabs(event, index) {
  if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
  event.preventDefault();
  const total = catalog.stations.length;
  let target = index;
  if (event.key === 'ArrowLeft') target = (index - 1 + total) % total;
  if (event.key === 'ArrowRight') target = (index + 1) % total;
  if (event.key === 'Home') target = 0;
  if (event.key === 'End') target = total - 1;
  selectStation(catalog.stations[target].id, false);
  requestAnimationFrame(() => $("stationNav").querySelector(`[data-station-id="${catalog.stations[target].id}"]`)?.focus());
}

function selectStation(id, scroll = true) {
  activeStationId = id;
  activeSubgroup = "all";
  const current = station();
  activeCode = current.variants[0].code;
  $("searchInput").value = "";
  closeSearchResults();
  renderAll();
  if (scroll) document.querySelector(".workspace").scrollIntoView({ behavior: "smooth", block: "start" });
}

function subgroupLabel(group) {
  const current = station();
  return current.subgroupLabels?.[group] || group;
}

function renderStation() {
  const current = station();
  $("stationShort").textContent = current.short;
  $("stationLabel").textContent = current.label;
  $("stationDescription").textContent = current.description;
  $("stationTranslation").textContent = current.translation;
  $("stationTips").innerHTML = current.tips.map(tip => `<li>${tip}</li>`).join("");

  const groups = [...new Set(current.variants.map(item => item.subgroup))];
  const bar = $("subgroupBar");
  bar.innerHTML = "";
  if (groups.length > 1) {
    bar.classList.remove("hidden");
    [{ id: "all", label: "Todas" }, ...groups.map(group => ({ id: group, label: subgroupLabel(group) }))].forEach(group => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = `subgroup-chip${activeSubgroup === group.id ? " active" : ""}`;
      button.textContent = group.label;
      button.addEventListener("click", () => {
        activeSubgroup = group.id;
        const list = stationVariants();
        if (list.length && !list.some(item => item.code === activeCode)) activeCode = list[0].code;
        renderStation();
        renderComparison();
        saveState();
      });
      bar.appendChild(button);
    });
  } else {
    bar.classList.add("hidden");
  }

  renderTechnical(current);
  renderVariants();
  renderActive();
}

function renderVariants() {
  const rail = $("variantRail");
  rail.innerHTML = "";
  const list = stationVariants();
  if (!list.length) {
    rail.innerHTML = '<p class="metric">No hay referencias disponibles en esta familia.</p>';
    return;
  }
  if (!list.some(item => item.code === activeCode)) activeCode = list[0].code;

  list.forEach(item => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "variant-card";
    button.setAttribute("role", "option");
    button.setAttribute("aria-selected", String(item.code === activeCode));
    button.innerHTML = '<img alt="" loading="lazy"><strong></strong><small></small>';
    button.querySelector("img").src = item.thumb;
    button.querySelector("strong").textContent = item.code;
    button.querySelector("small").textContent = subgroupLabel(item.subgroup);
    button.addEventListener("click", () => {
      activeCode = item.code;
      renderActive();
      renderVariants();
      renderComparison();
      saveState();
    });
    rail.appendChild(button);
  });
}

function renderActive() {
  const item = activeVariant();
  if (!item) return;
  activeCode = item.code;
  $("activeCode").textContent = item.code;
  $("referenceImage").src = item.image;
  $("referenceImage").alt = `Referencia ${item.code} de ${station().label}`;
  $("sourceCaption").textContent = `Código original ${item.code} · Referencia optimizada para comparación`;
  $("referenceDialogTitle").textContent = `${station().label} · ${item.code}`;
  $("referenceDialogImage").src = item.image;
}

function shiftVariant(delta) {
  const list = stationVariants();
  if (!list.length) return;
  let index = list.findIndex(item => item.code === activeCode);
  index = (index + delta + list.length) % list.length;
  activeCode = list[index].code;
  renderActive();
  renderVariants();
  renderComparison();
  saveState();
}

function renderTechnical(current) {
  const box = $("technicalButtons");
  box.innerHTML = "";
  let items = current.technical || [];
  if (current.id === "coldbar" && activeSubgroup !== "all") {
    items = items.filter(item => activeSubgroup.startsWith("CBS") ? item.key.includes("cbs") : item.key.includes("cbe"));
  }
  if (!items.length) {
    const empty = document.createElement("span");
    empty.className = "technical-empty";
    empty.textContent = "No se requiere una vista técnica adicional para esta selección.";
    box.appendChild(empty);
    return;
  }
  items.forEach(item => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "technical-button";
    button.textContent = item.label;
    button.addEventListener("click", () => openTechnical(item));
    box.appendChild(button);
  });
}

function openTechnical(item) {
  $("technicalTitle").textContent = item.label;
  $("technicalImage").src = item.image;
  $("technicalDialog").showModal();
}

function openReference() {
  const item = activeVariant();
  if (!item) return;
  $("referenceDialogTitle").textContent = `${station().label} · ${item.code}`;
  $("referenceDialogImage").src = item.image;
  $("referenceDialog").showModal();
}

function renderComparison() {
  const item = activeVariant();
  if (!item) return;
  $("compareCode").textContent = item.code;
  $("compareReference").src = item.image;
  $("compareReference").alt = `Referencia ${item.code}`;
}

function updateCompletion() {
  const ready = Boolean(evidenceDataUrl);
  const status = $("exportStatus");
  status.textContent = ready ? "Evidencia lista · PDF preparado para una página." : "Agrega evidencia para completar la revisión.";
  status.classList.toggle("ready", ready);
}

function validateEvidenceFile(file) {
  if (!file) return false;
  if (!file.type.startsWith("image/")) {
    announce("Selecciona un archivo de imagen válido.");
    return false;
  }
  if (file.size > MAX_EVIDENCE_BYTES) {
    announce("La imagen es demasiado pesada. Usa una fotografía menor a 18 MB.");
    return false;
  }
  return true;
}

async function processEvidence(file) {
  if (!validateEvidenceFile(file)) return;
  const objectUrl = URL.createObjectURL(file);
  const image = new Image();
  try {
    await new Promise((resolve, reject) => {
      image.onload = resolve;
      image.onerror = () => reject(new Error("No fue posible leer la imagen seleccionada."));
      image.src = objectUrl;
    });
    const scale = Math.min(1, MAX_EVIDENCE_PX / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const ctx = canvas.getContext("2d", { alpha: false });
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    evidenceDataUrl = canvas.toDataURL("image/jpeg", 0.9);
    $("evidenceImage").src = evidenceDataUrl;
    $("evidenceImage").classList.remove("hidden");
    $("dropZone").classList.add("hidden");
    $("removeEvidence").classList.remove("hidden");
    updateCompletion();
    announce("Evidencia lista para comparar y exportar.");
  } catch (error) {
    announce(error.message);
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}

function clearEvidence() {
  evidenceDataUrl = null;
  $("evidenceImage").src = "";
  $("evidenceImage").classList.add("hidden");
  $("dropZone").classList.remove("hidden");
  $("removeEvidence").classList.add("hidden");
  $("evidenceInput").value = "";
  $("cameraInput").value = "";
  updateCompletion();
}

function showSearchResults() {
  const query = $("searchInput").value.trim().toLowerCase();
  const results = $("searchResults");
  results.innerHTML = "";
  if (!query) {
    closeSearchResults();
    return;
  }

  const matches = allVariants().filter(({ station: itemStation, variant }) => {
    const haystack = `${variant.code} ${variant.subgroup} ${itemStation.label} ${itemStation.short}`.toLowerCase();
    return haystack.includes(query);
  }).slice(0, 10);

  if (!matches.length) {
    const empty = document.createElement("div");
    empty.className = "search-empty";
    empty.textContent = "Sin coincidencias. Verifica el código o prueba con otra estación.";
    results.appendChild(empty);
  } else {
    matches.forEach(({ station: itemStation, variant }) => {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "search-result";
      button.setAttribute("role", "option");
      button.innerHTML = "<strong></strong><span></span>";
      button.querySelector("strong").textContent = variant.code;
      button.querySelector("span").textContent = `${itemStation.label} · ${itemStation.subgroupLabels?.[variant.subgroup] || variant.subgroup}`;
      button.addEventListener("click", () => selectSearchResult(itemStation, variant));
      results.appendChild(button);
    });
  }
  results.classList.remove("hidden");
  $("searchInput").setAttribute("aria-expanded", "true");
}

function closeSearchResults() {
  $("searchResults").classList.add("hidden");
  $("searchInput").setAttribute("aria-expanded", "false");
}

function selectSearchResult(itemStation, variant) {
  activeStationId = itemStation.id;
  activeSubgroup = itemStation.variants.some(item => item.subgroup === variant.subgroup) ? variant.subgroup : "all";
  activeCode = variant.code;
  $("searchInput").value = variant.code;
  closeSearchResults();
  renderAll();
  document.querySelector(".workspace").scrollIntoView({ behavior: "smooth", block: "start" });
  announce(`${variant.code} seleccionado en ${itemStation.label}.`);
}

function dataUrlFromBlob(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("No fue posible preparar la imagen para el PDF."));
    reader.readAsDataURL(blob);
  });
}

async function pdfImageSource(source) {
  if (!source) return null;
  if (source.startsWith("data:image/")) return source;
  const response = await fetch(source, { cache: "force-cache" });
  if (!response.ok) throw new Error(`No fue posible cargar la referencia ${activeCode}.`);
  return dataUrlFromBlob(await response.blob());
}

function pdfImageFormat(source) {
  if (/^data:image\/png/i.test(source)) return "PNG";
  if (/^data:image\/webp/i.test(source)) return "WEBP";
  return "JPEG";
}

function fitPdfText(pdf, value, maxWidth) {
  const original = String(value || "");
  if (pdf.getTextWidth(original) <= maxWidth) return original;
  let fitted = original;
  while (fitted.length > 1 && pdf.getTextWidth(`${fitted}…`) > maxWidth) fitted = fitted.slice(0, -1);
  return `${fitted.trimEnd()}…`;
}

function drawPdfImageContain(pdf, source, x, y, width, height, alias) {
  pdf.setFillColor(255, 255, 255);
  pdf.rect(x, y, width, height, "F");
  if (!source) {
    pdf.setFillColor(245, 248, 246);
    pdf.roundedRect(x, y, width, height, 2.5, 2.5, "F");
    pdf.setTextColor(95, 112, 105);
    pdf.setFont("helvetica", "bold");
    pdf.setFontSize(10);
    pdf.text("Sin evidencia fotográfica", x + width / 2, y + height / 2, { align: "center" });
    return;
  }
  const properties = pdf.getImageProperties(source);
  const scale = Math.min(width / properties.width, height / properties.height);
  const imageWidth = properties.width * scale;
  const imageHeight = properties.height * scale;
  const imageX = x + (width - imageWidth) / 2;
  const imageY = y + (height - imageHeight) / 2;
  pdf.addImage(source, pdfImageFormat(source), imageX, imageY, imageWidth, imageHeight, alias, "FAST");
}

function drawPdfCard(pdf, eyebrow, title, source, x, y, width, height, alias) {
  pdf.setDrawColor(190, 216, 204);
  pdf.setLineWidth(0.35);
  pdf.roundedRect(x, y, width, height, 3, 3, "S");
  pdf.setTextColor(0, 98, 65);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7.5);
  pdf.text(eyebrow.toUpperCase(), x + 4, y + 6);
  pdf.setTextColor(28, 51, 44);
  pdf.setFontSize(12.5);
  pdf.text(fitPdfText(pdf, title, width - 8), x + 4, y + 12);
  pdf.setDrawColor(0, 98, 65);
  pdf.line(x + 4, y + 15, x + width - 4, y + 15);
  drawPdfImageContain(pdf, source, x + 4, y + 18, width - 8, height - 22, alias);
}

function pdfGeometry(pdf, evidenceSource) {
  const top = 34;
  const bottom = 257;
  const gap = 5;
  let referenceHeight = 96;
  let orientation = "sin-evidencia";
  if (evidenceSource) {
    const properties = pdf.getImageProperties(evidenceSource);
    const ratio = properties.width / properties.height;
    if (ratio >= 1.2) {
      referenceHeight = 104;
      orientation = "horizontal";
    } else if (ratio <= 0.82) {
      referenceHeight = 82;
      orientation = "vertical";
    } else {
      referenceHeight = 92;
      orientation = "cuadrada";
    }
  }
  const evidenceY = top + referenceHeight + gap;
  return { referenceHeight, evidenceY, evidenceHeight: bottom - evidenceY, orientation };
}

async function buildLayoutExportDocument() {
  if (!window.jspdf?.jsPDF) throw new Error("El generador PDF local no está disponible. Actualiza la aplicación e intenta nuevamente.");
  const current = station();
  const variant = activeVariant();
  const store = $("storeName").value.trim() || "Tienda sin definir";
  const notes = $("notes").value.trim();
  const referenceSource = await pdfImageSource(variant.image);
  const evidenceSource = evidenceDataUrl;
  const pdf = new window.jspdf.jsPDF({ unit: "mm", format: "a4", orientation: "portrait", compress: true, putOnlyUsedFonts: true });
  const W = 210;
  const H = 297;
  const m = PDF_MARGIN;

  pdf.setProperties({
    title: `Lay Out 2.0 - ${variant.code} - ${store}`,
    subject: "Comparativo de referencia y acomodo real",
    author: "Lay Out 2.0",
    creator: "Lay Out 2.0"
  });

  pdf.setTextColor(0, 98, 65);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8.5);
  pdf.text("LAY OUT 2.0", m, 11);
  pdf.setFontSize(18);
  pdf.text(`${current.label} · ${variant.code}`, m, 19);
  pdf.setTextColor(70, 91, 83);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(8.5);
  pdf.text(fitPdfText(pdf, current.description, 128), m, 25);
  pdf.setTextColor(0, 98, 65);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(8.5);
  pdf.text("STARBUCKS", W - m, 11, { align: "right" });
  pdf.setTextColor(70, 91, 83);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7.5);
  pdf.text(fitPdfText(pdf, store, 48), W - m, 18, { align: "right" });
  pdf.text(new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" }).format(new Date()), W - m, 24, { align: "right" });
  pdf.setDrawColor(0, 98, 65);
  pdf.setLineWidth(0.7);
  pdf.line(m, 29, W - m, 29);

  const geometry = pdfGeometry(pdf, evidenceSource);
  drawPdfCard(pdf, "Referencia", variant.code, referenceSource, m, 34, W - m * 2, geometry.referenceHeight, "layout-reference");
  drawPdfCard(pdf, "Acomodo real", variant.code, evidenceSource, m, geometry.evidenceY, W - m * 2, geometry.evidenceHeight, `layout-evidence-${geometry.orientation}`);

  pdf.setDrawColor(210, 223, 217);
  pdf.setLineWidth(0.25);
  pdf.line(m, 262, W - m, 262);
  pdf.setTextColor(0, 98, 65);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7.5);
  pdf.text("NOTAS", m, 268);
  pdf.setTextColor(60, 76, 70);
  pdf.setFont("helvetica", "normal");
  pdf.setFontSize(7.2);
  const noteLines = pdf.splitTextToSize(notes || "Sin notas.", W - m * 2).slice(0, 2);
  pdf.text(noteLines, m, 273, { lineHeightFactor: 1.25 });

  pdf.setDrawColor(210, 223, 217);
  pdf.line(m, H - 12, W - m, H - 12);
  pdf.setTextColor(0, 98, 65);
  pdf.setFont("helvetica", "bold");
  pdf.setFontSize(7);
  pdf.text("Lay Out 2.0", m, H - 7);
  pdf.setTextColor(90, 108, 101);
  pdf.setFont("helvetica", "normal");
  pdf.text(`Una página A4 · margen seguro ${PDF_MARGIN} mm`, W - m, H - 7, { align: "right" });

  if (pdf.internal.getNumberOfPages() !== 1) throw new Error("La validación impidió una exportación de más de una página.");
  return { pdf, filename: `Layout_2.0_${cleanFilename(variant.code)}_${cleanFilename(store)}.pdf` };
}

async function exportPdf() {
  if (!evidenceDataUrl && !window.confirm("Aún no agregas evidencia real. ¿Deseas exportar solo la referencia?")) return;
  const button = $("exportButton");
  const originalText = button.textContent;
  button.disabled = true;
  button.textContent = "Generando…";
  try {
    const { pdf, filename } = await buildLayoutExportDocument();
    pdf.save(filename);
    announce("Lay Out exportado en una página A4.");
  } catch (error) {
    announce(`${error.message} No se generó un PDF incompleto.`);
  } finally {
    button.disabled = false;
    button.textContent = originalText;
  }
}

function bindDialogClose(dialogId, buttonId) {
  const dialog = $(dialogId);
  $(buttonId).addEventListener("click", () => dialog.close());
  dialog.addEventListener("click", event => {
    if (event.target === dialog) dialog.close();
  });
}

function bindSwipe() {
  const stage = $("zoomReference");
  let startX = null;
  stage.addEventListener("touchstart", event => {
    startX = event.changedTouches[0]?.clientX ?? null;
  }, { passive: true });
  stage.addEventListener("touchend", event => {
    if (startX === null) return;
    const endX = event.changedTouches[0]?.clientX ?? startX;
    const delta = endX - startX;
    startX = null;
    if (Math.abs(delta) < 55) return;
    shiftVariant(delta < 0 ? 1 : -1);
  }, { passive: true });
}

function bind() {
  $("prevButton").addEventListener("click", () => shiftVariant(-1));
  $("nextButton").addEventListener("click", () => shiftVariant(1));
  $("zoomReference").addEventListener("click", openReference);
  bindSwipe();

  $("searchInput").addEventListener("input", showSearchResults);
  $("searchInput").addEventListener("focus", showSearchResults);
  $("searchInput").addEventListener("keydown", event => {
    if (event.key === "Escape") {
      $("searchInput").value = "";
      closeSearchResults();
    }
    if (event.key === "Enter") {
      const first = $("searchResults").querySelector(".search-result");
      if (first) {
        event.preventDefault();
        first.click();
      }
    }
  });
  document.addEventListener("click", event => {
    if (!event.target.closest(".search-field")) closeSearchResults();
  });

  $("storeName").addEventListener("input", saveState);
  $("notes").addEventListener("input", saveState);
  $("cameraButton").addEventListener("click", () => $("cameraInput").click());
  $("attachButton").addEventListener("click", () => $("evidenceInput").click());
  $("cameraInput").addEventListener("change", event => processEvidence(event.target.files[0]));
  $("evidenceInput").addEventListener("change", event => processEvidence(event.target.files[0]));
  $("removeEvidence").addEventListener("click", clearEvidence);
  $("dropZone").addEventListener("click", () => $("evidenceInput").click());
  $("dropZone").addEventListener("keydown", event => {
    if (event.key === "Enter" || event.key === " ") {
      event.preventDefault();
      $("evidenceInput").click();
    }
  });

  const dropZone = $("dropZone");
  ["dragenter", "dragover"].forEach(name => dropZone.addEventListener(name, event => {
    event.preventDefault();
    dropZone.classList.add("dragging");
  }));
  ["dragleave", "drop"].forEach(name => dropZone.addEventListener(name, event => {
    event.preventDefault();
    dropZone.classList.remove("dragging");
  }));
  dropZone.addEventListener("drop", event => processEvidence(event.dataTransfer.files[0]));

  $("exportButton").addEventListener("click", exportPdf);
  $("resetButton").addEventListener("click", () => {
    localStorage.removeItem(MEMORY_KEY);
    $("storeName").value = "";
    $("searchInput").value = "";
    $("notes").value = "";
    activeStationId = catalog.stations[0].id;
    activeSubgroup = "all";
    activeCode = catalog.stations[0].variants[0].code;
    clearEvidence();
    closeSearchResults();
    renderAll();
    announce("Revisión reiniciada.");
  });

  bindDialogClose("technicalDialog", "closeTechnical");
  bindDialogClose("referenceDialog", "closeReference");

  $("mobilePrevious").addEventListener("click", () => shiftVariant(-1));
  $("mobilePhoto").addEventListener("click", () => $("cameraInput").click());
  $("mobileExport").addEventListener("click", exportPdf);

  window.addEventListener("online", updateNetwork);
  window.addEventListener("offline", updateNetwork);
  window.addEventListener("beforeinstallprompt", event => {
    event.preventDefault();
    deferredInstall = event;
    $("installButton").classList.remove("hidden");
  });
  $("installButton").addEventListener("click", async () => {
    if (!deferredInstall) return;
    deferredInstall.prompt();
    await deferredInstall.userChoice;
    deferredInstall = null;
    $("installButton").classList.add("hidden");
  });
}

function updateNetwork() {
  $("networkStatus").textContent = navigator.onLine ? "En línea" : "Sin conexión";
  $("networkStatus").classList.toggle("offline", !navigator.onLine);
}

async function start() {
  bind();
  updateNetwork();
  try {
    await loadCatalog();
  } catch (error) {
    document.querySelector(".app").innerHTML = `<section class="panel"><h1>No se pudo abrir Lay Out 2.0</h1><p>${error.message}</p></section>`;
  }
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
}

document.addEventListener("DOMContentLoaded", start);
