"use strict";

(() => {
  const DATA_URL = "data/layouts.json";
  const INFOGRAPHIC_URL = "data/dm-infographic.json";
  const STATE_KEY = "layout20-dm-independent-v1";
  const MAIN_STATE_KEY = "layout20-state-v4";
  const OPTIONAL_IDS = ["drive-thru", "mop"];
  const DEFAULT_OPTIONAL_IDS = ["mop"];
  const MAX_FILE_BYTES = 18 * 1024 * 1024;
  const MAX_IMAGE_SIDE = 2000;
  const evidence = new Map();
  const preloadedReferences = new Set();
  const queuedReferences = new Set();
  let catalog = null;
  let infographicConfig = null;
  let dialog = null;
  let pendingStationId = null;
  let preloadQueue = [];
  let preloadScheduled = false;
  let toastTimer = null;
  let exporting = false;
  let state = loadDmState();

  function byId(id) {
    return document.getElementById(id);
  }

  function loadDmState() {
    const fallback = { store: "", dm: "", campaign: "", region: "#OrgulloCN", optional: DEFAULT_OPTIONAL_IDS, variants: {}, improvements: {} };
    try {
      const saved = JSON.parse(localStorage.getItem(STATE_KEY) || "null");
      if (!saved || typeof saved !== "object") return fallback;
      return {
        store: String(saved.store || ""),
        dm: String(saved.dm || ""),
        campaign: String(saved.campaign || ""),
        region: String(saved.region || "#OrgulloCN"),
        optional: Array.isArray(saved.optional) ? saved.optional.filter(id => OPTIONAL_IDS.includes(id)) : DEFAULT_OPTIONAL_IDS,
        variants: saved.variants && typeof saved.variants === "object" ? saved.variants : {},
        improvements: saved.improvements && typeof saved.improvements === "object" ? saved.improvements : {}
      };
    } catch {
      return fallback;
    }
  }

  function saveDmState() {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  }

  function cleanFilename(value) {
    return String(value || "sin-definir")
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[^a-zA-Z0-9_-]+/g, "_")
      .replace(/^_+|_+$/g, "") || "sin-definir";
  }

  function createDialog() {
    dialog = document.createElement("dialog");
    dialog.id = "dmxDialog";
    dialog.className = "dmx-shell";
    dialog.setAttribute("aria-labelledby", "dmxTitle");
    dialog.innerHTML = `
      <div class="dmx-app">
        <header class="dmx-header">
          <div class="dmx-header__title">
            <span class="dmx-header__mark" aria-hidden="true">DM</span>
            <span><strong id="dmxTitle">Validación DM</strong><small>Módulo independiente · Referencia vs. Real</small></span>
          </div>
          <button id="dmxClose" class="dmx-close" type="button" aria-label="Cerrar Validación DM">×</button>
        </header>
        <div class="dmx-content">
          <section class="dmx-intro">
            <div><span class="dmx-eyebrow">Infografía consolidada</span><h2>Valida rápido, estación por estación</h2><p>Desliza el carrete, compara y agrega la evidencia real.</p></div>
            <span id="dmxDate" class="dmx-date"></span>
          </section>
          <section class="dmx-meta dmx-panel" aria-label="Datos de la validación">
            <label class="dmx-field"><span>Tienda</span><input id="dmxStore" maxlength="80" autocomplete="organization" placeholder="Ej. Cosmopol"></label>
            <label class="dmx-field"><span>DM</span><input id="dmxManager" maxlength="80" autocomplete="name" placeholder="Ej. Enrique César"></label>
            <label class="dmx-field"><span>Campaña</span><select id="dmxCampaign"></select></label>
            <label class="dmx-field"><span>Región / hashtag</span><input id="dmxRegion" maxlength="40" placeholder="#OrgulloCN"></label>
          </section>
          <section class="dmx-tools dmx-panel">
            <div>
              <div class="dmx-progress-copy"><strong id="dmxProgress">0 de 6 estaciones</strong><span>Carretes precargados · altura de imagen automática</span></div>
              <div class="dmx-track" aria-hidden="true"><i id="dmxProgressBar"></i></div>
            </div>
            <div id="dmxOptions" class="dmx-options" role="group" aria-label="Estaciones opcionales"></div>
          </section>
          <div class="dmx-columns" aria-hidden="true"><span>Referencia</span><span>Real</span></div>
          <section id="dmxGrid" class="dmx-grid" aria-live="polite"></section>
        </div>
        <footer class="dmx-footer">
          <div class="dmx-footer__copy"><strong id="dmxStatus">Agrega Tienda, DM y las evidencias.</strong><small>Pedidos móviles inicia activo; Drive Thru se agrega cuando aplica.</small></div>
          <button id="dmxExport" class="dmx-export" type="button" disabled>Crear imagen consolidada</button>
        </footer>
        <div id="dmxBusy" class="dmx-busy" hidden><div class="dmx-busy__card"><div class="dmx-spinner" aria-hidden="true"></div><strong>Creando infografía DM</strong><small>Acomodando referencias y evidencias en una sola imagen.</small></div></div>
        <div id="dmxToast" class="dmx-toast" role="status" aria-live="polite" hidden></div>
        <input id="dmxCamera" type="file" accept="image/*" capture="environment" hidden>
        <input id="dmxFile" type="file" accept="image/*" hidden>
      </div>`;
    document.body.appendChild(dialog);
    byId("dmxClose").addEventListener("click", closeDmValidation);
    byId("dmxExport").addEventListener("click", exportDmInfographic);
    byId("dmxCamera").addEventListener("change", event => processDmEvidence(event.target.files?.[0]));
    byId("dmxFile").addEventListener("change", event => processDmEvidence(event.target.files?.[0]));
    byId("dmxStore").addEventListener("input", event => {
      state.store = event.target.value.trimStart();
      saveDmState();
      updateDmProgress();
    });
    byId("dmxManager").addEventListener("input", event => {
      state.dm = event.target.value.trimStart();
      saveDmState();
      updateDmProgress();
    });
    byId("dmxCampaign").addEventListener("change", event => {
      state.campaign = event.target.value;
      saveDmState();
    });
    byId("dmxRegion").addEventListener("input", event => {
      state.region = event.target.value.trimStart();
      saveDmState();
    });
    dialog.addEventListener("close", () => byId("dmValidationOpen")?.focus());
    dialog.addEventListener("cancel", event => {
      if (exporting) event.preventDefault();
    });
  }

  function showDmToast(message) {
    const toast = byId("dmxToast");
    toast.textContent = message;
    toast.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => { toast.hidden = true; }, 3600);
  }

  function readMainState() {
    try {
      return JSON.parse(localStorage.getItem(MAIN_STATE_KEY) || "{}");
    } catch {
      return {};
    }
  }

  function syncMainDefaults() {
    const mainState = readMainState();
    const visibleStore = byId("storeName")?.value.trim();
    const visibleCampaign = byId("campaignSelect")?.value;
    if (visibleStore || mainState.store) state.store = visibleStore || mainState.store;
    if (visibleCampaign || mainState.campaign) state.campaign = visibleCampaign || mainState.campaign;
    if (!catalog.campaigns.some(item => item.id === state.campaign)) state.campaign = catalog.campaigns[0]?.id || "";
    saveDmState();
  }

  function renderDmMetadata() {
    const campaign = byId("dmxCampaign");
    campaign.replaceChildren(...catalog.campaigns.map(item => {
      const option = document.createElement("option");
      option.value = item.id;
      option.textContent = `${item.label} ${item.icon || ""}`.trim();
      return option;
    }));
    byId("dmxStore").value = state.store;
    byId("dmxManager").value = state.dm;
    byId("dmxRegion").value = state.region || "#OrgulloCN";
    campaign.value = state.campaign;
    byId("dmxDate").textContent = `Fecha · ${new Intl.DateTimeFormat("es-MX", { dateStyle: "long" }).format(new Date())}`;
  }

  function selectedDmStations() {
    return catalog.stations.filter(station => !OPTIONAL_IDS.includes(station.id) || state.optional.includes(station.id));
  }

  function variantFor(station) {
    const selectedId = state.variants[station.id];
    return station.variants.find(item => item.id === selectedId) || station.variants[0];
  }

  function variantIndexFor(station) {
    return Math.max(0, station.variants.findIndex(item => item.id === variantFor(station)?.id));
  }

  function variantContext(station, variant) {
    return variant.equipment || station.subgroupLabels?.[variant.subgroup] || variant.subgroup || "Estación";
  }

  function preloadReference(source) {
    if (!source || preloadedReferences.has(source)) return;
    const image = new Image();
    image.decoding = "async";
    image.onload = image.onerror = () => preloadedReferences.add(source);
    image.src = source;
  }

  function queueDmReference(source) {
    if (!source || preloadedReferences.has(source) || queuedReferences.has(source)) return;
    queuedReferences.add(source);
    preloadQueue.push(source);
  }

  function scheduleDmPreload() {
    if (preloadScheduled || !preloadQueue.length) return;
    preloadScheduled = true;
    const runBatch = deadline => {
      preloadScheduled = false;
      let processed = 0;
      while (preloadQueue.length && processed < 6 && (!deadline || deadline.timeRemaining() > 2)) {
        const source = preloadQueue.shift();
        queuedReferences.delete(source);
        preloadReference(source);
        processed += 1;
      }
      if (preloadQueue.length) scheduleDmPreload();
    };
    if ("requestIdleCallback" in window) window.requestIdleCallback(runBatch, { timeout: 700 });
    else window.setTimeout(() => runBatch(null), 80);
  }

  function preloadDmReferences(stations = selectedDmStations()) {
    stations.forEach(station => {
      const index = variantIndexFor(station);
      [index, index - 1, index + 1].forEach(rawIndex => {
        const variant = station.variants[(rawIndex + station.variants.length) % station.variants.length];
        preloadReference(variant?.image);
      });
      station.variants.forEach(variant => queueDmReference(variant.image));
    });
    scheduleDmPreload();
  }

  function renderDmOptions() {
    const host = byId("dmxOptions");
    host.replaceChildren();
    OPTIONAL_IDS.forEach(id => {
      const station = catalog.stations.find(item => item.id === id);
      if (!station) return;
      const label = document.createElement("label");
      label.className = "dmx-option";
      const input = document.createElement("input");
      input.type = "checkbox";
      input.checked = state.optional.includes(id);
      const mark = document.createElement("span");
      mark.className = "dmx-option__mark";
      mark.setAttribute("aria-hidden", "true");
      const copy = document.createElement("span");
      const title = document.createElement("strong");
      const detail = document.createElement("small");
      title.textContent = station.label;
      detail.textContent = "Opcional · activar si aplica";
      copy.append(title, detail);
      input.addEventListener("change", () => {
        state.optional = input.checked
          ? [...new Set([...state.optional, id])]
          : state.optional.filter(item => item !== id);
        saveDmState();
        renderDmStations();
      });
      label.append(input, mark, copy);
      host.appendChild(label);
    });
  }

  function createDmFigure(kind, station, source) {
    const figure = document.createElement("figure");
    figure.className = `dmx-figure${kind === "Real" ? " dmx-figure--real" : ""}`;
    if (source) {
      const image = document.createElement("img");
      image.src = source;
      image.alt = `${kind} de ${station.label}`;
      figure.appendChild(image);
    } else {
      const empty = document.createElement("div");
      empty.className = "dmx-empty";
      const icon = document.createElement("b");
      const copy = document.createElement("span");
      icon.textContent = "+";
      copy.textContent = "Evidencia pendiente";
      empty.append(icon, copy);
      figure.appendChild(empty);
    }
    return figure;
  }

  function openDmPicker(stationId, inputId) {
    pendingStationId = stationId;
    byId(inputId).click();
  }

  function shiftDmVariant(station, delta, card, index, focusAction = "") {
    const variants = station.variants;
    if (variants.length < 2) return;
    const nextIndex = (variantIndexFor(station) + delta + variants.length) % variants.length;
    state.variants[station.id] = variants[nextIndex].id;
    saveDmState();
    const fresh = createDmStationCard(station, index);
    fresh.classList.add(delta > 0 ? "slide-next" : "slide-previous");
    card.replaceWith(fresh);
    window.setTimeout(() => fresh.classList.remove("slide-next", "slide-previous"), 280);
    if (focusAction) fresh.querySelector(`[data-dmx-action="${focusAction}"]`)?.focus({ preventScroll: true });
  }

  function bindDmCarousel(viewport, station, card, index) {
    const image = viewport.querySelector("img");
    let gesture = null;
    let suppressClickUntil = 0;
    image.addEventListener("pointerdown", event => {
      if (!event.isPrimary || event.button > 0 || station.variants.length < 2) return;
      gesture = { id: event.pointerId, x: event.clientX, y: event.clientY, started: performance.now() };
      image.setPointerCapture(event.pointerId);
    });
    image.addEventListener("pointermove", event => {
      if (!gesture || gesture.id !== event.pointerId) return;
      const deltaX = event.clientX - gesture.x;
      const deltaY = event.clientY - gesture.y;
      if (Math.abs(deltaX) <= Math.abs(deltaY) || Math.abs(deltaX) < 8) return;
      image.classList.add("is-dragging");
      image.style.transform = `translateX(${Math.max(-90, Math.min(90, deltaX))}px)`;
      image.style.opacity = String(Math.max(.72, 1 - Math.abs(deltaX) / 420));
    });
    const finish = event => {
      if (!gesture || gesture.id !== event.pointerId) return;
      const deltaX = event.clientX - gesture.x;
      const deltaY = event.clientY - gesture.y;
      const elapsed = performance.now() - gesture.started;
      const threshold = catalog.performance?.swipeThreshold || 48;
      const isHorizontal = Math.abs(deltaX) > Math.abs(deltaY) * 1.25;
      const isSwipe = isHorizontal && (Math.abs(deltaX) >= threshold || (elapsed < 260 && Math.abs(deltaX) >= 30));
      if (image.hasPointerCapture(event.pointerId)) image.releasePointerCapture(event.pointerId);
      gesture = null;
      image.classList.remove("is-dragging");
      image.style.transform = "";
      image.style.opacity = "";
      if (!isSwipe) return;
      suppressClickUntil = performance.now() + 400;
      if (navigator.vibrate) navigator.vibrate(12);
      shiftDmVariant(station, deltaX < 0 ? 1 : -1, card, index);
    };
    image.addEventListener("pointerup", finish);
    image.addEventListener("pointercancel", finish);
    image.addEventListener("click", () => {
      if (performance.now() < suppressClickUntil || station.variants.length < 2) return;
      shiftDmVariant(station, 1, card, index);
    });
    image.addEventListener("keydown", event => {
      if (!["ArrowLeft", "ArrowRight", "Enter", " "].includes(event.key)) return;
      event.preventDefault();
      shiftDmVariant(station, event.key === "ArrowLeft" ? -1 : 1, card, index);
    });
  }

  function createDmStationCard(station, index) {
    const currentVariant = variantFor(station);
    const record = evidence.get(station.id);
    const card = document.createElement("article");
    card.className = `dmx-station${record ? " is-ready" : ""}`;
    const head = document.createElement("div");
    head.className = "dmx-station__head";
    const number = document.createElement("span");
    number.className = "dmx-number";
    number.textContent = String(index + 1).padStart(2, "0");
    const copy = document.createElement("div");
    const title = document.createElement("strong");
    const detail = document.createElement("small");
    title.textContent = station.label;
    detail.textContent = `${currentVariant.code} · ${variantContext(station, currentVariant)}`;
    copy.append(title, detail);
    const badge = document.createElement("span");
    badge.className = "dmx-badge";
    badge.textContent = record ? "✓ Validada" : "Pendiente";
    head.append(number, copy, badge);

    const compare = document.createElement("div");
    compare.className = "dmx-compare";
    const reference = document.createElement("section");
    reference.className = "dmx-reference";
    const carouselHead = document.createElement("div");
    carouselHead.className = "dmx-carousel-head";
    const referenceCode = document.createElement("strong");
    referenceCode.textContent = `${currentVariant.code} · ${variantContext(station, currentVariant)}`;
    const carouselNav = document.createElement("div");
    carouselNav.className = "dmx-carousel-nav";
    const previous = document.createElement("button");
    previous.type = "button";
    previous.className = "dmx-carousel-arrow";
    previous.dataset.dmxAction = "previous";
    previous.setAttribute("aria-label", `Referencia anterior de ${station.label}`);
    previous.textContent = "←";
    const position = document.createElement("span");
    const currentIndex = variantIndexFor(station);
    position.textContent = `${currentIndex + 1} de ${station.variants.length}`;
    const next = document.createElement("button");
    next.type = "button";
    next.className = "dmx-carousel-arrow";
    next.dataset.dmxAction = "next";
    next.setAttribute("aria-label", `Referencia siguiente de ${station.label}`);
    next.textContent = "→";
    previous.disabled = next.disabled = station.variants.length < 2;
    previous.addEventListener("click", () => shiftDmVariant(station, -1, card, index, "previous"));
    next.addEventListener("click", () => shiftDmVariant(station, 1, card, index, "next"));
    carouselNav.append(previous, position, next);
    carouselHead.append(referenceCode, carouselNav);
    const viewport = document.createElement("figure");
    viewport.className = "dmx-carousel";
    const referenceImage = document.createElement("img");
    referenceImage.src = currentVariant.image;
    referenceImage.alt = `Referencia ${currentIndex + 1} de ${station.variants.length}: ${station.label}, ${currentVariant.code}`;
    referenceImage.tabIndex = 0;
    referenceImage.setAttribute("role", "button");
    referenceImage.setAttribute("aria-label", `Desliza o usa flechas para cambiar la referencia de ${station.label}`);
    referenceImage.draggable = false;
    viewport.appendChild(referenceImage);
    const carouselFoot = document.createElement("div");
    carouselFoot.className = "dmx-carousel-foot";
    const swipeHint = document.createElement("span");
    swipeHint.textContent = "↔ Desliza para cambiar";
    const rail = document.createElement("i");
    rail.className = "dmx-carousel-progress";
    const fill = document.createElement("b");
    fill.style.width = `${((currentIndex + 1) / station.variants.length) * 100}%`;
    rail.appendChild(fill);
    carouselFoot.append(swipeHint, rail);
    reference.append(carouselHead, viewport, carouselFoot);

    const real = document.createElement("section");
    real.className = "dmx-real";
    const realTitle = document.createElement("strong");
    realTitle.className = "dmx-real__title";
    realTitle.textContent = record ? "Evidencia lista" : "Evidencia real";
    const realFigure = createDmFigure("Real", station, record?.dataUrl);
    if (!record) {
      realFigure.tabIndex = 0;
      realFigure.setAttribute("role", "button");
      realFigure.setAttribute("aria-label", `Adjuntar evidencia real de ${station.label}`);
      realFigure.addEventListener("click", () => openDmPicker(station.id, "dmxFile"));
      realFigure.addEventListener("keydown", event => {
        if (event.key !== "Enter" && event.key !== " ") return;
        event.preventDefault();
        openDmPicker(station.id, "dmxFile");
      });
    }
    const photoActions = document.createElement("div");
    photoActions.className = "dmx-photo-actions";
    const camera = document.createElement("button");
    camera.type = "button";
    camera.className = "dmx-button";
    camera.textContent = record ? "Retomar foto" : "Tomar foto";
    camera.addEventListener("click", () => openDmPicker(station.id, "dmxCamera"));
    const attach = document.createElement("button");
    attach.type = "button";
    attach.className = "dmx-button dmx-button--secondary";
    attach.textContent = record ? "Cambiar archivo" : "Adjuntar";
    attach.addEventListener("click", () => openDmPicker(station.id, "dmxFile"));
    const remove = document.createElement("button");
    remove.type = "button";
    remove.className = "dmx-remove";
    remove.textContent = "Quitar";
    remove.hidden = !record;
    remove.addEventListener("click", () => {
      evidence.delete(station.id);
      renderDmStations();
    });
    photoActions.append(camera, attach, remove);
    real.append(realTitle, realFigure, photoActions);
    compare.append(reference, real);

    const improvement = document.createElement("label");
    improvement.className = "dmx-improvement";
    const improvementLabel = document.createElement("span");
    improvementLabel.textContent = "Mejora continua";
    const improvementInput = document.createElement("input");
    improvementInput.type = "text";
    improvementInput.maxLength = 120;
    improvementInput.value = state.improvements[station.id] || "";
    improvementInput.placeholder = "Opcional · escribe una acción breve";
    improvementInput.addEventListener("input", () => {
      state.improvements[station.id] = improvementInput.value.trimStart();
      saveDmState();
    });
    improvement.append(improvementLabel, improvementInput);
    card.append(head, compare, improvement);
    bindDmCarousel(viewport, station, card, index);
    return card;
  }

  function renderDmStations() {
    if (!catalog) return;
    renderDmOptions();
    const stations = selectedDmStations();
    byId("dmxGrid").replaceChildren(...stations.map(createDmStationCard));
    preloadDmReferences(stations);
    updateDmProgress();
  }

  function updateDmProgress() {
    if (!catalog) return;
    const stations = selectedDmStations();
    const complete = stations.filter(station => evidence.has(station.id)).length;
    const metadataReady = Boolean(state.store.trim() && state.dm.trim() && state.campaign);
    byId("dmxProgress").textContent = `${complete} de ${stations.length} estaciones`;
    byId("dmxProgressBar").style.width = `${stations.length ? complete / stations.length * 100 : 0}%`;
    const pending = stations.length - complete;
    byId("dmxStatus").textContent = !metadataReady
      ? "Completa Tienda y DM para continuar."
      : pending
        ? `Faltan ${pending} ${pending === 1 ? "estación" : "estaciones"} por validar.`
        : "Validación completa · infografía lista para crear.";
    byId("dmxExport").disabled = exporting || !metadataReady || pending > 0;
  }

  function fileToImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(new Error("No fue posible leer la fotografía."));
      reader.onload = () => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = () => reject(new Error("La fotografía no tiene un formato compatible."));
        image.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  async function optimizeDmEvidence(file) {
    const image = await fileToImage(file);
    const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const context = canvas.getContext("2d", { alpha: false });
    context.fillStyle = "#ffffff";
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.drawImage(image, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.9);
  }

  async function processDmEvidence(file) {
    const stationId = pendingStationId;
    pendingStationId = null;
    byId("dmxCamera").value = "";
    byId("dmxFile").value = "";
    if (!stationId || !file) return;
    if (!file.type.startsWith("image/")) {
      showDmToast("Selecciona un archivo de imagen válido.");
      return;
    }
    if (file.size > MAX_FILE_BYTES) {
      showDmToast("La fotografía supera 18 MB. Selecciona una imagen más ligera.");
      return;
    }
    try {
      byId("dmxBusy").hidden = false;
      const dataUrl = await optimizeDmEvidence(file);
      evidence.set(stationId, { dataUrl, name: file.name });
      renderDmStations();
      showDmToast("Evidencia agregada a la Validación DM.");
    } catch (error) {
      showDmToast(error.message || "No fue posible preparar la evidencia.");
    } finally {
      byId("dmxBusy").hidden = true;
    }
  }

  function loadCanvasImage(source) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.decoding = "async";
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("No fue posible cargar una imagen de la validación."));
      image.src = source;
    });
  }

  function roundRect(context, x, y, width, height, radius) {
    const r = Math.min(radius, width / 2, height / 2);
    context.beginPath();
    context.moveTo(x + r, y);
    context.arcTo(x + width, y, x + width, y + height, r);
    context.arcTo(x + width, y + height, x, y + height, r);
    context.arcTo(x, y + height, x, y, r);
    context.arcTo(x, y, x + width, y, r);
    context.closePath();
  }

  function fitText(context, value, maxWidth) {
    const original = String(value || "—");
    if (context.measureText(original).width <= maxWidth) return original;
    let fitted = original;
    while (fitted.length > 1 && context.measureText(`${fitted}…`).width > maxWidth) fitted = fitted.slice(0, -1);
    return `${fitted.trimEnd()}…`;
  }

  function drawAdjustedImage(context, image, x, y, width, height, preferFill = false) {
    context.fillStyle = "#ffffff";
    context.fillRect(x, y, width, height);
    const sourceRatio = image.naturalWidth / image.naturalHeight;
    const targetRatio = width / height;
    const safeFill = preferFill && Math.abs(sourceRatio - targetRatio) / targetRatio <= 0.22;
    const scale = safeFill
      ? Math.max(width / image.naturalWidth, height / image.naturalHeight)
      : Math.min(width / image.naturalWidth, height / image.naturalHeight);
    const drawWidth = image.naturalWidth * scale;
    const drawHeight = image.naturalHeight * scale;
    context.save();
    context.beginPath();
    context.rect(x, y, width, height);
    context.clip();
    context.drawImage(image, x + (width - drawWidth) / 2, y + (height - drawHeight) / 2, drawWidth, drawHeight);
    context.restore();
  }

  function formatRegion(value) {
    const cleaned = String(value || "#OrgulloCN").trim().replace(/^#+/, "");
    return `#${cleaned || "OrgulloCN"}`;
  }

  function calibratedRowHeight(stationCount) {
    const config = infographicConfig;
    const calculated = Math.round(config.baseRowHeight - (stationCount - 6) * config.rowAdjustmentPerStation);
    return Math.min(config.maxRowHeight, Math.max(config.minRowHeight, calculated));
  }

  function drawMetadata(context, label, value, x, y, width) {
    context.fillStyle = "rgba(255,255,255,.12)";
    roundRect(context, x, y, width, 84, 15);
    context.fill();
    context.fillStyle = "#bfe3d3";
    context.font = "700 16px Inter, Segoe UI, sans-serif";
    context.fillText(label.toUpperCase(), x + 16, y + 24);
    context.fillStyle = "#ffffff";
    context.font = "800 23px Inter, Segoe UI, sans-serif";
    context.fillText(fitText(context, value, width - 32), x + 16, y + 58);
  }

  async function buildDmInfographic() {
    const stations = selectedDmStations();
    const records = await Promise.all(stations.map(async station => {
      const variant = variantFor(station);
      const real = evidence.get(station.id);
      if (!real) throw new Error(`Falta la evidencia de ${station.label}.`);
      return {
        station,
        variant,
        improvement: String(state.improvements[station.id] || "").trim(),
        referenceImage: await loadCanvasImage(variant.image),
        evidenceImage: await loadCanvasImage(real.dataUrl)
      };
    }));
    const config = infographicConfig;
    const width = config.canvasWidth;
    const padding = config.outerPadding;
    const headerHeight = config.headerHeight;
    const columnHeaderHeight = config.columnHeaderHeight;
    const rowHeight = calibratedRowHeight(records.length);
    const improvementHeight = config.improvementHeight || 0;
    const rowHeights = records.map(record => rowHeight + (record.improvement ? improvementHeight : 0));
    const rowGap = config.rowGap;
    const footerHeight = config.footerHeight;
    const height = headerHeight + columnHeaderHeight + padding + rowHeights.reduce((total, value) => total + value, 0) + Math.max(0, records.length - 1) * rowGap + footerHeight;
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const context = canvas.getContext("2d", { alpha: false });
    context.imageSmoothingEnabled = true;
    context.imageSmoothingQuality = "high";
    context.fillStyle = "#f2f6f4";
    context.fillRect(0, 0, width, height);
    context.fillStyle = "#003b2a";
    context.fillRect(0, 0, width, headerHeight);
    context.fillStyle = "#ffffff";
    context.font = "900 46px Inter, Segoe UI, sans-serif";
    context.fillText("VALIDACIÓN DM", padding, 61);
    const campaign = catalog.campaigns.find(item => item.id === state.campaign);
    const metadata = [
      ["Tienda", state.store.trim()],
      ["DM", state.dm.trim()],
      ["Campaña", campaign?.label || "—"],
      ["Fecha", new Intl.DateTimeFormat("es-MX", { dateStyle: "medium" }).format(new Date())]
    ];
    const metaGap = 14;
    const metaWidth = (width - padding * 2 - metaGap * 3) / 4;
    metadata.forEach(([label, value], index) => drawMetadata(context, label, value, padding + index * (metaWidth + metaGap), 94, metaWidth));
    const contentWidth = width - padding * 2;
    const columnGap = config.columnGap;
    const columnWidth = (contentWidth - columnGap) / 2;
    const columnY = headerHeight + 7;
    [["REFERENCIA", "#e3f3eb", "#006241"], ["REAL", "#fff0cf", "#8a5b0b"]].forEach(([label, background, color], column) => {
      const x = padding + column * (columnWidth + columnGap);
      context.fillStyle = background;
      roundRect(context, x, columnY, columnWidth, columnHeaderHeight - 12, 13);
      context.fill();
      context.fillStyle = color;
      context.font = "900 20px Inter, Segoe UI, sans-serif";
      context.textAlign = "center";
      context.fillText(label, x + columnWidth / 2, columnY + 31);
    });
    context.textAlign = "left";
    let y = headerHeight + columnHeaderHeight + padding;
    records.forEach((record, index) => {
      const { station, variant, improvement, referenceImage, evidenceImage } = record;
      const currentRowHeight = rowHeights[index];
      const currentImprovementHeight = improvement ? improvementHeight : 0;
      context.fillStyle = "#ffffff";
      context.strokeStyle = "#bdd2c9";
      context.lineWidth = 2;
      roundRect(context, padding, y, contentWidth, currentRowHeight, 22);
      context.fill();
      context.stroke();
      context.fillStyle = "#006241";
      roundRect(context, padding, y, contentWidth, config.stationHeaderHeight, 22);
      context.fill();
      context.fillRect(padding, y + 36, contentWidth, config.stationHeaderHeight - 36);
      context.fillStyle = "#ffffff";
      context.font = "900 25px Inter, Segoe UI, sans-serif";
      const title = `${String(index + 1).padStart(2, "0")}  ${station.label} | ${variant.code} · ${variantContext(station, variant)}`;
      context.fillText(fitText(context, title, contentWidth - 44), padding + 22, y + 40);
      [[referenceImage, false], [evidenceImage, true]].forEach(([image, preferFill], column) => {
        const x = padding + column * (columnWidth + columnGap);
        const figureY = y + config.stationHeaderHeight + 10;
        const figureHeight = currentRowHeight - config.stationHeaderHeight - currentImprovementHeight - 20;
        context.fillStyle = "#f8faf9";
        context.strokeStyle = "#d5e2dc";
        roundRect(context, x, figureY, columnWidth, figureHeight, 14);
        context.fill();
        context.stroke();
        drawAdjustedImage(context, image, x + 8, figureY + 8, columnWidth - 16, figureHeight - 16, preferFill);
      });
      if (improvement) {
        const improvementY = y + currentRowHeight - improvementHeight + 10;
        context.fillStyle = "#eef7f3";
        roundRect(context, padding + 12, improvementY, contentWidth - 24, improvementHeight - 20, 13);
        context.fill();
        context.fillStyle = "#006241";
        context.font = "900 16px Inter, Segoe UI, sans-serif";
        context.fillText("MEJORA CONTINUA", padding + 30, improvementY + 26);
        context.fillStyle = "#14211d";
        context.font = "700 20px Inter, Segoe UI, sans-serif";
        context.fillText(fitText(context, improvement, contentWidth - 258), padding + 222, improvementY + 27);
      }
      y += currentRowHeight + rowGap;
    });
    const footerY = height - footerHeight;
    context.fillStyle = "#003b2a";
    context.fillRect(0, footerY, width, footerHeight);
    context.fillStyle = "#ffffff";
    context.font = "900 22px Inter, Segoe UI, sans-serif";
    context.textAlign = "right";
    context.fillText(formatRegion(state.region), width / 2 - 30, footerY + 50);
    context.fillStyle = "rgba(255,255,255,.45)";
    context.fillRect(width / 2 - 1, footerY + 20, 2, 44);
    context.fillStyle = "#ffffff";
    context.textAlign = "left";
    context.fillText("JUNTÉMONOS MÁS", width / 2 + 30, footerY + 50);
    context.textAlign = "left";
    const blob = await new Promise((resolve, reject) => canvas.toBlob(
      value => value ? resolve(value) : reject(new Error("No fue posible crear la imagen consolidada.")),
      "image/jpeg",
      config.imageQuality
    ));
    return { blob, campaign: campaign?.label || "Campaña" };
  }

  function downloadDmBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    link.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 2500);
  }

  async function exportDmInfographic() {
    if (exporting) return;
    updateDmProgress();
    if (byId("dmxExport").disabled) {
      showDmToast("Completa los datos y todas las estaciones seleccionadas.");
      return;
    }
    exporting = true;
    byId("dmxBusy").hidden = false;
    updateDmProgress();
    try {
      await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
      const { blob, campaign } = await buildDmInfographic();
      const today = new Date();
      const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
      downloadDmBlob(blob, `Validacion_DM_${cleanFilename(state.store)}_${cleanFilename(campaign)}_${date}.jpg`);
      showDmToast("Infografía DM descargada correctamente.");
    } catch (error) {
      showDmToast(error.message || "No fue posible generar la infografía.");
    } finally {
      exporting = false;
      byId("dmxBusy").hidden = true;
      updateDmProgress();
    }
  }

  async function openDmValidation() {
    if (!dialog) createDialog();
    if (!dialog.open) dialog.showModal();
    if (!catalog || !infographicConfig) {
      byId("dmxBusy").hidden = false;
      try {
        const [catalogResponse, configResponse] = await Promise.all([
          fetch(DATA_URL, { cache: "no-store" }),
          fetch(INFOGRAPHIC_URL, { cache: "no-store" })
        ]);
        if (!catalogResponse.ok || !configResponse.ok) throw new Error("No fue posible cargar la configuración premium.");
        [catalog, infographicConfig] = await Promise.all([catalogResponse.json(), configResponse.json()]);
      } catch (error) {
        byId("dmxBusy").hidden = true;
        showDmToast(error.message || "No fue posible abrir Validación DM.");
        return;
      }
      byId("dmxBusy").hidden = true;
    }
    syncMainDefaults();
    renderDmMetadata();
    renderDmStations();
  }

  function closeDmValidation() {
    if (dialog?.open && !exporting) dialog.close();
  }

  function initDmValidation() {
    byId("dmValidationOpen")?.addEventListener("click", openDmValidation);
    byId("dmValidationOpenMobile")?.addEventListener("click", openDmValidation);
  }

  document.addEventListener("DOMContentLoaded", initDmValidation);
})();
