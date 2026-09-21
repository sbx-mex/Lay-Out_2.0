"use strict";

const DEFAULT_DM_IMAGE_WIDTH = 1800;
const DEFAULT_DM_STATION_HEIGHT = 560;
let dmOptionalStations = new Set();
let dmExportInProgress = false;
const dmValidationEntries = new Map();

function setEvidenceView(entry) {
  evidenceDataUrl = entry?.evidence || null;
  evidenceMeta = entry?.evidenceMeta ? { ...entry.evidenceMeta } : null;
  $("evidenceImage").src = evidenceDataUrl || "";
  $("evidenceImage").classList.toggle("hidden", !evidenceDataUrl);
  $("dropZone").classList.toggle("hidden", Boolean(evidenceDataUrl));
  $("removeEvidence").classList.toggle("hidden", !evidenceDataUrl);
  $("evidenceInput").value = "";
  $("cameraInput").value = "";
  updateCaptureGuidance();
  updateCompletion();
}

function restoreEvidenceForStation(stationId) {
  setEvidenceView(dmValidationEntries.get(stationId));
}

function syncCurrentValidationEntry() {
  if (!catalog || !activeStationId || !evidenceDataUrl) return;
  const current = station();
  const variant = activeVariant();
  if (!current || !variant) return;
  dmValidationEntries.set(current.id, {
    stationId: current.id,
    stationLabel: current.label,
    subgroup: activeSubgroup,
    variantId: variant.id,
    code: variant.code,
    context: variantContext(variant),
    reference: variant.image,
    evidence: evidenceDataUrl,
    evidenceMeta: evidenceMeta ? { ...evidenceMeta } : null
  });
}

function dmValidationConfig() {
  return catalog?.dmValidation || {
    optionalStations: ["drive-thru", "mop"],
    defaultOptionalStations: ["mop"],
    imageWidth: DEFAULT_DM_IMAGE_WIDTH,
    stationHeight: DEFAULT_DM_STATION_HEIGHT
  };
}

function isDmStationSelected(current) {
  const optional = dmValidationConfig().optionalStations || [];
  return !optional.includes(current.id) || dmOptionalStations.has(current.id);
}

function selectedDmStations() {
  return (catalog?.stations || []).filter(isDmStationSelected);
}

function openDmStation(stationId) {
  const current = catalog.stations.find(item => item.id === stationId);
  if (!current) return;
  const saved = dmValidationEntries.get(stationId);
  const subgroup = saved?.subgroup && stationGroups(current).includes(saved.subgroup)
    ? saved.subgroup
    : defaultSubgroup(current);
  selectStationChoice(stationChoiceValue(stationId, subgroup), false);
  $("compareWorkspace").scrollIntoView({ behavior: "smooth", block: "start" });
  announce(`${current.label}: selecciona la referencia y agrega la evidencia real.`);
}

function createDmStationCard(current, index) {
  const entry = dmValidationEntries.get(current.id);
  const card = document.createElement("article");
  card.className = `dm-station-card${entry ? " is-ready" : ""}`;
  card.dataset.station = current.id;
  const heading = document.createElement("div");
  heading.className = "dm-station-card__head";
  const number = document.createElement("span");
  number.className = "dm-station-card__number";
  number.textContent = String(index + 1).padStart(2, "0");
  const copy = document.createElement("div");
  const title = document.createElement("strong");
  title.textContent = current.label;
  const detail = document.createElement("small");
  detail.textContent = entry ? `${entry.code} · ${entry.context}` : "Referencia y evidencia pendientes";
  copy.append(title, detail);
  const badge = document.createElement("span");
  badge.className = "dm-station-card__badge";
  badge.textContent = entry ? "✓ Lista" : "Pendiente";
  heading.append(number, copy, badge);
  card.appendChild(heading);
  if (entry) {
    const preview = document.createElement("div");
    preview.className = "dm-station-card__preview";
    [["Referencia", entry.reference], ["Real", entry.evidence]].forEach(([label, source]) => {
      const figure = document.createElement("figure");
      const caption = document.createElement("figcaption");
      const image = document.createElement("img");
      caption.textContent = label;
      image.src = source;
      image.alt = `${label} de ${current.label}`;
      figure.append(caption, image);
      preview.appendChild(figure);
    });
    card.appendChild(preview);
  }
  const action = document.createElement("button");
  action.type = "button";
  action.className = entry ? "button button--ghost-dark" : "button";
  action.textContent = entry ? "Actualizar validación" : "Validar estación";
  action.addEventListener("click", () => openDmStation(current.id));
  card.appendChild(action);
  return card;
}

function renderDmOptionalStations() {
  const box = $("dmOptionalStations");
  if (!box || !catalog) return;
  box.replaceChildren();
  const optionalIds = dmValidationConfig().optionalStations || [];
  optionalIds.forEach(id => {
    const current = catalog.stations.find(item => item.id === id);
    if (!current) return;
    const label = document.createElement("label");
    label.className = "dm-option";
    const input = document.createElement("input");
    input.type = "checkbox";
    input.checked = dmOptionalStations.has(id);
    const mark = document.createElement("span");
    mark.className = "dm-option__mark";
    mark.setAttribute("aria-hidden", "true");
    const copy = document.createElement("span");
    const title = document.createElement("strong");
    const detail = document.createElement("small");
    title.textContent = current.label;
    detail.textContent = "Opcional · activar sólo si aplica";
    copy.append(title, detail);
    input.addEventListener("change", () => {
      if (input.checked) dmOptionalStations.add(id);
      else dmOptionalStations.delete(id);
      saveState();
      renderDmValidation();
    });
    label.append(input, mark, copy);
    box.appendChild(label);
  });
}

function renderDmValidation() {
  if (!catalog || !$("dmStationGrid")) return;
  renderDmOptionalStations();
  const selected = selectedDmStations();
  const completed = selected.filter(current => dmValidationEntries.has(current.id)).length;
  const metadataReady = Boolean($("storeName").value.trim() && $("dmName").value.trim());
  $("dmProgress").textContent = `${completed} de ${selected.length} estaciones`;
  $("dmProgressBar").style.width = `${selected.length ? completed / selected.length * 100 : 0}%`;
  const status = $("dmValidationStatus");
  if (!metadataReady) status.textContent = "Completa Tienda y DM para habilitar la imagen.";
  else if (completed < selected.length) status.textContent = `Faltan ${selected.length - completed} estaciones por validar.`;
  else status.textContent = "Validación completa · imagen consolidada lista.";
  status.classList.toggle("ready", metadataReady && completed === selected.length);
  $("dmImageButton").disabled = !metadataReady || completed !== selected.length || dmExportInProgress;
  $("dmStationGrid").replaceChildren(...selected.map(createDmStationCard));
}

function canvasRoundRect(ctx, x, y, width, height, radius) {
  const r = Math.min(radius, width / 2, height / 2);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + width, y, x + width, y + height, r);
  ctx.arcTo(x + width, y + height, x, y + height, r);
  ctx.arcTo(x, y + height, x, y, r);
  ctx.arcTo(x, y, x + width, y, r);
  ctx.closePath();
}

function fitCanvasText(ctx, value, maxWidth) {
  const original = String(value || "—");
  if (ctx.measureText(original).width <= maxWidth) return original;
  let fitted = original;
  while (fitted.length > 1 && ctx.measureText(`${fitted}…`).width > maxWidth) fitted = fitted.slice(0, -1);
  return `${fitted.trimEnd()}…`;
}

function drawCanvasImageContain(ctx, image, x, y, width, height) {
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(x, y, width, height);
  const scale = Math.min(width / image.naturalWidth, height / image.naturalHeight);
  const drawWidth = image.naturalWidth * scale;
  const drawHeight = image.naturalHeight * scale;
  ctx.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
}

function drawDmMetadataCell(ctx, label, value, x, y, width, height) {
  ctx.fillStyle = "rgba(255,255,255,.12)";
  canvasRoundRect(ctx, x, y, width, height, 16);
  ctx.fill();
  ctx.fillStyle = "#bfe3d3";
  ctx.font = "700 17px Inter, Segoe UI, sans-serif";
  ctx.fillText(label.toUpperCase(), x + 18, y + 25);
  ctx.fillStyle = "#ffffff";
  ctx.font = "800 24px Inter, Segoe UI, sans-serif";
  ctx.fillText(fitCanvasText(ctx, value, width - 36), x + 18, y + 58);
}

function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 2500);
}

async function buildDmInfographic() {
  const selected = selectedDmStations();
  const records = selected.map(current => ({ current, entry: dmValidationEntries.get(current.id) }));
  if (records.some(record => !record.entry)) throw new Error("Completa todas las estaciones seleccionadas antes de crear la imagen.");
  const config = dmValidationConfig();
  const width = Number(config.imageWidth) || DEFAULT_DM_IMAGE_WIDTH;
  const rowHeight = Number(config.stationHeight) || DEFAULT_DM_STATION_HEIGHT;
  const outer = 44;
  const gap = 24;
  const headerHeight = 250;
  const footerHeight = 72;
  const height = headerHeight + outer + records.length * rowHeight + Math.max(0, records.length - 1) * gap + footerHeight;
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d", { alpha: false });
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.fillStyle = "#f2f6f4";
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = "#003b2a";
  ctx.fillRect(0, 0, width, headerHeight);
  ctx.fillStyle = "#ffffff";
  ctx.font = "900 48px Inter, Segoe UI, sans-serif";
  ctx.fillText("VALIDACIÓN DM", outer, 66);
  ctx.fillStyle = "#bfe3d3";
  ctx.font = "600 22px Inter, Segoe UI, sans-serif";
  ctx.fillText(`${records.length} estaciones · Referencia vs. acomodo real`, outer, 99);
  const metadata = [
    ["Tienda", $("storeName").value.trim()],
    ["DM", $("dmName").value.trim()],
    ["Campaña", campaign()?.label || "—"],
    ["Fecha", new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" }).format(new Date())]
  ];
  const metaGap = 14;
  const metaWidth = (width - outer * 2 - metaGap * 3) / 4;
  metadata.forEach(([label, value], index) => drawDmMetadataCell(ctx, label, value || "Sin definir", outer + index * (metaWidth + metaGap), 126, metaWidth, 88));
  const prepared = await Promise.all(records.map(async record => ({
    ...record,
    referenceImage: await loadImageElement(record.entry.reference),
    evidenceImage: await loadImageElement(record.entry.evidence)
  })));
  const contentWidth = width - outer * 2;
  const panelGap = 18;
  const halfWidth = (contentWidth - panelGap) / 2;
  let y = headerHeight + outer;
  prepared.forEach((record, index) => {
    const { current, entry, referenceImage, evidenceImage } = record;
    ctx.fillStyle = "#ffffff";
    ctx.strokeStyle = "#bdd2c9";
    ctx.lineWidth = 2;
    canvasRoundRect(ctx, outer, y, contentWidth, rowHeight, 22);
    ctx.fill();
    ctx.stroke();
    ctx.fillStyle = "#006241";
    canvasRoundRect(ctx, outer, y, contentWidth, 72, 22);
    ctx.fill();
    ctx.fillRect(outer, y + 42, contentWidth, 30);
    ctx.fillStyle = "#ffffff";
    ctx.font = "900 27px Inter, Segoe UI, sans-serif";
    ctx.fillText(`${String(index + 1).padStart(2, "0")}  ${current.label} | ${entry.code} · ${entry.context}`, outer + 22, y + 45);
    [["REFERENCIA", referenceImage], ["REAL", evidenceImage]].forEach(([label, image], column) => {
      const x = outer + column * (halfWidth + panelGap);
      const figureY = y + 86;
      const figureHeight = rowHeight - 102;
      ctx.fillStyle = "#f8faf9";
      ctx.strokeStyle = "#d5e2dc";
      canvasRoundRect(ctx, x, figureY, halfWidth, figureHeight, 14);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = column === 0 ? "#006241" : "#c69c54";
      ctx.font = "900 18px Inter, Segoe UI, sans-serif";
      ctx.fillText(label, x + 16, figureY + 29);
      drawCanvasImageContain(ctx, image, x + 10, figureY + 42, halfWidth - 20, figureHeight - 52);
    });
    y += rowHeight + gap;
  });
  ctx.fillStyle = "#35564a";
  ctx.font = "700 18px Inter, Segoe UI, sans-serif";
  ctx.textAlign = "center";
  ctx.fillText("LayOut 2.0 · Validación visual consolidada", width / 2, height - 28);
  ctx.textAlign = "left";
  const blob = await new Promise((resolve, reject) => canvas.toBlob(
    value => value ? resolve(value) : reject(new Error("No fue posible preparar la imagen consolidada.")),
    "image/jpeg",
    0.94
  ));
  const now = new Date();
  const dateKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
  return { blob, filename: `Validacion_DM_${cleanFilename($("storeName").value.trim())}_${cleanFilename(campaign()?.label)}_${dateKey}.jpg` };
}

async function exportDmInfographic() {
  if (exportInProgress || dmExportInProgress) return;
  const store = $("storeName").value.trim();
  const dm = $("dmName").value.trim();
  if (!store || !dm) {
    announce("Completa Tienda y DM antes de crear la imagen.");
    return;
  }
  const selected = selectedDmStations();
  const completed = selected.filter(current => dmValidationEntries.has(current.id)).length;
  if (completed !== selected.length) {
    announce(`Completa las ${selected.length - completed} estaciones pendientes.`);
    return;
  }
  dmExportInProgress = true;
  setExportBusy(true);
  renderDmValidation();
  $("exportProgressTitle").textContent = "Creando infografía DM";
  $("exportProgressText").textContent = "Estamos acomodando cada referencia y evidencia en una sola imagen.";
  const feedbackStarted = performance.now();
  let completedExport = false;
  try {
    await waitForInterfacePaint();
    const { blob, filename } = await buildDmInfographic();
    const remainingFeedback = MIN_EXPORT_FEEDBACK_MS - (performance.now() - feedbackStarted);
    if (remainingFeedback > 0) await new Promise(resolve => window.setTimeout(resolve, remainingFeedback));
    downloadBlob(blob, filename);
    completedExport = true;
    $("exportCompleteTitle").textContent = "Infografía lista";
    $("exportCompleteText").textContent = `La validación DM consolidó ${selected.length} estaciones en una sola imagen.`;
    announce("Infografía DM descargada correctamente.");
  } catch (error) {
    announce(`${error.message} No se generó una imagen incompleta.`);
  } finally {
    dmExportInProgress = false;
    setExportBusy(false);
    $("exportProgressTitle").textContent = "Preparando tu PDF";
    $("exportProgressText").textContent = "Estamos trabajando. Tu descarga aparecerá enseguida.";
    renderDmValidation();
  }
  if (completedExport) $("exportCompleteDialog").showModal();
}
