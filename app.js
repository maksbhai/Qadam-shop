const DEFAULT_SHEET_URL =
  "https://docs.google.com/spreadsheets/d/e/2PACX-1vSZQbxfMT_V4_wHyjn4yOtGPxd4I392sODXGX3KQZFJ2ndSheNkFBrdm6wRdNqWAkYPGtSHMS0Lhp3U/pub?gid=0&single=true&output=csv";

const FALLBACK_IMAGE =
  "https://images.unsplash.com/photo-1542291026-7eec264c27ff?auto=format&fit=crop&w=1200&q=80";

const runtimeConfig = window.__QADAM_CONFIG__ || {};
const SHEET_URL = runtimeConfig.sheetUrl || DEFAULT_SHEET_URL;
const WHATSAPP_AGENTS = (runtimeConfig.whatsappAgents || [
  { label: "Buy via Agent Maks", phone: "923398619007" },
  { label: "Buy via Agent Denvo", phone: "923398968007" },
]).filter((agent) => agent?.phone && agent?.label);

const STATUS = {
  AVAILABLE: "Available",
  RESERVED: "Reserved",
  SOLD: "Sold",
};

const dom = {
  heroFeature: document.getElementById("heroFeature"),
  featuredRail: document.getElementById("featuredRail"),
  searchInput: document.getElementById("searchInput"),
  statusChips: document.getElementById("statusChips"),
  sizeFilter: document.getElementById("sizeFilter"),
  conditionFilter: document.getElementById("conditionFilter"),
  sortBy: document.getElementById("sortBy"),
  availableGrid: document.getElementById("availableGrid"),
  archiveGrid: document.getElementById("archiveGrid"),
  availableCount: document.getElementById("availableCount"),
  archiveCount: document.getElementById("archiveCount"),
  modalBackdrop: document.getElementById("modalBackdrop"),
  productPanel: document.getElementById("productPanel"),
  cardSkeletonTemplate: document.getElementById("cardSkeletonTemplate"),
};

const state = {
  inventory: [],
  statusFilter: "all",
  sizeFilter: "all",
  conditionFilter: "all",
  sortBy: "latest",
  query: "",
};

init();

async function init() {
  renderSkeletons();
  renderStaticControls();
  setupEvents();

  try {
    const csvText = await fetchSheetCsv(SHEET_URL);
    state.inventory = mapRows(parseCSV(csvText));
    hydrateFilterOptions();
    renderAll();
    setupScrollReveal();
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

  return rows
    .slice(1)
    .map((columns, id) => {
      const name = cleanCell(columns[idx.name]) || "Unnamed sneaker";
      const imageUrl = cleanCell(columns[idx.image]) || FALLBACK_IMAGE;
      const size = cleanCell(columns[idx.size]) || "Size not listed";
      const condition = cleanCell(columns[idx.condition]) || "Condition not listed";
      const description = cleanCell(columns[idx.description]);
      const paymentStatus = normalizePaymentStatus(cleanCell(columns[idx.paymentStatus]));
      const publicPrice = normalizePrice(cleanCell(columns[idx.price]));

      return {
        id,
        name,
        imageUrl,
        size,
        condition,
        description,
        publicPrice,
        paymentStatus,
        searchableText: `${name} ${size} ${condition}`.toLowerCase(),
        createdAt: rows.length - id,
      };
    })
    .filter((item) => item.name);
}

function normalizePaymentStatus(rawStatus) {
  const normalized = (rawStatus || "").trim().toLowerCase();
  if (!normalized) return STATUS.AVAILABLE;
  if (normalized === "pending") return STATUS.RESERVED;
  if (normalized === "sold" || normalized === "complete") return STATUS.SOLD;
  return STATUS.AVAILABLE;
}

function normalizePrice(value) {
  const raw = (value || "").trim();
  if (!raw) return "DM for price";
  const digits = raw.replace(/[^\d]/g, "");
  if (!digits) return raw;
  const formatted = Number(digits).toLocaleString("en-PK");
  return `Rs ${formatted}`;
}

function cleanCell(value) {
  return (value || "").replace(/\s+/g, " ").trim();
}

function normalize(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]/g, "");
}

function renderStaticControls() {
  renderStatusChips();
  dom.sortBy.innerHTML = [
    ["latest", "Sort: Latest"],
    ["price-asc", "Price: Low to High"],
    ["price-desc", "Price: High to Low"],
  ]
    .map(([value, label]) => `<option value="${value}">${label}</option>`)
    .join("");
}

function hydrateFilterOptions() {
  const sizes = uniqueValues(state.inventory.map((item) => item.size));
  const conditions = uniqueValues(state.inventory.map((item) => item.condition));

  dom.sizeFilter.innerHTML = buildSelectOptions("All sizes", sizes);
  dom.conditionFilter.innerHTML = buildSelectOptions("All conditions", conditions);
}

function buildSelectOptions(baseLabel, values) {
  return [`<option value="all">${baseLabel}</option>`]
    .concat(values.map((value) => `<option value="${escapeHtml(value)}">${escapeHtml(value)}</option>`))
    .join("");
}

function uniqueValues(values) {
  return [...new Set(values.filter(Boolean))].sort((a, b) => a.localeCompare(b));
}

function setupEvents() {
  dom.searchInput.addEventListener("input", (event) => {
    state.query = event.target.value.trim().toLowerCase();
    renderAll();
  });

  dom.statusChips.addEventListener("click", (event) => {
    const chip = event.target.closest("button[data-filter]");
    if (!chip) return;
    state.statusFilter = chip.dataset.filter;
    renderStatusChips();
    renderAll();
  });

  dom.sizeFilter.addEventListener("change", (event) => {
    state.sizeFilter = event.target.value;
    renderAll();
  });

  dom.conditionFilter.addEventListener("change", (event) => {
    state.conditionFilter = event.target.value;
    renderAll();
  });

  dom.sortBy.addEventListener("change", (event) => {
    state.sortBy = event.target.value;
    renderAll();
  });

  dom.modalBackdrop.addEventListener("click", (event) => {
    if (event.target === dom.modalBackdrop) closePanel();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") closePanel();
  });
}

function renderStatusChips() {
  const chips = [
    ["all", "All"],
    ["available", "Available"],
    ["reserved", "Reserved"],
    ["sold", "Sold"],
  ];

  dom.statusChips.innerHTML = chips
    .map(
      ([key, label]) =>
        `<button class="chip ${state.statusFilter === key ? "active" : ""}" data-filter="${key}" type="button">${label}</button>`,
    )
    .join("");
}

function renderAll() {
  const filtered = applyFilters(state.inventory);
  const available = filtered.filter((item) => item.paymentStatus === STATUS.AVAILABLE);
  const archived = filtered.filter((item) => item.paymentStatus !== STATUS.AVAILABLE);

  renderHeroFeature(available[0]);
  renderFeatured(available.slice(0, 8));
  renderGrid(dom.availableGrid, available, "No available sneakers match your filters.");
  renderGrid(dom.archiveGrid, archived, "No reserved or sold sneakers match your filters.", true);

  dom.availableCount.textContent = `${available.length} live pair${available.length === 1 ? "" : "s"}`;
  dom.archiveCount.textContent = `${archived.length} archived pair${archived.length === 1 ? "" : "s"}`;
}

function applyFilters(items) {
  return sortProducts(
    items.filter((item) => {
      const matchesQuery = !state.query || item.searchableText.includes(state.query);
      const statusKey = item.paymentStatus.toLowerCase();
      const matchesStatus = state.statusFilter === "all" || state.statusFilter === statusKey;
      const matchesSize = state.sizeFilter === "all" || state.sizeFilter === item.size;
      const matchesCondition = state.conditionFilter === "all" || state.conditionFilter === item.condition;
      return matchesQuery && matchesStatus && matchesSize && matchesCondition;
    }),
  );
}

function sortProducts(items) {
  const sorted = [...items];
  if (state.sortBy === "price-asc") {
    sorted.sort((a, b) => getPriceNumber(a.publicPrice) - getPriceNumber(b.publicPrice));
  } else if (state.sortBy === "price-desc") {
    sorted.sort((a, b) => getPriceNumber(b.publicPrice) - getPriceNumber(a.publicPrice));
  } else {
    sorted.sort((a, b) => b.createdAt - a.createdAt);
  }
  return sorted;
}

function getPriceNumber(publicPrice) {
  const digits = String(publicPrice || "").replace(/[^\d]/g, "");
  return digits ? Number(digits) : Number.POSITIVE_INFINITY;
}

function renderHeroFeature(item) {
  if (!item) {
    dom.heroFeature.innerHTML = '<p class="empty-state">Fresh drops landing soon.</p>';
    return;
  }

  dom.heroFeature.innerHTML = `
    <div class="hero-spotlight">
      <div class="hero-halo" aria-hidden="true"></div>
      <div class="hero-halo-ring" aria-hidden="true"></div>
      <div class="hero-fog" aria-hidden="true"></div>
      <div class="hero-particles" aria-hidden="true">
        <span></span><span></span><span></span><span></span><span></span>
      </div>
      <div class="hero-sneaker-wrap">
        <div class="hero-shoe-plate" aria-hidden="true"></div>
        <div class="hero-shoe-shadow" aria-hidden="true"></div>
        <img class="hero-sneaker" src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.name)}" loading="eager" onerror="this.src='${FALLBACK_IMAGE}'" />
        <div class="hero-sneaker-shine" aria-hidden="true"></div>
      </div>
      <article class="hero-feature-card" data-open-id="${item.id}">
        <p class="mini-label">Featured Pair</p>
        <h3>${escapeHtml(item.name)}</h3>
        <p class="hero-feature-meta">${escapeHtml(item.condition)} · ${escapeHtml(item.size)}</p>
        <p class="hero-feature-price">${escapeHtml(item.publicPrice)}</p>
      </article>
    </div>
  `;

  dom.heroFeature.querySelector("[data-open-id]")?.addEventListener("click", () => openPanel(item.id));
}

function renderFeatured(items) {
  if (!items.length) {
    dom.featuredRail.innerHTML = '<p class="empty-state">No featured pairs available right now.</p>';
    return;
  }

  dom.featuredRail.innerHTML = items
    .map(
      (item, index) => `
      <article class="featured-tile" role="listitem" data-open-id="${item.id}" style="animation-delay:${index * 50}ms">
        <img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.name)}" loading="lazy" />
        <div>
          <h3>${escapeHtml(item.name)}</h3>
          <p>${escapeHtml(item.publicPrice)}</p>
          <span>${escapeHtml(item.condition)} · ${escapeHtml(item.size)}</span>
        </div>
      </article>
    `,
    )
    .join("");

  dom.featuredRail.querySelectorAll("[data-open-id]").forEach((node) => {
    node.addEventListener("click", () => openPanel(Number(node.dataset.openId)));
  });
}

function renderGrid(target, items, emptyMessage, archived = false) {
  if (!items.length) {
    target.innerHTML = `<p class="empty-state">${emptyMessage}</p>`;
    return;
  }

  target.innerHTML = items
    .map(
      (item, index) => `
      <article class="card card--${item.paymentStatus.toLowerCase()} ${archived ? "card--archive" : ""}" style="animation-delay:${index * 45}ms">
        <button type="button" data-open-id="${item.id}" aria-label="Open ${escapeHtml(item.name)} details">
          <div class="card-image-wrap">
            <img src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.name)}" loading="lazy" onerror="this.src='${FALLBACK_IMAGE}'" />
            <span class="badge ${item.paymentStatus.toLowerCase()}">${item.paymentStatus}</span>
          </div>
          <div class="card-content">
            <p class="card-title">${escapeHtml(item.name)}</p>
            <p class="card-meta">${escapeHtml(item.size)} · ${escapeHtml(item.condition)}</p>
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

function openPanel(id) {
  const item = state.inventory.find((entry) => entry.id === id);
  if (!item) return;

  dom.modalBackdrop.hidden = false;
  dom.productPanel.innerHTML = renderModalSkeleton();

  requestAnimationFrame(() => {
    const message = encodeURIComponent(
      `Hi, I want this sneaker:\nProduct: ${item.name}\nSize: ${item.size}\nCondition: ${item.condition}\nPrice: ${item.publicPrice}`,
    );

    dom.productPanel.innerHTML = `
      <button type="button" class="close-btn" aria-label="Close details">✕</button>
      <img class="detail-media" src="${escapeHtml(item.imageUrl)}" alt="${escapeHtml(item.name)}" onerror="this.src='${FALLBACK_IMAGE}'" />
      <div class="detail-body">
        <span class="badge ${item.paymentStatus.toLowerCase()}">${item.paymentStatus}</span>
        <h3>${escapeHtml(item.name)}</h3>
        <div class="detail-pills">
          <span class="detail-pill">${escapeHtml(item.size)}</span>
          <span class="detail-pill">${escapeHtml(item.condition)}</span>
          <span class="detail-pill">${escapeHtml(item.publicPrice)}</span>
        </div>
        ${item.description ? `<p class="detail-description">${escapeHtml(item.description)}</p>` : ""}
        <div class="whatsapp-row">
          ${renderWhatsappButtons(message)}
        </div>
      </div>
    `;

    dom.productPanel.querySelector(".close-btn")?.addEventListener("click", closePanel);
  });
}

function renderModalSkeleton() {
  return `
    <div class="modal-skeleton shimmer"></div>
    <div class="detail-body">
      <div class="skeleton-line shimmer"></div>
      <div class="skeleton-line short shimmer"></div>
      <div class="skeleton-line tiny shimmer"></div>
    </div>
  `;
}

function renderWhatsappButtons(message) {
  if (!WHATSAPP_AGENTS.length) return '<p class="empty-state">WhatsApp agents are not configured.</p>';
  return WHATSAPP_AGENTS.map(
    (agent, idx) =>
      `<a class="cta ${idx === 0 ? "primary" : "secondary"}" target="_blank" rel="noopener noreferrer" href="https://wa.me/${agent.phone}?text=${message}">${escapeHtml(agent.label)}</a>`,
  ).join("");
}

function closePanel() {
  dom.modalBackdrop.hidden = true;
}

function renderSkeletons() {
  const skeleton = dom.cardSkeletonTemplate.innerHTML;
  dom.availableGrid.innerHTML = Array.from({ length: 6 }, () => skeleton).join("");
  dom.archiveGrid.innerHTML = Array.from({ length: 4 }, () => skeleton).join("");
  dom.featuredRail.innerHTML = Array.from({ length: 2 }, () => skeleton).join("");
}

function renderError(error) {
  const text = escapeHtml(error.message || "Failed to load inventory");
  dom.availableGrid.innerHTML = `<p class="empty-state">${text}. Please refresh and try again.</p>`;
  dom.archiveGrid.innerHTML = "";
  dom.featuredRail.innerHTML = "";
  dom.heroFeature.innerHTML = `<p class="empty-state">Inventory feed is temporarily unavailable.</p>`;
}

function setupScrollReveal() {
  const observer = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (entry.isIntersecting) entry.target.classList.add("is-visible");
      });
    },
    { threshold: 0.1 },
  );

  document.querySelectorAll(".reveal-on-scroll").forEach((node) => observer.observe(node));
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
