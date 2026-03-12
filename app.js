const DEFAULT_SHEET_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vSZQbxfMT_V4_wHyjn4yOtGPxd4I392sODXGX3KQZFJ2ndSheNkFBrdm6wRdNqWAkYPGtSHMS0Lhp3U/pub?gid=0&single=true&output=csv";

const runtimeConfig = window.__QADAM_CONFIG__ || {};
const SHEET_URL = runtimeConfig.sheetUrl || DEFAULT_SHEET_URL;

const WHATSAPP_AGENTS = (runtimeConfig.whatsappAgents || [
  { label: "Message Agent A", phone: "971501112233" },
  { label: "Message Agent B", phone: "971509998877" },
]).filter((agent) => agent?.phone && agent?.label);

const STATUS_MAP = {
  "": "Available",
  pending: "Reserved",
  complete: "Sold",
};

const dom = {
  featuredRail: document.getElementById("featuredRail"),
  searchInput: document.getElementById("searchInput"),
  chipBar: document.getElementById("chipBar"),
  availableGrid: document.getElementById("availableGrid"),
  archiveGrid: document.getElementById("archiveGrid"),
  availableCount: document.getElementById("availableCount"),
  archiveCount: document.getElementById("archiveCount"),
  modalBackdrop: document.getElementById("modalBackdrop"),
  productPanel: document.getElementById("productPanel"),
  cardSkeletonTemplate: document.getElementById("cardSkeletonTemplate"),
};

let inventory = [];
let activeFilter = "all";

init();

async function init() {
  renderSkeletons();
  renderChips();

  try {
    const csvText = await fetchSheetCsv(SHEET_URL);
    inventory = mapRows(parseCSV(csvText));
    renderAll();
    setupEvents();
  } catch (error) {
    renderError(error);
  }
}

async function fetchSheetCsv(url) {
  const response = await fetch(url, { cache: "no-store" });
  if (!response.ok) throw new Error(`Sheet fetch failed (${response.status})`);
  return response.text();
}

function parseCSV(raw) {
  const rows = [];
  let row = [];
  let value = "";
  let inQuotes = false;

  for (let i = 0; i < raw.length; i += 1) {
    const char = raw[i];
    const next = raw[i + 1];

    if (char === '"') {
      if (inQuotes && next === '"') {
        value += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (char === "," && !inQuotes) {
      row.push(value.trim());
      value = "";
      continue;
    }

    if ((char === "\n" || char === "\r") && !inQuotes) {
      if (char === "\r" && next === "\n") i += 1;
      if (value.length || row.length) {
        row.push(value.trim());
        rows.push(row);
      }
      row = [];
      value = "";
      continue;
    }

    value += char;
  }

  if (value.length || row.length) {
    row.push(value.trim());
    rows.push(row);
  }

  return rows;
}

function mapRows(rows) {
  if (!rows.length) return [];

  const headers = rows[0].map((header) => normalize(header));
  const idx = {
    name: headers.indexOf("productname"),
    image: headers.indexOf("imageurl"),
    size: headers.indexOf("size"),
    condition: headers.indexOf("condition"),
    description: headers.indexOf("description"),
    price: headers.indexOf("publicprice"),
    paymentStatus: headers.indexOf("paymentstatus"),
  };

  return rows.slice(1).map((columns, id) => {
    const paymentRaw = (columns[idx.paymentStatus] || "").toLowerCase();
    const paymentStatus = STATUS_MAP[paymentRaw] || "Available";

    return {
      id,
      name: safe(columns[idx.name], "Unnamed Pair"),
      imageUrl: safe(columns[idx.image], "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1200&q=80"),
      size: safe(columns[idx.size], "N/A"),
      condition: safe(columns[idx.condition], "Not specified"),
      description: safe(columns[idx.description], "No public description available yet."),
      publicPrice: safe(columns[idx.price], "Price on request"),
      paymentStatus,
      searchableText: `${columns[idx.name] || ""} ${columns[idx.condition] || ""} ${columns[idx.size] || ""}`.toLowerCase(),
    };
  });
}

function safe(value, fallback) {
  return (value || "").trim() || fallback;
}

function normalize(value) {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function setupEvents() {
  dom.searchInput.addEventListener("input", renderAll);

  dom.chipBar.addEventListener("click", (event) => {
    const chip = event.target.closest("button[data-filter]");
    if (!chip) return;
    activeFilter = chip.dataset.filter;
    renderChips();
    renderAll();
  });

  dom.modalBackdrop.addEventListener("click", (event) => {
    if (event.target === dom.modalBackdrop) closePanel();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closePanel();
  });
}

function renderAll() {
  const query = dom.searchInput.value.trim().toLowerCase();
  const filtered = inventory.filter((item) => {
    const matchesQuery = !query || item.searchableText.includes(query);
    const matchesFilter = activeFilter === "all" || item.paymentStatus.toLowerCase() === activeFilter;
    return matchesQuery && matchesFilter;
  });

  const available = filtered.filter((item) => item.paymentStatus === "Available");
  const archived = filtered.filter((item) => item.paymentStatus !== "Available");

  renderFeatured(inventory.filter((item) => item.paymentStatus === "Available").slice(0, 6));
  renderGrid(dom.availableGrid, available, "No available pairs match your current search/filter.");
  renderGrid(dom.archiveGrid, archived, "No reserved or sold pairs match your current search/filter.");

  dom.availableCount.textContent = `${available.length} live item${available.length === 1 ? "" : "s"}`;
  dom.archiveCount.textContent = `${archived.length} archived item${archived.length === 1 ? "" : "s"}`;
}

function renderFeatured(items) {
  if (!items.length) {
    dom.featuredRail.innerHTML = '<p class="empty-state">No featured pairs available currently.</p>';
    return;
  }

  dom.featuredRail.innerHTML = items
    .map(
      (item) => `
      <article class="featured-tile" role="listitem">
        <img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.name)}" loading="lazy" />
        <div>
          <h3>${escapeHtml(item.name)}</h3>
          <p>${escapeHtml(item.publicPrice)} · EU ${escapeHtml(item.size)}</p>
        </div>
      </article>
    `,
    )
    .join("");
}

function renderGrid(target, items, emptyMessage) {
  if (!items.length) {
    target.innerHTML = `<p class="empty-state">${emptyMessage}</p>`;
    return;
  }

  target.innerHTML = items
    .map(
      (item, index) => `
      <article class="card" style="animation-delay:${index * 35}ms">
        <button type="button" data-open-id="${item.id}" aria-label="Open ${escapeHtml(item.name)} details">
          <div class="card-image-wrap">
            <img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.name)}" loading="lazy" onerror="this.src='https://images.unsplash.com/photo-1514996937319-344454492b37?auto=format&fit=crop&w=1200&q=80'" />
            <span class="badge ${item.paymentStatus.toLowerCase()}">${item.paymentStatus}</span>
          </div>
          <div class="card-content">
            <p class="card-title">${escapeHtml(item.name)}</p>
            <p class="card-meta">Size ${escapeHtml(item.size)} · ${escapeHtml(item.condition)}</p>
            <p class="card-price">${escapeHtml(item.publicPrice)}</p>
          </div>
        </button>
      </article>
    `,
    )
    .join("");

  target.querySelectorAll("button[data-open-id]").forEach((button) => {
    button.addEventListener("click", () => openPanel(Number(button.dataset.openId)));
  });
}

function renderChips() {
  const chips = [
    { key: "all", label: "All" },
    { key: "available", label: "Available" },
    { key: "reserved", label: "Reserved" },
    { key: "sold", label: "Sold" },
  ];

  dom.chipBar.innerHTML = chips
    .map(
      ({ key, label }) =>
        `<button type="button" class="chip ${activeFilter === key ? "active" : ""}" data-filter="${key}">${label}</button>`,
    )
    .join("");
}

function openPanel(id) {
  const item = inventory.find((entry) => entry.id === id);
  if (!item) return;

  const message = encodeURIComponent(
    `Hi, I'm interested in this pair:\n${item.name}\nSize: ${item.size}\nCondition: ${item.condition}\nPrice: ${item.publicPrice}`,
  );

  dom.productPanel.innerHTML = `
    <button type="button" class="close-btn" aria-label="Close details">✕</button>
    <img class="detail-media" src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.name)}" onerror="this.src='https://images.unsplash.com/photo-1514996937319-344454492b37?auto=format&fit=crop&w=1200&q=80'" />
    <div class="detail-body">
      <h3>${escapeHtml(item.name)}</h3>
      <div class="detail-pills">
        <span class="detail-pill">Status: ${item.paymentStatus}</span>
        <span class="detail-pill">Size: ${escapeHtml(item.size)}</span>
        <span class="detail-pill">Condition: ${escapeHtml(item.condition)}</span>
      </div>
      <p class="card-price">${escapeHtml(item.publicPrice)}</p>
      <p class="detail-description">${escapeHtml(item.description)}</p>
      <div class="whatsapp-row">
        ${renderWhatsappButtons(message)}
      </div>
    </div>
  `;

  dom.modalBackdrop.hidden = false;
  dom.productPanel.querySelector(".close-btn")?.addEventListener("click", closePanel);
}

function closePanel() {
  dom.modalBackdrop.hidden = true;
}

function renderSkeletons() {
  const skeleton = dom.cardSkeletonTemplate.innerHTML;
  dom.availableGrid.innerHTML = Array.from({ length: 8 }, () => skeleton).join("");
  dom.archiveGrid.innerHTML = Array.from({ length: 4 }, () => skeleton).join("");
}

function renderError(error) {
  const text = escapeHtml(error.message || "Failed to load inventory.");
  dom.availableGrid.innerHTML = `<p class="empty-state">${text}. Please try again later.</p>`;
  dom.archiveGrid.innerHTML = "";
  dom.featuredRail.innerHTML = "";
}

function renderWhatsappButtons(message) {
  if (!WHATSAPP_AGENTS.length) {
    return `<p class="empty-state">WhatsApp agents are not configured yet.</p>`;
  }

  return WHATSAPP_AGENTS.map(
    (agent, idx) =>
      `<a class="cta ${idx === 0 ? "primary" : "secondary"}" target="_blank" rel="noopener noreferrer" href="https://wa.me/${agent.phone}?text=${message}">${escapeHtml(agent.label)}</a>`,
  ).join("");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
