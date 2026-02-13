// ========================================
// XAZAI - Açai Bar & Smoothies App
// ========================================

// Block pinch-to-zoom globally (iOS Safari ignores viewport meta)
document.addEventListener('gesturestart', function(e) { e.preventDefault(); }, { passive: false });
document.addEventListener('gesturechange', function(e) { e.preventDefault(); }, { passive: false });
document.addEventListener('gestureend', function(e) { e.preventDefault(); }, { passive: false });

// Block double-tap zoom (skip scrollable areas like category tabs)
let lastTouchEnd = 0;
document.addEventListener('touchend', function(e) {
    const now = Date.now();
    if (now - lastTouchEnd <= 300) {
        if (!e.target.closest('.category-tabs')) {
            e.preventDefault();
        }
    }
    lastTouchEnd = now;
}, { passive: false });

// Block multi-touch zoom only
document.addEventListener('touchmove', function(e) {
    if (e.touches.length > 1) { e.preventDefault(); }
}, { passive: false });

// Enable native horizontal scroll on category tabs
document.addEventListener('DOMContentLoaded', function() {
    const tabs = document.querySelector('.category-tabs');
    if (tabs) {
        tabs.addEventListener('touchstart', function(e) { e.stopPropagation(); }, { passive: true });
        tabs.addEventListener('touchmove', function(e) { e.stopPropagation(); }, { passive: true });
        tabs.addEventListener('touchend', function(e) { e.stopPropagation(); }, { passive: true });
    }
});

document.addEventListener('DOMContentLoaded', function() {
    'use strict';

    // STATE
    let currentUser = null;
    let cart = [];
    let orders = [];
    let orderCounter = 1000;
    let expandedCardId = null;

    // DOM
    const $ = id => document.getElementById(id);
    const categoryTabs = $('category-tabs');
    const productsGrid = $('products-grid');
    const menuSection = $('menu-section');
    const buildBowlSection = $('build-bowl-section');
    const cartBtn = $('cart-btn');
    const cartCount = $('cart-count');
    const cartSidebar = $('cart-sidebar');
    const cartOverlay = $('cart-overlay');
    const cartClose = $('cart-close');
    const cartItems = $('cart-items');
    const cartSubtotal = $('cart-subtotal');
    const cartTax = $('cart-tax');
    const cartTotal = $('cart-total');
    const cartFooter = $('cart-footer');
    const btnCheckout = $('btn-checkout');
    const floatingCheckout = $('floating-checkout');
    const floatingItems = $('floating-items');
    const floatingTotal = $('floating-total');
    const floatingCheckoutBtn = $('floating-checkout-btn');
    const loginModal = $('login-modal');
    const loginModalClose = $('login-modal-close');
    const loginForm = $('login-form');
    const loginError = $('login-error');
    const loginPhone = $('login-phone');
    const loginName = $('login-name');
    const countryCode = $('country-code');
    const btnGuest = $('btn-guest');
    const userName = $('user-name');
    const userBtn = $('user-btn');
    const userDropdown = $('user-dropdown');
    const adminPanelBtn = $('admin-panel-btn');
    const loginTriggerBtn = $('login-trigger-btn');
    const logoutBtn = $('logout-btn');
    const ordersList = $('admin-orders-list');
    const confirmationOverlay = $('confirmation-overlay');
    const orderNumber = $('order-number');
    const btnConfirmOk = $('btn-confirm-ok');
    const toastContainer = $('toast-container');

    // Build bowl state
    let buildBowl = { base: null, protein: null, toppings: [], dressing: null };

    // Scheduled order time slot
    let scheduledSlot = null;

    // Tip amount
    let currentTip = 0;

    // ========================================
    // BUSINESS HOURS & STATUS
    // ========================================
    const BUSINESS_HOURS = {
        0: { open: 9, close: 19, label: 'Domingo' },      // Sunday
        1: { open: 9, close: 20, label: 'Lunes' },         // Monday
        2: { open: 9, close: 20, label: 'Martes' },        // Tuesday
        3: null,                                             // Wednesday - CLOSED
        4: { open: 9, close: 20, label: 'Jueves' },        // Thursday
        5: { open: 9, close: 20, label: 'Viernes' },       // Friday
        6: { open: 9, close: 19, label: 'Sábado' },        // Saturday
    };

    function isStoreOpen() {
        const now = new Date();
        const day = now.getDay();
        const hours = BUSINESS_HOURS[day];
        if (!hours) return false; // Wednesday closed
        const currentHour = now.getHours() + now.getMinutes() / 60;
        return currentHour >= hours.open && currentHour < hours.close;
    }

    function getStoreStatusText() {
        const now = new Date();
        const day = now.getDay();
        const hours = BUSINESS_HOURS[day];
        const currentHour = now.getHours() + now.getMinutes() / 60;

        if (!hours) {
            return { open: false, text: 'Cerrado' };
        }

        if (currentHour >= hours.open && currentHour < hours.close) {
            return { open: true, text: 'Abierto' };
        }

        return { open: false, text: 'Cerrado' };
    }

    function getNextOpenText(now) {
        for (let i = 1; i <= 7; i++) {
            const nextDay = (now.getDay() + i) % 7;
            const hours = BUSINESS_HOURS[nextDay];
            if (hours) {
                const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
                if (i === 1) return `Cerrado · Abrimos mañana ${hours.open}:00 AM`;
                return `Cerrado · Abrimos ${dayNames[nextDay]} ${hours.open}:00 AM`;
            }
        }
        return 'Cerrado';
    }

    function updateStoreStatus() {
        const statusEl = $('store-status');
        const textEl = $('status-text');
        const status = getStoreStatusText();

        statusEl.classList.remove('open', 'closed');
        statusEl.classList.add(status.open ? 'open' : 'closed');
        textEl.textContent = status.text;
    }

    // Update status every minute
    updateStoreStatus();
    setInterval(updateStoreStatus, 60000);

    // ========================================
    // SCHEDULE ORDER (when closed)
    // ========================================
    function getScheduleSlots() {
        const now = new Date();
        const slots = [];

        for (let i = 0; i <= 7 && slots.length < 3; i++) {
            const targetDate = new Date(now);
            targetDate.setDate(now.getDate() + i);
            const day = targetDate.getDay();
            const hours = BUSINESS_HOURS[day];

            if (!hours) continue; // Skip closed days

            const dayNames = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
            const dayName = dayNames[day];
            const isToday = i === 0;
            const isTomorrow = i === 1;

            // If today and still before opening, offer morning slot
            if (isToday) {
                const currentHour = now.getHours() + now.getMinutes() / 60;
                if (currentHour < hours.open) {
                    // Store opens later today
                    slots.push({
                        label: `Hoy ${dayName}`,
                        time: `${hours.open}:00 AM - ${hours.open + 2 > 12 ? (hours.open + 2 - 12) + ':00 PM' : (hours.open + 2) + ':00 AM'}`,
                        icon: 'fa-sun',
                        value: `hoy-manana-${hours.open}-${hours.open + 2}`
                    });
                    if (slots.length < 3) {
                        const midStart = Math.floor((hours.open + hours.close) / 2);
                        const midEnd = midStart + 2;
                        slots.push({
                            label: `Hoy ${dayName}`,
                            time: `${midStart > 12 ? (midStart - 12) + ':00 PM' : midStart + ':00 AM'} - ${midEnd > 12 ? (midEnd - 12) + ':00 PM' : midEnd + ':00 AM'}`,
                            icon: 'fa-cloud-sun',
                            value: `hoy-tarde-${midStart}-${midEnd}`
                        });
                    }
                    continue;
                }
                // After closing today, skip to next days
                continue;
            }

            // For future days, offer 3 time ranges
            const label = isTomorrow ? `Mañana ${dayName}` : `${dayName} ${targetDate.getDate()}/${targetDate.getMonth() + 1}`;

            // Morning range
            if (slots.length < 3) {
                slots.push({
                    label: label,
                    time: `${formatHour(hours.open)} - ${formatHour(hours.open + 3)}`,
                    icon: 'fa-sun',
                    value: `${i}-morning-${hours.open}-${hours.open + 3}`
                });
            }

            // Midday range
            if (slots.length < 3) {
                const midStart = Math.floor((hours.open + hours.close) / 2) - 1;
                slots.push({
                    label: label,
                    time: `${formatHour(midStart)} - ${formatHour(midStart + 3)}`,
                    icon: 'fa-cloud-sun',
                    value: `${i}-midday-${midStart}-${midStart + 3}`
                });
            }

            // Afternoon range
            if (slots.length < 3) {
                slots.push({
                    label: label,
                    time: `${formatHour(hours.close - 3)} - ${formatHour(hours.close)}`,
                    icon: 'fa-moon',
                    value: `${i}-afternoon-${hours.close - 3}-${hours.close}`
                });
            }
        }

        return slots.slice(0, 3);
    }

    function formatHour(h) {
        if (h === 12) return '12:00 PM';
        if (h > 12) return (h - 12) + ':00 PM';
        return h + ':00 AM';
    }

    function showScheduleModal() {
        scheduledSlot = null;
        const modal = $('schedule-modal');
        const container = $('schedule-options');
        const confirmBtn = $('btn-schedule-confirm');
        confirmBtn.disabled = true;

        const slots = getScheduleSlots();

        container.innerHTML = slots.map((slot, idx) => `
            <div class="schedule-slot" data-idx="${idx}" data-value="${slot.value}">
                <span class="schedule-slot-icon"><i class="fas ${slot.icon}"></i></span>
                <div class="schedule-slot-info">
                    <div class="schedule-slot-day">${slot.label}</div>
                    <div class="schedule-slot-time">${slot.time}</div>
                </div>
                <span class="schedule-slot-check"><i class="fas fa-check"></i></span>
            </div>
        `).join('');

        container.querySelectorAll('.schedule-slot').forEach(slot => {
            slot.addEventListener('click', () => {
                container.querySelectorAll('.schedule-slot').forEach(s => s.classList.remove('selected'));
                slot.classList.add('selected');
                scheduledSlot = {
                    value: slot.dataset.value,
                    label: slot.querySelector('.schedule-slot-day').textContent,
                    time: slot.querySelector('.schedule-slot-time').textContent
                };
                confirmBtn.disabled = false;
            });
        });

        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }

    function closeScheduleModal() {
        $('schedule-modal').classList.add('hidden');
        document.body.style.overflow = '';
    }

    // Schedule modal events
    document.addEventListener('click', (e) => {
        if (e.target.closest('#schedule-modal-close')) closeScheduleModal();
        if (e.target.closest('#btn-schedule-cancel')) closeScheduleModal();
        if (e.target.id === 'schedule-modal') closeScheduleModal();
        if (e.target.closest('#btn-schedule-confirm')) {
            if (!scheduledSlot) return;
            closeScheduleModal();
            showToast(`Pedido agendado: ${scheduledSlot.label} ${scheduledSlot.time}`, 'success');
            // Proceed to normal checkout flow
            if (!currentUser) {
                openLoginModal();
            } else {
                showPaymentModal();
            }
        }
    });

    // ========================================
    // INVENTORY CACHE (for client-side filtering)
    // ========================================
    let inventoryCache = {};

    function isProductAvailable(productId) {
        const inv = inventoryCache[String(productId)];
        return inv ? inv.active !== false : true;
    }

    // ========================================
    // INIT - Go directly to menu
    // ========================================
    renderCategory('inicio');
    updateCartUI();

    // ========================================
    // AUTH (only at checkout or voluntary)
    // ========================================
    userBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        userDropdown.classList.toggle('hidden');
    });
    document.addEventListener('click', () => userDropdown.classList.add('hidden'));

    loginTriggerBtn.addEventListener('click', () => {
        userDropdown.classList.add('hidden');
        openLoginModal();
    });

    logoutBtn.addEventListener('click', () => {
        currentUser = null;
        userName.textContent = 'Mi Cuenta';
        adminPanelBtn.classList.add('hidden');
        logoutBtn.classList.add('hidden');
        loginTriggerBtn.classList.remove('hidden');
        userDropdown.classList.add('hidden');
        showToast('Sesión cerrada', 'info');
    });

    function openLoginModal() {
        loginModal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }

    function closeLoginModal() {
        loginModal.classList.add('hidden');
        document.body.style.overflow = '';
        loginPhone.value = '';
        loginName.value = '';
    }

    loginModalClose.addEventListener('click', closeLoginModal);
    loginModal.addEventListener('click', (e) => {
        if (e.target === loginModal) closeLoginModal();
    });

    loginForm.addEventListener('submit', (e) => {
        e.preventDefault();
        const phone = loginPhone.value.trim().replace(/\D/g, '');
        const name = loginName.value.trim();
        const code = countryCode.value;

        if (!phone || phone.length < 6) {
            loginError.textContent = 'Ingresa un número de teléfono válido';
            loginError.classList.add('show');
            setTimeout(() => loginError.classList.remove('show'), 3000);
            return;
        }

        const fullPhone = code + phone;
        const displayName = name || ('Cliente ' + phone.slice(-4));

        // Check if admin (hardcoded for now)
        const isAdmin = USERS.find(u => u.role === 'admin' && u.phone === fullPhone);

        currentUser = {
            username: fullPhone,
            role: isAdmin ? 'admin' : 'customer',
            name: displayName,
            phone: fullPhone
        };

        userName.textContent = displayName;
        loginTriggerBtn.classList.add('hidden');
        logoutBtn.classList.remove('hidden');
        if (currentUser.role === 'admin') adminPanelBtn.classList.remove('hidden');
        closeLoginModal();
        showToast(`Bienvenido, ${displayName}!`, 'success');
        // If came from checkout, show payment modal
        if (cart.length > 0) showPaymentModal();
    });

    btnGuest.addEventListener('click', () => {
        currentUser = { username: 'guest', role: 'guest', name: 'Invitado' };
        userName.textContent = 'Invitado';
        loginTriggerBtn.classList.add('hidden');
        logoutBtn.classList.remove('hidden');
        closeLoginModal();
        if (cart.length > 0) showPaymentModal();
    });

    // ========================================
    // CATEGORIES
    // ========================================
    categoryTabs.addEventListener('click', (e) => {
        const tab = e.target.closest('.tab');
        if (!tab) return;
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        tab.classList.add('active');
        renderCategory(tab.dataset.category);
    });

    function renderCategory(category) {
        expandedCardId = null;

        if (category === 'arma-tu-bowl') {
            menuSection.classList.add('hidden');
            buildBowlSection.classList.remove('hidden');
            renderBuildBowl();
        } else {
            menuSection.classList.remove('hidden');
            buildBowlSection.classList.add('hidden');
            if (category === 'inicio') {
                renderAllProducts();
            } else {
                renderProducts(category);
            }
        }
    }

    // ========================================
    // PRODUCTS - Horizontal cards with inline expand
    // ========================================
    function renderAllProducts() {
        const cats = ['bowls', 'smoothies', 'jugos', 'shots', 'cafe', 'bebidas'];
        let html = '';
        cats.forEach(catKey => {
            const cat = CATEGORIES[catKey];
            const items = MENU_ITEMS.filter(i => i.category === catKey && isProductAvailable(i.id));
            if (items.length === 0) return;
            html += `<div class="category-divider"><h3><i class="fas ${cat.icon}"></i> ${cat.name}</h3></div>`;
            html += items.map(item => buildCardHTML(item)).join('');
        });
        // Arma tu Bowl promo card
        html += `
            <div class="promo-card-arma" onclick="document.querySelector('[data-category=\\'arma-tu-bowl\\']').click()">
                <div class="promo-card-inner">
                    <span class="promo-emoji">🎨</span>
                    <div class="promo-info">
                        <h3>¡Arma tu propio Bowl!</h3>
                        <p>Personaliza tu bowl perfecto paso a paso con tus ingredientes favoritos</p>
                    </div>
                    <span class="promo-arrow"><i class="fas fa-arrow-right"></i></span>
                </div>
            </div>
        `;
        productsGrid.innerHTML = html;
        bindAllCardEvents();
    }

    function buildCardHTML(item) {
        const priceLabel = item.onlyGrande ? `$${item.price.toFixed(2)}` : `Desde $${item.price.toFixed(2)}`;
        const hasImage = item.image && item.image.length > 0;
        return `
            <div class="product-card-h" id="card-${item.id}" data-id="${item.id}">
                <div class="card-h-main">
                    <div class="card-h-image">
                        ${hasImage ? `<img src="${item.image}" alt="${item.name}" class="card-img" loading="lazy">` : `<span class="card-emoji">${item.emoji}</span>`}
                        ${item.badge ? `<span class="card-badge-sm">${item.badge}</span>` : ''}
                    </div>
                    <div class="card-h-body">
                        <p class="card-tagline">${item.tagline}</p>
                        <h3 class="card-title">${item.name}</h3>
                        <p class="card-description">${item.description}</p>
                        <div class="card-h-bottom">
                            <span class="card-price">${priceLabel}</span>
                            <button class="btn-card-add" data-id="${item.id}">
                                <i class="fas fa-plus"></i> Agregar
                            </button>
                        </div>
                    </div>
                </div>
                <div class="card-expand hidden" id="expand-${item.id}"></div>
            </div>
        `;
    }

    // Categories where the "Add" button adds directly to cart (no expand)
    const DIRECT_ADD_CATEGORIES = ['bebidas'];

    function isDirectAddProduct(productId) {
        const product = MENU_ITEMS.find(i => i.id === productId);
        return product && DIRECT_ADD_CATEGORIES.includes(product.category);
    }

    function addDirectToCart(productId) {
        const product = MENU_ITEMS.find(i => i.id === productId);
        if (!product) return;

        // Check if already in cart, if so increment quantity
        const existing = cart.find(i => i.productId === productId && i.toppings.length === 0);
        if (existing) {
            if (existing.quantity < 20) {
                existing.quantity++;
                existing.total = existing.basePrice * existing.quantity;
            }
        } else {
            cart.push({
                id: Date.now(),
                productId: product.id,
                name: product.name,
                emoji: product.emoji,
                size: 'único',
                sizeMultiplier: 1,
                toppings: [],
                toppingsPrice: 0,
                basePrice: product.price,
                quantity: 1,
                note: '',
                total: product.price
            });
        }
        updateCartUI();
        showToast(`${product.name} agregado al carrito`, 'success');
    }

    function bindAllCardEvents() {
        // Only listen for clicks on the MAIN part of the card (not the expand area)
        productsGrid.querySelectorAll('.card-h-main').forEach(main => {
            main.addEventListener('click', (e) => {
                if (e.target.closest('.btn-card-add')) return;
                const card = main.closest('.product-card-h');
                const productId = parseInt(card.dataset.id);
                if (isDirectAddProduct(productId)) return; // No expand for direct-add products
                toggleExpand(productId);
            });
        });
        productsGrid.querySelectorAll('.btn-card-add').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const card = btn.closest('.product-card-h');
                const productId = parseInt(card.dataset.id);
                if (isDirectAddProduct(productId)) {
                    addDirectToCart(productId);
                } else {
                    toggleExpand(productId);
                }
            });
        });
        // Block all clicks inside expand areas from bubbling up
        productsGrid.querySelectorAll('.card-expand').forEach(exp => {
            exp.addEventListener('click', (e) => {
                e.stopPropagation();
            });
        });
    }

    function renderProducts(category) {
        const items = MENU_ITEMS.filter(i => i.category === category && isProductAvailable(i.id));
        productsGrid.innerHTML = items.map(item => buildCardHTML(item)).join('');
        bindAllCardEvents();
    }

    function toggleExpand(productId) {
        // Close previously expanded
        if (expandedCardId && expandedCardId !== productId) {
            const prevExpand = $('expand-' + expandedCardId);
            const prevCard = $('card-' + expandedCardId);
            if (prevExpand) prevExpand.classList.add('hidden');
            if (prevCard) prevCard.classList.remove('expanded');
        }

        const expandEl = $('expand-' + productId);
        const cardEl = $('card-' + productId);
        if (!expandEl) return;

        if (expandedCardId === productId) {
            // Collapse
            expandEl.classList.add('hidden');
            cardEl.classList.remove('expanded');
            expandedCardId = null;
            return;
        }

        expandedCardId = productId;
        cardEl.classList.add('expanded');

        const product = MENU_ITEMS.find(i => i.id === productId);
        expandEl.innerHTML = buildExpandContent(product);
        expandEl.classList.remove('hidden');

        // Scroll into view — only scroll the card top, not aggressive
        setTimeout(() => {
            const rect = cardEl.getBoundingClientRect();
            if (rect.top < 80) {
                window.scrollBy({ top: rect.top - 90, behavior: 'smooth' });
            }
        }, 150);

        // Bind expand events
        bindExpandEvents(expandEl, product);
    }

    function buildExpandContent(product) {
        const hasToppingsIncluded = product.toppings && product.toppings.length > 0;
        const hasIngredients = product.ingredients && product.ingredients.length > 0;
        const isOnlyGrande = product.onlyGrande;
        const showToppingsExtra = ['bowls'].includes(product.category);
        const isSmoothie = product.category === 'smoothies';

        // Size section: only show if not onlyGrande
        let sizeSection = '';
        if (!isOnlyGrande && product.priceGrande) {
            sizeSection = `
                <div class="expand-section">
                    <h4><i class="fas fa-ruler"></i> Tamaño</h4>
                    <div class="size-options">
                        <button class="size-btn active" data-size="mediano" data-price="${product.price}">
                            <span class="size-icon">M</span><span>Mediano</span><span class="size-price">$${product.price.toFixed(2)}</span>
                        </button>
                        <button class="size-btn" data-size="grande" data-price="${product.priceGrande}">
                            <span class="size-icon">G</span><span>Grande</span><span class="size-price">$${product.priceGrande.toFixed(2)}</span>
                        </button>
                    </div>
                </div>`;
        }

        // Toppings extra section: only for bowls
        let toppingsExtraSection = '';
        if (showToppingsExtra) {
            toppingsExtraSection = `
                <div class="expand-section">
                    <h4><i class="fas fa-plus-circle"></i> Toppings adicionales</h4>
                    <div class="toppings-grid-compact">
                        ${EXTRA_TOPPINGS.map(t => `
                            <label class="topping-item-compact">
                                <input type="checkbox" value="${t.id}">
                                <span class="topping-emoji">${t.emoji}</span>
                                <span class="topping-name">${t.name}</span>
                                <span class="topping-price">+$${t.price.toFixed(2)}</span>
                            </label>
                        `).join('')}
                    </div>
                </div>`;
        }

        // Smoothie options: protein + milk
        let smoothieOptionsSection = '';
        if (isSmoothie) {
            // Check if product uses leche in ingredients
            const usesLecheAlm = (product.ingredients || []).some(i => i.toLowerCase().includes('leche de almendras') || i.toLowerCase().includes('agua de coco'));
            const usesLeche = (product.ingredients || []).some(i => i.toLowerCase().includes('leche') && !i.toLowerCase().includes('almendras'));

            smoothieOptionsSection = `
                <div class="expand-section">
                    <h4><i class="fas fa-blender"></i> Personaliza tu Smoothie</h4>
                    <div style="margin-bottom:10px">
                        <span style="font-size:13px;color:var(--text-light);display:block;margin-bottom:6px">Agregar Proteína (+$2.50)</span>
                        <div class="expand-options-row" id="smoothie-protein-opts">
                            <label class="option-pill active" data-protein="none"><input type="radio" name="sm-protein" value="none" checked>Sin proteína <span class="option-pill-price">$0</span></label>
                            <label class="option-pill" data-protein="sascha"><input type="radio" name="sm-protein" value="sascha">💪 Proteína Sascha <span class="option-pill-price">+$2.50</span></label>
                        </div>
                    </div>
                    ${usesLeche || usesLecheAlm ? `
                    <div>
                        <span style="font-size:13px;color:var(--text-light);display:block;margin-bottom:6px">Tipo de Leche</span>
                        <div class="expand-options-row" id="smoothie-milk-opts">
                            <label class="option-pill ${usesLecheAlm ? 'active' : ''}" data-milk="almendras"><input type="radio" name="sm-milk" value="almendras" ${usesLecheAlm ? 'checked' : ''}>🌰 Leche de Almendras</label>
                            <label class="option-pill ${usesLeche ? 'active' : ''}" data-milk="entera"><input type="radio" name="sm-milk" value="entera" ${usesLeche ? 'checked' : ''}>🥛 Leche Entera</label>
                        </div>
                    </div>` : ''}
                </div>`;
        }

        return `
            <div class="expand-inner">
                ${hasIngredients ? `
                <div class="expand-section">
                    <p class="expand-text-line"><strong>Ingredientes:</strong> ${product.ingredients.join(', ')}</p>
                    ${hasToppingsIncluded ? `<p class="expand-text-line"><strong>Toppings incluidos:</strong> ${product.toppings.join(', ')}</p>` : ''}
                </div>` : ''}
                ${sizeSection}
                ${smoothieOptionsSection}
                ${toppingsExtraSection}
                <div class="expand-section">
                    <h4><i class="fas fa-sticky-note"></i> Nota especial</h4>
                    <textarea class="note-input" placeholder="¿Algo que debamos saber?" maxlength="200" rows="2"></textarea>
                </div>
                <div class="expand-actions">
                    <div class="quantity-selector">
                        <button class="qty-btn qty-minus"><i class="fas fa-minus"></i></button>
                        <span class="qty-value">1</span>
                        <button class="qty-btn qty-plus"><i class="fas fa-plus"></i></button>
                    </div>
                    <div class="expand-total">
                        <span class="expand-total-label">Total</span>
                        <span class="expand-total-price">$${product.price.toFixed(2)}</span>
                    </div>
                    <button class="btn-add-expand">
                        <i class="fas fa-cart-plus"></i> Agregar al Carrito
                    </button>
                </div>
            </div>
        `;
    }

    function bindExpandEvents(expandEl, product) {
        const isOnlyGrande = product.onlyGrande;
        const isSmoothie = product.category === 'smoothies';
        let size = isOnlyGrande ? 'único' : 'mediano';
        let currentPrice = product.price;
        let qty = 1, selectedToppings = [];
        let proteinChoice = 'none', milkChoice = '';
        let proteinPrice = 0;

        function updateTotal() {
            const extras = selectedToppings.reduce((s, tid) => {
                const t = EXTRA_TOPPINGS.find(tp => tp.id === tid);
                return s + (t ? t.price : 0);
            }, 0);
            const total = (currentPrice + extras + proteinPrice) * qty;
            expandEl.querySelector('.expand-total-price').textContent = '$' + total.toFixed(2);
        }

        // Size buttons (only exist for non-onlyGrande products)
        expandEl.querySelectorAll('.size-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                expandEl.querySelectorAll('.size-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                size = btn.dataset.size;
                currentPrice = parseFloat(btn.dataset.price);
                updateTotal();
            });
        });

        // Smoothie protein options
        expandEl.querySelectorAll('#smoothie-protein-opts .option-pill').forEach(pill => {
            pill.addEventListener('click', (e) => {
                e.stopPropagation();
                expandEl.querySelectorAll('#smoothie-protein-opts .option-pill').forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                pill.querySelector('input').checked = true;
                proteinChoice = pill.dataset.protein;
                proteinPrice = proteinChoice === 'sascha' ? 2.50 : 0;
                updateTotal();
            });
        });

        // Smoothie milk options
        expandEl.querySelectorAll('#smoothie-milk-opts .option-pill').forEach(pill => {
            pill.addEventListener('click', (e) => {
                e.stopPropagation();
                expandEl.querySelectorAll('#smoothie-milk-opts .option-pill').forEach(p => p.classList.remove('active'));
                pill.classList.add('active');
                pill.querySelector('input').checked = true;
                milkChoice = pill.dataset.milk;
            });
        });

        // Toppings
        expandEl.querySelectorAll('.topping-item-compact input').forEach(cb => {
            cb.addEventListener('change', (e) => {
                e.stopPropagation();
                if (cb.checked) {
                    selectedToppings.push(cb.value);
                } else {
                    selectedToppings = selectedToppings.filter(id => id !== cb.value);
                }
                updateTotal();
            });
        });

        // Quantity
        const qtyVal = expandEl.querySelector('.qty-value');
        expandEl.querySelector('.qty-minus').addEventListener('click', (e) => {
            e.stopPropagation();
            if (qty > 1) { qty--; qtyVal.textContent = qty; updateTotal(); }
        });
        expandEl.querySelector('.qty-plus').addEventListener('click', (e) => {
            e.stopPropagation();
            if (qty < 20) { qty++; qtyVal.textContent = qty; updateTotal(); }
        });

        // Note field - stop propagation
        const noteInput = expandEl.querySelector('.note-input');
        if (noteInput) {
            noteInput.addEventListener('click', (e) => e.stopPropagation());
            noteInput.addEventListener('focus', (e) => e.stopPropagation());
        }

        // Add to cart
        expandEl.querySelector('.btn-add-expand').addEventListener('click', (e) => {
            e.stopPropagation();
            const toppingNames = selectedToppings.map(tid => {
                const t = EXTRA_TOPPINGS.find(tp => tp.id === tid);
                return t ? t.name : '';
            }).filter(Boolean);
            const toppingsPrice = selectedToppings.reduce((s, tid) => {
                const t = EXTRA_TOPPINGS.find(tp => tp.id === tid);
                return s + (t ? t.price : 0);
            }, 0);
            const note = noteInput ? noteInput.value.trim() : '';

            // Build extras description
            let extras = [];
            if (proteinChoice === 'sascha') extras.push('Proteína Sascha');
            if (milkChoice) extras.push(milkChoice === 'almendras' ? 'Leche de Almendras' : 'Leche Entera');

            cart.push({
                id: Date.now(),
                productId: product.id,
                name: product.name,
                emoji: product.emoji,
                size: size,
                sizeMultiplier: 1,
                toppings: [...toppingNames, ...extras],
                toppingsPrice: toppingsPrice + proteinPrice,
                basePrice: currentPrice,
                quantity: qty,
                note: note,
                protein: proteinChoice !== 'none' ? proteinChoice : '',
                milk: milkChoice || '',
                total: (currentPrice + toppingsPrice + proteinPrice) * qty
            });

            updateCartUI();
            showToast(`${product.name} agregado al carrito`, 'success');

            // Collapse card
            expandEl.classList.add('hidden');
            $('card-' + product.id).classList.remove('expanded');
            expandedCardId = null;
        });
    }

    // ========================================
    // BUILD YOUR BOWL
    // ========================================
    function renderBuildBowl() {
        buildBowl = { base: null, protein: null, toppings: [], dressing: null };
        renderBuildOptions('base-options', BUILD_OPTIONS.bases, 'base');
        renderBuildOptions('protein-options', BUILD_OPTIONS.proteins, 'protein');
        renderBuildOptions('topping-options', BUILD_OPTIONS.toppings, 'topping');
        renderBuildOptions('dressing-options', BUILD_OPTIONS.dressings, 'dressing');
        updateBuildSummary();
    }

    function renderBuildOptions(containerId, options, type) {
        const container = $(containerId);
        container.innerHTML = options.map(opt => `
            <button class="build-option" data-id="${opt.id}" data-type="${type}" data-price="${opt.price}" data-name="${opt.name}">
                <span class="build-emoji">${opt.emoji}</span>
                <span class="build-name">${opt.name}</span>
                <span class="build-price">+$${opt.price.toFixed(2)}</span>
            </button>
        `).join('');

        container.addEventListener('click', (e) => {
            const btn = e.target.closest('.build-option');
            if (!btn) return;
            const { id, price, name } = btn.dataset;

            if (type === 'topping') {
                if (btn.classList.contains('selected')) {
                    btn.classList.remove('selected');
                    buildBowl.toppings = buildBowl.toppings.filter(t => t.id !== id);
                } else if (buildBowl.toppings.length < 4) {
                    btn.classList.add('selected');
                    buildBowl.toppings.push({ id, name, price: parseFloat(price) });
                } else {
                    showToast('Máximo 4 toppings', 'warning');
                }
            } else {
                container.querySelectorAll('.build-option').forEach(b => b.classList.remove('selected'));
                btn.classList.add('selected');
                buildBowl[type] = { id, name, price: parseFloat(price) };
            }
            updateBuildSummary();
        });
    }

    function updateBuildSummary() {
        const content = $('build-summary-content');
        let total = 0, items = [];

        if (buildBowl.base) { items.push(`<div class="build-line"><span>Base: ${buildBowl.base.name}</span><span>$${buildBowl.base.price.toFixed(2)}</span></div>`); total += buildBowl.base.price; }
        if (buildBowl.protein) { items.push(`<div class="build-line"><span>Textura: ${buildBowl.protein.name}</span><span>$${buildBowl.protein.price.toFixed(2)}</span></div>`); total += buildBowl.protein.price; }
        buildBowl.toppings.forEach(t => { items.push(`<div class="build-line"><span>Topping: ${t.name}</span><span>$${t.price.toFixed(2)}</span></div>`); total += t.price; });
        if (buildBowl.dressing) { items.push(`<div class="build-line"><span>Drizzle: ${buildBowl.dressing.name}</span><span>$${buildBowl.dressing.price.toFixed(2)}</span></div>`); total += buildBowl.dressing.price; }

        content.innerHTML = items.length ? items.join('') : '<p class="empty-build">Selecciona tus ingredientes para comenzar</p>';
        $('build-total-price').textContent = '$' + total.toFixed(2);
        $('btn-add-build').disabled = !(buildBowl.base && buildBowl.protein && buildBowl.dressing);
    }

    $('btn-add-build').addEventListener('click', () => {
        if (!buildBowl.base || !buildBowl.protein || !buildBowl.dressing) return;
        let total = buildBowl.base.price + buildBowl.protein.price + buildBowl.dressing.price;
        total += buildBowl.toppings.reduce((s, t) => s + t.price, 0);

        cart.push({
            id: Date.now(), productId: 'custom', name: 'Bowl Personalizado', emoji: '🎨',
            size: 'único', sizeMultiplier: 1,
            toppings: [buildBowl.base.name, buildBowl.protein.name, ...buildBowl.toppings.map(t => t.name), buildBowl.dressing.name],
            toppingsPrice: 0, basePrice: total, quantity: 1, total: total
        });
        updateCartUI();
        showToast('Bowl personalizado agregado', 'success');
        renderBuildBowl();
    });

    // ========================================
    // CART
    // ========================================
    cartBtn.addEventListener('click', toggleCart);
    cartClose.addEventListener('click', toggleCart);
    cartOverlay.addEventListener('click', toggleCart);

    function toggleCart() {
        cartSidebar.classList.toggle('hidden');
        cartOverlay.classList.toggle('hidden');
        document.body.style.overflow = cartSidebar.classList.contains('hidden') ? '' : 'hidden';
    }

    function updateCartUI() {
        const totalItems = cart.reduce((s, i) => s + i.quantity, 0);
        cartCount.textContent = totalItems;
        cartCount.classList.toggle('has-items', cart.length > 0);

        // Floating checkout bar
        if (cart.length > 0) {
            floatingCheckout.classList.remove('hidden');
            floatingItems.textContent = totalItems + (totalItems === 1 ? ' item' : ' items');
            const subtotal = cart.reduce((s, i) => s + i.total, 0);
            floatingTotal.textContent = '$' + (subtotal + 4.50).toFixed(2);
        } else {
            floatingCheckout.classList.add('hidden');
        }

        if (cart.length === 0) {
            cartItems.innerHTML = '<div class="cart-empty"><i class="fas fa-shopping-basket"></i><p>Tu carrito está vacío</p></div>';
            cartFooter.style.display = 'none';
            return;
        }

        cartFooter.style.display = 'block';
        cartItems.innerHTML = cart.map(item => `
            <div class="cart-item" data-id="${item.id}">
                <div class="cart-item-top">
                    <span class="cart-item-emoji">${item.emoji}</span>
                    <div class="cart-item-info">
                        <h4>${item.name}</h4>
                        <p class="cart-item-size">${item.size.charAt(0).toUpperCase() + item.size.slice(1)}</p>
                        ${item.toppings.length ? `<p class="cart-item-toppings">${item.toppings.join(', ')}</p>` : ''}
                    </div>
                    <button class="cart-item-remove" data-id="${item.id}"><i class="fas fa-trash-alt"></i></button>
                </div>
                <div class="cart-item-bottom">
                    <div class="cart-item-qty">
                        <button class="cart-qty-btn" data-action="minus" data-id="${item.id}">-</button>
                        <span>${item.quantity}</span>
                        <button class="cart-qty-btn" data-action="plus" data-id="${item.id}">+</button>
                    </div>
                    <span class="cart-item-price">$${item.total.toFixed(2)}</span>
                </div>
            </div>
        `).join('');

        cartItems.querySelectorAll('.cart-item-remove').forEach(btn => {
            btn.addEventListener('click', () => { cart = cart.filter(i => i.id !== parseInt(btn.dataset.id)); updateCartUI(); });
        });

        cartItems.querySelectorAll('.cart-qty-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const item = cart.find(i => i.id === parseInt(btn.dataset.id));
                if (!item) return;
                if (btn.dataset.action === 'plus' && item.quantity < 20) {
                    item.quantity++;
                    item.total = (item.basePrice * item.sizeMultiplier + item.toppingsPrice) * item.quantity;
                } else if (btn.dataset.action === 'minus') {
                    if (item.quantity > 1) { item.quantity--; item.total = (item.basePrice * item.sizeMultiplier + item.toppingsPrice) * item.quantity; }
                    else { cart = cart.filter(i => i.id !== item.id); }
                }
                updateCartUI();
            });
        });

        const subtotal = cart.reduce((s, i) => s + i.total, 0);
        const deliveryFee = 4.50;
        cartSubtotal.textContent = '$' + subtotal.toFixed(2);
        cartTotal.textContent = '$' + (subtotal + deliveryFee).toFixed(2);
    }

    // ========================================
    // CHECKOUT & YAPPY PAYMENT
    // ========================================
    function handleCheckout() {
        if (cart.length === 0) return;

        // Check if store is closed → show schedule modal
        if (!isStoreOpen() && !scheduledSlot) {
            showScheduleModal();
            return;
        }

        if (!currentUser) {
            openLoginModal();
            return;
        }
        showPaymentModal();
    }

    function showPaymentModal() {
        // Reset tip
        currentTip = 0;
        document.querySelectorAll('.tip-btn').forEach(b => b.classList.remove('active'));
        $('tip-custom-input').classList.add('hidden');

        renderPaymentDetail();

        const paymentModal = $('payment-modal');
        // Reset state
        $('yappy-loading').classList.add('hidden');
        $('yappy-error').classList.add('hidden');
        $('btn-pay-yappy').disabled = false;

        // Show scheduled banner if applicable
        const scheduledBanner = $('scheduled-banner');
        if (scheduledSlot) {
            scheduledBanner.classList.remove('hidden');
            $('scheduled-banner-text').textContent = `Pedido agendado: ${scheduledSlot.label} ${scheduledSlot.time}`;
        } else {
            scheduledBanner.classList.add('hidden');
        }

        // Initialize map
        initDeliveryMap();

        paymentModal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }

    function updatePaymentTotals() {
        const subtotal = cart.reduce((s, i) => s + i.total, 0);
        const deliveryFee = 4.50;
        const total = subtotal + deliveryFee + currentTip;

        $('payment-subtotal').textContent = '$' + subtotal.toFixed(2);
        $('payment-delivery').textContent = '$' + deliveryFee.toFixed(2);
        $('payment-tip-amount').textContent = '$' + currentTip.toFixed(2);
        $('payment-total').textContent = '$' + total.toFixed(2);
    }

    function renderPaymentDetail() {
        updatePaymentTotals();

        const detailContainer = $('payment-order-detail');
        detailContainer.innerHTML = cart.map(item => `
            <div class="pay-item" data-id="${item.id}">
                <div class="pay-item-header">
                    <div class="pay-item-info">
                        <span class="pay-item-name">${item.name}</span>
                        <span class="pay-item-size">${item.size.charAt(0).toUpperCase() + item.size.slice(1)}</span>
                    </div>
                    <span class="pay-item-price">$${item.total.toFixed(2)}</span>
                </div>
                ${item.toppings.length ? `<p class="pay-item-toppings">+ ${item.toppings.join(', ')}</p>` : ''}
                ${item.note ? `<p class="pay-item-note"><i class="fas fa-sticky-note"></i> ${item.note}</p>` : ''}
                <div class="pay-item-actions">
                    <div class="pay-item-qty">
                        <button class="pay-qty-btn" data-action="minus" data-id="${item.id}">−</button>
                        <span>${item.quantity}</span>
                        <button class="pay-qty-btn" data-action="plus" data-id="${item.id}">+</button>
                    </div>
                    <button class="pay-item-remove" data-id="${item.id}"><i class="fas fa-trash-alt"></i></button>
                </div>
            </div>
        `).join('');

        // Bind quantity buttons
        detailContainer.querySelectorAll('.pay-qty-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const item = cart.find(i => i.id === parseInt(btn.dataset.id));
                if (!item) return;
                if (btn.dataset.action === 'plus' && item.quantity < 20) {
                    item.quantity++;
                    item.total = (item.basePrice + item.toppingsPrice) * item.quantity;
                } else if (btn.dataset.action === 'minus') {
                    if (item.quantity > 1) {
                        item.quantity--;
                        item.total = (item.basePrice + item.toppingsPrice) * item.quantity;
                    } else {
                        cart = cart.filter(i => i.id !== item.id);
                    }
                }
                updateCartUI();
                if (cart.length === 0) { closePaymentModal(); return; }
                renderPaymentDetail();
            });
        });

        // Bind remove buttons
        detailContainer.querySelectorAll('.pay-item-remove').forEach(btn => {
            btn.addEventListener('click', () => {
                cart = cart.filter(i => i.id !== parseInt(btn.dataset.id));
                updateCartUI();
                if (cart.length === 0) { closePaymentModal(); return; }
                renderPaymentDetail();
            });
        });
    }

    function closePaymentModal() {
        $('payment-modal').classList.add('hidden');
        document.body.style.overflow = '';
    }

    // ========================================
    // TIP SELECTION
    // ========================================
    document.querySelectorAll('.tip-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.stopPropagation();
            const tipVal = btn.dataset.tip;

            if (tipVal === 'custom') {
                // Toggle custom input
                $('tip-custom-input').classList.toggle('hidden');
                // Deselect preset buttons if custom is chosen
                document.querySelectorAll('.tip-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const customInput = $('tip-custom-value');
                if (customInput) customInput.focus();
                return;
            }

            // Preset tip
            $('tip-custom-input').classList.add('hidden');
            document.querySelectorAll('.tip-btn').forEach(b => b.classList.remove('active'));

            // Toggle: if same tip clicked again, remove it
            if (currentTip === parseFloat(tipVal)) {
                currentTip = 0;
            } else {
                btn.classList.add('active');
                currentTip = parseFloat(tipVal);
            }
            updatePaymentTotals();
        });
    });

    // Custom tip apply
    document.addEventListener('click', (e) => {
        if (e.target.closest('#tip-custom-apply')) {
            const val = parseFloat($('tip-custom-value').value);
            if (!isNaN(val) && val >= 0) {
                currentTip = val;
                updatePaymentTotals();
                $('tip-custom-input').classList.add('hidden');
                document.querySelectorAll('.tip-btn').forEach(b => b.classList.remove('active'));
                document.querySelector('.tip-btn-custom').classList.add('active');
            }
        }
    });

    // ========================================
    // DELIVERY MAP (Leaflet + OpenStreetMap)
    // ========================================
    let mapInitialized = false;
    let mapMarker = null;
    let deliveryMap = null;
    let mapSearchInput = null;

    function initDeliveryMap() {
        const mapContainer = $('map-container');
        if (!mapContainer) return;

        // Use Leaflet/OpenStreetMap (no API key needed)
        if (!mapInitialized) {
            // Add Leaflet CSS & JS
            if (!document.querySelector('link[href*="leaflet"]')) {
                const leafletCSS = document.createElement('link');
                leafletCSS.rel = 'stylesheet';
                leafletCSS.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
                document.head.appendChild(leafletCSS);

                const leafletJS = document.createElement('script');
                leafletJS.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
                leafletJS.onload = () => setupMap(mapContainer);
                document.head.appendChild(leafletJS);
            } else if (window.L) {
                setupMap(mapContainer);
            }
        } else if (deliveryMap) {
            setTimeout(() => deliveryMap.invalidateSize(), 300);
        }
    }

    function setupMap(container) {
        mapInitialized = true;

        // Add search input above map
        if (!container.querySelector('.map-search')) {
            const searchDiv = document.createElement('div');
            searchDiv.className = 'map-search';
            searchDiv.innerHTML = `
                <input type="text" class="map-search-input" id="map-search-input"
                    placeholder="Buscar dirección en el mapa..." autocomplete="off">
                <button class="map-search-btn" id="map-search-btn"><i class="fas fa-search"></i></button>
            `;
            container.insertBefore(searchDiv, container.firstChild);
        }

        // Create map div
        let mapDiv = container.querySelector('.map-render');
        if (!mapDiv) {
            mapDiv = document.createElement('div');
            mapDiv.className = 'map-render';
            mapDiv.style.width = '100%';
            mapDiv.style.height = '160px';
            container.appendChild(mapDiv);
        }

        // Initialize Leaflet map centered on Panama City
        deliveryMap = L.map(mapDiv, {
            center: [8.9824, -79.5199],
            zoom: 13,
            zoomControl: false
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap'
        }).addTo(deliveryMap);

        // Add zoom control to bottom right
        L.control.zoom({ position: 'bottomright' }).addTo(deliveryMap);

        // Custom marker icon
        const markerIcon = L.divIcon({
            className: 'custom-map-marker',
            html: '<i class="fas fa-map-marker-alt" style="font-size:28px;color:#e91e8c;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.3))"></i>',
            iconSize: [28, 36],
            iconAnchor: [14, 36]
        });

        // Click on map to place marker
        deliveryMap.on('click', function(e) {
            if (mapMarker) deliveryMap.removeLayer(mapMarker);
            mapMarker = L.marker(e.latlng, { icon: markerIcon }).addTo(deliveryMap);

            // Reverse geocode
            fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${e.latlng.lat}&lon=${e.latlng.lng}&zoom=18&addressdetails=1`)
                .then(r => r.json())
                .then(data => {
                    if (data.display_name) {
                        const searchInput = $('map-search-input');
                        if (searchInput) searchInput.value = data.display_name;
                    }
                })
                .catch(() => {});
        });

        // Search functionality with live autocomplete
        const searchBtn = $('map-search-btn');
        const searchInput = $('map-search-input');
        let searchTimeout = null;
        let suggestionsDiv = null;

        function createSuggestionsDiv() {
            if (suggestionsDiv) return suggestionsDiv;
            suggestionsDiv = document.createElement('div');
            suggestionsDiv.className = 'map-suggestions hidden';
            const searchWrapper = container.querySelector('.map-search');
            if (searchWrapper) searchWrapper.appendChild(suggestionsDiv);
            return suggestionsDiv;
        }

        function hideSuggestions() {
            if (suggestionsDiv) suggestionsDiv.classList.add('hidden');
        }

        function selectSuggestion(lat, lng, name) {
            deliveryMap.setView([lat, lng], 16);
            if (mapMarker) deliveryMap.removeLayer(mapMarker);
            mapMarker = L.marker([lat, lng], { icon: markerIcon }).addTo(deliveryMap);
            searchInput.value = name;
            hideSuggestions();
        }

        function performSearch(query) {
            if (!query || query.length < 3) { hideSuggestions(); return; }

            const sDiv = createSuggestionsDiv();

            fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query + ', Panama')}&limit=5&addressdetails=1`)
                .then(r => r.json())
                .then(results => {
                    if (results.length === 0) {
                        sDiv.innerHTML = '<div class="map-suggestion-item" style="color:var(--text-light);cursor:default;"><i class="fas fa-info-circle"></i> Sin resultados</div>';
                        sDiv.classList.remove('hidden');
                        return;
                    }

                    sDiv.innerHTML = results.map(r => {
                        const shortName = r.display_name.length > 80 ? r.display_name.substring(0, 80) + '...' : r.display_name;
                        return `<div class="map-suggestion-item" data-lat="${r.lat}" data-lng="${r.lon}" data-name="${r.display_name.replace(/"/g, '&quot;')}">
                            <i class="fas fa-map-marker-alt"></i>
                            <span>${shortName}</span>
                        </div>`;
                    }).join('');

                    sDiv.classList.remove('hidden');

                    sDiv.querySelectorAll('.map-suggestion-item[data-lat]').forEach(item => {
                        item.addEventListener('click', (e) => {
                            e.stopPropagation();
                            selectSuggestion(
                                parseFloat(item.dataset.lat),
                                parseFloat(item.dataset.lng),
                                item.dataset.name
                            );
                        });
                    });
                })
                .catch(() => hideSuggestions());
        }

        if (searchInput) {
            // Live autocomplete on typing
            searchInput.addEventListener('input', (e) => {
                clearTimeout(searchTimeout);
                const query = searchInput.value.trim();
                if (query.length < 3) { hideSuggestions(); return; }
                searchTimeout = setTimeout(() => performSearch(query), 400);
            });

            searchInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    clearTimeout(searchTimeout);
                    performSearch(searchInput.value.trim());
                }
            });

            searchInput.addEventListener('click', (e) => e.stopPropagation());

            // Close suggestions when clicking outside
            document.addEventListener('click', () => hideSuggestions());
        }

        if (searchBtn) {
            searchBtn.addEventListener('click', (e) => {
                e.stopPropagation();
                clearTimeout(searchTimeout);
                performSearch(searchInput ? searchInput.value.trim() : '');
            });
        }

        // Try to get user location
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                (pos) => {
                    const { latitude, longitude } = pos.coords;
                    deliveryMap.setView([latitude, longitude], 15);
                    if (mapMarker) deliveryMap.removeLayer(mapMarker);
                    mapMarker = L.marker([latitude, longitude], { icon: markerIcon }).addTo(deliveryMap);

                    // Reverse geocode user position
                    fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${latitude}&lon=${longitude}&zoom=18&addressdetails=1`)
                        .then(r => r.json())
                        .then(data => {
                            if (data.display_name && searchInput) {
                                searchInput.value = data.display_name;
                            }
                        })
                        .catch(() => {});
                },
                () => { /* User denied location, keep default Panama City center */ },
                { timeout: 5000 }
            );
        }

        setTimeout(() => deliveryMap.invalidateSize(), 300);
    }

    async function initiateYappyPayment() {
        const subtotal = cart.reduce((s, i) => s + i.total, 0);
        const deliveryFee = 4.50;
        const total = subtotal + deliveryFee + currentTip;
        const deliveryAddress = $('delivery-address') ? $('delivery-address').value.trim() : '';

        if (!deliveryAddress) {
            showToast('Por favor ingresa tu dirección de entrega', 'error');
            $('delivery-address').focus();
            return;
        }

        orderCounter++;
        const orderId = `XZ-${orderCounter}`;

        // Show loading
        $('btn-pay-yappy').disabled = true;
        $('yappy-loading').classList.remove('hidden');
        $('yappy-error').classList.add('hidden');

        try {
            const response = await fetch('/api/create-payment', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    orderId: orderId,
                    total: total,
                    subtotal: subtotal,
                    delivery: deliveryFee,
                    address: deliveryAddress,
                    items: cart.map(i => ({ name: i.name, qty: i.quantity, price: i.total }))
                })
            });

            const result = await response.json();

            if (result.status && result.redirectUrl) {
                // Save order locally before redirect
                orders.push({
                    id: orderCounter, number: orderId, user: currentUser ? currentUser.name : 'Invitado',
                    items: [...cart], subtotal, total,
                    status: 'esperando_pago', date: new Date().toLocaleString('es-ES'),
                    yappyRedirect: result.redirectUrl
                });

                // Save cart to localStorage so we can clear it after payment
                localStorage.setItem('xazai_pending_order', JSON.stringify({
                    orderId, cart: [...cart]
                }));

                showToast('Redirigiendo a Yappy...', 'info');

                // Redirect to Yappy payment page
                setTimeout(() => {
                    window.location.href = result.redirectUrl;
                }, 800);

            } else {
                // Show error
                $('yappy-loading').classList.add('hidden');
                $('yappy-error').classList.remove('hidden');
                $('yappy-error-msg').textContent = result.error || 'Error al conectar con Yappy';
                $('btn-pay-yappy').disabled = false;
            }

        } catch (err) {
            $('yappy-loading').classList.add('hidden');
            $('yappy-error').classList.remove('hidden');
            $('yappy-error-msg').textContent = 'Error de conexión. Verifica tu internet.';
            $('btn-pay-yappy').disabled = false;
        }
    }

    function processOrderDirect() {
        // Process order and save to Firestore
        if (cart.length === 0) return;
        const deliveryAddress = $('delivery-address') ? $('delivery-address').value.trim() : '';
        if (!deliveryAddress) {
            showToast('Por favor ingresa tu dirección de entrega', 'error');
            if ($('delivery-address')) $('delivery-address').focus();
            return;
        }
        orderCounter++;
        const subtotal = cart.reduce((s, i) => s + i.total, 0);
        const deliveryFee = 4.50;
        const orderNum = `XZ-${orderCounter}`;
        const orderData = {
            number: orderNum,
            customerName: currentUser ? currentUser.name : 'Invitado',
            customerPhone: currentUser ? (currentUser.phone || '') : '',
            items: cart.map(i => ({ name: i.name, emoji: i.emoji, size: i.size, quantity: i.quantity, toppings: i.toppings, total: i.total })),
            subtotal, delivery: deliveryFee, tip: currentTip,
            total: subtotal + deliveryFee + currentTip,
            address: deliveryAddress,
            scheduled: scheduledSlot ? `${scheduledSlot.label} ${scheduledSlot.time}` : null,
            status: 'pendiente',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        // Save to Firestore
        if (typeof db !== 'undefined') {
            db.collection('orders').add(orderData).catch(err => console.error('Error saving order:', err));
        }

        // Also keep local
        orders.push({ id: orderCounter, ...orderData, date: new Date().toLocaleString('es-ES') });

        orderNumber.textContent = orderNum;
        cart = [];
        scheduledSlot = null;
        currentTip = 0;
        updateCartUI();
        closePaymentModal();
        if (!cartSidebar.classList.contains('hidden')) toggleCart();
        confirmationOverlay.classList.remove('hidden');
    }

    // Check for payment return (after Yappy redirect)
    function checkPaymentReturn() {
        const params = new URLSearchParams(window.location.search);
        const payment = params.get('payment');
        const orderId = params.get('order');

        if (payment && orderId) {
            // Clean URL
            window.history.replaceState({}, '', '/');

            const pendingOrder = JSON.parse(localStorage.getItem('xazai_pending_order') || 'null');

            if (payment === 'success') {
                // Clear saved cart
                cart = [];
                updateCartUI();
                localStorage.removeItem('xazai_pending_order');
                orderNumber.textContent = orderId;
                confirmationOverlay.classList.remove('hidden');
                showToast('Pago confirmado con Yappy!', 'success');

                // Poll for actual status from server
                pollPaymentStatus(orderId);

            } else {
                showToast('El pago no se completó. Intenta de nuevo.', 'warning');
            }
        }
    }

    async function pollPaymentStatus(orderId) {
        // Check status from our server (which gets it from Yappy callback)
        for (let i = 0; i < 10; i++) {
            try {
                const res = await fetch(`/api/payment-status/${orderId}`);
                const data = await res.json();
                if (data.status === 'completed') {
                    console.log(`Pago ${orderId} confirmado por Yappy. Ref: ${data.confirmationNumber}`);
                    return;
                }
            } catch(e) { /* continue polling */ }
            await new Promise(r => setTimeout(r, 3000)); // Wait 3 seconds
        }
    }

    // Init: check if returning from Yappy
    checkPaymentReturn();

    btnCheckout.addEventListener('click', handleCheckout);
    floatingCheckoutBtn.addEventListener('click', handleCheckout);
    btnConfirmOk.addEventListener('click', () => confirmationOverlay.classList.add('hidden'));

    // Payment modal events (delegated - elements created in HTML)
    document.addEventListener('click', (e) => {
        if (e.target.closest('#btn-pay-yappy')) initiateYappyPayment();
        if (e.target.closest('#btn-pay-cash')) processOrderDirect();
        if (e.target.closest('#payment-modal-close')) closePaymentModal();
        if (e.target.id === 'payment-modal') closePaymentModal();
    });

    // ========================================
    // ADMIN DASHBOARD (Full Screen)
    // ========================================
    const adminDashboard = $('admin-dashboard');
    let adminMode = false;
    let ordersUnsubscribe = null;
    let posCart = [];
    let posPaymentMethod = 'efectivo';
    let posTipAmount = 0;
    let todaySales = [];
    let notificationSound = null;

    // Create notification sound
    try {
        const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        notificationSound = {
            play: function() {
                const osc = audioCtx.createOscillator();
                const gain = audioCtx.createGain();
                osc.connect(gain);
                gain.connect(audioCtx.destination);
                osc.frequency.setValueAtTime(880, audioCtx.currentTime);
                osc.frequency.setValueAtTime(1100, audioCtx.currentTime + 0.1);
                osc.frequency.setValueAtTime(880, audioCtx.currentTime + 0.2);
                gain.gain.setValueAtTime(0.3, audioCtx.currentTime);
                gain.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + 0.5);
                osc.start(audioCtx.currentTime);
                osc.stop(audioCtx.currentTime + 0.5);
            }
        };
    } catch(e) { notificationSound = null; }

    function enterAdminMode() {
        adminMode = true;
        // Hide client UI
        document.querySelector('.navbar').classList.add('hidden');
        menuSection.classList.add('hidden');
        buildBowlSection.classList.add('hidden');
        floatingCheckout.classList.add('hidden');
        // Show admin dashboard
        adminDashboard.classList.remove('hidden');
        // Start Firestore listeners
        startOrdersListener();
        loadInventory();
        renderPOS();
        loadTodaySales();
        // Init new sections
        initExpenses();
        initDashboard();
    }

    function exitAdminMode() {
        adminMode = false;
        // Stop listeners
        if (ordersUnsubscribe) { ordersUnsubscribe(); ordersUnsubscribe = null; }
        // Hide admin dashboard
        adminDashboard.classList.add('hidden');
        // Show client UI
        document.querySelector('.navbar').classList.remove('hidden');
        menuSection.classList.remove('hidden');
        floatingCheckout.classList.toggle('hidden', cart.length === 0);
        // Reset user
        currentUser = null;
        userName.textContent = 'Mi Cuenta';
        adminPanelBtn.classList.add('hidden');
        logoutBtn.classList.add('hidden');
        loginTriggerBtn.classList.remove('hidden');
        renderCategory('inicio');
        showToast('Sesión admin cerrada', 'info');
    }

    // Admin logout button
    document.addEventListener('click', (e) => {
        if (e.target.closest('#admin-logout')) exitAdminMode();
    });

    // Admin sidebar navigation
    document.addEventListener('click', (e) => {
        const navBtn = e.target.closest('.admin-nav-btn');
        if (!navBtn) return;
        document.querySelectorAll('.admin-nav-btn').forEach(b => b.classList.remove('active'));
        navBtn.classList.add('active');
        const section = navBtn.dataset.section;
        document.querySelectorAll('.admin-section').forEach(s => s.classList.add('hidden'));
        $('admin-sec-' + section).classList.remove('hidden');
        // Load data for the section
        if (section === 'expenses') loadExpenses();
        if (section === 'dashboard') loadDashboard();
    });

    // Admin orders filter
    document.addEventListener('click', (e) => {
        const filterBtn = e.target.closest('#admin-orders-filter .filter-btn');
        if (!filterBtn) return;
        document.querySelectorAll('#admin-orders-filter .filter-btn').forEach(b => b.classList.remove('active'));
        filterBtn.classList.add('active');
        renderAdminOrders(filterBtn.dataset.status);
    });

    // ========================================
    // FIRESTORE: ORDERS (Real-time)
    // ========================================
    let firestoreOrders = [];
    let lastOrderCount = 0;

    function startOrdersListener() {
        if (ordersUnsubscribe) ordersUnsubscribe();
        const ordersRef = db.collection('orders').orderBy('createdAt', 'desc').limit(100);
        ordersUnsubscribe = ordersRef.onSnapshot(snapshot => {
            const newOrders = [];
            snapshot.forEach(doc => {
                newOrders.push({ id: doc.id, ...doc.data() });
            });

            // Check for new orders (sound notification)
            const pendingCount = newOrders.filter(o => o.status === 'pendiente').length;
            if (pendingCount > lastOrderCount && lastOrderCount > 0) {
                if (notificationSound) {
                    try { notificationSound.play(); } catch(e) {}
                }
            }
            lastOrderCount = pendingCount;

            // Update badge
            const badge = $('orders-badge');
            if (pendingCount > 0) {
                badge.textContent = pendingCount;
                badge.classList.remove('hidden');
            } else {
                badge.classList.add('hidden');
            }

            firestoreOrders = newOrders;
            const activeFilter = document.querySelector('#admin-orders-filter .filter-btn.active');
            renderAdminOrders(activeFilter ? activeFilter.dataset.status : 'all');
        });
    }

    function renderAdminOrders(filterStatus = 'all') {
        const container = $('admin-orders-list');
        const filtered = filterStatus === 'all' ? firestoreOrders : firestoreOrders.filter(o => o.status === filterStatus);

        if (!filtered.length) {
            container.innerHTML = '<p class="no-orders">No hay pedidos</p>';
            return;
        }

        const canCancel = (status) => !['entregado', 'cancelado'].includes(status);

        container.innerHTML = filtered.map(order => {
            const items = order.items || [];
            const dateStr = order.createdAt ? new Date(order.createdAt.seconds * 1000).toLocaleString('es-PA') : '';
            const isNew = order.status === 'pendiente';
            return `
            <div class="order-card ${isNew ? 'order-new' : ''}">
                <div class="order-header">
                    <div><strong>${order.number || order.id}</strong><span class="order-date">${dateStr}</span></div>
                    <span class="order-status status-${order.status}">${order.status}</span>
                </div>
                <div class="order-items-list">
                    ${items.map(item => `<div class="order-item-line"><span>${item.emoji || ''} ${item.name} x${item.quantity} (${item.size || ''})</span><span>$${(item.total || 0).toFixed(2)}</span></div>`).join('')}
                </div>
                <div class="order-total-line">
                    <span>Total: <strong>$${(order.total || 0).toFixed(2)}</strong></span>
                    <span>Cliente: ${order.customerName || 'Invitado'}</span>
                </div>
                ${order.address ? `<div style="font-size:11px;color:var(--text-light);margin-bottom:8px;"><i class="fas fa-map-marker-alt" style="color:var(--accent);margin-right:4px;"></i>${order.address}</div>` : ''}
                ${order.status === 'cancelado' && order.cancelReason ? `<div class="order-cancel-reason"><i class="fas fa-ban"></i> ${order.cancelReason}</div>` : ''}
                <div class="order-actions">
                    ${order.status === 'pendiente' ? `<button class="order-action-btn btn-preparando" data-order-id="${order.id}">Preparando</button>` : ''}
                    ${order.status === 'preparando' ? `<button class="order-action-btn btn-listo" data-order-id="${order.id}">Listo</button>` : ''}
                    ${order.status === 'listo' ? `<button class="order-action-btn btn-entregado" data-order-id="${order.id}">Entregado</button>` : ''}
                    ${canCancel(order.status) ? `<button class="order-action-btn btn-cancelar" data-cancel-id="${order.id}">Cancelar</button>` : ''}
                </div>
                <div class="cancel-form hidden" id="cancel-form-${order.id}">
                    <input type="text" placeholder="Razón de cancelación..." id="cancel-reason-${order.id}">
                    <button class="cancel-confirm-btn" data-confirm-cancel="${order.id}">Confirmar Cancelación</button>
                </div>
            </div>`;
        }).join('');

        // Bind status change buttons
        container.querySelectorAll('.order-action-btn:not(.btn-cancelar)').forEach(btn => {
            btn.addEventListener('click', () => {
                const orderId = btn.dataset.orderId;
                let newStatus = '';
                if (btn.classList.contains('btn-preparando')) newStatus = 'preparando';
                else if (btn.classList.contains('btn-listo')) newStatus = 'listo';
                else if (btn.classList.contains('btn-entregado')) newStatus = 'entregado';
                if (newStatus && orderId) {
                    db.collection('orders').doc(orderId).update({ status: newStatus })
                        .then(() => showToast(`Pedido actualizado: ${newStatus}`, 'success'))
                        .catch(err => showToast('Error actualizando pedido', 'warning'));
                }
            });
        });

        // Bind cancel buttons (toggle cancel form)
        container.querySelectorAll('.btn-cancelar').forEach(btn => {
            btn.addEventListener('click', () => {
                const orderId = btn.dataset.cancelId;
                const form = $('cancel-form-' + orderId);
                form.classList.toggle('hidden');
                if (!form.classList.contains('hidden')) {
                    form.querySelector('input').focus();
                }
            });
        });

        // Bind confirm cancel buttons
        container.querySelectorAll('[data-confirm-cancel]').forEach(btn => {
            btn.addEventListener('click', () => {
                const orderId = btn.dataset.confirmCancel;
                const reason = $('cancel-reason-' + orderId).value.trim();
                if (!reason) {
                    showToast('Escribe la razón de cancelación', 'warning');
                    return;
                }
                db.collection('orders').doc(orderId).update({
                    status: 'cancelado',
                    cancelReason: reason,
                    cancelledAt: firebase.firestore.FieldValue.serverTimestamp()
                }).then(() => {
                    showToast('Pedido cancelado', 'success');
                }).catch(err => showToast('Error cancelando pedido', 'warning'));
            });
        });
    }

    // ========================================
    // FIRESTORE: INVENTORY
    // ========================================
    function loadInventory() {
        db.collection('inventory').get().then(snapshot => {
            inventoryCache = {};
            snapshot.forEach(doc => {
                inventoryCache[doc.id] = doc.data();
            });
            renderInventory();
        });
    }

    function renderInventory() {
        const container = $('inventory-list');
        container.innerHTML = MENU_ITEMS.map(item => {
            const inv = inventoryCache[String(item.id)];
            const isActive = inv ? inv.active !== false : true;
            const qty = inv && inv.qty !== undefined ? inv.qty : '';
            return `
            <div class="inventory-item ${!isActive ? 'inactive' : ''}">
                ${item.image ? `<img src="${item.image}" class="inventory-img" alt="${item.name}">` : `<span class="inventory-emoji">${item.emoji}</span>`}
                <div class="inventory-info">
                    <div class="inventory-name">${item.name}</div>
                    <div class="inventory-cat">${item.category}</div>
                </div>
                <span class="inventory-price">$${item.price.toFixed(2)}</span>
                <label class="toggle-switch">
                    <input type="checkbox" data-product-id="${item.id}" ${isActive ? 'checked' : ''}>
                    <span class="toggle-slider"></span>
                </label>
            </div>`;
        }).join('');

        // Bind toggle events
        container.querySelectorAll('.toggle-switch input').forEach(toggle => {
            toggle.addEventListener('change', () => {
                const productId = toggle.dataset.productId;
                const active = toggle.checked;
                const parentItem = toggle.closest('.inventory-item');
                parentItem.classList.toggle('inactive', !active);
                db.collection('inventory').doc(productId).set({ active }, { merge: true })
                    .then(() => {
                        inventoryCache[productId] = { ...inventoryCache[productId], active };
                        showToast(`${active ? 'Activado' : 'Desactivado'}: ${MENU_ITEMS.find(i => i.id == productId)?.name}`, active ? 'success' : 'warning');
                    })
                    .catch(err => showToast('Error actualizando inventario', 'warning'));
            });
        });

        // Inventory tab switching
        document.querySelectorAll('.inv-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.inv-tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const tab = btn.dataset.invTab;
                $('inv-tab-productos').classList.toggle('hidden', tab !== 'productos');
                $('inv-tab-ingredientes').classList.toggle('hidden', tab !== 'ingredientes');
                if (tab === 'ingredientes') renderIngredients();
            });
        });
    }

    function renderIngredients() {
        const container = $('ingredients-list');
        if (typeof INVENTORY_INGREDIENTS === 'undefined') {
            container.innerHTML = '<p class="no-orders">Sin ingredientes definidos</p>';
            return;
        }
        // Group by category
        const groups = {};
        INVENTORY_INGREDIENTS.forEach(ing => {
            if (!groups[ing.category]) groups[ing.category] = [];
            groups[ing.category].push(ing);
        });

        // Load current stock from Firestore
        db.collection('ingredients').get().then(snapshot => {
            const stockData = {};
            snapshot.forEach(doc => stockData[doc.id] = doc.data());

            container.innerHTML = Object.entries(groups).map(([cat, items]) => `
                <div class="ingredient-group-title">${cat}</div>
                ${items.map(ing => {
                    const stock = stockData[ing.id];
                    const qty = stock ? (stock.qty || 0) : 0;
                    return `
                    <div class="inventory-item">
                        <span class="inventory-emoji">${ing.emoji}</span>
                        <div class="inventory-info">
                            <div class="inventory-name">${ing.name}</div>
                            <div class="inventory-cat">${ing.unit}</div>
                        </div>
                        <div class="inventory-qty-wrap">
                            <input type="number" class="inventory-qty-input" data-ing-id="${ing.id}" value="${qty}" min="0" placeholder="0">
                            <span class="inventory-qty-label">${ing.unit}</span>
                        </div>
                    </div>`;
                }).join('')}
            `).join('');

            // Bind qty change events (debounced save)
            let saveTimeout;
            container.querySelectorAll('.inventory-qty-input').forEach(input => {
                input.addEventListener('change', () => {
                    const ingId = input.dataset.ingId;
                    const val = parseInt(input.value) || 0;
                    clearTimeout(saveTimeout);
                    saveTimeout = setTimeout(() => {
                        db.collection('ingredients').doc(ingId).set({ qty: val }, { merge: true })
                            .then(() => showToast('Stock actualizado', 'success'))
                            .catch(() => showToast('Error guardando stock', 'warning'));
                    }, 500);
                });
            });
        });
    }

    // Load inventory on app start for client filtering
    if (typeof db !== 'undefined') {
        db.collection('inventory').onSnapshot(snapshot => {
            snapshot.forEach(doc => {
                inventoryCache[doc.id] = doc.data();
            });
            // Re-render current view if not admin
            if (!adminMode) {
                const activeTab = document.querySelector('.tab.active');
                if (activeTab) renderCategory(activeTab.dataset.category);
            }
        });
    }

    // ========================================
    // POS / CAJA
    // ========================================
    function renderPOS() {
        // Render category buttons
        const catsContainer = $('pos-categories');
        const cats = Object.keys(CATEGORIES).filter(k => k !== 'inicio' && k !== 'arma-tu-bowl');
        catsContainer.innerHTML = `<button class="pos-cat-btn active" data-cat="all">Todos</button>` +
            cats.map(catKey => `<button class="pos-cat-btn" data-cat="${catKey}"><i class="fas ${CATEGORIES[catKey].icon}"></i> ${CATEGORIES[catKey].name}</button>`).join('');

        catsContainer.addEventListener('click', (e) => {
            const btn = e.target.closest('.pos-cat-btn');
            if (!btn) return;
            catsContainer.querySelectorAll('.pos-cat-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderPOSProducts(btn.dataset.cat);
        });

        renderPOSProducts('all');

        // Payment method buttons
        document.querySelectorAll('.pos-method-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.pos-method-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                posPaymentMethod = btn.dataset.method;
                const cashChange = $('pos-cash-change');
                cashChange.style.display = posPaymentMethod === 'efectivo' ? 'block' : 'none';
            });
        });

        // Tip buttons
        document.querySelectorAll('.pos-tip-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.pos-tip-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const tipVal = btn.dataset.tip;
                if (tipVal === 'custom') {
                    $('pos-tip-custom').classList.remove('hidden');
                    posTipAmount = parseFloat($('pos-tip-amount').value) || 0;
                } else {
                    $('pos-tip-custom').classList.add('hidden');
                    posTipAmount = parseFloat(tipVal) || 0;
                }
                renderPOSInvoice();
            });
        });
        const tipCustomInput = $('pos-tip-amount');
        if (tipCustomInput) {
            tipCustomInput.addEventListener('input', () => {
                posTipAmount = parseFloat(tipCustomInput.value) || 0;
                renderPOSInvoice();
            });
        }

        // Cash received input
        const cashInput = $('pos-cash-received');
        if (cashInput) {
            cashInput.addEventListener('input', () => {
                const received = parseFloat(cashInput.value) || 0;
                const subtotal = posCart.reduce((s, i) => s + i.price * i.qty, 0);
                const total = subtotal + posTipAmount;
                const change = received - total;
                $('pos-change-amount').textContent = change >= 0 ? '$' + change.toFixed(2) : '-$' + Math.abs(change).toFixed(2);
                $('pos-change-amount').style.color = change >= 0 ? '#00e096' : '#ff6b6b';
            });
        }

        // Clear invoice
        $('pos-clear').addEventListener('click', () => {
            posCart = [];
            posTipAmount = 0;
            document.querySelectorAll('.pos-tip-btn').forEach(b => b.classList.remove('active'));
            document.querySelector('.pos-tip-btn[data-tip="0"]').classList.add('active');
            $('pos-tip-custom').classList.add('hidden');
            if ($('pos-tip-amount')) $('pos-tip-amount').value = '';
            renderPOSInvoice();
        });

        // Charge button
        $('pos-charge-btn').addEventListener('click', processPOSSale);
    }

    function renderPOSProducts(category) {
        const container = $('pos-products-grid');
        const items = category === 'all' ? MENU_ITEMS : MENU_ITEMS.filter(i => i.category === category);
        container.innerHTML = items.map(item => {
            const isAvailable = isProductAvailable(item.id);
            // Has two sizes: priceGrande exists AND not onlyGrande
            const hasSizes = item.priceGrande != null && !item.onlyGrande;
            const displayPrice = item.price;
            return `
            <div class="pos-product-card ${!isAvailable ? 'disabled' : ''}" data-product-id="${item.id}" data-has-sizes="${hasSizes}">
                ${item.image ? `<img src="${item.image}" class="pos-product-img" alt="${item.name}">` : `<span class="pos-product-emoji">${item.emoji}</span>`}
                <span class="pos-product-name">${item.name}</span>
                <span class="pos-product-price">${hasSizes ? `M $${item.price.toFixed(2)} / G $${item.priceGrande.toFixed(2)}` : `$${displayPrice.toFixed(2)}`}</span>
                ${hasSizes ? `
                <div class="pos-size-picker hidden" data-product-id="${item.id}">
                    <button class="pos-size-btn" data-size="M" data-price="${item.price}">
                        <span class="size-label">M</span>
                        <span>$${item.price.toFixed(2)}</span>
                    </button>
                    <button class="pos-size-btn" data-size="G" data-price="${item.priceGrande}">
                        <span class="size-label">G</span>
                        <span>$${item.priceGrande.toFixed(2)}</span>
                    </button>
                    <button class="pos-size-close"><i class="fas fa-times"></i></button>
                </div>` : ''}
            </div>`;
        }).join('');

        container.querySelectorAll('.pos-product-card:not(.disabled)').forEach(card => {
            card.addEventListener('click', (e) => {
                // Don't trigger if clicking size picker buttons
                if (e.target.closest('.pos-size-picker')) return;
                const productId = parseInt(card.dataset.productId);
                const hasSizes = card.dataset.hasSizes === 'true';
                if (hasSizes) {
                    // Close any other open pickers
                    container.querySelectorAll('.pos-size-picker').forEach(p => p.classList.add('hidden'));
                    card.querySelector('.pos-size-picker').classList.remove('hidden');
                } else {
                    const product = MENU_ITEMS.find(i => i.id === productId);
                    addToPOSCart(productId, '', product.price);
                }
            });
        });

        // Size picker buttons
        container.querySelectorAll('.pos-size-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const picker = btn.closest('.pos-size-picker');
                const productId = parseInt(picker.dataset.productId);
                const size = btn.dataset.size;
                const price = parseFloat(btn.dataset.price);
                picker.classList.add('hidden');
                addToPOSCart(productId, size, price);
            });
        });

        // Close picker buttons
        container.querySelectorAll('.pos-size-close').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                btn.closest('.pos-size-picker').classList.add('hidden');
            });
        });
    }

    function addToPOSCart(productId, size = '', price = null) {
        const product = MENU_ITEMS.find(i => i.id === productId);
        if (!product) return;
        const finalPrice = price !== null ? price : product.price;
        // Match by productId + size for duplicates
        const existing = posCart.find(i => i.productId === productId && i.size === size);
        if (existing) {
            existing.qty++;
        } else {
            posCart.push({ productId, name: product.name, emoji: product.emoji, price: finalPrice, size, qty: 1 });
        }
        renderPOSInvoice();
    }

    function renderPOSInvoice() {
        const container = $('pos-invoice-items');
        const chargeBtn = $('pos-charge-btn');

        if (posCart.length === 0) {
            container.innerHTML = '<p class="pos-empty">Agrega productos a la factura</p>';
            $('pos-subtotal').textContent = '$0.00';
            $('pos-total').textContent = '$0.00';
            chargeBtn.disabled = true;
            return;
        }

        chargeBtn.disabled = false;
        container.innerHTML = posCart.map((item, idx) => `
            <div class="pos-inv-item">
                <div class="pos-inv-info">
                    <div class="pos-inv-name">${item.emoji} ${item.name}${item.size ? ` (${item.size})` : ''}</div>
                    <div class="pos-inv-price-unit">$${item.price.toFixed(2)} c/u</div>
                </div>
                <div class="pos-inv-qty">
                    <button data-pos-action="minus" data-pos-idx="${idx}">-</button>
                    <span>${item.qty}</span>
                    <button data-pos-action="plus" data-pos-idx="${idx}">+</button>
                </div>
                <span class="pos-inv-total">$${(item.price * item.qty).toFixed(2)}</span>
                <button class="pos-inv-remove" data-pos-remove="${idx}"><i class="fas fa-trash-alt"></i></button>
            </div>
        `).join('');

        const subtotal = posCart.reduce((s, i) => s + i.price * i.qty, 0);
        const totalWithTip = subtotal + posTipAmount;
        $('pos-subtotal').textContent = '$' + subtotal.toFixed(2);
        $('pos-total').textContent = '$' + totalWithTip.toFixed(2);

        // Bind qty buttons
        container.querySelectorAll('[data-pos-action]').forEach(btn => {
            btn.addEventListener('click', () => {
                const idx = parseInt(btn.dataset.posIdx);
                if (btn.dataset.posAction === 'plus') {
                    posCart[idx].qty++;
                } else if (btn.dataset.posAction === 'minus') {
                    if (posCart[idx].qty > 1) posCart[idx].qty--;
                    else posCart.splice(idx, 1);
                }
                renderPOSInvoice();
            });
        });

        container.querySelectorAll('[data-pos-remove]').forEach(btn => {
            btn.addEventListener('click', () => {
                posCart.splice(parseInt(btn.dataset.posRemove), 1);
                renderPOSInvoice();
            });
        });

        // Update change calculation
        const cashInput = $('pos-cash-received');
        if (cashInput && cashInput.value) {
            const received = parseFloat(cashInput.value) || 0;
            const change = received - totalWithTip;
            $('pos-change-amount').textContent = change >= 0 ? '$' + change.toFixed(2) : '-$' + Math.abs(change).toFixed(2);
        }
    }

    function processPOSSale() {
        if (posCart.length === 0) return;
        const subtotal = posCart.reduce((s, i) => s + i.price * i.qty, 0);
        const total = subtotal + posTipAmount;

        const sale = {
            items: posCart.map(i => ({ name: i.name, emoji: i.emoji, qty: i.qty, price: i.price, size: i.size || '', total: i.price * i.qty })),
            subtotal,
            tip: posTipAmount,
            total,
            paymentMethod: posPaymentMethod,
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            date: new Date().toLocaleDateString('es-PA')
        };

        db.collection('sales').add(sale).then(() => {
            const tipMsg = posTipAmount > 0 ? ` + propina $${posTipAmount.toFixed(2)}` : '';
            showToast(`Venta registrada: $${total.toFixed(2)} (${posPaymentMethod}${tipMsg})`, 'success');
            posCart = [];
            posTipAmount = 0;
            document.querySelectorAll('.pos-tip-btn').forEach(b => b.classList.remove('active'));
            document.querySelector('.pos-tip-btn[data-tip="0"]').classList.add('active');
            $('pos-tip-custom').classList.add('hidden');
            if ($('pos-tip-amount')) $('pos-tip-amount').value = '';
            renderPOSInvoice();
            const cashInput = $('pos-cash-received');
            if (cashInput) { cashInput.value = ''; $('pos-change-amount').textContent = '$0.00'; }
            loadTodaySales();
        }).catch(err => showToast('Error registrando venta', 'warning'));
    }

    function loadTodaySales() {
        const today = new Date().toLocaleDateString('es-PA');
        db.collection('sales').where('date', '==', today).get().then(snapshot => {
            let count = 0, total = 0;
            snapshot.forEach(doc => {
                const data = doc.data();
                count++;
                total += data.total || 0;
            });
            $('pos-sales-count').textContent = count;
            $('pos-sales-total').textContent = '$' + total.toFixed(2);
        });
    }

    // Old admin panel button now enters admin mode
    adminPanelBtn.addEventListener('click', () => {
        userDropdown.classList.add('hidden');
        enterAdminMode();
    });

    // ========================================
    // ADMIN ACCESS (click logo)
    // ========================================
    (function() {
        const logoEl = document.querySelector('.logo-img-nav') || document.querySelector('.logo-small');
        if (!logoEl) return;

        logoEl.addEventListener('click', () => {
            $('admin-login-modal').classList.remove('hidden');
            document.body.style.overflow = 'hidden';
            const adminEmail = $('admin-login-email');
            if (adminEmail) adminEmail.focus();
        });

        // Close admin login modal
        document.addEventListener('click', (e) => {
            if (e.target.closest('#admin-login-close')) {
                $('admin-login-modal').classList.add('hidden');
                document.body.style.overflow = '';
            }
            if (e.target.id === 'admin-login-modal') {
                $('admin-login-modal').classList.add('hidden');
                document.body.style.overflow = '';
            }
        });

        // Admin login form
        const adminLoginForm = $('admin-login-form');
        if (adminLoginForm) {
            adminLoginForm.addEventListener('submit', (e) => {
                e.preventDefault();
                const email = $('admin-login-email').value.trim().toLowerCase();

                if (!email || !email.includes('@')) {
                    const errEl = $('admin-login-error');
                    errEl.textContent = 'Ingresa un correo válido';
                    errEl.classList.add('show');
                    setTimeout(() => errEl.classList.remove('show'), 3000);
                    return;
                }

                const isAdmin = USERS.find(u => u.role === 'admin' && u.email === email);

                if (isAdmin) {
                    currentUser = {
                        username: email,
                        role: 'admin',
                        name: isAdmin.name || 'Admin',
                        email: email
                    };
                    userName.textContent = isAdmin.name || 'Admin';
                    loginTriggerBtn.classList.add('hidden');
                    logoutBtn.classList.remove('hidden');
                    adminPanelBtn.classList.remove('hidden');

                    $('admin-login-modal').classList.add('hidden');
                    document.body.style.overflow = '';
                    $('admin-login-email').value = '';
                    showToast('Bienvenido, Administrador', 'success');

                    // Enter full admin mode
                    enterAdminMode();
                } else {
                    const errEl = $('admin-login-error');
                    errEl.textContent = 'Acceso denegado. Correo no autorizado.';
                    errEl.classList.add('show');
                    setTimeout(() => errEl.classList.remove('show'), 3000);
                }
            });
        }
    })();

    // ========================================
    // EXPENSES (GASTOS)
    // ========================================
    let expenseImageBase64 = '';

    function initExpenses() {
        // Set default date to today
        const dateInput = $('expense-date');
        if (dateInput) dateInput.value = new Date().toISOString().split('T')[0];

        // Image upload handler
        const fileInput = $('expense-file-input');
        const uploadArea = $('expense-img-upload');
        const placeholder = $('expense-img-placeholder');
        const preview = $('expense-img-preview');

        if (uploadArea) {
            uploadArea.addEventListener('click', () => fileInput.click());
        }

        if (fileInput) {
            fileInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;
                handleExpenseImage(file).then(base64 => {
                    expenseImageBase64 = base64;
                    preview.src = base64;
                    preview.style.display = 'block';
                    placeholder.style.display = 'none';
                });
            });
        }

        // Save expense
        const saveBtn = $('expense-save-btn');
        if (saveBtn) {
            saveBtn.addEventListener('click', saveExpense);
        }
    }

    function handleExpenseImage(file) {
        return new Promise((resolve) => {
            const reader = new FileReader();
            reader.onload = (e) => {
                const img = new Image();
                img.onload = () => {
                    const canvas = document.createElement('canvas');
                    const maxSize = 800;
                    let w = img.width, h = img.height;
                    if (w > maxSize || h > maxSize) {
                        if (w > h) { h = Math.round(h * maxSize / w); w = maxSize; }
                        else { w = Math.round(w * maxSize / h); h = maxSize; }
                    }
                    canvas.width = w;
                    canvas.height = h;
                    canvas.getContext('2d').drawImage(img, 0, 0, w, h);
                    resolve(canvas.toDataURL('image/jpeg', 0.7));
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        });
    }

    function saveExpense() {
        const description = $('expense-description').value.trim();
        const category = $('expense-category').value;
        const amount = parseFloat($('expense-amount').value);
        const date = $('expense-date').value;

        if (!description || !amount || !date) {
            showToast('Completa todos los campos', 'warning');
            return;
        }

        const expense = {
            description,
            category,
            amount,
            date,
            imageBase64: expenseImageBase64 || '',
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        $('expense-save-btn').disabled = true;
        db.collection('expenses').add(expense).then(() => {
            showToast('Gasto guardado correctamente', 'success');
            // Reset form
            $('expense-description').value = '';
            $('expense-amount').value = '';
            $('expense-date').value = new Date().toISOString().split('T')[0];
            $('expense-img-preview').style.display = 'none';
            $('expense-img-placeholder').style.display = '';
            expenseImageBase64 = '';
            $('expense-file-input').value = '';
            $('expense-save-btn').disabled = false;
            loadExpenses();
        }).catch(err => {
            showToast('Error guardando gasto', 'warning');
            $('expense-save-btn').disabled = false;
        });
    }

    function loadExpenses() {
        db.collection('expenses').orderBy('date', 'desc').limit(200).get().then(snapshot => {
            const expenses = [];
            snapshot.forEach(doc => expenses.push({ id: doc.id, ...doc.data() }));
            renderExpenseCards(expenses);
        });
    }

    function renderExpenseCards(expenses) {
        const container = $('expenses-list');
        if (!expenses.length) {
            container.innerHTML = '<p class="no-orders">No hay gastos registrados</p>';
            return;
        }

        // Group by date
        const groups = {};
        expenses.forEach(exp => {
            const d = exp.date || 'Sin fecha';
            if (!groups[d]) groups[d] = [];
            groups[d].push(exp);
        });

        const categoryIcons = {
            proveedor: 'fa-truck',
            servicios: 'fa-bolt',
            mantenimiento: 'fa-wrench',
            inventario: 'fa-box',
            otro: 'fa-receipt'
        };

        container.innerHTML = Object.keys(groups).map(date => {
            const items = groups[date];
            const total = items.reduce((s, i) => s + (i.amount || 0), 0);
            const dateFormatted = new Date(date + 'T12:00:00').toLocaleDateString('es-PA', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
            return `
            <div class="expense-date-group">
                <div class="expense-date-header">
                    <div>
                        <strong>${dateFormatted}</strong>
                        <span style="margin-left:12px;opacity:.6">${items.length} gasto${items.length > 1 ? 's' : ''}</span>
                    </div>
                    <span style="color:var(--accent);font-weight:700;font-size:1.1em">$${total.toFixed(2)}</span>
                </div>
                <div class="expense-items">
                    ${items.map(exp => `
                    <div class="expense-card">
                        <div class="expense-card-icon ${exp.category || 'otro'}"><i class="fas ${categoryIcons[exp.category] || 'fa-receipt'}"></i></div>
                        <div class="expense-card-info">
                            <strong>${exp.description || 'Sin descripción'}</strong>
                            <span>${exp.category || 'otro'}</span>
                        </div>
                        <div class="expense-card-amount">$${(exp.amount || 0).toFixed(2)}</div>
                        ${exp.imageBase64 ? `<img class="expense-card-thumb" src="${exp.imageBase64}" alt="Factura" onclick="this.classList.toggle('expense-card-thumb-expanded')">` : ''}
                    </div>`).join('')}
                </div>
            </div>`;
        }).join('');
    }

    // ========================================
    // DASHBOARD FINANCIERO
    // ========================================
    let dashRangeMode = 'day'; // day, week, month, custom
    let dashRefDate = new Date(); // reference date for navigation

    function initDashboard() {
        dashRefDate = new Date();
        dashRangeMode = 'day';

        // Range tab buttons
        document.querySelectorAll('.dash-range-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.dash-range-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                dashRangeMode = btn.dataset.range;
                const customEl = $('dash-custom-range');
                if (dashRangeMode === 'custom') {
                    customEl.classList.remove('hidden');
                } else {
                    customEl.classList.add('hidden');
                    dashRefDate = new Date();
                    loadDashboard();
                }
            });
        });

        // Prev/Next
        $('dash-prev').addEventListener('click', () => { navigateDash(-1); });
        $('dash-next').addEventListener('click', () => { navigateDash(1); });

        // Custom range apply
        $('dash-apply-range').addEventListener('click', () => { loadDashboard(); });

        // Set default dates for custom inputs
        const today = new Date().toISOString().split('T')[0];
        $('dash-date-from').value = today;
        $('dash-date-to').value = today;
    }

    function navigateDash(dir) {
        if (dashRangeMode === 'day') dashRefDate.setDate(dashRefDate.getDate() + dir);
        else if (dashRangeMode === 'week') dashRefDate.setDate(dashRefDate.getDate() + (7 * dir));
        else if (dashRangeMode === 'month') dashRefDate.setMonth(dashRefDate.getMonth() + dir);
        loadDashboard();
    }

    function getDashDateRange() {
        const monthNames = ['Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio', 'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'];
        let startTs, endTs, label;
        const d = new Date(dashRefDate);

        if (dashRangeMode === 'day') {
            startTs = new Date(d.getFullYear(), d.getMonth(), d.getDate());
            endTs = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1);
            const isToday = startTs.toDateString() === new Date().toDateString();
            label = isToday ? 'Hoy' : startTs.toLocaleDateString('es-PA', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
        } else if (dashRangeMode === 'week') {
            const dayOfWeek = d.getDay();
            const monday = new Date(d); monday.setDate(d.getDate() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1));
            startTs = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate());
            endTs = new Date(startTs); endTs.setDate(endTs.getDate() + 7);
            label = `${startTs.toLocaleDateString('es-PA', { day: 'numeric', month: 'short' })} — ${new Date(endTs - 86400000).toLocaleDateString('es-PA', { day: 'numeric', month: 'short' })}`;
        } else if (dashRangeMode === 'month') {
            startTs = new Date(d.getFullYear(), d.getMonth(), 1);
            endTs = new Date(d.getFullYear(), d.getMonth() + 1, 1);
            label = `${monthNames[d.getMonth()]} ${d.getFullYear()}`;
        } else { // custom
            const from = $('dash-date-from').value;
            const to = $('dash-date-to').value;
            if (!from || !to) { return null; }
            startTs = new Date(from + 'T00:00:00');
            endTs = new Date(to + 'T23:59:59');
            endTs.setDate(endTs.getDate() + 1); endTs.setHours(0, 0, 0, 0);
            label = `${startTs.toLocaleDateString('es-PA', { day: 'numeric', month: 'short' })} — ${new Date(to + 'T12:00:00').toLocaleDateString('es-PA', { day: 'numeric', month: 'short' })}`;
        }
        return { startTs, endTs, label };
    }

    function loadDashboard() {
        const range = getDashDateRange();
        if (!range) return;
        $('dash-current-label').textContent = range.label;

        // Also compute string dates for expense filtering
        const startDateStr = range.startTs.toISOString().split('T')[0];
        const endDateStr = range.endTs.toISOString().split('T')[0];

        const salesPromise = db.collection('sales')
            .where('createdAt', '>=', range.startTs)
            .where('createdAt', '<', range.endTs)
            .get().then(snap => {
                const sales = [];
                snap.forEach(doc => sales.push({ id: doc.id, ...doc.data() }));
                return sales;
            }).catch(() => []);

        const expensesPromise = db.collection('expenses')
            .where('date', '>=', startDateStr)
            .where('date', '<', endDateStr)
            .orderBy('date', 'desc')
            .get().then(snap => {
                const expenses = [];
                snap.forEach(doc => expenses.push({ id: doc.id, ...doc.data() }));
                return expenses;
            }).catch(() => []);

        const ordersPromise = db.collection('orders')
            .where('createdAt', '>=', range.startTs)
            .where('createdAt', '<', range.endTs)
            .orderBy('createdAt', 'desc')
            .get().then(snap => {
                const orders = [];
                snap.forEach(doc => orders.push({ id: doc.id, ...doc.data() }));
                return orders;
            }).catch(() => []);

        Promise.all([salesPromise, expensesPromise, ordersPromise]).then(([sales, expenses, orders]) => {
            renderDashSummary(sales, expenses, orders);
            renderDashPayments(sales);
            renderDashTopProducts(sales);
            renderDashRecent(orders, expenses);
        });
    }

    function renderDashSummary(sales, expenses, orders) {
        const totalSales = sales.reduce((s, sale) => s + (sale.total || 0), 0);
        const totalTips = sales.reduce((s, sale) => s + (sale.tip || 0), 0);
        const totalExpenses = expenses.reduce((s, exp) => s + (exp.amount || 0), 0);
        const netProfit = totalSales - totalExpenses;
        const validOrders = orders.filter(o => o.status !== 'cancelado');
        const txCount = sales.length;

        $('dash-summary').innerHTML = `
            <div class="dash-summary-card">
                <div class="dash-summary-icon green"><i class="fas fa-dollar-sign"></i></div>
                <div class="dash-summary-info">
                    <span>Ventas (${txCount} tx)</span>
                    <div class="dash-summary-value">$${totalSales.toFixed(2)}</div>
                </div>
            </div>
            <div class="dash-summary-card">
                <div class="dash-summary-icon red"><i class="fas fa-arrow-down"></i></div>
                <div class="dash-summary-info">
                    <span>Gastos</span>
                    <div class="dash-summary-value">$${totalExpenses.toFixed(2)}</div>
                </div>
            </div>
            <div class="dash-summary-card">
                <div class="dash-summary-icon accent"><i class="fas fa-chart-line"></i></div>
                <div class="dash-summary-info">
                    <span>Ganancia Neta</span>
                    <div class="dash-summary-value" style="color:${netProfit >= 0 ? '#00e096' : '#ff4757'}">$${netProfit.toFixed(2)}</div>
                </div>
            </div>
            <div class="dash-summary-card">
                <div class="dash-summary-icon blue"><i class="fas fa-heart"></i></div>
                <div class="dash-summary-info">
                    <span>Propinas</span>
                    <div class="dash-summary-value">$${totalTips.toFixed(2)}</div>
                </div>
            </div>
        `;
    }

    function renderDashPayments(sales) {
        // Always show all 3 methods even if 0
        const allMethods = ['efectivo', 'yappy', 'tarjeta'];
        const methodLabels = { 'efectivo': 'Efectivo', 'yappy': 'Yappy', 'tarjeta': 'Tarjeta' };
        const methodColors = { 'efectivo': 'cash', 'yappy': 'yappy', 'tarjeta': 'card' };
        const methodIcons = { 'efectivo': 'fa-money-bill-wave', 'yappy': 'fa-mobile-alt', 'tarjeta': 'fa-credit-card' };

        const methods = {};
        const counts = {};
        allMethods.forEach(m => { methods[m] = 0; counts[m] = 0; });
        sales.forEach(sale => {
            const m = (sale.paymentMethod || 'efectivo').toLowerCase();
            methods[m] = (methods[m] || 0) + (sale.total || 0);
            counts[m] = (counts[m] || 0) + 1;
        });

        const grandTotal = Object.values(methods).reduce((s, v) => s + v, 0) || 1;
        const content = $('dash-payments-content');

        content.innerHTML = allMethods.map(method => {
            const amount = methods[method];
            const count = counts[method];
            const pct = Math.round((amount / grandTotal) * 100);
            return `
            <div class="dash-payment-row">
                <div style="display:flex;align-items:center;gap:8px;min-width:100px">
                    <i class="fas ${methodIcons[method]}" style="opacity:.6"></i>
                    <span>${methodLabels[method]}</span>
                    <span style="font-size:11px;opacity:.4">(${count})</span>
                </div>
                <div class="dash-payment-bar-bg">
                    <div class="dash-payment-bar-fill ${methodColors[method]}" style="width:${pct}%"></div>
                </div>
                <span style="min-width:80px;text-align:right;font-weight:600">$${amount.toFixed(2)}</span>
            </div>`;
        }).join('') + `
            <div style="margin-top:12px;padding-top:12px;border-top:1px solid var(--border);display:flex;justify-content:space-between;font-weight:700">
                <span>Total Cierre</span><span style="color:var(--accent)">$${grandTotal === 1 ? '0.00' : Object.values(methods).reduce((s, v) => s + v, 0).toFixed(2)}</span>
            </div>`;
    }

    function renderDashTopProducts(sales) {
        const products = {};
        sales.forEach(sale => {
            (sale.items || []).forEach(item => {
                const key = item.name || 'Desconocido';
                if (!products[key]) products[key] = { name: key, emoji: item.emoji || '', qty: 0, total: 0 };
                products[key].qty += item.qty || 1;
                products[key].total += item.total || item.price || 0;
            });
        });

        const sorted = Object.values(products).sort((a, b) => b.total - a.total).slice(0, 5);
        const content = $('dash-top-content');

        if (!sorted.length) {
            content.innerHTML = '<p style="opacity:.5;text-align:center;padding:20px">Sin datos en este período</p>';
            return;
        }

        content.innerHTML = sorted.map((p, idx) => `
            <div class="dash-top-item">
                <span class="dash-top-rank">${idx + 1}</span>
                <span style="flex:1">${p.emoji} ${p.name}</span>
                <span style="opacity:.6;margin-right:12px">${p.qty} uds</span>
                <span style="font-weight:700;color:var(--accent)">$${p.total.toFixed(2)}</span>
            </div>
        `).join('');
    }

    function renderDashRecent(orders, expenses) {
        const content = $('dash-recent-content');
        const timeline = [];

        orders.slice(0, 8).forEach(o => {
            const date = o.createdAt ? new Date(o.createdAt.seconds * 1000) : new Date();
            timeline.push({ type: 'order', date, text: `Pedido ${o.number || o.id} — $${(o.total || 0).toFixed(2)}`, status: o.status, icon: 'fa-shopping-bag', color: o.status === 'cancelado' ? '#ff4757' : '#00e096' });
        });

        expenses.slice(0, 5).forEach(e => {
            const date = e.createdAt ? new Date(e.createdAt.seconds * 1000) : new Date(e.date + 'T12:00:00');
            timeline.push({ type: 'expense', date, text: `${e.description} — $${(e.amount || 0).toFixed(2)}`, status: e.category, icon: 'fa-file-invoice-dollar', color: '#ff4757' });
        });

        timeline.sort((a, b) => b.date - a.date);

        if (!timeline.length) {
            content.innerHTML = '<p style="opacity:.5;text-align:center;padding:20px">Sin actividad en este período</p>';
            return;
        }

        content.innerHTML = timeline.slice(0, 10).map(item => `
            <div class="dash-timeline-item">
                <div class="dash-timeline-icon" style="background:${item.color}22;color:${item.color}"><i class="fas ${item.icon}"></i></div>
                <div style="flex:1">
                    <div>${item.text}</div>
                    <div style="font-size:11px;opacity:.5">${item.date.toLocaleString('es-PA')}</div>
                </div>
                <span class="order-status status-${item.status}" style="font-size:10px">${item.status}</span>
            </div>
        `).join('');
    }

    // ========================================
    // TOAST
    // ========================================
    function showToast(message, type = 'success') {
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        toast.innerHTML = `<i class="fas ${type === 'success' ? 'fa-check-circle' : type === 'warning' ? 'fa-exclamation-triangle' : 'fa-info-circle'}"></i><span>${message}</span>`;
        toastContainer.appendChild(toast);
        requestAnimationFrame(() => toast.classList.add('show'));
        setTimeout(() => { toast.classList.remove('show'); setTimeout(() => toast.remove(), 300); }, 3000);
    }
});
