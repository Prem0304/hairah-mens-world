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
  
  currentView: "home",
  activeFilter: "all",
  searchQuery: "",
  sortOption: "default",
  selectedProduct: null,
  profileActiveTab: "orders",
  adminActiveTab: "stats",
  merchantConfig: null
};

// --- DOM References ---
let appContainer, cartDrawer, cartDrawerBackdrop, cartBadge, wishlistBadge, cartItemsContainer, cartSubtotal;
let pdpModal, pdpContentContainer, toastContainer, headerAuthBtn, mobileMenuToggle, mainNavWrapper;

// --- API Request Helper ---
async function apiCall(endpoint, method = 'GET', body = null) {
  const options = {
    method,
    headers: {
      'Content-Type': 'application/json'
    },
    credentials: 'include' // Crucial for session cookies
  };
  
  if (body) {
    options.body = JSON.stringify(body);
  }
  
  try {
    const response = await fetch(endpoint, options);
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
    // A. Load catalog products
    PRODUCT_CATALOG = await apiCall('/api/products');
    
    // Load merchant payment config (needed for checkout routing)
    state.merchantConfig = await apiCall('/api/payments/merchant-config');
    
    // B. Check auth state
    const authData = await apiCall('/api/auth/me');
    state.currentUser = authData.user;
    
    if (state.currentUser) {
      // C. If customer, load personal wishlist & orders
      if (state.currentUser.role === 'customer') {
        state.wishlist = await apiCall('/api/wishlist');
        const ordersData = await apiCall('/api/orders');
        state.orders = ordersData.orders;
      }
      // D. If admin, load full orders database & accounts
      else if (state.currentUser.role === 'admin') {
        const adminData = await apiCall('/api/orders');
        state.orders = adminData.orders;
        state.users = adminData.users;
      }
    } else {
      state.wishlist = [];
      state.orders = [];
      state.users = [];
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
  if (window.closeStripeModal) window.closeStripeModal();
  if (window.closeMockRzpModal) window.closeMockRzpModal();
  if (window.closeAdminOrderDetailModal) window.closeAdminOrderDetailModal();
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
      appContainer.innerHTML = getAdminTemplate();
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
        <div class="hero-tagline">Premium Menswear Selection</div>
        <h1 class="hero-title">Sartorial Precision.<br><span>Modern Silhouette.</span></h1>
        <p class="hero-desc">Explore HAIRAH Men's World—where minimalism meets fine tailoring. Crafting elegant wardrobes featuring luxury shirts, pleated pants, and Pima cotton knitwear.</p>
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
        <img src="assets/shirt_white.jpg" alt="Shirts" class="collection-img">
        <div class="collection-overlay">
          <h3>Shirts</h3>
          <p>Two-ply cotton, structured collars, and elegant French cuffs.</p>
        </div>
      </div>

      <div class="collection-card" onclick="filterAndShop('pants')">
        <img src="assets/pants_chinos.jpg" alt="Pants" class="collection-img">
        <div class="collection-overlay">
          <h3>Pants</h3>
          <p>Double-pleated chinos and fine tropical wool trousers for perfect drape.</p>
        </div>
      </div>

      <div class="collection-card" onclick="filterAndShop('tshirts')">
        <img src="https://images.unsplash.com/photo-1521572267360-ee0c2909d518?auto=format&fit=crop&q=80&w=600" alt="T-Shirts" class="collection-img">
        <div class="collection-overlay">
          <h3>T-Shirts</h3>
          <p>Mulberry silk and long-staple Pima cotton knits with natural luster.</p>
        </div>
      </div>
    </div>

    <div class="feature-ribbon-grid">
      <div class="feature-ribbon-item">
        <i class="fas fa-gem"></i>
        <h4>Exceptional Materials</h4>
        <p>Two-ply Egyptian cotton, virgin tropical wools, and silk-blended knits.</p>
      </div>
      <div class="feature-ribbon-item">
        <i class="fas fa-ruler-combined"></i>
        <h4>Impeccable Cuts</h4>
        <p>Refined slim and tailored silhouettes designed to retain natural posture.</p>
      </div>
      <div class="feature-ribbon-item">
        <i class="fas fa-shipping-fast"></i>
        <h4>Luxury Fitting Delivery</h4>
        <p>Expedited processing with detailed quality verification before courier release.</p>
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
          
          <div style="display: flex; justify-content: space-between; align-items: center; margin-top: auto; padding-top: 1rem;">
            <div class="rating-stars">${starHtml}</div>
            <span style="font-size:0.75rem; text-transform:uppercase; letter-spacing:0.05em; color:var(--color-accent-gold); font-weight:600;">Details <i class="fas fa-arrow-right" style="font-size:0.65rem;"></i></span>
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
    </div>
  `;
}

// 3. Wishlist Template
function getWishlistTemplate() {
  const savedItems = PRODUCT_CATALOG.filter(p => state.wishlist.includes(p.id));

  if (savedItems.length === 0) {
    return `
      <div class="wishlist-layout" style="text-align: center; padding: 8rem 2rem;">
        <i class="far fa-heart" style="font-size: 4rem; margin-bottom: 2rem; color: var(--color-accent-gold);"></i>
        <h2 style="font-size: 2rem; font-weight: 300;">Your Wishlist is Empty</h2>
        <p style="color: var(--color-text-muted); margin-bottom: 3rem; margin-top: 0.5rem; font-size: 0.95rem;">Save your preferred cuts and items for later tailored fitting.</p>
        <button class="btn btn-primary" onclick="navigate('shop')">Explore Shop</button>
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
      <h2 style="font-size: 2.2rem; text-align: center; font-weight: 300;">Saved Selections</h2>
      <p style="text-align: center; color: var(--color-text-muted); font-size: 0.95rem; margin-top: 0.5rem;">Your curated favorites, ready for sizing and order verification.</p>
      
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
  const vat = subtotal * 0.05;
  const shipping = 15.00;
  const grandTotal = subtotal + vat + shipping;

  const cName = state.currentUser ? state.currentUser.name : '';
  const cEmail = state.currentUser ? state.currentUser.email : '';

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
      <h2 style="font-size: 2.2rem; margin-bottom: 3.5rem; text-align: center; font-weight: 300;">Sartorial Checkout</h2>
      
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
              <input type="text" class="form-input" id="co-address" placeholder="Street address, apartment, suite" required>
            </div>
            
            <div class="form-row">
              <div class="form-group">
                <label>City & Country</label>
                <input type="text" class="form-input" id="co-city" placeholder="e.g. Mumbai, India" required>
              </div>
              <div class="form-group">
                <label>Zip / PIN Code</label>
                <input type="text" class="form-input" id="co-zip" placeholder="e.g. 400001" maxlength="6" required>
                <span id="co-zip-err" style="font-size: 0.7rem; color: var(--color-danger); display: block; margin-top: 0.35rem; min-height: 1rem; font-weight: 500;"></span>
              </div>
            </div>
            
            <div class="form-row">
              <div class="form-group">
                <label>Contact Phone (India)</label>
                <input type="tel" class="form-input" id="co-phone" placeholder="e.g. +91 98765 43210" required>
                <span id="co-phone-err" style="font-size: 0.7rem; color: var(--color-danger); display: block; margin-top: 0.35rem; min-height: 1rem; font-weight: 500;"></span>
              </div>
              <div class="form-group" style="opacity: 0; pointer-events: none; height: 0; padding: 0; margin: 0;">
                <!-- Alignment helper -->
              </div>
            </div>
            
            <h3 class="checkout-section-title" style="margin-top: 3.5rem;">Sartorial Payment</h3>
            <p style="font-size: 0.85rem; color: var(--color-text-muted); margin-bottom: 2rem; line-height: 1.6;">
              Payments are securely encrypted and processed via Stripe Gateway, supporting card networks and instant UPI app scans.
            </p>
            
            <button type="submit" class="btn btn-primary" style="width: 100%; margin-top: 1rem; padding: 1.25rem; font-weight:600; text-transform:uppercase; letter-spacing:0.05em; ${hasStockIssue ? 'opacity: 0.5; cursor: not-allowed;' : ''}" ${hasStockIssue ? 'disabled' : ''}>
              ${hasStockIssue ? 'Resolve Stock Issues to Pay' : 'Proceed to secure payment'}
            </button>
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
            <div class="summary-item">
              <span>Sartorial Delivery</span>
              <span>₹${shipping.toFixed(2)}</span>
            </div>
            <div class="summary-item">
              <span>VAT / Styling Surcharge (5%)</span>
              <span>₹${vat.toFixed(2)}</span>
            </div>
            
            <div class="summary-total">
              <span>Total Charge</span>
              <span>₹${grandTotal.toFixed(2)}</span>
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
          <p>Standard Customer Demo: <code style="color:var(--color-accent-gold);">customer@hairah.com</code> / <code style="color:var(--color-accent-gold);">password</code></p>
          <p style="margin-top: 0.5rem;">Standard Admin Demo: <code style="color:var(--color-accent-gold);">admin@hairah.com</code> / <code style="color:var(--color-accent-gold);">admin123</code></p>
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
      <h2 style="font-size: 2.2rem; font-weight: 300; margin-bottom: 3.5rem;">Sartorial Account Profile</h2>
      
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

// Helper to format JS Date object to premium display string (e.g. "03 Aug 2026")
function formatJSDateToDisplayString(dateObj) {
  const monthNames = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
  const day = String(dateObj.getDate()).padStart(2, '0');
  const month = monthNames[dateObj.getMonth()];
  const year = dateObj.getFullYear();
  return `${day} ${month} ${year}`;
}

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
  
  const ordersRows = filteredOrders.map(o => {
    const itemsLabel = o.items.map(item => `${item.title} (x${item.qty})`).join(', ');
    const paymentLabel = `Method: ${o.payment_method || 'Card'}\nTx ID: ${o.payment_id || 'N/A'}`;
    
    return `
      <tr>
        <td style="font-family:var(--font-display); font-weight:600; color:var(--color-accent-gold);" title="${paymentLabel}">${o.id}</td>
        <td>${o.customer_email || o.customerEmail}</td>
        <td>${o.date}</td>
        <td style="max-width: 200px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;" title="${itemsLabel}">${itemsLabel}</td>
        <td style="font-weight:600; font-family:var(--font-display); text-align:right;">₹${o.total.toFixed(2)}</td>
        <td>
          <select class="status-dropdown" onchange="handleAdminChangeOrderStatus('${o.id}', this)">
            <option value="Processing" ${o.status === 'Processing' ? 'selected' : ''}>Processing</option>
            <option value="Shipped" ${o.status === 'Shipped' ? 'selected' : ''}>Shipped</option>
            <option value="Delivered" ${o.status === 'Delivered' ? 'selected' : ''}>Delivered</option>
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
      
      <div class="admin-stats-ribbon" style="grid-template-columns: repeat(2, 1fr);">
        <div class="stat-card" style="position: relative;">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 0.5rem;">
            <span class="stat-card-title">${revenueTitle}</span>
            <select onchange="handleAdminChangeMetricsView(this.value)" style="background: rgba(255,255,255,0.05); border: 1px solid var(--color-border); color: var(--color-text-main); font-size: 0.75rem; border-radius: 4px; padding: 0.2rem 0.5rem; outline: none; cursor: pointer; font-weight: 500; font-family: inherit;">
              <option value="daily" ${state.adminMetricView === 'daily' ? 'selected' : ''}>Daily</option>
              <option value="weekly" ${state.adminMetricView === 'weekly' ? 'selected' : ''}>Weekly</option>
              <option value="monthly" ${state.adminMetricView === 'monthly' ? 'selected' : ''}>Monthly</option>
              <option value="custom" ${state.adminMetricView === 'custom' ? 'selected' : ''}>Custom Range</option>
              <option value="total" ${state.adminMetricView === 'total' ? 'selected' : ''}>Lifetime</option>
            </select>
          </div>
          <span class="stat-card-value">₹${revenueValue.toFixed(2)}</span>
        </div>
        <div class="stat-card">
          <span class="stat-card-title">${ordersTitle}</span>
          <span class="stat-card-value">${ordersValue}</span>
        </div>
      </div>
      
      <div class="admin-tabs">
        <div class="admin-tab ${state.adminActiveTab === 'stats' ? 'active' : ''}" onclick="switchAdminTab('stats')">Orders Registry</div>
        <div class="admin-tab ${state.adminActiveTab === 'inventory' ? 'active' : ''}" onclick="switchAdminTab('inventory')">Inventory Control</div>
        <div class="admin-tab ${state.adminActiveTab === 'customers' ? 'active' : ''}" onclick="switchAdminTab('customers')">Customer Directory</div>
        <div class="admin-tab ${state.adminActiveTab === 'payment' ? 'active' : ''}" onclick="switchAdminTab('payment')">Payment Settings</div>
      </div>
      
      <div id="admin-pane-stats" style="display: ${state.adminActiveTab === 'stats' ? 'block' : 'none'};">
        <div style="display: flex; justify-content: space-between; align-items: center; flex-wrap: wrap; gap: 1rem; margin-bottom: 2rem;">
          <h3 style="font-size: 1.25rem; margin: 0; letter-spacing:0.05em;">Placed Attire Orders</h3>
          
          <div style="display: flex; align-items: center; gap: 1rem; flex-wrap: wrap;">
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
                <th>Customer Email</th>
                <th>Order Date</th>
                <th>Purchased Items</th>
                <th style="text-align:right;">Grand Total</th>
                <th>Order Status</th>
                <th style="text-align:center;">Action</th>
              </tr>
            </thead>
            <tbody>
              ${ordersRows.length === 0 ? `<tr><td colspan="7" style="text-align:center; padding:5rem; color:var(--color-text-muted); font-style:italic;">No orders registered for this date.</td></tr>` : ordersRows}
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
            <div class="form-group" style="margin-bottom: 1.5rem;">
              <label>Select Payment Gateway</label>
              <select class="form-input" id="admin-gateway-type" onchange="toggleAdminGatewayFields(this)" style="background-color: var(--color-bg-input); border: 1px solid var(--color-border); color: var(--color-text-main); font-size: 0.85rem; cursor: pointer;">
                <option value="Simulated" ${state.merchantConfig?.gateway_type === 'Simulated' ? 'selected' : ''}>Simulated Portal (Stripe / UPI UTR verification)</option>
                <option value="Stripe" ${state.merchantConfig?.gateway_type === 'Stripe' ? 'selected' : ''}>Stripe (Real checkouts)</option>
                <option value="Razorpay" ${state.merchantConfig?.gateway_type === 'Razorpay' ? 'selected' : ''}>Razorpay (Real checkouts)</option>
              </select>
            </div>
            
            <div id="admin-razorpay-credentials" style="display: ${state.merchantConfig?.gateway_type === 'Razorpay' ? 'block' : 'none'}; border-top: 1px dashed var(--color-border); padding-top: 1.5rem; margin-bottom: 1.5rem;">
              <div class="form-group" style="margin-bottom: 1.5rem;">
                <label>Razorpay Key ID</label>
                <input type="text" class="form-input" id="admin-rzp-key" value="${state.merchantConfig?.razorpay_key_id || ''}" placeholder="rzp_test_xxxxxx">
              </div>
              <div class="form-group" style="margin-bottom: 1.5rem;">
                <label>Razorpay Key Secret</label>
                <input type="password" class="form-input" id="admin-rzp-secret" value="${state.merchantConfig?.razorpay_key_secret || ''}" placeholder="Key Secret Value">
              </div>
            </div>

            <div id="admin-stripe-credentials" style="display: ${state.merchantConfig?.gateway_type === 'Stripe' ? 'block' : 'none'}; border-top: 1px dashed var(--color-border); padding-top: 1.5rem; margin-bottom: 1.5rem;">
              <div class="form-group" style="margin-bottom: 1.5rem;">
                <label>Stripe Publishable Key</label>
                <input type="text" class="form-input" id="admin-stripe-pub-key" value="${state.merchantConfig?.stripe_publishable_key || ''}" placeholder="pk_test_xxxxxx">
              </div>
              <div class="form-group" style="margin-bottom: 1.5rem;">
                <label>Stripe Secret Key</label>
                <input type="password" class="form-input" id="admin-stripe-secret-key" value="${state.merchantConfig?.stripe_secret_key || ''}" placeholder="sk_test_xxxxxx">
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
    </div>
  `;
}

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

// --- Product Modal (PDP) Actions ---
window.openPDP = async function(productId) {
  const product = PRODUCT_CATALOG.find(p => p.id === productId);
  if (!product) return;
  
  state.selectedProduct = product;
  
  // A. Load reviews dynamically from backend
  let reviewsList = [];
  try {
    reviewsList = await apiCall(`/api/reviews/${productId}`);
    state.reviews[productId] = reviewsList;
  } catch (error) {
    console.error("Failed to load reviews");
  }

  // Compute stats
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

  pdpContentContainer.innerHTML = `
    <div class="pdp-gallery">
      <img src="${product.image}" alt="${product.title}" class="pdp-main-img">
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
              const getRecommendedSize = (cat, sizing) => {
                if (!sizing) return null;
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
                return null;
              };

              const recommendedSize = getRecommendedSize(product.category, state.currentUser?.sizing);
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
          <h4 style="font-size: 1.1rem; letter-spacing:0.05em;">Client Reviews (${totalReviews})</h4>
          <button class="btn btn-secondary" style="padding:0.5rem 1rem; font-size:0.7rem;" onclick="openReviewModal()">Write Review</button>
        </div>
        
        <div class="review-stats" style="margin-bottom:2rem; padding: 1.5rem; background: var(--color-bg-card); border: 1px solid var(--color-border);">
          <span class="review-avg-num">${avgRating.toFixed(1)}</span>
          <div>
            <div class="rating-stars" style="font-size:0.9rem; margin-bottom:0.2rem;">${starHeaderHtml}</div>
            <span style="font-size:0.75rem; color:var(--color-text-muted);">Verified rating average</span>
          </div>
        </div>
        
        <div class="review-list">
          ${totalReviews === 0 ? `<p style="color:var(--color-text-muted); font-size:0.9rem; text-align:center;">No reviews yet. Be the first to leave review feedback!</p>` : reviewsHtml}
        </div>
      </div>
    </div>
  `;

  pdpModal.classList.add("active");
  document.body.style.overflow = "hidden";
};

window.closePDPModal = function() {
  pdpModal.classList.remove("active");
  state.selectedProduct = null;
  document.body.style.overflow = "";
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

  const colorElement = pdpContentContainer.querySelector(".color-option.active");
  const sizeElement = pdpContentContainer.querySelector(".size-btn.active");
  
  const color = colorElement ? colorElement.getAttribute("data-color-name") : product.colors[0].name;
  const size = sizeElement ? sizeElement.getAttribute("data-size") : (product.sizes.find(s => (product.sizes_stock?.[s] ?? 0) > 0) || product.sizes[0]);
  
  const key = `${product.id}-${color}-${size}`;
  const existingItemIndex = state.cart.findIndex(item => item.key === key);
  
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
    document.body.style.overflow = "";
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
  const vat = subtotal * 0.05;
  const grandTotal = subtotal + vat + 15.00;
  
  const gateway = state.merchantConfig?.gateway_type || 'Simulated';
  
  // A. IF RAZORPAY GATEWAY IS ACTIVE
  if (gateway === 'Razorpay') {
    try {
      showToast("Initializing Razorpay checkout portal...");
      
      // Load Razorpay SDK script dynamically if not loaded
      if (typeof window.Razorpay === 'undefined') {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://checkout.razorpay.com/v1/checkout.js';
          script.onload = resolve;
          script.onerror = () => reject(new Error("Failed to load Razorpay Checkout SDK"));
          document.head.appendChild(script);
        });
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
      
      // 2. If backend config is mock or simulated, open our mock Razorpay modal
      if (orderRes.gatewayType === 'Simulated') {
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
  } 
  
  // B. IF SIMULATED OR STRIPE CHECKOUT PORTAL IS ACTIVE
  else {
    try {
      // 1. Create Stripe Payment Intent on Backend
      const intentRes = await apiCall('/api/payments/create-intent', 'POST', {
        total: grandTotal,
        items: state.cart
      });
      
      // 2. Open Stripe Secure Checkout Modal
      await openStripeCheckoutModal(intentRes.clientSecret, grandTotal, {
        recipientName,
        recipientEmail,
        address: finalAddress,
        city: cityVal,
        phone: phoneVal,
        total: grandTotal,
        items: state.cart
      }, intentRes.gatewayType, intentRes.publishableKey);
    } catch (error) {
      showToast("Unable to initialize secure checkout portal.");
    }
  }
};

async function openStripeCheckoutModal(clientSecret, totalAmount, orderPayload, gatewayType = 'Simulated', publishableKey = '') {
  document.body.style.overflow = "hidden";
  
  if (gatewayType === 'Stripe') {
    if (typeof window.Stripe === 'undefined') {
      try {
        await new Promise((resolve, reject) => {
          const script = document.createElement('script');
          script.src = 'https://js.stripe.com/v3/';
          script.onload = resolve;
          script.onerror = () => reject(new Error("Failed to load Stripe SDK"));
          document.head.appendChild(script);
        });
      } catch (err) {
        showToast("Failed to load Stripe secure elements checkout.");
        document.body.style.overflow = "";
        return;
      }
    }
  }

  // Read merchant configuration from global state
  const merchantUpi = state.merchantConfig?.upi_id || 'hairah@upi';
  const merchantHolder = state.merchantConfig?.account_holder || 'HAIRAH MENS WORLD';
  const merchantBank = state.merchantConfig?.bank_name || 'Bespoke Sartorial Bank';
  const merchantAccount = state.merchantConfig?.account_number || '9876543210';
  
  const qrData = `upi://pay?pa=${merchantUpi}&pn=${encodeURIComponent(merchantHolder)}&am=${totalAmount.toFixed(2)}&cu=INR`;
  const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=180x180&data=${encodeURIComponent(qrData)}`;

  const isLive = publishableKey.startsWith('pk_live');
  const badgeText = gatewayType === 'Simulated' ? 'Simulated' : (isLive ? 'Live Mode' : 'Test Mode');

  // Create backdrop container
  const backdrop = document.createElement('div');
  backdrop.className = 'stripe-modal-backdrop';
  backdrop.id = 'stripe-payment-modal';
  
  backdrop.innerHTML = `
    <div class="stripe-modal-content">
      <div class="stripe-modal-header">
        <div class="stripe-logo-container">
          <i class="fab fa-stripe" style="font-size: 3rem; color: var(--color-accent-gold);"></i>
          <span class="stripe-badge-test">${badgeText}</span>
        </div>
        <button class="stripe-close-btn" onclick="closeStripeModal()"><i class="fas fa-times"></i></button>
      </div>
      
      <div class="stripe-amount-banner">
        <div class="stripe-amount-label">HAIRAH Men's World Payment</div>
        <div class="stripe-amount-value">₹${totalAmount.toFixed(2)}</div>
      </div>
      
      ${gatewayType === 'Simulated' ? `
      <div class="stripe-tabs">
        <div class="stripe-tab active" id="tab-stripe-card" onclick="switchStripeTab('Card')">Credit / Debit Card</div>
        <div class="stripe-tab" id="tab-stripe-upi" onclick="switchStripeTab('UPI')">UPI / QR Code</div>
      </div>
      ` : ''}
      
      <!-- Card Pane -->
      ${gatewayType === 'Simulated' ? `
      <div class="stripe-pane active" id="pane-stripe-card">
        <form onsubmit="handleStripeCardSubmit(event, '${clientSecret}', ${totalAmount}, ${JSON.stringify(orderPayload).replace(/"/g, '&quot;')})">
          <div class="form-group" style="margin-bottom: 1rem;">
            <div style="font-size:0.75rem; color:var(--color-text-muted); margin-bottom:1rem; border:1px dashed var(--color-border); padding:0.5rem; border-radius:4px;">
              Funds will be settled to: <strong>${merchantHolder}</strong> (${merchantBank} - A/C ${merchantAccount})
            </div>
            <label style="font-size: 0.75rem;">Card Number</label>
            <div style="position: relative; display: flex; align-items: center;">
              <input type="text" class="form-input" id="stripe-card-num" placeholder="4242 4242 4242 4242" required style="padding-left: 2.8rem;" oninput="formatCardNumberInput(this)">
              <i class="fas fa-credit-card" id="stripe-card-icon" style="position: absolute; left: 1rem; color: var(--color-text-muted);"></i>
            </div>
          </div>
          
          <div class="form-row" style="gap: 1.5rem; margin-bottom: 2rem;">
            <div class="form-group" style="margin-bottom: 0;">
              <label style="font-size: 0.75rem;">Expiration Date</label>
              <input type="text" class="form-input" id="stripe-card-expiry" placeholder="MM/YY" maxlength="5" required oninput="formatCardExpiryInput(this)">
            </div>
            <div class="form-group" style="margin-bottom: 0;">
              <label style="font-size: 0.75rem;">Security Code (CVC)</label>
              <input type="password" class="form-input" id="stripe-card-cvc" placeholder="123" minlength="3" maxlength="4" required>
            </div>
          </div>
          
          <button type="submit" class="btn btn-primary" style="width: 100%; padding: 1rem; text-transform: uppercase; font-weight: 600; font-size: 0.85rem; letter-spacing: 0.05em;">
            Pay ₹${totalAmount.toFixed(2)}
          </button>
        </form>
      </div>
      ` : `
      <div class="stripe-pane active" id="pane-stripe-card">
        <form id="stripe-real-payment-form">
          <div class="form-group" style="margin-bottom: 1.5rem;">
            <div style="font-size:0.75rem; color:var(--color-text-muted); margin-bottom:1rem; border:1px dashed var(--color-border); padding:0.5rem; border-radius:4px;">
              Secure payment processed via Stripe Payments.
            </div>
            <label style="font-size: 0.75rem; display:block; margin-bottom: 0.5rem;">Credit / Debit Card Details</label>
            <div id="stripe-card-element" style="background-color: var(--color-bg-input); padding: 1.2rem; border-radius: 6px; border: 1px solid var(--color-border); margin-bottom: 1.5rem;"></div>
            <div id="stripe-card-errors" role="alert" style="color: var(--color-danger); font-size: 0.8rem; margin-top: -0.5rem; margin-bottom: 1rem;"></div>
          </div>
          
          <button type="submit" class="btn btn-primary" style="width: 100%; padding: 1rem; text-transform: uppercase; font-weight: 600; font-size: 0.85rem; letter-spacing: 0.05em;">
            Pay ₹${totalAmount.toFixed(2)}
          </button>
        </form>
      </div>
      `}
      
      <!-- UPI Pane -->
      ${gatewayType === 'Simulated' ? `
      <div class="stripe-pane" id="pane-stripe-upi">
        <div class="stripe-qr-wrapper" style="padding-bottom: 0.5rem;">
          <div style="font-size: 0.8rem; color: var(--color-text-muted); line-height: 1.5;">
            Scan this QR code using GPay, PhonePe, or Paytm to pay <strong>${merchantHolder}</strong> directly.
          </div>
          
          <img class="stripe-qr-image" src="${qrUrl}" alt="UPI Payment QR Code" style="margin: 0.5rem 0;">
          
          <div style="font-size:0.75rem; color:var(--color-accent-gold); font-weight:600; margin-bottom: 1rem;">Destination UPI: ${merchantUpi}</div>
          
          <div style="width: 100%; border-top: 1px solid var(--color-border); padding-top: 1rem; text-align: left;">
            <label style="font-size: 0.75rem; display: block; margin-bottom: 0.5rem; font-weight: 600;">Submit UPI Ref / UTR Number</label>
            <div style="display: flex; gap: 0.5rem;">
              <input type="text" class="form-input" id="stripe-upi-utr" placeholder="12-digit UTR Number" maxlength="12" style="font-family: monospace; letter-spacing: 0.05em; font-size: 0.85rem;" oninput="this.value = this.value.replace(/\\D/g, '')">
              <button type="button" class="btn btn-primary" style="font-size: 0.75rem; padding: 0.6rem 1rem; white-space: nowrap;" onclick="handleUPIUTRSubmit('${clientSecret}', ${totalAmount}, ${JSON.stringify(orderPayload).replace(/"/g, '&quot;')})">
                Verify UTR
              </button>
            </div>
            <p style="font-size: 0.65rem; color: var(--color-text-muted); margin-top: 0.35rem;">Enter the 12-digit transaction Ref No. from GPay/PhonePe to confirm your payment.</p>
          </div>
          
          <div style="width: 100%; display: flex; align-items: center; justify-content: center; gap: 0.5rem; margin-top: 1rem; border-top: 1px dashed var(--color-border); padding-top: 1rem;">
            <span style="font-size: 0.7rem; color: var(--color-text-muted);">Quick Test:</span>
            <button type="button" class="btn btn-secondary" style="font-size: 0.65rem; padding: 0.4rem 0.8rem;" onclick="simulateStripeUPIScanSuccess('${clientSecret}', ${totalAmount}, ${JSON.stringify(orderPayload).replace(/"/g, '&quot;')})">
              Simulate Scan Approval
            </button>
          </div>
        </div>
        
        <div style="text-align: center; margin: 1rem 0; color: var(--color-border); font-size: 0.8rem; font-weight: 600;">OR PAY VIA UPI ID</div>
        
        <form onsubmit="handleStripeUPIIdSubmit(event, '${clientSecret}', ${totalAmount}, ${JSON.stringify(orderPayload).replace(/"/g, '&quot;')})">
          <div class="form-group" style="margin-bottom: 1.5rem;">
            <label style="font-size: 0.75rem;">Enter UPI ID (VPA)</label>
            <input type="text" class="form-input" id="stripe-upi-vpa" placeholder="username@upi" required>
          </div>
          
          <button type="submit" class="btn btn-primary" style="width: 100%; padding: 1rem; text-transform: uppercase; font-weight: 600; font-size: 0.85rem; letter-spacing: 0.05em;">
            Verify and Pay ₹${totalAmount.toFixed(2)}
          </button>
        </form>
      </div>
      ` : ''}
      
      <!-- Processing overlay (hidden by default) -->
      <div class="stripe-loader-overlay" id="stripe-loading" style="display: none;">
        <div class="stripe-spinner"></div>
        <div style="font-family: var(--font-display); font-size: 1.1rem; letter-spacing: 0.05em;" id="stripe-loading-text">Confirming payment with bank...</div>
      </div>
    </div>
  `;
  
  document.body.appendChild(backdrop);

  if (gatewayType === 'Stripe') {
    const stripeInstance = window.Stripe(publishableKey);
    const elements = stripeInstance.elements();
    
    const textColor = getComputedStyle(document.documentElement).getPropertyValue('--color-text-main').trim() || '#252422';
    const cardElement = elements.create('card', {
      style: {
        base: {
          color: textColor,
          fontFamily: 'Outfit, Inter, sans-serif',
          fontSize: '15px',
          '::placeholder': {
            color: '#888888'
          }
        },
        invalid: {
          color: '#C02A2A',
          iconColor: '#C02A2A'
        }
      }
    });
    
    cardElement.mount('#stripe-card-element');
    
    const form = document.getElementById('stripe-real-payment-form');
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      
      const loader = document.getElementById('stripe-loading');
      const loaderText = document.getElementById('stripe-loading-text');
      loader.style.display = 'flex';
      loaderText.innerText = 'Processing real card payment...';
      
      const { paymentIntent, error } = await stripeInstance.confirmCardPayment(clientSecret, {
        payment_method: {
          card: cardElement
        }
      });
      
      if (error) {
        loader.style.display = 'none';
        const errorDiv = document.getElementById('stripe-card-errors');
        errorDiv.innerText = error.message;
      } else if (paymentIntent && paymentIntent.status === 'succeeded') {
        loaderText.innerText = 'Creating order reference...';
        try {
          orderPayload.paymentId = paymentIntent.id;
          orderPayload.paymentMethod = 'Stripe (Real Card)';
          
          const finalOrder = await apiCall('/api/orders', 'POST', orderPayload);
          
          loader.innerHTML = `
            <div class="stripe-success-checkmark"><i class="fas fa-check-circle" style="color:var(--color-success);"></i></div>
            <div style="font-family: var(--font-display); font-size: 1.2rem; color: var(--color-success); font-weight: 500; margin-top: 1rem;">Payment Succeeded</div>
          `;
          
          setTimeout(() => {
            closeStripeModal();
            showOrderReceipt(finalOrder.orderId, orderPayload, 'Stripe (Real Card)', paymentIntent.id);
          }, 1500);
        } catch (err) {
          loader.style.display = 'none';
          showToast("Order creation failed after payment success. Contact support.");
        }
      }
    });
  }
}

window.closeStripeModal = function() {
  const modal = document.getElementById('stripe-payment-modal');
  if (modal) modal.remove();
  document.body.style.overflow = "";
};

window.switchStripeTab = function(method) {
  const tabCard = document.getElementById('tab-stripe-card');
  const tabUpi = document.getElementById('tab-stripe-upi');
  const paneCard = document.getElementById('pane-stripe-card');
  const paneUpi = document.getElementById('pane-stripe-upi');
  
  if (method === 'Card') {
    tabCard.classList.add('active');
    tabUpi.classList.remove('active');
    paneCard.classList.add('active');
    paneUpi.classList.remove('active');
  } else {
    tabUpi.classList.add('active');
    tabCard.classList.remove('active');
    paneUpi.classList.add('active');
    paneCard.classList.remove('active');
  }
};

window.formatCardNumberInput = function(input) {
  let val = input.value.replace(/\D/g, '');
  if (val.length > 16) val = val.substring(0, 16);
  
  // Format as groups of 4
  const formatted = val.match(/.{1,4}/g);
  input.value = formatted ? formatted.join(' ') : val;
  
  // Update card brand icon dynamically
  const cardIcon = document.getElementById('stripe-card-icon');
  if (val.startsWith('4')) {
    cardIcon.className = 'fab fa-cc-visa';
    cardIcon.style.color = '#1A1F71';
  } else if (val.startsWith('5')) {
    cardIcon.className = 'fab fa-cc-mastercard';
    cardIcon.style.color = '#EB001B';
  } else if (val.startsWith('3')) {
    cardIcon.className = 'fab fa-cc-amex';
    cardIcon.style.color = '#007bc1';
  } else {
    cardIcon.className = 'fas fa-credit-card';
    cardIcon.style.color = 'var(--color-text-muted)';
  }
};

window.formatCardExpiryInput = function(input) {
  let val = input.value.replace(/\D/g, '');
  if (val.length > 4) val = val.substring(0, 4);
  
  if (val.length > 2) {
    input.value = val.substring(0, 2) + '/' + val.substring(2);
  } else {
    input.value = val;
  }
};

window.handleStripeCardSubmit = async function(event, clientSecret, amount, orderPayload) {
  event.preventDefault();
  
  const cardNumber = document.getElementById('stripe-card-num').value;
  const expiry = document.getElementById('stripe-card-expiry').value;
  const cvc = document.getElementById('stripe-card-cvc').value;
  
  // Show Loading Spinner overlay
  const loader = document.getElementById('stripe-loading');
  const loaderText = document.getElementById('stripe-loading-text');
  loader.style.display = 'flex';
  loaderText.innerText = 'Authorizing card details...';
  
  try {
    const confirmRes = await apiCall('/api/payments/confirm', 'POST', {
      clientSecret,
      paymentMethod: 'Card',
      cardNumber,
      expiry,
      cvv: cvc
    });
    
    // Simulate approval animation delay
    setTimeout(async () => {
      loaderText.innerText = 'Registering order reference...';
      try {
        orderPayload.paymentId = confirmRes.paymentId;
        orderPayload.paymentMethod = 'Card';
        
        const finalOrder = await apiCall('/api/orders', 'POST', orderPayload);
        
        // Show success screen inside modal
        loader.innerHTML = `
          <div class="stripe-success-checkmark"><i class="fas fa-check-circle"></i></div>
          <div style="font-family: var(--font-display); font-size: 1.2rem; color: var(--color-success); font-weight: 500;">Payment Authorized</div>
        `;
        
        setTimeout(() => {
          closeStripeModal();
          showOrderReceipt(finalOrder.orderId, orderPayload, 'Card', confirmRes.paymentId);
        }, 1500);
      } catch (err) {
        loader.style.display = 'none';
        showToast(err.error || "Order placement failed.");
      }
    }, 1500);
  } catch (error) {
    loader.style.display = 'none';
    showToast(error.error || "Card payment rejected.");
  }
};

window.simulateStripeUPIScanSuccess = async function(clientSecret, amount, orderPayload) {
  const loader = document.getElementById('stripe-loading');
  const loaderText = document.getElementById('stripe-loading-text');
  loader.style.display = 'flex';
  loaderText.innerText = 'Awaiting mobile UPI notification approval...';
  
  try {
    const confirmRes = await apiCall('/api/payments/confirm', 'POST', {
      clientSecret,
      paymentMethod: 'UPI',
      upiType: 'qr'
    });
    
    setTimeout(async () => {
      loaderText.innerText = 'UPI Transaction authorized. Creating order...';
      try {
        orderPayload.paymentId = confirmRes.paymentId;
        orderPayload.paymentMethod = 'UPI (QR Code)';
        
        const finalOrder = await apiCall('/api/orders', 'POST', orderPayload);
        
        loader.innerHTML = `
          <div class="stripe-success-checkmark"><i class="fas fa-check-circle"></i></div>
          <div style="font-family: var(--font-display); font-size: 1.2rem; color: var(--color-success); font-weight: 500;">UPI Payment Approved</div>
        `;
        
        setTimeout(() => {
          closeStripeModal();
          showOrderReceipt(finalOrder.orderId, orderPayload, 'UPI (QR Code)', confirmRes.paymentId);
        }, 1500);
      } catch (err) {
        loader.style.display = 'none';
        showToast(err.error || "Order placement failed.");
      }
    }, 2000);
  } catch (error) {
    loader.style.display = 'none';
    showToast("UPI Transaction failed.");
  }
};

window.handleStripeUPIIdSubmit = async function(event, clientSecret, amount, orderPayload) {
  event.preventDefault();
  
  const upiId = document.getElementById('stripe-upi-vpa').value;
  
  const loader = document.getElementById('stripe-loading');
  const loaderText = document.getElementById('stripe-loading-text');
  loader.style.display = 'flex';
  loaderText.innerText = `Sending payment request to ${upiId}...`;
  
  try {
    const confirmRes = await apiCall('/api/payments/confirm', 'POST', {
      clientSecret,
      paymentMethod: 'UPI',
      upiType: 'id',
      upiId: upiId
    });
    
    setTimeout(async () => {
      loaderText.innerText = 'Awaiting UPI app authorization...';
      setTimeout(async () => {
        try {
          orderPayload.paymentId = confirmRes.paymentId;
          orderPayload.paymentMethod = `UPI (ID: ${upiId})`;
          
          const finalOrder = await apiCall('/api/orders', 'POST', orderPayload);
          
          loader.innerHTML = `
            <div class="stripe-success-checkmark"><i class="fas fa-check-circle"></i></div>
            <div style="font-family: var(--font-display); font-size: 1.2rem; color: var(--color-success); font-weight: 500;">UPI ID Payment Approved</div>
          `;
          
          setTimeout(() => {
            closeStripeModal();
            showOrderReceipt(finalOrder.orderId, orderPayload, `UPI (ID: ${upiId})`, confirmRes.paymentId);
          }, 1500);
        } catch (err) {
          loader.style.display = 'none';
          showToast(err.error || "Order placement failed.");
        }
      }, 1500);
    }, 1500);
  } catch (error) {
    loader.style.display = 'none';
    showToast(error.error || "UPI ID verification failed.");
  }
};

function showOrderReceipt(orderId, orderPayload, method, paymentId) {
  // Clear cart locally
  state.cart = [];
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
          <span>Stripe Transaction</span>
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

window.downloadDailyOrdersCSV = function() {
  const filteredOrders = state.lastFilteredOrders || state.orders;
  
  if (filteredOrders.length === 0) {
    showToast("No orders available to download for this selection.");
    return;
  }
  
  const headers = ["Order ID", "Customer Email", "Date", "Items Purchased", "Grand Total (INR)", "Status", "Payment Method", "Payment ID"];
  
  const rows = filteredOrders.map(o => {
    const items = o.items.map(item => `${item.title} (x${item.qty})`).join('; ');
    const email = o.customer_email || o.customerEmail || 'N/A';
    const method = o.payment_method || 'Card';
    const paymentId = o.payment_id || 'N/A';
    
    return [
      o.id,
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
  const gatewayType = document.getElementById("admin-gateway-type").value;
  const razorpayKeyId = document.getElementById("admin-rzp-key").value.trim();
  const razorpayKeySecret = document.getElementById("admin-rzp-secret").value.trim();
  const stripePublishableKey = document.getElementById("admin-stripe-pub-key").value.trim();
  const stripeSecretKey = document.getElementById("admin-stripe-secret-key").value.trim();
  
  try {
    const result = await apiCall('/api/payments/merchant-config', 'POST', {
      upiId,
      accountHolder,
      bankName,
      accountNumber,
      gatewayType,
      razorpayKeyId,
      razorpayKeySecret,
      stripePublishableKey,
      stripeSecretKey
    });
    showToast(result.message);
    await syncSessionAndDatabase(); // Reload updated config
    renderCurrentView();
  } catch (error) {
    showToast(error.error || "Failed to save payment settings.");
  }
};

window.handleUPIUTRSubmit = async function(clientSecret, amount, orderPayload) {
  const utr = document.getElementById('stripe-upi-utr').value.trim();
  if (utr.length !== 12 || !/^\d{12}$/.test(utr)) {
    showToast("Please enter a valid 12-digit UPI UTR/Ref Number.");
    return;
  }
  
  const loader = document.getElementById('stripe-loading');
  const loaderText = document.getElementById('stripe-loading-text');
  loader.style.display = 'flex';
  loaderText.innerText = `Reconciling UTR Ref: ${utr}...`;
  
  try {
    const confirmRes = await apiCall('/api/payments/confirm', 'POST', {
      clientSecret,
      paymentMethod: 'UPI',
      upiType: 'qr',
      upiId: utr
    });
    
    setTimeout(async () => {
      loaderText.innerText = 'Payment received in account. Creating order...';
      try {
        orderPayload.paymentId = confirmRes.paymentId;
        orderPayload.paymentMethod = `UPI (QR UTR: ${utr})`;
        
        const finalOrder = await apiCall('/api/orders', 'POST', orderPayload);
        
        loader.innerHTML = `
          <div class="stripe-success-checkmark"><i class="fas fa-check-circle"></i></div>
          <div style="font-family: var(--font-display); font-size: 1.2rem; color: var(--color-success); font-weight: 500;">Payment Confirmed via UTR</div>
        `;
        
        setTimeout(() => {
          closeStripeModal();
          showOrderReceipt(finalOrder.orderId, orderPayload, `UPI (QR UTR: ${utr})`, confirmRes.paymentId);
        }, 1500);
      } catch (err) {
        loader.style.display = 'none';
        showToast(err.error || "Order placement failed.");
      }
    }, 2000);
  } catch (error) {
    loader.style.display = 'none';
    showToast("Failed to verify UTR.");
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

// --- Razorpay Configurations and Simulated Helpers ---
window.toggleAdminGatewayFields = function(select) {
  const rzpCreds = document.getElementById("admin-razorpay-credentials");
  if (rzpCreds) {
    rzpCreds.style.display = select.value === "Razorpay" ? "block" : "none";
  }
  const stripeCreds = document.getElementById("admin-stripe-credentials");
  if (stripeCreds) {
    stripeCreds.style.display = select.value === "Stripe" ? "block" : "none";
  }
};

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
  document.body.style.overflow = "";
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
              <option value="Processing" ${o.status === 'Processing' ? 'selected' : ''}>Processing</option>
              <option value="Shipped" ${o.status === 'Shipped' ? 'selected' : ''}>Shipped</option>
              <option value="Delivered" ${o.status === 'Delivered' ? 'selected' : ''}>Delivered</option>
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
          <span>Tax / VAT (5%):</span>
          <span style="font-family: var(--font-display);">₹${((o.total - 15.00) * 0.05).toFixed(2)}</span>
        </div>
        <div style="display:flex; justify-content:space-between; width: 220px; color:var(--color-text-muted);">
          <span>Shipping (Express):</span>
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
  document.body.style.overflow = "";
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
            <div style="font-size: 12px; color: #888; margin-top: 5px;">Bespoke Sartorial Attire</div>
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
