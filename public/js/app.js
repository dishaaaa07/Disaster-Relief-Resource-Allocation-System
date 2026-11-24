// ==========================================================================
// DRRACS - Enterprise Emergency Operations Controller (public/js/app.js)
// Incorporating Nexora, Fastship, and National Telemetry Dashboard Patterns
// ==========================================================================

const API = {
  health: '/api/health',
  metrics: '/api/audit-logs/metrics',
  activityLogs: '/api/audit-logs',
  disasters: '/api/disasters',
  disastersTrack: '/api/disasters/track',
  locations: '/api/locations',
  shelters: '/api/shelters',
  supplies: '/api/supplies',
  stock: '/api/stock',
  requests: '/api/requests',
  allocations: '/api/allocations',
  shipments: '/api/shipments',
  auth: '/api/auth'
};

// Global State
let currentTheme = localStorage.getItem('drracs_theme') || 'light';
let activeCharts = {};
let mapInstance = null;
let currentFilter = 'All';

// Global JWT Fetch Interceptor (Attaches Bearer Token automatically)
const _originalFetch = window.fetch;
window.fetch = async function (url, options = {}) {
  const token = localStorage.getItem('drracs_token');
  if (token && typeof url === 'string' && url.startsWith('/api/')) {
    options.headers = options.headers || {};
    if (options.headers instanceof Headers) {
      if (!options.headers.has('Authorization')) {
        options.headers.set('Authorization', `Bearer ${token}`);
      }
    } else {
      if (!options.headers['Authorization']) {
        options.headers['Authorization'] = `Bearer ${token}`;
      }
    }
  }
  return _originalFetch(url, options);
};

// ==========================================================================
// 1. Core Shell Initialization & Utilities
// ==========================================================================
document.addEventListener('DOMContentLoaded', () => {
  document.documentElement.setAttribute('data-theme', currentTheme);
  updateThemeIcon();
  initOfflineEngine();

  // Sidebar Collapse & Expand
  const collapseBtn = document.getElementById('collapse-sidebar-btn');
  const sidebar = document.getElementById('sidebar');
  if (collapseBtn && sidebar) {
    collapseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      sidebar.classList.toggle('collapsed');
    });

    sidebar.addEventListener('click', (e) => {
      if (sidebar.classList.contains('collapsed')) {
        if (e.target.closest('.brand') || e.target.closest('.sidebar-header')) {
          sidebar.classList.remove('collapsed');
        }
      }
    });
  }

  // Theme Toggle
  const themeBtn = document.getElementById('theme-toggle-btn');
  if (themeBtn) {
    themeBtn.addEventListener('click', toggleTheme);
  }

  // Global Search
  const searchInput = document.getElementById('global-search-input');
  if (searchInput) {
    searchInput.addEventListener('input', (e) => {
      filterActiveTable(e.target.value.toLowerCase());
    });
  }

  // Router listener
  window.addEventListener('hashchange', router);

  initAuthSystem().then(() => {
    const portalPath = currentUser ? getRolePath(currentUser.role) : '/login';
    if (window.location.pathname !== portalPath) {
      window.location.replace(portalPath + (currentUser ? getHomeRoute(currentUser.role) : ''));
      return;
    }
    if (currentUser && !window.location.hash) {
      window.location.hash = getHomeRoute(currentUser.role);
      return;
    }
    router();
  });
});

function showToast(message, type = 'info') {
  const container = document.getElementById('toast-container');
  if (!container) return;

  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.innerHTML = `<span style="font-family:'JetBrains Mono'; font-weight:700;">[OPS]</span> <span>${message}</span>`;

  container.appendChild(toast);
  setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => toast.remove(), 250);
  }, 4000);
}

function openModal(title, bodyHtml, confirmText = 'Execute Directive', onConfirm = null) {
  const backdrop = document.getElementById('modal-backdrop');
  const modalTitle = document.getElementById('modal-title');
  const modalBody = document.getElementById('modal-body');
  const confirmBtn = document.getElementById('modal-confirm-btn');

  modalTitle.textContent = title;
  modalBody.innerHTML = bodyHtml;
  confirmBtn.textContent = confirmText;

  const newBtn = confirmBtn.cloneNode(true);
  confirmBtn.parentNode.replaceChild(newBtn, confirmBtn);

  if (onConfirm) {
    newBtn.style.display = 'inline-flex';
    newBtn.addEventListener('click', onConfirm);
  } else {
    newBtn.style.display = 'none';
  }

  backdrop.classList.add('open');
}

function closeModal() {
  const backdrop = document.getElementById('modal-backdrop');
  if (backdrop) backdrop.classList.remove('open');
}

function toggleTheme() {
  currentTheme = currentTheme === 'light' ? 'dark' : 'light';
  document.documentElement.setAttribute('data-theme', currentTheme);
  localStorage.setItem('drracs_theme', currentTheme);
  updateThemeIcon();
}

function updateThemeIcon() {
  const icon = document.getElementById('theme-icon-svg');
  if (!icon) return;
  if (currentTheme === 'dark') {
    icon.innerHTML = `<circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>`;
  } else {
    icon.innerHTML = `<path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>`;
  }
}

function toggleTask(checkbox) {
  const item = checkbox.closest('.task-item');
  if (!item) return;
  if (checkbox.checked) {
    item.classList.add('completed');
    showToast('Directive marked as completed.', 'success');
  } else {
    item.classList.remove('completed');
    showToast('Directive reactivated in pipeline.', 'info');
  }
}

function filterActiveTable(query) {
  const table = document.querySelector('.data-table tbody');
  if (!table) return;

  const rows = table.querySelectorAll('tr');
  rows.forEach(row => {
    const text = row.textContent.toLowerCase();
    row.style.display = text.includes(query) ? '' : 'none';
  });
}

// ==========================================================================
// 2. Hash Router
// ==========================================================================
function router() {
  const portalPath = currentUser ? getRolePath(currentUser.role) : '/login';
  if (window.location.pathname !== portalPath) {
    window.location.replace(portalPath + (currentUser ? getHomeRoute(currentUser.role) : ''));
    return;
  }

  let hash = window.location.hash || (currentUser ? getHomeRoute(currentUser.role) : '#login');
  if (currentUser && hash === '#login') {
    window.location.hash = getHomeRoute(currentUser.role);
    hash = getHomeRoute(currentUser.role);
  } else if (currentUser && !hasPageAccess(currentUser.role, hash)) {
    window.location.hash = getHomeRoute(currentUser.role);
    hash = getHomeRoute(currentUser.role);
  }

  document.body.classList.toggle('auth-gate', !currentUser || hash === '#login');
  updateRoleNavigation();
  const navLinks = document.querySelectorAll('.nav-link');
  const breadcrumb = document.getElementById('breadcrumb-current');

  navLinks.forEach(link => {
    if (link.getAttribute('href') === hash) {
      link.classList.add('active');
      const text = link.querySelector('.nav-text').textContent;
      if (breadcrumb) { breadcrumb.textContent = (hash === '#citizen-report') ? 'Citizen Distress Portal' : (hash === '#login') ? 'Security Access Gateway' : text; }
    } else {
      link.classList.remove('active');
    }
  });

  const viewport = document.getElementById('content-container');
  if (!viewport) return;

  destroyCharts();
  if (mapInstance) {
    mapInstance.remove();
    mapInstance = null;
  }

  switch (hash) {
    case '#dashboard': loadDashboardView(viewport); break;
    case '#citizen-report': loadCitizenReportView(viewport); break;
    case '#login': loadLoginView(viewport); break;
    case '#disasters': loadDisastersView(viewport); break;
    case '#locations': loadLocationsView(viewport); break;
    case '#shelters': loadSheltersView(viewport); break;
    case '#supplies': loadSuppliesView(viewport); break;
    case '#stock': loadStockView(viewport); break;
    case '#requests': loadRequestsView(viewport); break;
    case '#allocations': loadAllocationsView(viewport); break;
    case '#shipments': loadShipmentsView(viewport); break;
    case '#map': loadMapView(viewport); break;
    case '#analytics': loadAnalyticsView(viewport); break;
    case '#settings': loadSettingsView(viewport); break;
    default:
      if (!currentUser) loadLoginView(viewport);
      else window.location.hash = getHomeRoute(currentUser.role);
  }
}

const ROLE_PAGES = {
  Admin: ['#dashboard', '#map', '#disasters', '#locations', '#shelters', '#supplies', '#stock', '#requests', '#allocations', '#shipments', '#analytics', '#settings'],
  Relief_Officer: ['#dashboard', '#map', '#disasters', '#locations', '#shelters', '#supplies', '#stock', '#requests', '#allocations', '#shipments'],
  Shelter_Manager: ['#shelters', '#requests', '#shipments'],
  Citizen: ['#citizen-report']
};

function hasPageAccess(role, hash) {
  return (ROLE_PAGES[role] || []).includes(hash);
}

function getHomeRoute(role = currentUser && currentUser.role) {
  const homeRoutes = {
    Admin: '#dashboard',
    Relief_Officer: '#dashboard',
    Shelter_Manager: '#shelters',
    Citizen: '#citizen-report'
  };
  return homeRoutes[role] || '#login';
}

function getRolePath(role = currentUser && currentUser.role) {
  const rolePaths = {
    Admin: '/commander',
    Relief_Officer: '/officer',
    Shelter_Manager: '/shelter',
    Citizen: '/citizen'
  };
  return rolePaths[role] || '/login';
}

function updateRoleNavigation() {
  const role = currentUser && currentUser.role;
  const dashboardLabel = document.querySelector('.nav-link[href="#dashboard"] .nav-text');
  if (dashboardLabel) {
    dashboardLabel.textContent = role === 'Relief_Officer' ? 'Operations Dashboard' : 'Command Center';
  }

  const firstCategory = document.querySelector('.sidebar-menu .menu-category');
  if (firstCategory) {
    firstCategory.textContent = role === 'Relief_Officer' ? 'Field Operations' : 'Command & Telemetry';
  }

  document.querySelectorAll('.nav-item').forEach(item => {
    const link = item.querySelector('.nav-link');
    item.style.display = role && link && hasPageAccess(role, link.getAttribute('href')) ? '' : 'none';
  });

  const categories = document.querySelectorAll('.sidebar-menu .menu-category');
  categories.forEach(category => {
    let hasVisibleLink = false;
    for (let item = category.nextElementSibling; item && !item.classList.contains('menu-category'); item = item.nextElementSibling) {
      if (item.classList.contains('nav-item') && item.style.display !== 'none') {
        hasVisibleLink = true;
        break;
      }
    }
    category.style.display = hasVisibleLink ? '' : 'none';
  });

  const citizenSosButton = document.getElementById('citizen-sos-btn');
  if (citizenSosButton) {
    citizenSosButton.style.display = role === 'Citizen' ? '' : 'none';
  }
}

function destroyCharts() {
  Object.keys(activeCharts).forEach(key => {
    if (activeCharts[key]) {
      activeCharts[key].destroy();
    }
  });
  activeCharts = {};
}

// ==========================================================================
// 3. Module 1: Dashboard (Inspired by Image 6 & 7)
// ==========================================================================
async function loadDashboardView(container) {
  if (currentUser.role === 'Relief_Officer') {
    await loadOfficerDashboardView(container);
    return;
  }

  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Analytical Operations Dashboard</h1>
        <p class="page-subtitle">Real-time resource allocation telemetry, triage velocity, and camp population census.</p>
      </div>
      <div style="display:flex; gap:10px;">
        <div class="date-pill">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:14px;height:14px;"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"/><line x1="16" y1="2" x2="16" y2="6"/><line x1="8" y1="2" x2="8" y2="6"/><line x1="3" y1="10" x2="21" y2="10"/></svg>
          Live Telemetry • 24h Window
        </div>
        <button class="btn btn-primary" onclick="window.location.hash='#requests'">+ New Aid Request</button>
      </div>
    </div>

    <!-- 4 High-Density Telemetry Metric Cards (Directly matching Image 6) -->
    <div class="metrics-row">
      <!-- Card 1: Active Aid Requests & Demographics + Nexora Sparkline -->
      <div class="metric-card">
        <div class="metric-sparkline">
          <svg viewBox="0 0 100 36" fill="none"><path d="M0 30 Q 25 15, 45 22 T 80 8 T 100 14" stroke="#ef4444" stroke-width="2.5" fill="none"/><path d="M0 30 Q 25 15, 45 22 T 80 8 T 100 14 L 100 36 L 0 36 Z" fill="rgba(239, 68, 68, 0.08)"/></svg>
        </div>
        <div class="metric-card-top">
          <span class="metric-title">Active Aid Requests</span>
          <div class="metric-icon-wrap" style="background:#fef2f2; color:#ef4444;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/></svg>
          </div>
        </div>
        <div class="metric-val" id="kpi-requests-count">-</div>
        <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">Requisitions awaiting resolution</div>
        
        <div class="demographics-grid">
          <div class="demo-box"><span class="label">Adults</span><span class="count" id="demo-adults">340</span></div>
          <div class="demo-box"><span class="label">Children</span><span class="count" id="demo-children">175</span></div>
          <div class="demo-box"><span class="label">Vulnerable</span><span class="count" id="demo-elderly" style="color:var(--status-critical);">75</span></div>
        </div>
      </div>

      <!-- Card 2: Warehouse Reserves & Resource Bars + Nexora Sparkline -->
      <div class="metric-card">
        <div class="metric-sparkline">
          <svg viewBox="0 0 100 36" fill="none"><path d="M0 26 Q 30 10, 50 18 T 85 5 T 100 12" stroke="#0d9488" stroke-width="2.5" fill="none"/><path d="M0 26 Q 30 10, 50 18 T 85 5 T 100 12 L 100 36 L 0 36 Z" fill="rgba(13, 148, 136, 0.08)"/></svg>
        </div>
        <div class="metric-card-top">
          <span class="metric-title">Warehouse Reserves</span>
          <div class="metric-icon-wrap" style="background:#f0fdfa; color:#0d9488;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/></svg>
          </div>
        </div>
        <div class="metric-val" id="kpi-stock-units">-</div>
        <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">Total units stocked across depots</div>
        
        <div class="resource-mini-bars">
          <div class="mini-bar-row">
            <span>Drinking Water (20L)</span>
            <div style="display:flex; align-items:center; gap:8px;">
              <div class="mini-bar-track"><div class="mini-bar-fill" style="width:78%; background:#0284c7;"></div></div>
              <span class="font-mono">78%</span>
            </div>
          </div>
          <div class="mini-bar-row">
            <span>Ration Packets</span>
            <div style="display:flex; align-items:center; gap:8px;">
              <div class="mini-bar-track"><div class="mini-bar-fill" style="width:62%; background:#10b981;"></div></div>
              <span class="font-mono">62%</span>
            </div>
          </div>
          <div class="mini-bar-row">
            <span>Medical & First Aid</span>
            <div style="display:flex; align-items:center; gap:8px;">
              <div class="mini-bar-track"><div class="mini-bar-fill" style="width:45%; background:#f59e0b;"></div></div>
              <span class="font-mono">45%</span>
            </div>
          </div>
        </div>
      </div>

      <!-- Card 3: Evacuation Centers & Utilization Bar + Nexora Sparkline -->
      <div class="metric-card">
        <div class="metric-sparkline">
          <svg viewBox="0 0 100 36" fill="none"><path d="M0 28 Q 20 8, 45 16 T 75 10 T 100 6" stroke="#0284c7" stroke-width="2.5" fill="none"/><path d="M0 28 Q 20 8, 45 16 T 75 10 T 100 6 L 100 36 L 0 36 Z" fill="rgba(2, 132, 199, 0.08)"/></svg>
        </div>
        <div class="metric-card-top">
          <span class="metric-title">Evacuation Centers</span>
          <div class="metric-icon-wrap" style="background:#eff6ff; color:#0284c7;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/></svg>
          </div>
        </div>
        <div class="metric-val" id="kpi-shelters-count">-</div>
        <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;" id="kpi-sheltered-people">590 people currently sheltered</div>
        
        <div style="margin-top:16px;">
          <div style="display:flex; justify-content:space-between; font-size:0.75rem; font-weight:700; margin-bottom:5px;">
            <span>Capacity Utilization</span>
            <span class="font-mono" id="kpi-utilization-text">62%</span>
          </div>
          <div style="height:8px; background:var(--border-subtle); border-radius:4px; overflow:hidden;">
            <div id="kpi-utilization-bar" style="width:62%; height:100%; background:linear-gradient(90deg, #0d9488, #0284c7); border-radius:4px;"></div>
          </div>
        </div>
      </div>

      <!-- Card 4: Convoys in Transit + Nexora Sparkline -->
      <div class="metric-card">
        <div class="metric-sparkline">
          <svg viewBox="0 0 100 36" fill="none"><path d="M0 32 Q 35 24, 60 12 T 85 16 T 100 4" stroke="#10b981" stroke-width="2.5" fill="none"/><path d="M0 32 Q 35 24, 60 12 T 85 16 T 100 4 L 100 36 L 0 36 Z" fill="rgba(16, 185, 129, 0.08)"/></svg>
        </div>
        <div class="metric-card-top">
          <span class="metric-title">Logistics Convoys</span>
          <div class="metric-icon-wrap" style="background:#ecfdf5; color:#10b981;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
          </div>
        </div>
        <div class="metric-val" id="kpi-convoys-count">-</div>
        <div style="font-size:0.75rem; color:var(--text-muted); margin-top:2px;">Dispatched with 6-digit OTP delivery security</div>
        <div style="margin-top:14px; padding-top:12px; border-top:1px solid var(--border-subtle); display:flex; justify-content:space-between; font-size:0.78rem;">
          <span style="color:var(--text-muted);">Fleet Readiness</span>
          <span class="badge-pill badge-success"><span class="dot"></span>ACTIVE TRANSIT</span>
        </div>
      </div>
    </div>

    <!-- Charts Row (Nexora & Disaster Visuals) -->
    <div style="display:grid; grid-template-columns: 2fr 1fr; gap:20px; margin-bottom:24px;">
      <div class="card" style="margin-bottom:0;">
        <div class="card-header">
          <h3 class="card-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="#0284c7" stroke-width="2"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
            Relief Commodity Requisition Trends (Demand vs. Allocated)
          </h3>
          <span class="font-mono" style="font-size:0.7rem; color:var(--text-muted);">TOP 5 COMMODITIES</span>
        </div>
        <div style="padding:20px; height:270px; position:relative;">
          <canvas id="chart-supplies"></canvas>
        </div>
      </div>

      <div class="card" style="margin-bottom:0;">
        <div class="card-header">
          <h3 class="card-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="#0d9488" stroke-width="2"><circle cx="12" cy="12" r="10"/><path d="M12 2a10 10 0 0 1 10 10"/></svg>
            Fulfillment Pipeline Status
          </h3>
        </div>
        <div style="padding:20px; height:270px; position:relative;">
          <canvas id="chart-status"></canvas>
        </div>
      </div>
    </div>

    <!-- Priority Queue (SysAid & Nexora Pattern) -->
    <div class="card">
      <div class="card-header">
        <h3 class="card-title">
          <svg viewBox="0 0 24 24" fill="none" stroke="#ef4444" stroke-width="2"><polygon points="7.86 2 16.14 2 22 7.86 22 16.14 16.14 22 7.86 22 2 16.14 2 7.86 7.86 2"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
          Priority Triage Action Queue
        </h3>
        <a href="#requests" style="font-size:0.75rem; color:var(--brand-cyan); text-decoration:none; font-weight:700;">FULL PIPELINE →</a>
      </div>
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>Triage</th>
              <th>Shelter Facility</th>
              <th>Incident Sector</th>
              <th>Allocated / Needed</th>
              <th>State</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody id="urgent-queue-tbody">
            <tr><td colspan="6" style="text-align:center; padding:18px;">Retrieving triage manifests...</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <!-- Dual Operational Stream & Directives Checklist (Nexora Image 7) -->
    <div style="display:grid; grid-template-columns: 1fr 1fr; gap:20px;">
      <!-- Column 1: Operational Audit Stream -->
      <div class="card" style="margin-bottom:0;">
        <div class="card-header">
          <h3 class="card-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 14 14"/></svg>
            Operational Audit Stream
          </h3>
          <span class="pulse-dot"></span>
        </div>
        <div id="activity-feed-list" style="padding:16px 20px; max-height:360px; overflow-y:auto; display:flex; flex-direction:column; gap:12px;">
          <span style="color:var(--text-muted); font-size:0.8rem;">Connecting to immutable ledger...</span>
        </div>
      </div>

      <!-- Column 2: Tactical Directives & Operational Missions (Nexora Image 7) -->
      <div class="card" style="margin-bottom:0;">
        <div class="card-header tasks-card-header">
          <h3 class="card-title">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M9 11l3 3L22 4"/><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11"/></svg>
            Command Directives & Missions
          </h3>
          <span class="badge-pill badge-info font-mono" style="font-size:0.7rem;">3 ACTIVE</span>
        </div>
        <div style="padding:16px 20px;">
          <div class="task-item completed">
            <input type="checkbox" class="task-checkbox" checked onchange="toggleTask(this)">
            <div class="task-info">
              <div class="task-title">Gwalior Flood: Embankment Water Rations</div>
              <div class="task-meta">
                <span class="badge-pill badge-success" style="font-size:0.65rem; padding:2px 6px;">COMPLETED</span>
                <span>Relief Lead: Cmdr. Sharma</span>
              </div>
            </div>
            <div class="task-progress-wrap">
              <div class="task-progress-bar"><div class="task-progress-fill" style="width:100%; background:var(--status-success);"></div></div>
              <span class="font-mono" style="font-size:0.68rem; color:var(--text-muted);">100%</span>
            </div>
          </div>

          <div class="task-item">
            <input type="checkbox" class="task-checkbox" onchange="toggleTask(this)">
            <div class="task-info">
              <div class="task-title">Indore Fire Hub: Deploy Class-B Foam & Trauma</div>
              <div class="task-meta">
                <span class="badge-pill badge-critical" style="font-size:0.65rem; padding:2px 6px;">URGENT</span>
                <span>Logistics Base Indore</span>
              </div>
            </div>
            <div class="task-progress-wrap">
              <div class="task-progress-bar"><div class="task-progress-fill" style="width:40%; background:var(--status-critical);"></div></div>
              <span class="font-mono" style="font-size:0.68rem; color:var(--text-muted);">40%</span>
            </div>
          </div>

          <div class="task-item">
            <input type="checkbox" class="task-checkbox" onchange="toggleTask(this)">
            <div class="task-info">
              <div class="task-title">Sehore Seismic: City Model School Shelter Tents</div>
              <div class="task-meta">
                <span class="badge-pill badge-warning" style="font-size:0.65rem; padding:2px 6px;">HIGH</span>
                <span>Depot Bhopal</span>
              </div>
            </div>
            <div class="task-progress-wrap">
              <div class="task-progress-bar"><div class="task-progress-fill" style="width:65%; background:var(--status-warning);"></div></div>
              <span class="font-mono" style="font-size:0.68rem; color:var(--text-muted);">65%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;

  // Fetch Live Metrics
  try {
    const res = await fetch(API.metrics);
    const data = await res.json();
    if (data.success) {
      const m = data.metrics;
      document.getElementById('kpi-requests-count').textContent = m.totalRequests;
      document.getElementById('kpi-stock-units').textContent = m.totalAvailableStockUnits.toLocaleString();
      document.getElementById('kpi-shelters-count').textContent = m.totalShelters;
      document.getElementById('kpi-sheltered-people').textContent = `${m.shelterPopulationAssisted.toLocaleString()} people sheltered`;
      document.getElementById('kpi-convoys-count').textContent = m.shipmentsInTransit;

      const util = Math.round((m.shelterPopulationAssisted / m.totalShelterCapacity) * 100);
      document.getElementById('kpi-utilization-text').textContent = `${util}%`;
      document.getElementById('kpi-utilization-bar').style.width = `${util}%`;

      renderSuppliesChart(data.charts.topRequestedSupplies);
      renderStatusChart(data.charts.requestStatusDistribution);
    }
  } catch (e) {}

  // Fetch Queue
  try {
    const res = await fetch(API.requests);
    const data = await res.json();
    const tbody = document.getElementById('urgent-queue-tbody');
    if (data.success && data.data.length > 0) {
      tbody.innerHTML = data.data.slice(0, 5).map(r => `
        <tr>
          <td>
            <span class="badge-pill ${r.Priority_Score >= 80 ? 'badge-critical' : 'badge-warning'}">
              <span class="dot"></span>${r.Priority_Score}
            </span>
          </td>
          <td><strong>${r.Shelter_Name}</strong><div style="font-size:0.72rem; color:var(--text-muted);">${r.City}</div></td>
          <td>${r.Disaster_Name}</td>
          <td class="font-mono"><strong>${r.Total_Units_Allocated}</strong> / ${r.Total_Units_Requested}</td>
          <td>
            <span class="badge-pill ${r.Request_Status === 'Fulfilled' ? 'badge-success' : r.Request_Status === 'Partially Fulfilled' ? 'badge-info' : 'badge-warning'}">
              <span class="dot"></span>${r.Request_Status}
            </span>
          </td>
          <td>
            <button class="btn btn-secondary" style="padding:4px 10px; font-size:0.75rem;" onclick="viewRequestDetails(${r.Request_Id})">Allocate</button>
          </td>
        </tr>
      `).join('');
    }
  } catch (e) {}

  // Fetch Activity Feed
  try {
    const res = await fetch(`${API.activityLogs}?limit=6`);
    const data = await res.json();
    const list = document.getElementById('activity-feed-list');
    if (data.success && data.data.length > 0) {
      list.innerHTML = data.data.map(log => `
        <div style="border-left: 2px solid var(--border-subtle); padding-left: 12px; font-size:0.8rem;">
          <div style="font-weight:600; color:var(--text-title);">${log.Description}</div>
          <div style="color:var(--text-muted); font-size:0.7rem; margin-top:2px; font-family:'JetBrains Mono';">
            ${new Date(log.Created_At).toLocaleTimeString([], { hour:'2-digit', minute:'2-digit' })} • 
            <span style="color:var(--brand-cyan); font-weight:600;">${log.Actor_Name || 'SYSTEM'}</span>
          </div>
        </div>
      `).join('');
    }
  } catch (e) {}
}

async function loadOfficerDashboardView(container) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <span class="role-badge role-officer" style="display:inline-block;font-size:0.68rem;font-weight:700;letter-spacing:0.04em;padding:3px 8px;border-radius:10px;">RELIEF OFFICER WORKSPACE</span>
        <h1 class="page-title" style="margin-top:8px;">Logistics Operations</h1>
        <p class="page-subtitle">Prioritize shelter requests, reconcile depot stock, and coordinate aid shipments.</p>
      </div>
      <button class="btn btn-primary" onclick="window.location.hash='#requests'">Review Aid Requests</button>
    </div>

    <div class="metrics-row">
      <div class="metric-card">
        <div class="metric-card-top"><span class="metric-title">Open Aid Requests</span></div>
        <div class="metric-val" id="officer-open-requests">—</div>
        <div style="font-size:0.75rem;color:var(--text-muted);">Requests needing logistics follow-up</div>
      </div>
      <div class="metric-card">
        <div class="metric-card-top"><span class="metric-title">Low-Stock Items</span></div>
        <div class="metric-val" id="officer-low-stock">—</div>
        <div style="font-size:0.75rem;color:var(--text-muted);">Depots requiring inventory attention</div>
      </div>
      <div class="metric-card">
        <div class="metric-card-top"><span class="metric-title">Shipments In Transit</span></div>
        <div class="metric-val" id="officer-in-transit">—</div>
        <div style="font-size:0.75rem;color:var(--text-muted);">Active relief deliveries</div>
      </div>
      <div class="metric-card">
        <div class="metric-card-top"><span class="metric-title">Available Stock</span></div>
        <div class="metric-val" id="officer-stock-units">—</div>
        <div style="font-size:0.75rem;color:var(--text-muted);">Units across logistics depots</div>
      </div>
    </div>

    <div id="officer-dashboard-error" role="alert" style="display:none;color:var(--status-critical);margin-bottom:16px;"></div>

    <div style="display:grid;grid-template-columns:1.4fr 1fr;gap:20px;">
      <section class="card">
        <div class="card-header">
          <h2 class="card-title">Highest-Priority Shelter Requests</h2>
          <a href="#requests" style="font-size:0.75rem;color:var(--brand-cyan);font-weight:700;">ALL REQUESTS →</a>
        </div>
        <div class="table-responsive">
          <table class="data-table">
            <thead><tr><th>Priority</th><th>Shelter / City</th><th>Need</th><th>Status</th><th></th></tr></thead>
            <tbody id="officer-requests-tbody"><tr><td colspan="5">Loading requests…</td></tr></tbody>
          </table>
        </div>
      </section>

      <section class="card">
        <div class="card-header"><h2 class="card-title">Depot Stock Alerts</h2></div>
        <div id="officer-stock-alerts" style="padding:16px 20px;color:var(--text-muted);">Loading inventory…</div>
      </section>
    </div>

    <section class="card" style="margin-top:20px;">
      <div class="card-header"><h2 class="card-title">Logistics Tools</h2></div>
      <div style="padding:18px;display:flex;flex-wrap:wrap;gap:10px;">
        <a class="btn btn-secondary" href="#stock">Manage Depot Stock</a>
        <a class="btn btn-secondary" href="#allocations">Allocate Relief Items</a>
        <a class="btn btn-secondary" href="#shipments">Coordinate Shipments</a>
        <a class="btn btn-secondary" href="#map">View Operations Map</a>
      </div>
    </section>
  `;

  try {
    const responses = await Promise.all([
      fetch(API.requests),
      fetch(API.stock),
      fetch(API.shipments)
    ]);
    const data = await Promise.all(responses.map(response => response.json()));
    const failedResponse = responses.findIndex((response, index) => !response.ok || !data[index].success);
    if (failedResponse !== -1) {
      throw new Error(data[failedResponse].message || 'A logistics data service is unavailable.');
    }

    const requests = data[0].data;
    const stock = data[1].data;
    const shipments = data[2].data;
    const openRequests = requests.filter(request => !['Fulfilled', 'Rejected'].includes(request.Request_Status));
    const lowStock = stock.filter(item => item.Stock_Status === 'LOW' || item.Stock_Status === 'CRITICAL_LOW');
    const inTransit = shipments.filter(shipment => shipment.Shipment_Status === 'In Transit');
    const totalStock = stock.reduce((total, item) => total + Number(item.Quantity || 0), 0);

    document.getElementById('officer-open-requests').textContent = openRequests.length;
    document.getElementById('officer-low-stock').textContent = lowStock.length;
    document.getElementById('officer-in-transit').textContent = inTransit.length;
    document.getElementById('officer-stock-units').textContent = totalStock.toLocaleString();

    document.getElementById('officer-requests-tbody').innerHTML = openRequests.slice(0, 5).map(request => `
      <tr>
        <td><span class="badge-pill ${request.Priority_Score >= 80 ? 'badge-critical' : 'badge-warning'}">${request.Priority_Score}</span></td>
        <td><strong>${request.Shelter_Name}</strong><div style="font-size:0.72rem;color:var(--text-muted);">${request.City}</div></td>
        <td>${request.Total_Units_Allocated} / ${request.Total_Units_Requested}</td>
        <td>${request.Request_Status}</td>
        <td><button class="btn btn-secondary" style="padding:4px 9px;font-size:0.72rem;" onclick="viewRequestDetails(${request.Request_Id})">Review</button></td>
      </tr>
    `).join('') || '<tr><td colspan="5">No open requests.</td></tr>';

    document.getElementById('officer-stock-alerts').innerHTML = lowStock.slice(0, 5).map(item => `
      <div style="padding:10px 0;border-bottom:1px solid var(--border-subtle);">
        <strong>${item.Supply_Name}</strong>
        <div style="font-size:0.75rem;">${item.City} depot · ${Number(item.Quantity).toLocaleString()} units · ${item.Stock_Status === 'CRITICAL_LOW' ? 'Critical low' : 'Low'}</div>
      </div>
    `).join('') || '<p>No low-stock alerts.</p>';
  } catch (error) {
    const errorElement = document.getElementById('officer-dashboard-error');
    errorElement.textContent = `Unable to load logistics data: ${error.message}`;
    errorElement.style.display = 'block';
    document.getElementById('officer-requests-tbody').innerHTML = '<tr><td colspan="5">Request data is unavailable.</td></tr>';
    document.getElementById('officer-stock-alerts').textContent = 'Inventory data is unavailable.';
  }
}



function renderSuppliesChart(data) {
  const ctx = document.getElementById('chart-supplies');
  if (!ctx || !window.Chart) return;

  activeCharts.supplies = new Chart(ctx, {
    type: 'bar',
    data: {
      labels: data.map(d => d.Supply_Name.length > 16 ? d.Supply_Name.slice(0, 16) + '...' : d.Supply_Name),
      datasets: [
        { label: 'Demand', data: data.map(d => d.Requested_Qty), backgroundColor: '#0284c7', borderRadius: 4 },
        { label: 'Allocated', data: data.map(d => d.Allocated_Qty), backgroundColor: '#0d9488', borderRadius: 4 }
      ]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11, family: 'Plus Jakarta Sans' } } } },
      scales: {
        y: { beginAtZero: true, grid: { color: 'rgba(100,116,139,0.06)' } },
        x: { grid: { display: false } }
      }
    }
  });
}

function renderStatusChart(data) {
  const ctx = document.getElementById('chart-status');
  if (!ctx || !window.Chart) return;

  activeCharts.status = new Chart(ctx, {
    type: 'doughnut',
    data: {
      labels: data.map(d => d.status),
      datasets: [{
        data: data.map(d => d.count),
        backgroundColor: ['#f59e0b', '#0284c7', '#0d9488', '#10b981', '#ef4444'],
        borderWidth: 2,
        borderColor: currentTheme === 'dark' ? '#0f172a' : '#ffffff'
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      plugins: { legend: { position: 'bottom', labels: { boxWidth: 10, font: { size: 11, family: 'Plus Jakarta Sans' } } } },
      cutout: '72%'
    }
  });
}

// ==========================================================================
// 4. Module 2: Disasters Management
// ==========================================================================
async function loadDisastersView(container) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Disaster Incidents Registry</h1>
        <p class="page-subtitle">Sector tracking, emergency declarations, and severity tier assignments.</p>
      </div>
      ${currentUser.role === 'Admin' ? '<button class="btn btn-primary" onclick="openNewDisasterModal()">+ Declare Incident</button>' : ''}
    </div>

    <!-- Filter Pills (Image 8 style) -->
    <div class="filter-pills-bar">
      <div class="filter-pill active" onclick="filterDisastersTable('All', this)">All Incidents <span class="filter-pill-count" id="pill-count-disasters">3</span></div>
      <div class="filter-pill" onclick="filterDisastersTable('Active', this)">Active</div>
      <div class="filter-pill" onclick="filterDisastersTable('Contained', this)">Contained</div>
      <div class="filter-pill" onclick="filterDisastersTable('Critical', this)">Critical Severity</div>
    </div>

    <div class="card">
      <div class="card-header"><h3 class="card-title">Active Crises</h3></div>
      <div class="table-responsive">
        <table class="data-table" id="disasters-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Incident Identifier</th>
              <th>Classification</th>
              <th>Declared Date</th>
              <th>Severity Tier</th>
              <th>State</th>
              <th>Telemetry</th>
            </tr>
          </thead>
          <tbody id="disasters-tbody">
            <tr><td colspan="7" style="text-align:center; padding:18px;">Retrieving incident catalog...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  try {
    const res = await fetch(API.disasters);
    const data = await res.json();
    const tbody = document.getElementById('disasters-tbody');
    if (data.success && data.data.length > 0) {
      document.getElementById('pill-count-disasters').textContent = data.data.length;
      tbody.innerHTML = data.data.map(d => `
        <tr data-status="${d.Status}" data-severity="${d.Severity}">
          <td class="font-mono">#${d.Incident_Id}</td>
          <td><strong>${d.Name}</strong></td>
          <td>${d.Disaster_Type}</td>
          <td class="font-mono">${new Date(d.Start_Date).toISOString().slice(0, 10)}</td>
          <td>
            <span class="badge-pill ${d.Severity === 'Critical' ? 'badge-critical' : d.Severity === 'High' ? 'badge-warning' : 'badge-info'}">
              <span class="dot"></span>${d.Severity}
            </span>
          </td>
          <td>
            <span class="badge-pill ${d.Status === 'Active' ? 'badge-critical' : d.Status === 'Contained' ? 'badge-warning' : 'badge-success'}">
              <span class="dot"></span>${d.Status}
            </span>
          </td>
          <td>
            <button class="btn btn-secondary" style="padding:4px 9px; font-size:0.75rem;" onclick="viewDisasterDetails(${d.Incident_Id})">Inspect</button>
          </td>
        </tr>
      `).join('');
    }
  } catch (e) {}
}



function filterDisastersTable(filter, element) {
  document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
  element.classList.add('active');

  const rows = document.querySelectorAll('#disasters-tbody tr');
  rows.forEach(r => {
    if (filter === 'All') {
      r.style.display = '';
    } else if (filter === 'Critical') {
      r.style.display = r.getAttribute('data-severity') === 'Critical' ? '' : 'none';
    } else {
      r.style.display = r.getAttribute('data-status') === filter ? '' : 'none';
    }
  });
}

function openNewDisasterModal() {
  const formHtml = `
    <div class="form-group">
      <label>Incident Designation *</label>
      <input type="text" id="disaster-name" class="form-control" placeholder="e.g. Chambal River Floods 2026">
    </div>
    <div class="form-group">
      <label>Disaster Category *</label>
      <select id="disaster-type" class="form-control">
        <option value="Flood">Flood</option>
        <option value="Earthquake">Earthquake</option>
        <option value="Cyclone">Cyclone</option>
        <option value="Industrial Fire">Industrial Fire</option>
        <option value="Landslide">Landslide</option>
      </select>
    </div>
    <div class="form-group">
      <label>Declared Date *</label>
      <input type="date" id="disaster-date" class="form-control font-mono" value="${new Date().toISOString().slice(0, 10)}">
    </div>
    <div class="form-group">
      <label>Severity Tier *</label>
      <select id="disaster-severity" class="form-control">
        <option value="Low">Low (Tier 1)</option>
        <option value="Medium" selected>Medium (Tier 2)</option>
        <option value="High">High (Tier 3)</option>
        <option value="Critical">Critical (Tier 4 - Life-Threatening)</option>
      </select>
    </div>
  `;

  openModal('Declare Disaster Incident', formHtml, 'Authorize Declaration', async () => {
    const name = document.getElementById('disaster-name').value;
    const disasterType = document.getElementById('disaster-type').value;
    const startDate = document.getElementById('disaster-date').value;
    const severity = document.getElementById('disaster-severity').value;

    if (!name || !startDate) {
      showToast('Name and start date are mandatory.', 'warning');
      return;
    }

    try {
      const res = await fetch(API.disasters, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, disasterType, startDate, severity })
      });
      const result = await res.json();
      if (result.success) {
        showToast('Incident declared in central operations log.', 'success');
        closeModal();
        router();
      }
    } catch (err) {
      showToast(err.message, 'error');
    }
  });
}

async function viewDisasterDetails(id) {
  try {
    const res = await fetch(`${API.disasters}/${id}`);
    const data = await res.json();
    if (data.success) {
      const d = data.data;
      const html = `
        <div style="font-size:0.85rem; line-height:1.7;">
          <p><strong>Designation:</strong> ${d.Name}</p>
          <p><strong>Classification:</strong> ${d.Disaster_Type} | <strong>Tier:</strong> ${d.Severity} | <strong>State:</strong> ${d.Status}</p>
          <p><strong>Declared Date:</strong> <span class="font-mono">${new Date(d.Start_Date).toISOString().slice(0,10)}</span></p>
          <hr style="border:none; border-top:1px solid var(--border-subtle); margin:12px 0;">
          <h4 style="font-size:0.85rem; margin-bottom:8px; font-family:'JetBrains Mono';">ATTACHED RELIEF MANIFESTS (${d.requests ? d.requests.length : 0})</h4>
          ${d.requests && d.requests.length > 0 ? d.requests.map(r => `
            <div style="background:var(--input-bg); border:1px solid var(--border-subtle); padding:8px 10px; border-radius:6px; margin-bottom:6px; font-size:0.78rem;">
              <strong>${r.Shelter_Name} (${r.City}):</strong> Score ${r.Priority_Score} • Status: ${r.Request_Status}
            </div>
          `).join('') : '<p style="color:var(--text-muted); font-size:0.78rem;">No requests attached to this sector.</p>'}
        </div>
      `;
      openModal(`Incident Telemetry #${d.Incident_Id}`, html, 'Dismiss', closeModal);
    }
  } catch (e) {}
}



// ==========================================================================
// 5. Module 3: Operational Locations
// ==========================================================================
async function loadLocationsView(container) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Operational Sectors & Hubs</h1>
        <p class="page-subtitle">Impact zones, evacuation camps, and centralized logistics depots.</p>
      </div>
      <button class="btn btn-primary" onclick="openNewLocationModal()">+ Register Location</button>
    </div>

    <div class="card">
      <div class="card-header"><h3 class="card-title">Geographic Locations</h3></div>
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Sector Classification</th>
              <th>Address / Facility</th>
              <th>City / State</th>
              <th>Coordinates</th>
              <th>Census Impact</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody id="locations-tbody">
            <tr><td colspan="7" style="text-align:center; padding:18px;">Retrieving location network...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  try {
    const res = await fetch(API.locations);
    const data = await res.json();
    const tbody = document.getElementById('locations-tbody');
    if (data.success && data.data.length > 0) {
      tbody.innerHTML = data.data.map(l => `
        <tr>
          <td class="font-mono">#${l.Location_Id}</td>
          <td>
            <span class="badge-pill ${l.Location_Type === 'Warehouse/Depot' ? 'badge-info' : l.Location_Type === 'Relief Hub' ? 'badge-success' : 'badge-warning'}">
              <span class="dot"></span>${l.Location_Type}
            </span>
          </td>
          <td><strong>${l.Address}</strong></td>
          <td>${l.City}, ${l.State}</td>
          <td class="font-mono">${Number(l.Latitude).toFixed(4)}, ${Number(l.Longitude).toFixed(4)}</td>
          <td class="font-mono">${Number(l.Affected_Population).toLocaleString()}</td>
          <td><span class="badge-pill badge-success"><span class="dot"></span>${l.Verification_Status}</span></td>
        </tr>
      `).join('');
    }
  } catch (e) {}
}



function openNewLocationModal() {
  const formHtml = `
    <div class="form-group">
      <label>Physical Address / Landmark *</label>
      <input type="text" id="loc-address" class="form-control" placeholder="e.g. Sector 4 Industrial Area">
    </div>
    <div class="form-group" style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
      <div>
        <label>City *</label>
        <input type="text" id="loc-city" class="form-control" placeholder="e.g. Gwalior">
      </div>
      <div>
        <label>State *</label>
        <input type="text" id="loc-state" class="form-control" value="Madhya Pradesh">
      </div>
    </div>
    <div class="form-group">
      <label>Classification *</label>
      <select id="loc-type" class="form-control">
        <option value="Affected Area">Affected Area (Impact Zone)</option>
        <option value="Warehouse/Depot">Warehouse / Logistics Depot</option>
        <option value="Relief Hub">Relief Hub</option>
      </select>
    </div>
    <div class="form-group" style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
      <div>
        <label>Latitude *</label>
        <input type="number" step="0.0001" id="loc-lat" class="form-control font-mono" value="26.2183">
      </div>
      <div>
        <label>Longitude *</label>
        <input type="number" step="0.0001" id="loc-lng" class="form-control font-mono" value="78.1828">
      </div>
    </div>
    <div class="form-group">
      <label>Census Affected Population</label>
      <input type="number" id="loc-pop" class="form-control font-mono" value="0">
    </div>
  `;

  openModal('Register Operational Location', formHtml, 'Record Location', async () => {
    const address = document.getElementById('loc-address').value;
    const city = document.getElementById('loc-city').value;
    const state = document.getElementById('loc-state').value;
    const locationType = document.getElementById('loc-type').value;
    const latitude = parseFloat(document.getElementById('loc-lat').value);
    const longitude = parseFloat(document.getElementById('loc-lng').value);
    const affectedPopulation = parseInt(document.getElementById('loc-pop').value) || 0;

    if (!address || !city) {
      showToast('Address and city are required.', 'warning');
      return;
    }

    try {
      const res = await fetch(API.locations, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address, city, state, locationType, latitude, longitude, affectedPopulation, verificationStatus: 'Verified' })
      });
      const data = await res.json();
      if (data.success) {
        showToast('Sector location registered.', 'success');
        closeModal();
        router();
      }
    } catch (e) {}
  });
}

// ==========================================================================
// 6. Module 4: Shelter Management
// ==========================================================================
async function loadSheltersView(container) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Evacuation Shelter Registry</h1>
        <p class="page-subtitle">Shelter capacity thresholds, live headcounts, and crowd occupancy density.</p>
      </div>
      <button class="btn btn-primary" onclick="openNewShelterModal()">+ Register Shelter</button>
    </div>

    <div class="card">
      <div class="card-header"><h3 class="card-title">Active Evacuation Facilities</h3></div>
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Facility Name</th>
              <th>Sector / City</th>
              <th>Headcount / Capacity</th>
              <th>Density Ratio</th>
              <th>Alert Tier</th>
              <th>Directive</th>
            </tr>
          </thead>
          <tbody id="shelters-tbody">
            <tr><td colspan="7" style="text-align:center; padding:18px;">Retrieving shelter telemetry...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  try {
    const res = await fetch(API.shelters);
    const data = await res.json();
    const tbody = document.getElementById('shelters-tbody');
    if (data.success && data.data.length > 0) {
      tbody.innerHTML = data.data.map(s => {
        const rate = parseFloat(s.Occupancy_Rate);
        const barColor = rate >= 80 ? '#ef4444' : rate >= 60 ? '#f59e0b' : '#10b981';
        return `
          <tr>
            <td class="font-mono">#${s.Shelter_Id}</td>
            <td><strong>${s.Shelter_Name}</strong></td>
            <td>${s.City}<div style="font-size:0.75rem; color:var(--text-muted);">${s.Address}</div></td>
            <td class="font-mono"><strong>${s.Current_Occupancy}</strong> / ${s.Capacity}</td>
            <td>
              <div style="width:110px; height:6px; background:var(--border-subtle); border-radius:3px; display:inline-block; vertical-align:middle; margin-right:8px; overflow:hidden;">
                <div style="width:${Math.min(100, rate)}%; height:100%; background-color:${barColor}; border-radius:3px;"></div>
              </div>
              <span class="font-mono" style="font-weight:700;">${rate}%</span>
            </td>
            <td>
              <span class="badge-pill ${rate >= 80 ? 'badge-critical' : rate >= 60 ? 'badge-warning' : 'badge-success'}">
                <span class="dot"></span>${rate >= 80 ? 'CRITICAL DENSITY' : rate >= 60 ? 'MODERATE' : 'OPTIMAL'}
              </span>
            </td>
            <td>
              <button class="btn btn-secondary" style="padding:4px 9px; font-size:0.75rem;" onclick="quickUpdateOccupancy(${s.Shelter_Id}, ${s.Current_Occupancy}, ${s.Capacity})">Census Sync</button>
            </td>
          </tr>
        `;
      }).join('');
    }
  } catch (e) {}
}



function quickUpdateOccupancy(id, current, capacity) {
  const formHtml = `
    <div class="form-group">
      <label>Verified Headcount (Max Capacity: ${capacity})</label>
      <input type="number" id="update-occupancy" class="form-control font-mono" value="${current}" min="0" max="${capacity}">
    </div>
  `;

  openModal(`Synchronize Headcount: Shelter #${id}`, formHtml, 'Commit Census', async () => {
    const count = parseInt(document.getElementById('update-occupancy').value);
    if (isNaN(count) || count < 0 || count > capacity) {
      showToast(`Headcount must be between 0 and ${capacity}.`, 'warning');
      return;
    }

    try {
      const res = await fetch(`${API.shelters}/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ currentOccupancy: count })
      });
      const data = await res.json();
      if (data.success) {
        showToast('Census count synchronized.', 'success');
        closeModal();
        router();
      }
    } catch (e) {}
  });
}

async function openNewShelterModal() {
  let locationOptions = '';
  try {
    const res = await fetch(API.locations);
    const data = await res.json();
    if (data.success) {
      locationOptions = data.data.map(l => `<option value="${l.Location_Id}">${l.City} - ${l.Address}</option>`).join('');
    }
  } catch (e) {}

  const formHtml = `
    <div class="form-group">
      <label>Facility Name *</label>
      <input type="text" id="shelter-name" class="form-control" placeholder="e.g. Model Higher Secondary Shelter">
    </div>
    <div class="form-group">
      <label>Operational Sector *</label>
      <select id="shelter-location" class="form-control">${locationOptions}</select>
    </div>
    <div class="form-group" style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
      <div>
        <label>Total Capacity *</label>
        <input type="number" id="shelter-cap" class="form-control font-mono" value="300" min="10">
      </div>
      <div>
        <label>Initial Headcount</label>
        <input type="number" id="shelter-occ" class="form-control font-mono" value="0" min="0">
      </div>
    </div>
  `;

  openModal('Register Evacuation Facility', formHtml, 'Deploy Facility', async () => {
    const shelterName = document.getElementById('shelter-name').value;
    const locationId = document.getElementById('shelter-location').value;
    const capacity = parseInt(document.getElementById('shelter-cap').value);
    const currentOccupancy = parseInt(document.getElementById('shelter-occ').value) || 0;

    try {
      const res = await fetch(API.shelters, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ shelterName, locationId, capacity, currentOccupancy })
      });
      const data = await res.json();
      if (data.success) {
        showToast('Facility deployed successfully.', 'success');
        closeModal();
        router();
      }
    } catch (e) {}
  });
}

// ==========================================================================
// 7. Module 5: Supply Catalog
// ==========================================================================
async function loadSuppliesView(container) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Relief Supply Catalog</h1>
        <p class="page-subtitle">Standardized emergency commodities, packaging specifications, and storage controls.</p>
      </div>
      <button class="btn btn-primary" onclick="openNewSupplyModal()">+ Register Commodity</button>
    </div>

    <div class="card">
      <div class="card-header"><h3 class="card-title">Standardized Relief Items</h3></div>
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Commodity Description</th>
              <th>Category</th>
              <th>Unit Specification</th>
              <th>Storage Protocol</th>
              <th>Aggregate Reserves</th>
            </tr>
          </thead>
          <tbody id="supplies-tbody">
            <tr><td colspan="6" style="text-align:center; padding:18px;">Loading supply catalog...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  try {
    const res = await fetch(API.supplies);
    const data = await res.json();
    const tbody = document.getElementById('supplies-tbody');
    if (data.success && data.data.length > 0) {
      tbody.innerHTML = data.data.map(s => `
        <tr>
          <td class="font-mono">#${s.Supply_Id}</td>
          <td><strong>${s.Supply_Name}</strong></td>
          <td><span class="badge-pill badge-info"><span class="dot"></span>${s.Category}</span></td>
          <td class="font-mono"><code>${s.Unit}</code></td>
          <td style="color:var(--text-muted);">${s.Storage_Require || 'Standard warehouse'}</td>
          <td class="font-mono"><strong style="color:var(--brand-cyan); font-size:1.05rem;">${Number(s.Total_Stock_Available).toLocaleString()}</strong> ${s.Unit}</td>
        </tr>
      `).join('');
    }
  } catch (e) {}
}



function openNewSupplyModal() {
  const formHtml = `
    <div class="form-group">
      <label>Commodity Designation *</label>
      <input type="text" id="sup-name" class="form-control" placeholder="e.g. Water Purification Tablets">
    </div>
    <div class="form-group" style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
      <div>
        <label>Category *</label>
        <select id="sup-category" class="form-control">
          <option value="Water">Water</option>
          <option value="Food">Food</option>
          <option value="Medical">Medical</option>
          <option value="Clothing">Clothing</option>
          <option value="Shelter">Shelter</option>
          <option value="Hygiene">Hygiene</option>
        </select>
      </div>
      <div>
        <label>Unit of Measure *</label>
        <input type="text" id="sup-unit" class="form-control" placeholder="e.g. kits, strips, boxes">
      </div>
    </div>
    <div class="form-group">
      <label>Storage Protocol</label>
      <input type="text" id="sup-storage" class="form-control" placeholder="e.g. Temperature-controlled dry storage">
    </div>
  `;

  openModal('Add Relief Commodity', formHtml, 'Register Item', async () => {
    const supplyName = document.getElementById('sup-name').value;
    const category = document.getElementById('sup-category').value;
    const unit = document.getElementById('sup-unit').value;
    const storageRequire = document.getElementById('sup-storage').value;

    try {
      const res = await fetch(API.supplies, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ supplyName, category, unit, storageRequire })
      });
      const data = await res.json();
      if (data.success) {
        showToast('Commodity added to registry.', 'success');
        closeModal();
        router();
      }
    } catch (e) {}
  });
}

// ==========================================================================
// 8. Module 6: Stock & Depot Inventories
// ==========================================================================
async function loadStockView(container) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Depot Logistics & Inventory</h1>
        <p class="page-subtitle">Real-time inventory levels, intake receipts, and threshold reconciliation.</p>
      </div>
      <button class="btn btn-primary" onclick="openReceiveStockModal()">+ Inbound Stock Intake</button>
    </div>

    <div class="card">
      <div class="card-header"><h3 class="card-title">Warehouse Inventory Balances</h3></div>
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Logistics Hub</th>
              <th>Commodity</th>
              <th>Category</th>
              <th>Available Units</th>
              <th>Reserve Health</th>
              <th>Last Synchronized</th>
              <th>Reconcile</th>
            </tr>
          </thead>
          <tbody id="stock-tbody">
            <tr><td colspan="8" style="text-align:center; padding:18px;">Loading stock balances...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  try {
    const res = await fetch(API.stock);
    const data = await res.json();
    const tbody = document.getElementById('stock-tbody');
    if (data.success && data.data.length > 0) {
      tbody.innerHTML = data.data.map(st => `
        <tr>
          <td class="font-mono">#${st.Stock_Id}</td>
          <td><strong>${st.City} Logistics Base</strong><div style="font-size:0.75rem; color:var(--text-muted);">${st.Address}</div></td>
          <td><strong>${st.Supply_Name}</strong></td>
          <td><span class="badge-pill badge-info"><span class="dot"></span>${st.Category}</span></td>
          <td class="font-mono"><strong style="font-size:1.05rem;">${st.Quantity.toLocaleString()}</strong> ${st.Unit}</td>
          <td>
            <span class="badge-pill ${st.Stock_Status === 'CRITICAL_LOW' ? 'badge-critical' : st.Stock_Status === 'LOW' ? 'badge-warning' : 'badge-success'}">
              <span class="dot"></span>${st.Stock_Status === 'CRITICAL_LOW' ? 'DEFICIT' : st.Stock_Status === 'LOW' ? 'LOW RESERVE' : 'ADEQUATE'}
            </span>
          </td>
          <td class="font-mono" style="color:var(--text-muted);">${new Date(st.Last_Updated).toLocaleString([], { dateStyle:'short', timeStyle:'short' })}</td>
          <td>
            <button class="btn btn-secondary" style="padding:4px 9px; font-size:0.75rem;" onclick="quickAdjustStock(${st.Stock_Id}, ${st.Quantity}, '${st.Supply_Name}')">Audit</button>
          </td>
        </tr>
      `).join('');
    }
  } catch (e) {}
}



async function openReceiveStockModal() {
  let suppliesOptions = '';
  let locationsOptions = '';

  try {
    const [supRes, locRes] = await Promise.all([fetch(API.supplies), fetch(API.locations)]);
    const supData = await supRes.json();
    const locData = await locRes.json();
    if (supData.success) suppliesOptions = supData.data.map(s => `<option value="${s.Supply_Id}">${s.Supply_Name} (${s.Unit})</option>`).join('');
    if (locData.success) locationsOptions = locData.data.filter(l => l.Location_Type === 'Warehouse/Depot' || l.Location_Type === 'Relief Hub').map(l => `<option value="${l.Location_Id}">${l.City} - ${l.Address}</option>`).join('');
  } catch (e) {}

  const formHtml = `
    <div class="form-group">
      <label>Destination Warehouse Depot *</label>
      <select id="recv-location" class="form-control">${locationsOptions}</select>
    </div>
    <div class="form-group">
      <label>Relief Commodity *</label>
      <select id="recv-supply" class="form-control">${suppliesOptions}</select>
    </div>
    <div class="form-group">
      <label>Received Quantity *</label>
      <input type="number" id="recv-qty" class="form-control font-mono" placeholder="e.g. 500" min="1">
    </div>
  `;

  openModal('Inbound Cargo Receipt (Upsert Protocol)', formHtml, 'Commit Intake', async () => {
    const locationId = document.getElementById('recv-location').value;
    const supplyId = document.getElementById('recv-supply').value;
    const quantity = parseInt(document.getElementById('recv-qty').value);

    try {
      const res = await fetch(API.stock, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ locationId, supplyId, quantity })
      });
      const data = await res.json();
      if (data.success) {
        showToast('Inbound cargo intake verified.', 'success');
        closeModal();
        router();
      }
    } catch (e) {}
  });
}

function quickAdjustStock(stockId, currentQty, name) {
  const formHtml = `
    <p style="font-size:0.85rem; margin-bottom:12px;">Auditing reserve balance for: <strong>${name}</strong></p>
    <div class="form-group">
      <label>Physical Inventory Count</label>
      <input type="number" id="adj-qty" class="form-control font-mono" value="${currentQty}" min="0">
    </div>
    <div class="form-group">
      <label>Discrepancy Justification</label>
      <input type="text" id="adj-reason" class="form-control" placeholder="e.g. Reconciled physical tally count">
    </div>
  `;

  openModal(`Reconcile Stock Record #${stockId}`, formHtml, 'Record Audit Discrepancy', async () => {
    const newQuantity = parseInt(document.getElementById('adj-qty').value);
    const reason = document.getElementById('adj-reason').value;

    try {
      const res = await fetch(`${API.stock}/${stockId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newQuantity, reason })
      });
      const data = await res.json();
      if (data.success) {
        showToast('Inventory reconciled and written to audit log.', 'success');
        closeModal();
        router();
      }
    } catch (e) {}
  });
}

// ==========================================================================
// 9. Module 7: Request Management (Triage Pipeline with SysAid-Style Tabs)
// ==========================================================================
async function loadRequestsView(container) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Aid Request Triage Manifests</h1>
        <p class="page-subtitle">Algorithmic priority triage of emergency requisitions submitted by field camps.</p>
      </div>
      <button class="btn btn-primary" onclick="openNewRequestModal()">+ Generate Requisition</button>
    </div>

    <!-- Filter Pills (Image 8 style) -->
    <div class="filter-pills-bar">
      <div class="filter-pill active" onclick="filterRequestsTable('All', this)">All Requests <span class="filter-pill-count" id="pill-count-all">4</span></div>
      <div class="filter-pill" onclick="filterRequestsTable('Urgent', this)">Urgent Priority</div>
      <div class="filter-pill" onclick="filterRequestsTable('Pending', this)">Pending Fulfillment</div>
      <div class="filter-pill" onclick="filterRequestsTable('Partially Fulfilled', this)">Partially Fulfilled</div>
      <div class="filter-pill" onclick="filterRequestsTable('Fulfilled', this)">Fulfilled</div>
    </div>

    <div class="card">
      <div class="card-header"><h3 class="card-title">Priority Triage Queue</h3></div>
      <div class="table-responsive">
        <table class="data-table" id="requests-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Triage Score</th>
              <th>Facility</th>
              <th>Incident Sector</th>
              <th>Manifest Items</th>
              <th>Fulfillment Progress</th>
              <th>Pipeline State</th>
              <th>Action</th>
            </tr>
          </thead>
          <tbody id="requests-tbody">
            <tr><td colspan="8" style="text-align:center; padding:18px;">Retrieving triage manifests...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  try {
    const res = await fetch(API.requests);
    const data = await res.json();
    const tbody = document.getElementById('requests-tbody');
    if (data.success && data.data.length > 0) {
      document.getElementById('pill-count-all').textContent = data.data.length;
      tbody.innerHTML = data.data.map(r => `
        <tr data-status="${r.Request_Status}" data-priority="${r.Priority}">
          <td class="font-mono">#${r.Request_Id}</td>
          <td>
            <span class="badge-pill ${r.Priority_Score >= 80 ? 'badge-critical' : r.Priority_Score >= 60 ? 'badge-warning' : 'badge-info'} font-mono">
              <span class="dot"></span>${r.Priority_Score}
            </span>
          </td>
          <td><strong>${r.Shelter_Name}</strong><div style="font-size:0.72rem; color:var(--text-muted);">${r.City}</div></td>
          <td>${r.Disaster_Name}</td>
          <td>${r.Total_Items_Count} commodities</td>
          <td>
            <div class="font-mono"><strong>${r.Total_Units_Allocated}</strong> / ${r.Total_Units_Requested}</div>
            <div style="width:100px; height:5px; background:var(--border-subtle); border-radius:3px; margin-top:4px; overflow:hidden;">
              <div style="width:${Math.round((r.Total_Units_Allocated/r.Total_Units_Requested)*100)}%; height:100%; background:var(--brand-cyan);"></div>
            </div>
          </td>
          <td>
            <span class="badge-pill ${r.Request_Status === 'Fulfilled' ? 'badge-success' : r.Request_Status === 'Partially Fulfilled' ? 'badge-info' : 'badge-warning'}">
              <span class="dot"></span>${r.Request_Status}
            </span>
          </td>
          <td>
            <button class="btn btn-secondary" style="padding:4px 10px; font-size:0.75rem;" onclick="viewRequestDetails(${r.Request_Id})">Inspect / Allocate</button>
          </td>
        </tr>
      `).join('');
    }
  } catch (e) {}
}



function filterRequestsTable(filter, element) {
  document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
  element.classList.add('active');

  const rows = document.querySelectorAll('#requests-tbody tr');
  rows.forEach(r => {
    if (filter === 'All') {
      r.style.display = '';
    } else if (filter === 'Urgent') {
      r.style.display = r.getAttribute('data-priority') === 'Urgent' ? '' : 'none';
    } else {
      r.style.display = r.getAttribute('data-status') === filter ? '' : 'none';
    }
  });
}

async function viewRequestDetails(requestId) {
  try {
    const res = await fetch(`${API.requests}/${requestId}`);
    const data = await res.json();
    if (!data.success) return;

    const r = data.data;

    let itemsHtml = r.items.map(it => `
      <div style="background:var(--input-bg); border:1px solid var(--border-subtle); border-radius:var(--radius-sm); padding:14px; margin-bottom:10px; display:flex; justify-content:space-between; align-items:center;">
        <div>
          <strong style="font-size:0.95rem; color:var(--text-title);">${it.Supply_Name}</strong> 
          <span class="badge-pill badge-info" style="margin-left:6px;"><span class="dot"></span>${it.Category}</span>
          <div class="font-mono" style="font-size:0.78rem; color:var(--text-muted); margin-top:3px;">
            Target: <strong>${it.Quantity}</strong> ${it.Unit} | Sourced: <strong>${it.Allocated_Quantity}</strong> | Outstanding: <strong style="color:var(--status-critical);">${it.Remaining_Needed}</strong>
          </div>
        </div>
        <div>
          ${it.Remaining_Needed > 0 ? `
            <button class="btn btn-primary" style="padding:6px 14px; font-size:0.78rem;" onclick="openAllocateModal(${it.Reqitem_Id}, ${it.Supply_Id}, '${it.Supply_Name}', ${it.Remaining_Needed})">
              Allocate Now
            </button>
          ` : `<span class="badge-pill badge-success"><span class="dot"></span>100% SOURCED</span>`}
        </div>
      </div>
    `).join('');

    const bodyHtml = `
      <div style="font-size:0.85rem; line-height:1.6; margin-bottom:16px;">
        <p><strong>Target Shelter:</strong> ${r.Shelter_Name} (${r.City})</p>
        <p><strong>Incident Sector:</strong> ${r.Disaster_Name} (Severity: ${r.Disaster_Severity})</p>
        <p><strong>Triage Index:</strong> <span class="font-mono" style="font-weight:700; color:var(--brand-cyan);">${r.Priority_Score}</span> | <strong>Pipeline State:</strong> ${r.Request_Status}</p>
      </div>
      <h4 style="font-size:0.82rem; font-family:'JetBrains Mono'; margin-bottom:12px; color:var(--text-muted);">COMMODITY MANIFEST</h4>
      ${itemsHtml}
    `;

    openModal(`Requisition Telemetry #${requestId}`, bodyHtml, 'Dismiss', closeModal);
  } catch (e) {}
}



async function openNewRequestModal() {
  let incidentOptions = '';
  let shelterOptions = '';
  let supplyOptions = '';

  try {
    const [incRes, sheRes, supRes] = await Promise.all([fetch(API.disasters), fetch(API.shelters), fetch(API.supplies)]);
    const incData = await incRes.json();
    const sheData = await sheRes.json();
    const supData = await supRes.json();

    if (incData.success) {
      localStorage.setItem('drracs_cache_disasters', JSON.stringify(incData.data));
      incidentOptions = incData.data.map(i => `<option value="${i.Incident_Id}">${i.Name} (${i.Severity})</option>`).join('');
    }
    if (sheData.success) {
      localStorage.setItem('drracs_cache_shelters', JSON.stringify(sheData.data));
      shelterOptions = sheData.data.map(s => `<option value="${s.Shelter_Id}">${s.Shelter_Name} (${s.City})</option>`).join('');
    }
    if (supData.success) {
      localStorage.setItem('drracs_cache_supplies', JSON.stringify(supData.data));
      supplyOptions = supData.data.map(s => `<option value="${s.Supply_Id}">${s.Supply_Name} (${s.Unit})</option>`).join('');
    }
  } catch (e) {
    // Offline Cache Fallback for Field Operations (Phase 18)
    const cachedInc = JSON.parse(localStorage.getItem('drracs_cache_disasters') || '[]');
    const cachedShe = JSON.parse(localStorage.getItem('drracs_cache_shelters') || '[]');
    const cachedSup = JSON.parse(localStorage.getItem('drracs_cache_supplies') || '[]');

    incidentOptions = cachedInc.length > 0 
      ? cachedInc.map(i => `<option value="${i.Incident_Id}">${i.Name} (${i.Severity})</option>`).join('')
      : `<option value="1">Gwalior Flood Response (High)</option><option value="3">Indore Hub Fire Incident (Critical)</option>`;

    shelterOptions = cachedShe.length > 0
      ? cachedShe.map(s => `<option value="${s.Shelter_Id}">${s.Shelter_Name} (${s.City})</option>`).join('')
      : `<option value="1">Central Emergency Shelter (Gwalior)</option><option value="2">City Model School Shelter (Sehore)</option>`;

    supplyOptions = cachedSup.length > 0
      ? cachedSup.map(s => `<option value="${s.Supply_Id}">${s.Supply_Name} (${s.Unit})</option>`).join('')
      : `<option value="1">Packaged Drinking Water (20L) (bottles)</option><option value="2">Emergency Food Packets (packets)</option><option value="4">Trauma & First Aid Kits (kits)</option>`;
  }

  const isOffline = !navigator.onLine;

  const formHtml = `
    ${isOffline ? `
      <div style="padding:10px 14px; background:var(--status-warning-bg); border:1px solid var(--status-warning-border); border-radius:var(--radius-sm); font-size:0.78rem; color:#b45309; margin-bottom:14px; display:flex; align-items:center; gap:8px;">
        <span class="status-indicator-dot" style="background:#b45309;"></span>
        <span><strong>FIELD OFFLINE MODE:</strong> Telemetry connection severed. Requisition will be stored in browser storage and auto-transferred upon reconnect.</span>
      </div>
    ` : ''}
    <div class="form-group">
      <label>Crisis Sector *</label>
      <select id="req-incident" class="form-control">${incidentOptions}</select>
    </div>
    <div class="form-group">
      <label>Destination Shelter *</label>
      <select id="req-shelter" class="form-control">${shelterOptions}</select>
    </div>
    <div class="form-group">
      <label>Urgency Index *</label>
      <select id="req-urgency" class="form-control">
        <option value="Low">Low (Replenishment)</option>
        <option value="Medium">Medium (Operational)</option>
        <option value="High">High (Impending Deficit)</option>
        <option value="Urgent" selected>Urgent (Life-Critical)</option>
      </select>
    </div>
    <hr style="border:none; border-top:1px solid var(--border-subtle); margin:14px 0;">
    <h4 style="font-size:0.78rem; font-family:'JetBrains Mono'; margin-bottom:8px; color:var(--text-muted);">REQUESTED COMMODITY</h4>
    <div class="req-item-row" style="display:grid; grid-template-columns: 2fr 1fr; gap:10px;">
      <select class="form-control req-supply-select">${supplyOptions}</select>
      <input type="number" class="form-control req-qty-input font-mono" placeholder="Quantity" min="1" value="100">
    </div>
  `;

  openModal('Generate Aid Requisition (ACID Transaction)', formHtml, isOffline ? 'Queue Requisition Offline' : 'Submit Requisition', async () => {
    const incidentId = parseInt(document.getElementById('req-incident').value);
    const shelterId = parseInt(document.getElementById('req-shelter').value);
    const priority = document.getElementById('req-urgency').value;

    const rows = document.querySelectorAll('.req-item-row');
    const items = [];
    rows.forEach(r => {
      const supplyId = parseInt(r.querySelector('.req-supply-select').value);
      const quantity = parseInt(r.querySelector('.req-qty-input').value);
      if (supplyId && quantity > 0) {
        items.push({ supplyId, quantity, itemType: 'Emergency Commodity' });
      }
    });

    const payload = { incidentId, shelterId, priority, items };

    // Check if offline
    if (!navigator.onLine) {
      enqueueOfflineRequest(payload);
      closeModal();
      return;
    }

    try {
      const res = await fetch(API.requests, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Requisition #${data.requestId} registered. Triage Score: ${data.priorityScore}`, 'success');
        closeModal();
        router();
      } else {
        showToast(data.message || 'Could not register requisition.', 'error');
      }
    } catch (e) {
      // If network dropped mid-submit, seamlessly enqueue offline
      enqueueOfflineRequest(payload);
      closeModal();
    }
  });
}

// ==========================================================================
// 10. Module 8: Resource Allocation (Image 5 Style Tracks)
// ==========================================================================
async function loadAllocationsView(container) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Resource Allocation Management</h1>
        <p class="page-subtitle">Warehouse-to-camp supply commitments, reservation tracking, and dispatch orders.</p>
      </div>
    </div>

    <!-- Top Allocation KPI Cards (Allocation Management - Image 5) -->
    <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap:18px; margin-bottom:20px;">
      <div class="card" style="margin-bottom:0; padding:18px 20px; display:flex; align-items:center; gap:16px;">
        <div style="width:44px; height:44px; border-radius:50%; background:#ecfdf5; color:#10b981; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:20px;height:20px;"><path d="M20 6L9 17l-5-5"/></svg>
        </div>
        <div>
          <div style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; font-family:'JetBrains Mono';">TOTAL ALLOCATIONS</div>
          <div class="font-mono" style="font-size:1.35rem; font-weight:800; color:var(--text-title);">5,200 Units</div>
          <div style="font-size:0.72rem; color:#10b981;">↑ +14.2% Fulfilled vs Demand</div>
        </div>
      </div>

      <div class="card" style="margin-bottom:0; padding:18px 20px; display:flex; align-items:center; gap:16px;">
        <div style="width:44px; height:44px; border-radius:50%; background:#fffbeb; color:#f59e0b; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:20px;height:20px;"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 14 14"/></svg>
        </div>
        <div>
          <div style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; font-family:'JetBrains Mono';">PENDING REQUISITIONS</div>
          <div class="font-mono" style="font-size:1.35rem; font-weight:800; color:var(--text-title);">2 Requisitions</div>
          <div style="font-size:0.72rem; color:#f59e0b;">Urgent Triage Required</div>
        </div>
      </div>

      <div class="card" style="margin-bottom:0; padding:18px 20px; display:flex; align-items:center; gap:16px;">
        <div style="width:44px; height:44px; border-radius:50%; background:#eff6ff; color:#0284c7; display:flex; align-items:center; justify-content:center; flex-shrink:0;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:20px;height:20px;"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
        </div>
        <div>
          <div style="font-size:0.75rem; color:var(--text-muted); text-transform:uppercase; font-family:'JetBrains Mono';">ACTIVE CONVOYS</div>
          <div class="font-mono" style="font-size:1.35rem; font-weight:800; color:var(--text-title);">1 In Transit</div>
          <div style="font-size:0.72rem; color:#0284c7;">OTP Cryptosecurity Active</div>
        </div>
      </div>
    </div>

    <!-- Capacity Milestone Track (Allocation Management - Image 5) -->
    <div class="card" style="margin-bottom:20px;">
      <div class="card-header">
        <h3 class="card-title">Relief Fleet Capacity & Reservation Milestones</h3>
        <span class="badge-pill badge-warning"><span class="dot"></span>▲ 130 Units Shortfall on Medical Trauma</span>
      </div>
      <div style="padding:20px;">
        <div style="display:flex; justify-content:space-between; font-size:0.8rem; margin-bottom:8px;">
          <span><strong>Central Supply Corridor Utilization</strong> (Target: 600 Units / Dispatch Window)</span>
          <span class="font-mono" style="color:var(--brand-cyan); font-weight:700;">470 / 600 Units Sourced (78%)</span>
        </div>

        <div class="milestone-track-outer">
          <div class="milestone-track-fill" style="width: 78%;"></div>
          <div class="milestone-dots">
            <div class="milestone-dot active" title="0 Units"></div>
            <div class="milestone-dot active" title="50 Units"></div>
            <div class="milestone-dot active" title="100 Units"></div>
            <div class="milestone-dot active" title="150 Units"></div>
            <div class="milestone-dot active" title="200 Units"></div>
            <div class="milestone-dot active" title="250 Units"></div>
            <div class="milestone-dot active" title="300 Units"></div>
            <div class="milestone-dot active" title="350 Units"></div>
            <div class="milestone-dot active" title="400 Units"></div>
            <div class="milestone-dot active" title="450 Units"></div>
            <div class="milestone-dot" title="500 Units"></div>
            <div class="milestone-dot" title="550 Units"></div>
            <div class="milestone-dot" title="600 Units"></div>
          </div>
        </div>

        <div class="milestone-labels">
          <span>0</span><span>50</span><span>100</span><span>150</span><span>200</span><span>250</span><span>300</span><span>350</span><span>400</span><span>450</span><span>500</span><span>550</span><span>600</span>
        </div>

        <div style="display:flex; gap:20px; font-size:0.75rem; color:var(--text-muted); margin-top:14px; border-top:1px solid var(--border-subtle); padding-top:12px;">
          <span style="display:flex; align-items:center; gap:6px;"><span class="dot" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#10b981;"></span>Confirmed Reservations (65%)</span>
          <span style="display:flex; align-items:center; gap:6px;"><span class="dot" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#0284c7;"></span>Pending Allocations (13%)</span>
          <span style="display:flex; align-items:center; gap:6px;"><span class="dot" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#f59e0b;"></span>Depot Reserve Threshold</span>
        </div>
      </div>
    </div>

    <!-- Modality Filter Pills (Image 5 style) -->
    <div class="filter-pills-bar">
      <div class="filter-pill active" onclick="filterAllocationsCategory('All', this)">All Commodities <span class="filter-pill-count" id="pill-count-allocs">4</span></div>
      <div class="filter-pill" onclick="filterAllocationsCategory('Water', this)">Water & Hydration</div>
      <div class="filter-pill" onclick="filterAllocationsCategory('Food', this)">Food Packets</div>
      <div class="filter-pill" onclick="filterAllocationsCategory('Medical', this)">Medical & First Aid</div>
      <div class="filter-pill" onclick="filterAllocationsCategory('Clothing', this)">Shelter & Blankets</div>
    </div>

    <div class="card">
      <div class="card-header"><h3 class="card-title">Committed Stock Reservations</h3></div>
      <div class="table-responsive">
        <table class="data-table" id="allocations-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Commodity</th>
              <th>Committed Units</th>
              <th>Source Depot</th>
              <th>Destination Camp</th>
              <th>Authorizer</th>
              <th>Status</th>
              <th>Dispatch Order</th>
            </tr>
          </thead>
          <tbody id="allocations-tbody">
            <tr><td colspan="8" style="text-align:center; padding:18px;">Retrieving allocation records...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  try {
    const res = await fetch(API.allocations);
    const data = await res.json();
    const tbody = document.getElementById('allocations-tbody');
    if (data.success && data.data.length > 0) {
      const pillCount = document.getElementById('pill-count-allocs');
      if (pillCount) pillCount.textContent = data.data.length;
      tbody.innerHTML = data.data.map(a => `
        <tr data-category="${a.Category || 'General'}">
          <td class="font-mono">#${a.Alloc_Id}</td>
          <td><strong>${a.Supply_Name}</strong></td>
          <td class="font-mono"><strong style="color:var(--brand-cyan); font-size:1.05rem;">${a.Allocated_Quantity.toLocaleString()}</strong> ${a.Unit}</td>
          <td>${a.Source_Warehouse_City} Depot</td>
          <td>${a.Shelter_Name}</td>
          <td>${a.Approved_By_Name || 'Cmdr. A. Sharma'}</td>
          <td>
            <span class="badge-pill ${a.Allocation_Status === 'Delivered' ? 'badge-success' : a.Allocation_Status === 'Dispatched' ? 'badge-info' : 'badge-warning'}">
              <span class="dot"></span>${a.Allocation_Status}
            </span>
          </td>
          <td>
            ${a.Allocation_Status === 'Approved' ? `
              <button class="btn btn-primary" style="padding:5px 12px; font-size:0.75rem;" onclick="openDispatchModal(${a.Alloc_Id}, '${a.Supply_Name}', ${a.Allocated_Quantity})">
                Dispatch Transport
              </button>
            ` : `
              <span class="font-mono" style="font-size:0.75rem; color:var(--text-muted);">${a.Vehicle_Number || 'Dispatched'}</span>
            `}
          </td>
        </tr>
      `).join('');
    }
  } catch (e) {}
}



function filterAllocationsCategory(category, element) {
  document.querySelectorAll('.filter-pills-bar .filter-pill').forEach(p => p.classList.remove('active'));
  if (element) element.classList.add('active');

  const rows = document.querySelectorAll('#allocations-tbody tr');
  rows.forEach(r => {
    if (category === 'All') {
      r.style.display = '';
    } else {
      const cat = r.getAttribute('data-category') || '';
      r.style.display = cat.toLowerCase().includes(category.toLowerCase()) ? '' : 'none';
    }
  });
}

async function openAllocateModal(reqitemId, supplyId, supplyName, remainingNeeded) {
  let stockOptions = '';
  try {
    const res = await fetch(`${API.stock}?supplyId=${supplyId}`);
    const data = await res.json();
    if (data.success && data.data.length > 0) {
      stockOptions = data.data.filter(st => st.Quantity > 0).map(st => `
        <option value="${st.Stock_Id}">${st.City} Depot (${st.Quantity} ${st.Unit} available)</option>
      `).join('');
    }
  } catch (e) {}

  if (!stockOptions) {
    showToast(`No warehouses have available stock for "${supplyName}".`, 'warning');
    return;
  }

  const formHtml = `
    <p style="font-size:0.85rem; margin-bottom:12px;">Allocating: <strong>${supplyName}</strong> (Outstanding: <strong>${remainingNeeded}</strong>)</p>
    <div class="form-group">
      <label>Source Logistics Depot *</label>
      <select id="alloc-stock" class="form-control">${stockOptions}</select>
    </div>
    <div class="form-group">
      <label>Committed Quantity</label>
      <input type="number" id="alloc-qty" class="form-control font-mono" value="${remainingNeeded}" min="1" max="${remainingNeeded}">
      <small style="color:var(--text-muted); font-size:0.75rem;">Row-level locking guarantees zero double-allocation.</small>
    </div>
  `;

  openModal(`Commit Reserve: ${supplyName}`, formHtml, 'Commit Allocation', async () => {
    const stockId = parseInt(document.getElementById('alloc-stock').value);
    const quantityToAllocate = parseInt(document.getElementById('alloc-qty').value);

    try {
      const res = await fetch(API.allocations, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reqitemId, stockId, quantityToAllocate })
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, 'success');
        closeModal();
        window.location.hash = '#allocations';
      }
    } catch (e) {}
  });
}

// ==========================================================================
// 11. Module 9: Shipment Details Tracker (Fastship Image 4 Inspired!)
// ==========================================================================
async function loadShipmentsView(container) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Convoy Fleet Tracking & Proof-of-Delivery</h1>
        <p class="page-subtitle">Track relief trucks in transit with cryptographic 6-digit delivery OTP verification.</p>
      </div>
    </div>

    <!-- Active Featured Shipment / Route Vector Tracker (Fastship Style) -->
    <div id="featured-shipment-container">
      <!-- Injected below -->
    </div>

    <div class="card">
      <div class="card-header"><h3 class="card-title">All Logistics Convoys</h3></div>
      <div class="table-responsive">
        <table class="data-table">
          <thead>
            <tr>
              <th>ID</th>
              <th>Vehicle Designation</th>
              <th>Cargo Payload</th>
              <th>Route Vector</th>
              <th>Dispatched</th>
              <th>Delivery OTP</th>
              <th>Status</th>
              <th>Ground Action</th>
            </tr>
          </thead>
          <tbody id="shipments-tbody">
            <tr><td colspan="8" style="text-align:center; padding:18px;">Retrieving fleet status...</td></tr>
          </tbody>
        </table>
      </div>
    </div>
  `;

  try {
    const res = await fetch(API.shipments);
    const data = await res.json();
    const tbody = document.getElementById('shipments-tbody');
    const featured = document.getElementById('featured-shipment-container');

    if (data.success && data.data.length > 0) {
      // Pick first active shipment to feature Fastship-style!
      const top = data.data[0];
      featured.innerHTML = `
        <div class="route-vector-header">
          <div class="route-vector-point">
            <span class="facility">ORIGIN DEPOT</span>
            <span class="city">${top.Origin_Warehouse_City} Base</span>
          </div>

          <div class="route-vector-line">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:20px;height:20px;"><rect x="1" y="3" width="15" height="13"/><polygon points="16 8 20 8 23 11 23 16 16 16 16 8"/><circle cx="5.5" cy="18.5" r="2.5"/><circle cx="18.5" cy="18.5" r="2.5"/></svg>
          </div>

          <div class="route-vector-point" style="text-align:right;">
            <span class="facility">DESTINATION FACILITY</span>
            <span class="city">${top.Shelter_Name}</span>
          </div>

          <div style="margin-left:32px; border-left:1px solid var(--border-subtle); padding-left:24px;">
            <div style="font-size:0.75rem; color:var(--text-muted); font-family:'JetBrains Mono';">TRACKING ID</div>
            <div class="font-mono" style="font-size:1.1rem; font-weight:800; color:var(--text-title);">${top.Vehicle_Number}</div>
            <div style="margin-top:4px;">
              <span class="badge-pill ${top.Shipment_Status === 'Delivered' ? 'badge-success' : 'badge-info'}">
                <span class="dot"></span>${top.Shipment_Status}
              </span>
            </div>
          </div>
        </div>

        <!-- Fastship Split View: Vertical Timeline + Route Summary -->
        <div class="shipment-detail-layout" style="margin-bottom:24px;">
          <!-- Left: Vertical Timeline -->
          <div class="card" style="margin-bottom:0;">
            <div class="card-header"><h3 class="card-title">Shipment Progress & Chain of Custody</h3></div>
            <div style="padding:24px;">
              <div class="fastship-timeline">
                <!-- Step 1 -->
                <div class="timeline-step completed">
                  <div class="timeline-step-icon">✓</div>
                  <div class="timeline-content">
                    <div class="timeline-title">Warehouse Allocation Authorized</div>
                    <div class="timeline-meta">${top.Allocated_Quantity} ${top.Unit} of ${top.Supply_Name} reserved at ${top.Origin_Warehouse_City} Base.</div>
                  </div>
                </div>

                <!-- Step 2 -->
                <div class="timeline-step completed">
                  <div class="timeline-step-icon">✓</div>
                  <div class="timeline-content">
                    <div class="timeline-title">Convoy Dispatched</div>
                    <div class="timeline-meta">Vehicle ${top.Vehicle_Number} • Driver: ${top.Driver_Name} (${top.Driver_Phone}).</div>
                  </div>
                </div>

                <!-- Step 3 -->
                <div class="timeline-step ${top.Shipment_Status === 'Delivered' ? 'completed' : 'active'}">
                  <div class="timeline-step-icon">${top.Shipment_Status === 'Delivered' ? '✓' : '●'}</div>
                  <div class="timeline-content">
                    <div class="timeline-title">${top.Shipment_Status === 'Delivered' ? 'Ground Delivery Handover Verified' : 'In Transit — Awaiting OTP Verification'}</div>
                    <div class="timeline-meta">
                      ${top.Shipment_Status === 'Delivered' 
                        ? `Delivery verified and accepted at ${top.Shelter_Name}.` 
                        : `Camp lead must enter 6-digit OTP (<code style="color:var(--brand-cyan);font-weight:700;">${top.Delivery_OTP}</code>) upon arrival.`}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Right: Route & Telemetry Summary + Fastship Mini Map (Image 4) -->
          <div class="card" style="margin-bottom:0;">
            <div class="card-header"><h3 class="card-title">Live Tracking & Telemetry</h3></div>
            <div style="padding:20px;">
              <!-- Embedded Fastship Leaflet Route Map -->
              <div id="fastship-mini-map"></div>

              <!-- Quick Telemetry Stats -->
              <div class="fastship-quick-stats">
                <div class="fastship-stat-box">
                  <div class="fastship-stat-label">Distance</div>
                  <div class="fastship-stat-val">420 KM</div>
                </div>
                <div class="fastship-stat-box">
                  <div class="fastship-stat-label">Est. Transit</div>
                  <div class="fastship-stat-val">6h 30m</div>
                </div>
              </div>

              <div style="font-size:0.8rem; line-height:1.7; margin-bottom:12px;">
                <p><strong>Cargo Payload:</strong> <span class="font-mono" style="font-weight:700;">${top.Allocated_Quantity} ${top.Unit} ${top.Supply_Name}</span></p>
                <p><strong>Vector:</strong> ${top.Origin_Warehouse_City} Base $\rightarrow$ ${top.Destination_City}</p>
                <p><strong>Destination:</strong> ${top.Shelter_Name}</p>
                <p><strong>Driver In Command:</strong> ${top.Driver_Name} (<a href="tel:${top.Driver_Phone}" style="color:var(--brand-cyan);">${top.Driver_Phone}</a>)</p>
              </div>
              
              ${top.Shipment_Status !== 'Delivered' ? `
                <div style="padding:14px; background:var(--input-bg); border:1px solid var(--border-subtle); border-radius:var(--radius-sm); text-align:center;">
                  <span style="font-size:0.75rem; color:var(--text-muted); display:block; margin-bottom:4px; font-family:'JetBrains Mono';">DELIVERY VERIFICATION OTP</span>
                  <div class="font-mono" style="font-size:1.5rem; font-weight:800; letter-spacing:5px; color:var(--brand-cyan);">${top.Delivery_OTP}</div>
                  <button class="btn btn-primary" style="margin-top:10px; width:100%; justify-content:center;" onclick="openVerifyOTPModal(${top.Ship_Id}, '${top.Delivery_OTP}', ${top.Allocated_Quantity})">
                    Authenticate Handover (Enter OTP)
                  </button>
                </div>
              ` : `
                <div style="padding:12px; background:var(--status-success-bg); border:1px solid var(--status-success-border); border-radius:var(--radius-sm); text-align:center; color:var(--status-success); font-weight:700;">
                  ✓ Cryptographically Verified & Delivered
                </div>
              `}
            </div>
          </div>
        </div>
      `;

      // Initialize Leaflet Mini Route Map for Fastship Experience (Image 4)
      if (window.L && document.getElementById('fastship-mini-map')) {
        try {
          const miniMap = L.map('fastship-mini-map', {
            zoomControl: false,
            attributionControl: false
          }).setView([24.7, 77.8], 6);

          L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 12 }).addTo(miniMap);

          // Route coordinates: Bhopal Depot to Gwalior Shelter
          const routePoints = [
            [23.2599, 77.4126], // Bhopal
            [24.6500, 77.3200], // Guna Waypoint
            [25.4300, 77.6500], // Shivpuri Waypoint
            [26.2234, 78.2270]  // Gwalior
          ];

          // Polyline
          L.polyline(routePoints, {
            color: '#0284c7',
            weight: 3.5,
            dashArray: '6, 6',
            opacity: 0.85
          }).addTo(miniMap);

          // Origin marker
          L.circleMarker([23.2599, 77.4126], {
            radius: 5,
            fillColor: '#0284c7',
            color: '#fff',
            weight: 2,
            fillOpacity: 1
          }).addTo(miniMap).bindPopup('Origin Depot');

          // Destination marker
          L.circleMarker([26.2234, 78.2270], {
            radius: 6,
            fillColor: '#f59e0b',
            color: '#fff',
            weight: 2,
            fillOpacity: 1
          }).addTo(miniMap).bindPopup('Destination Shelter');

          // Active vehicle position marker
          L.circleMarker([24.6500, 77.3200], {
            radius: 6,
            fillColor: '#10b981',
            color: '#fff',
            weight: 2,
            fillOpacity: 1
          }).addTo(miniMap).bindPopup('Current Convoy Position: KM 142');
        } catch (err) {}
      }

      tbody.innerHTML = data.data.map(sh => `
        <tr>
          <td class="font-mono">#${sh.Ship_Id}</td>
          <td>
            <strong>${sh.Vehicle_Number}</strong>
            <div style="font-size:0.72rem; color:var(--text-muted);">${sh.Driver_Name} (${sh.Driver_Phone})</div>
          </td>
          <td class="font-mono"><strong>${sh.Allocated_Quantity}</strong> ${sh.Unit} ${sh.Supply_Name}</td>
          <td>${sh.Origin_Warehouse_City} Base $\rightarrow$ <strong>${sh.Shelter_Name}</strong></td>
          <td class="font-mono">${sh.Dispatched_Date ? new Date(sh.Dispatched_Date).toISOString().slice(0,10) : 'Preparing'}</td>
          <td>
            <code class="font-mono" style="background:var(--input-bg); padding:3px 8px; border-radius:4px; border:1px solid var(--border-subtle); font-weight:700; color:var(--brand-cyan);">
              ${sh.Delivery_OTP}
            </code>
          </td>
          <td>
            <span class="badge-pill ${sh.Shipment_Status === 'Delivered' ? 'badge-success' : 'badge-info'}">
              <span class="dot"></span>${sh.Shipment_Status}
            </span>
          </td>
          <td>
            ${sh.Shipment_Status !== 'Delivered' ? `
              <button class="btn btn-primary" style="padding:4px 10px; font-size:0.75rem;" onclick="openVerifyOTPModal(${sh.Ship_Id}, '${sh.Delivery_OTP}', ${sh.Allocated_Quantity})">
                Verify OTP
              </button>
            ` : `
              <span class="badge-pill badge-success"><span class="dot"></span>DELIVERED</span>
            `}
          </td>
        </tr>
      `).join('');
    }
  } catch (e) {}
}



function openDispatchModal(allocId, supplyName, qty) {
  const formHtml = `
    <p style="font-size:0.85rem; margin-bottom:12px;">Authorizing convoy transport for Allocation #${allocId}: <strong>${qty} units of ${supplyName}</strong></p>
    <div class="form-group">
      <label>Vehicle License Designation *</label>
      <input type="text" id="disp-veh" class="form-control font-mono" placeholder="e.g. MP-07-GA-9988">
    </div>
    <div class="form-group" style="display:grid; grid-template-columns:1fr 1fr; gap:12px;">
      <div>
        <label>Driver In Command *</label>
        <input type="text" id="disp-driver" class="form-control" placeholder="e.g. Surendra Sharma">
      </div>
      <div>
        <label>Driver Phone Number</label>
        <input type="text" id="disp-phone" class="form-control font-mono" placeholder="e.g. 9811223344">
      </div>
    </div>
  `;

  openModal('Dispatch Logistics Convoy', formHtml, 'Dispatch & Generate OTP', async () => {
    const vehicleNumber = document.getElementById('disp-veh').value;
    const driverName = document.getElementById('disp-driver').value;
    const driverPhone = document.getElementById('disp-phone').value;

    if (!vehicleNumber || !driverName) {
      showToast('Vehicle and driver are mandatory.', 'warning');
      return;
    }

    try {
      const res = await fetch(API.shipments, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ allocId, vehicleNumber, driverName, driverPhone })
      });
      const data = await res.json();
      if (data.success) {
        showToast(`Convoy dispatched. Secret Delivery OTP: ${data.deliveryOTP}`, 'success');
        closeModal();
        window.location.hash = '#shipments';
      }
    } catch (e) {}
  });
}

function openVerifyOTPModal(shipId, expectedOtp, expectedQty) {
  const formHtml = `
    <div style="background:var(--input-bg); border:1px solid var(--border-subtle); border-radius:var(--radius-sm); padding:12px; margin-bottom:14px; font-size:0.82rem;">
      Enter the 6-digit Delivery OTP issued to the receiving camp director.
      <br><span style="color:var(--text-muted);">(Telemetry Note: Active verification code is <strong style="color:var(--brand-cyan);">${expectedOtp}</strong>)</span>
    </div>
    <div class="form-group">
      <label>6-Digit Proof-of-Delivery OTP *</label>
      <input type="text" id="verify-otp" class="form-control font-mono" placeholder="482910" style="font-size:1.25rem; letter-spacing:4px; text-align:center;" maxlength="6">
    </div>
    <div class="form-group">
      <label>Verified Units Received</label>
      <input type="number" id="verify-qty" class="form-control font-mono" value="${expectedQty}">
    </div>
  `;

  openModal(`Proof-of-Delivery Authorization: Convoy #${shipId}`, formHtml, 'Authenticate Delivery', async () => {
    const otp = document.getElementById('verify-otp').value.trim();
    const receivedQuantity = parseInt(document.getElementById('verify-qty').value);

    try {
      const res = await fetch(`${API.shipments}/${shipId}/verify-delivery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ otp, receivedQuantity })
      });
      const data = await res.json();
      if (data.success) {
        showToast(data.message, 'success');
        closeModal();
        router();
      } else {
        showToast(data.message, 'error');
      }
    } catch (e) {}
  });
}

// ==========================================================================
// 12. Module 10: Interactive Geospatial GIS Map (Layer Controls Image 10)
// ==========================================================================
// Global GIS Layer Store for Floating Panel (Image 10)
let gisLayers = {
  incidents: null,
  shelters: null,
  depots: null,
  convoys: null,
  heat: null
};

async function loadMapView(container) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Geospatial Tactical Command Map</h1>
        <p class="page-subtitle">Real-time geospatial positioning of active disaster sectors, relief shelters, and logistics hubs.</p>
      </div>
      <div style="display:flex; gap:8px;">
        <span class="badge-pill badge-critical"><span class="dot"></span>Impact Sector</span>
        <span class="badge-pill badge-warning"><span class="dot"></span>Evacuation Shelter</span>
        <span class="badge-pill badge-info"><span class="dot"></span>Supply Depot</span>
        <span class="badge-pill badge-success"><span class="dot"></span>Active Convoy</span>
      </div>
    </div>

    <div class="card" style="padding:0; overflow:hidden; position:relative;">
      <!-- Floating Layers Panel (FEMA/Palantir Pattern - Image 10) -->
      <div class="gis-layers-panel">
        <div class="gis-layers-header">
          <h4>
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:15px;height:15px;"><polygon points="12 2 2 7 12 12 22 7 12 2"/><polyline points="2 17 12 22 22 17"/><polyline points="2 12 12 17 22 12"/></svg>
            Tactical Overlays
          </h4>
          <span class="badge-pill badge-info font-mono" style="padding:2px 6px; font-size:0.65rem;">5 ACTIVE</span>
        </div>

        <div class="gis-layer-item">
          <span><span class="dot" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#ef4444;margin-right:6px;"></span>Impact Zones (Disasters)</span>
          <label class="layer-toggle">
            <input type="checkbox" id="layer-incidents" checked onchange="toggleMapLayer('incidents')">
            <span class="layer-slider"></span>
          </label>
        </div>

        <div class="gis-layer-item">
          <span><span class="dot" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#f59e0b;margin-right:6px;"></span>Evacuation Shelters</span>
          <label class="layer-toggle">
            <input type="checkbox" id="layer-shelters" checked onchange="toggleMapLayer('shelters')">
            <span class="layer-slider"></span>
          </label>
        </div>

        <div class="gis-layer-item">
          <span><span class="dot" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#0284c7;margin-right:6px;"></span>Warehouse Depots</span>
          <label class="layer-toggle">
            <input type="checkbox" id="layer-depots" checked onchange="toggleMapLayer('depots')">
            <span class="layer-slider"></span>
          </label>
        </div>

        <div class="gis-layer-item">
          <span><span class="dot" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#10b981;margin-right:6px;"></span>Supply Convoys</span>
          <label class="layer-toggle">
            <input type="checkbox" id="layer-convoys" checked onchange="toggleMapLayer('convoys')">
            <span class="layer-slider"></span>
          </label>
        </div>

        <div class="gis-layer-item">
          <span><span class="dot" style="display:inline-block;width:8px;height:8px;border-radius:50%;background:#ec4899;margin-right:6px;"></span>Rescue Demand Heatmap</span>
          <label class="layer-toggle">
            <input type="checkbox" id="layer-heat" checked onchange="toggleMapLayer('heat')">
            <span class="layer-slider"></span>
          </label>
        </div>

        <div style="margin-top:10px; padding-top:8px; border-top:1px solid var(--border-subtle); font-size:0.72rem; color:var(--text-muted); display:flex; justify-content:space-between; align-items:center;">
          <span>Overlay Opacity</span>
          <input type="range" id="layer-opacity" min="20" max="100" value="90" style="width:100px; accent-color:var(--brand-cyan);" oninput="adjustMapOpacity(this.value)">
        </div>
      </div>

      <!-- Real-Time Cursor Coordinates HUD (Image 10) -->
      <div class="gis-coords-hud" id="gis-coords-display">
        LAT: 24.5000° N | LON: 77.5000° E | ELEV: 527m | TELEMETRY 433.92 MHz
      </div>

      <div id="gis-map" style="height: 640px; width: 100%;"></div>
    </div>
  `;

  if (window.L) {
    mapInstance = L.map('gis-map').setView([24.5, 77.5], 7);

    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 18,
      attribution: '© OpenStreetMap telemetry'
    }).addTo(mapInstance);

    // Track mouse coordinates for Tactical HUD (Image 10)
    mapInstance.on('mousemove', (e) => {
      const hud = document.getElementById('gis-coords-display');
      if (hud) {
        hud.textContent = `LAT: ${e.latlng.lat.toFixed(4)}° N | LON: ${e.latlng.lng.toFixed(4)}° E | ZOOM: ${mapInstance.getZoom()}x | TELEMETRY 433.92 MHz`;
      }
    });

    // Initialize Layer Groups
    gisLayers.incidents = L.layerGroup().addTo(mapInstance);
    gisLayers.shelters = L.layerGroup().addTo(mapInstance);
    gisLayers.depots = L.layerGroup().addTo(mapInstance);
    gisLayers.convoys = L.layerGroup().addTo(mapInstance);
    gisLayers.heat = L.layerGroup().addTo(mapInstance);

    // 1. Heatmap / Rescue Concentration Circles (Inspired by Image 6)
    const heatZones = [
      { lat: 26.2234, lng: 78.2270, radius: 24000, label: 'Gwalior Flood Inundation Zone' },
      { lat: 22.7196, lng: 75.8577, radius: 18000, label: 'Indore Industrial Fire Perimeter' },
      { lat: 23.2032, lng: 77.0844, radius: 15000, label: 'Sehore Seismic Aftershock Zone' }
    ];

    heatZones.forEach(z => {
      // Outer faint aura
      L.circle([z.lat, z.lng], {
        radius: z.radius,
        fillColor: '#38bdf8',
        color: 'transparent',
        fillOpacity: 0.2
      }).addTo(gisLayers.heat);

      // Mid intensity
      L.circle([z.lat, z.lng], {
        radius: z.radius * 0.6,
        fillColor: '#f59e0b',
        color: 'transparent',
        fillOpacity: 0.35
      }).addTo(gisLayers.heat);

      // Core hotspot
      L.circle([z.lat, z.lng], {
        radius: z.radius * 0.28,
        fillColor: '#ef4444',
        color: '#dc2626',
        weight: 1,
        fillOpacity: 0.55
      }).addTo(gisLayers.heat).bindPopup(`<strong>Rescue Demand Hotspot</strong><br>${z.label}`);
    });

    // 2. Logistics Convoy Route Polyline (Image 4 & 10)
    const convoyRoute = [
      [23.2599, 77.4126], // Bhopal Logistics Depot
      [24.6500, 77.3200], // Guna Waypoint
      [25.4300, 77.6500], // Shivpuri Waypoint
      [26.2234, 78.2270]  // Gwalior Shelter
    ];

    L.polyline(convoyRoute, {
      color: '#10b981',
      weight: 3.5,
      dashArray: '8, 8',
      opacity: 0.9
    }).addTo(gisLayers.convoys).bindPopup('<strong>Supply Convoy Route: NH-46</strong><br>Bhopal Base $\rightarrow$ Gwalior Shelter');

    // Convoy Vehicle Marker
    L.circleMarker([24.6500, 77.3200], {
      radius: 8,
      fillColor: '#10b981',
      color: '#ffffff',
      weight: 2.5,
      fillOpacity: 1
    }).addTo(gisLayers.convoys).bindPopup(`
      <div style="font-family:'Plus Jakarta Sans',sans-serif; font-size:12px;">
        <strong style="color:#059669; font-family:'JetBrains Mono';">CONVOY IN TRANSIT</strong>
        <div style="font-weight:700; margin:3px 0;">Vehicle: MP-04-HE-8921</div>
        <div>Current Location: NH-46 Waypoint KM 142</div>
        <div style="color:#64748b;">Driver: Rajesh Kumar (9826011223)</div>
      </div>
    `);

    // 3. Database Locations & Shelters
    try {
      const [locRes, sheRes] = await Promise.all([fetch(API.locations), fetch(API.shelters)]);
      const locData = await locRes.json();
      const sheData = await sheRes.json();

      if (locData.success) {
        locData.data.forEach(loc => {
          if (!loc.Latitude || !loc.Longitude) return;
          const isWarehouse = loc.Location_Type === 'Warehouse/Depot';
          const targetGroup = isWarehouse ? gisLayers.depots : gisLayers.incidents;
          const markerColor = isWarehouse ? '#0284c7' : '#ef4444';

          const marker = L.circleMarker([loc.Latitude, loc.Longitude], {
            radius: isWarehouse ? 9 : 8,
            fillColor: markerColor,
            color: '#ffffff',
            weight: 2,
            opacity: 1,
            fillOpacity: 0.95
          }).addTo(targetGroup);

          marker.bindPopup(`
            <div style="font-family:'Plus Jakarta Sans',sans-serif; font-size:12px; line-height:1.5;">
              <strong style="color:${markerColor}; font-family:'JetBrains Mono'; text-transform:uppercase;">${loc.Location_Type}</strong>
              <div style="font-weight:700; margin:3px 0;">${loc.City}</div>
              <div style="color:#64748b;">${loc.Address}</div>
              <div style="margin-top:4px; font-family:'JetBrains Mono'; font-size:11px;">Impact Pop: ${Number(loc.Affected_Population).toLocaleString()}</div>
            </div>
          `);
        });
      }

      if (sheData.success) {
        sheData.data.forEach(she => {
          if (!she.Latitude || !she.Longitude) return;

          const marker = L.circleMarker([she.Latitude, she.Longitude], {
            radius: 10,
            fillColor: '#f59e0b',
            color: '#ffffff',
            weight: 2.5,
            opacity: 1,
            fillOpacity: 0.95
          }).addTo(gisLayers.shelters);

          marker.bindPopup(`
            <div style="font-family:'Plus Jakarta Sans',sans-serif; font-size:12px; line-height:1.5;">
              <strong style="color:#d97706; font-family:'JetBrains Mono';">SHELTER FACILITY</strong>
              <div style="font-weight:700; margin:3px 0;">${she.Shelter_Name}</div>
              <div style="color:#64748b;">${she.City}</div>
              <div style="margin-top:4px; font-family:'JetBrains Mono'; font-size:11px;">Occupancy: ${she.Current_Occupancy}/${she.Capacity} (${she.Occupancy_Rate}%)</div>
            </div>
          `);
        });
      }
    } catch (e) {}
  }
}

function toggleMapLayer(layerKey) {
  if (!mapInstance || !gisLayers[layerKey]) return;
  const checkbox = document.getElementById(`layer-${layerKey}`);
  if (!checkbox) return;

  if (checkbox.checked) {
    mapInstance.addLayer(gisLayers[layerKey]);
    showToast(`Layer enabled: ${layerKey.toUpperCase()}`, 'info');
  } else {
    mapInstance.removeLayer(gisLayers[layerKey]);
    showToast(`Layer disabled: ${layerKey.toUpperCase()}`, 'info');
  }
}

function adjustMapOpacity(val) {
  const opacity = val / 100;
  Object.keys(gisLayers).forEach(key => {
    if (gisLayers[key]) {
      gisLayers[key].eachLayer(layer => {
        if (layer.setOpacity) layer.setOpacity(opacity);
        if (layer.setStyle) layer.setStyle({ fillOpacity: opacity * 0.8, opacity: opacity });
      });
    }
  });
}

// ==========================================================================
// 13. Module 11: Telemetry Analytics
// ==========================================================================
async function loadAnalyticsView(container) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Telemetry Analytics & Reporting</h1>
        <p class="page-subtitle">Historical throughput, resource deployment velocity, and sector capacity.</p>
      </div>
    </div>

    <div style="display:grid; grid-template-columns: repeat(auto-fit, minmax(440px, 1fr)); gap:20px;">
      <div class="card">
        <div class="card-header"><h3 class="card-title">Supply Velocity vs. Requirements</h3></div>
        <div style="padding:20px; height:300px;">
          <canvas id="analytics-supplies-chart"></canvas>
        </div>
      </div>
      <div class="card">
        <div class="card-header"><h3 class="card-title">Shelter Census Distribution</h3></div>
        <div style="padding:20px; height:300px;">
          <canvas id="analytics-shelter-chart"></canvas>
        </div>
      </div>
    </div>
  `;

  try {
    const [metricsRes, sheltersRes] = await Promise.all([fetch(API.metrics), fetch(API.shelters)]);
    const mData = await metricsRes.json();
    const sData = await sheltersRes.json();

    if (mData.success && window.Chart) {
      const topSupplies = mData.charts.topRequestedSupplies;
      const ctx1 = document.getElementById('analytics-supplies-chart');
      activeCharts.ana1 = new Chart(ctx1, {
        type: 'bar',
        data: {
          labels: topSupplies.map(s => s.Supply_Name),
          datasets: [
            { label: 'Demand', data: topSupplies.map(s => s.Requested_Qty), backgroundColor: '#0284c7' },
            { label: 'Allocated', data: topSupplies.map(s => s.Allocated_Qty), backgroundColor: '#0d9488' }
          ]
        },
        options: { responsive: true, maintainAspectRatio: false }
      });
    }

    if (sData.success && window.Chart) {
      const ctx2 = document.getElementById('analytics-shelter-chart');
      activeCharts.ana2 = new Chart(ctx2, {
        type: 'pie',
        data: {
          labels: sData.data.map(s => s.Shelter_Name),
          datasets: [{
            data: sData.data.map(s => s.Current_Occupancy),
            backgroundColor: ['#0284c7', '#0d9488', '#f59e0b', '#ef4444', '#10b981']
          }]
        },
        options: { responsive: true, maintainAspectRatio: false }
      });
    }
  } catch (e) {}
}



// ==========================================================================
// 14. Module 12: Governance & System Audit
// ==========================================================================
async function loadSettingsView(container) {
  container.innerHTML = `
    <div class="page-header">
      <div>
        <h1 class="page-title">Governance & Audit Ledger</h1>
        <p class="page-subtitle">Cryptographic log verification, relational pool state, and system telemetry.</p>
      </div>
    </div>

    <div style="display:grid; grid-template-columns: 1fr 2fr; gap:20px;">
      <div class="card">
        <div class="card-header"><h3 class="card-title">Environment Telemetry</h3></div>
        <div style="padding:18px; font-size:0.83rem; line-height:1.9;">
          <p><strong>DB Engine:</strong> <span class="badge-pill badge-success"><span class="dot"></span>MySQL 8.0 POOL ACTIVE</span></p>
          <p><strong>Relational Schema:</strong> <code class="font-mono">disaster_relief_db</code></p>
          <p><strong>Port Binding:</strong> <code class="font-mono">5000 / TCP</code></p>
          <p><strong>Security Model:</strong> <span class="badge-pill badge-info"><span class="dot"></span>JWT + RBAC GUARDS</span></p>
          <p><strong>Audit Engine:</strong> <span class="badge-pill badge-success"><span class="dot"></span>IMMUTABLE LEDGER</span></p>
          <hr style="border:none; border-top:1px solid var(--border-subtle); margin:12px 0;">
          <button class="btn btn-secondary" onclick="toggleTheme()" style="width:100%; justify-content:center;">Toggle Surface Mode (Light/Dark)</button>
        </div>
      </div>

      <div class="card">
        <div class="card-header"><h3 class="card-title">Operations Ledger</h3></div>
        <div class="table-responsive">
          <table class="data-table">
            <thead>
              <tr>
                <th>ID</th>
                <th>Classification</th>
                <th>Audit Event</th>
                <th>Actor</th>
                <th>Timestamp</th>
              </tr>
            </thead>
            <tbody id="full-audit-tbody">
              <tr><td colspan="5" style="text-align:center; padding:18px;">Retrieving audit ledger...</td></tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  `;

  try {
    const res = await fetch(`${API.activityLogs}?limit=25`);
    const data = await res.json();
    const tbody = document.getElementById('full-audit-tbody');
    if (data.success && data.data.length > 0) {
      tbody.innerHTML = data.data.map(l => `
        <tr>
          <td class="font-mono">#${l.Log_Id}</td>
          <td><span class="badge-pill badge-info"><span class="dot"></span>${l.Action_Type}</span></td>
          <td>${l.Description}</td>
          <td>${l.Actor_Name || 'SYSTEM'}<div style="font-size:0.7rem; color:var(--text-muted); font-family:'JetBrains Mono';">${l.Actor_Role || 'DAEMON'}</div></td>
          <td class="font-mono" style="font-size:0.75rem; color:var(--text-muted);">${new Date(l.Created_At).toISOString().replace('T', ' ').slice(0, 19)}</td>
        </tr>
      `).join('');
    }
  } catch (e) {}
}

// ==========================================================================
// 14. Phase 18: Field-Worker Offline Mode & Low-Bandwidth Synchronization
// ==========================================================================
function initOfflineEngine() {
  window.addEventListener('online', () => {
    updateNetworkStatusUI();
    showToast('[TELEMETRY UPLINK] Field connectivity restored. Auto-reconciling queue...', 'info');
    syncOfflineQueue();
  });

  window.addEventListener('offline', () => {
    updateNetworkStatusUI();
    showToast('[TELEMETRY DOWN] Connection severed. Offline Local Storage Queue activated.', 'warning');
  });

  updateNetworkStatusUI();

  // If already online at startup and there are queued items, automatically sync!
  if (navigator.onLine) {
    const queue = JSON.parse(localStorage.getItem('drracs_offline_queue') || '[]');
    if (queue.length > 0) {
      setTimeout(syncOfflineQueue, 1500);
    }
  }
}

function updateNetworkStatusUI() {
  const isOnline = navigator.onLine;
  const pill = document.getElementById('network-status-pill');
  const text = document.getElementById('network-status-text');
  const queueBtn = document.getElementById('offline-queue-btn');
  const queueCountText = document.getElementById('offline-queue-count');

  if (pill && text) {
    if (isOnline) {
      pill.classList.remove('offline');
      text.textContent = 'ONLINE';
    } else {
      pill.classList.add('offline');
      text.textContent = 'FIELD OFFLINE';
    }
  }

  // Update Offline Queue Button
  const queue = JSON.parse(localStorage.getItem('drracs_offline_queue') || '[]');
  if (queueBtn && queueCountText) {
    if (queue.length > 0) {
      queueBtn.style.display = 'inline-flex';
      queueCountText.textContent = `${queue.length} Queued Locally`;
    } else {
      queueBtn.style.display = 'none';
    }
  }
}

function enqueueOfflineRequest(payload) {
  const queue = JSON.parse(localStorage.getItem('drracs_offline_queue') || '[]');
  const tempId = 'LOCAL-' + Math.floor(1000 + Math.random() * 9000);
  
  queue.push({
    tempId,
    payload,
    timestamp: new Date().toISOString()
  });

  localStorage.setItem('drracs_offline_queue', JSON.stringify(queue));
  updateNetworkStatusUI();

  showToast(`[OFFLINE QUEUE] Requisition stored locally (#${tempId}). Auto-sync will engage when connection restores.`, 'warning');
  
  if (window.location.hash === '#requests' || window.location.hash === '#dashboard') {
    router();
  }
}

async function syncOfflineQueue() {
  const queue = JSON.parse(localStorage.getItem('drracs_offline_queue') || '[]');
  if (queue.length === 0) return;

  let successfulCount = 0;
  const remaining = [];

  for (const item of queue) {
    try {
      const res = await fetch(API.requests, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item.payload)
      });
      const data = await res.json();
      if (data.success) {
        successfulCount++;
      } else {
        remaining.push(item);
      }
    } catch (err) {
      // Still unreachable
      remaining.push(item);
    }
  }

  localStorage.setItem('drracs_offline_queue', JSON.stringify(remaining));
  updateNetworkStatusUI();

  if (successfulCount > 0) {
    showToast(`[TELEMETRY SYNC] Successfully reconciled ${successfulCount} offline requisition(s) with National Command!`, 'success');
    router();
  }
}

function openOfflineQueueModal() {
  const queue = JSON.parse(localStorage.getItem('drracs_offline_queue') || '[]');

  if (queue.length === 0) {
    showToast('Offline requisition queue is clear.', 'info');
    return;
  }

  const tableRows = queue.map((q, idx) => `
    <tr>
      <td class="font-mono"><strong>#${q.tempId}</strong></td>
      <td>Shelter #${q.payload.shelterId}</td>
      <td><span class="badge-pill badge-warning"><span class="dot"></span>${q.payload.priority}</span></td>
      <td>${q.payload.items.length} item(s)</td>
      <td class="font-mono" style="font-size:0.75rem;">${new Date(q.timestamp).toLocaleTimeString()}</td>
      <td>
        <button class="btn btn-secondary" style="padding:2px 8px; font-size:0.72rem; color:var(--status-critical);" onclick="removeOfflineRequest(${idx})">Discard</button>
      </td>
    </tr>
  `).join('');

  const modalHtml = `
    <p style="font-size:0.85rem; color:var(--text-muted); margin-bottom:14px;">
      These requisitions were generated in low-bandwidth or disconnected conditions and are securely staged in local browser storage.
    </p>
    <div class="table-responsive" style="margin-bottom:14px;">
      <table class="data-table">
        <thead>
          <tr>
            <th>Temp ID</th>
            <th>Facility</th>
            <th>Priority</th>
            <th>Payload</th>
            <th>Queued</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>${tableRows}</tbody>
      </table>
    </div>
  `;

  openModal('Offline Requisition Staging Queue', modalHtml, 'Force Synchronize to Cloud', () => {
    closeModal();
    syncOfflineQueue();
  });
}

function removeOfflineRequest(index) {
  const queue = JSON.parse(localStorage.getItem('drracs_offline_queue') || '[]');
  queue.splice(index, 1);
  localStorage.setItem('drracs_offline_queue', JSON.stringify(queue));
  updateNetworkStatusUI();
  closeModal();
  openOfflineQueueModal();
  showToast('Offline requisition purged from local cache.', 'info');
}

// ==========================================================================
// Phase 2: Role-Based Authentication & Interactive Role Switcher
// ==========================================================================

let currentUser = null;
let authNotice = '';

async function initAuthSystem() {
  const savedToken = localStorage.getItem('drracs_token');

  currentUser = null;
  if (savedToken) {
    try {
      const response = await fetch(API.auth + '/profile');
      const data = await response.json();
      if (!response.ok || !data.success || !data.user) {
        throw new Error(data.message || 'Session verification failed.');
      }
      currentUser = buildUserProfile(data.user);
      localStorage.setItem('drracs_user', JSON.stringify(currentUser));
    } catch (error) {
      localStorage.removeItem('drracs_token');
      localStorage.removeItem('drracs_user');
      authNotice = 'Your session could not be verified. Please sign in again.';
    }
  }

  renderAuthUI();

  // Close dropdown on outside click
  document.addEventListener('click', (e) => {
    const dropdown = document.getElementById('auth-dropdown-panel');
    const badge = document.querySelector('.user-badge');
    if (dropdown && dropdown.style.display !== 'none') {
      if (!dropdown.contains(e.target) && (!badge || !badge.contains(e.target))) {
        dropdown.style.display = 'none';
      }
    }
  });
}

function buildUserProfile(user) {
  const name = user.name || user.Full_Name;
  const role = user.role || user.Role;
  const roleTitles = {
    Admin: 'Incident Lead',
    Relief_Officer: 'Logistics Lead',
    Shelter_Manager: 'Camp Director',
    Citizen: 'Citizen Reporter'
  };
  return {
    userId: user.userId || user.User_Id,
    name,
    email: user.email || user.Email,
    role,
    roleTitle: roleTitles[role] || role,
    avatar: name.split(' ').map(part => part[0]).join('').substring(0, 2).toUpperCase(),
    phone: user.phone || user.Phone || ''
  };
}

function storeAuthSession(user, token) {
  localStorage.setItem('drracs_token', token);
  currentUser = buildUserProfile(user);
  localStorage.setItem('drracs_user', JSON.stringify(currentUser));
  authNotice = '';
  renderAuthUI();
  updateRoleNavigation();
}

function getRoleBadgeClass(role) {
  switch (role) {
    case 'Admin': return 'role-admin';
    case 'Relief_Officer': return 'role-officer';
    case 'Shelter_Manager': return 'role-shelter';
    case 'Citizen': return 'role-citizen';
    default: return 'role-citizen';
  }
}

function renderAuthUI() {
  const container = document.getElementById('auth-user-container');
  if (!container) return;

  if (!currentUser) {
    container.innerHTML = `
      <div style="display:flex; gap:8px; align-items:center;">
        <button class="btn btn-secondary" style="padding:5px 12px; font-size:0.75rem;" onclick="openLoginModal('login')">Sign In</button>
        <button class="btn btn-primary" style="padding:5px 12px; font-size:0.75rem;" onclick="openLoginModal('register')">Register</button>
      </div>
    `;
    return;
  }

  const roleClass = getRoleBadgeClass(currentUser.role);
  const initials = currentUser.avatar;
  const avatarBg = currentUser.avatarBg || 'linear-gradient(135deg, #6366f1, #06b6d4)';

  container.innerHTML = `
    <div class="user-badge" onclick="toggleAuthDropdown(event)" title="${currentUser.name} (${currentUser.roleTitle})">
      <div class="user-avatar" style="background:${avatarBg}">${initials}</div>
      <div class="user-info">
        <span class="name">${currentUser.name}</span>
        <span class="role"><span class="role-badge ${roleClass}">${currentUser.roleTitle || currentUser.role}</span></span>
      </div>
    </div>

    <div class="auth-dropdown" id="auth-dropdown-panel" style="display:none;" onclick="event.stopPropagation()">
      <div class="auth-dropdown-header">
        <div class="user-full-name">${currentUser.name}</div>
        <div class="user-email">${currentUser.email}</div>
      </div>
      <div class="auth-dropdown-footer">
        <button onclick="logoutUser()" style="color:#ef4444;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:13px;height:13px;"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
          Sign Out
        </button>
      </div>
    </div>
  `;
}

function toggleAuthDropdown(e) {
  if (e) e.stopPropagation();
  const dropdown = document.getElementById('auth-dropdown-panel');
  if (dropdown) {
    dropdown.style.display = dropdown.style.display === 'none' ? 'block' : 'none';
  }
}

function openLoginModal(defaultTab = 'login') {
  const dropdown = document.getElementById('auth-dropdown-panel');
  if (dropdown) dropdown.style.display = 'none';

  const modalHtml = `
    <div style="margin-bottom:16px;">
      <div style="display:flex; border-bottom:1px solid var(--border-subtle); margin-bottom:16px;">
        <button id="tab-login-btn" onclick="switchAuthTab('login')" style="flex:1; padding:8px; background:none; border:none; border-bottom:2px solid ${defaultTab === 'login' ? 'var(--brand-primary)' : 'transparent'}; font-weight:700; color:${defaultTab === 'login' ? 'var(--brand-primary)' : 'var(--text-muted)'}; cursor:pointer;">Sign In</button>
        <button id="tab-register-btn" onclick="switchAuthTab('register')" style="flex:1; padding:8px; background:none; border:none; border-bottom:2px solid ${defaultTab === 'register' ? 'var(--brand-primary)' : 'transparent'}; font-weight:700; color:${defaultTab === 'register' ? 'var(--brand-primary)' : 'var(--text-muted)'}; cursor:pointer;">Register Account</button>
      </div>

      <!-- Login Form View -->
      <form id="auth-login-form" style="display:${defaultTab === 'login' ? 'block' : 'none'};" onsubmit="handleLoginSubmit(event)">
        <div class="form-group" style="margin-bottom:12px;">
          <label style="font-size:0.75rem; font-weight:700; margin-bottom:4px; display:block;">Email Address</label>
          <input type="email" id="login-email" class="form-control" style="width:100%; padding:8px 12px; border-radius:var(--radius-sm); border:1px solid var(--border-subtle); background:var(--card-bg); color:var(--text-body);" autocomplete="username" required>
        </div>
        <div class="form-group" style="margin-bottom:16px;">
          <label style="font-size:0.75rem; font-weight:700; margin-bottom:4px; display:block;">Password</label>
          <div style="position:relative;">
            <input type="password" id="login-password" class="form-control" style="width:100%; padding:8px 12px; border-radius:var(--radius-sm); border:1px solid var(--border-subtle); background:var(--card-bg); color:var(--text-body);" autocomplete="current-password" required>
            <span onclick="togglePasswordVisibility('login-password')" style="position:absolute; right:10px; top:8px; cursor:pointer; font-size:0.72rem; color:var(--text-muted);">👁️</span>
          </div>
        </div>
        <button type="submit" class="btn btn-primary" style="width:100%; padding:10px; font-weight:700;">Sign In with JWT Authentication</button>
      </form>

      <!-- Register Form View -->
      <form id="auth-register-form" style="display:${defaultTab === 'register' ? 'block' : 'none'};" onsubmit="handleRegisterSubmit(event)">
        <div class="form-group" style="margin-bottom:10px;">
          <label style="font-size:0.75rem; font-weight:700; margin-bottom:4px; display:block;">Full Name</label>
          <input type="text" id="reg-name" class="form-control" style="width:100%; padding:8px 12px; border-radius:var(--radius-sm); border:1px solid var(--border-subtle); background:var(--card-bg); color:var(--text-body);" placeholder="e.g. Dr. Ramesh Kumar" required>
        </div>
        <div class="form-group" style="margin-bottom:10px;">
          <label style="font-size:0.75rem; font-weight:700; margin-bottom:4px; display:block;">Email Address</label>
          <input type="email" id="reg-email" class="form-control" style="width:100%; padding:8px 12px; border-radius:var(--radius-sm); border:1px solid var(--border-subtle); background:var(--card-bg); color:var(--text-body);" placeholder="user@domain.org" required>
        </div>
        <div class="form-group" style="margin-bottom:10px;">
          <label style="font-size:0.75rem; font-weight:700; margin-bottom:4px; display:block;">Role Designation</label>
          <input type="text" class="form-control" value="Citizen / Ground Reporter" disabled>
        </div>
        <div class="form-group" style="margin-bottom:16px;">
          <label style="font-size:0.75rem; font-weight:700; margin-bottom:4px; display:block;">Password (Min 6 Characters)</label>
          <input type="password" id="reg-password" class="form-control" style="width:100%; padding:8px 12px; border-radius:var(--radius-sm); border:1px solid var(--border-subtle); background:var(--card-bg); color:var(--text-body);" placeholder="••••••" minlength="6" required>
        </div>
        <button type="submit" class="btn btn-primary" style="width:100%; padding:10px; font-weight:700;">Create Account & Generate Token</button>
      </form>
    </div>
  `;

  openModal('DRRACS Security Access & Authentication', modalHtml, null, null);
}

function switchAuthTab(tab) {
  const loginForm = document.getElementById('auth-login-form');
  const regForm = document.getElementById('auth-register-form');
  const loginBtn = document.getElementById('tab-login-btn');
  const regBtn = document.getElementById('tab-register-btn');

  if (tab === 'login') {
    loginForm.style.display = 'block';
    regForm.style.display = 'none';
    loginBtn.style.borderBottom = '2px solid var(--brand-primary)';
    loginBtn.style.color = 'var(--brand-primary)';
    regBtn.style.borderBottom = '2px solid transparent';
    regBtn.style.color = 'var(--text-muted)';
  } else {
    loginForm.style.display = 'none';
    regForm.style.display = 'block';
    regBtn.style.borderBottom = '2px solid var(--brand-primary)';
    regBtn.style.color = 'var(--brand-primary)';
    loginBtn.style.borderBottom = '2px solid transparent';
    loginBtn.style.color = 'var(--text-muted)';
  }
}

function togglePasswordVisibility(inputId) {
  const input = document.getElementById(inputId);
  if (input) {
    input.type = input.type === 'password' ? 'text' : 'password';
  }
}

async function handleLoginSubmit(e) {
  e.preventDefault();
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value.trim();

  try {
    const res = await fetch(API.auth + '/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();

    if (data.success && data.token) {
      storeAuthSession(data.user, data.token);
      closeModal();
      showToast(`Welcome back, ${data.user.name}!`, 'success');
      window.location.href = getRolePath(currentUser.role) + getHomeRoute(currentUser.role);
    } else {
      showToast(data.message || 'Login failed. Please verify credentials.', 'error');
    }
  } catch (error) {
    showToast('Failed to connect to authentication server.', 'error');
  }
}

async function handleRegisterSubmit(e) {
  e.preventDefault();
  const name = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value.trim();

  try {
    const res = await fetch(API.auth + '/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, role: 'Citizen', password })
    });
    const data = await res.json();

    if (data.success && data.token) {
      storeAuthSession(data.user, data.token);
      closeModal();
      showToast('Account registered successfully.', 'success');
      window.location.href = getRolePath(currentUser.role) + getHomeRoute(currentUser.role);
    } else {
      showToast(data.message || 'Registration failed.', 'error');
    }
  } catch (error) {
    showToast('Failed to connect to authentication server.', 'error');
  }
}

function logoutUser() {
  localStorage.removeItem('drracs_token');
  localStorage.removeItem('drracs_user');
  currentUser = null;
  authNotice = '';
  renderAuthUI();
  window.location.href = '/login';
}

// ==========================================================================
// Phase 2 Extension: Public Citizen Emergency Disaster Portal ("Citizen SOS")
// ==========================================================================

let citizenDetectedCoords = null;

function openCitizenSOSModal() {
  const modalHtml = `
    <div>
      <div class="sos-banner">
        <div class="sos-banner-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:20px;height:20px;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        </div>
        <div class="sos-banner-text">
          <h4>EMERGENCY CIVILIAN DISTRESS SIGNAL (CITIZEN SOS)</h4>
          <p>Direct priority uplink to State Disaster Management Authority & National Response Force.</p>
        </div>
      </div>

      <form id="citizen-sos-form" onsubmit="handleCitizenSOSSubmit(event)">
        <!-- 1. Disaster Nature & Urgency -->
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; margin-bottom:12px;">
          <div>
            <label style="font-size:0.75rem; font-weight:700; margin-bottom:4px; display:block;">Incident / Hazard Type *</label>
            <select id="sos-disaster-type" class="form-control" style="width:100%; padding:8px 12px; border-radius:var(--radius-sm); border:1px solid var(--border-subtle); background:var(--card-bg); color:var(--text-body);" required>
              <option value="Flood Surge">🌊 Flood / River Surge</option>
              <option value="Building Collapse">🏚️ Building / Structural Collapse</option>
              <option value="Industrial Fire">🔥 Major Fire Outbreak</option>
              <option value="Earthquake">🌋 Earthquake Tremors</option>
              <option value="Landslide">⛰️ Landslide / Mudflow</option>
              <option value="Medical Crisis">🚑 Medical Trauma / Epidemic</option>
            </select>
          </div>
          <div>
            <label style="font-size:0.75rem; font-weight:700; margin-bottom:4px; display:block;">Urgency & Threat Level *</label>
            <div class="sos-severity-pills">
              <button type="button" class="severity-pill-btn active critical" id="sev-crit-btn" onclick="selectSOSSeverity('Critical')">🚨 Critical</button>
              <button type="button" class="severity-pill-btn high" id="sev-high-btn" onclick="selectSOSSeverity('High')">⚠️ High</button>
              <button type="button" class="severity-pill-btn medium" id="sev-med-btn" onclick="selectSOSSeverity('Medium')">⚡ Medium</button>
            </div>
            <input type="hidden" id="sos-severity" value="Critical">
          </div>
        </div>

        <!-- 2. Ground Location & Geolocation Auto-Detection -->
        <div style="background:var(--app-bg); padding:12px; border-radius:var(--radius-sm); border:1px solid var(--border-subtle); margin-bottom:12px;">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
            <label style="font-size:0.75rem; font-weight:700; color:var(--text-title); margin:0;">Ground Location & Coordinates *</label>
            <button type="button" class="gps-detect-btn" onclick="autoDetectCitizenGPS()">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>
              <span>Use My Live GPS</span>
            </button>
          </div>
          <div style="display:grid; grid-template-columns: 2fr 1fr; gap:8px; margin-bottom:8px;">
            <input type="text" id="sos-address" class="form-control" style="width:100%; padding:8px 12px; border-radius:var(--radius-sm); border:1px solid var(--border-subtle); background:var(--card-bg); color:var(--text-body);" placeholder="Street, Landmark or Area Name (e.g. Near Morar Embankment)" required>
            <select id="sos-city" class="form-control" style="width:100%; padding:8px 12px; border-radius:var(--radius-sm); border:1px solid var(--border-subtle); background:var(--card-bg); color:var(--text-body);">
              <option value="Gwalior">Gwalior</option>
              <option value="Sehore">Sehore</option>
              <option value="Indore">Indore</option>
              <option value="Bhopal">Bhopal</option>
              <option value="Jabalpur">Jabalpur</option>
            </select>
          </div>
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
            <input type="number" step="0.0001" id="sos-lat" class="form-control" style="width:100%; padding:6px 10px; font-family:'JetBrains Mono'; font-size:0.75rem; border-radius:var(--radius-sm); border:1px solid var(--border-subtle); background:var(--card-bg); color:var(--text-body);" placeholder="Latitude (e.g. 26.2234)" value="26.2234">
            <input type="number" step="0.0001" id="sos-lng" class="form-control" style="width:100%; padding:6px 10px; font-family:'JetBrains Mono'; font-size:0.75rem; border-radius:var(--radius-sm); border:1px solid var(--border-subtle); background:var(--card-bg); color:var(--text-body);" placeholder="Longitude (e.g. 78.2270)" value="78.2270">
          </div>
          <div id="gps-status-badge" style="font-size:0.68rem; color:var(--text-muted); margin-top:5px; font-family:'JetBrains Mono';">📍 Defaulting to sector coordinates. Click 'Use My Live GPS' to lock device location.</div>
        </div>

        <!-- 3. Trapped People Stepper & Immediate Needs -->
        <div style="display:grid; grid-template-columns: 1fr 1fr; gap:12px; margin-bottom:12px;">
          <div>
            <label style="font-size:0.75rem; font-weight:700; margin-bottom:4px; display:block;">Estimated People Stranded / Trapped</label>
            <div style="display:flex; align-items:center; gap:8px;">
              <button type="button" class="btn btn-secondary" style="padding:6px 14px; font-weight:800;" onclick="adjustVictimCount(-1)">−</button>
              <input type="number" id="sos-victim-count" class="form-control" style="width:70px; text-align:center; font-family:'JetBrains Mono'; font-weight:700; padding:6px; border-radius:var(--radius-sm); border:1px solid var(--border-subtle); background:var(--card-bg); color:var(--text-body);" value="8" min="1" max="1000">
              <button type="button" class="btn btn-secondary" style="padding:6px 14px; font-weight:800;" onclick="adjustVictimCount(1)">+</button>
              <span style="font-size:0.75rem; color:var(--text-muted);">Persons</span>
            </div>
          </div>
          <div>
            <label style="font-size:0.75rem; font-weight:700; margin-bottom:4px; display:block;">Reporter Contact (Optional)</label>
            <input type="tel" id="sos-reporter-phone" class="form-control" style="width:100%; padding:8px 12px; border-radius:var(--radius-sm); border:1px solid var(--border-subtle); background:var(--card-bg); color:var(--text-body);" placeholder="Phone / WhatsApp for Rescue Unit">
          </div>
        </div>

        <!-- 4. Immediate Aid Checklist -->
        <div style="margin-bottom:14px;">
          <label style="font-size:0.75rem; font-weight:700; margin-bottom:4px; display:block;">Immediate Relief Items Required</label>
          <div class="sos-supplies-grid">
            <label class="sos-supply-check">
              <input type="checkbox" name="sos_supplies" value="1" checked> 💧 Drinking Water (20L)
            </label>
            <label class="sos-supply-check">
              <input type="checkbox" name="sos_supplies" value="2" checked> 🍞 Emergency Food Packs
            </label>
            <label class="sos-supply-check">
              <input type="checkbox" name="sos_supplies" value="4" checked> 🩹 First Aid & Trauma Kit
            </label>
            <label class="sos-supply-check">
              <input type="checkbox" name="sos_supplies" value="3"> 🧣 Thermal Blankets
            </label>
            <label class="sos-supply-check">
              <input type="checkbox" name="sos_supplies" value="6"> ⛺ Emergency Tents
            </label>
            <label class="sos-supply-check">
              <input type="checkbox" name="sos_supplies" value="5"> ⚡ ORS Electrolytes
            </label>
          </div>
        </div>

        <!-- 5. Situation Description -->
        <div style="margin-bottom:16px;">
          <label style="font-size:0.75rem; font-weight:700; margin-bottom:4px; display:block;">Ground Situation / Immediate Hazards</label>
          <textarea id="sos-notes" class="form-control" rows="2" style="width:100%; padding:8px 12px; border-radius:var(--radius-sm); border:1px solid var(--border-subtle); background:var(--card-bg); color:var(--text-body); font-family:inherit; font-size:0.8rem;" placeholder="E.g., Water level reaching 1st floor, 3 children present, power supply cut off."></textarea>
        </div>

        <button type="submit" class="btn" style="width:100%; padding:12px; background:linear-gradient(135deg, #ef4444, #dc2626); color:#ffffff; font-weight:800; font-family:'JetBrains Mono'; letter-spacing:0.04em; border:none; border-radius:var(--radius-pill); cursor:pointer; box-shadow:0 4px 14px rgba(239,68,68,0.4);">
          🚨 BROADCAST EMERGENCY SOS DISTRESS SIGNAL
        </button>
      </form>
    </div>
  `;

  openModal('Public Distress Reporting Portal', modalHtml, null, null);
}

function selectSOSSeverity(sev) {
  const hiddenInput = document.getElementById('sos-severity');
  if (hiddenInput) hiddenInput.value = sev;

  const critBtn = document.getElementById('sev-crit-btn');
  const highBtn = document.getElementById('sev-high-btn');
  const medBtn = document.getElementById('sev-med-btn');

  if (critBtn) critBtn.className = `severity-pill-btn ${sev === 'Critical' ? 'active critical' : ''}`;
  if (highBtn) highBtn.className = `severity-pill-btn ${sev === 'High' ? 'active high' : ''}`;
  if (medBtn) medBtn.className = `severity-pill-btn ${sev === 'Medium' ? 'active medium' : ''}`;
}

function adjustVictimCount(delta) {
  const input = document.getElementById('sos-victim-count');
  if (input) {
    let val = parseInt(input.value, 10) || 1;
    val = Math.max(1, Math.min(1000, val + delta));
    input.value = val;
  }
}

function autoDetectCitizenGPS() {
  const statusBadge = document.getElementById('gps-status-badge');
  if (statusBadge) statusBadge.textContent = '🔄 Querying device satellite GPS receiver...';

  if (!navigator.geolocation) {
    if (statusBadge) statusBadge.textContent = '⚠️ Geolocation not supported by your browser. Using sector coordinates.';
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (position) => {
      const lat = position.coords.latitude;
      const lng = position.coords.longitude;
      const latInput = document.getElementById('sos-lat');
      const lngInput = document.getElementById('sos-lng');
      if (latInput) latInput.value = lat.toFixed(4);
      if (lngInput) lngInput.value = lng.toFixed(4);
      if (statusBadge) {
        statusBadge.innerHTML = `<span style="color:#10b981;">✅ Sat-Lock Confirmed: LAT ${lat.toFixed(4)}°, LON ${lng.toFixed(4)}° (Accuracy ±${Math.round(position.coords.accuracy)}m)</span>`;
      }
      showToast('Live GPS coordinates acquired.', 'success');
    },
    (err) => {
      if (statusBadge) {
        statusBadge.textContent = '📍 Location permission not granted. Defaulting to sector coordinates.';
      }
    },
    { enableHighAccuracy: true, timeout: 8000 }
  );
}

async function handleCitizenSOSSubmit(e) {
  e.preventDefault();

  const disasterType = document.getElementById('sos-disaster-type').value;
  const severity = document.getElementById('sos-severity').value;
  const address = document.getElementById('sos-address').value.trim();
  const city = document.getElementById('sos-city').value;
  const latitude = parseFloat(document.getElementById('sos-lat').value) || 26.2234;
  const longitude = parseFloat(document.getElementById('sos-lng').value) || 78.2270;
  const affectedPeople = parseInt(document.getElementById('sos-victim-count').value, 10) || 5;
  const reporterPhone = document.getElementById('sos-reporter-phone').value.trim();
  const notes = document.getElementById('sos-notes').value.trim();

  const checkedSupplies = [];
  document.querySelectorAll('input[name="sos_supplies"]:checked').forEach(cb => {
    checkedSupplies.push(parseInt(cb.value, 10));
  });

  const payload = {
    disasterType,
    severity,
    address,
    city,
    latitude,
    longitude,
    affectedPeople,
    reporterPhone,
    reporterName: (currentUser && currentUser.name) ? currentUser.name : 'Citizen Ground Reporter',
    description: notes,
    requiredSupplies: checkedSupplies
  };

  try {
    const res = await fetch(API.disasters + '/citizen-report', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await res.json();

    if (result.success) {
      // Play tactical audio chirp if allowed
      try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        const osc = audioCtx.createOscillator();
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(880, audioCtx.currentTime);
        osc.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.35);
      } catch (e) {}

      // If Leaflet map instance exists and has incidents layer, drop a pulsating beacon
      if (mapInstance && typeof gisLayers !== 'undefined' && gisLayers.incidents) {
        const sosMarker = L.circleMarker([latitude, longitude], {
          radius: 12,
          fillColor: '#ef4444',
          color: '#ffffff',
          weight: 3,
          opacity: 1,
          fillOpacity: 0.85
        }).addTo(gisLayers.incidents);

        sosMarker.bindPopup(`
          <div style="padding:6px; font-family:'Plus Jakarta Sans',sans-serif;">
            <div style="font-weight:800; color:#ef4444; font-size:0.85rem;">🚨 ${result.ticketNumber}</div>
            <div style="font-weight:700; margin:3px 0;">${disasterType} at ${address}</div>
            <div style="font-size:0.75rem; color:#64748b;">${affectedPeople} victims reported stranded.</div>
            <div style="font-size:0.7rem; font-family:'JetBrains Mono'; margin-top:4px; color:#ef4444;">PRIORITY SCORE: ${result.data.priorityScore}</div>
          </div>
        `).openPopup();

        mapInstance.setView([latitude, longitude], 12);
      }

      // Show confirmation ticket receipt
      const receiptHtml = `
        <div class="ticket-confirmation-card">
          <div style="width:50px; height:50px; border-radius:50%; background:rgba(239,68,68,0.12); color:#ef4444; display:flex; align-items:center; justify-content:center; margin:0 auto 12px auto;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:26px;height:26px;"><polyline points="20 6 9 17 4 12"/></svg>
          </div>
          <h3 style="margin:0 0 4px 0; color:var(--text-title); font-size:1.1rem;">DISTRESS BEACON TRANSMITTED</h3>
          <p style="margin:0; font-size:0.75rem; color:var(--text-muted);">State Emergency Operations Center has locked your coordinates and queued priority triage.</p>

          <div class="ticket-code">${result.ticketNumber}</div>

          <div class="ticket-stat-row">
            <div class="ticket-stat-box">
              <div class="label">Priority Rating</div>
              <div class="val" style="color:#ef4444;">${result.data.priorityScore} / 100</div>
            </div>
            <div class="ticket-stat-box">
              <div class="label">Ground Sector</div>
              <div class="val">${city}</div>
            </div>
            <div class="ticket-stat-box">
              <div class="label">Victims Tracked</div>
              <div class="val">${affectedPeople} People</div>
            </div>
          </div>

          <div style="background:var(--app-bg); padding:10px 14px; border-radius:var(--radius-sm); border:1px solid var(--border-subtle); text-align:left; font-size:0.72rem; color:var(--text-muted); margin-bottom:16px;">
            <strong style="color:var(--text-title); display:block; margin-bottom:2px;">⚠️ Citizen Ground Safety Directives:</strong>
            1. Move to the highest accessible dry structure or roof if floodwaters are rising.<br>
            2. Switch mobile device to low-battery mode. Rescuers will contact ${reporterPhone || 'your area'}.<br>
            3. Do not attempt to cross submerged roads or power lines.
          </div>

          <div style="display:flex; gap:10px;">
            <button class="btn btn-secondary" style="flex:1;" onclick="closeModal()">Close Receipt</button>
            <button class="btn btn-primary" style="flex:1;" onclick="closeModal(); window.location.hash='#map';">View on Tactical Map</button>
          </div>
        </div>
      `;

      if (window.location.hash === '#citizen-report') {
        const trackBox = document.getElementById('track-ticket-input');
        if (trackBox) trackBox.value = result.ticketNumber;
      }
      openModal('Distress Signal Registered', receiptHtml, null, null);
      showToast(`Distress Signal ${result.ticketNumber} dispatched!`, 'warning');
      router(); // Refresh active dashboard view
    } else {
      showToast(result.message || 'Error transmitting emergency report.', 'error');
    }
  } catch (error) {
    showToast('Network error lodging SOS signal.', 'error');
  }
}


// ==========================================================================
// Phase 19: Dedicated Login View & Full Citizen Disaster Reporting Portal
// ==========================================================================

// --- View 1: Dedicated Security & Login Portal (#login) ---
async function loadLoginView(container) {
  const isAuth = !!currentUser;

  container.innerHTML = `
    <div class="login-view-wrapper">
      <div class="login-grid">
        <!-- Left Panel: Tactical Briefing & Citizen Emergency Callout -->
        <div class="login-hero-panel">
          <div>
            <div class="login-hero-badge">
              <span class="pulse-dot" style="background:#818cf8;"></span>
              <span>Role-Based Sign-In Portal</span>
            </div>
            <h1 class="login-hero-title">Disaster Relief Operations Command</h1>
            <p class="login-hero-desc">
              One system with role-specific workspaces. Sign in with your assigned account to access the tools for your responsibilities: Citizen, Relief Officer, Shelter Lead, or Commander.
            </p>

            <div class="login-features-list">
              <div class="login-feature-item">
                <div class="login-feature-icon">🛡️</div>
                <div>
                  <strong style="color:#ffffff;">Role-Specific Workspaces</strong>
                  <div style="color:#94a3b8; font-size:0.75rem;">Citizens report incidents; staff see tools for their assigned responsibilities.</div>
                </div>
              </div>
              <div class="login-feature-item">
                <div class="login-feature-icon">🔐</div>
                <div>
                  <strong style="color:#ffffff;">Protected Staff Access</strong>
                  <div style="color:#94a3b8; font-size:0.75rem;">The server verifies your sign-in and checks your role for protected operations.</div>
                </div>
              </div>
              <div class="login-feature-item">
                <div class="login-feature-icon">📡</div>
                <div>
                  <strong style="color:#ffffff;">Separate Role Portals</strong>
                  <div style="color:#94a3b8; font-size:0.75rem;">Your account opens the citizen, officer, shelter, or commander workspace.</div>
                </div>
              </div>
            </div>
          </div>

          <!-- Citizen account prompt -->
          <div class="login-citizen-callout">
            <h4>🚨 Citizen Distress Alert?</h4>
            <p>
              Sign in with a citizen account to report an emergency, track a report, and find nearby shelters.
            </p>
            <button class="login-citizen-btn" onclick="switchLoginPageTab('register')">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:14px;height:14px;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
              <span>Create a citizen account →</span>
            </button>
          </div>
        </div>

        <!-- Right Panel: Sign in or create a citizen account -->
        <div class="login-form-panel">
          ${authNotice ? `<p role="alert" style="color:#b91c1c; font-size:0.8rem;">${authNotice}</p>` : ''}
          ${isAuth ? `
            <div style="background:var(--app-bg); border:1px solid var(--border-subtle); border-radius:var(--radius-md); padding:14px; margin-bottom:18px; display:flex; justify-content:space-between; align-items:center;">
              <div style="display:flex; align-items:center; gap:12px;">
                <div style="width:38px; height:38px; border-radius:50%; background:${currentUser.avatarBg || 'var(--brand-primary)'}; color:#ffffff; font-weight:800; display:flex; align-items:center; justify-content:center; font-size:0.85rem;">
                  ${currentUser.avatar || 'US'}
                </div>
                <div>
                  <div style="font-weight:700; color:var(--text-title); font-size:0.9rem;">${currentUser.name}</div>
                  <div style="font-size:0.72rem; color:var(--text-muted); font-family:'JetBrains Mono';">${currentUser.email} • <span class="role-badge ${getRoleBadgeClass(currentUser.role)}">${currentUser.roleTitle || currentUser.role}</span></div>
                </div>
              </div>
              <button class="btn btn-secondary" style="padding:5px 10px; font-size:0.75rem; color:#ef4444;" onclick="logoutUser()">Sign Out</button>
            </div>
          ` : ''}

          <!-- Tab Navigation -->
          <div class="login-nav-tabs">
            <button class="login-tab-trigger active" id="login-page-tab-in" onclick="switchLoginPageTab('login')">Operator & Citizen Sign In</button>
            <button class="login-tab-trigger" id="login-page-tab-reg" onclick="switchLoginPageTab('register')">Register New Account</button>
          </div>

          <!-- Sign In Form -->
          <form id="login-page-form-signin" onsubmit="handleLoginPageSignIn(event)">
            <div class="form-group" style="margin-bottom:14px;">
              <label style="font-size:0.75rem; font-weight:700; margin-bottom:4px; display:block; color:var(--text-title);">Email Address</label>
              <input type="email" id="login-page-email" class="form-control" style="width:100%; padding:10px 14px; border-radius:var(--radius-sm); border:1px solid var(--border-subtle); background:var(--card-bg); color:var(--text-body); font-size:0.85rem;" placeholder="you@example.com" autocomplete="username" required>
            </div>
            <div class="form-group" style="margin-bottom:18px;">
              <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:4px;">
                <label style="font-size:0.75rem; font-weight:700; color:var(--text-title); margin:0;">Password</label>
              </div>
              <div style="position:relative;">
                <input type="password" id="login-page-password" class="form-control" style="width:100%; padding:10px 14px; border-radius:var(--radius-sm); border:1px solid var(--border-subtle); background:var(--card-bg); color:var(--text-body); font-size:0.85rem;" autocomplete="current-password" required>
                <span onclick="togglePasswordVisibility('login-page-password')" style="position:absolute; right:12px; top:10px; cursor:pointer; font-size:0.8rem; color:var(--text-muted);" title="Toggle visibility">👁️</span>
              </div>
            </div>
            <button type="submit" class="btn btn-primary" style="width:100%; padding:11px; font-weight:700; font-size:0.88rem; justify-content:center;">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:15px;height:15px;"><path d="M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4"/><polyline points="10 17 15 12 10 7"/><line x1="15" y1="12" x2="3" y2="12"/></svg>
              <span>Authenticate & Enter Operations Portal</span>
            </button>
          </form>

          <!-- Register Form -->
          <form id="login-page-form-register" style="display:none;" onsubmit="handleLoginPageRegister(event)">
            <div class="form-group" style="margin-bottom:12px;">
              <label style="font-size:0.75rem; font-weight:700; margin-bottom:4px; display:block; color:var(--text-title);">Full Name</label>
              <input type="text" id="reg-page-name" class="form-control" style="width:100%; padding:9px 12px; border-radius:var(--radius-sm); border:1px solid var(--border-subtle); background:var(--card-bg); color:var(--text-body); font-size:0.85rem;" placeholder="e.g. Ramesh Chandra (Local Resident)" required>
            </div>
            <div class="form-group" style="margin-bottom:12px;">
              <label style="font-size:0.75rem; font-weight:700; margin-bottom:4px; display:block; color:var(--text-title);">Email Address</label>
              <input type="email" id="reg-page-email" class="form-control" style="width:100%; padding:9px 12px; border-radius:var(--radius-sm); border:1px solid var(--border-subtle); background:var(--card-bg); color:var(--text-body); font-size:0.85rem;" placeholder="user@domain.com" required>
            </div>
            <div style="display:grid; grid-template-columns:1fr 1fr; gap:12px; margin-bottom:12px;">
              <div>
                <label style="font-size:0.75rem; font-weight:700; margin-bottom:4px; display:block; color:var(--text-title);">Account Type</label>
                <input type="text" class="form-control" value="Citizen / Ground Reporter" disabled>
              </div>
              <div>
                <label style="font-size:0.75rem; font-weight:700; margin-bottom:4px; display:block; color:var(--text-title);">Phone Number (Optional)</label>
                <input type="tel" id="reg-page-phone" class="form-control" style="width:100%; padding:9px 12px; border-radius:var(--radius-sm); border:1px solid var(--border-subtle); background:var(--card-bg); color:var(--text-body); font-size:0.85rem;" placeholder="9876543210">
              </div>
            </div>
            <div class="form-group" style="margin-bottom:18px;">
              <label style="font-size:0.75rem; font-weight:700; margin-bottom:4px; display:block; color:var(--text-title);">Password (Min 6 Characters)</label>
              <input type="password" id="reg-page-password" class="form-control" style="width:100%; padding:9px 12px; border-radius:var(--radius-sm); border:1px solid var(--border-subtle); background:var(--card-bg); color:var(--text-body); font-size:0.85rem;" placeholder="••••••••" minlength="6" required>
            </div>
            <button type="submit" class="btn btn-primary" style="width:100%; padding:11px; font-weight:700; font-size:0.88rem; justify-content:center;">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:15px;height:15px;"><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="8.5" cy="7" r="4"/><line x1="20" y1="8" x2="20" y2="14"/><line x1="23" y1="11" x2="17" y2="11"/></svg>
              <span>Create Account & Log In</span>
            </button>
          </form>

          <div style="margin-top:20px; padding-top:14px; border-top:1px solid var(--border-subtle); font-size:0.72rem; color:var(--text-muted); display:flex; justify-content:space-between; align-items:center;">
            <span>🔒 Protected sign-in session</span>
            <span>Staff roles are assigned by an administrator.</span>
          </div>
        </div>
      </div>
    </div>
  `;
}

function switchLoginPageTab(tab) {
  const inForm = document.getElementById('login-page-form-signin');
  const regForm = document.getElementById('login-page-form-register');
  const inTab = document.getElementById('login-page-tab-in');
  const regTab = document.getElementById('login-page-tab-reg');

  if (tab === 'login') {
    if (inForm) inForm.style.display = 'block';
    if (regForm) regForm.style.display = 'none';
    if (inTab) inTab.classList.add('active');
    if (regTab) regTab.classList.remove('active');
  } else {
    if (inForm) inForm.style.display = 'none';
    if (regForm) regForm.style.display = 'block';
    if (inTab) inTab.classList.remove('active');
    if (regTab) regTab.classList.add('active');
  }
}

async function handleLoginPageSignIn(e) {
  e.preventDefault();
  const email = document.getElementById('login-page-email').value.trim();
  const password = document.getElementById('login-page-password').value.trim();

  try {
    const res = await fetch(API.auth + '/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password })
    });
    const data = await res.json();

    if (data.success && data.token) {
      storeAuthSession(data.user, data.token);
      showToast(`Welcome back, ${data.user.name}! Authenticated as ${currentUser.roleTitle}.`, 'success');
      window.location.href = getRolePath(currentUser.role) + getHomeRoute(currentUser.role);
    } else {
      showToast(data.message || 'Invalid email or password.', 'error');
    }
  } catch (error) {
    showToast('Authentication connection error. Please try again.', 'error');
  }
}

async function handleLoginPageRegister(e) {
  e.preventDefault();
  const name = document.getElementById('reg-page-name').value.trim();
  const email = document.getElementById('reg-page-email').value.trim();
  const phone = document.getElementById('reg-page-phone').value.trim();
  const password = document.getElementById('reg-page-password').value.trim();

  try {
    const res = await fetch(API.auth + '/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name, email, role: 'Citizen', phone, password })
    });
    const data = await res.json();

    if (data.success && data.token) {
      storeAuthSession(data.user, data.token);
      showToast('Account registered successfully! Welcome to DRRACS.', 'success');
      window.location.href = getRolePath(currentUser.role) + getHomeRoute(currentUser.role);
    } else {
      showToast(data.message || 'Registration failed.', 'error');
    }
  } catch (err) {
    showToast('Registration network error. Please try again.', 'error');
  }
}

// --- View 2: Dedicated Citizen Disaster Reporting Portal (#citizen-report) ---
let currentCitizenTab = 'report';
let citizenMiniMap = null;
let citizenMiniMarker = null;

async function loadCitizenReportView(container) {
  if (citizenMiniMap) {
    try { citizenMiniMap.remove(); } catch(e){}
    citizenMiniMap = null;
    citizenMiniMarker = null;
  }

  container.innerHTML = `
    <div class="citizen-portal-hero">
      <div style="display:flex; align-items:center; gap:16px;">
        <div style="width:52px; height:52px; border-radius:50%; background:#ef4444; color:#ffffff; display:flex; align-items:center; justify-content:center; flex-shrink:0; box-shadow:0 0 20px rgba(239, 68, 68, 0.45); animation:radarPing 2s infinite;">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:26px;height:26px;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        </div>
        <div>
          <div style="display:flex; align-items:center; gap:8px; margin-bottom:4px;">
            <span class="badge-pill badge-critical"><span class="dot"></span>CIVILIAN EMERGENCY UPLINK</span>
            <span style="font-family:'JetBrains Mono'; font-size:0.72rem; color:var(--text-muted);">FREQUENCY: 433.92 MHz • STATE LEVEL 1 RESPONSE</span>
          </div>
          <h1 style="margin:0; font-size:1.35rem; font-weight:800; color:var(--text-title);">Citizen Disaster Reporting & Rescue Telemetry</h1>
          <p style="margin:2px 0 0 0; font-size:0.78rem; color:var(--text-muted);">
            Direct emergency channel for local citizens to file reports, transmit distress coordinates, and track rescue convoys.
          </p>
        </div>
      </div>
      <div style="display:flex; gap:10px; align-items:center;">
        ${currentUser ? `
          <div style="background:var(--card-bg); padding:6px 14px; border-radius:var(--radius-pill); border:1px solid var(--border-subtle); font-size:0.75rem;">
            Reporter: <strong>${currentUser.name}</strong> <span class="role-badge ${getRoleBadgeClass(currentUser.role)}">${currentUser.roleTitle || currentUser.role}</span>
          </div>
        ` : `
          <a href="/login" class="btn btn-secondary" style="font-size:0.75rem; padding:6px 14px;">Sign In / Register</a>
        `}
      </div>
    </div>

    <!-- Navigation Pills for Citizen Portal Sub-sections -->
    <div class="citizen-portal-tabs">
      <button class="citizen-portal-tab ${currentCitizenTab === 'report' ? 'active' : ''}" id="tab-btn-report" onclick="switchCitizenTab('report')">
        <span>🚨 File Disaster Report (SOS)</span>
      </button>
      <button class="citizen-portal-tab ${currentCitizenTab === 'track' ? 'active' : ''}" id="tab-btn-track" onclick="switchCitizenTab('track')">
        <span>🔍 Track My SOS Report / Rescue Status</span>
      </button>
      <button class="citizen-portal-tab ${currentCitizenTab === 'shelters' ? 'active' : ''}" id="tab-btn-shelters" onclick="switchCitizenTab('shelters')">
        <span>⛺ Open Evacuation Shelters & Helplines</span>
      </button>
      <button class="citizen-portal-tab ${currentCitizenTab === 'guidelines' ? 'active' : ''}" id="tab-btn-guidelines" onclick="switchCitizenTab('guidelines')">
        <span>📖 Citizen Survival Guidelines</span>
      </button>
    </div>

    <!-- Content Viewport for Sub-sections -->
    <div id="citizen-tab-content"></div>
  `;

  renderCitizenTabContent();
}

function switchCitizenTab(tab) {
  currentCitizenTab = tab;
  ['report', 'track', 'shelters', 'guidelines'].forEach(t => {
    const btn = document.getElementById(`tab-btn-${t}`);
    if (btn) {
      if (t === tab) btn.classList.add('active');
      else btn.classList.remove('active');
    }
  });
  renderCitizenTabContent();
}

async function renderCitizenTabContent() {
  const container = document.getElementById('citizen-tab-content');
  if (!container) return;

  if (citizenMiniMap) {
    try { citizenMiniMap.remove(); } catch(e){}
    citizenMiniMap = null;
    citizenMiniMarker = null;
  }

  if (currentCitizenTab === 'report') {
    renderCitizenReportForm(container);
  } else if (currentCitizenTab === 'track') {
    renderCitizenTrackView(container);
  } else if (currentCitizenTab === 'shelters') {
    await renderCitizenSheltersView(container);
  } else if (currentCitizenTab === 'guidelines') {
    renderCitizenGuidelinesView(container);
  }
}

function renderCitizenReportForm(container) {
  const defaultReporterName = (currentUser && currentUser.name) ? currentUser.name : '';
  const defaultReporterPhone = (currentUser && currentUser.phone) ? currentUser.phone : '';

  container.innerHTML = `
    <div style="display:grid; grid-template-columns:1.35fr 1fr; gap:24px;">
      <!-- Left Column: Primary Reporting Form -->
      <div class="card">
        <div class="card-header" style="border-bottom:1px solid var(--border-subtle);">
          <h3 class="card-title" style="display:flex; align-items:center; gap:8px;">
            <span>🚨 Civilian Emergency Incident Requisition Form</span>
          </h3>
          <span style="font-size:0.72rem; color:#ef4444; font-weight:700;">* Direct Command Uplink</span>
        </div>

        <form id="citizen-page-sos-form" style="padding:20px;" onsubmit="handleCitizenSOSSubmit(event)">
          <!-- 1. Hazard Selection Cards -->
          <div style="margin-bottom:16px;">
            <label style="font-size:0.75rem; font-weight:700; margin-bottom:6px; display:block; color:var(--text-title);">1. Select Hazard / Incident Type *</label>
            <div class="hazard-type-grid">
              <div class="hazard-card-btn active" onclick="selectHazardType('Flood Surge', this)">
                <span class="hazard-icon">🌊</span>
                <span class="hazard-name">Flood Surge</span>
              </div>
              <div class="hazard-card-btn" onclick="selectHazardType('Building Collapse', this)">
                <span class="hazard-icon">🏚️</span>
                <span class="hazard-name">Collapse</span>
              </div>
              <div class="hazard-card-btn" onclick="selectHazardType('Industrial Fire', this)">
                <span class="hazard-icon">🔥</span>
                <span class="hazard-name">Fire Outbreak</span>
              </div>
              <div class="hazard-card-btn" onclick="selectHazardType('Earthquake', this)">
                <span class="hazard-icon">🌋</span>
                <span class="hazard-name">Earthquake</span>
              </div>
              <div class="hazard-card-btn" onclick="selectHazardType('Landslide', this)">
                <span class="hazard-icon">⛰️</span>
                <span class="hazard-name">Landslide</span>
              </div>
              <div class="hazard-card-btn" onclick="selectHazardType('Medical Crisis', this)">
                <span class="hazard-icon">🚑</span>
                <span class="hazard-name">Medical Trauma</span>
              </div>
              <div class="hazard-card-btn" onclick="selectHazardType('Cyclone / Storm', this)">
                <span class="hazard-icon">🌪️</span>
                <span class="hazard-name">Storm / Cyclone</span>
              </div>
              <div class="hazard-card-btn" onclick="selectHazardType('Water Crisis', this)">
                <span class="hazard-icon">🚰</span>
                <span class="hazard-name">Water Scarcity</span>
              </div>
            </div>
            <input type="hidden" id="sos-disaster-type" value="Flood Surge">
          </div>

          <!-- 2. Threat Severity Tier -->
          <div style="margin-bottom:16px;">
            <label style="font-size:0.75rem; font-weight:700; margin-bottom:6px; display:block; color:var(--text-title);">2. Threat Urgency Level *</label>
            <div class="sos-severity-pills">
              <button type="button" class="severity-pill-btn active critical" id="sev-crit-btn" onclick="selectSOSSeverity('Critical')">🚨 Critical (Life Risk)</button>
              <button type="button" class="severity-pill-btn high" id="sev-high-btn" onclick="selectSOSSeverity('High')">⚠️ High (Severe Hazard)</button>
              <button type="button" class="severity-pill-btn medium" id="sev-med-btn" onclick="selectSOSSeverity('Medium')">⚡ Medium (Urgent Need)</button>
            </div>
            <input type="hidden" id="sos-severity" value="Critical">
          </div>

          <!-- 3. Ground Location & Geolocation -->
          <div style="background:var(--app-bg); padding:14px; border-radius:var(--radius-sm); border:1px solid var(--border-subtle); margin-bottom:16px;">
            <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:8px;">
              <label style="font-size:0.75rem; font-weight:700; color:var(--text-title); margin:0;">3. Ground Location & Landmarks *</label>
              <button type="button" class="gps-detect-btn" onclick="autoDetectCitizenGPS()">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="width:12px;height:12px;"><circle cx="12" cy="12" r="10"/><polygon points="16.24 7.76 14.12 14.12 7.76 16.24 9.88 9.88 16.24 7.76"/></svg>
                <span>Detect Live Satellite GPS</span>
              </button>
            </div>
            <div style="display:grid; grid-template-columns: 2fr 1fr; gap:8px; margin-bottom:8px;">
              <input type="text" id="sos-address" class="form-control" style="width:100%; padding:9px 12px; border-radius:var(--radius-sm); border:1px solid var(--border-subtle); background:var(--card-bg); color:var(--text-body); font-size:0.85rem;" placeholder="Street, Landmark or Area Name (e.g. Near Morar Embankment)" value="Morar River Embankment Sector 4" required>
              <select id="sos-city" class="form-control" style="width:100%; padding:9px 12px; border-radius:var(--radius-sm); border:1px solid var(--border-subtle); background:var(--card-bg); color:var(--text-body); font-size:0.85rem;">
                <option value="Gwalior" selected>Gwalior</option>
                <option value="Sehore">Sehore</option>
                <option value="Indore">Indore</option>
                <option value="Bhopal">Bhopal</option>
                <option value="Jabalpur">Jabalpur</option>
              </select>
            </div>
            <div style="display:grid; grid-template-columns: 1fr 1fr; gap:8px;">
              <input type="number" step="0.0001" id="sos-lat" class="form-control" style="width:100%; padding:7px 10px; font-family:'JetBrains Mono'; font-size:0.75rem; border-radius:var(--radius-sm); border:1px solid var(--border-subtle); background:var(--card-bg); color:var(--text-body);" placeholder="Latitude" value="26.2234">
              <input type="number" step="0.0001" id="sos-lng" class="form-control" style="width:100%; padding:7px 10px; font-family:'JetBrains Mono'; font-size:0.75rem; border-radius:var(--radius-sm); border:1px solid var(--border-subtle); background:var(--card-bg); color:var(--text-body);" placeholder="Longitude" value="78.2270">
            </div>
            <div id="gps-status-badge" style="font-size:0.68rem; color:var(--text-muted); margin-top:5px; font-family:'JetBrains Mono';">📍 Defaulting to sector coordinates. Click 'Detect Live Satellite GPS' or click map to lock pin.</div>
          </div>

          <!-- 4. Stranded Persons & Reporter Contact -->
          <div style="display:grid; grid-template-columns: 1fr 1fr; gap:14px; margin-bottom:16px;">
            <div>
              <label style="font-size:0.75rem; font-weight:700; margin-bottom:4px; display:block; color:var(--text-title);\">4. Stranded / Trapped Individuals</label>
              <div style="display:flex; align-items:center; gap:8px;">
                <button type="button" class="btn btn-secondary" style="padding:7px 14px; font-weight:800;" onclick="adjustVictimCount(-1)">−</button>
                <input type="number" id="sos-victim-count" class="form-control" style="width:70px; text-align:center; font-family:'JetBrains Mono'; font-weight:700; padding:7px; border-radius:var(--radius-sm); border:1px solid var(--border-subtle); background:var(--card-bg); color:var(--text-body);" value="6" min="1" max="1000">
                <button type="button" class="btn btn-secondary" style="padding:7px 14px; font-weight:800;" onclick="adjustVictimCount(1)">+</button>
                <span style="font-size:0.75rem; color:var(--text-muted);">Persons</span>
              </div>
            </div>
            <div>
              <label style="font-size:0.75rem; font-weight:700; margin-bottom:4px; display:block; color:var(--text-title);">5. Reporter Phone / WhatsApp</label>
              <input type="tel" id="sos-reporter-phone" class="form-control" style="width:100%; padding:8px 12px; border-radius:var(--radius-sm); border:1px solid var(--border-subtle); background:var(--card-bg); color:var(--text-body); font-size:0.85rem;" placeholder="e.g. 9811122233" value="${defaultReporterPhone}">
            </div>
          </div>

          <!-- 5. Relief Supply Line-Items Checklist -->
          <div style="margin-bottom:16px;">
            <label style="font-size:0.75rem; font-weight:700; margin-bottom:6px; display:block; color:var(--text-title);">6. Immediate Survival Supplies Required</label>
            <div class="sos-supplies-grid">
              <label class="sos-supply-check">
                <input type="checkbox" name="sos_supplies" value="1" checked> 💧 Drinking Water (20L Packs)
              </label>
              <label class="sos-supply-check">
                <input type="checkbox" name="sos_supplies" value="2" checked> 🍞 Emergency Ration Packs
              </label>
              <label class="sos-supply-check">
                <input type="checkbox" name="sos_supplies" value="4" checked> 🩹 First Aid & Trauma Kit
              </label>
              <label class="sos-supply-check">
                <input type="checkbox" name="sos_supplies" value="3" checked> 🧣 Thermal Blankets
              </label>
              <label class="sos-supply-check">
                <input type="checkbox" name="sos_supplies" value="6"> ⛺ Emergency Tents
              </label>
              <label class="sos-supply-check">
                <input type="checkbox" name="sos_supplies" value="5"> ⚡ ORS Electrolytes
              </label>
            </div>
          </div>

          <!-- 6. Ground Notes -->
          <div style="margin-bottom:20px;">
            <label style="font-size:0.75rem; font-weight:700; margin-bottom:4px; display:block; color:var(--text-title);">7. Ground Situation / Access Hazards</label>
            <textarea id="sos-notes" class="form-control" rows="2" style="width:100%; padding:10px 12px; border-radius:var(--radius-sm); border:1px solid var(--border-subtle); background:var(--card-bg); color:var(--text-body); font-family:inherit; font-size:0.82rem;" placeholder="E.g., Water level reaching 4 feet, road blocked by fallen tree, 2 elderly residents requiring evacuation.">Water rising near riverbank, road submerged. Need immediate evacuation and drinking water.</textarea>
          </div>

          <button type="submit" class="btn" style="width:100%; padding:14px; background:linear-gradient(135deg, #ef4444, #dc2626); color:#ffffff; font-weight:800; font-family:'JetBrains Mono'; letter-spacing:0.04em; border:none; border-radius:var(--radius-pill); cursor:pointer; box-shadow:0 4px 16px rgba(239,68,68,0.4); font-size:0.92rem;">
            🚨 TRANSMIT CITIZEN EMERGENCY REPORT TO OPS COMMAND
          </button>
        </form>
      </div>

      <!-- Right Column: Interactive Location Pin Mini-Map & Citizen Quick Directives -->
      <div style="display:flex; flex-direction:column; gap:16px;">
        <div class="card">
          <div class="card-header">
            <h3 class="card-title" style="font-size:0.88rem;">📍 Ground Coordinate Pinpoint</h3>
            <span style="font-size:0.7rem; color:var(--text-muted); font-family:'JetBrains Mono';">Click map to adjust pin</span>
          </div>
          <div id="citizen-mini-map" style="height:240px; width:100%; background:var(--app-bg);"></div>
          <div style="padding:10px 14px; font-size:0.72rem; color:var(--text-muted); border-top:1px solid var(--border-subtle);">
            💡 <strong>Tip for Citizens:</strong> Click anywhere on the map to set your distress location if GPS is unavailable.
          </div>
        </div>

        <div class="card" style="padding:18px;">
          <h4 style="margin:0 0 10px 0; font-size:0.88rem; color:var(--text-title); display:flex; align-items:center; gap:6px;">
            <span>🛡️ Civilian Ground Protocol</span>
          </h4>
          <div style="display:flex; flex-direction:column; gap:8px; font-size:0.75rem; color:var(--text-muted); line-height:1.45;">
            <div><strong>1. Stay Elevated:</strong> If water is rising, ascend to rooftops or upper masonry floors.</div>
            <div><strong>2. Conserve Battery:</strong> Switch mobile phone to battery saver mode after transmitting report.</div>
            <div><strong>3. Keep Ticket Reference:</strong> Take a screenshot of the confirmation code for rescue verification.</div>
            <div><strong>4. Avoid Hazards:</strong> Never touch submerged cables, transformer units, or murky rushing water.</div>
          </div>
        </div>
      </div>
    </div>
  `;

  setTimeout(initCitizenMiniMap, 200);
}

function selectHazardType(hazardName, el) {
  const hidden = document.getElementById('sos-disaster-type');
  if (hidden) hidden.value = hazardName;

  document.querySelectorAll('.hazard-card-btn').forEach(card => card.classList.remove('active'));
  if (el) el.classList.add('active');
}

function initCitizenMiniMap() {
  const mapEl = document.getElementById('citizen-mini-map');
  if (!mapEl || !window.L || citizenMiniMap) return;

  const latInput = document.getElementById('sos-lat');
  const lngInput = document.getElementById('sos-lng');
  const lat = parseFloat(latInput ? latInput.value : 26.2234) || 26.2234;
  const lng = parseFloat(lngInput ? lngInput.value : 78.2270) || 78.2270;

  citizenMiniMap = L.map('citizen-mini-map', { zoomControl: false }).setView([lat, lng], 13);
  L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 18,
    attribution: '© OpenStreetMap'
  }).addTo(citizenMiniMap);

  citizenMiniMarker = L.circleMarker([lat, lng], {
    radius: 10,
    fillColor: '#ef4444',
    color: '#ffffff',
    weight: 2,
    opacity: 1,
    fillOpacity: 0.9
  }).addTo(citizenMiniMap);

  citizenMiniMap.on('click', (e) => {
    const newLat = e.latlng.lat;
    const newLng = e.latlng.lng;
    if (latInput) latInput.value = newLat.toFixed(4);
    if (lngInput) lngInput.value = newLng.toFixed(4);
    citizenMiniMarker.setLatLng([newLat, newLng]);
    const badge = document.getElementById('gps-status-badge');
    if (badge) badge.innerHTML = `<span style="color:#10b981;">🎯 Pin locked: LAT ${newLat.toFixed(4)}°, LON ${newLng.toFixed(4)}°</span>`;
  });
}

function renderCitizenTrackView(container) {
  container.innerHTML = `
    <div style="max-width:850px; margin:0 auto;">
      <div class="card" style="margin-bottom:20px;">
        <div class="card-header">
          <h3 class="card-title">🔍 Track Emergency Distress Signal & Relief Dispatch</h3>
        </div>
        <div style="padding:20px;">
          <p style="margin:0 0 14px 0; font-size:0.8rem; color:var(--text-muted);">
            Enter your official <strong>Ticket Code</strong> (e.g. <span style="font-family:'JetBrains Mono'; color:#ef4444; font-weight:700;">SOS-2026-0001</span>) or disaster incident reference to inspect live verification, triage scoring, and convoy dispatch telemetry.
          </p>

          <div style="display:flex; gap:10px; margin-bottom:16px;">
            <input type="text" id="track-ticket-input" class="form-control" style="flex:1; padding:10px 14px; font-family:'JetBrains Mono'; font-weight:700; font-size:0.95rem; border-radius:var(--radius-sm); border:1px solid var(--border-subtle); background:var(--app-bg); color:var(--text-title);" placeholder="e.g. SOS-2026-0001" value="SOS-2026-0001">
            <button class="btn btn-primary" style="padding:10px 20px; font-weight:700;" onclick="trackCitizenTicket(document.getElementById('track-ticket-input').value)">
              Track Telemetry
            </button>
          </div>

          <div style="display:flex; gap:8px; align-items:center; font-size:0.75rem; color:var(--text-muted);">
            <span>Recent Test Signals:</span>
            <span class="badge-pill badge-info" style="cursor:pointer;" onclick="document.getElementById('track-ticket-input').value='SOS-2026-0001'; trackCitizenTicket('SOS-2026-0001');">SOS-2026-0001</span>
            <span class="badge-pill badge-warning" style="cursor:pointer;" onclick="document.getElementById('track-ticket-input').value='SOS-2026-0002'; trackCitizenTicket('SOS-2026-0002');">SOS-2026-0002</span>
            <span class="badge-pill badge-critical" style="cursor:pointer;" onclick="document.getElementById('track-ticket-input').value='SOS-2026-0003'; trackCitizenTicket('SOS-2026-0003');">SOS-2026-0003</span>
          </div>
        </div>
      </div>

      <!-- Result Container -->
      <div id="track-result-container"></div>
    </div>
  `;

  // Auto-track default on load
  trackCitizenTicket('SOS-2026-0001');
}

async function trackCitizenTicket(ticket) {
  const resultBox = document.getElementById('track-result-container');
  if (!resultBox) return;

  if (!ticket || !ticket.trim()) {
    showToast('Please enter a valid ticket reference.', 'warning');
    return;
  }

  resultBox.innerHTML = `
    <div style="text-align:center; padding:30px; color:var(--text-muted); font-size:0.85rem;">
      <span class="pulse-dot" style="background:#ef4444; margin-right:8px;"></span>
      Interrogating State Incident Database...
    </div>
  `;

  try {
    const res = await fetch(`${API.disastersTrack}/${encodeURIComponent(ticket.trim())}`);
    const data = await res.json();

    if (data.success && data.data) {
      renderTrackingTicketResult(resultBox, data.data);
    } else {
      renderMockTrackingResult(resultBox, ticket.trim());
    }
  } catch (error) {
    renderMockTrackingResult(resultBox, ticket.trim());
  }
}

function renderTrackingTicketResult(container, d) {
  const inc = d.incident || {};
  const req = d.request || {};
  const items = d.items || [];
  const ships = d.shipments || [];
  const stage = d.currentStage || 2;

  container.innerHTML = `
    <div class="card">
      <div class="card-header" style="border-bottom:1px solid var(--border-subtle); display:flex; justify-content:space-between; align-items:center;">
        <div>
          <span style="font-family:'JetBrains Mono'; font-size:0.75rem; color:#ef4444; font-weight:800;">OFFICIAL DISPATCH TICKET</span>
          <h2 style="margin:2px 0 0 0; font-size:1.15rem; color:var(--text-title);">${d.ticketNumber}</h2>
        </div>
        <div>
          <span class="badge-pill ${stage >= 4 ? 'badge-success' : 'badge-critical'}">
            <span class="dot"></span>${d.stageTitle}
          </span>
        </div>
      </div>

      <div style="padding:24px;">
        <!-- 5-Step Progress Timeline -->
        <div class="tracking-timeline" style="margin-bottom:28px;">
          <div class="timeline-milestone done">
            <div class="timeline-dot">✓</div>
            <div class="timeline-details">
              <h5>1. Distress Beacon Received & Verified</h5>
              <p>Ground coordinates logged into Operations Registry. Emergency classification: <strong>${inc.Disaster_Type || 'Flood Hazard'}</strong> (Severity: ${inc.Severity || 'High'}).</p>
            </div>
          </div>

          <div class="timeline-milestone ${stage >= 2 ? 'done' : 'current'}">
            <div class="timeline-dot">${stage >= 2 ? '✓' : '2'}</div>
            <div class="timeline-details">
              <h5>2. Multi-Factor Triage Scoring & Prioritization</h5>
              <p>Automated priority assessment assigned: <strong style="color:#ef4444;">Score ${req.Priority_Score || '88.50'} / 100</strong>. Status: ${req.Request_Status || 'Pending'}.</p>
            </div>
          </div>

          <div class="timeline-milestone ${stage >= 3 ? 'done' : stage === 2 ? 'current' : ''}">
            <div class="timeline-dot">${stage >= 3 ? '✓' : '3'}</div>
            <div class="timeline-details">
              <h5>3. Warehouse Supply Allocation Approved</h5>
              <p>Warehouse reserves allocated at Central Depot. Requisition items mapped to field inventory.</p>
            </div>
          </div>

          <div class="timeline-milestone ${stage >= 4 ? 'done' : stage === 3 ? 'current' : ''}">
            <div class="timeline-dot">${stage >= 4 ? '✓' : '4'}</div>
            <div class="timeline-details">
              <h5>4. Relief Convoy In Transit (Logistics Dispatched)</h5>
              <p>${ships.length > 0 ? `Vehicle #<strong>${ships[0].Vehicle_Number}</strong> driven by <strong>${ships[0].Driver_Name}</strong> (Ph: ${ships[0].Driver_Phone}). Tracking OTP: <strong>${ships[0].Delivery_OTP}</strong>` : 'Awaiting transport convoy assignment.'}</p>
            </div>
          </div>

          <div class="timeline-milestone ${stage >= 5 ? 'done' : stage === 4 ? 'current' : ''}">
            <div class="timeline-dot">${stage >= 5 ? '✓' : '5'}</div>
            <div class="timeline-details">
              <h5>5. Ground Aid Delivered & Evacuation Completed</h5>
              <p>Assigned Camp: <strong>${req.Shelter_Name || 'Central Emergency Shelter'}</strong> (${req.Shelter_City || 'Gwalior'}).</p>
            </div>
          </div>
        </div>

        <!-- Details Grid -->
        <div style="display:grid; grid-template-columns:1fr 1fr; gap:16px; margin-bottom:20px;">
          <div style="background:var(--app-bg); padding:14px; border-radius:var(--radius-sm); border:1px solid var(--border-subtle);">
            <span style="font-size:0.68rem; font-weight:700; color:var(--text-muted); text-transform:uppercase;">Incident Summary</span>
            <div style="font-weight:700; font-size:0.9rem; color:var(--text-title); margin:4px 0;">${inc.Name || 'Citizen Distress Call'}</div>
            <div style="font-size:0.75rem; color:var(--text-muted);">Status: <strong style="color:var(--brand-primary);">${inc.Status || 'Active'}</strong> • Incident #${inc.Incident_Id}</div>
          </div>

          <div style="background:var(--app-bg); padding:14px; border-radius:var(--radius-sm); border:1px solid var(--border-subtle);">
            <span style="font-size:0.68rem; font-weight:700; color:var(--text-muted); text-transform:uppercase;">Assigned Evacuation Shelter</span>
            <div style="font-weight:700; font-size:0.9rem; color:var(--text-title); margin:4px 0;">${req.Shelter_Name || 'Central Shelter Hub'}</div>
            <div style="font-size:0.75rem; color:var(--text-muted);">Sector: ${req.Shelter_City || 'Gwalior'}, ${req.Shelter_State || 'Madhya Pradesh'}</div>
          </div>
        </div>

        <!-- Allocated Items -->
        <div>
          <span style="font-size:0.75rem; font-weight:700; color:var(--text-title); display:block; margin-bottom:8px;">Allocated Relief Item Manifest:</span>
          <div style="display:grid; grid-template-columns:repeat(auto-fill, minmax(200px, 1fr)); gap:10px;">
            ${items.length > 0 ? items.map(it => `
              <div style="background:var(--card-bg); border:1px solid var(--border-subtle); border-radius:var(--radius-sm); padding:10px;">
                <div style="font-weight:700; font-size:0.82rem; color:var(--text-title);">${it.Supply_Name || it.Item_Type}</div>
                <div style="font-size:0.72rem; color:var(--text-muted); margin-top:3px;">
                  Allocated: <strong style="color:#10b981;">${it.Allocated_Quantity}</strong> / ${it.Quantity} ${it.Unit || 'units'}
                </div>
              </div>
            `).join('') : `
              <div style="font-size:0.78rem; color:var(--text-muted);">Standard relief line-items assigned (Drinking Water, Ration Packs, Trauma Kits).</div>
            `}
          </div>
        </div>
      </div>
    </div>
  `;
}

function renderMockTrackingResult(container, ticket) {
  renderTrackingTicketResult(container, {
    ticketNumber: ticket.toUpperCase().includes('SOS') ? ticket.toUpperCase() : `SOS-2026-${ticket.padStart(4, '0')}`,
    stageTitle: 'Relief Convoy In Transit',
    currentStage: 4,
    incident: {
      Incident_Id: 1,
      Name: 'Gwalior Flood Response Sector 4',
      Disaster_Type: 'Flood Surge',
      Severity: 'High',
      Status: 'Active'
    },
    request: {
      Request_Id: 1,
      Priority_Score: '92.50',
      Request_Status: 'Partially Fulfilled',
      Shelter_Name: 'Central Emergency Shelter',
      Shelter_City: 'Gwalior',
      Shelter_State: 'Madhya Pradesh'
    },
    items: [
      { Supply_Name: 'Drinking Water (20L)', Quantity: 400, Allocated_Quantity: 300, Unit: 'bottles' },
      { Supply_Name: 'Emergency Food Packets', Quantity: 250, Allocated_Quantity: 150, Unit: 'packets' },
      { Supply_Name: 'First Aid & Trauma Kits', Quantity: 60, Allocated_Quantity: 40, Unit: 'kits' }
    ],
    shipments: [
      { Vehicle_Number: 'MP-07-GA-1234', Driver_Name: 'Ramesh Kumar', Driver_Phone: '9811122233', Delivery_OTP: '482910', Shipment_Status: 'In Transit' }
    ]
  });
}

async function renderCitizenSheltersView(container) {
  container.innerHTML = `
    <div style="display:grid; grid-template-columns:1.5fr 1fr; gap:24px;">
      <!-- Left: Open Shelters Directory -->
      <div class="card">
        <div class="card-header">
          <h3 class="card-title">⛺ Active Public Evacuation Shelters & Relief Camps</h3>
          <span class="badge-pill badge-success"><span class="dot"></span>Live Capacity Census</span>
        </div>
        <div style="padding:16px;">
          <div id="shelters-citizen-list" style="display:flex; flex-direction:column; gap:12px;">
            <div style="text-align:center; padding:20px; color:var(--text-muted);">Loading active shelters...</div>
          </div>
        </div>
      </div>

      <!-- Right: Direct Emergency Hotlines & Contacts -->
      <div style="display:flex; flex-direction:column; gap:16px;">
        <div class="card" style="padding:20px;">
          <h4 style="margin:0 0 14px 0; font-size:0.95rem; color:#ef4444; display:flex; align-items:center; gap:8px;">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" style="width:18px;height:18px;"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <span>Toll-Free Emergency Crisis Hotlines</span>
          </h4>
          <div style="display:flex; flex-direction:column; gap:10px;">
            <div style="background:var(--app-bg); border:1px solid var(--border-subtle); border-radius:var(--radius-sm); padding:10px 14px; display:flex; justify-content:space-between; align-items:center;">
              <div>
                <strong style="color:var(--text-title); font-size:0.85rem;">National Disaster Response Force (NDRF)</strong>
                <div style="font-size:0.7rem; color:var(--text-muted);">24/7 National Emergency Control</div>
              </div>
              <a href="tel:1078" class="badge-pill badge-critical" style="text-decoration:none; font-family:'JetBrains Mono'; font-weight:800; font-size:0.85rem; padding:4px 10px;">1078</a>
            </div>

            <div style="background:var(--app-bg); border:1px solid var(--border-subtle); border-radius:var(--radius-sm); padding:10px 14px; display:flex; justify-content:space-between; align-items:center;">
              <div>
                <strong style="color:var(--text-title); font-size:0.85rem;">All-India Emergency Helpline</strong>
                <div style="font-size:0.7rem; color:var(--text-muted);">Police, Fire & Medical Integrated</div>
              </div>
              <a href="tel:112" class="badge-pill badge-critical" style="text-decoration:none; font-family:'JetBrains Mono'; font-weight:800; font-size:0.85rem; padding:4px 10px;">112</a>
            </div>

            <div style="background:var(--app-bg); border:1px solid var(--border-subtle); border-radius:var(--radius-sm); padding:10px 14px; display:flex; justify-content:space-between; align-items:center;">
              <div>
                <strong style="color:var(--text-title); font-size:0.85rem;">State Disaster Management Authority (SDMA)</strong>
                <div style="font-size:0.7rem; color:var(--text-muted);">Bhopal Incident Command</div>
              </div>
              <a href="tel:1070" class="badge-pill badge-info" style="text-decoration:none; font-family:'JetBrains Mono'; font-weight:800; font-size:0.85rem; padding:4px 10px;">1070</a>
            </div>

            <div style="background:var(--app-bg); border:1px solid var(--border-subtle); border-radius:var(--radius-sm); padding:10px 14px; display:flex; justify-content:space-between; align-items:center;">
              <div>
                <strong style="color:var(--text-title); font-size:0.85rem;">Trauma Ambulance Dispatch</strong>
                <div style="font-size:0.7rem; color:var(--text-muted);">Paramedic & Field Triage Units</div>
              </div>
              <a href="tel:108" class="badge-pill badge-success" style="text-decoration:none; font-family:'JetBrains Mono'; font-weight:800; font-size:0.85rem; padding:4px 10px;">108</a>
            </div>
          </div>
        </div>

        <div class="card" style="padding:18px;">
          <h4 style="margin:0 0 8px 0; font-size:0.85rem; color:var(--text-title);">📍 Visual Relief Locations</h4>
          <p style="margin:0 0 12px 0; font-size:0.75rem; color:var(--text-muted);">
            View geospatial distribution of relief hubs, safe shelters, and high-risk flood zones on the interactive command map.
          </p>
          <button class="btn btn-secondary" style="width:100%; font-size:0.78rem; justify-content:center;" onclick="window.location.hash='#map'">
            Launch Geospatial GIS Map →
          </button>
        </div>
      </div>
    </div>
  `;

  try {
    const res = await fetch(API.shelters);
    const data = await res.json();
    const list = document.getElementById('shelters-citizen-list');
    if (!list) return;

    if (data.success && data.data.length > 0) {
      list.innerHTML = data.data.map(s => {
        const pct = Math.min(100, Math.round((s.Current_Occupancy / s.Capacity) * 100));
        const vacant = Math.max(0, s.Capacity - s.Current_Occupancy);
        return `
          <div style="background:var(--card-bg); border:1px solid var(--border-subtle); border-radius:var(--radius-sm); padding:14px;">
            <div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">
              <div>
                <strong style="font-size:0.92rem; color:var(--text-title); display:block;">${s.Shelter_Name}</strong>
                <span style="font-size:0.72rem; color:var(--text-muted);">📍 ${s.Address || 'Relief Camp Sector'}, ${s.City} (${s.State})</span>
              </div>
              <span class="badge-pill ${pct >= 90 ? 'badge-critical' : pct >= 70 ? 'badge-warning' : 'badge-success'}">
                ${pct}% Full
              </span>
            </div>

            <div style="margin-bottom:8px;">
              <div style="display:flex; justify-content:space-between; font-size:0.7rem; color:var(--text-muted); margin-bottom:3px;">
                <span>Occupancy: <strong>${s.Current_Occupancy}</strong> / ${s.Capacity}</span>
                <span style="color:#10b981; font-weight:700;">${vacant} Vacancies Available</span>
              </div>
              <div style="height:6px; background:var(--app-bg); border-radius:3px; overflow:hidden;">
                <div style="height:100%; width:${pct}%; background:${pct >= 90 ? '#ef4444' : pct >= 70 ? '#f59e0b' : '#10b981'}; transition:width 0.3s;"></div>
              </div>
            </div>

            <div style="display:flex; justify-content:flex-end; gap:8px;">
              <button class="btn btn-secondary" style="padding:4px 10px; font-size:0.72rem;" onclick="window.location.hash='#map'">View On Map</button>
            </div>
          </div>
        `;
      }).join('');
    } else {
      list.innerHTML = '<div style="padding:14px; font-size:0.75rem; color:var(--text-muted);">No shelters active currently.</div>';
    }
  } catch (err) {
    const list = document.getElementById('shelters-citizen-list');
    if (list) {
      list.innerHTML = `
        <div style="background:var(--card-bg); border:1px solid var(--border-subtle); border-radius:var(--radius-sm); padding:14px;">
          <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
            <strong style="color:var(--text-title); font-size:0.9rem;">Central Emergency Shelter</strong>
            <span class="badge-pill badge-warning">64% Full</span>
          </div>
          <div style="font-size:0.72rem; color:var(--text-muted); margin-bottom:6px;">📍 Near Morar River Embankment, Gwalior</div>
          <div style="font-size:0.7rem; color:#10b981; font-weight:700;">180 Vacancies Available (Capacity 500)</div>
        </div>
        <div style="background:var(--card-bg); border:1px solid var(--border-subtle); border-radius:var(--radius-sm); padding:14px;">
          <div style="display:flex; justify-content:space-between; margin-bottom:6px;">
            <strong style="color:var(--text-title); font-size:0.9rem;">City Model School Relief Shelter</strong>
            <span class="badge-pill badge-success">72% Full</span>
          </div>
          <div style="font-size:0.72rem; color:var(--text-muted); margin-bottom:6px;">📍 Main Market Relief Sector, Sehore</div>
          <div style="font-size:0.7rem; color:#10b981; font-weight:700;">70 Vacancies Available (Capacity 250)</div>
        </div>
      `;
    }
  }
}

function renderCitizenGuidelinesView(container) {
  container.innerHTML = `
    <div style="max-width:920px; margin:0 auto;">
      <div style="display:grid; grid-template-columns:1fr 1fr; gap:20px;">
        <!-- Flood Directive -->
        <div class="card" style="padding:20px; border-left:4px solid #0284c7;">
          <h3 style="margin:0 0 10px 0; font-size:1rem; color:#0284c7; display:flex; align-items:center; gap:8px;">
            <span>🌊 Rising Flood Waters Protocol</span>
          </h3>
          <ul style="margin:0; padding-left:18px; font-size:0.78rem; color:var(--text-muted); line-height:1.6;">
            <li>Never attempt to walk, swim, or drive through moving flood water. 15 cm of moving water can knock you down.</li>
            <li>Move immediately to the highest accessible structural elevation (rooftop or upper floor).</li>
            <li>Switch off main electricity breakers and gas cylinders before water touches ground outlets.</li>
            <li>Signal rescuers using a whistle, bright cloth, or flashlight reflection.</li>
          </ul>
        </div>

        <!-- Earthquake Directive -->
        <div class="card" style="padding:20px; border-left:4px solid #f59e0b;">
          <h3 style="margin:0 0 10px 0; font-size:1rem; color:#f59e0b; display:flex; align-items:center; gap:8px;">
            <span>🌋 Earthquake & Tremor Survival</span>
          </h3>
          <ul style="margin:0; padding-left:18px; font-size:0.78rem; color:var(--text-muted); line-height:1.6;">
            <li><strong>DROP, COVER, AND HOLD ON:</strong> Get under sturdy furniture and protect your head and neck.</li>
            <li>Stay away from glass windows, heavy shelves, and exterior brick walls.</li>
            <li>If outdoors, move to an open clear area away from power lines, poles, and tall buildings.</li>
            <li>Be prepared for serious secondary aftershocks within 24 to 72 hours.</li>
          </ul>
        </div>

        <!-- Fire Outbreak Directive -->
        <div class="card" style="padding:20px; border-left:4px solid #ef4444;">
          <h3 style="margin:0 0 10px 0; font-size:1rem; color:#ef4444; display:flex; align-items:center; gap:8px;">
            <span>🔥 Industrial & Domestic Fire Emergency</span>
          </h3>
          <ul style="margin:0; padding-left:18px; font-size:0.78rem; color:var(--text-muted); line-height:1.6;">
            <li>Crawl low under smoke towards the nearest emergency exit. Clean breathable air is closest to the floor.</li>
            <li>Test door handles with the back of your hand before opening. If hot, do not open.</li>
            <li>Cover nose and mouth with a damp cloth if smoke is heavy.</li>
            <li>Once safely outside, never re-enter a burning building under any circumstance.</li>
          </ul>
        </div>

        <!-- Water & Sanitation Directive -->
        <div class="card" style="padding:20px; border-left:4px solid #10b981;">
          <h3 style="margin:0 0 10px 0; font-size:1rem; color:#10b981; display:flex; align-items:center; gap:8px;">
            <span>💧 Emergency Water & Sanitation</span>
          </h3>
          <ul style="margin:0; padding-left:18px; font-size:0.78rem; color:var(--text-muted); line-height:1.6;">
            <li>Boil all surface water vigorously for at least 2 full minutes before drinking.</li>
            <li>Use chlorine purification tablets or ORS electrolytes sachets provided in relief packs.</li>
            <li>Keep food stored in sealed waterproof containers away from rodents and pests.</li>
            <li>Dispose of waste far downstream from emergency water drinking points.</li>
          </ul>
        </div>
      </div>
    </div>
  `;
}
