/* ==========================================================================
   HAIRAH MEN'S WORLD - SPA APPLICATION LOGIC (API CONNECTED)
   ========================================================================== */

// --- Global Catalog State (loaded from backend) ---
let PRODUCT_CATALOG = [];

// --- Application State ---
let state = {
  theme: localStorage.getItem('HAIRAH_theme') || 'dark',
  currentUser: null,  // Checked asynchronously on load
  cart: JSON.parse(localStorage.getItem('HAIRAH_cart')) || [],
  wishlist: [],       // Synchronized with database on login
  orders: [],         // Loaded from database
  users: [],          // Admin only: Customer database
  reviews: {},        // Loaded dynamically per product
  appliedCoupon: null, // Active discount: { code, discountType, value }
  coupons: [],        // Admin only: Active coupon records
  pdpHistory: [],     // Visited products stack inside product modal sessions
  
  currentView: "home",
  activeFilter: "all",
  searchQuery: "",
  sortOption: "default",
  selectedProduct: null,
  profileActiveTab: "orders",
  adminActiveTab: "stats",
  merchantConfig: null,
  aiPredictions: null,
  posCart: [],
  posSearchQuery: "",
  posCustomer: { name: "", phone: "", email: "" },
  posAppliedCoupon: null,
  posPaymentMethod: "Cash",
  posIncludeGST: true,
  posFullscreen: false,
  adminOrderSearchQuery: "",
  checkoutFormData: { name: "", email: "", address: "", city: "", zip: "", phone: "" }
};

// --- DOM References ---
let appContainer, cartDrawer, cartDrawerBackdrop, cartBadge, wishlistBadge, cartItemsContainer, cartSubtotal;
let pdpModal, pdpContentContainer, toastContainer, headerAuthBtn, mobileMenuToggle, mainNavWrapper;

// --- API Request Helper ---
async function apiCall(endpoint, method = 'GET', body = null) {
  let url = endpoint;
  if (method === 'GET') {
    const separator = url.includes('?') ? '&' : '?';
    url = `${url}${separator}_t=${Date.now()}`;
  }

  const options = {
    method,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-cache',
      'Pragma': 'no-cache'
    },
    credentials: 'include' // Crucial for session cookies
  };
  
  if (body) {
    options.body = JSON.stringify(body);
  }
  
  try {
    const response = await fetch(url, options);
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || 'API call failed');
    }
    return result;
  } catch (error) {
    console.error(`API Error on ${endpoint}:`, error.message);
    throw error;
  }
}

// --- Initialize App ---
document.addEventListener("DOMContentLoaded", async () => {
  // DOM Cache
  appContainer = document.getElementById("app-container");
  cartDrawer = document.getElementById("cart-drawer");
  cartDrawerBackdrop = document.getElementById("cart-drawer-backdrop");
  cartBadge = document.getElementById("cart-badge");
  wishlistBadge = document.getElementById("wishlist-badge");
  cartItemsContainer = document.getElementById("cart-items-container");
  cartSubtotal = document.getElementById("cart-subtotal");
  pdpModal = document.getElementById("pdp-modal");
  pdpContentContainer = document.getElementById("pdp-content-container");
  toastContainer = document.getElementById("toast-container");
  headerAuthBtn = document.getElementById("header-auth-btn");
  mobileMenuToggle = document.getElementById("mobile-menu-toggle");
  mainNavWrapper = document.getElementById("main-nav-wrapper");

  // Router Setup
  setupRouter();
  
  // Apply Saved Theme
  document.documentElement.setAttribute('data-theme', state.theme);
  updateThemeIcons();

  // Navigation Links Binding
  document.getElementById("nav-logo").addEventListener("click", (e) => {
    e.preventDefault();
    navigate("home");
  });
  
  document.getElementById("nav-links").querySelectorAll("a").forEach(link => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const page = link.getAttribute("data-page");
      state.activeFilter = "all"; // Reset filters on navigation
      navigate(page);
      closeMobileMenu();
    });
  });

  // Mobile Bottom Tab Bar Navigation Binding
  document.querySelectorAll(".mobile-bottom-nav .mobile-nav-item[data-page]").forEach(link => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const page = link.getAttribute("data-page");
      state.activeFilter = "all"; // Reset filters on navigation
      navigate(page);
    });
  });

  // Footer Navigation Link Binding
  document.querySelectorAll("footer .page-link").forEach(link => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const page = link.getAttribute("data-page");
      const filter = link.getAttribute("data-filter");
      state.activeFilter = filter || "all";
      navigate(page);
    });
  });

  // Theme Toggle Button Event
  document.getElementById("theme-toggle-btn").addEventListener("click", toggleTheme);
  
  // Cart Drawer Toggles
  document.getElementById("cart-toggle-btn").addEventListener("click", openCartDrawer);
  document.getElementById("cart-close-btn").addEventListener("click", closeCartDrawer);
  cartDrawerBackdrop.addEventListener("click", closeCartDrawer);
  
  // Handle Esc key exit from native browser fullscreen
  document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement && state.posFullscreen) {
      state.posFullscreen = false;
      document.body.classList.remove("pos-fullscreen-mode-active");
      renderCurrentView();
    }
  });
  document.addEventListener("webkitfullscreenchange", () => {
    if (!document.webkitFullscreenElement && state.posFullscreen) {
      state.posFullscreen = false;
      document.body.classList.remove("pos-fullscreen-mode-active");
      renderCurrentView();
    }
  });

  // Global Keyboard Shortcuts (Ctrl+K / Cmd+K for search)
  document.addEventListener("keydown", (e) => {
    if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') {
      e.preventDefault();
      const catalogSearch = document.getElementById("catalog-search");
      const posSearch = document.getElementById("pos-product-search");
      const adminSearch = document.getElementById("admin-order-search-box");
      if (catalogSearch && state.currentView === 'shop') {
        catalogSearch.focus();
        catalogSearch.select();
      } else if (posSearch && state.currentView === 'admin' && state.adminActiveTab === 'pos') {
        posSearch.focus();
        posSearch.select();
      } else if (adminSearch && state.currentView === 'admin' && state.adminActiveTab === 'stats') {
        adminSearch.focus();
        adminSearch.select();
      } else {
        navigate('shop');
        setTimeout(() => {
          const searchInput = document.getElementById("catalog-search");
          if (searchInput) searchInput.focus();
        }, 150);
      }
    }
  });
  
  // PDP Close Modal
  document.getElementById("pdp-close-btn").addEventListener("click", closePDPModal);
  
  // Checkout drawer button
  document.getElementById("checkout-btn").addEventListener("click", () => {
    closeCartDrawer();
    navigate("checkout");
  });

  // Auth Button
  headerAuthBtn.addEventListener("click", () => {
    if (state.currentUser) {
      handleLogout();
    } else {
      navigate("login");
    }
  });

  // Mobile Menu Button Toggle
  mobileMenuToggle.addEventListener("click", () => {
    mainNavWrapper.classList.toggle("active");
    const icon = mobileMenuToggle.querySelector("i");
    if (mainNavWrapper.classList.contains("active")) {
      icon.className = "fas fa-times";
    } else {
      icon.className = "fas fa-bars";
    }
  });

  // 1. Initial State Syncing from Backend API
  await syncSessionAndDatabase();

  // Update layout components
  updateCartBadge();
  renderCurrentView();
});

// --- Sync Session Data on Load/Change ---
async function syncSessionAndDatabase() {
  try {
    // A. Fetch catalog, merchant config, and auth status in parallel
    const [catalog, merchantConfig, authData] = await Promise.all([
      apiCall('/api/products'),
      apiCall('/api/payments/merchant-config'),
      apiCall('/api/auth/me')
    ]);
    
    PRODUCT_CATALOG = catalog;
    state.merchantConfig = merchantConfig;
    state.currentUser = authData.user;
    
    if (state.currentUser) {
      if (state.currentUser.role === 'customer') {
        // Fetch customer specific details in parallel
        const [wishlist, ordersData] = await Promise.all([
          apiCall('/api/wishlist'),
          apiCall('/api/orders')
        ]);
        state.wishlist = wishlist;
        state.orders = ordersData.orders;
      }
      else if (state.currentUser.role === 'admin') {
        // Fetch admin specific dashboard data in parallel
        const [adminData, aiPredictions, coupons] = await Promise.all([
          apiCall('/api/orders'),
          apiCall('/api/admin/ai-predictions').catch(() => null),
          apiCall('/api/admin/coupons').catch(() => [])
        ]);
        state.orders = adminData.orders;
        state.users = adminData.users;
        state.aiPredictions = aiPredictions;
        state.coupons = coupons;
      }
    } else {
      state.wishlist = [];
      state.orders = [];
      state.users = [];
      state.aiPredictions = null;
      state.coupons = [];
    }
    
    updateWishlistBadge();
    updateAuthHeaderButton();
  } catch (error) {
    showToast("Server synchronization failed.");
  }
}

// --- Theme Management ---
function toggleTheme() {
  state.theme = state.theme === 'dark' ? 'light' : 'dark';
  document.documentElement.setAttribute('data-theme', state.theme);
  localStorage.setItem('HAIRAH_theme', state.theme);
  updateThemeIcons();
  showToast(`Switched to ${state.theme} mode.`);
}

function updateThemeIcons() {
  const sunIcon = document.getElementById("theme-sun-icon");
  const moonIcon = document.getElementById("theme-moon-icon");
  if (state.theme === 'dark') {
    sunIcon.style.display = "block";
    moonIcon.style.display = "none";
  } else {
    sunIcon.style.display = "none";
    moonIcon.style.display = "block";
  }
}

// --- Mobile Navigation ---
function closeMobileMenu() {
  if (mainNavWrapper.classList.contains("active")) {
    mainNavWrapper.classList.remove("active");
    mobileMenuToggle.querySelector("i").className = "fas fa-bars";
  }
}

// --- Auth Utilities ---
function updateAuthHeaderButton() {
  if (state.currentUser) {
    if (state.currentUser.role === 'admin') {
      headerAuthBtn.innerText = "Admin Exit";
      document.getElementById("nav-profile-link").innerText = "Dashboard";
      document.getElementById("nav-profile-link").setAttribute("data-page", "admin");
    } else {
      headerAuthBtn.innerText = "Sign Out";
      document.getElementById("nav-profile-link").innerText = "My Profile";
      document.getElementById("nav-profile-link").setAttribute("data-page", "profile");
    }
  } else {
    headerAuthBtn.innerText = "Sign In";
    document.getElementById("nav-profile-link").innerText = "Profile";
    document.getElementById("nav-profile-link").setAttribute("data-page", "profile");
  }
}

async function handleLogout() {
  try {
    await apiCall('/api/auth/logout', 'POST');
    state.currentUser = null;
    state.wishlist = [];
    state.orders = [];
    state.users = [];
    
    updateAuthHeaderButton();
    updateWishlistBadge();
    showToast("Logged out successfully.");
    navigate("home");
  } catch (error) {
    showToast("Logout failed.");
  }
}

// --- Routing System ---
function setupRouter() {
  window.addEventListener("popstate", (e) => {
    if (e.state && e.state.view) {
      state.currentView = e.state.view;
      renderCurrentView();
    }
  });
}

window.navigate = function(view) {
  state.currentView = view;
  window.history.pushState({ view }, "", `#${view}`);
  
  // Close any open drawers or modals to ensure scrolling is never stuck
  closeCartDrawer();
  closePDPModal();
  if (window.closeMockRzpModal) window.closeMockRzpModal();
  if (window.closeAdminOrderDetailModal) window.closeAdminOrderDetailModal();
  state.posFullscreen = false;
  document.body.classList.remove("pos-fullscreen-mode-active");
  if (document.fullscreenElement) {
    document.exitFullscreen().catch(err => console.log("Exit fullscreen:", err));
  }
  document.body.style.overflow = ""; // Hard reset scroll lock
  
  // Update nav menu active styles
  document.getElementById("nav-links").querySelectorAll("li").forEach(li => {
    const a = li.querySelector("a");
    if (a) {
      const page = a.getAttribute("data-page");
      if (page === view || (view === "admin" && page === "profile") || (view === "profile" && page === "profile")) {
        li.classList.add("active");
      } else {
        li.classList.remove("active");
      }
    }
  });

  // Update mobile bottom nav active styles
  document.querySelectorAll(".mobile-bottom-nav .mobile-nav-item").forEach(item => {
    const page = item.getAttribute("data-page");
    if (page === view || (view === "admin" && page === "profile") || (view === "profile" && page === "profile")) {
      item.classList.add("active");
    } else {
      item.classList.remove("active");
    }
  });
  
  renderCurrentView();
  window.scrollTo({ top: 0, behavior: 'smooth' });
};

async function renderCurrentView() {
  closePDPModal();
  
  appContainer.innerHTML = `
    <div class="loading-spinner-container">
      <div class="spinner"></div>
      <p style="margin-top: 1rem; font-family: var(--font-display); letter-spacing: 0.1em;">FETCHING WARDROBE...</p>
    </div>
  `;
  appContainer.className = "fade-in";
  
  if (state.currentView === "home") {
    appContainer.innerHTML = getHomeTemplate();
  } else if (state.currentView === "shop") {
    appContainer.innerHTML = getShopTemplate();
  } else if (state.currentView === "wishlist") {
    appContainer.innerHTML = getWishlistTemplate();
  } else if (state.currentView === "checkout") {
    appContainer.innerHTML = getCheckoutTemplate();
    setupCheckoutValidationListeners();
  } else if (state.currentView === "login") {
    appContainer.innerHTML = getLoginTemplate();
  } else if (state.currentView === "profile") {
    if (!state.currentUser) {
      setTimeout(() => navigate("login"), 0);
    } else if (state.currentUser.role === 'admin') {
      setTimeout(() => navigate("admin"), 0);
    } else {
      appContainer.innerHTML = getProfileTemplate();
    }
  } else if (state.currentView === "admin") {
    if (!state.currentUser || state.currentUser.role !== 'admin') {
      setTimeout(() => navigate("home"), 0);
    } else {
      if (state.posFullscreen && state.adminActiveTab === 'pos') {
        appContainer.innerHTML = `
          <div class="pos-fullscreen-terminal-overlay">
            <div style="max-width: 1400px; margin: 0 auto; padding: 2rem;">
              ${getPOSTemplate()}
            </div>
          </div>
        `;
      } else {
        appContainer.innerHTML = getAdminTemplate();
      }
    }
  }
}

// --- View Templates ---

// 1. Home Template
function getHomeTemplate() {
  return `
    <section class="hero" style="background-image: url('assets/hero_menswear.jpg');">
      <div class="hero-overlay"></div>
      <div class="hero-content">
        <div class="hero-tagline">Premium Ready-made Selection</div>
        <h1 class="hero-title">Ready-to-Wear Elegance.<br><span>Modern Silhouette.</span></h1>
        <p class="hero-desc">Explore HAIRAH Men's World—where minimalism meets precision ready-to-wear clothing. Crafting elegant wardrobes featuring luxury shirts, pleated pants, and Pima cotton knitwear.</p>
        <div class="hero-actions">
          <button class="btn btn-primary" onclick="navigate('shop')">Shop Collections</button>
        </div>
      </div>
    </section>

    <div class="section-header">
      <div>
        <h2 class="section-title">Shop by Collection</h2>
        <div class="section-subtitle">Meticulously sourced fabrics, tailored details.</div>
      </div>
      <button class="btn btn-secondary" onclick="navigate('shop')">Explore Catalog</button>
    </div>

    <div class="collections-grid">
      <div class="collection-card" onclick="filterAndShop('shirts')">
        <img src="assets/shirt_white.jpg" alt="HAIRAH Luxury Ready-made Mens Shirts Collection" class="collection-img">
        <div class="collection-overlay">
          <h3>Shirts</h3>
          <p>Two-ply cotton, structured collars, and elegant French cuffs.</p>
        </div>
      </div>

      <div class="collection-card" onclick="filterAndShop('pants')">
        <img src="assets/pants_chinos.jpg" alt="HAIRAH Ready-made Trousers and Chinos Collection" class="collection-img">
        <div class="collection-overlay">
          <h3>Pants</h3>
          <p>Double-pleated chinos and fine tropical wool trousers for perfect drape.</p>
        </div>
      </div>

      <div class="collection-card" onclick="filterAndShop('tshirts')">
        <img src="https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&q=80&w=600" alt="HAIRAH Pima Cotton T-Shirts Collection" class="collection-img">
        <div class="collection-overlay">
          <h3>T-Shirts</h3>
          <p>Mulberry silk and long-staple Pima cotton knits with natural luster.</p>
        </div>
      </div>
    </div>

    <!-- HAIRAH Club Instagram Invitation -->
    <div class="club-invite-section" style="max-width: var(--max-width); margin: 4rem auto 1rem auto; padding: 0 1.5rem;">
      <div class="glass-panel" style="padding: 3.5rem 2rem; text-align: center; border-radius: 8px; background-color: var(--color-bg-card); border: 1px solid var(--color-border); box-shadow: 0 10px 30px rgba(0,0,0,0.3); animation: fadeIn 0.4s ease-out;">
        <span style="font-family: var(--font-display); font-size: 0.75rem; text-transform: uppercase; letter-spacing: 0.2em; color: var(--color-accent-gold); font-weight: 600; display: block; margin-bottom: 0.8rem;">Instagram Journal</span>
        <h3 style="font-family: var(--font-display); font-size: 1.8rem; font-weight: 300; margin-bottom: 1rem; letter-spacing: 0.05em; color: var(--color-text-main);">Join the HAIRAH Circle</h3>
        <p style="color: var(--color-text-muted); font-size: 0.85rem; max-width: 600px; margin: 0 auto 2rem auto; line-height: 1.6;">
          Follow our official Instagram journal to receive real-time updates on limited textile releases, private collection previews, and customer bespoke styling features.
        </p>
        
        <div style="display: flex; justify-content: center; margin-top: 1rem;">
          <a href="https://www.instagram.com/hairah_mens_world?igsh=MW05MHhlZDNpaHMyZg==" target="_blank" rel="noopener noreferrer" class="btn btn-primary" style="padding: 1rem 2.5rem; font-size: 0.85rem; border-radius: 4px; display: inline-flex; align-items: center; gap: 0.6rem; text-decoration: none; font-weight: 600; letter-spacing: 0.05em;">
            <i class="fab fa-instagram" style="font-size: 1.1rem;"></i> Join the Instagram Club
          </a>
        </div>
      </div>
    </div>
  `;
}

// 2. Shop Template
function getShopTemplate() {
  let filtered = PRODUCT_CATALOG.filter(p => {
    const matchesFilter = state.activeFilter === "all" || p.category === state.activeFilter;
    const matchesSearch = p.title.toLowerCase().includes(state.searchQuery.toLowerCase()) || 
                          p.description.toLowerCase().includes(state.searchQuery.toLowerCase());
    return matchesFilter && matchesSearch;
  });

  if (state.sortOption === "price-asc") {
    filtered.sort((a, b) => a.price - b.price);
  } else if (state.sortOption === "price-desc") {
    filtered.sort((a, b) => b.price - a.price);
  } else if (state.sortOption === "name-asc") {
    filtered.sort((a, b) => a.title.localeCompare(b.title));
  }

  const cardsHtml = filtered.map(p => {
    const isSaved = state.wishlist.includes(p.id);
    
    // Star rating placeholder while loading individual products dynamically
    const starHtml = `<i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star"></i><i class="fas fa-star"></i>`;

    return `
      <div class="product-card" onclick="openPDP('${p.id}')">
        <button class="product-wishlist-btn ${isSaved ? 'active' : ''}" 
                onclick="event.stopPropagation(); toggleWishlist('${p.id}')" 
                title="${isSaved ? 'Remove from wishlist' : 'Save to wishlist'}">
          <i class="${isSaved ? 'fas' : 'far'} fa-heart"></i>
        </button>

        <div class="product-img-wrapper">
          <img src="${p.image}" alt="${p.title}" class="product-card-img">
          ${!p.inStock ? `<span class="out-of-stock-badge">Out of Stock</span>` : ''}
        </div>
        
        <div class="product-info">
          <div class="product-meta-row">
            <span class="product-cat">${p.categoryLabel}</span>
            <span class="product-price">₹${p.price.toFixed(2)}</span>
          </div>
          <h3 class="product-title">${p.title}</h3>
          ${p.isBestseller ? `
            <div style="margin-top: 0.45rem; display: inline-flex; align-items: center; gap: 0.3rem; background: rgba(212, 175, 55, 0.08); color: var(--color-accent-gold); font-size: 0.65rem; font-weight: 700; text-transform: uppercase; letter-spacing: 0.05em; padding: 0.2rem 0.5rem; border-radius: 3px; border: 1px solid rgba(212, 175, 55, 0.25);">
              <i class="fas fa-bolt" style="font-size:0.6rem;"></i> Bestseller
            </div>
          ` : ''}
          
          <div class="product-card-footer">
            <div class="rating-stars">${starHtml}</div>
            <span class="product-card-details-link">Details <i class="fas fa-arrow-right"></i></span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="catalog-layout">
      <div class="filter-bar">
        <div class="filter-tabs">
          <span class="filter-tab ${state.activeFilter === 'all' ? 'active' : ''}" onclick="setFilter('all')">All Attire</span>
          <span class="filter-tab ${state.activeFilter === 'shirts' ? 'active' : ''}" onclick="setFilter('shirts')">Shirts</span>
          <span class="filter-tab ${state.activeFilter === 'pants' ? 'active' : ''}" onclick="setFilter('pants')">Pants</span>
          <span class="filter-tab ${state.activeFilter === 'tshirts' ? 'active' : ''}" onclick="setFilter('tshirts')">T-Shirts</span>
        </div>
        
        <div style="display: flex; gap: 1.5rem; align-items: center; max-width: 450px; width: 100%; flex-wrap: wrap;">
          <div class="search-input-wrapper" style="flex-grow: 1; min-width: 200px;">
            <input type="text" class="search-input" id="catalog-search" placeholder="Search catalog..." value="${state.searchQuery}" onkeyup="handleCatalogSearch(event)">
            <button class="search-btn" onclick="triggerCatalogSearch()"><i class="fas fa-search"></i></button>
          </div>
          
          <select class="catalog-sort-select" onchange="handleCatalogSort(event)">
            <option value="default" ${state.sortOption === 'default' ? 'selected' : ''}>Sort By</option>
            <option value="price-asc" ${state.sortOption === 'price-asc' ? 'selected' : ''}>Price: Low to High</option>
            <option value="price-desc" ${state.sortOption === 'price-desc' ? 'selected' : ''}>Price: High to Low</option>
            <option value="name-asc" ${state.sortOption === 'name-asc' ? 'selected' : ''}>Alphabetical</option>
          </select>
        </div>
      </div>

      ${filtered.length === 0 ? `
        <div style="text-align: center; padding: 6rem 0; color: var(--color-text-muted);">
          <i class="fas fa-search" style="font-size: 3.5rem; margin-bottom: 2rem; color: var(--color-accent-gold);"></i>
          <p style="font-family: var(--font-display); font-size: 1.2rem; text-transform: uppercase;">No wardrobe items matched</p>
          <p style="font-size:0.9rem; margin-top:0.5rem;">Try refining your keywords or changing active filters.</p>
        </div>
      ` : `
        <div class="products-grid">
          ${cardsHtml}
        </div>
      `}

      <!-- Sartorial Trust Ribbon at bottom -->
      <div class="feature-ribbon-grid" style="margin-top: 4.5rem; display:grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1.5rem;">
        <div class="glass-panel" style="padding: 1.5rem; display: flex; gap: 1rem; align-items: center;">
          <i class="fas fa-award" style="font-size: 1.8rem; color: var(--color-accent-gold);"></i>
          <div>
            <h4 style="margin: 0; font-size: 0.85rem; font-weight: 600; text-transform: uppercase;">100% Ready-made Quality</h4>
            <p style="margin: 0.2rem 0 0 0; font-size: 0.75rem; color: var(--color-text-muted);">Crafted with 2-ply cotton & fine drapes.</p>
          </div>
        </div>
        <div class="glass-panel" style="padding: 1.5rem; display: flex; gap: 1rem; align-items: center;">
          <i class="fas fa-truck-fast" style="font-size: 1.8rem; color: var(--color-accent-gold);"></i>
          <div>
            <h4 style="margin: 0; font-size: 0.85rem; font-weight: 600; text-transform: uppercase;">Express India Delivery</h4>
            <p style="margin: 0.2rem 0 0 0; font-size: 0.75rem; color: var(--color-text-muted);">Insured dispatch with real-time tracking.</p>
          </div>
        </div>
        <div class="glass-panel" style="padding: 1.5rem; display: flex; gap: 1rem; align-items: center;">
          <i class="fas fa-rotate-left" style="font-size: 1.8rem; color: var(--color-accent-gold);"></i>
          <div>
            <h4 style="margin: 0; font-size: 0.85rem; font-weight: 600; text-transform: uppercase;">7-Day Easy Exchange</h4>
            <p style="margin: 0.2rem 0 0 0; font-size: 0.75rem; color: var(--color-text-muted);">Seamless sizing adjustments guaranteed.</p>
          </div>
        </div>
      </div>
    </div>
  `;
}

// 3. Wishlist Template
function getWishlistTemplate() {
  const savedItems = PRODUCT_CATALOG.filter(p => state.wishlist.includes(p.id));

  if (savedItems.length === 0) {
    return `
      <div class="wishlist-layout" style="padding: 4rem 1.5rem;">
        <div class="glass-panel" style="max-width: 600px; margin: 0 auto; padding: 4rem 2.5rem; text-align: center; border-radius: 8px;">
          <div style="width: 70px; height: 70px; border-radius: 50%; background: rgba(212,175,55,0.1); border: 1px solid rgba(212,175,55,0.3); display: flex; align-items: center; justify-content: center; margin: 0 auto 1.8rem auto;">
            <i class="far fa-heart" style="font-size: 2.2rem; color: var(--color-accent-gold);"></i>
          </div>
          <h2 style="font-size: 2.2rem; font-weight: 300; margin: 0;">Your Saved Wardrobe is Empty</h2>
          <p style="color: var(--color-text-muted); margin: 1rem 0 2.5rem 0; font-size: 0.95rem; line-height: 1.6;">
            Save your favorite ready-made shirts, trousers, and Pima cotton t-shirts to build your personal wardrobe collection for easy access.
          </p>
          <button class="btn btn-primary" onclick="navigate('shop')" style="padding: 0.9rem 2.5rem;">Explore Shop Catalog</button>
        </div>
      </div>
    `;
  }

  const gridHtml = savedItems.map(p => `
    <div class="product-card" onclick="openPDP('${p.id}')">
      <button class="product-wishlist-btn active" onclick="event.stopPropagation(); toggleWishlist('${p.id}')">
        <i class="fas fa-heart"></i>
      </button>
      <div class="product-img-wrapper">
        <img src="${p.image}" alt="${p.title}" class="product-card-img">
      </div>
      <div class="product-info">
        <div class="product-meta-row">
          <span class="product-cat">${p.categoryLabel}</span>
          <span class="product-price">₹${p.price.toFixed(2)}</span>
        </div>
        <h3 class="product-title">${p.title}</h3>
        <button class="btn btn-secondary" style="width:100%; margin-top: 1.5rem; font-size: 0.7rem; padding: 0.6rem;" onclick="event.stopPropagation(); openPDP('${p.id}')">
          View & Add to Cart
        </button>
      </div>
    </div>
  `).join('');

  return `
    <div class="wishlist-layout">
      <!-- Saved Selections Hero Banner -->
      <div class="page-hero-banner">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1.5rem;">
          <div>
            <div style="font-size:0.75rem; text-transform:uppercase; letter-spacing:0.25em; color:var(--color-accent-gold); font-weight:600; margin-bottom:0.5rem;">Personal Wardrobe Vault</div>
            <h2 style="font-size:2.2rem; font-weight:300; margin:0;">Saved Favorites</h2>
            <p style="color:var(--color-text-muted); font-size:0.9rem; margin-top:0.4rem;">Curated apparel selections ready for sizing profile checks and one-click checkout.</p>
          </div>
          <div style="display:flex; gap:1rem; flex-wrap:wrap;">
            <span class="badge" style="background:rgba(212,175,55,0.1); border:1px solid rgba(212,175,55,0.3); color:var(--color-accent-gold); padding:0.6rem 1.2rem; font-size:0.8rem; font-weight:600;">
              <i class="fas fa-heart" style="margin-right:0.4rem;"></i> ${savedItems.length} Saved Selections
            </span>
          </div>
        </div>
      </div>
      
      <div class="wishlist-grid">
        ${gridHtml}
      </div>
    </div>
  `;
}

// 4. Checkout Template
function getCheckoutTemplate() {
  if (state.cart.length === 0) {
    return `
      <div class="checkout-layout" style="text-align: center; padding: 8rem 2rem;">
        <i class="fas fa-shopping-bag" style="font-size: 4rem; margin-bottom: 2rem; color: var(--color-accent-gold);"></i>
        <h2 style="font-size: 2rem; font-weight: 300;">Your wardrobe is empty</h2>
        <p style="color: var(--color-text-muted); margin-bottom: 3rem; margin-top: 0.5rem; font-size: 0.95rem;">Select items from the catalog prior to proceeding to checkout.</p>
        <button class="btn btn-primary" onclick="navigate('shop')">Explore Shop</button>
      </div>
    `;
  }

  let hasStockIssue = false;

  const itemsHtml = state.cart.map(item => {
    const check = getCartItemStockStatus(item);
    let itemWarning = '';
    if (check.status === 'out') {
      hasStockIssue = true;
      itemWarning = `<div style="color: var(--color-danger); font-size: 0.75rem; font-weight: 600; margin-top: 0.3rem;"><i class="fas fa-exclamation-triangle"></i> Out of Stock</div>`;
    } else if (check.status === 'insufficient') {
      hasStockIssue = true;
      itemWarning = `<div style="color: var(--color-accent-gold); font-size: 0.75rem; font-weight: 600; margin-top: 0.3rem;"><i class="fas fa-exclamation-circle"></i> Only ${check.max} left in stock</div>`;
    } else if (check.status === 'invalid') {
      hasStockIssue = true;
      itemWarning = `<div style="color: var(--color-danger); font-size: 0.75rem; font-weight: 600; margin-top: 0.3rem;"><i class="fas fa-exclamation-triangle"></i> Sizing unavailable</div>`;
    }
    
    return `
      <div class="summary-item" style="margin-bottom: 1.5rem; border-bottom: 1px solid var(--color-border); padding-bottom: 1.2rem;">
        <div style="flex-grow:1; padding-right:1rem;">
          <div style="font-weight: 500; font-size: 0.95rem; color: var(--color-text-main);">${item.title}</div>
          <div style="font-size: 0.75rem; color: var(--color-text-muted); margin-top: 0.3rem; text-transform: uppercase; letter-spacing: 0.05em;">
            Size: ${item.size} | Qty: ${item.qty}
          </div>
          ${itemWarning}
        </div>
        <div style="font-family: var(--font-display); font-weight: 500; color: var(--color-accent-gold);">₹${(item.price * item.qty).toFixed(2)}</div>
      </div>
    `;
  }).join('');

  const subtotal = state.cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  
  let discount = 0;
  if (state.appliedCoupon) {
    if (state.appliedCoupon.discountType === 'percent') {
      discount = subtotal * (state.appliedCoupon.value / 100);
    } else {
      discount = Math.min(state.appliedCoupon.value, subtotal);
    }
  }

  const vat = Math.max(0, subtotal - discount) * 0.05;
  const shipping = 15.00;
  const grandTotal = Math.max(0, subtotal - discount + vat + shipping);

  const cName = state.checkoutFormData.name || (state.currentUser ? state.currentUser.name : '');
  const cEmail = state.checkoutFormData.email || (state.currentUser ? state.currentUser.email : '');
  const cAddress = state.checkoutFormData.address || '';
  const cCity = state.checkoutFormData.city || '';
  const cZip = state.checkoutFormData.zip || '';
  const cPhone = state.checkoutFormData.phone || '';

  let warningBanner = '';
  if (hasStockIssue) {
    warningBanner = `
      <div class="glass-panel" style="background-color: rgba(220, 53, 69, 0.15); border: 1px solid var(--color-danger); border-radius: 8px; padding: 1.5rem; margin-bottom: 2.5rem; display: flex; gap: 1rem; align-items: flex-start;">
        <i class="fas fa-exclamation-triangle" style="color: var(--color-danger); font-size: 1.5rem; margin-top: 0.1rem;"></i>
        <div>
          <h4 style="color: var(--color-text-main); margin: 0 0 0.5rem 0; font-family: var(--font-display); font-size: 0.95rem; text-transform: uppercase; font-weight: 600;">Stock Verification Alert</h4>
          <p style="font-size: 0.85rem; color: var(--color-text-muted); margin: 0; line-height: 1.5;">
            One or more items in your cart are currently out of stock or have insufficient quantities. Please return to your wardrobe cart to adjust quantities before placing this order.
          </p>
        </div>
      </div>
    `;
  }

  return `
    <div class="checkout-layout">
      <!-- Checkout Stepper Progress Ribbon -->
      <div class="stepper-ribbon">
        <div class="stepper-step active">
          <div class="stepper-step-num"><i class="fas fa-check"></i></div>
          <span>Wardrobe Selection</span>
        </div>
        <div style="color:var(--color-border); font-size:0.8rem;">—</div>
        <div class="stepper-step active">
          <div class="stepper-step-num">2</div>
          <span>Delivery Details</span>
        </div>
        <div style="color:var(--color-border); font-size:0.8rem;">—</div>
        <div class="stepper-step">
          <div class="stepper-step-num">3</div>
          <span>Encrypted Payment</span>
        </div>
      </div>

      <div style="display:flex; align-items:center; justify-content:center; gap:0.6rem; background:rgba(40,167,69,0.08); border:1px solid rgba(40,167,69,0.25); padding:0.6rem 1.2rem; border-radius:4px; margin-bottom:2.5rem; font-size:0.78rem; color:#4cd964; font-weight:500;">
        <i class="fas fa-lock" style="font-size:0.85rem;"></i> 256-Bit SSL Encrypted & Bank-Grade Security Guarantee
      </div>
      
      ${warningBanner}
      
      <div class="checkout-grid">
        <div class="glass-panel" style="padding: 3rem; background-color: var(--color-bg-card);">
          <h3 class="checkout-section-title">Delivery Details</h3>
          
          <form id="checkout-form" onsubmit="handlePlaceOrder(event)">
            <div class="form-row">
              <div class="form-group">
                <label>Recipient Name</label>
                <input type="text" class="form-input" id="co-name" value="${cName}" required>
              </div>
              <div class="form-group">
                <label>Email Address</label>
                <input type="email" class="form-input" id="co-email" value="${cEmail}" required>
                <span id="co-email-err" style="font-size: 0.7rem; color: var(--color-danger); display: block; margin-top: 0.35rem; min-height: 1rem; font-weight: 500;"></span>
              </div>
            </div>
            
            <div class="form-group">
              <label>Delivery Address</label>
              <input type="text" class="form-input" id="co-address" value="${cAddress}" placeholder="Street address, apartment, suite" required>
            </div>
            
            <div class="form-row">
              <div class="form-group">
                <label>City & Country</label>
                <input type="text" class="form-input" id="co-city" value="${cCity}" placeholder="e.g. Mumbai, India" required>
              </div>
              <div class="form-group">
                <label>Zip / PIN Code</label>
                <input type="text" class="form-input" id="co-zip" value="${cZip}" placeholder="e.g. 400001" maxlength="6" required>
                <span id="co-zip-err" style="font-size: 0.7rem; color: var(--color-danger); display: block; margin-top: 0.35rem; min-height: 1rem; font-weight: 500;"></span>
              </div>
            </div>
            
            <div class="form-row">
              <div class="form-group">
                <label>Contact Phone (India)</label>
                <input type="tel" class="form-input" id="co-phone" value="${cPhone}" placeholder="e.g. +91 98765 43210" required>
                <span id="co-phone-err" style="font-size: 0.7rem; color: var(--color-danger); display: block; margin-top: 0.35rem; min-height: 1rem; font-weight: 500;"></span>
              </div>
              <div class="form-group" style="opacity: 0; pointer-events: none; height: 0; padding: 0; margin: 0;">
                <!-- Alignment helper -->
              </div>
            </div>
          </form>
        </div>
        
        <div>
          <div class="summary-box">
            <h3 class="checkout-section-title">Wardrobe Summary</h3>
            
            <div style="margin-bottom: 2rem;">
              ${itemsHtml}
            </div>
            
            <div class="summary-item">
              <span>Items Subtotal</span>
              <span>₹${subtotal.toFixed(2)}</span>
            </div>
            
            ${state.appliedCoupon ? `
              <div class="summary-item" style="color: var(--color-accent-gold); font-weight: 500;">
                <span>Discount (${state.appliedCoupon.code})</span>
                <span>-₹${discount.toFixed(2)}</span>
              </div>
            ` : ''}

            <div class="summary-item">
              <span>Delivery Charge</span>
              <span>₹${shipping.toFixed(2)}</span>
            </div>
            <div class="summary-item">
              <span>GST (5%)</span>
              <span>₹${vat.toFixed(2)}</span>
            </div>
            
            <!-- Promo Code Input -->
            <div style="border-top: 1px dashed var(--color-border); border-bottom: 1px dashed var(--color-border); padding: 1rem 0; margin: 1rem 0;">
              <div style="display: flex; gap: 0.5rem;">
                <input type="text" id="coupon-code-input" class="form-input" placeholder="Promo / Coupon Code" style="flex-grow: 1; padding: 0.5rem; font-size: 0.8rem; background: var(--color-bg-input); border: 1px solid var(--color-border); border-radius: 4px; color: var(--color-text-main); text-transform: uppercase;" ${state.appliedCoupon ? 'disabled' : ''} value="${state.appliedCoupon ? state.appliedCoupon.code : ''}">
                ${state.appliedCoupon ? `
                  <button class="btn btn-secondary" onclick="removeCoupon(event)" style="padding: 0.5rem 1.2rem; font-size: 0.8rem; border-radius: 4px; white-space: nowrap;">Remove</button>
                ` : `
                  <button class="btn btn-primary" onclick="applyCoupon(event)" style="padding: 0.5rem 1.2rem; font-size: 0.8rem; border-radius: 4px; white-space: nowrap;">Apply</button>
                `}
              </div>
              <div id="coupon-message" style="margin-top: 0.4rem; font-size: 0.75rem; color: var(--color-accent-gold); font-weight: 500;"></div>
            </div>

            <div class="summary-total" style="margin-bottom: 1.5rem;">
              <span>Total Charge</span>
              <span>₹${grandTotal.toFixed(2)}</span>
            </div>
            
            <div style="border-top: 1px dashed var(--color-border); padding-top: 1.5rem; margin-top: 1.5rem;">
              <h4 style="font-size: 0.8rem; font-family: var(--font-display); text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-text-main); margin-bottom: 0.8rem; font-weight:600;"><i class="fas fa-lock" style="color:var(--color-accent-gold); margin-right:0.3rem;"></i> Secure Payment</h4>
              <p style="font-size: 0.78rem; color: var(--color-text-muted); line-height: 1.5; margin-bottom: 1.2rem;">
                Payments are securely encrypted and processed via Razorpay Gateway supporting Cards, UPI, Netbanking, and Wallets.
              </p>
              <button type="submit" form="checkout-form" class="btn btn-primary" style="width: 100%; padding: 1rem; font-size: 0.85rem; font-weight:600; text-transform:uppercase; letter-spacing:0.05em; ${hasStockIssue ? 'opacity: 0.5; cursor: not-allowed;' : ''}" ${hasStockIssue ? 'disabled' : ''}>
                ${hasStockIssue ? 'Resolve Stock Issues to Pay' : 'Proceed to secure payment'}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

// 5. Login Template
function getLoginTemplate() {
  return `
    <div class="auth-layout glass-panel">
      <div class="admin-tabs" style="margin-bottom: 2rem; border-bottom: 1px solid var(--color-border);">
        <div class="admin-tab active" id="auth-tab-login" onclick="switchAuthTab('login')" style="flex: 1; text-align: center; padding: 1rem 0;">Sign In</div>
        <div class="admin-tab" id="auth-tab-register" onclick="switchAuthTab('register')" style="flex: 1; text-align: center; padding: 1rem 0;">Register</div>
      </div>
      
      <div id="auth-pane-login">
        <h2 class="auth-title">Sign In</h2>
        <form onsubmit="handleAuthLogin(event)">
          <div class="form-group">
            <label>Email Address</label>
            <input type="email" class="form-input" id="login-email" placeholder="customer@hairah.com / admin@hairah.com" required>
          </div>
          <div class="form-group">
            <label>Password</label>
            <input type="password" class="form-input" id="login-password" placeholder="password / admin123" required>
          </div>
          <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 1.5rem;">Access Account</button>
        </form>
        <div class="auth-switch-link" style="margin-top: 2rem;">
          <p>Customer Demo: <code style="color:var(--color-accent-gold);">customer@hairah.com</code> / <code style="color:var(--color-accent-gold);">password</code></p>
          <p style="margin-top: 0.5rem;">Admin Demo: <code style="color:var(--color-accent-gold);">admin@hairah.com</code> / <code style="color:var(--color-accent-gold);">admin123</code></p>
        </div>
      </div>
      
      <div id="auth-pane-register" style="display: none;">
        <h2 class="auth-title">Register Account</h2>
        <form onsubmit="handleAuthRegister(event)">
          <div class="form-group">
            <label>Full Name</label>
            <input type="text" class="form-input" id="reg-name" placeholder="Johnathan Doe" required>
          </div>
          <div class="form-group">
            <label>Email Address</label>
            <input type="email" class="form-input" id="reg-email" required>
          </div>
          <div class="form-group">
            <label>Choose Password</label>
            <input type="password" class="form-input" id="reg-password" minlength="4" required>
          </div>
          <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 1.5rem;">Create Account</button>
        </form>
      </div>
    </div>
  `;
}

// 6. Customer Profile Template
function getProfileTemplate() {
  const customer = state.currentUser;
  const sizing = customer.sizing || { chest: "", waist: "", fit: "Tailored" };
  const myOrders = state.orders;

  let ordersHtml = "";
  if (myOrders.length === 0) {
    ordersHtml = `
      <div style="text-align: center; padding: 3rem 0; color: var(--color-text-muted);">
        <i class="fas fa-box-open" style="font-size: 2.5rem; margin-bottom: 1rem; color: var(--color-border-hover);"></i>
        <p>No orders registered to your wardrobe yet.</p>
      </div>
    `;
  } else {
    ordersHtml = myOrders.map(o => {
      const orderItems = o.items.map(item => 
        `<li>${item.title} <span style="color: var(--color-text-muted); font-size: 0.8rem;">(Qty ${item.qty} | Size ${item.size})</span></li>`
      ).join('');
      
      return `
        <div class="order-card">
          <div class="order-card-header">
            <div>
              <span style="font-weight:600; font-family:var(--font-display); font-size: 0.8rem; text-transform:uppercase; letter-spacing:0.05em; color:var(--color-accent-gold);">${o.id}</span>
              <div style="font-size: 0.75rem; color: var(--color-text-muted); margin-top:0.25rem;">Placed on ${o.date}</div>
            </div>
            <div>
              <span class="order-status-badge ${o.status.toLowerCase()}">${o.status}</span>
            </div>
          </div>
          <div class="order-card-body">
            <ul style="margin-left: 1.5rem; margin-bottom: 1.5rem; line-height: 1.8; font-size: 0.9rem;">
              ${orderItems}
            </ul>
            <div style="display:flex; justify-content:space-between; align-items:center; border-top: 1px solid var(--color-border); padding-top:1rem;">
              <span style="font-size: 0.85rem; color: var(--color-text-muted);">Method: ${o.payment_method || 'Card'} ${o.payment_id ? `(${o.payment_id})` : ''}</span>
              <span style="font-family:var(--font-display); font-weight:600; color:var(--color-text-main);">Charged: ₹${o.total.toFixed(2)}</span>
            </div>
          </div>
        </div>
      `;
    }).join('');
  }

  return `
    <div class="profile-layout">
      <h2 style="font-size: 2.2rem; font-weight: 300; margin-bottom: 3.5rem;">My Account Profile</h2>
      
      <div class="profile-grid">
        <div class="profile-menu">
          <div class="profile-menu-item active" onclick="switchProfileTab('orders')">Order History (${myOrders.length})</div>
          <div class="profile-menu-item" onclick="handleLogout()" style="color: var(--color-danger); margin-top: auto;">Sign Out</div>
        </div>
        
        <div class="profile-content-pane">
          <div id="profile-pane-orders" style="display: block;">
            <h3 style="font-size: 1.3rem; margin-bottom: 2.5rem; border-bottom: 1px solid var(--color-border); padding-bottom: 0.5rem;">My Order History</h3>
            <div class="orders-list">
              ${ordersHtml}
            </div>
          </div>
        </div>
      </div>
    </div>
  `;
}

// Helper to convert '2026-08-06' to 'August 06, 2026'
function formatJSDateToDbString(dateStr) {
  if (!dateStr) return '';
  const parts = dateStr.split('-');
  if (parts.length !== 3) return dateStr;
  const year = parts[0];
  const monthIdx = parseInt(parts[1], 10) - 1;
  const day = parts[2];
  
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  const monthName = monthNames[monthIdx];
  return `${monthName} ${day}, ${year}`;
}

// Helper to format JS Date object to premium display string (e.g. "03 Aug 2026")
function formatJSDateToDisplayString(dateObj) {
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const day = String(dateObj.getDate()).padStart(2, '0');
  const month = monthNames[dateObj.getMonth()];
  const year = dateObj.getFullYear();
  return `${day} ${month} ${year}`;
}

// Helper to parse database date like "August 03, 2026" or "July 28, 2026" to a standard JS Date object
function parseDbDateToJSDate(dbStr) {
  if (!dbStr) return new Date();
  const monthNames = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December"
  ];
  const cleanStr = dbStr.replace(',', '').trim();
  const parts = cleanStr.split(/\s+/);
  if (parts.length !== 3) return new Date();
  const monthName = parts[0];
  const day = parseInt(parts[1], 10);
  const year = parseInt(parts[2], 10);
  const monthIdx = monthNames.findIndex(m => m.toLowerCase() === monthName.toLowerCase());
  if (monthIdx === -1) return new Date();
  return new Date(year, monthIdx, day, 0, 0, 0, 0);
}

// --- Dynamic Charting Helper Functions ---
function aggregateSalesData(orders, viewMode) {
  const dataPoints = [];
  
  if (viewMode === 'daily') {
    // Show 7 days ending on selected date for daily context
    const selectedDate = parseDbDateToJSDate(state.adminFilterDate);
    for (let i = 6; i >= 0; i--) {
      const d = new Date(selectedDate);
      d.setDate(selectedDate.getDate() - i);
      const dateStr = formatJSDateToDisplayString(d);
      
      const dayOrders = state.orders.filter(o => {
        const oDate = parseDbDateToJSDate(o.date);
        return oDate.getFullYear() === d.getFullYear() &&
               oDate.getMonth() === d.getMonth() &&
               oDate.getDate() === d.getDate();
      });
      const total = dayOrders.reduce((sum, o) => sum + o.total, 0);
      dataPoints.push({ label: d.getDate().toString(), value: total, details: dateStr });
    }
  } 
  else if (viewMode === 'weekly') {
    // Show Sun to Sat boundaries for selected week
    const selectedDate = parseDbDateToJSDate(state.adminFilterDate);
    const dayOfWeek = selectedDate.getDay();
    const startOfWeek = new Date(selectedDate);
    startOfWeek.setDate(selectedDate.getDate() - dayOfWeek);
    
    const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      const dateStr = formatJSDateToDisplayString(d);
      
      const dayOrders = state.orders.filter(o => {
        const oDate = parseDbDateToJSDate(o.date);
        return oDate.getFullYear() === d.getFullYear() &&
               oDate.getMonth() === d.getMonth() &&
               oDate.getDate() === d.getDate();
      });
      const total = dayOrders.reduce((sum, o) => sum + o.total, 0);
      dataPoints.push({ label: dayNames[i], value: total, details: dateStr });
    }
  } 
  else if (viewMode === 'monthly') {
    // Show days of the selected month
    const parts = state.adminFilterMonth.split('-');
    const filterYear = parseInt(parts[0], 10);
    const filterMonth = parseInt(parts[1], 10) - 1;
    
    const daysInMonth = new Date(filterYear, filterMonth + 1, 0).getDate();
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const monthName = monthNames[filterMonth] || '';
    
    for (let i = 1; i <= daysInMonth; i++) {
      const d = new Date(filterYear, filterMonth, i);
      const dateStr = `${i} ${monthName} ${filterYear}`;
      
      const dayOrders = state.orders.filter(o => {
        const oDate = parseDbDateToJSDate(o.date);
        return oDate.getFullYear() === filterYear &&
               oDate.getMonth() === filterMonth &&
               oDate.getDate() === i;
      });
      const total = dayOrders.reduce((sum, o) => sum + o.total, 0);
      dataPoints.push({ label: i.toString(), value: total, details: dateStr });
    }
  } 
  else if (viewMode === 'custom') {
    // Show all dates in custom range
    const start = new Date(state.adminFilterStartDate + 'T00:00:00');
    const end = new Date(state.adminFilterEndDate + 'T23:59:59');
    
    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (diffDays <= 15) {
      for (let i = 0; i <= diffDays; i++) {
        const d = new Date(start);
        d.setDate(start.getDate() + i);
        const dateStr = formatJSDateToDisplayString(d);
        
        const dayOrders = state.orders.filter(o => {
          const oDate = parseDbDateToJSDate(o.date);
          return oDate.getFullYear() === d.getFullYear() &&
                 oDate.getMonth() === d.getMonth() &&
                 oDate.getDate() === d.getDate();
        });
        const total = dayOrders.reduce((sum, o) => sum + o.total, 0);
        dataPoints.push({ label: d.getDate().toString(), value: total, details: dateStr });
      }
    } else {
      // Group by weeks for long ranges to maintain legibility
      let current = new Date(start);
      while (current <= end) {
        const nextWeek = new Date(current);
        nextWeek.setDate(current.getDate() + 6);
        const limit = nextWeek < end ? nextWeek : end;
        
        const weekOrders = state.orders.filter(o => {
          const oDate = parseDbDateToJSDate(o.date);
          return oDate >= current && oDate <= new Date(limit.getFullYear(), limit.getMonth(), limit.getDate(), 23, 59, 59);
        });
        
        const total = weekOrders.reduce((sum, o) => sum + o.total, 0);
        const labelStr = `${current.getDate()}/${current.getMonth() + 1}`;
        const detailStr = `${formatJSDateToDisplayString(current)} - ${formatJSDateToDisplayString(limit)}`;
        dataPoints.push({ label: labelStr, value: total, details: detailStr });
        
        current.setDate(current.getDate() + 7);
      }
    }
  } 
  else {
    // Lifetime: Group by month for last 6 months
    const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
    const now = new Date();
    for (let i = 5; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const mIdx = d.getMonth();
      const yStr = d.getFullYear();
      
      const monthOrders = state.orders.filter(o => {
        const oDate = parseDbDateToJSDate(o.date);
        return oDate.getFullYear() === d.getFullYear() && oDate.getMonth() === d.getMonth();
      });
      const total = monthOrders.reduce((sum, o) => sum + o.total, 0);
      dataPoints.push({ label: monthNames[mIdx], value: total, details: `${monthNames[mIdx]} ${yStr}` });
    }
  }
  
  return dataPoints;
}

function generateAdminSVGChart(data, viewMode) {
  if (!data || data.length === 0) {
    return `<div style="text-align:center; padding:2rem; font-size:0.8rem; color:var(--color-text-muted);">No sales data available.</div>`;
  }
  
  const width = 600;
  const height = 150;
  const paddingX = 40;
  const paddingY = 20;
  
  const maxVal = Math.max(...data.map(d => d.value), 100);
  
  // Calculate node points coordinates
  const points = data.map((d, index) => {
    const x = paddingX + (index / (data.length - 1 || 1)) * (width - 2 * paddingX);
    const y = height - paddingY - (d.value / maxVal) * (height - 2 * paddingY);
    return { x, y, value: d.value, label: d.label, details: d.details };
  });
  
  let pathD = "";
  let areaD = "";
  
  if (points.length > 0) {
    pathD = `M ${points[0].x} ${points[0].y}`;
    for (let i = 1; i < points.length; i++) {
      const p = points[i];
      const prev = points[i - 1];
      const cpX1 = prev.x + (p.x - prev.x) / 3;
      const cpY1 = prev.y;
      const cpX2 = prev.x + 2 * (p.x - prev.x) / 3;
      const cpY2 = p.y;
      pathD += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${p.x} ${p.y}`;
    }
    areaD = `${pathD} L ${points[points.length - 1].x} ${height - paddingY} L ${points[0].x} ${height - paddingY} Z`;
  }
  
  const gridLines = [];
  for (let i = 0; i <= 3; i++) {
    const val = (maxVal / 3) * i;
    const y = height - paddingY - (val / maxVal) * (height - 2 * paddingY);
    gridLines.push(`
      <line x1="${paddingX}" y1="${y}" x2="${width - paddingX}" y2="${y}" stroke="rgba(255,255,255,0.06)" stroke-dasharray="3,3" />
      <text x="${paddingX - 10}" y="${y + 3}" fill="var(--color-text-muted)" font-size="7" text-anchor="end">₹${Math.round(val)}</text>
    `);
  }
  
  const step = Math.ceil(data.length / 10);
  const xLabels = points.map((p, i) => {
    if (i % step !== 0 && i !== points.length - 1) return '';
    return `
      <text x="${p.x}" y="${height - 5}" fill="var(--color-text-muted)" font-size="7" text-anchor="middle">${p.label}</text>
    `;
  }).join('');
  
  const hoverPointsHtml = points.map((p) => {
    return `
      <g class="chart-point-group">
        <circle cx="${p.x}" cy="${p.y}" r="3" fill="var(--color-accent-gold)" stroke="var(--color-bg-card)" stroke-width="1.5" />
        <circle cx="${p.x}" cy="${p.y}" r="10" fill="transparent" class="chart-point-hover" onmouseover="showChartTooltip(event, '${p.details}', '₹${p.value.toFixed(2)}')" onmouseout="hideChartTooltip()" />
      </g>
    `;
  }).join('');
  
  return `
    <svg viewBox="0 0 ${width} ${height}" style="width:100%; height:auto; overflow:visible;">
      <defs>
        <linearGradient id="chart-area-grad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="var(--color-accent-gold)" stop-opacity="0.2"/>
          <stop offset="100%" stop-color="var(--color-accent-gold)" stop-opacity="0.0"/>
        </linearGradient>
      </defs>
      ${gridLines.join('')}
      <path d="${areaD}" fill="url(#chart-area-grad)" />
      <path d="${pathD}" fill="none" stroke="var(--color-accent-gold)" stroke-width="1.5" stroke-linecap="round" />
      ${xLabels}
      ${hoverPointsHtml}
    </svg>
  `;
}

window.showChartTooltip = function(event, dateStr, valueStr) {
  let tooltip = document.getElementById("chart-tooltip");
  if (!tooltip) {
    tooltip = document.createElement("div");
    tooltip.id = "chart-tooltip";
    tooltip.style.position = "absolute";
    tooltip.style.background = "var(--color-bg-card)";
    tooltip.style.border = "1px solid var(--color-border)";
    tooltip.style.padding = "0.4rem 0.8rem";
    tooltip.style.borderRadius = "4px";
    tooltip.style.fontSize = "0.75rem";
    tooltip.style.color = "var(--color-text-main)";
    tooltip.style.pointerEvents = "none";
    tooltip.style.boxShadow = "0 4px 12px rgba(0,0,0,0.2)";
    tooltip.style.zIndex = "1000";
    tooltip.style.fontFamily = "var(--font-display)";
    document.body.appendChild(tooltip);
  }
  
  tooltip.innerHTML = `<strong style="color:var(--color-accent-gold);">${valueStr}</strong><br><span style="font-size:0.65rem; color:var(--color-text-muted);">${dateStr}</span>`;
  tooltip.style.display = "block";
  
  const rect = event.target.getBoundingClientRect();
  tooltip.style.left = `${window.scrollX + rect.left + rect.width / 2 - tooltip.offsetWidth / 2}px`;
  tooltip.style.top = `${window.scrollY + rect.top - tooltip.offsetHeight - 8}px`;
};

window.hideChartTooltip = function() {
  const tooltip = document.getElementById("chart-tooltip");
  if (tooltip) {
    tooltip.style.display = "none";
  }
};

// 7. Admin Dashboard Template
function getAdminTemplate() {
  if (!state.adminFilterDate) {
    const offset = new Date().getTimezoneOffset();
    const localToday = new Date(new Date().getTime() - (offset * 60 * 1000));
    state.adminFilterDate = localToday.toISOString().split('T')[0];
  }
  if (!state.adminFilterMonth) {
    state.adminFilterMonth = new Date().toISOString().slice(0, 7);
  }
  if (!state.adminFilterStartDate) {
    state.adminFilterStartDate = new Date().toISOString().split('T')[0];
  }
  if (!state.adminFilterEndDate) {
    state.adminFilterEndDate = new Date().toISOString().split('T')[0];
  }
  if (!state.adminMetricView) {
    state.adminMetricView = 'daily';
  }
  
  let filteredOrders = [];
  let revenueTitle = '';
  let ordersTitle = '';
  
  if (state.adminMetricView === 'daily') {
    const filterDateDbStr = formatJSDateToDbString(state.adminFilterDate);
    filteredOrders = state.orders.filter(o => {
      if (!o.date) return false;
      const cleanDbDate = o.date.toLowerCase().replace(/\b0(\d)\b/g, '$1').trim();
      const cleanFilterDate = filterDateDbStr.toLowerCase().replace(/\b0(\d)\b/g, '$1').trim();
      return cleanDbDate === cleanFilterDate;
    });
    revenueTitle = `Daily Gross Revenue (${filterDateDbStr})`;
    ordersTitle = `Daily Orders (${filterDateDbStr})`;
    
  } else if (state.adminMetricView === 'weekly') {
    const refDate = new Date(state.adminFilterDate + 'T00:00:00');
    const dayOfWeek = refDate.getDay();
    const startOfWeek = new Date(refDate);
    startOfWeek.setDate(refDate.getDate() - dayOfWeek);
    startOfWeek.setHours(0,0,0,0);
    
    const endOfWeek = new Date(startOfWeek);
    endOfWeek.setDate(startOfWeek.getDate() + 6);
    endOfWeek.setHours(23,59,59,999);
    
    filteredOrders = state.orders.filter(o => {
      const oDate = parseDbDateToJSDate(o.date);
      return oDate >= startOfWeek && oDate <= endOfWeek;
    });
    
    const startStr = formatJSDateToDisplayString(startOfWeek);
    const endStr = formatJSDateToDisplayString(endOfWeek);
    revenueTitle = `Weekly Gross Revenue (${startStr} - ${endStr})`;
    ordersTitle = `Weekly Orders (${startStr} - ${endStr})`;
    
  } else if (state.adminMetricView === 'monthly') {
    const parts = state.adminFilterMonth.split('-');
    const filterYear = parseInt(parts[0], 10);
    const filterMonth = parseInt(parts[1], 10) - 1;
    
    filteredOrders = state.orders.filter(o => {
      const oDate = parseDbDateToJSDate(o.date);
      return oDate.getFullYear() === filterYear && oDate.getMonth() === filterMonth;
    });
    
    const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
    const monthName = monthNames[filterMonth] || 'Month';
    revenueTitle = `Monthly Gross Revenue (${monthName} ${filterYear})`;
    ordersTitle = `Monthly Orders (${monthName} ${filterYear})`;
    
  } else if (state.adminMetricView === 'custom') {
    const start = new Date(state.adminFilterStartDate + 'T00:00:00');
    const end = new Date(state.adminFilterEndDate + 'T23:59:59');
    
    filteredOrders = state.orders.filter(o => {
      const oDate = parseDbDateToJSDate(o.date);
      return oDate >= start && oDate <= end;
    });
    
    const startStr = formatJSDateToDisplayString(start);
    const endStr = formatJSDateToDisplayString(end);
    revenueTitle = `Custom Range Gross Revenue (${startStr} - ${endStr})`;
    ordersTitle = `Custom Range Orders (${startStr} - ${endStr})`;
    
  } else {
    // total (lifetime)
    filteredOrders = state.orders;
    revenueTitle = 'Lifetime Gross Revenue';
    ordersTitle = 'Total Orders';
  }
  
  // Cache for export utility
  state.lastFilteredOrders = filteredOrders;
  
  const revenueValue = filteredOrders.reduce((sum, o) => sum + o.total, 0);
  const ordersValue = filteredOrders.length;
  
  // Calculate in-store vs online splits
  let instoreRevenue = 0;
  let instoreCount = 0;
  let onlineRevenue = 0;
  let onlineCount = 0;

  filteredOrders.forEach(o => {
    const isInstore = o.address === 'In-Store Checkout' || (o.payment_id && o.payment_id.startsWith('POS-'));
    if (isInstore) {
      instoreRevenue += o.total;
      instoreCount += 1;
    } else {
      onlineRevenue += o.total;
      onlineCount += 1;
    }
  });

  const searchQ = (state.adminOrderSearchQuery || '').trim().toLowerCase();
  const searchFilteredOrders = filteredOrders.filter(o => {
    if (!searchQ) return true;
    const idMatch = (o.id || '').toLowerCase().includes(searchQ);
    const emailMatch = (o.customer_email || o.customerEmail || '').toLowerCase().includes(searchQ);
    const nameMatch = (o.recipient_name || '').toLowerCase().includes(searchQ);
    const phoneMatch = (o.phone || '').toLowerCase().includes(searchQ);
    const addressMatch = (o.address || '').toLowerCase().includes(searchQ);
    const paymentMatch = (o.payment_method || '').toLowerCase().includes(searchQ);
    const paymentIdMatch = (o.payment_id || '').toLowerCase().includes(searchQ);
    const itemMatch = (o.items || []).some(item => (item.title || '').toLowerCase().includes(searchQ));
    return idMatch || emailMatch || nameMatch || phoneMatch || addressMatch || paymentMatch || paymentIdMatch || itemMatch;
  });

  const ordersRows = searchFilteredOrders.map(o => {
    const itemsLabel = o.items.map(item => `${item.title} (x${item.qty})`).join(', ');
    const paymentLabel = `Method: ${o.payment_method || 'Card'}\nTx ID: ${o.payment_id || 'N/A'}`;
    const isInstore = o.address === 'In-Store Checkout' || (o.payment_id && o.payment_id.startsWith('POS-'));
    const channelTag = isInstore
      ? `<span class="badge" style="background: rgba(212,175,55,0.15); color: var(--color-accent-gold); border: 1px solid rgba(212,175,55,0.3); font-size: 0.7rem; padding: 0.2rem 0.5rem; border-radius: 4px; font-weight:600;"><i class="fas fa-store" style="font-size:0.65rem; margin-right:0.25rem;"></i> POS</span>`
      : `<span class="badge" style="background: rgba(0,123,255,0.15); color: #66b0ff; border: 1px solid rgba(0,123,255,0.3); font-size: 0.7rem; padding: 0.2rem 0.5rem; border-radius: 4px; font-weight:600;"><i class="fas fa-globe" style="font-size:0.65rem; margin-right:0.25rem;"></i> Online</span>`;
    
    return `
      <tr>
        <td style="font-family:var(--font-display); font-weight:600; color:var(--color-accent-gold);" title="${paymentLabel}">${o.id}</td>
        <td>${channelTag}</td>
        <td>${o.customer_email || o.customerEmail}</td>
        <td>${o.date}</td>
        <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${itemsLabel}">${itemsLabel}</td>
        <td style="font-weight:600; font-family:var(--font-display); text-align:right;">₹${o.total.toFixed(2)}</td>
        <td>
          <select class="status-dropdown" onchange="handleAdminChangeOrderStatus('${o.id}', this)">
            <option value="Processing" style="background: var(--color-bg-card); color: var(--color-text-main);" ${o.status === 'Processing' ? 'selected' : ''}>Processing</option>
            <option value="Shipped" style="background: var(--color-bg-card); color: var(--color-text-main);" ${o.status === 'Shipped' ? 'selected' : ''}>Shipped</option>
            <option value="Delivered" style="background: var(--color-bg-card); color: var(--color-text-main);" ${o.status === 'Delivered' ? 'selected' : ''}>Delivered</option>
          </select>
        </td>
        <td style="text-align: center;">
          <button class="btn btn-secondary" style="font-size:0.7rem; padding:0.4rem 0.8rem; margin:0;" onclick="viewAdminOrderDetails('${o.id}')">
            View Details
          </button>
        </td>
      </tr>
    `;
  }).join('');
  
  const customersRows = state.users.map(u => `
    <tr>
      <td style="font-weight:600;">${u.name}</td>
      <td>${u.email}</td>
      <td>${u.sizing ? `Chest: ${u.sizing.chest}" | Waist: ${u.sizing.waist}" | Fit: ${u.sizing.fit}` : '<em style="color:var(--color-text-muted);">Not configured</em>'}</td>
      <td>Registered Client</td>
    </tr>
  `).join('');

  const couponsRows = (state.coupons || []).map(c => `
    <tr>
      <td style="font-weight:600; color:var(--color-accent-gold); text-transform:uppercase;">${c.code}</td>
      <td>${c.discount_type === 'percent' ? 'Percentage (%)' : 'Flat (₹)'}</td>
      <td style="text-align:right; font-weight:600;">${c.discount_type === 'percent' ? `${c.value}%` : `₹${c.value.toFixed(2)}`}</td>
      <td style="text-align:center;">
        <button class="btn btn-secondary" style="font-size:0.7rem; padding:0.4rem 0.8rem; margin:0; border-color:var(--color-danger); color:var(--color-danger); background:transparent;" onclick="handleAdminDeleteCoupon('${c.code}')">
          <i class="fas fa-trash-alt"></i> Delete
        </button>
      </td>
    </tr>
  `).join('') || `<tr><td colspan="4" style="text-align:center; color:var(--color-text-muted);">No coupon codes registered.</td></tr>`;

  const inventoryItemsHtml = PRODUCT_CATALOG.map(p => {
    const sizeStockInputsHtml = p.sizes.map(size => {
      const stock = p.sizes_stock?.[size] ?? 0;
      return `
        <div style="display:flex; align-items:center; gap:0.3rem; background:rgba(255,255,255,0.03); border:1px solid var(--color-border); padding:0.25rem 0.5rem; border-radius:3px;">
          <span style="font-size:0.7rem; font-weight:600; color:var(--color-accent-gold);">${size}:</span>
          <input type="number" min="0" value="${stock}" style="width:50px; background:transparent; border:none; color:var(--color-text-light); font-size:0.75rem; text-align:center; padding:0; outline:none;" onchange="handleAdminChangeSizeStock('${p.id}', '${size}', this)">
        </div>
      `;
    }).join('');

    return `
      <div class="inventory-item" style="flex-direction:column; align-items:stretch; gap:1.5rem;">
        <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:1rem;">
          <div class="inventory-meta">
            <img src="${p.image}" alt="${p.title}" class="inventory-img">
            <div class="inventory-title-cat">
              <h4>${p.title}</h4>
              <span>${p.categoryLabel}</span>
            </div>
          </div>
          
          <div class="inventory-controls" style="margin:0;">
            <!-- Edit price -->
            <div style="display:flex; align-items:center; gap:0.5rem; margin-right:1.5rem;">
              <label style="margin:0; font-size:0.7rem;">Price (₹):</label>
              <input type="number" class="inventory-price-input" value="${p.price}" onchange="handleAdminChangePrice('${p.id}', this)">
            </div>
            
            <!-- Visibility switch -->
            <div style="display:flex; align-items:center; gap:0.8rem; margin-right:1.5rem;">
              <label style="margin:0; font-size:0.7rem;">Visibility:</label>
              <span style="font-size:0.75rem; font-weight:600; min-width:65px; text-transform:uppercase;">
                ${p.isVisible ? '<span style="color:var(--color-success);">Visible</span>' : '<span style="color:var(--color-text-muted);">Hidden</span>'}
              </span>
              <label class="switch">
                <input type="checkbox" ${p.isVisible ? 'checked' : ''} onchange="handleAdminToggleVisibility('${p.id}', this)">
                <span class="slider"></span>
              </label>
            </div>
            
            <!-- Delete button -->
            <button class="btn btn-secondary" onclick="handleAdminDeleteProduct('${p.id}', '${p.title.replace(/'/g, "\\'")}')" style="font-size:0.7rem; padding:0.4rem 0.8rem; margin:0; border-color:var(--color-danger); color:var(--color-danger); background: transparent;">
              <i class="fas fa-trash-alt"></i> Delete
            </button>
          </div>
        </div>

        <!-- Sizing stock levels section -->
        <div style="border-top:1px dashed var(--color-border); padding-top:1rem;">
          <label style="display:block; font-size:0.7rem; color:var(--color-text-muted); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:0.8rem; font-weight:600;">Sizing Stock Registry</label>
          <div style="display:flex; flex-wrap:wrap; gap:0.8rem;">
            ${sizeStockInputsHtml}
          </div>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div class="admin-layout">
      <div class="admin-header">
        <div>
          <h2 style="font-size: 2.2rem; font-weight: 300; letter-spacing:0.02em;">Sartorial Management Portal</h2>
          <p style="color: var(--color-text-muted); font-size: 0.95rem; margin-top:0.5rem;">Admin session active. View sales metrics, daily order registries, and attire inventory control.</p>
        </div>
        <button class="btn btn-secondary" onclick="handleLogout()">Exit Portal</button>
      </div>
      
      <div class="admin-stats-ribbon" style="margin-bottom:1.5rem;">
        <div class="stat-card" style="position: relative;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 0.5rem;">
            <span class="stat-card-title">${revenueTitle}</span>
            <select onchange="handleAdminChangeMetricsView(this.value)" style="background: rgba(255,255,255,0.05); border: 1px solid var(--color-border); color: var(--color-text-main); font-size: 0.75rem; border-radius: 4px; padding: 0.2rem 0.5rem; outline: none; cursor: pointer; font-weight: 500; font-family: inherit;">
              <option value="daily" style="background: var(--color-bg-card); color: var(--color-text-main);" ${state.adminMetricView === 'daily' ? 'selected' : ''}>Daily</option>
              <option value="weekly" style="background: var(--color-bg-card); color: var(--color-text-main);" ${state.adminMetricView === 'weekly' ? 'selected' : ''}>Weekly</option>
              <option value="monthly" style="background: var(--color-bg-card); color: var(--color-text-main);" ${state.adminMetricView === 'monthly' ? 'selected' : ''}>Monthly</option>
              <option value="custom" style="background: var(--color-bg-card); color: var(--color-text-main);" ${state.adminMetricView === 'custom' ? 'selected' : ''}>Custom Range</option>
              <option value="total" style="background: var(--color-bg-card); color: var(--color-text-main);" ${state.adminMetricView === 'total' ? 'selected' : ''}>Lifetime</option>
            </select>
          </div>
          <span class="stat-card-value">₹${revenueValue.toFixed(2)}</span>
        </div>
        <div class="stat-card">
          <span class="stat-card-title">${ordersTitle}</span>
          <span class="stat-card-value">${ordersValue}</span>
        </div>
        <div class="stat-card">
          <span class="stat-card-title"><i class="fas fa-store" style="color: var(--color-accent-gold); margin-right: 0.3rem;"></i> In-Store Sales</span>
          <span class="stat-card-value">₹${instoreRevenue.toFixed(2)}</span>
          <div style="font-size: 0.75rem; color: var(--color-text-muted); margin-top: 0.4rem; font-weight: 500;">${instoreCount} Transactions</div>
        </div>
        <div class="stat-card">
          <span class="stat-card-title"><i class="fas fa-globe" style="color: var(--color-accent-gold); margin-right: 0.3rem;"></i> Online Sales</span>
          <span class="stat-card-value">₹${onlineRevenue.toFixed(2)}</span>
          <div style="font-size: 0.75rem; color: var(--color-text-muted); margin-top: 0.4rem; font-weight: 500;">${onlineCount} Orders</div>
        </div>
      </div>
      
      <!-- SVG Analytics Chart -->
      <div class="admin-chart-card" style="background: var(--color-bg-card); border: 1px solid var(--color-border); padding: 1.5rem; border-radius: 6px; margin-bottom: 2rem; box-shadow: 0 4px 20px rgba(0,0,0,0.05); animation: fadeIn 0.3s ease-out;">
        <h4 style="margin: 0 0 1.2rem 0; font-size: 0.8rem; letter-spacing: 0.05em; text-transform: uppercase; color: var(--color-text-muted); font-weight:600;">Sartorial Revenue Performance</h4>
        ${(() => {
          const chartData = aggregateSalesData(filteredOrders, state.adminMetricView);
          return generateAdminSVGChart(chartData, state.adminMetricView);
        })()}
      </div>
      
      <div class="admin-tabs">
        <div class="admin-tab ${state.adminActiveTab === 'stats' ? 'active' : ''}" onclick="switchAdminTab('stats')">Orders Registry</div>
        <div class="admin-tab ${state.adminActiveTab === 'inventory' ? 'active' : ''}" onclick="switchAdminTab('inventory')">Inventory Control</div>
        <div class="admin-tab ${state.adminActiveTab === 'customers' ? 'active' : ''}" onclick="switchAdminTab('customers')">Customer Directory</div>
        <div class="admin-tab ${state.adminActiveTab === 'payment' ? 'active' : ''}" onclick="switchAdminTab('payment')">Payment Settings</div>
        <div class="admin-tab ${state.adminActiveTab === 'predictions' ? 'active' : ''}" onclick="switchAdminTab('predictions')"><i class="fas fa-brain" style="font-size:0.75rem; margin-right:0.3rem; color: var(--color-accent-gold);"></i> AI Predictions</div>
        <div class="admin-tab ${state.adminActiveTab === 'coupons' ? 'active' : ''}" onclick="switchAdminTab('coupons')"><i class="fas fa-ticket-alt" style="font-size:0.75rem; margin-right:0.3rem; color: var(--color-accent-gold);"></i> Coupons</div>
        <div class="admin-tab ${state.adminActiveTab === 'pos' ? 'active' : ''}" onclick="switchAdminTab('pos')"><i class="fas fa-cash-register" style="font-size:0.75rem; margin-right:0.3rem; color: var(--color-accent-gold);"></i> In-Store POS</div>
      </div>
      
      <div id="admin-pane-stats" style="display: ${state.adminActiveTab === 'stats' ? 'block' : 'none'};">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; margin-bottom: 1.5rem;">
          <h3 style="font-size: 1.25rem; margin: 0; letter-spacing:0.05em;">Placed Attire Orders</h3>
          
          <div style="display: flex; align-items: center; gap: 1rem; flex-wrap: wrap;">
            <!-- Search Order Registry Box -->
            <div class="search-input-wrapper" style="margin: 0; min-width: 280px; width: auto; max-width: 380px;">
              <input type="text" class="search-input" id="admin-order-search-box" placeholder="Search Order ID, Email, Name, Phone..." value="${state.adminOrderSearchQuery}" onkeyup="handleAdminOrderSearch(event)">
              <button class="search-btn" onclick="triggerAdminOrderSearch()"><i class="fas fa-search"></i></button>
            </div>
            ${searchQ ? `
              <button class="btn btn-secondary" onclick="clearAdminOrderSearch()" style="font-size:0.75rem; padding:0.6rem 1rem; margin:0; background-color: var(--color-bg-card);">
                <i class="fas fa-times" style="color: var(--color-accent-gold);"></i> Clear Search
              </button>
            ` : ''}

            <!-- Date picker filter daily/weekly -->
            ${state.adminMetricView === 'daily' || state.adminMetricView === 'weekly' ? `
              <div style="display: flex; align-items: center; gap: 0.5rem; background: var(--color-bg-card); border: 1px solid var(--color-border); padding: 0.5rem 1rem; border-radius: 4px;">
                <label for="admin-orders-date-filter" style="margin: 0; font-size: 0.75rem; font-weight: 600; color: var(--color-accent-gold);">
                  ${state.adminMetricView === 'daily' ? 'Select Date:' : 'Week Containing:'}
                </label>
                <input type="date" id="admin-orders-date-filter" value="${state.adminFilterDate}" onchange="handleAdminChangeDateFilter(this.value)" oninput="handleAdminChangeDateFilter(this.value)" style="background: transparent; border: none; color: var(--color-text-main); font-size: 0.8rem; font-family: inherit; outline: none; cursor: pointer;">
              </div>
            ` : ''}
            
            <!-- Month filter -->
            ${state.adminMetricView === 'monthly' ? `
              <div style="display: flex; align-items: center; gap: 0.5rem; background: var(--color-bg-card); border: 1px solid var(--color-border); padding: 0.5rem 1rem; border-radius: 4px;">
                <label for="admin-orders-month-filter" style="margin: 0; font-size: 0.75rem; font-weight: 600; color: var(--color-accent-gold);">Select Month:</label>
                <input type="month" id="admin-orders-month-filter" value="${state.adminFilterMonth}" onchange="handleAdminChangeMonthFilter(this.value)" style="background: transparent; border: none; color: var(--color-text-main); font-size: 0.8rem; font-family: inherit; outline: none; cursor: pointer;">
              </div>
            ` : ''}
            
            <!-- Custom Date Range picker -->
            ${state.adminMetricView === 'custom' ? `
              <div style="display: flex; align-items: center; gap: 0.5rem; background: var(--color-bg-card); border: 1px solid var(--color-border); padding: 0.5rem 1rem; border-radius: 4px;">
                <label style="margin: 0; font-size: 0.75rem; font-weight: 600; color: var(--color-accent-gold);">Range:</label>
                <input type="date" id="admin-orders-start-filter" value="${state.adminFilterStartDate}" onchange="handleAdminChangeStartDateFilter(this.value)" style="background: transparent; border: none; color: var(--color-text-main); font-size: 0.8rem; font-family: inherit; outline: none; cursor: pointer; width:115px;">
                <span style="font-size:0.8rem; color:var(--color-text-muted);">to</span>
                <input type="date" id="admin-orders-end-filter" value="${state.adminFilterEndDate}" onchange="handleAdminChangeEndDateFilter(this.value)" style="background: transparent; border: none; color: var(--color-text-main); font-size: 0.8rem; font-family: inherit; outline: none; cursor: pointer; width:115px;">
              </div>
            ` : ''}
            
            <!-- Download Button -->
            <button class="btn btn-secondary" onclick="downloadDailyOrdersCSV()" style="font-size:0.75rem; padding:0.6rem 1.2rem; display:flex; gap:0.5rem; align-items:center; margin:0; background-color: var(--color-bg-card);">
              <i class="fas fa-download" style="color: var(--color-accent-gold);"></i> Download CSV
            </button>
          </div>
        </div>

        <div class="admin-table-wrapper">
          <table class="admin-table">
            <thead>
              <tr>
                <th>Order ID</th>
                <th>Channel</th>
                <th>Customer Email</th>
                <th>Order Date</th>
                <th>Purchased Items</th>
                <th style="text-align:right;">Grand Total</th>
                <th>Order Status</th>
                <th style="text-align:center;">Action</th>
              </tr>
            </thead>
            <tbody>
              ${ordersRows.length === 0 ? `<tr><td colspan="8" style="text-align:center; padding:5rem; color:var(--color-text-muted); font-style:italic;">No orders registered for this date.</td></tr>` : ordersRows}
            </tbody>
          </table>
        </div>
      </div>
      
      <div id="admin-pane-inventory" style="display: ${state.adminActiveTab === 'inventory' ? 'block' : 'none'};">
        <!-- Add Product Form Container (hidden by default) -->
        <div id="admin-add-product-form-container" style="display: none; background-color: var(--color-bg-card); border: 1px solid var(--color-border); padding: 2.5rem; margin-bottom: 3rem;">
          <h4 style="font-size: 1.1rem; margin-bottom: 2rem; border-bottom: 1px solid var(--color-border); padding-bottom: 0.5rem;">Add New Attire Selection</h4>
          <form id="admin-add-product-form" onsubmit="handleAdminAddProduct(event)">
            <div class="form-row">
              <div class="form-group">
                <label>Product Title</label>
                <input type="text" class="form-input" id="new-prod-title" required placeholder="e.g. Sartorial Charcoal Linen Shirt">
              </div>
              <div class="form-group">
                <label>Category Section</label>
                <select class="form-input" id="new-prod-category" required style="background-color: var(--color-bg-input); border:1px solid var(--color-border); cursor:pointer;">
                  <option value="shirts">Shirts</option>
                  <option value="pants">Pants</option>
                  <option value="tshirts">T-Shirts</option>
                </select>
              </div>
            </div>
            
            <div class="form-row">
              <div class="form-group">
              <label>Retail Price (₹)</label>
              <input type="number" class="form-input" id="new-prod-price" step="0.01" min="1" required placeholder="e.g. 195.00">
            </div>
              <div class="form-group">
                <label>Attire Photo (File Upload)</label>
                <input type="file" class="form-input" id="new-prod-file" accept="image/*" style="padding:0.6rem;">
              </div>
            </div>
            
            <div class="form-group">
              <label>Image Fallback URL / Path (if not uploading file)</label>
              <input type="text" class="form-input" id="new-prod-image-url" placeholder="e.g. assets/shirt_white.jpg or https://images.unsplash.com/photo-...">
            </div>

            <div class="form-group">
              <label>Attire Description</label>
              <textarea class="form-input" id="new-prod-desc" rows="3" style="resize:none;" required placeholder="Enter description highlighting premium cut, weaves, and draping features..."></textarea>
            </div>

            <div class="form-row">
              <div class="form-group">
                <label>Available Sizes (comma-separated)</label>
                <input type="text" class="form-input" id="new-prod-sizes" required placeholder="e.g. S, M, L, XL or 30, 32, 34, 36">
              </div>
              <div class="form-group" style="display:none;">
                <label>Available Colors</label>
                <input type="hidden" id="new-prod-colors" value="Standard:#C5A880">
              </div>
            </div>

            <div class="form-group">
              <label>Key Features / Details (newline-separated bullet points)</label>
              <textarea class="form-input" id="new-prod-features" rows="3" style="resize:none;" required placeholder="100% natural organic flax&#10;Mother-of-pearl buttons&#10;French seam details"></textarea>
            </div>

            <div style="display:flex; gap:1.5rem; margin-top:2.5rem;">
              <button type="submit" class="btn btn-primary" style="flex:1;">Create Attire Selection</button>
              <button type="button" class="btn btn-secondary" onclick="toggleAdminAddProductForm()" style="flex:1;">Cancel</button>
            </div>
          </form>
        </div>

        <div id="admin-inventory-list-container">
          <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:2.5rem;">
            <h3 style="font-size: 1.25rem; letter-spacing:0.05em; margin:0;">Catalog Inventory Control</h3>
            <button class="btn btn-secondary" onclick="toggleAdminAddProductForm()" style="font-size:0.75rem; padding:0.6rem 1.2rem;">
              <i class="fas fa-plus"></i> Add New Product
            </button>
          </div>
          <div class="inventory-list">
            ${inventoryItemsHtml}
          </div>
        </div>
      </div>
      
      <div id="admin-pane-customers" style="display: ${state.adminActiveTab === 'customers' ? 'block' : 'none'};">
        <h3 style="font-size: 1.25rem; margin-bottom: 2rem; letter-spacing:0.05em;">Registered Client Directory</h3>
        <div class="admin-table-wrapper">
          <table class="admin-table">
            <thead>
              <tr>
                <th>Member Name</th>
                <th>Email Address</th>
                <th>Sizing Profile</th>
                <th>Join Date</th>
              </tr>
            </thead>
            <tbody>
              ${customersRows}
            </tbody>
          </table>
        </div>
      </div>

      <!-- Payment Settings Pane -->
      <div id="admin-pane-payment" style="display: ${state.adminActiveTab === 'payment' ? 'block' : 'none'};">
        <h3 style="font-size: 1.25rem; margin-bottom: 2rem; letter-spacing:0.05em;">Payment Account Destination Settings</h3>
        <p style="color: var(--color-text-muted); font-size: 0.85rem; margin-bottom: 2.5rem; line-height: 1.6;">
          Configure your merchant credentials below. All customer transaction checkouts and dynamic UPI QR codes will be routed to receive funds into these verified account configurations.
        </p>
        
        <div class="glass-panel" style="padding: 2.5rem; background-color: var(--color-bg-card); max-width: 600px;">
          <form onsubmit="handleSavePaymentSettings(event)">
            <h4 style="font-size: 0.9rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-accent-gold); margin-bottom: 1.5rem; border-bottom: 1px dashed var(--color-border); padding-bottom: 0.5rem;">Razorpay Integration Keys</h4>
            <div id="admin-razorpay-credentials" style="margin-bottom: 1.5rem;">
              <div class="form-group" style="margin-bottom: 1.5rem;">
                <label>Razorpay Key ID</label>
                <input type="text" class="form-input" id="admin-rzp-key" value="${state.merchantConfig?.razorpay_key_id || ''}" placeholder="rzp_test_xxxxxx">
              </div>
              <div class="form-group" style="margin-bottom: 1.5rem;">
                <label>Razorpay Key Secret</label>
                <input type="password" class="form-input" id="admin-rzp-secret" value="${state.merchantConfig?.razorpay_key_secret || ''}" placeholder="Key Secret Value">
              </div>
            </div>

            <div class="form-group" style="margin-bottom: 1.5rem;">
              <label>Merchant UPI ID (VPA)</label>
              <input type="text" class="form-input" id="admin-upi-id" value="${state.merchantConfig?.upi_id || ''}" placeholder="e.g. name@upi" required>
            </div>
            
            <div class="form-group" style="margin-bottom: 1.5rem;">
              <label>Bank Account Holder Name</label>
              <input type="text" class="form-input" id="admin-holder-name" value="${state.merchantConfig?.account_holder || ''}" placeholder="e.g. Suresh Prem" required>
            </div>
            
            <div class="form-row" style="gap: 1.5rem; margin-bottom: 2rem;">
              <div class="form-group" style="margin-bottom: 0;">
                <label>Bank Name</label>
                <input type="text" class="form-input" id="admin-bank-name" value="${state.merchantConfig?.bank_name || ''}" placeholder="e.g. HDFC Bank" required>
              </div>
              <div class="form-group" style="margin-bottom: 0;">
                <label>Account Number</label>
                <input type="text" class="form-input" id="admin-account-num" value="${state.merchantConfig?.account_number || ''}" placeholder="e.g. 1234567890" required>
              </div>
            </div>
            
            <button type="submit" class="btn btn-primary" style="padding: 0.8rem 2rem;">
              Save Payment Settings
            </button>
          </form>
        </div>
      </div>

      <!-- AI Predictions Pane -->
      <div id="admin-pane-predictions" style="display: ${state.adminActiveTab === 'predictions' ? 'block' : 'none'};">
        <h3 style="font-size: 1.25rem; margin-bottom: 2rem; letter-spacing:0.05em;">AI Sales & Inventory Forecaster</h3>
        <p style="color: var(--color-text-muted); font-size: 0.85rem; margin-bottom: 2.5rem; line-height: 1.6;">
          Real-time machine-learning projections analyzed from database order volumes, sizing sales velocities, and current warehouse stock registry.
        </p>

        ${(() => {
          if (!state.aiPredictions) {
            return `<div class="glass-panel" style="padding: 2.5rem; text-align: center; color: var(--color-text-muted);">Awaiting model computation pipeline...</div>`;
          }

          const risks = state.aiPredictions.inventoryRisk || [];
          const recs = state.aiPredictions.recommendations || [];
          const forecast = state.aiPredictions.revenueForecast || 0;
          const totalRev = state.aiPredictions.totalRevenue || 0;

          const recsHtml = recs.map(r => {
            const isCritical = r.toLowerCase().startsWith('critical') || r.toLowerCase().startsWith('high');
            const alertColor = isCritical ? 'rgba(220, 53, 69, 0.12)' : 'rgba(255, 193, 7, 0.12)';
            const borderColor = isCritical ? 'var(--color-danger)' : 'var(--color-warning)';
            const icon = isCritical ? 'fa-exclamation-triangle' : 'fa-lightbulb';
            return `
              <div style="background: ${alertColor}; border: 1px solid ${borderColor}; border-radius: 6px; padding: 1.2rem; margin-bottom: 1rem; display: flex; gap: 0.8rem; align-items: center;">
                <i class="fas ${icon}" style="color: ${borderColor}; font-size: 1.1rem;"></i>
                <span style="font-size: 0.85rem; font-weight: 500; color: var(--color-text-main);">${r}</span>
              </div>
            `;
          }).join('');

          const riskRowsHtml = risks.map(r => {
            let badgeColor = 'rgba(40, 167, 69, 0.2)';
            let textColor = 'var(--color-success)';
            if (r.status === 'Out of Stock') {
              badgeColor = 'rgba(220, 53, 69, 0.15)';
              textColor = 'var(--color-danger)';
            } else if (r.status === 'Critical Risk') {
              badgeColor = 'rgba(220, 53, 69, 0.2)';
              textColor = 'var(--color-danger)';
            } else if (r.status === 'Moderate Risk') {
              badgeColor = 'rgba(255, 193, 7, 0.2)';
              textColor = 'var(--color-warning)';
            }

            return `
              <tr>
                <td style="font-weight: 600;">${r.title}</td>
                <td style="font-weight: 600; color: var(--color-accent-gold); text-align: center;">${r.size}</td>
                <td style="text-align: center; font-weight: 500;">${r.stock}</td>
                <td style="text-align: center;">${r.sold} units</td>
                <td style="text-align: center; font-weight: 600; color: var(--color-accent-gold);">${r.velocity} / wk</td>
                <td style="text-align: center;">${r.status === 'Out of Stock' ? '0 days' : `${r.daysLeft} days`}</td>
                <td style="text-align: center;">
                  <span style="padding: 0.25rem 0.6rem; font-size: 0.65rem; border-radius: 4px; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; background: ${badgeColor}; color: ${textColor};">
                    ${r.status}
                  </span>
                </td>
              </tr>
            `;
          }).join('');

          return `
            <div class="grid-two-col" style="margin-bottom: 3rem; align-items: stretch;">
              <!-- Left: Financial Projection -->
              <div class="glass-panel" style="padding: 2.5rem; background-color: var(--color-bg-card); display: flex; flex-direction: column; justify-content: center;">
                <h4 style="margin:0 0 1.5rem 0; font-size:0.8rem; text-transform:uppercase; letter-spacing:0.1em; color:var(--color-text-muted); font-weight:600;">30-Day Revenue Forecasting</h4>
                <div style="font-size: 0.8rem; color: var(--color-text-muted); margin-bottom: 0.5rem;">Current Historic Revenue:</div>
                <div style="font-family: var(--font-display); font-size: 2rem; color: var(--color-text-main); font-weight: 300; margin-bottom: 1.5rem;">₹${totalRev.toFixed(2)}</div>
                
                <div style="font-size: 0.8rem; color: var(--color-text-muted); margin-bottom: 0.5rem; display: flex; align-items: center; gap: 0.4rem;">
                  Projected Next Month: <span style="background: rgba(40,167,69,0.15); color: var(--color-success); font-size: 0.65rem; padding: 0.15rem 0.4rem; border-radius: 4px; font-weight:600;">+15% Growth</span>
                </div>
                <div style="font-family: var(--font-display); font-size: 2.4rem; color: var(--color-accent-gold); font-weight: 600;">₹${forecast.toFixed(2)}</div>
                <p style="font-size: 0.7rem; color: var(--color-text-muted); margin-top: 1.5rem; line-height: 1.5;">
                  Calculated based on rolling order count coefficients and customer fitting queue expansion vectors.
                </p>
              </div>

              <!-- Right: AI Sartorial Recommendations -->
              <div class="glass-panel" style="padding: 2.5rem; background-color: var(--color-bg-card); display: flex; flex-direction: column;">
                <h4 style="margin:0 0 1.5rem 0; font-size:0.8rem; text-transform:uppercase; letter-spacing:0.1em; color:var(--color-text-muted); font-weight:600;">Replenishment Directives</h4>
                <div style="flex-grow: 1; overflow-y: auto; max-height: 250px; padding-right: 0.5rem;">
                  ${recsHtml}
                </div>
              </div>
            </div>

            <!-- Bottom Table: Sizing Velocity Registry -->
            <h4 style="font-size: 0.85rem; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 1.5rem; font-weight: 600;">Sizing Velocity Registry</h4>
            <div class="admin-table-wrapper" style="margin-bottom: 2rem;">
              <table class="admin-table">
                <thead>
                  <tr>
                    <th>Attire Item</th>
                    <th style="text-align: center;">Size</th>
                    <th style="text-align: center;">Current Stock</th>
                    <th style="text-align: center;">Total Sold</th>
                    <th style="text-align: center;">Sales Velocity</th>
                    <th style="text-align: center;">Forecasted Run-out</th>
                    <th style="text-align: center;">Replenish Risk</th>
                  </tr>
                </thead>
                <tbody>
                  ${riskRowsHtml || `<tr><td colspan="7" style="text-align: center; color: var(--color-text-muted);">No sales data registered in SQLite history. Place orders to populate predictive trends.</td></tr>`}
                </tbody>
              </table>
            </div>
          `;
        })()}
      </div>

      <!-- Coupons Management Pane -->
      <div id="admin-pane-coupons" style="display: ${state.adminActiveTab === 'coupons' ? 'block' : 'none'};">
        <h3 style="font-size: 1.25rem; margin-bottom: 2rem; letter-spacing:0.05em;">Coupon Code Management</h3>
        <p style="color: var(--color-text-muted); font-size: 0.85rem; margin-bottom: 2.5rem; line-height: 1.6;">
          Create and delete coupon codes that customers can use during checkout. Note that coupon codes are case-insensitive.
        </p>

        <div class="grid-two-col-uneven" style="align-items: start;">
          <!-- Left: List of coupons -->
          <div class="admin-table-wrapper">
            <table class="admin-table">
              <thead>
                <tr>
                  <th>Promo Code</th>
                  <th>Discount Type</th>
                  <th style="text-align: right;">Value</th>
                  <th style="text-align: center;">Action</th>
                </tr>
              </thead>
              <tbody>
                ${couponsRows}
              </tbody>
            </table>
          </div>

          <!-- Right: Add Coupon Form -->
          <div class="glass-panel" style="padding: 2rem; background-color: var(--color-bg-card);">
            <h4 style="font-size: 0.9rem; font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-accent-gold); margin-bottom: 1.5rem; border-bottom: 1px dashed var(--color-border); padding-bottom: 0.5rem;">Create Promo Coupon</h4>
            <form onsubmit="handleAdminAddCoupon(event)">
              <div class="form-group" style="margin-bottom: 1.2rem;">
                <label>Promo Code (e.g. WELCOME25)</label>
                <input type="text" class="form-input" id="admin-coupon-code" required placeholder="WELCOME25" style="text-transform: uppercase;">
              </div>
              <div class="form-group" style="margin-bottom: 1.2rem;">
                <label>Discount Type</label>
                <select class="form-input" id="admin-coupon-type" required style="background: var(--color-bg-input); color: var(--color-text-main);">
                  <option value="percent" style="background: var(--color-bg-card);">Percentage (%)</option>
                  <option value="flat" style="background: var(--color-bg-card);">Flat Discount (₹)</option>
                </select>
              </div>
              <div class="form-group" style="margin-bottom: 1.5rem;">
                <label>Discount Value</label>
                <input type="number" step="0.01" class="form-input" id="admin-coupon-value" required placeholder="25.00">
              </div>
              <button type="submit" class="btn btn-primary" style="width: 100%; padding: 0.8rem;">Create Coupon</button>
            </form>
          </div>
        </div>
      </div>

      <!-- In-Store POS Pane -->
      <div id="admin-pane-pos" style="display: ${state.adminActiveTab === 'pos' ? 'block' : 'none'};">
        ${getPOSTemplate()}
      </div>
    </div>
  `;
}

function getPOSTemplate() {
  // 1. Filter products based on search keyword
  const filteredProds = PRODUCT_CATALOG.filter(p => {
    if (!p.isVisible) return false;
    return p.title.toLowerCase().includes(state.posSearchQuery.toLowerCase()) ||
           p.id.toLowerCase().includes(state.posSearchQuery.toLowerCase());
  });

  // 2. Map POS cart items
  let cartItemsHtml = "";
  let subtotal = 0;
  if (state.posCart.length === 0) {
    cartItemsHtml = `
      <tr>
        <td colspan="5" style="text-align: center; color: var(--color-text-muted); padding: 3rem 1rem;">
          No items added to current ticket.
        </td>
      </tr>
    `;
  } else {
    cartItemsHtml = state.posCart.map((item, idx) => {
      const itemSub = item.price * item.qty;
      subtotal += itemSub;
      return `
        <tr>
          <td>
            <div style="font-weight:600; color:var(--color-text-main);">${item.title}</div>
            <div style="font-size:0.75rem; color:var(--color-text-muted);">Size: ${item.size} | Color: ${item.color}</div>
          </td>
          <td>₹${item.price.toFixed(2)}</td>
          <td>
            <div style="display:flex; align-items:center; gap:0.5rem;">
              <button class="qty-btn" onclick="updatePOSQty(${idx}, -1)" style="width:24px; height:24px; display:inline-flex; align-items:center; justify-content:center; padding:0; font-size:0.7rem; border-color:var(--color-border); border-radius:3px;">-</button>
              <span style="font-size:0.85rem; font-weight:600; width:20px; text-align:center;">${item.qty}</span>
              <button class="qty-btn" onclick="updatePOSQty(${idx}, 1)" style="width:24px; height:24px; display:inline-flex; align-items:center; justify-content:center; padding:0; font-size:0.7rem; border-color:var(--color-border); border-radius:3px;">+</button>
            </div>
          </td>
          <td>₹${itemSub.toFixed(2)}</td>
          <td style="text-align:right;">
            <button onclick="removeFromPOSCart(${idx})" style="background:transparent; border:none; color:var(--color-danger); cursor:pointer; font-size:0.85rem;" title="Remove item">
              <i class="fas fa-trash-alt"></i>
            </button>
          </td>
        </tr>
      `;
    }).join('');
  }

  // 3. Coupon logic
  let discount = 0;
  if (state.posAppliedCoupon) {
    if (state.posAppliedCoupon.discountType === 'percent') {
      discount = subtotal * (state.posAppliedCoupon.value / 100);
    } else {
      discount = Math.min(state.posAppliedCoupon.value, subtotal);
    }
  }
  const gst = state.posIncludeGST ? (subtotal - discount) * 0.05 : 0; // Optional GST 5%
  const total = (subtotal - discount) + gst;

  // 4. Products list HTML
  const prodsGridHtml = filteredProds.map(p => {
    // Generate quick selector dropdowns for size and color
    const sizeOptions = p.sizes.map(s => {
      const stock = p.sizes_stock[s] || 0;
      return `<option value="${s}" ${stock <= 0 ? 'disabled' : ''}>Size ${s} (${stock} left)</option>`;
    }).join('');
    
    const colorOptions = p.colors.map(c => `<option value="${c.name}">${c.name}</option>`).join('');

    const formId = `pos-add-form-${p.id}`;

    return `
      <div class="glass-panel" style="padding: 1.5rem; display: flex; gap: 1rem; align-items: center; background-color: var(--color-bg-card);">
        <img src="${p.image}" alt="${p.title}" style="width:65px; height:65px; object-fit:cover; border-radius:4px; border:1px solid var(--color-border);">
        <div style="flex-grow:1;">
          <h4 style="margin:0 0 0.5rem 0; font-size:0.85rem; font-weight:600; color:var(--color-text-main);">${p.title}</h4>
          <div style="font-size:0.85rem; color:var(--color-accent-gold); font-weight:600; margin-bottom:0.5rem;">₹${p.price.toFixed(2)}</div>
          
          <form id="${formId}" style="display:flex; gap:0.5rem; flex-wrap:wrap; align-items:center;" onsubmit="event.preventDefault(); handleAddProductToPOS('${p.id}')">
            <select class="form-input" name="size" required style="width:110px; font-size:0.75rem; padding:0.3rem 0.5rem; background:var(--color-bg-input); border-color:var(--color-border); height:auto;">
              ${sizeOptions}
            </select>
            <select class="form-input" name="color" required style="width:110px; font-size:0.75rem; padding:0.3rem 0.5rem; background:var(--color-bg-input); border-color:var(--color-border); height:auto;">
              ${colorOptions}
            </select>
            <button type="submit" class="btn btn-primary" style="padding:0.4rem 0.8rem; font-size:0.7rem; border-radius:3px;">
              <i class="fas fa-plus"></i> Add
            </button>
          </form>
        </div>
      </div>
    `;
  }).join('');

  return `
    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:2rem; flex-wrap:wrap; gap:1.2rem; border-bottom:1px solid var(--color-border); padding-bottom:1.5rem;">
      <div>
        <h3 style="font-size: 1.5rem; margin: 0; font-family: var(--font-display); font-weight: 300; letter-spacing:0.02em; color:var(--color-text-main);">
          <i class="fas fa-cash-register" style="color:var(--color-accent-gold); margin-right:0.4rem;"></i> In-Store Checkout Terminal
        </h3>
        <p style="font-size:0.85rem; color:var(--color-text-muted); margin-top:0.4rem; margin-bottom:0;">Process immediate physical transactions, custom tailored orders, and print tax receipts.</p>
      </div>
      <div style="display:flex; gap:0.8rem; align-items:center;">
        <button onclick="openCustomPOSItemModal()" class="btn btn-secondary" style="padding:0.6rem 1.2rem; font-size:0.75rem; margin:0; display:flex; gap:0.4rem; align-items:center; background-color: var(--color-bg-card);">
          <i class="fas fa-plus-circle" style="color: var(--color-accent-gold);"></i> Custom / Unlisted Item
        </button>
        <button onclick="togglePOSFullscreen()" class="btn btn-secondary" style="padding:0.6rem 1.2rem; font-size:0.75rem; margin:0; display:flex; gap:0.4rem; align-items:center; background-color: var(--color-bg-card); border-color: var(--color-accent-gold); color: var(--color-accent-gold);">
          <i class="fas ${state.posFullscreen ? 'fa-compress' : 'fa-expand'}"></i> ${state.posFullscreen ? 'Exit Terminal' : 'Full Screen Terminal'}
        </button>
      </div>
    </div>

    <div class="grid-two-col-uneven" style="align-items: start; gap: 2.5rem;">
      <!-- Left Column: Fast Product Lookup -->
      <div>
        <div class="search-input-wrapper" style="margin-bottom: 2rem;">
          <input type="text" class="search-input" id="pos-search-box" placeholder="Lookup apparel by name or ID..." value="${state.posSearchQuery}" onkeyup="handlePOSSearch(event)">
          <button class="search-btn" onclick="triggerPOSSearch()"><i class="fas fa-search"></i></button>
        </div>
        
        <div style="display:flex; flex-direction:column; gap:1.2rem; max-height: 60vh; overflow-y: auto; padding-right:0.5rem;">
          ${prodsGridHtml || `<div style="text-align:center; padding:3rem 0; color:var(--color-text-muted);">No attire match found.</div>`}
        </div>
      </div>

      <!-- Right Column: Current Ticket & Checkout -->
      <div class="glass-panel" style="padding: 2.2rem; background-color: var(--color-bg-card); display: flex; flex-direction: column; gap: 1.5rem;">
        <h4 style="margin:0; font-size: 0.95rem; text-transform: uppercase; letter-spacing:0.05em; border-bottom: 1px dashed var(--color-border); padding-bottom: 0.5rem; color:var(--color-accent-gold);">Current Sales Ticket</h4>
        
        <div class="admin-table-wrapper" style="max-height: 250px; overflow-y:auto; margin-bottom: 1rem; border: 1px solid var(--color-border);">
          <table class="admin-table" style="font-size:0.8rem;">
            <thead>
              <tr>
                <th>Apparel Description</th>
                <th>Rate</th>
                <th>Qty</th>
                <th>Sub</th>
                <th style="text-align:right;"></th>
              </tr>
            </thead>
            <tbody>
              ${cartItemsHtml}
            </tbody>
          </table>
        </div>

        <!-- Walk-In Customer Info -->
        <div style="border-top: 1px dashed var(--color-border); padding-top: 1rem;">
          <label style="display:block; font-size:0.75rem; color:var(--color-text-muted); font-weight:600; text-transform:uppercase; letter-spacing:0.05em; margin-bottom:1rem;">Customer Information</label>
          <div class="form-row" style="grid-template-columns: 1fr 1fr !important; gap:1rem;">
            <div class="form-group">
              <label style="font-size:0.7rem;">Customer Name</label>
              <input type="text" class="form-input" id="pos-cust-name" placeholder="Walk-In Customer" value="${state.posCustomer.name || ''}" oninput="state.posCustomer.name=this.value">
            </div>
            <div class="form-group">
              <label style="font-size:0.7rem;">Phone Number</label>
              <input type="text" class="form-input" id="pos-cust-phone" placeholder="N/A" value="${state.posCustomer.phone || ''}" oninput="state.posCustomer.phone=this.value">
            </div>
          </div>
          <div class="form-group" style="margin-top: 0.8rem;">
            <label style="font-size:0.7rem;">Email Address</label>
            <input type="email" class="form-input" id="pos-cust-email" placeholder="walkin@hairah.com" value="${state.posCustomer.email || ''}" oninput="state.posCustomer.email=this.value">
          </div>
        </div>

        <!-- Coupon Settings -->
        <div style="border-top: 1px dashed var(--color-border); padding-top: 1rem; display: flex; gap: 0.8rem; align-items: flex-end;">
          <div class="form-group" style="flex-grow:1;">
            <label style="font-size:0.7rem;">In-Store Promo Discount Code</label>
            <input type="text" class="form-input" id="pos-promo-code" placeholder="WELCOME10" style="text-transform: uppercase;">
          </div>
          ${state.posAppliedCoupon ? `
            <button onclick="removePOSCoupon()" class="btn btn-secondary" style="padding:0.8rem 1rem; border-color:var(--color-danger); color:var(--color-danger);">Remove</button>
          ` : `
            <button onclick="applyPOSCoupon()" class="btn btn-secondary" style="padding:0.8rem 1rem;">Apply</button>
          `}
        </div>

        <!-- Total Calculation Box -->
        <div style="background: rgba(255,255,255,0.02); border: 1px solid var(--color-border); padding: 1.25rem; border-radius: 4px;">
          <div style="display:flex; justify-content:space-between; font-size:0.8rem; margin-bottom:0.6rem; color:var(--color-text-muted);">
            <span>Subtotal:</span>
            <span>₹${subtotal.toFixed(2)}</span>
          </div>
          ${state.posAppliedCoupon ? `
            <div style="display:flex; justify-content:space-between; font-size:0.8rem; margin-bottom:0.6rem; color:var(--color-success); font-weight:600;">
              <span>Discount (${state.posAppliedCoupon.code}):</span>
              <span>-₹${discount.toFixed(2)}</span>
            </div>
          ` : ''}
          <div style="display:flex; justify-content:space-between; align-items:center; font-size:0.8rem; margin-bottom:0.6rem; color:var(--color-text-muted);">
            <div style="display:flex; align-items:center; gap:0.4rem;">
              <input type="checkbox" id="pos-include-gst-cb" ${state.posIncludeGST ? 'checked' : ''} onchange="state.posIncludeGST=this.checked; renderCurrentView();" style="width:14px; height:14px; margin:0; cursor:pointer;">
              <label for="pos-include-gst-cb" style="margin:0; cursor:pointer;">Apply GST (5%)</label>
            </div>
            <span>₹${gst.toFixed(2)}</span>
          </div>
          <div style="display:flex; justify-content:space-between; font-size:1.15rem; font-weight:700; color:var(--color-text-main); border-top:1px solid var(--color-border); padding-top:0.8rem;">
            <span>Grand Total:</span>
            <span style="color:var(--color-accent-gold);">₹${total.toFixed(2)}</span>
          </div>
        </div>

        <!-- Payment Method -->
        <div style="display:flex; gap:0.5rem; justify-content:space-between; align-items:center;">
          <label style="font-size:0.8rem; color:var(--color-text-muted); font-weight:600; margin:0;">Payment Mode:</label>
          <div style="display:flex; gap:0.5rem;">
            <button class="btn ${state.posPaymentMethod !== 'UPI' && state.posPaymentMethod !== 'Card' ? 'btn-primary' : 'btn-secondary'}" onclick="state.posPaymentMethod='Cash'; renderCurrentView();" style="padding:0.4rem 0.8rem; font-size:0.75rem;">Cash</button>
            <button class="btn ${state.posPaymentMethod === 'UPI' ? 'btn-primary' : 'btn-secondary'}" onclick="state.posPaymentMethod='UPI'; renderCurrentView();" style="padding:0.4rem 0.8rem; font-size:0.75rem;">UPI</button>
            <button class="btn ${state.posPaymentMethod === 'Card' ? 'btn-primary' : 'btn-secondary'}" onclick="state.posPaymentMethod='Card'; renderCurrentView();" style="padding:0.4rem 0.8rem; font-size:0.75rem;">Card</button>
          </div>
        </div>

        <button onclick="checkoutPOS()" class="btn btn-primary" style="width:100%; padding:1rem; font-size:0.9rem; text-transform:uppercase; letter-spacing:0.05em; font-weight:700;">
          <i class="fas fa-print" style="margin-right:0.4rem;"></i> Complete Sale & Print
        </button>
      </div>
    </div>
  `;
}

// --- POS Action Handlers ---

window.handlePOSSearch = function(event) {
  state.posSearchQuery = event.target.value;
  if (event.key === "Enter") {
    renderCurrentView();
  }
};

window.triggerPOSSearch = function() {
  const input = document.getElementById("pos-search-box");
  if (input) {
    state.posSearchQuery = input.value;
    renderCurrentView();
  }
};

window.handleAddProductToPOS = function(prodId) {
  const form = document.getElementById(`pos-add-form-${prodId}`);
  if (!form) return;
  const size = form.elements['size'].value;
  const color = form.elements['color'].value;
  
  const prod = PRODUCT_CATALOG.find(p => p.id === prodId);
  if (!prod) return;
  
  const stock = prod.sizes_stock[size] || 0;
  const existingIdx = state.posCart.findIndex(item => item.id === prodId && item.size === size && item.color === color);
  
  if (existingIdx !== -1) {
    const newQty = state.posCart[existingIdx].qty + 1;
    if (newQty > stock) {
      showToast(`Cannot add. Only ${stock} units in stock for size ${size}.`);
      return;
    }
    state.posCart[existingIdx].qty = newQty;
  } else {
    if (stock < 1) {
      showToast(`Size ${size} is out of stock.`);
      return;
    }
    state.posCart.push({
      id: prod.id,
      title: prod.title,
      price: prod.price,
      size: size,
      color: color,
      qty: 1
    });
  }
  showToast(`Added ${prod.title} (Size: ${size}) to ticket.`);
  renderCurrentView();
};

window.removeFromPOSCart = function(index) {
  state.posCart.splice(index, 1);
  renderCurrentView();
};

window.updatePOSQty = function(index, delta) {
  const item = state.posCart[index];
  const prod = PRODUCT_CATALOG.find(p => p.id === item.id);
  if (!prod) return;
  const stock = prod.sizes_stock[item.size] || 0;
  
  const newQty = item.qty + delta;
  if (newQty < 1) return;
  if (newQty > stock) {
    showToast(`Cannot increase. Only ${stock} units in stock.`);
    return;
  }
  item.qty = newQty;
  renderCurrentView();
};

window.applyPOSCoupon = async function() {
  const input = document.getElementById("pos-promo-code");
  if (!input) return;
  const code = input.value.trim().toUpperCase();
  if (!code) return;
  
  try {
    showToast("Validating in-store coupon...");
    const response = await fetch('/api/coupons/validate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ code })
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || "Invalid coupon");
    }
    state.posAppliedCoupon = {
      code: result.code,
      discountType: result.discountType,
      value: result.value
    };
    showToast(`Promo discount ${code} applied successfully.`);
    renderCurrentView();
  } catch (error) {
    showToast(error.message);
  }
};

window.removePOSCoupon = function() {
  state.posAppliedCoupon = null;
  renderCurrentView();
};

window.checkoutPOS = async function() {
  if (state.posCart.length === 0) {
    showToast("Cannot checkout empty sales ticket.");
    return;
  }
  
  const name = document.getElementById("pos-cust-name").value.trim() || "Walk-In Customer";
  const phone = document.getElementById("pos-cust-phone").value.trim() || "N/A";
  const email = document.getElementById("pos-cust-email").value.trim() || "walkin@hairah.com";
  
  let subtotal = 0;
  state.posCart.forEach(item => {
    subtotal += item.price * item.qty;
  });
  
  let discount = 0;
  if (state.posAppliedCoupon) {
    if (state.posAppliedCoupon.discountType === 'percent') {
      discount = subtotal * (state.posAppliedCoupon.value / 100);
    } else {
      discount = Math.min(state.posAppliedCoupon.value, subtotal);
    }
  }
  const gst = state.posIncludeGST ? (subtotal - discount) * 0.05 : 0;
  const total = (subtotal - discount) + gst;
  
  const orderData = {
    recipientName: name,
    recipientEmail: email,
    phone: phone,
    address: "In-Store Checkout",
    city: "Bengaluru",
    items: state.posCart,
    total: total,
    paymentMethod: state.posPaymentMethod || "Cash"
  };
  
  try {
    showToast("Processing in-store sale...");
    const response = await fetch('/api/pos/orders', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(orderData),
      credentials: 'include'
    });
    const result = await response.json();
    if (!response.ok) {
      throw new Error(result.error || "Checkout failed");
    }
    
    showToast("Checkout completed successfully.");
    
    // Open receipt print dialog modal
    openPOSReceipt(result.orderId, orderData, subtotal, discount, gst, total);
    
    // Clear POS state
    state.posCart = [];
    state.posAppliedCoupon = null;
    state.posCustomer = { name: "", phone: "", email: "" };
    
    // Sync local catalog inventory counts
    await syncSessionAndDatabase();
    renderCurrentView();
  } catch (error) {
    showToast("POS Checkout failed: " + error.message);
  }
};

window.openPOSReceipt = function(orderId, orderData, subtotal, discount, gst, total) {
  const itemsRowsHtml = orderData.items.map(item => `
    <div style="display:flex; justify-content:space-between; font-size:0.8rem; margin-bottom:0.4rem; border-bottom:1px dotted #eee; padding-bottom:0.3rem;">
      <span>${item.title} (x${item.qty}) [Size: ${item.size}]</span>
      <span>₹${(item.price * item.qty).toFixed(2)}</span>
    </div>
  `).join('');
  
  const discountHtml = discount > 0 ? `
    <div style="display:flex; justify-content:space-between; font-size:0.8rem; margin-bottom:0.4rem; color:#28a745;">
      <span>Discount:</span>
      <span>-₹${discount.toFixed(2)}</span>
    </div>
  ` : '';

  const modalHtml = `
    <div class="stripe-modal-backdrop" id="pos-receipt-modal" style="display: flex;">
      <div class="stripe-modal-content" style="max-width: 380px; font-family: 'Courier New', Courier, monospace; color:#000; background:#fff; padding: 2rem; border-radius: 4px; box-shadow: 0 4px 30px rgba(0,0,0,0.3);">
        <div style="text-align:center; border-bottom:1px dashed #000; padding-bottom:1rem; margin-bottom:1rem;">
          <h2 style="font-size:1.4rem; margin:0 0 0.2rem 0; font-weight:700; letter-spacing:1px; color:#000;">HAIRAH</h2>
          <div style="font-size:0.75rem; text-transform:uppercase; letter-spacing:2px; font-weight:600; margin-bottom:0.5rem; color:#000;">Mens World</div>
          <div style="font-size:0.7rem; color:#555;">Bengaluru Store, India</div>
          <div style="font-size:0.7rem; color:#555;">Phone: +91 98765 43210</div>
        </div>
        
        <div style="font-size:0.7rem; margin-bottom:1rem; line-height:1.4; color:#333;">
          <div><strong>Order ID:</strong> ${orderId}</div>
          <div><strong>Date:</strong> ${new Date().toLocaleDateString('en-IN', {day:'numeric', month:'short', year:'numeric'})}</div>
          <div><strong>Customer:</strong> ${orderData.recipientName}</div>
          <div><strong>Phone:</strong> ${orderData.phone}</div>
          <div><strong>Payment Mode:</strong> ${orderData.paymentMethod}</div>
        </div>
        
        <div style="border-bottom:1px dashed #000; padding-bottom:0.8rem; margin-bottom:0.8rem; color:#000;">
          ${itemsRowsHtml}
        </div>
        
        <div style="border-bottom:1px dashed #000; padding-bottom:0.8rem; margin-bottom:1rem; line-height:1.4; color:#000;">
          <div style="display:flex; justify-content:space-between; font-size:0.8rem; margin-bottom:0.4rem;">
            <span>Subtotal:</span>
            <span>₹${subtotal.toFixed(2)}</span>
          </div>
          ${discountHtml}
          ${gst > 0 ? `
            <div style="display:flex; justify-content:space-between; font-size:0.8rem; margin-bottom:0.4rem;">
              <span>GST (5%):</span>
              <span>₹${gst.toFixed(2)}</span>
            </div>
          ` : `
            <div style="display:flex; justify-content:space-between; font-size:0.8rem; margin-bottom:0.4rem; color:#666;">
              <span>GST:</span>
              <span>Exempt</span>
            </div>
          `}
          <div style="display:flex; justify-content:space-between; font-size:1.1rem; font-weight:700; border-top:1px solid #000; padding-top:0.5rem; margin-top:0.5rem;">
            <span>TOTAL PAID:</span>
            <span>₹${total.toFixed(2)}</span>
          </div>
        </div>
        
        <div style="text-align:center; font-size:0.7rem; color:#555; margin-bottom:1.5rem;">
          Thank you for shopping at HAIRAH Men's World!<br>Visit us again.
        </div>
        
        <div style="display:flex; gap:0.5rem;">
          <button onclick="window.print()" class="btn" style="flex-grow:1; background:#000; border:1px solid #000; color:#fff; padding:0.6rem; font-size:0.8rem; cursor:pointer; font-weight:bold;">
            <i class="fas fa-print"></i> Print Receipt
          </button>
          <button onclick="closePOSReceiptModal()" class="btn" style="background:transparent; border:1px solid #ccc; color:#000; padding:0.6rem; font-size:0.8rem; cursor:pointer;">
            Close
          </button>
        </div>
      </div>
    </div>
  `;
  
  const backdrop = document.createElement('div');
  backdrop.id = "pos-receipt-backdrop-wrapper";
  backdrop.innerHTML = modalHtml;
  document.body.appendChild(backdrop);
};

window.closePOSReceiptModal = function() {
  const el = document.getElementById("pos-receipt-backdrop-wrapper");
  if (el) el.remove();
};

window.togglePOSFullscreen = function() {
  state.posFullscreen = !state.posFullscreen;
  
  if (state.posFullscreen) {
    document.body.classList.add("pos-fullscreen-mode-active");
    // Launch HTML5 Native Fullscreen API
    if (document.documentElement.requestFullscreen) {
      document.documentElement.requestFullscreen().catch(err => console.log("Fullscreen request:", err));
    } else if (document.documentElement.webkitRequestFullscreen) {
      document.documentElement.webkitRequestFullscreen();
    }
  } else {
    document.body.classList.remove("pos-fullscreen-mode-active");
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(err => console.log("Exit fullscreen:", err));
    } else if (document.webkitFullscreenElement) {
      document.webkitExitFullscreen();
    }
  }
  
  renderCurrentView();
};

window.openCustomPOSItemModal = function() {
  const modalDiv = document.createElement("div");
  modalDiv.className = "stripe-modal-backdrop";
  modalDiv.id = "custom-pos-item-modal";
  modalDiv.style.display = "flex";
  
  modalDiv.innerHTML = `
    <div class="stripe-modal-content" style="max-width: 420px; padding: 2.2rem; background: var(--color-bg-card); color: var(--color-text-main); font-family: inherit;">
      <div class="stripe-modal-header" style="margin-bottom: 1.5rem; padding-bottom: 1rem; border-color: var(--color-border);">
        <h4 style="margin:0; font-size: 0.95rem; text-transform: uppercase; color:var(--color-accent-gold); font-weight:600;">Add Unlisted Attire Item</h4>
        <button onclick="closeCustomPOSItemModal()" style="background:none; border:none; color:var(--color-text-muted); cursor:pointer; font-size: 1.1rem;"><i class="fas fa-times"></i></button>
      </div>
      
      <form onsubmit="handleAddCustomPOSItem(event)">
        <div class="form-group" style="margin-bottom:1.2rem;">
          <label style="font-size:0.7rem;">Item Title / Description</label>
          <input type="text" class="form-input" id="cpos-title" required placeholder="e.g. Custom Fit Silk Linen Attire" style="background:var(--color-bg-input); border-color:var(--color-border); color:var(--color-text-main);">
        </div>

        <div class="form-group" style="margin-bottom:1.2rem;">
          <label style="font-size:0.7rem;">Unit Price (₹)</label>
          <input type="number" step="0.01" class="form-input" id="cpos-price" required placeholder="1499.00" style="background:var(--color-bg-input); border-color:var(--color-border); color:var(--color-text-main);">
        </div>

        <div class="form-row" style="grid-template-columns: 1fr 1fr !important; gap:1rem; margin-bottom:1.5rem;">
          <div class="form-group">
            <label style="font-size:0.7rem;">Category</label>
            <select class="form-input" id="cpos-category" required style="background:var(--color-bg-input); border-color:var(--color-border); color:var(--color-text-main);">
              <option value="Shirt" style="background:var(--color-bg-card);" selected>Shirt</option>
              <option value="Pant" style="background:var(--color-bg-card);">Pant / Trouser</option>
              <option value="T-Shirt" style="background:var(--color-bg-card);">T-Shirt</option>
              <option value="Suit/Blazer" style="background:var(--color-bg-card);">Suit / Blazer</option>
              <option value="Accessory" style="background:var(--color-bg-card);">Accessory</option>
              <option value="Other" style="background:var(--color-bg-card);">Other / Custom</option>
            </select>
          </div>
          <div class="form-group">
            <label style="font-size:0.7rem;">Size Description</label>
            <select class="form-input" id="cpos-size" required style="background:var(--color-bg-input); border-color:var(--color-border); color:var(--color-text-main);">
              <option value="S" style="background:var(--color-bg-card);">S</option>
              <option value="M" style="background:var(--color-bg-card);" selected>M</option>
              <option value="L" style="background:var(--color-bg-card);">L</option>
              <option value="XL" style="background:var(--color-bg-card);">XL</option>
              <option value="XXL" style="background:var(--color-bg-card);">XXL</option>
              <option value="Unique" style="background:var(--color-bg-card);">Custom / Unique Fit</option>
            </select>
          </div>
        </div>
        
        <button type="submit" class="btn btn-primary" style="width:100%; padding:0.8rem;">Add Item to Ticket</button>
      </form>
    </div>
  `;
  
  document.body.appendChild(modalDiv);
};

window.closeCustomPOSItemModal = function() {
  const modal = document.getElementById("custom-pos-item-modal");
  if (modal) modal.remove();
};

window.handleAddCustomPOSItem = function(e) {
  e.preventDefault();
  const rawTitle = document.getElementById("cpos-title").value.trim();
  const price = parseFloat(document.getElementById("cpos-price").value) || 0;
  const category = document.getElementById("cpos-category").value;
  const size = document.getElementById("cpos-size").value;
  
  const formattedTitle = `${rawTitle} [${category}]`;

  state.posCart.push({
    id: "custom-" + Date.now(),
    title: formattedTitle,
    price: price,
    category: category,
    size: size,
    color: "Standard",
    qty: 1
  });
  
  showToast(`Added custom "${rawTitle}" (${size}) to ticket.`);
  closeCustomPOSItemModal();
  renderCurrentView();
};

// --- Home Actions ---
window.filterAndShop = function(category) {
  state.activeFilter = category;
  navigate("shop");
};

// --- Shop Filter Actions ---
window.setFilter = function(filter) {
  state.activeFilter = filter;
  renderCurrentView();
};

window.handleCatalogSearch = function(event) {
  state.searchQuery = event.target.value;
  if (event.key === "Enter") {
    renderCurrentView();
  }
};

window.triggerCatalogSearch = function() {
  const input = document.getElementById("catalog-search");
  if (input) {
    state.searchQuery = input.value;
    renderCurrentView();
  }
};

window.handleCatalogSort = function(event) {
  state.sortOption = event.target.value;
  renderCurrentView();
};

// --- Wishlist Management Actions ---
window.toggleWishlist = async function(productId) {
  if (!state.currentUser) {
    showToast("Please sign in to save selections to your wishlist.");
    navigate("login");
    return;
  }
  
  try {
    const result = await apiCall('/api/wishlist/toggle', 'POST', { productId });
    if (result.isSaved) {
      state.wishlist.push(productId);
      showToast("Saved to wishlist.");
    } else {
      state.wishlist = state.wishlist.filter(id => id !== productId);
      showToast("Removed from wishlist.");
    }
    updateWishlistBadge();
    
    if (state.currentView === "shop" || state.currentView === "wishlist") {
      renderCurrentView();
    }
  } catch (error) {
    showToast("Wishlist toggle failed.");
  }
};

function updateWishlistBadge() {
  const total = state.wishlist.length;
  wishlistBadge.innerText = total;
  if (total > 0) {
    wishlistBadge.style.display = "inline-flex";
  } else {
    wishlistBadge.style.display = "none";
  }
}

// --- Style Recommendation Matching Logic ---
function getLookRecommendations(prod) {
  let targetCategories = [];
  if (prod.category === 'shirts' || prod.category === 'tshirts') {
    targetCategories = ['pants'];
  } else if (prod.category === 'pants') {
    targetCategories = ['shirts', 'tshirts'];
  }
  
  // Filter active catalog candidates (not the current product, belongs to target categories, visible and in stock)
  const candidates = PRODUCT_CATALOG.filter(p => 
    p.id !== prod.id && 
    targetCategories.includes(p.category) && 
    p.isVisible && 
    (Object.values(p.sizes_stock || {}).reduce((sum, s) => sum + s, 0) > 0)
  );
  
  const getStyleScore = (candidate) => {
    let score = 0;
    
    // Rule A: Fabric Continuity Matching
    const fabricKeywords = ['linen', 'silk', 'cotton', 'wool', 'pima'];
    fabricKeywords.forEach(keyword => {
      const hasMain = prod.description.toLowerCase().includes(keyword) || prod.title.toLowerCase().includes(keyword);
      const hasCand = candidate.description.toLowerCase().includes(keyword) || candidate.title.toLowerCase().includes(keyword);
      if (hasMain && hasCand) score += 5;
    });
    
    // Rule B: Color Contrast Harmony
    const mainIsDark = (prod.colors?.[0]?.name?.toLowerCase() || '').match(/(black|dark|navy|charcoal|ink|indigo)/i) || 
                       prod.description.toLowerCase().match(/(black|dark|navy|charcoal|ink|indigo)/i);
                       
    const candIsLight = (candidate.colors?.[0]?.name?.toLowerCase() || '').match(/(white|light|khaki|cream|beige|off-white|grey|gray)/i) || 
                        candidate.description.toLowerCase().match(/(white|light|khaki|cream|beige|off-white|grey|gray)/i);
                        
    const mainIsLight = (prod.colors?.[0]?.name?.toLowerCase() || '').match(/(white|light|khaki|cream|beige|off-white|grey|gray)/i) || 
                        prod.description.toLowerCase().match(/(white|light|khaki|cream|beige|off-white|grey|gray)/i);
                        
    const candIsDark = (candidate.colors?.[0]?.name?.toLowerCase() || '').match(/(black|dark|navy|charcoal|ink|indigo)/i) || 
                       candidate.description.toLowerCase().match(/(black|dark|navy|charcoal|ink|indigo)/i);
    
    if (mainIsDark && candIsLight) score += 4;
    if (mainIsLight && candIsDark) score += 4;
    
    // Rule C: Formality Alignment
    const isFormalMain = prod.description.toLowerCase().match(/(formal|office|dress|pleated|suit|giza)/i) || prod.title.toLowerCase().match(/(formal|office|dress|pleated|suit|giza)/i);
    const isFormalCand = candidate.description.toLowerCase().match(/(formal|office|dress|pleated|suit|giza)/i) || candidate.title.toLowerCase().match(/(formal|office|dress|pleated|suit|giza)/i);
    if (isFormalMain && isFormalCand) score += 3;
    if (!isFormalMain && !isFormalCand) score += 2;
    
    return score;
  };
  
  // Sort candidates by score descending and return top 3
  return candidates.sort((a, b) => getStyleScore(b) - getStyleScore(a)).slice(0, 3);
}

// --- Product Modal (PDP) Actions ---
let isBackNav = false;
window.openPDP = function(productId) {
  const product = PRODUCT_CATALOG.find(p => p.id === productId);
  if (!product) return;
  
  // Track visual history stack for breadcrumb back navigation
  if (state.selectedProduct && state.selectedProduct.id !== productId && !isBackNav) {
    if (state.pdpHistory.length === 0 || state.pdpHistory[state.pdpHistory.length - 1] !== state.selectedProduct.id) {
      state.pdpHistory.push(state.selectedProduct.id);
    }
  }
  isBackNav = false; // Reset back navigation flag
  
  // Enforce sold out status if all sizes are out of stock
  const totalStock = Object.values(product.sizes_stock || {}).reduce((sum, s) => sum + s, 0);
  product.inStock = totalStock > 0 && product.inStock;
  
  state.selectedProduct = product;

  const recommendations = getLookRecommendations(product);
  let recsHtml = '';
  if (recommendations.length > 0) {
    const recCardsHtml = recommendations.map(r => `
      <div class="rec-card" onclick="openPDP('${r.id}')" style="display: flex; align-items: center; gap: 1rem; padding: 0.8rem; background: var(--color-bg-card); border: 1px solid var(--color-border); border-radius: 4px; cursor: pointer; margin-bottom: 0.8rem; transition: transform 0.2s ease-in-out, border-color 0.2s;">
        <img src="${r.image}" alt="${r.title}" style="width: 50px; height: 50px; object-fit: cover; border-radius: 3px;">
        <div style="flex-grow: 1;">
          <div style="font-size: 0.7rem; text-transform: uppercase; color: var(--color-accent-gold); font-weight: 600;">${r.categoryLabel}</div>
          <h5 style="margin: 0.1rem 0; font-size: 0.85rem; color: var(--color-text-main); font-weight: 500;">${r.title}</h5>
          <div style="font-size: 0.8rem; font-weight: 600; color: var(--color-text-light);">₹${r.price.toFixed(2)}</div>
        </div>
        <i class="fas fa-chevron-right" style="color: var(--color-text-muted); font-size: 0.8rem;"></i>
      </div>
    `).join('');
    
    recsHtml = `
      <div style="border-top: 1px dashed var(--color-border); padding-top: 2rem; margin-top: 2.5rem;">
        <h4 style="font-size: 0.95rem; font-family: var(--font-display); text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 1.2rem; font-weight: 600; color: var(--color-text-main);">
          <i class="fas fa-tshirt" style="margin-right: 0.4rem; color: var(--color-accent-gold);"></i> Complete the Look
        </h4>
        <div class="rec-list">
          ${recCardsHtml}
        </div>
      </div>
    `;
  }

  pdpContentContainer.innerHTML = `
    <div class="pdp-gallery">
      <img src="${product.image}" alt="${product.title}" class="pdp-main-img">
      ${recsHtml}
    </div>
    
    <div class="pdp-details">
      <span class="product-cat" style="margin-bottom: 0.5rem;">${product.categoryLabel}</span>
      <h2 class="pdp-title">${product.title}</h2>
      <div class="pdp-price">₹${product.price.toFixed(2)}</div>
      
      <p class="pdp-desc">${product.description}</p>
      
      <div style="border-top: 1px solid var(--color-border); padding-top: 2rem;">
        <ul style="margin-bottom: 2.5rem; list-style-position: inside; font-size: 0.85rem; color: var(--color-text-muted); line-height: 1.8;">
          ${product.features.map(f => `<li>${f}</li>`).join('')}
        </ul>

        <div class="pdp-selector-group" style="display:none;">
          <div class="selector-title">Select Color</div>
          <div class="color-palette">
            ${product.colors.map((c, i) => `
              <span class="color-option ${i === 0 ? 'active' : ''}" style="background-color: ${c.hex};" data-color-name="${c.name}" onclick="selectPDPColor(this)" title="${c.name}"></span>
            `).join('')}
          </div>
        </div>

        <div class="pdp-selector-group">
          <div class="selector-title">Select Size</div>
          <div class="size-options">
            ${(() => {
              const getRecommendedSize = (cat, sizing, productSizes) => {
                if (!sizing) return null;
                const isNumericSizes = productSizes.some(s => !isNaN(parseFloat(s)));
                if (isNumericSizes) {
                  const targetVal = parseFloat(cat === 'shirts' ? sizing.chest : sizing.waist);
                  if (isNaN(targetVal)) return null;
                  let closestSize = null;
                  let minDiff = Infinity;
                  productSizes.forEach(s => {
                    const sVal = parseFloat(s);
                    if (!isNaN(sVal)) {
                      const diff = Math.abs(sVal - targetVal);
                      if (diff < minDiff) {
                        minDiff = diff;
                        closestSize = s;
                      }
                    }
                  });
                  return closestSize;
                } else {
                  if (cat === 'shirts' && sizing.chest) {
                    const chest = parseFloat(sizing.chest);
                    if (chest < 38) return 'S';
                    if (chest <= 40) return 'M';
                    if (chest <= 43) return 'L';
                    return 'XL';
                  }
                  if (cat === 'pants' && sizing.waist) {
                    const waist = parseFloat(sizing.waist);
                    if (waist < 31) return 'S';
                    if (waist <= 33) return 'M';
                    if (waist <= 36) return 'L';
                    return 'XL';
                  }
                }
                return null;
              };

              const recommendedSize = getRecommendedSize(product.category, state.currentUser?.sizing, product.sizes);
              let defaultSize = recommendedSize && (product.sizes_stock?.[recommendedSize] ?? 0) > 0 ? recommendedSize : null;
              if (!defaultSize) {
                defaultSize = product.sizes.find(s => (product.sizes_stock?.[s] ?? 0) > 0);
              }
              
              return product.sizes.map((s) => {
                const stock = product.sizes_stock?.[s] ?? 0;
                const isOutOfStock = stock <= 0;
                const isActive = (s === defaultSize);
                const isRec = (s === recommendedSize);
                
                let label = s;
                if (isOutOfStock) {
                  label += ' (Sold Out)';
                } else {
                  if (isRec) {
                    label += ' (Recommended)';
                  }
                  if (stock < 4) {
                    label += ` (Only ${stock} left)`;
                  }
                }
                
                return `<button class="size-btn ${isActive ? 'active' : ''}" ${isOutOfStock ? 'disabled' : ''} data-size="${s}" onclick="selectPDPSize(this)">${label}</button>`;
              }).join('');
            })()}
          </div>
          ${state.currentUser?.sizing ? `<p style="font-size:0.75rem; color:var(--color-accent-gold); margin-top:0.8rem; font-style:italic;"><i class="fas fa-magic"></i> Custom sizing parameters active.</p>` : ''}
        </div>
      </div>

      <div style="display:flex; gap:1.5rem; margin-top: 1.5rem;">
        <button class="btn btn-primary" style="flex-grow:1; display: flex; gap: 0.8rem;" onclick="addPDPToCart()" ${!product.inStock ? 'disabled' : ''}>
          <i class="fas fa-shopping-bag"></i> ${product.inStock ? 'Add to Wardrobe' : 'Out of Stock'}
        </button>
        <button class="btn btn-secondary" onclick="toggleWishlist('${product.id}'); openPDP('${product.id}')" title="Save select">
          <i class="${state.wishlist.includes(product.id) ? 'fas' : 'far'} fa-heart"></i>
        </button>
      </div>
      
      <div class="pdp-reviews-container">
        <div class="reviews-header">
          <h4 style="font-size: 1.1rem; letter-spacing:0.05em;">Client Reviews</h4>
          <button class="btn btn-secondary" style="padding:0.5rem 1rem; font-size:0.7rem;" onclick="openReviewModal()">Write Review</button>
        </div>
        
        <div id="pdp-reviews-loading" style="padding: 2rem; text-align: center; color: var(--color-text-muted);">
          <i class="fas fa-spinner fa-spin" style="margin-right: 0.5rem; color: var(--color-accent-gold);"></i> Loading client evaluations...
        </div>
        
        <div id="pdp-reviews-content" style="display: none;">
          <div class="review-stats" style="margin-bottom:2rem; padding: 1.5rem; background: var(--color-bg-card); border: 1px solid var(--color-border); display: flex; align-items: center; gap: 1.5rem;">
            <span class="review-avg-num" id="pdp-reviews-avg">5.0</span>
            <div>
              <div class="rating-stars" id="pdp-reviews-stars" style="font-size:0.9rem; margin-bottom:0.2rem;"></div>
              <span style="font-size:0.75rem; color:var(--color-text-muted);">Verified rating average</span>
            </div>
          </div>
          
          <div class="review-list" id="pdp-reviews-list"></div>
        </div>
      </div>
    </div>
  `;

  const backBtnContainer = document.getElementById("pdp-back-btn-container");
  if (backBtnContainer) {
    if (state.pdpHistory.length > 0) {
      const prevId = state.pdpHistory[state.pdpHistory.length - 1];
      const prevProduct = PRODUCT_CATALOG.find(p => p.id === prevId);
      if (prevProduct) {
        backBtnContainer.innerHTML = `
          <button onclick="navigateBackPDP()" style="position: absolute; top: 1.5rem; left: 1.5rem; display: inline-flex; align-items: center; gap: 0.5rem; padding: 0.6rem 1.2rem; font-size: 0.72rem; font-weight: 600; font-family: var(--font-display); text-transform: uppercase; letter-spacing: 0.05em; background: rgba(255,255,255,0.03); border: 1px solid var(--color-border); border-radius: 4px; color: var(--color-accent-gold); cursor: pointer; transition: all 0.2s; z-index: 10;" class="pdp-back-btn">
            <i class="fas fa-arrow-left"></i> Back to ${prevProduct.title}
          </button>
        `;
      } else {
        backBtnContainer.innerHTML = '';
      }
    } else {
      backBtnContainer.innerHTML = '';
    }
  }

  pdpModal.classList.add("active");
  pdpModal.scrollTo({ top: 0 }); // Scroll modal container back to top
  document.body.style.overflow = "hidden";

  // Trigger reviews load asynchronously in the background to render the modal instantly!
  apiCall(`/api/reviews/${productId}`).then(reviewsList => {
    state.reviews[productId] = reviewsList;
    
    // Insert values only if the user is still viewing this product modal
    if (state.selectedProduct && state.selectedProduct.id === productId) {
      const totalReviews = reviewsList.length;
      let avgRating = 5.0;
      if (totalReviews > 0) {
        avgRating = reviewsList.reduce((s, r) => s + r.rating, 0) / totalReviews;
      }
      
      const starHeaderHtml = Array(5).fill(0).map((_, i) => 
        `<i class="${i < Math.round(avgRating) ? 'fas' : 'far'} fa-star"></i>`
      ).join('');

      const reviewsHtml = reviewsList.map(r => `
        <div class="review-item">
          <div class="review-item-meta">
            <span class="review-author">${r.author}</span>
            <span class="review-date">${r.date}</span>
          </div>
          <div class="rating-stars" style="margin-bottom:0.5rem;">
            ${Array(5).fill(0).map((_, i) => `<i class="${i < r.rating ? 'fas' : 'far'} fa-star"></i>`).join('')}
          </div>
          <p class="review-content">${r.content}</p>
        </div>
      `).join('');

      const headerTitle = pdpContentContainer.querySelector(".pdp-reviews-container h4");
      if (headerTitle) {
        headerTitle.textContent = `Client Reviews (${totalReviews})`;
      }

      const loadingEl = document.getElementById("pdp-reviews-loading");
      const contentEl = document.getElementById("pdp-reviews-content");
      const avgEl = document.getElementById("pdp-reviews-avg");
      const starsEl = document.getElementById("pdp-reviews-stars");
      const listEl = document.getElementById("pdp-reviews-list");

      if (loadingEl) loadingEl.style.display = "none";
      if (contentEl) contentEl.style.display = "block";
      if (avgEl) avgEl.textContent = avgRating.toFixed(1);
      if (starsEl) starsEl.innerHTML = starHeaderHtml;
      if (listEl) {
        listEl.innerHTML = totalReviews === 0 
          ? `<p style="color:var(--color-text-muted); font-size:0.9rem; text-align:center;">No reviews yet. Be the first to leave review feedback!</p>` 
          : reviewsHtml;
      }
    }
  }).catch(err => {
    console.error("Failed to load reviews:", err);
    const loadingEl = document.getElementById("pdp-reviews-loading");
    if (loadingEl) {
      loadingEl.innerHTML = `<em style="color:var(--color-danger); font-size:0.85rem;">Failed to retrieve guest reviews.</em>`;
    }
  });
};

window.closePDPModal = function() {
  pdpModal.classList.remove("active");
  state.selectedProduct = null;
  state.pdpHistory = []; // Clear history stack when modal is closed
  const backBtnContainer = document.getElementById("pdp-back-btn-container");
  if (backBtnContainer) backBtnContainer.innerHTML = '';
  if (state.posFullscreen && state.currentView === "admin") {
    document.body.style.overflow = "hidden";
  } else {
    document.body.style.overflow = "";
  }
};

window.navigateBackPDP = function() {
  if (state.pdpHistory.length === 0) return;
  const prevId = state.pdpHistory.pop();
  isBackNav = true; // Avoid pushing history during back navigation
  openPDP(prevId);
};

window.selectPDPColor = function(element) {
  const container = element.parentElement;
  container.querySelectorAll(".color-option").forEach(o => o.classList.remove("active"));
  element.classList.add("active");
};

window.selectPDPSize = function(element) {
  const container = element.parentElement;
  container.querySelectorAll(".size-btn").forEach(s => s.classList.remove("active"));
  element.classList.add("active");
};

window.addPDPToCart = function() {
  const product = state.selectedProduct;
  if (!product) return;

  const totalStock = Object.values(product.sizes_stock || {}).reduce((sum, s) => sum + s, 0);
  if (totalStock <= 0 || !product.inStock) {
    showToast("This product is completely sold out.");
    return;
  }

  const colorElement = pdpContentContainer.querySelector(".color-option.active");
  const sizeElement = pdpContentContainer.querySelector(".size-btn.active");
  
  if (!sizeElement) {
    showToast("Please select a size.");
    return;
  }

  const color = colorElement ? colorElement.getAttribute("data-color-name") : product.colors[0].name;
  const size = sizeElement.getAttribute("data-size");
  
  const stock = product.sizes_stock?.[size] ?? 0;
  if (stock <= 0) {
    showToast(`Size ${size} is currently out of stock.`);
    return;
  }
  
  const key = `${product.id}-${color}-${size}`;
  const existingItemIndex = state.cart.findIndex(item => item.key === key);
  
  const currentCartQty = existingItemIndex > -1 ? state.cart[existingItemIndex].qty : 0;
  if (currentCartQty + 1 > stock) {
    showToast(`Cannot add more. Only ${stock} unit(s) of size ${size} available.`);
    return;
  }
  
  if (existingItemIndex > -1) {
    state.cart[existingItemIndex].qty += 1;
  } else {
    state.cart.push({
      key,
      id: product.id,
      title: product.title,
      price: product.price,
      image: product.image,
      color,
      size,
      qty: 1
    });
  }
  
  localStorage.setItem('HAIRAH_cart', JSON.stringify(state.cart));
  updateCartBadge();
  closePDPModal();
  showToast(`${product.title} (${size} | ${color}) added to wardrobe.`);
  openCartDrawer();
};

// --- Review Submission Actions ---
window.openReviewModal = function() {
  if (!state.currentUser) {
    showToast("Please sign in to write a product review.");
    navigate("login");
    return;
  }

  const modalDiv = document.createElement("div");
  modalDiv.className = "modal-backdrop active";
  modalDiv.id = "review-write-modal";
  modalDiv.innerHTML = `
    <div class="modal-container" style="max-width: 500px; padding: 2.5rem;">
      <h3 style="font-size:1.3rem; margin-bottom: 2rem; border-bottom:1px solid var(--color-border); padding-bottom:0.5rem;">Write Client Review</h3>
      <form onsubmit="handleReviewSubmit(event)">
        <div class="form-group">
          <label>Your Rating</label>
          <select id="review-write-rating" class="form-input" style="background-color: var(--color-bg-input); border:1px solid var(--color-border); cursor:pointer;">
            <option value="5">5 Stars (Excellent)</option>
            <option value="4">4 Stars (Very Good)</option>
            <option value="3">3 Stars (Good)</option>
            <option value="2">2 Stars (Fair)</option>
            <option value="1">1 Star (Poor)</option>
          </select>
        </div>
        <div class="form-group">
          <label>Comments / Review Text</label>
          <textarea id="review-write-text" class="form-input" rows="4" style="resize:none;" required placeholder="Comment on fits, fabrics, and draping quality..."></textarea>
        </div>
        <div style="display:flex; gap:1rem; margin-top:2rem;">
          <button type="submit" class="btn btn-primary" style="flex:1;">Submit Review</button>
          <button type="button" class="btn btn-secondary" onclick="closeReviewModal()" style="flex:1;">Cancel</button>
        </div>
      </form>
    </div>
  `;
  document.body.appendChild(modalDiv);
};

window.closeReviewModal = function() {
  const modal = document.getElementById("review-write-modal");
  if (modal) {
    modal.remove();
  }
};

window.handleReviewSubmit = async function(event) {
  event.preventDefault();
  const ratingVal = parseInt(document.getElementById("review-write-rating").value);
  const textVal = document.getElementById("review-write-text").value;
  const productId = state.selectedProduct.id;
  
  try {
    await apiCall('/api/reviews', 'POST', {
      productId,
      rating: ratingVal,
      content: textVal
    });
    
    closeReviewModal();
    showToast("Your review has been verified and posted.");
    
    // Refresh PDP
    openPDP(productId);
  } catch (error) {
    showToast("Failed to submit review.");
  }
};

// --- Cart Drawer Actions ---
function openCartDrawer() {
  renderCartDrawerItems();
  cartDrawer.classList.add("active");
  cartDrawerBackdrop.classList.add("active");
  document.body.style.overflow = "hidden";
}

function closeCartDrawer() {
  cartDrawer.classList.remove("active");
  cartDrawerBackdrop.classList.remove("active");
  if (state.currentView !== "shop" && state.currentView !== "wishlist") {
    if (state.posFullscreen && state.currentView === "admin") {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
  }
}

function updateCartBadge() {
  const totalQty = state.cart.reduce((sum, item) => sum + item.qty, 0);
  cartBadge.innerText = totalQty;
  if (totalQty > 0) {
    cartBadge.style.display = "flex";
  } else {
    cartBadge.style.display = "none";
  }
}

function getCartItemStockStatus(item) {
  const product = PRODUCT_CATALOG.find(p => p.id === item.id);
  if (!product) return { status: 'invalid', message: 'Product not found', max: 0 };
  
  const sizeStock = product.sizes_stock?.[item.size];
  if (sizeStock === undefined) return { status: 'invalid', message: 'Size not available', max: 0 };
  
  if (sizeStock <= 0) {
    return { status: 'out', message: 'Out of Stock', max: 0 };
  } else if (sizeStock < item.qty) {
    return { status: 'insufficient', message: `Only ${sizeStock} units left`, max: sizeStock };
  }
  return { status: 'ok', message: 'In Stock', max: sizeStock };
}

function renderCartDrawerItems() {
  if (state.cart.length === 0) {
    cartItemsContainer.innerHTML = `
      <div style="text-align: center; margin-top: 6rem; color: var(--color-text-muted);">
        <i class="fas fa-box-open" style="font-size: 3.5rem; margin-bottom: 2rem; color: var(--color-accent-gold);"></i>
        <p style="font-family:var(--font-display); font-size:1.1rem; text-transform:uppercase; letter-spacing:0.05em; color:var(--color-text-main);">Your wardrobe is empty</p>
        <p style="font-size:0.8rem; margin-top:0.5rem;">Fill it with luxury clothing selections.</p>
      </div>
    `;
    cartSubtotal.innerText = "₹0.00";
    return;
  }

  let hasStockIssue = false;

  const itemsHtml = state.cart.map(item => {
    const check = getCartItemStockStatus(item);
    let warningHtml = '';
    let itemClass = 'cart-item';
    
    if (check.status === 'out') {
      hasStockIssue = true;
      itemClass += ' cart-item-out-of-stock';
      warningHtml = `
        <div style="color: var(--color-danger); font-size: 0.75rem; font-weight: 600; margin-top: 0.4rem; display: flex; align-items: center; gap: 0.3rem;">
          <i class="fas fa-exclamation-triangle"></i> Out of Stock
        </div>
      `;
    } else if (check.status === 'insufficient') {
      hasStockIssue = true;
      warningHtml = `
        <div style="color: var(--color-accent-gold); font-size: 0.75rem; font-weight: 600; margin-top: 0.4rem; display: flex; align-items: center; gap: 0.3rem;">
          <i class="fas fa-exclamation-circle"></i> Only ${check.max} left in stock
        </div>
      `;
    } else if (check.status === 'invalid') {
      hasStockIssue = true;
      warningHtml = `
        <div style="color: var(--color-danger); font-size: 0.75rem; font-weight: 600; margin-top: 0.4rem; display: flex; align-items: center; gap: 0.3rem;">
          <i class="fas fa-exclamation-triangle"></i> Sizing unavailable
        </div>
      `;
    }

    return `
      <div class="${itemClass}">
        <img src="${item.image}" alt="${item.title}" class="cart-item-img">
        <div class="cart-item-details">
          <h4 class="cart-item-title">${item.title}</h4>
          <div class="cart-item-meta">Size: ${item.size}</div>
          <div class="cart-item-price">₹${item.price.toFixed(2)}</div>
          ${warningHtml}
          <div class="cart-item-actions">
            <div class="qty-controls">
              <span class="qty-btn" onclick="updateQty('${item.key}', -1)"><i class="fas fa-minus"></i></span>
              <span class="qty-val">${item.qty}</span>
              <span class="qty-btn" onclick="updateQty('${item.key}', 1)"><i class="fas fa-plus"></i></span>
            </div>
            <span class="remove-item-btn" onclick="removeCartItem('${item.key}')"><i class="fas fa-trash-alt"></i> Remove</span>
          </div>
        </div>
      </div>
    `;
  }).join('');

  cartItemsContainer.innerHTML = itemsHtml;
  
  const subtotal = state.cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  cartSubtotal.innerText = `₹${subtotal.toFixed(2)}`;

  // Disable / Enable Proceed to Checkout button
  const checkoutBtn = document.getElementById("checkout-btn");
  if (checkoutBtn) {
    if (hasStockIssue) {
      checkoutBtn.disabled = true;
      checkoutBtn.style.opacity = '0.5';
      checkoutBtn.style.cursor = 'not-allowed';
      checkoutBtn.innerHTML = 'Resolve Stock Issues to Checkout';
    } else {
      checkoutBtn.disabled = false;
      checkoutBtn.style.opacity = '1';
      checkoutBtn.style.cursor = 'pointer';
      checkoutBtn.innerHTML = 'Proceed to Checkout';
    }
  }
}

window.updateQty = function(itemKey, amount) {
  const index = state.cart.findIndex(item => item.key === itemKey);
  if (index === -1) return;
  
  const cartItem = state.cart[index];
  const product = PRODUCT_CATALOG.find(p => p.id === cartItem.id);
  
  if (product && amount > 0) {
    const stockAvailable = product.sizes_stock?.[cartItem.size] ?? 0;
    if (cartItem.qty + amount > stockAvailable) {
      showToast(`Cannot increase quantity. Only ${stockAvailable} unit(s) of size ${cartItem.size} available.`);
      return;
    }
  }
  
  state.cart[index].qty += amount;
  if (state.cart[index].qty <= 0) {
    state.cart.splice(index, 1);
  }
  
  localStorage.setItem('HAIRAH_cart', JSON.stringify(state.cart));
  updateCartBadge();
  renderCartDrawerItems();
};

window.removeCartItem = function(itemKey) {
  state.cart = state.cart.filter(item => item.key !== itemKey);
  localStorage.setItem('HAIRAH_cart', JSON.stringify(state.cart));
  updateCartBadge();
  renderCartDrawerItems();
};

// --- Auth Login / Register Pane switching ---
window.switchAuthTab = function(tabName) {
  const loginTab = document.getElementById("auth-tab-login");
  const regTab = document.getElementById("auth-tab-register");
  const loginPane = document.getElementById("auth-pane-login");
  const regPane = document.getElementById("auth-pane-register");
  
  if (tabName === 'login') {
    loginTab.classList.add("active");
    regTab.classList.remove("active");
    loginPane.style.display = "block";
    regPane.style.display = "none";
  } else {
    loginTab.classList.remove("active");
    regTab.classList.add("active");
    loginPane.style.display = "none";
    regPane.style.display = "block";
  }
};

window.handleAuthLogin = async function(event) {
  event.preventDefault();
  const emailVal = document.getElementById("login-email").value.trim().toLowerCase();
  const passwordVal = document.getElementById("login-password").value;
  
  try {
    const result = await apiCall('/api/auth/login', 'POST', {
      email: emailVal,
      password: passwordVal
    });
    
    // Successful login: update session & fetch state
    state.currentUser = result.user;
    await syncSessionAndDatabase();
    
    showToast(result.message);
    if (state.currentUser.role === 'admin') {
      navigate("admin");
    } else {
      navigate("profile");
    }
  } catch (error) {
    showToast(error.message);
  }
};

window.handleAuthRegister = async function(event) {
  event.preventDefault();
  const nameVal = document.getElementById("reg-name").value.trim();
  const emailVal = document.getElementById("reg-email").value.trim().toLowerCase();
  const passwordVal = document.getElementById("reg-password").value;
  
  try {
    const result = await apiCall('/api/auth/register', 'POST', {
      name: nameVal,
      email: emailVal,
      password: passwordVal
    });
    
    state.currentUser = result.user;
    await syncSessionAndDatabase();
    
    showToast(result.message);
    navigate("profile");
  } catch (error) {
    showToast(error.message);
  }
};

// --- Customer Profile Actions ---
window.switchProfileTab = function(tabName) {
  state.profileActiveTab = tabName;
  renderCurrentView();
};

window.handleSaveSizing = async function(event) {
  event.preventDefault();
  const chestVal = document.getElementById("size-chest").value;
  const waistVal = document.getElementById("size-waist").value;
  const fitVal = document.getElementById("size-fit").value;
  
  try {
    await apiCall('/api/profile/sizing', 'POST', {
      chest: chestVal,
      waist: waistVal,
      fit: fitVal
    });
    
    showToast("Measurements saved to Sizing Studio profile.");
    await syncSessionAndDatabase(); // Refresh Sizing session info
    renderCurrentView();
  } catch (error) {
    showToast("Failed to save sizing parameters.");
  }
};

// --- Checkout Placement & Payment Gateway ---

function setupCheckoutValidationListeners() {
  const emailInput = document.getElementById('co-email');
  const phoneInput = document.getElementById('co-phone');
  const zipInput = document.getElementById('co-zip');
  const nameInput = document.getElementById('co-name');
  const addressInput = document.getElementById('co-address');
  const cityInput = document.getElementById('co-city');
  const submitButton = document.querySelector('#checkout-form button[type="submit"]');

  if (!emailInput || !phoneInput || !zipInput || !submitButton) return;

  const validationStatus = {
    email: false,
    phone: false,
    zip: false
  };

  function updateUIFeedback(inputElement, errorElement, isValid, errorMessage) {
    if (isValid) {
      inputElement.style.borderColor = 'var(--color-success)';
      inputElement.style.boxShadow = '0 0 5px rgba(82, 196, 26, 0.2)';
      if (errorElement) {
        errorElement.innerText = '✓ Looks perfect';
        errorElement.style.color = 'var(--color-success)';
      }
    } else {
      inputElement.style.borderColor = 'var(--color-danger)';
      inputElement.style.boxShadow = '0 0 5px rgba(255, 77, 79, 0.2)';
      if (errorElement) {
        errorElement.innerText = errorMessage;
        errorElement.style.color = 'var(--color-danger)';
      }
    }
  }

  function validateEmail() {
    const emailVal = emailInput.value.trim();
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const isValid = emailRegex.test(emailVal);
    validationStatus.email = isValid;
    updateUIFeedback(emailInput, document.getElementById('co-email-err'), isValid, 'Please enter a valid email address.');
    checkFormValidity();
  }

  function validateZip() {
    zipInput.value = zipInput.value.replace(/\D/g, '');
    const zipVal = zipInput.value.trim();
    const isValid = /^\d{6}$/.test(zipVal);
    validationStatus.zip = isValid;
    
    let msg = '';
    if (zipVal.length === 0) {
      msg = 'PIN code is required.';
    } else if (zipVal.length < 6) {
      msg = 'PIN code must be exactly 6 digits.';
    } else {
      msg = '';
    }
    
    updateUIFeedback(zipInput, document.getElementById('co-zip-err'), isValid, msg);
    checkFormValidity();
  }

  function validatePhone() {
    let phoneVal = phoneInput.value;
    const cleanDigits = phoneVal.replace(/[^\d+]/g, '');
    
    if (cleanDigits.length === 0) {
      phoneInput.value = '';
      validationStatus.phone = false;
      updateUIFeedback(phoneInput, document.getElementById('co-phone-err'), false, 'Contact phone is required.');
      checkFormValidity();
      return;
    }

    let prefix = '';
    let digitsOnly = '';
    
    if (cleanDigits.startsWith('+91')) {
      prefix = '+91';
      digitsOnly = cleanDigits.slice(3);
    } else if (cleanDigits.startsWith('91') && cleanDigits.length > 10) {
      prefix = '+91';
      digitsOnly = cleanDigits.slice(2);
    } else {
      prefix = '+91';
      digitsOnly = cleanDigits.replace(/^\+/, '');
    }
    
    digitsOnly = digitsOnly.replace(/\D/g, '').slice(0, 10);
    
    let formattedVal = '';
    if (digitsOnly.length > 5) {
      formattedVal = `${prefix} ${digitsOnly.slice(0, 5)} ${digitsOnly.slice(5)}`;
    } else if (digitsOnly.length > 0) {
      formattedVal = `${prefix} ${digitsOnly}`;
    } else {
      formattedVal = prefix;
    }
    
    phoneInput.value = formattedVal;
    
    const isPrefixValid = prefix === '+91';
    const isLengthValid = digitsOnly.length === 10;
    const isStartingDigitValid = /^[6789]/.test(digitsOnly);
    
    const isValid = isPrefixValid && isLengthValid && isStartingDigitValid;
    validationStatus.phone = isValid;
    
    let msg = '';
    if (!isLengthValid) {
      msg = 'Phone number must contain a 10-digit mobile number.';
    } else if (!isStartingDigitValid) {
      msg = 'Invalid mobile number. Must start with 6, 7, 8, or 9.';
    } else if (!isPrefixValid) {
      msg = 'Indian mobile format required (+91).';
    }
    
    updateUIFeedback(phoneInput, document.getElementById('co-phone-err'), isValid, msg);
    checkFormValidity();
  }

  function checkFormValidity() {
    const isCartValid = state.cart.length > 0;
    const hasName = nameInput.value.trim().length > 0;
    const hasAddress = addressInput.value.trim().length > 0;
    const hasCity = cityInput.value.trim().length > 0;
    
    const allInputsValid = validationStatus.email && validationStatus.phone && validationStatus.zip && hasName && hasAddress && hasCity;
    
    if (allInputsValid && isCartValid) {
      submitButton.disabled = false;
      submitButton.style.opacity = '1';
      submitButton.style.cursor = 'pointer';
      submitButton.innerText = 'Proceed to secure payment';
    } else {
      submitButton.disabled = true;
      submitButton.style.opacity = '0.5';
      submitButton.style.cursor = 'not-allowed';
      if (!isCartValid) {
        submitButton.innerText = 'Cart is empty';
      } else {
        submitButton.innerText = 'Complete form to proceed';
      }
    }
  }

  emailInput.addEventListener('input', validateEmail);
  phoneInput.addEventListener('input', validatePhone);
  zipInput.addEventListener('input', validateZip);
  nameInput.addEventListener('input', checkFormValidity);
  addressInput.addEventListener('input', checkFormValidity);
  cityInput.addEventListener('input', checkFormValidity);

  if (emailInput.value) validateEmail();
  if (phoneInput.value) validatePhone();
  if (zipInput.value) validateZip();
  checkFormValidity();
}

window.handlePlaceOrder = async function(event) {
  event.preventDefault();
  
  const recipientName = document.getElementById("co-name").value;
  const recipientEmail = document.getElementById("co-email").value.trim().toLowerCase();
  const addressVal = document.getElementById("co-address").value;
  const cityVal = document.getElementById("co-city").value;
  const zipVal = document.getElementById("co-zip") ? document.getElementById("co-zip").value.trim() : '';
  const phoneVal = document.getElementById("co-phone").value;
  
  const finalAddress = zipVal ? `${addressVal} (PIN: ${zipVal})` : addressVal;
  
  const subtotal = state.cart.reduce((sum, item) => sum + (item.price * item.qty), 0);
  
  let discount = 0;
  if (state.appliedCoupon) {
    if (state.appliedCoupon.discountType === 'percent') {
      discount = subtotal * (state.appliedCoupon.value / 100);
    } else {
      discount = Math.min(state.appliedCoupon.value, subtotal);
    }
  }

  const vat = Math.max(0, subtotal - discount) * 0.05;
  const grandTotal = Math.max(0, subtotal - discount + vat + 15.00);
  
  try {
    showToast("Initializing Razorpay checkout portal...");
    
    // Load Razorpay SDK script dynamically if not loaded
    if (typeof window.Razorpay === 'undefined') {
      try {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://checkout.razorpay.com/v1/checkout.js';
          script.onload = resolve;
          script.onerror = () => reject(new Error("Failed to load Razorpay SDK"));
          document.head.appendChild(script);
        });
      } catch (sdkErr) {
        console.warn("Razorpay external SDK load notice:", sdkErr);
      }
    }
    
    // 1. Create Razorpay Order on server
    const orderRes = await apiCall('/api/payments/razorpay-order', 'POST', {
      total: grandTotal,
      items: state.cart
    });
    
    const orderPayload = {
      recipientName,
      recipientEmail,
      address: finalAddress,
      city: cityVal,
      phone: phoneVal,
      total: grandTotal,
      items: state.cart
    };
    
    // 2. If backend config is mock or Razorpay SDK is blocked on mobile, open mobile payment portal modal
    if (orderRes.gatewayType === 'Simulated' || typeof window.Razorpay === 'undefined') {
      openMockRazorpayModal(orderRes, orderPayload);
    } else {
      // Launch official Razorpay standard popup checkout
      const options = {
        "key": orderRes.keyId,
        "amount": Math.round(grandTotal * 100),
        "currency": "INR",
        "name": "HAIRAH MEN'S WORLD",
        "description": "Bespoke Attire Wardrobe Purchase",
        "order_id": orderRes.orderId,
        "handler": async function (response) {
          try {
            // Verify signature on backend
            const verifyRes = await apiCall('/api/payments/razorpay-verify', 'POST', {
              razorpayOrderId: response.razorpay_order_id,
              razorpayPaymentId: response.razorpay_payment_id,
              razorpaySignature: response.razorpay_signature
            });
            
            orderPayload.paymentId = response.razorpay_payment_id;
            orderPayload.paymentMethod = 'Razorpay';
            
            const finalOrder = await apiCall('/api/orders', 'POST', orderPayload);
            showOrderReceipt(finalOrder.orderId, orderPayload, 'Razorpay', response.razorpay_payment_id);
          } catch (err) {
            showToast("Razorpay verification failed: " + (err.error || err.message));
          }
        },
        "prefill": {
          "name": recipientName,
          "email": recipientEmail,
          "contact": phoneVal
        },
        "theme": {
          "color": "#C5A880"
        }
      };
      const rzp = new window.Razorpay(options);
      rzp.open();
    }
  } catch (error) {
    showToast(error.message || "Failed to initialize Razorpay gateway.");
  }
};

function showOrderReceipt(orderId, orderPayload, method, paymentId) {
  // Clear cart locally
  state.cart = [];
  state.appliedCoupon = null; // Clear active coupon on order success
  localStorage.setItem('HAIRAH_cart', JSON.stringify([]));
  updateCartBadge();
  
  // Sync DB values
  syncSessionAndDatabase();
  
  // Show Receipt View
  appContainer.innerHTML = `
    <div class="success-screen">
      <div class="success-icon"><i class="fas fa-check-circle"></i></div>
      <h2 style="font-size: 2.2rem; font-weight:300;">Order Confirmed</h2>
      <p style="color: var(--color-text-muted); margin-top:0.8rem; line-height: 1.7; font-size:0.95rem;">
        Thank you for styling with HAIRAH Men's World. Your attire order has been securely registered to fitting queues.
      </p>
      
      <div class="order-details-card">
        <div style="display: flex; justify-content: space-between; margin-bottom: 1rem; border-bottom:1px solid var(--color-border); padding-bottom:0.5rem;">
          <span style="color: var(--color-text-muted);">Invoice / ID</span>
          <span style="font-family: var(--font-display); font-weight: 700; color:var(--color-accent-gold);">${orderId}</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 0.8rem;">
          <span>Deliver to</span>
          <span>${orderPayload.recipientName}</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 0.8rem;">
          <span>Charged Total</span>
          <span style="font-family: var(--font-display); font-weight: 600; color:var(--color-accent-gold);">₹${orderPayload.total.toFixed(2)}</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 0.8rem;">
          <span>Payment Channel</span>
          <span style="font-weight: 600;">${method}</span>
        </div>
        <div style="display: flex; justify-content: space-between; margin-bottom: 0.8rem;">
          <span>Transaction ID</span>
          <span style="font-family: var(--font-display); font-size: 0.85rem; color: var(--color-accent-gold); font-weight: 600;">${paymentId}</span>
        </div>
        <div style="display: flex; justify-content: space-between;">
          <span>Order Status</span>
          <span style="color: var(--color-warning); font-weight: 600; text-transform:uppercase; font-size:0.8rem;">In Sizing Verification Queue</span>
        </div>
      </div>
      
      <button class="btn btn-primary" onclick="navigate('home')">Return to collections</button>
    </div>
  `;
  
  showToast(`Order created successfully!`);
}

// --- Admin Panel Actions ---
window.switchAdminTab = function(tabName) {
  state.adminActiveTab = tabName;
  renderCurrentView();
};

window.handleAdminChangeDateFilter = function(val) {
  state.adminFilterDate = val;
  renderCurrentView();
};

window.handleAdminChangeMetricsView = function(val) {
  state.adminMetricView = val;
  renderCurrentView();
};

window.handleAdminChangeMonthFilter = function(val) {
  state.adminFilterMonth = val;
  renderCurrentView();
};

window.handleAdminChangeStartDateFilter = function(val) {
  state.adminFilterStartDate = val;
  renderCurrentView();
};

window.handleAdminChangeEndDateFilter = function(val) {
  state.adminFilterEndDate = val;
  renderCurrentView();
};

window.handleAdminOrderSearch = function(e) {
  state.adminOrderSearchQuery = e.target.value;
  if (e.key === "Enter") {
    renderCurrentView();
  }
};

window.triggerAdminOrderSearch = function() {
  const input = document.getElementById("admin-order-search-box");
  if (input) {
    state.adminOrderSearchQuery = input.value;
    renderCurrentView();
  }
};

window.clearAdminOrderSearch = function() {
  state.adminOrderSearchQuery = "";
  renderCurrentView();
};

window.downloadDailyOrdersCSV = function() {
  const filteredOrders = state.lastFilteredOrders || state.orders;
  
  if (filteredOrders.length === 0) {
    showToast("No orders available to download for this selection.");
    return;
  }
  
  const headers = ["Order ID", "Channel", "Customer Email", "Date", "Items Purchased", "Grand Total (INR)", "Status", "Payment Method", "Payment ID"];
  
  const rows = filteredOrders.map(o => {
    const items = o.items.map(item => `${item.title} (x${item.qty})`).join('; ');
    const email = o.customer_email || o.customerEmail || 'N/A';
    const method = o.payment_method || 'Card';
    const paymentId = o.payment_id || 'N/A';
    const isInstore = o.address === 'In-Store Checkout' || (o.payment_id && o.payment_id.startsWith('POS-'));
    const channel = isInstore ? 'POS' : 'Online';
    
    return [
      o.id,
      channel,
      email,
      o.date,
      items,
      o.total.toFixed(2),
      o.status,
      method,
      paymentId
    ];
  });
  
  const csvContent = [headers, ...rows]
    .map(row => row.map(val => `"${String(val).replace(/"/g, '""')}"`).join(','))
    .join('\n');
    
  const dateLabel = state.adminFilterDate || new Date().toISOString().split('T')[0];
  const modeLabel = state.adminMetricView || 'report';
  
  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.setAttribute("href", url);
  link.setAttribute("download", `orders_${modeLabel}_${dateLabel}.csv`);
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

window.handleAdminChangeOrderStatus = async function(orderId, selectElement) {
  const statusVal = selectElement.value;
  try {
    const result = await apiCall(`/api/orders/${orderId}/status`, 'PUT', { status: statusVal });
    showToast(result.message);
    await syncSessionAndDatabase(); // Reload updated order statuses
  } catch (error) {
    showToast("Failed to update order status.");
  }
};

window.handleAdminChangePrice = async function(productId, inputElement) {
  const priceVal = parseFloat(inputElement.value);
  if (isNaN(priceVal) || priceVal <= 0) {
    showToast("Invalid price amount.");
    return;
  }
  
  try {
    const result = await apiCall('/api/products/price', 'POST', { id: productId, price: priceVal });
    showToast(result.message);
    await syncSessionAndDatabase(); // Reload catalog changes
  } catch (error) {
    showToast("Price update failed.");
  }
};

window.handleAdminChangeSizeStock = async function(productId, size, inputElement) {
  const stockVal = parseInt(inputElement.value);
  if (isNaN(stockVal) || stockVal < 0) {
    showToast("Invalid stock quantity.");
    return;
  }
  
  try {
    const result = await apiCall('/api/products/size-stock', 'POST', { id: productId, size, stock: stockVal });
    showToast(result.message);
    await syncSessionAndDatabase(); // Sync update
  } catch (error) {
    showToast("Failed to update size stock.");
  }
};

window.handleSavePaymentSettings = async function(event) {
  event.preventDefault();
  
  const upiId = document.getElementById("admin-upi-id").value.trim();
  const accountHolder = document.getElementById("admin-holder-name").value.trim();
  const bankName = document.getElementById("admin-bank-name").value.trim();
  const accountNumber = document.getElementById("admin-account-num").value.trim();
  const razorpayKeyId = document.getElementById("admin-rzp-key").value.trim();
  const razorpayKeySecret = document.getElementById("admin-rzp-secret").value.trim();
  
  const gatewayType = (razorpayKeyId && razorpayKeySecret) ? 'Razorpay' : 'Simulated';
  
  try {
    const result = await apiCall('/api/payments/merchant-config', 'POST', {
      upiId,
      accountHolder,
      bankName,
      accountNumber,
      gatewayType,
      razorpayKeyId,
      razorpayKeySecret,
      stripePublishableKey: '',
      stripeSecretKey: ''
    });
    showToast(result.message);
    await syncSessionAndDatabase(); // Reload updated config
    renderCurrentView();
  } catch (error) {
    showToast(error.error || "Failed to save payment settings.");
  }
};



window.toggleAdminAddProductForm = function() {
  const formContainer = document.getElementById("admin-add-product-form-container");
  const listContainer = document.getElementById("admin-inventory-list-container");
  if (formContainer && listContainer) {
    if (formContainer.style.display === "none") {
      formContainer.style.display = "block";
      listContainer.style.display = "none";
    } else {
      formContainer.style.display = "none";
      listContainer.style.display = "block";
    }
  }
};

window.handleAdminAddProduct = async function(event) {
  event.preventDefault();
  
  const title = document.getElementById("new-prod-title").value.trim();
  const category = document.getElementById("new-prod-category").value;
  const price = parseFloat(document.getElementById("new-prod-price").value);
  const desc = document.getElementById("new-prod-desc").value.trim();
  const sizesStr = document.getElementById("new-prod-sizes").value.trim();
  const colorsStr = document.getElementById("new-prod-colors").value.trim();
  const featuresStr = document.getElementById("new-prod-features").value.trim();
  
  const fileInput = document.getElementById("new-prod-file");
  const fallbackUrl = document.getElementById("new-prod-image-url").value.trim();
  
  let imageUrl = fallbackUrl || "assets/shirt_white.jpg"; // Default fallback
  
  if (fileInput && fileInput.files.length > 0) {
    const file = fileInput.files[0];
    const formData = new FormData();
    formData.append('file', file);
    
    try {
      showToast("Uploading attire photo...");
      const response = await fetch('/api/products/upload', {
        method: 'POST',
        body: formData,
        credentials: 'include'
      });
      const result = await response.json();
      if (!response.ok) {
        throw new Error(result.error || "Upload failed");
      }
      imageUrl = result.imagePath;
      showToast("Photo uploaded successfully.");
    } catch (error) {
      showToast("Image upload failed: " + error.message);
      return;
    }
  }
  
  const sizes = sizesStr.split(',').map(s => s.trim()).filter(s => s !== "");
  const colors = colorsStr.split(',').map(c => {
    const parts = c.split(':');
    const name = parts[0]?.trim() || "Default Color";
    const hex = parts[1]?.trim() || "#C5A880";
    return { name, hex };
  }).filter(c => c.name !== "");
  const features = featuresStr.split('\n').map(f => f.trim()).filter(f => f !== "");
  
  try {
    showToast("Adding attire to catalog...");
    const result = await apiCall('/api/products/add', 'POST', {
      title,
      category,
      price,
      image: imageUrl,
      description: desc,
      sizes,
      colors,
      features
    });
    
    showToast(result.message);
    
    // Sync catalog database and reload admin view
    await syncSessionAndDatabase();
    renderCurrentView();
  } catch (error) {
    showToast("Failed to create attire: " + error.message);
  }
};

window.handleAdminToggleVisibility = async function(productId, checkboxElement) {
  const visibilityVal = checkboxElement.checked;
  try {
    const result = await apiCall('/api/products/visibility', 'POST', { id: productId, isVisible: visibilityVal });
    showToast(result.message);
    await syncSessionAndDatabase(); // Reload catalog changes
    renderCurrentView();
  } catch (error) {
    showToast("Failed to toggle visibility status.");
  }
};

window.handleAdminDeleteProduct = async function(productId, productTitle) {
  const confirmed = confirm(`Are you sure you want to delete the product "${productTitle}"? This will also delete all associated stock records and reviews. This action cannot be undone.`);
  if (!confirmed) return;
  
  try {
    const res = await apiCall(`/api/products/${productId}`, 'DELETE');
    showToast(res.message);
    await syncSessionAndDatabase();
    renderCurrentView();
  } catch (error) {
    showToast("Failed to delete product: " + (error.message || error.error));
  }
};

// --- Toast System ---
function showToast(message) {
  const toast = document.createElement("div");
  toast.className = "toast";
  toast.innerHTML = `<i class="fas fa-info-circle" style="color: var(--color-accent-gold);"></i> <span>${message}</span>`;
  
  toastContainer.appendChild(toast);
  
  setTimeout(() => {
    toast.style.animation = "toastSlideIn 0.35s reverse forwards";
    setTimeout(() => {
      toast.remove();
    }, 350);
  }, 3500);
}



function openMockRazorpayModal(orderRes, orderPayload) {
  document.body.style.overflow = "hidden";
  const backdrop = document.createElement('div');
  backdrop.className = 'stripe-modal-backdrop';
  backdrop.id = 'mock-rzp-modal';
  
  const merchantHolder = state.merchantConfig?.account_holder || 'HAIRAH MENS WORLD';
  const merchantUpi = state.merchantConfig?.upi_id || 'hairah@upi';
  
  const qrData = `upi://pay?pa=${merchantUpi}&pn=${encodeURIComponent(merchantHolder)}&am=${orderRes.amount.toFixed(2)}&cu=INR`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(qrData)}`;

  backdrop.innerHTML = `
    <div class="stripe-modal-content" style="max-width: 420px; padding: 0; border-radius: 8px; font-family: 'Inter', sans-serif; overflow: hidden; position: relative;">
      <!-- Razorpay Header -->
      <div style="background-color: #0f172a; padding: 1.5rem; color: white; display: flex; justify-content: space-between; align-items: center;">
        <div>
          <div style="font-size: 0.75rem; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.05em;">HAIRAH MEN'S WORLD</div>
          <div style="font-size: 1.4rem; font-weight: 700; color: #fff; margin-top: 0.25rem;">₹${orderRes.amount.toFixed(2)}</div>
        </div>
        <div style="text-align: right;">
          <div style="background: rgba(255,255,255,0.15); font-size: 0.65rem; padding: 0.25rem 0.5rem; border-radius: 4px; display: inline-block; font-weight: 600;">Razorpay Sandbox</div>
          <button onclick="closeMockRzpModal()" style="background: none; border: none; color: #94a3b8; font-size: 1.2rem; cursor: pointer; margin-left: 0.8rem; vertical-align: middle;"><i class="fas fa-times"></i></button>
        </div>
      </div>
      
      <!-- Selection Content -->
      <div style="padding: 2rem;" id="rzp-selection-screen">
        <h4 style="font-size: 0.9rem; margin-bottom: 1.5rem; color: var(--color-text-main);">Select Payment Method</h4>
        
        <div onclick="switchMockRzpPane('card')" style="display: flex; align-items: center; justify-content: space-between; border: 1px solid var(--color-border); padding: 1rem; border-radius: 6px; cursor: pointer; margin-bottom: 1rem; transition: background-color 0.2s;">
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <i class="fas fa-credit-card" style="color: var(--color-accent-gold); font-size: 1.2rem;"></i>
            <div style="text-align: left;">
              <div style="font-size: 0.85rem; font-weight: 600;">Card</div>
              <div style="font-size: 0.7rem; color: var(--color-text-muted);">Pay using Visa, Mastercard, RuPay</div>
            </div>
          </div>
          <i class="fas fa-chevron-right" style="color: var(--color-text-muted); font-size: 0.8rem;"></i>
        </div>
        
        <div onclick="switchMockRzpPane('upi')" style="display: flex; align-items: center; justify-content: space-between; border: 1px solid var(--color-border); padding: 1rem; border-radius: 6px; cursor: pointer; transition: background-color 0.2s;">
          <div style="display: flex; align-items: center; gap: 0.75rem;">
            <i class="fas fa-mobile-alt" style="color: var(--color-accent-gold); font-size: 1.2rem;"></i>
            <div style="text-align: left;">
              <div style="font-size: 0.85rem; font-weight: 600;">UPI / QR Code</div>
              <div style="font-size: 0.7rem; color: var(--color-text-muted);">Instant transfer via Google Pay, PhonePe</div>
            </div>
          </div>
          <i class="fas fa-chevron-right" style="color: var(--color-text-muted); font-size: 0.8rem;"></i>
        </div>
        
        <div style="text-align: center; margin-top: 2.5rem;">
          <div style="font-size: 0.7rem; color: var(--color-text-muted); margin-bottom: 0.25rem;">SECURED BY RAZORPAY</div>
          <div style="font-size: 0.65rem; color: var(--color-text-muted); opacity: 0.75;">Supports all major cards, netbanking and 50+ UPI VPAs</div>
        </div>
      </div>
      
      <!-- Card Pane -->
      <div style="padding: 2rem; display: none;" id="rzp-card-screen">
        <div style="margin-bottom: 1.5rem; display: flex; align-items: center; gap: 0.5rem; cursor: pointer; color: var(--color-accent-gold); font-size: 0.8rem;" onclick="switchMockRzpPane('select')">
          <i class="fas fa-arrow-left"></i> Back to all payment methods
        </div>
        
        <form onsubmit="handleMockRzpCardSubmit(event, '${orderRes.orderId}', ${JSON.stringify(orderPayload).replace(/"/g, '&quot;')})">
          <div class="form-group" style="margin-bottom: 1.25rem; text-align: left;">
            <label style="font-size: 0.7rem; color: var(--color-text-muted);">Card Number</label>
            <input type="text" class="form-input" id="mock-rzp-card-num" placeholder="4242 4242 4242 4242" required style="font-size: 0.85rem;" oninput="formatCardNumberInput(this)">
          </div>
          
          <div class="form-row" style="gap: 1rem; margin-bottom: 1.5rem; text-align: left;">
            <div class="form-group" style="margin-bottom: 0;">
              <label style="font-size: 0.7rem; color: var(--color-text-muted);">Expiry (MM/YY)</label>
              <input type="text" class="form-input" id="mock-rzp-card-expiry" placeholder="12/28" maxlength="5" required style="font-size: 0.85rem;" oninput="formatCardExpiryInput(this)">
            </div>
            <div class="form-group" style="margin-bottom: 0;">
              <label style="font-size: 0.7rem; color: var(--color-text-muted);">CVV</label>
              <input type="password" class="form-input" id="mock-rzp-card-cvv" placeholder="123" minlength="3" maxlength="4" required style="font-size: 0.85rem;">
            </div>
          </div>
          
          <button type="submit" class="btn btn-primary" style="width: 100%; padding: 0.8rem; background: #2563eb; border-color: #2563eb; color: white;">Pay ₹${orderRes.amount.toFixed(2)}</button>
        </form>
      </div>
      
      <!-- UPI Pane -->
      <div style="padding: 2rem; display: none;" id="rzp-upi-screen">
        <div style="margin-bottom: 1.5rem; display: flex; align-items: center; gap: 0.5rem; cursor: pointer; color: var(--color-accent-gold); font-size: 0.8rem;" onclick="switchMockRzpPane('select')">
          <i class="fas fa-arrow-left"></i> Back to all payment methods
        </div>
        
        <div style="display: flex; flex-direction: column; align-items: center; text-align: center; gap: 1rem;">
          <div style="font-size: 0.75rem; color: var(--color-text-muted);">Scan QR to pay directly to configured account:</div>
          <img src="${qrUrl}" alt="UPI QR" style="width: 150px; height: 150px; background: white; padding: 0.5rem; border-radius: 4px; border: 1px solid var(--color-border);">
          <div style="font-size: 0.75rem; font-weight: 600; color: var(--color-accent-gold);">UPI ID: ${merchantUpi}</div>
          
          <button type="button" class="btn btn-primary" style="width: 100%; padding: 0.8rem; background: #2563eb; border-color: #2563eb; color: white;" onclick="handleMockRzpUPISuccess('${orderRes.orderId}', ${JSON.stringify(orderPayload).replace(/"/g, '&quot;')})">
            Simulate Scan Approval
          </button>
        </div>
      </div>
      
      <!-- Loader Pane -->
      <div id="rzp-loader-screen" style="display: none; position: absolute; top: 0; left: 0; width: 100%; height: 100%; background: rgba(15, 23, 42, 0.95); color: white; flex-direction: column; justify-content: center; align-items: center; gap: 1.5rem;">
        <div class="stripe-spinner" style="border-top-color: #2563eb;"></div>
        <div style="font-size: 0.95rem;" id="rzp-loader-text">Authorizing payment with bank...</div>
      </div>
    </div>
  `;
  
  document.body.appendChild(backdrop);
}

window.closeMockRzpModal = function() {
  const modal = document.getElementById('mock-rzp-modal');
  if (modal) modal.remove();
  if (state.posFullscreen && state.currentView === "admin") {
    document.body.style.overflow = "hidden";
  } else {
    document.body.style.overflow = "";
  }
};

window.switchMockRzpPane = function(pane) {
  const selectScreen = document.getElementById('rzp-selection-screen');
  const cardScreen = document.getElementById('rzp-card-screen');
  const upiScreen = document.getElementById('rzp-upi-screen');
  
  if (selectScreen && cardScreen && upiScreen) {
    selectScreen.style.display = pane === 'select' ? 'block' : 'none';
    cardScreen.style.display = pane === 'card' ? 'block' : 'none';
    upiScreen.style.display = pane === 'upi' ? 'block' : 'none';
  }
};

window.handleMockRzpCardSubmit = async function(event, orderId, orderPayload) {
  event.preventDefault();
  
  const loader = document.getElementById('rzp-loader-screen');
  const loaderText = document.getElementById('rzp-loader-text');
  loader.style.display = 'flex';
  loaderText.innerText = 'Validating card details...';
  
  const paymentId = 'pay_mock_rzp_' + Math.random().toString(36).substring(2, 10);
  
  try {
    const verifyRes = await apiCall('/api/payments/razorpay-verify', 'POST', {
      razorpayOrderId: orderId,
      razorpayPaymentId: paymentId,
      razorpaySignature: 'mock_signature_approved'
    });
    
    setTimeout(() => {
      loaderText.innerText = 'Creating order queue entry...';
      setTimeout(async () => {
        try {
          orderPayload.paymentId = paymentId;
          orderPayload.paymentMethod = 'Razorpay (Card)';
          
          const finalOrder = await apiCall('/api/orders', 'POST', orderPayload);
          
          loader.innerHTML = `
            <div class="stripe-success-checkmark"><i class="fas fa-check-circle" style="color: #10b981;"></i></div>
            <div style="font-size: 1.1rem; color: #10b981; font-weight: 600; margin-top: 1rem;">Payment Successful</div>
          `;
          
          setTimeout(() => {
            closeMockRzpModal();
            showOrderReceipt(finalOrder.orderId, orderPayload, 'Razorpay (Card)', paymentId);
          }, 1500);
        } catch (err) {
          loader.style.display = 'none';
          showToast(err.error || "Order placement failed.");
        }
      }, 1200);
    }, 1200);
  } catch (error) {
    loader.style.display = 'none';
    showToast(error.error || "Simulated Razorpay transaction failed.");
  }
};

window.handleMockRzpUPISuccess = async function(orderId, orderPayload) {
  const loader = document.getElementById('rzp-loader-screen');
  const loaderText = document.getElementById('rzp-loader-text');
  loader.style.display = 'flex';
  loaderText.innerText = 'Verifying UPI transfer status...';
  
  const paymentId = 'pay_mock_rzp_' + Math.random().toString(36).substring(2, 10);
  
  try {
    const verifyRes = await apiCall('/api/payments/razorpay-verify', 'POST', {
      razorpayOrderId: orderId,
      razorpayPaymentId: paymentId,
      razorpaySignature: 'mock_signature_approved'
    });
    
    setTimeout(() => {
      loaderText.innerText = 'UPI transaction settled. Registering order...';
      setTimeout(async () => {
        try {
          orderPayload.paymentId = paymentId;
          orderPayload.paymentMethod = 'Razorpay (UPI)';
          
          const finalOrder = await apiCall('/api/orders', 'POST', orderPayload);
          
          loader.innerHTML = `
            <div class="stripe-success-checkmark"><i class="fas fa-check-circle" style="color: #10b981;"></i></div>
            <div style="font-size: 1.1rem; color: #10b981; font-weight: 600; margin-top: 1rem;">UPI Transfer Success</div>
          `;
          
          setTimeout(() => {
            closeMockRzpModal();
            showOrderReceipt(finalOrder.orderId, orderPayload, 'Razorpay (UPI)', paymentId);
          }, 1500);
        } catch (err) {
          loader.style.display = 'none';
          showToast(err.error || "Order placement failed.");
        }
      }, 1200);
    }, 1200);
  } catch (error) {
    loader.style.display = 'none';
    showToast(error.error || "Simulated UPI transaction failed.");
  }
};

window.viewAdminOrderDetails = function(orderId) {
  document.body.style.overflow = "hidden";
  const o = state.orders.find(order => order.id === orderId);
  if (!o) {
    showToast("Order details not found.");
    return;
  }
  
  const backdrop = document.createElement('div');
  backdrop.className = 'stripe-modal-backdrop';
  backdrop.id = 'admin-order-detail-modal';
  
  // Format items list HTML
  const itemsHtml = o.items.map(item => `
    <tr style="border-bottom:1px solid var(--color-border);">
      <td style="padding: 0.8rem 0; font-size: 0.85rem;">
        <span style="font-weight:600; color:var(--color-text-light);">${item.title}</span>
        <div style="font-size:0.7rem; color:var(--color-text-muted); margin-top:0.2rem;">Size: ${item.size}</div>
      </td>
      <td style="padding: 0.8rem 0; font-size: 0.85rem; text-align: center;">${item.qty}</td>
      <td style="padding: 0.8rem 0; font-size: 0.85rem; text-align: right; font-family: var(--font-display);">₹${item.price.toFixed(2)}</td>
      <td style="padding: 0.8rem 0; font-size: 0.85rem; text-align: right; font-family: var(--font-display); font-weight:600;">₹${(item.price * item.qty).toFixed(2)}</td>
    </tr>
  `).join('');

  backdrop.innerHTML = `
    <div class="stripe-modal-content" style="max-width: 650px; padding: 2.5rem; border-radius: 8px; text-align: left;">
      <div style="display:flex; justify-content:space-between; align-items:center; border-bottom: 1px solid var(--color-border); padding-bottom: 1rem; margin-bottom: 1.5rem;">
        <div>
          <h3 style="font-size:1.3rem; margin:0; letter-spacing:0.05em; font-family:var(--font-display);">Order Details</h3>
          <span style="font-size:0.75rem; color:var(--color-accent-gold); font-weight:600;">ID: ${o.id}</span>
        </div>
        <button class="stripe-close-btn" onclick="closeAdminOrderDetailModal()" style="position:static; padding:0.5rem;"><i class="fas fa-times"></i></button>
      </div>
      
      <!-- Top info grid -->
      <div class="admin-order-detail-grid">
        <div>
          <h4 style="font-size:0.8rem; text-transform:uppercase; letter-spacing:0.05em; color:var(--color-accent-gold); margin-bottom:0.5rem;">Customer & Shipping Info</h4>
          <div style="font-size:0.85rem; line-height:1.5; color:var(--color-text-main);">
            <strong>Name:</strong> ${o.recipient_name || o.recipientName || 'N/A'}<br>
            <strong>Email:</strong> ${o.customer_email || o.customerEmail || 'N/A'}<br>
            <strong>Phone:</strong> ${o.phone || 'N/A'}<br>
            <strong>Shipping Address:</strong><br>
            ${o.address || 'N/A'}, ${o.city || ''}
          </div>
        </div>
        <div>
          <h4 style="font-size:0.8rem; text-transform:uppercase; letter-spacing:0.05em; color:var(--color-accent-gold); margin-bottom:0.5rem;">Payment Details</h4>
          <div style="font-size:0.85rem; line-height:1.5; color:var(--color-text-main);">
            <strong>Method:</strong> ${o.payment_method || 'Card'}<br>
            <strong>Transaction ID:</strong> <span style="font-family:monospace; font-size:0.75rem; background:rgba(255,255,255,0.05); padding:0.1rem 0.3rem; border-radius:3px;">${o.payment_id || 'N/A'}</span><br>
            <strong>Date Placed:</strong> ${o.date}<br>
            <strong>Current Status:</strong> 
            <select class="status-dropdown" onchange="handleAdminChangeOrderStatus('${o.id}', this)" style="display:inline-block; margin-top:0.25rem; font-size:0.75rem; padding:0.3rem 0.6rem;">
              <option value="Processing" style="background: var(--color-bg-card); color: var(--color-text-main);" ${o.status === 'Processing' ? 'selected' : ''}>Processing</option>
              <option value="Shipped" style="background: var(--color-bg-card); color: var(--color-text-main);" ${o.status === 'Shipped' ? 'selected' : ''}>Shipped</option>
              <option value="Delivered" style="background: var(--color-bg-card); color: var(--color-text-main);" ${o.status === 'Delivered' ? 'selected' : ''}>Delivered</option>
            </select>
          </div>
        </div>
      </div>
      
      <!-- Items table -->
      <h4 style="font-size:0.8rem; text-transform:uppercase; letter-spacing:0.05em; color:var(--color-accent-gold); margin-bottom:0.5rem; border-top:1px solid var(--color-border); padding-top:1rem;">Attire Items Ordered</h4>
      <div style="max-height: 180px; overflow-y: auto; margin-bottom: 1.5rem; border-bottom:1px solid var(--color-border); padding-bottom:0.5rem;">
        <table style="width: 100%; border-collapse: collapse;">
          <thead>
            <tr style="border-bottom:1px solid var(--color-border); color:var(--color-text-muted); font-size:0.75rem; text-align:left;">
              <th style="padding-bottom:0.5rem;">Item Description</th>
              <th style="padding-bottom:0.5rem; text-align:center;">Qty</th>
              <th style="padding-bottom:0.5rem; text-align:right;">Price</th>
              <th style="padding-bottom:0.5rem; text-align:right;">Total</th>
            </tr>
          </thead>
          <tbody>
            ${itemsHtml}
          </tbody>
        </table>
      </div>
      
      <!-- Summary Totals -->
      <div style="display: flex; flex-direction: column; align-items: flex-end; gap: 0.4rem; font-size: 0.85rem; color:var(--color-text-main);">
        <div style="display:flex; justify-content:space-between; width: 220px;">
          <span>Subtotal:</span>
          <span style="font-family: var(--font-display);">₹${(o.total - (o.total * 0.05) - 15.00).toFixed(2)}</span>
        </div>
        <div style="display:flex; justify-content:space-between; width: 220px; color:var(--color-text-muted);">
          <span>GST (5%):</span>
          <span style="font-family: var(--font-display);">₹${((o.total - 15.00) * 0.05).toFixed(2)}</span>
        </div>
        <div style="display:flex; justify-content:space-between; width: 220px; color:var(--color-text-muted);">
          <span>Delivery Charge:</span>
          <span style="font-family: var(--font-display);">₹15.00</span>
        </div>
        <div style="display:flex; justify-content:space-between; width: 220px; font-weight:600; font-size:1rem; border-top:1px solid var(--color-border); padding-top:0.5rem; margin-top:0.2rem; color:var(--color-accent-gold);">
          <span>Grand Total:</span>
          <span style="font-family: var(--font-display);">₹${o.total.toFixed(2)}</span>
        </div>
      </div>
      
      <div style="margin-top: 2rem; display: flex; justify-content: flex-end; gap: 1rem;">
        <button class="btn btn-primary" onclick="printAdminOrderSlip('${o.id}')" style="background-color: var(--color-accent-gold); border-color: var(--color-accent-gold); color: #000; font-weight: 600;">
          <i class="fas fa-print" style="margin-right: 0.5rem;"></i> Print Packing Slip
        </button>
        <button class="btn btn-secondary" onclick="closeAdminOrderDetailModal()">Close Window</button>
      </div>
    </div>
  `;
  
  document.body.appendChild(backdrop);
};

window.closeAdminOrderDetailModal = function() {
  const modal = document.getElementById('admin-order-detail-modal');
  if (modal) modal.remove();
  if (state.posFullscreen && state.currentView === "admin") {
    document.body.style.overflow = "hidden";
  } else {
    document.body.style.overflow = "";
  }
};

window.printAdminOrderSlip = function(orderId) {
  const o = state.orders.find(order => order.id === orderId);
  if (!o) {
    showToast("Order details not found.");
    return;
  }
  
  const itemsRows = o.items.map(item => `
    <tr style="border-bottom: 1px solid #ddd;">
      <td style="padding: 8px 0; font-size: 13px;">
        <strong>${item.title}</strong>
        <div style="font-size: 11px; color: #555; margin-top: 2px;">Size: ${item.size}</div>
      </td>
      <td style="padding: 8px 0; font-size: 13px; text-align: center;">${item.qty}</td>
    </tr>
  `).join('');

  const printWindow = window.open('', '_blank', 'width=800,height=600');
  printWindow.document.write(`
    <html>
      <head>
        <title>HAIRAH - Dispatch Slip #${o.id}</title>
        <style>
          body {
            font-family: 'Helvetica Neue', Helvetica, Arial, sans-serif;
            color: #333;
            margin: 40px;
            background: #fff;
          }
          .header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-bottom: 2px solid #000;
            padding-bottom: 15px;
            margin-bottom: 30px;
          }
          .title {
            font-size: 24px;
            font-weight: 700;
            letter-spacing: 1px;
          }
          .meta-info {
            font-size: 12px;
            color: #666;
            text-align: right;
          }
          .grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 40px;
            margin-bottom: 40px;
          }
          .section-title {
            font-size: 12px;
            text-transform: uppercase;
            letter-spacing: 1px;
            border-bottom: 1px solid #000;
            padding-bottom: 5px;
            margin-bottom: 10px;
            color: #000;
            font-weight: bold;
          }
          .info-block {
            font-size: 14px;
            line-height: 1.6;
          }
          table {
            width: 100%;
            border-collapse: collapse;
            margin-bottom: 40px;
          }
          th {
            border-bottom: 1px solid #000;
            padding: 8px 0;
            font-size: 12px;
            text-transform: uppercase;
            text-align: left;
          }
          .footer {
            margin-top: 60px;
            border-top: 1px dashed #ccc;
            padding-top: 20px;
            text-align: center;
            font-size: 11px;
            color: #777;
          }
          @media print {
            body { margin: 20px; }
            button { display: none; }
          }
        </style>
      </head>
      <body>
        <div style="margin-bottom: 20px; text-align: right;">
          <button onclick="window.print();" style="padding: 10px 20px; background: #000; color: #fff; border: none; font-size: 14px; cursor: pointer; font-weight: bold; border-radius: 4px;">Print Dispatch Slip</button>
        </div>
        
        <div class="header">
          <div>
            <div class="title">HAIRAH MEN'S WORLD</div>
            <div style="font-size: 12px; color: #888; margin-top: 5px;">Premium Ready-made Attire</div>
          </div>
          <div class="meta-info">
            <strong>ORDER ID:</strong> ${o.id}<br>
            <strong>DATE:</strong> ${o.date}
          </div>
        </div>

        <div class="grid">
          <div>
            <div class="section-title">SHIP TO (DELIVERY ADDRESS)</div>
            <div class="info-block">
              <strong>Recipient:</strong> ${o.recipient_name || o.recipientName || 'N/A'}<br>
              <strong>Phone:</strong> ${o.phone || 'N/A'}<br>
              <strong>Address:</strong><br>
              ${o.address || 'N/A'}<br>
              ${o.city || ''}
            </div>
          </div>
          <div>
            <div class="section-title">ORDER & PAYMENT SUMMARY</div>
            <div class="info-block">
              <strong>Order Status:</strong> ${o.status}<br>
              <strong>Payment Method:</strong> ${o.payment_method || 'Card'}<br>
              <strong>Transaction ID:</strong> ${o.payment_id || 'N/A'}
            </div>
          </div>
        </div>

        <div class="section-title">ATTIRING ITEMS LIST</div>
        <table>
          <thead>
            <tr>
              <th>Item Description & Specifications</th>
              <th style="text-align: center; width: 80px;">Qty</th>
            </tr>
          </thead>
          <tbody>
            ${itemsRows}
          </tbody>
        </table>

        <div class="footer">
          Thank you for choosing HAIRAH Men's World. For delivery assistance or support, please contact customercare@hairah.com.<br>
          <em>Store Copy / Delivery Packing Slip</em>
        </div>

        <script>
          // Auto trigger print dialogue on load
          window.onload = function() {
            setTimeout(function() {
              window.print();
            }, 300);
          };
        </script>
      </body>
    </html>
  `);
  printWindow.document.close();
};

function saveCurrentCheckoutFormData() {
  const nameEl = document.getElementById("co-name");
  const emailEl = document.getElementById("co-email");
  const addressEl = document.getElementById("co-address");
  const cityEl = document.getElementById("co-city");
  const zipEl = document.getElementById("co-zip");
  const phoneEl = document.getElementById("co-phone");

  if (nameEl || emailEl || addressEl || cityEl || zipEl || phoneEl) {
    state.checkoutFormData = {
      name: nameEl ? nameEl.value : (state.checkoutFormData.name || ''),
      email: emailEl ? emailEl.value : (state.checkoutFormData.email || ''),
      address: addressEl ? addressEl.value : (state.checkoutFormData.address || ''),
      city: cityEl ? cityEl.value : (state.checkoutFormData.city || ''),
      zip: zipEl ? zipEl.value : (state.checkoutFormData.zip || ''),
      phone: phoneEl ? phoneEl.value : (state.checkoutFormData.phone || '')
    };
  }
}

window.applyCoupon = async function(event) {
  event.preventDefault();
  saveCurrentCheckoutFormData();
  const input = document.getElementById("coupon-code-input");
  const msgDiv = document.getElementById("coupon-message");
  if (!input) return;
  const code = input.value.trim().toUpperCase();
  if (!code) {
    showToast("Please enter a coupon code");
    return;
  }
  
  try {
    const res = await apiCall('/api/coupons/validate', 'POST', { code });
    if (res.valid) {
      state.appliedCoupon = {
        code,
        discountType: res.discountType,
        value: res.value
      };
      showToast(`Promo code ${code} applied successfully!`);
      navigate('checkout'); // re-render checkout
    } else {
      if (msgDiv) msgDiv.textContent = res.error || "Invalid coupon code";
      showToast(res.error || "Invalid coupon code", "danger");
    }
  } catch (err) {
    if (msgDiv) msgDiv.textContent = "Error validating coupon";
    showToast("Failed to validate coupon", "danger");
  }
};

window.removeCoupon = function(event) {
  event.preventDefault();
  saveCurrentCheckoutFormData();
  state.appliedCoupon = null;
  showToast("Promo coupon removed.");
  navigate('checkout'); // re-render checkout
};

window.handleAdminAddCoupon = async function(event) {
  event.preventDefault();
  const codeInput = document.getElementById("admin-coupon-code");
  const typeSelect = document.getElementById("admin-coupon-type");
  const valueInput = document.getElementById("admin-coupon-value");
  if (!codeInput || !typeSelect || !valueInput) return;

  const code = codeInput.value.trim().toUpperCase();
  const discountType = typeSelect.value;
  const value = parseFloat(valueInput.value);

  if (!code || isNaN(value) || value <= 0) {
    showToast("Invalid coupon inputs.", "danger");
    return;
  }

  try {
    const res = await apiCall('/api/admin/coupons', 'POST', { code, discountType, value });
    showToast(res.message || "Coupon added successfully!");
    await syncSessionAndDatabase(); // Reload state.coupons
    renderCurrentView(); // Re-render admin dashboard to update list
  } catch (err) {
    showToast("Failed to create coupon: " + (err.error || err.message), "danger");
  }
};

window.handleAdminDeleteCoupon = async function(code) {
  if (!confirm(`Are you sure you want to delete coupon ${code}?`)) return;
  try {
    const res = await apiCall('/api/admin/coupons/delete', 'POST', { code });
    showToast(res.message || "Coupon deleted successfully!");
    await syncSessionAndDatabase(); // Reload state.coupons
    renderCurrentView(); // Re-render admin dashboard to update list
  } catch (err) {
    showToast("Failed to delete coupon: " + (err.error || err.message), "danger");
  }
};
