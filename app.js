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
    let orderCounter = parseInt(localStorage.getItem('xazai_orderCounter') || '1000', 10);
    let expandedCardId = null;
    // Session-based shuffle for bowls & smoothies
    const sessionSeed = (function() {
        let seed = sessionStorage.getItem('xazai_shuffle_seed');
        if (!seed) {
            seed = String(Math.random());
            sessionStorage.setItem('xazai_shuffle_seed', seed);
        }
        return parseFloat(seed);
    })();

    function seededRandom(seed) {
        const x = Math.sin(seed) * 10000;
        return x - Math.floor(x);
    }

    function sessionShuffle(arr) {
        const shuffled = arr.slice();
        let s = sessionSeed;
        for (let i = shuffled.length - 1; i > 0; i--) {
            s = seededRandom(s * 1000 + i);
            const j = Math.floor(s * (i + 1));
            [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
        }
        return shuffled;
    }

    const SHUFFLE_CATEGORIES = ['bowls', 'smoothies'];

    // Menu admin state (must be at top to avoid TDZ)
    let menuFirestoreItems = [];
    let menuItemsLoaded = false;
    let menuUnsubscribe = null;
    let editingMenuItemId = null;
    let menuImageBase64 = '';
    let menuFormIngredients = [];
    let menuFormToppings = [];

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

    // Customer order tracking state
    let customerOrderHistory = [];
    let customerOrdersUnsubscribe = null;
    let customerActiveOrders = [];
    let customerPastOrders = [];
    let _loadingHistory = false;

    // DOM - Mis Pedidos
    const misPedidosSection = $('mis-pedidos-section');
    const tabMisPedidos = $('tab-mis-pedidos');

    // Store status override (Firestore-synced)
    let storeStatusOverride = 'auto';
    let ratingDismissed = new Set();
    let selectedRating = 0;
    let currentRatingOrderId = null;

    // ========================================
    // CASH REGISTER SOUND
    // ========================================
    const cashRegisterSound = new Audio('cash-register.mp3');
    cashRegisterSound.volume = 0.7;

    function playCashRegisterSound() {
        try {
            cashRegisterSound.currentTime = 0;
            cashRegisterSound.play().catch(() => {});
        } catch (e) { /* silent fail */ }
    }

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
        // Manual override from admin
        if (storeStatusOverride === 'abierto') return true;
        if (storeStatusOverride === 'cerrado') return false;
        if (storeStatusOverride === 'alta_demanda') return true; // Open but with warning
        // 'auto' → schedule-based logic
        const now = new Date();
        const day = now.getDay();
        const hours = BUSINESS_HOURS[day];
        if (!hours) return false; // Wednesday closed
        const currentHour = now.getHours() + now.getMinutes() / 60;
        return currentHour >= hours.open && currentHour < hours.close;
    }

    function getStoreStatusText() {
        // Manual overrides
        if (storeStatusOverride === 'abierto') return { open: true, text: 'Abierto' };
        if (storeStatusOverride === 'cerrado') return { open: false, text: 'Cerrado' };
        if (storeStatusOverride === 'alta_demanda') return { open: true, text: 'Alta Demanda', highDemand: true };

        // Auto → schedule-based
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

        statusEl.classList.remove('open', 'closed', 'alta-demanda');
        if (status.highDemand) {
            statusEl.classList.add('alta-demanda');
        } else {
            statusEl.classList.add(status.open ? 'open' : 'closed');
        }
        textEl.textContent = status.text;

        // Sync admin toggle buttons if visible
        const toggleBtns = document.querySelectorAll('.store-toggle-btn');
        if (toggleBtns.length) {
            toggleBtns.forEach(b => {
                b.classList.toggle('active', b.dataset.storeStatus === storeStatusOverride);
            });
        }
    }

    // Update status every minute
    updateStoreStatus();
    setInterval(updateStoreStatus, 60000);

    // Firestore listener for store status override (real-time sync)
    if (typeof db !== 'undefined') {
        db.collection('settings').doc('storeStatus').onSnapshot(doc => {
            storeStatusOverride = doc.exists ? (doc.data().override || 'auto') : 'auto';
            updateStoreStatus();
        }, err => {
            console.warn('Store status listener error:', err);
        });
    }

    // Admin store toggle event listeners
    document.addEventListener('click', (e) => {
        const toggleBtn = e.target.closest('.store-toggle-btn');
        if (!toggleBtn) return;
        const newStatus = toggleBtn.dataset.storeStatus;
        if (!newStatus) return;

        // Update Firestore
        db.collection('settings').doc('storeStatus').set({
            override: newStatus,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedBy: currentUser ? currentUser.name : 'admin'
        }).then(() => {
            showToast(`Estado del negocio: ${newStatus === 'auto' ? 'Automático' : newStatus === 'alta_demanda' ? 'Alta Demanda' : newStatus.charAt(0).toUpperCase() + newStatus.slice(1)}`, 'success');
        }).catch(err => {
            showToast('Error actualizando estado', 'warning');
            console.error(err);
        });
    });

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
        if (!inv) return true;
        if (inv.active === false) return false;
        // If both sizes are explicitly disabled, product is unavailable
        if (inv.activeM === false && inv.activeG === false) return false;
        return true;
    }

    // ========================================
    // INIT - Go directly to menu
    // ========================================
    renderCategory('inicio');
    updateCartUI();

    // Start menu listener early so customers get Firestore-managed prices/products
    if (typeof db !== 'undefined' && !menuUnsubscribe) {
        startMenuListener();
    }

    // Sync orderCounter with Firestore (get latest order number)
    if (typeof db !== 'undefined') {
        db.collection('orders').orderBy('createdAt', 'desc').limit(1).get().then(snap => {
            if (!snap.empty) {
                const lastOrder = snap.docs[0].data();
                const num = lastOrder.number; // e.g. "XZ-1005"
                if (num && num.startsWith('XZ-')) {
                    const lastNum = parseInt(num.replace('XZ-', ''), 10);
                    if (!isNaN(lastNum) && lastNum > orderCounter) {
                        orderCounter = lastNum;
                        localStorage.setItem('xazai_orderCounter', orderCounter);
                        console.log('OrderCounter synced from Firestore:', orderCounter);
                    }
                }
            }
        }).catch(err => console.warn('Could not sync orderCounter:', err));
    }

    // Restore persisted user session
    const savedUser = localStorage.getItem('xazai_user');
    if (savedUser) {
        try {
            currentUser = JSON.parse(savedUser);
            userName.textContent = currentUser.name || 'Mi Cuenta';
            loginTriggerBtn.classList.add('hidden');
            logoutBtn.classList.remove('hidden');
            if (currentUser.role === 'admin') adminPanelBtn.classList.remove('hidden');
            // Show customer features if has phone
            if (currentUser.phone && currentUser.role !== 'admin') {
                showMisPedidosTab();
                startCustomerOrdersListener(currentUser.phone);
                loadCustomerOrderHistory(currentUser.phone).then(() => {
                    const activeTab = document.querySelector('.tab.active');
                    if (activeTab && activeTab.dataset.category === 'inicio') {
                        renderAllProducts();
                    }
                });
            }
        } catch(e) {
            localStorage.removeItem('xazai_user');
        }
    }

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
        customerOrderHistory = [];
        customerActiveOrders = [];
        customerPastOrders = [];
        userName.textContent = 'Mi Cuenta';
        adminPanelBtn.classList.add('hidden');
        logoutBtn.classList.add('hidden');
        loginTriggerBtn.classList.remove('hidden');
        userDropdown.classList.add('hidden');
        localStorage.removeItem('xazai_user');
        hideMisPedidosTab();
        showToast('Sesión cerrada', 'info');
        // Always switch back to Inicio tab
        document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
        const inicioTab = document.querySelector('[data-category="inicio"]');
        if (inicioTab) inicioTab.classList.add('active');
        renderCategory('inicio');
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

        // Persist user session
        localStorage.setItem('xazai_user', JSON.stringify(currentUser));

        closeLoginModal();
        showToast(`Bienvenido, ${displayName}!`, 'success');

        // Load customer features if has phone
        if (currentUser.role !== 'admin' && currentUser.phone) {
            showMisPedidosTab();
            loadCustomerOrderHistory(currentUser.phone).then(() => {
                const activeTab = document.querySelector('.tab.active');
                if (activeTab && activeTab.dataset.category === 'inicio') {
                    renderAllProducts();
                }
            });
        }

        // If came from checkout, show payment modal
        if (cart.length > 0) showPaymentModal();
    });

    btnGuest.addEventListener('click', () => {
        currentUser = { username: 'guest', role: 'guest', name: 'Invitado' };
        userName.textContent = 'Invitado';
        loginTriggerBtn.classList.add('hidden');
        logoutBtn.classList.remove('hidden');
        localStorage.setItem('xazai_user', JSON.stringify(currentUser));
        closeLoginModal();
        if (cart.length > 0) showPaymentModal();
    });

    // ========================================
    // CUSTOMER ORDER HISTORY & "VOLVER A COMPRAR"
    // ========================================
    async function loadCustomerOrderHistory(phone) {
        if (!phone || typeof db === 'undefined' || _loadingHistory) return;
        _loadingHistory = true;
        try {
            const snapshot = await db.collection('orders')
                .where('customerPhone', '==', phone)
                .orderBy('createdAt', 'desc')
                .limit(50)
                .get();
            customerOrderHistory = [];
            snapshot.forEach(doc => {
                customerOrderHistory.push({ id: doc.id, ...doc.data() });
            });
        } catch(err) {
            console.error('Error loading order history:', err);
        } finally {
            _loadingHistory = false;
        }
    }

    function getReorderProducts() {
        const seen = new Set();
        const reorderItems = [];
        for (const order of customerOrderHistory) {
            if (order.status === 'cancelado') continue;
            for (const item of (order.items || [])) {
                const menuItem = getMenuItems().find(m => m.name === item.name);
                if (menuItem && !seen.has(menuItem.id) && isProductAvailable(menuItem.id)) {
                    seen.add(menuItem.id);
                    reorderItems.push({ menuItem, lastSize: item.size || '' });
                }
                if (reorderItems.length >= 8) break;
            }
            if (reorderItems.length >= 8) break;
        }
        return reorderItems;
    }

    function buildReorderCardHTML(ri) {
        const item = ri.menuItem;
        const hasImage = item.image && item.image.length > 0;
        return `
            <div class="reorder-card" data-id="${item.id}">
                <div class="reorder-card-img">
                    ${hasImage
                        ? `<img src="${item.image}" alt="${item.name}" loading="lazy">`
                        : `<span class="reorder-emoji">${item.emoji}</span>`
                    }
                </div>
                <div class="reorder-card-info">
                    <span class="reorder-name">${item.name}</span>
                    <span class="reorder-price">$${item.price.toFixed(2)}</span>
                </div>
                <button class="reorder-add-btn" data-id="${item.id}">
                    <i class="fas fa-plus"></i> Agregar
                </button>
            </div>
        `;
    }

    function bindReorderEvents() {
        productsGrid.querySelectorAll('.reorder-add-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const productId = parseInt(btn.dataset.id);
                const product = getMenuItems().find(i => i.id === productId);
                if (!product) return;
                // Direct add for simple products (bebidas, shots, cafe)
                const directCats = ['bebidas', 'shots', 'cafe'];
                if (directCats.includes(product.category) || product.onlyGrande) {
                    addDirectToCart(productId);
                } else {
                    // Scroll to the product card and expand it
                    const cardEl = document.getElementById('card-' + productId);
                    if (cardEl) {
                        cardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                        setTimeout(() => toggleExpand(productId), 400);
                    } else {
                        addDirectToCart(productId);
                    }
                }
            });
        });
        productsGrid.querySelectorAll('.reorder-card').forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.closest('.reorder-add-btn')) return;
                const productId = parseInt(card.dataset.id);
                const cardEl = document.getElementById('card-' + productId);
                if (cardEl) {
                    cardEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
                    setTimeout(() => toggleExpand(productId), 400);
                }
            });
        });
    }

    // ========================================
    // MIS PEDIDOS - Customer Order Tracking
    // ========================================
    function showMisPedidosTab() {
        if (tabMisPedidos) tabMisPedidos.classList.remove('hidden');
    }

    function hideMisPedidosTab() {
        if (tabMisPedidos) tabMisPedidos.classList.add('hidden');
        if (misPedidosSection) misPedidosSection.classList.add('hidden');
        if (customerOrdersUnsubscribe) {
            customerOrdersUnsubscribe();
            customerOrdersUnsubscribe = null;
        }
    }

    function startCustomerOrdersListener(phone) {
        if (customerOrdersUnsubscribe) customerOrdersUnsubscribe();
        if (!phone || typeof db === 'undefined') return;

        const ordersRef = db.collection('orders')
            .where('customerPhone', '==', phone)
            .orderBy('createdAt', 'desc')
            .limit(20);

        customerOrdersUnsubscribe = ordersRef.onSnapshot(snapshot => {
            const allOrders = [];
            snapshot.forEach(doc => {
                allOrders.push({ id: doc.id, ...doc.data() });
            });

            customerActiveOrders = allOrders.filter(o =>
                ['pendiente', 'preparando', 'listo', 'en_camino'].includes(o.status)
            );
            customerPastOrders = allOrders.filter(o =>
                ['entregado', 'cancelado'].includes(o.status)
            );

            renderMisPedidos();

            // Refresh home tracker if viewing inicio
            const activeTab = document.querySelector('.tab.active');
            if (activeTab && activeTab.dataset.category === 'inicio') {
                renderAllProducts();
            }

            // Auto-show rating for recently delivered orders
            const justDelivered = allOrders.find(o =>
                o.status === 'entregado' && !o.rating && !o.ratedAt && !ratingDismissed.has(o.id)
            );
            if (justDelivered && currentUser && currentUser.role !== 'admin') {
                setTimeout(() => showRatingModal(justDelivered), 1500);
            }
        }, err => {
            console.error('Error listening to customer orders:', err);
        });
    }

    function renderMisPedidos() {
        const activeContainer = $('mis-pedidos-active-list');
        const historyContainer = $('mis-pedidos-history-list');
        if (!activeContainer || !historyContainer) return;

        // Active orders
        if (customerActiveOrders.length === 0) {
            activeContainer.innerHTML = '<p class="mp-empty"><i class="fas fa-check-circle"></i> No tienes pedidos activos</p>';
        } else {
            activeContainer.innerHTML = customerActiveOrders.map(order =>
                buildCustomerOrderCard(order, true)
            ).join('');
        }

        // Past orders
        if (customerPastOrders.length === 0) {
            historyContainer.innerHTML = '<p class="mp-empty">Aún no tienes pedidos anteriores</p>';
        } else {
            historyContainer.innerHTML = customerPastOrders.map(order =>
                buildCustomerOrderCard(order, false)
            ).join('');
        }
    }

    function buildCustomerOrderCard(order, isActive) {
        const items = order.items || [];
        let dateStr = '';
        if (order.createdAt && order.createdAt.seconds) {
            dateStr = new Date(order.createdAt.seconds * 1000).toLocaleString('es-PA', {
                day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit'
            });
        }

        const isCancelled = order.status === 'cancelado';

        // Status stepper for active orders
        const steps = ['pendiente', 'preparando', 'listo', 'en_camino', 'entregado'];
        const stepLabels = ['Recibido', 'Preparando', 'Listo', 'En Camino', 'Entregado'];
        const stepIcons = ['fa-inbox', 'fa-fire-burner', 'fa-bell', 'fa-motorcycle', 'fa-check-double'];
        const currentStepIdx = steps.indexOf(order.status);

        let stepperHTML = '';
        if (isActive && !isCancelled) {
            stepperHTML = `
                <div class="mp-stepper">
                    ${steps.map((step, idx) => {
                        let cls = '';
                        if (idx < currentStepIdx) cls = 'completed';
                        else if (idx === currentStepIdx) cls = 'active';
                        else cls = 'pending';
                        return `
                            <div class="mp-step ${cls}">
                                <div class="mp-step-icon"><i class="fas ${stepIcons[idx]}"></i></div>
                                <span class="mp-step-label">${stepLabels[idx]}</span>
                            </div>
                            ${idx < steps.length - 1 ? `<div class="mp-step-line ${idx < currentStepIdx ? 'completed' : ''}"></div>` : ''}
                        `;
                    }).join('')}
                </div>
            `;
        }

        const statusLabels = {
            pendiente: 'Recibido',
            preparando: 'Preparando',
            listo: 'Listo',
            en_camino: 'En Camino',
            entregado: 'Entregado',
            cancelado: 'Cancelado'
        };

        const itemsSummary = items.slice(0, 3).map(i =>
            `${i.emoji || '📦'} ${i.name} x${i.qty || i.quantity || 1}`
        ).join(' &middot; ') + (items.length > 3 ? ` +${items.length - 3} más` : '');

        return `
            <div class="mp-order-card ${isCancelled ? 'mp-cancelled' : ''} ${isActive ? 'mp-active' : ''}">
                <div class="mp-order-header">
                    <div>
                        <strong class="mp-order-number">${order.number || ''}</strong>
                        <span class="mp-order-date">${dateStr}</span>
                    </div>
                    <span class="order-status status-${order.status}">${statusLabels[order.status] || order.status}</span>
                </div>
                ${stepperHTML}
                <div class="mp-order-items">${itemsSummary}</div>
                <div class="mp-order-footer">
                    <span class="mp-order-total">Total: $${(order.total || 0).toFixed(2)}</span>
                </div>
                ${isCancelled && order.cancelReason ? `<div class="mp-cancel-reason"><i class="fas fa-ban"></i> ${order.cancelReason}</div>` : ''}
                ${order.status === 'entregado' ? buildRatingSection(order) : ''}
            </div>
        `;
    }

    function buildRatingSection(order) {
        if (order.rating) {
            // Show existing rating (read-only)
            let stars = '';
            for (let i = 1; i <= 5; i++) {
                stars += `<i class="fas fa-star ${i <= order.rating ? 'filled' : ''}"></i>`;
            }
            return `<div class="mp-rating-display">${stars}</div>`;
        }
        // Show "Rate" button
        return `<button class="mp-rate-btn" data-rate-order="${order.id}" data-rate-number="${order.number || ''}">
            <i class="fas fa-star"></i> Calificar pedido
        </button>`;
    }

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

        if (category === 'mis-pedidos') {
            menuSection.classList.add('hidden');
            buildBowlSection.classList.add('hidden');
            if (misPedidosSection) misPedidosSection.classList.remove('hidden');
            // Start real-time listener if not running
            if (currentUser && currentUser.phone && !customerOrdersUnsubscribe) {
                startCustomerOrdersListener(currentUser.phone);
            }
        } else if (category === 'arma-tu-bowl') {
            menuSection.classList.add('hidden');
            buildBowlSection.classList.remove('hidden');
            if (misPedidosSection) misPedidosSection.classList.add('hidden');
            renderBuildBowl();
        } else {
            menuSection.classList.remove('hidden');
            buildBowlSection.classList.add('hidden');
            if (misPedidosSection) misPedidosSection.classList.add('hidden');
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
    // ========================================
    // HOME ORDER TRACKER (animated)
    // ========================================
    function renderHomeOrderTracker(order) {
        const trackerSteps = [
            { status: 'pendiente', icon: 'fa-inbox', label: 'Recibido', msg: 'Tu orden fue recibida exitosamente' },
            { status: 'preparando', icon: 'fa-fire-burner', label: 'Preparando', msg: 'Nuestro equipo está preparando tu pedido' },
            { status: 'en_camino', icon: 'fa-motorcycle', label: 'En Camino', msg: 'Tu pedido va en camino hacia ti' },
            { status: 'entregado', icon: 'fa-check-double', label: 'Entregado', msg: '¡Pedido entregado! ¡Buen provecho!' }
        ];

        // Map listo → same index as en_camino (step 2) but shows as active/preparing
        const statusToIdx = {
            'pendiente': 0,
            'preparando': 1,
            'listo': 2, // Listo maps to before en_camino (shows as preparing done, en_camino next)
            'en_camino': 2,
            'entregado': 3
        };

        const currentIdx = statusToIdx[order.status] !== undefined ? statusToIdx[order.status] : 0;
        const isListo = order.status === 'listo';

        // Time elapsed
        let timeText = '';
        if (order.createdAt && order.createdAt.seconds) {
            const elapsed = Math.floor((Date.now() - order.createdAt.seconds * 1000) / 60000);
            if (elapsed < 1) timeText = 'Hace un momento';
            else if (elapsed < 60) timeText = `Hace ${elapsed} min`;
            else timeText = `Hace ${Math.floor(elapsed / 60)} hr ${elapsed % 60} min`;
        }

        // Items summary
        const items = order.items || [];
        const itemsSummary = items.slice(0, 3).map(i =>
            `${i.emoji || '📦'} ${i.name}`
        ).join(' · ') + (items.length > 3 ? ` +${items.length - 3} más` : '');

        // Current message
        let currentMsg = '';
        if (isListo) {
            currentMsg = 'Tu pedido está listo, pronto saldrá en camino';
        } else {
            currentMsg = trackerSteps[currentIdx].msg;
        }

        let stepsHTML = '';
        trackerSteps.forEach((step, idx) => {
            let cls = '';
            if (idx < currentIdx) cls = 'completed';
            else if (idx === currentIdx) {
                cls = isListo && idx === 2 ? 'pending' : 'active';
                // If listo, mark step 1 (preparando) as completed instead
                if (isListo && idx === 2) cls = 'pending';
            } else cls = 'pending';

            // For listo status: steps 0,1 completed, step 2 (en_camino) pending with special state
            if (isListo) {
                if (idx < 2) cls = 'completed';
                else if (idx === 2) cls = 'active'; // Show en_camino as "next up" with pulse
                else cls = 'pending';
            }

            stepsHTML += `
                <div class="ht-step ${cls}">
                    <div class="ht-step-icon"><i class="fas ${step.icon}"></i></div>
                    <span class="ht-step-label">${step.label}</span>
                </div>
            `;

            if (idx < trackerSteps.length - 1) {
                let lineCls = '';
                if (isListo) {
                    lineCls = idx < 1 ? 'completed' : (idx === 1 ? 'active' : 'pending');
                } else {
                    lineCls = idx < currentIdx ? 'completed' : (idx === currentIdx ? 'active' : 'pending');
                }
                stepsHTML += `<div class="ht-line ${lineCls}"></div>`;
            }
        });

        return `
            <div class="home-tracker">
                <div class="home-tracker-header">
                    <div class="home-tracker-info">
                        <span class="home-tracker-title"><i class="fas fa-receipt" style="color:var(--accent);margin-right:6px;"></i>Tu Pedido</span>
                        <span class="home-tracker-order">${order.number || ''}</span>
                    </div>
                    <span class="home-tracker-time">${timeText}</span>
                </div>
                <div class="ht-steps">
                    ${stepsHTML}
                </div>
                <div class="ht-message">
                    <i class="fas fa-info-circle"></i> ${currentMsg}
                </div>
                <div class="ht-items-summary">${itemsSummary}</div>
            </div>
        `;
    }

    function renderAllProducts() {
        const cats = ['bowls', 'smoothies', 'jugos', 'shots', 'cafe', 'bebidas'];
        let html = '';

        // Active order tracker OR "Volver a disfrutar"
        if (currentUser && currentUser.phone && customerActiveOrders.length > 0) {
            // Show animated order tracker for most recent active order
            html += renderHomeOrderTracker(customerActiveOrders[0]);
        } else if (currentUser && currentUser.phone && customerOrderHistory.length > 0) {
            // No active orders → show reorder section
            const reorderItems = getReorderProducts();
            if (reorderItems.length > 0) {
                html += `
                    <div class="reorder-section">
                        <div class="reorder-header">
                            <h3><i class="fas fa-heart"></i> Volver a disfrutar</h3>
                            <p>Tus pedidos anteriores</p>
                        </div>
                        <div class="reorder-scroll">
                            ${reorderItems.map(ri => buildReorderCardHTML(ri)).join('')}
                        </div>
                    </div>
                `;
            }
        }

        cats.forEach(catKey => {
            const cat = CATEGORIES[catKey];
            let items = getMenuItems().filter(i => i.category === catKey && isProductAvailable(i.id));
            if (items.length === 0) return;
            if (SHUFFLE_CATEGORIES.includes(catKey)) items = sessionShuffle(items);
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
        bindReorderEvents();
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
        const product = getMenuItems().find(i => i.id === productId);
        return product && DIRECT_ADD_CATEGORIES.includes(product.category);
    }

    function addDirectToCart(productId) {
        const product = getMenuItems().find(i => i.id === productId);
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
        let items = getMenuItems().filter(i => i.category === category && isProductAvailable(i.id));
        if (SHUFFLE_CATEGORIES.includes(category)) items = sessionShuffle(items);
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

        const product = getMenuItems().find(i => i.id === productId);
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
        const showToppingsExtra = ['bowls', 'smoothies'].includes(product.category);
        const isSmoothie = product.category === 'smoothies';

        // Size section: only show if not onlyGrande
        let sizeSection = '';
        if (!isOnlyGrande && product.priceGrande) {
            const invData = inventoryCache[String(product.id)];
            const isMActive = invData ? invData.activeM !== false : true;
            const isGActive = invData ? invData.activeG !== false : true;
            // Auto-select: if M is disabled but G is active, pre-select G
            const mClass = `size-btn${isMActive ? ' active' : ' disabled-size'}`;
            const gClass = `size-btn${!isMActive && isGActive ? ' active' : ''}${!isGActive ? ' disabled-size' : ''}`;
            sizeSection = `
                <div class="expand-section">
                    <h4><i class="fas fa-ruler"></i> Tamaño</h4>
                    <div class="size-options">
                        <button class="${mClass}" data-size="mediano" data-price="${product.price}" ${!isMActive ? 'disabled' : ''}>
                            <span class="size-icon">M</span><span>Mediano</span><span class="size-price">$${product.price.toFixed(2)}</span>${!isMActive ? '<span class="size-agotado">Agotado</span>' : ''}
                        </button>
                        <button class="${gClass}" data-size="grande" data-price="${product.priceGrande}" ${!isGActive ? 'disabled' : ''}>
                            <span class="size-icon">G</span><span>Grande</span><span class="size-price">$${product.priceGrande.toFixed(2)}</span>${!isGActive ? '<span class="size-agotado">Agotado</span>' : ''}
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
            const showProtein = !product.noProtein; // Ocultar si el producto ya incluye proteína

            const hasMilk = usesLeche || usesLecheAlm;
            if (showProtein || hasMilk) {
                smoothieOptionsSection = `
                <div class="expand-section">
                    <h4><i class="fas fa-blender"></i> Personaliza tu Smoothie</h4>
                    ${showProtein ? `
                    <div style="margin-bottom:10px">
                        <span style="font-size:13px;color:var(--text-light);display:block;margin-bottom:6px">Agregar Proteína (+$2.50)</span>
                        <div class="expand-options-row" id="smoothie-protein-opts">
                            <label class="option-pill active" data-protein="none"><input type="radio" name="sm-protein" value="none" checked>Sin proteína <span class="option-pill-price">$0</span></label>
                            <label class="option-pill" data-protein="sascha"><input type="radio" name="sm-protein" value="sascha">💪 Proteína Sascha <span class="option-pill-price">+$2.50</span></label>
                        </div>
                    </div>` : ''}
                    ${hasMilk ? `
                    <div>
                        <span style="font-size:13px;color:var(--text-light);display:block;margin-bottom:6px">Tipo de Leche</span>
                        <div class="expand-options-row" id="smoothie-milk-opts">
                            <label class="option-pill ${usesLecheAlm ? 'active' : ''}" data-milk="almendras"><input type="radio" name="sm-milk" value="almendras" ${usesLecheAlm ? 'checked' : ''}>🌰 Leche de Almendras</label>
                            <label class="option-pill ${usesLeche ? 'active' : ''}" data-milk="entera"><input type="radio" name="sm-milk" value="entera" ${usesLeche ? 'checked' : ''}>🥛 Leche Entera</label>
                        </div>
                    </div>` : ''}
                </div>`;
            }
        }

        return `
            <div class="expand-inner">
                ${hasIngredients ? `
                <div class="expand-section expand-info-row">
                    <p class="expand-text-line"><i class="fas fa-leaf"></i> ${product.ingredients.join(' · ')}</p>
                    ${hasToppingsIncluded ? `<p class="expand-text-line"><i class="fas fa-check-circle"></i> ${product.toppings.join(' · ')}</p>` : ''}
                </div>` : ''}
                ${sizeSection}
                ${smoothieOptionsSection}
                ${toppingsExtraSection}
                <div class="expand-section">
                    <textarea class="note-input" placeholder="✏️ Nota especial (opcional)" maxlength="200" rows="1"></textarea>
                </div>
                <div class="expand-actions">
                    <div class="quantity-selector">
                        <button class="qty-btn qty-minus"><i class="fas fa-minus"></i></button>
                        <span class="qty-value">1</span>
                        <button class="qty-btn qty-plus"><i class="fas fa-plus"></i></button>
                    </div>
                    <div class="expand-total">
                        <span class="expand-total-label">Total</span>
                        <span class="expand-total-price">$${((() => { const _inv = inventoryCache[String(product.id)]; const _mOk = (!product.onlyGrande && product.priceGrande) ? (_inv ? _inv.activeM !== false : true) : true; return (!product.onlyGrande && product.priceGrande && !_mOk) ? product.priceGrande : product.price; })()).toFixed(2)}</span>
                    </div>
                    <button class="btn-add-expand">
                        <i class="fas fa-cart-plus"></i> Agregar
                    </button>
                </div>
            </div>
        `;
    }

    function bindExpandEvents(expandEl, product) {
        const isOnlyGrande = product.onlyGrande;
        const isSmoothie = product.category === 'smoothies';
        // Check size availability from inventory cache
        const _invBind = inventoryCache[String(product.id)];
        const _isMActiveBind = !isOnlyGrande && product.priceGrande ? (_invBind ? _invBind.activeM !== false : true) : true;
        const _defaultSizeIsGrande = !isOnlyGrande && product.priceGrande && !_isMActiveBind;
        let size = isOnlyGrande ? 'único' : (_defaultSizeIsGrande ? 'grande' : 'mediano');
        let currentPrice = _defaultSizeIsGrande ? product.priceGrande : product.price;
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
                if (btn.disabled) return; // Ignore disabled size buttons
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

        // Remove old listener before adding new one to prevent duplicates
        const newContainer = container.cloneNode(true);
        container.parentNode.replaceChild(newContainer, container);
        newContainer.addEventListener('click', (e) => {
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
                newContainer.querySelectorAll('.build-option').forEach(b => b.classList.remove('selected'));
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
            floatingTotal.textContent = '$' + subtotal.toFixed(2);
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
        cartSubtotal.textContent = '$' + subtotal.toFixed(2);
        cartTotal.textContent = '$' + subtotal.toFixed(2);
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

    // High demand banner helper (injected into payment modal)
    function getHighDemandBanner() {
        if (storeStatusOverride === 'alta_demanda') {
            return `<div class="high-demand-banner">
                <i class="fas fa-fire"></i>
                <span>Estamos en <strong>alta demanda</strong>. Tu pedido podría tardar un poco más de lo normal.</span>
            </div>`;
        }
        return '';
    }

    function showPaymentModal() {
        // Reset tip
        currentTip = 0;
        document.querySelectorAll('.tip-btn').forEach(b => b.classList.remove('active'));
        $('tip-custom-input').classList.add('hidden');

        renderPaymentDetail();

        const paymentModal = $('payment-modal');
        // Reset Yappy state
        $('yappy-loading').classList.add('hidden');
        $('yappy-error').classList.add('hidden');
        const btnYappy = document.querySelector('btn-yappy');
        if (btnYappy) btnYappy.isButtonLoading = false;

        // If Yappy component failed to load, show error
        if (!yappyComponentInitialized) {
            showYappyLoadError();
        }

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
        const total = subtotal + currentDeliveryFee + currentTip;

        $('payment-subtotal').textContent = '$' + subtotal.toFixed(2);
        $('payment-delivery').textContent = currentDeliveryFee > 0 ? '$' + currentDeliveryFee.toFixed(2) : 'Selecciona ubicación';
        $('payment-tip-amount').textContent = '$' + currentTip.toFixed(2);
        $('payment-total').textContent = '$' + total.toFixed(2);
    }

    function renderPaymentDetail() {
        updatePaymentTotals();

        const detailContainer = $('payment-order-detail');
        detailContainer.innerHTML = getHighDemandBanner() + cart.map(item => `
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
                    item.total = (item.basePrice * (item.sizeMultiplier || 1) + item.toppingsPrice) * item.quantity;
                } else if (btn.dataset.action === 'minus') {
                    if (item.quantity > 1) {
                        item.quantity--;
                        item.total = (item.basePrice * (item.sizeMultiplier || 1) + item.toppingsPrice) * item.quantity;
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
    // TIP SELECTION — Percent & Fixed modes
    // ========================================

    // Helper: reset all tip buttons
    function resetTipButtons() {
        document.querySelectorAll('.tip-btn').forEach(b => b.classList.remove('active'));
        $('tip-custom-input').classList.add('hidden');
    }

    // Toggle between Porcentaje / Monto Fijo modes
    document.addEventListener('click', (e) => {
        const typeBtn = e.target.closest('.tip-type-btn');
        if (!typeBtn) return;
        document.querySelectorAll('.tip-type-btn').forEach(b => b.classList.remove('active'));
        typeBtn.classList.add('active');
        const tipType = typeBtn.dataset.tipType;
        $('tip-options-percent').classList.toggle('hidden', tipType !== 'percent');
        $('tip-options-fixed').classList.toggle('hidden', tipType !== 'fixed');
        // Reset tip when switching mode
        currentTip = 0;
        resetTipButtons();
        updatePaymentTotals();
    });

    // Percentage tip buttons (data-tip-pct)
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-tip-pct]');
        if (!btn) return;
        const pct = parseFloat(btn.dataset.tipPct);
        const subtotal = cart.reduce((s, i) => s + i.total, 0);
        const tipValue = Math.round(subtotal * pct / 100 * 100) / 100;
        if (currentTip === tipValue) {
            currentTip = 0;
            resetTipButtons();
        } else {
            resetTipButtons();
            btn.classList.add('active');
            currentTip = tipValue;
        }
        updatePaymentTotals();
    });

    // Fixed amount tip buttons (data-tip, excluding "custom")
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.tip-btn[data-tip]:not([data-tip="custom"])');
        if (!btn) return;
        // Only handle if the fixed row is visible (not the custom trigger)
        if (btn.closest('.tip-options-percent') || btn.closest('.tip-options-fixed')) {
            const tipVal = parseFloat(btn.dataset.tip);
            if (currentTip === tipVal) {
                currentTip = 0;
                resetTipButtons();
            } else {
                resetTipButtons();
                btn.classList.add('active');
                currentTip = tipVal;
            }
            updatePaymentTotals();
        }
    });

    // Custom tip button
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('[data-tip="custom"]');
        if (!btn) return;
        $('tip-custom-input').classList.toggle('hidden');
        document.querySelectorAll('.tip-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        const customInput = $('tip-custom-value');
        if (customInput && !$('tip-custom-input').classList.contains('hidden')) customInput.focus();
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
                const customBtn = document.querySelector('.tip-btn-custom');
                if (customBtn) customBtn.classList.add('active');
            }
        }
    });

    // ========================================
    // DYNAMIC DELIVERY FEE (Distance-based pricing)
    // ========================================
    const STORE_LAT = 9.0141268;
    const STORE_LNG = -79.4676096;
    let currentDeliveryFee = 0;
    let deliveryDistanceKm = 0;

    // Haversine formula — distance in km between two lat/lng points
    function haversineDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Earth radius in km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon / 2) * Math.sin(dLon / 2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
        return R * c;
    }

    // PedidosYa-style tiered delivery pricing (Panama)
    function calculateDeliveryFee(distanceKm) {
        if (distanceKm <= 0) return 0;
        if (distanceKm <= 2) return 2.00;
        if (distanceKm <= 4) return 3.00;
        if (distanceKm <= 6) return 4.00;
        if (distanceKm <= 9) return 5.50;
        if (distanceKm <= 12) return 7.00;
        if (distanceKm <= 16) return 9.00;
        return 12.00; // 16+ km
    }

    // Update delivery fee based on marker position
    function updateDeliveryFeeFromMarker(lat, lng) {
        deliveryDistanceKm = haversineDistance(STORE_LAT, STORE_LNG, lat, lng);
        currentDeliveryFee = calculateDeliveryFee(deliveryDistanceKm);
        updatePaymentTotals();

        // Update delivery line with distance info
        const deliveryEl = $('payment-delivery');
        if (deliveryEl) {
            deliveryEl.textContent = '$' + currentDeliveryFee.toFixed(2);
        }
        const deliveryInfoEl = $('delivery-fee-info');
        if (deliveryInfoEl) {
            deliveryInfoEl.textContent = `${deliveryDistanceKm.toFixed(1)} km desde Xazai`;
            deliveryInfoEl.classList.remove('hidden');
        }
    }

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

        // Initialize Leaflet map centered on Xazai store
        deliveryMap = L.map(mapDiv, {
            center: [STORE_LAT, STORE_LNG],
            zoom: 14,
            zoomControl: false
        });

        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap'
        }).addTo(deliveryMap);

        // Add zoom control to bottom right
        L.control.zoom({ position: 'bottomright' }).addTo(deliveryMap);

        // Store marker icon
        const storeIcon = L.divIcon({
            className: 'store-map-marker',
            html: '<div style="background:linear-gradient(135deg,#7c3aed,#e91e8c);width:32px;height:32px;border-radius:50%;display:flex;align-items:center;justify-content:center;border:2px solid white;box-shadow:0 2px 8px rgba(0,0,0,0.3)"><i class="fas fa-store" style="font-size:14px;color:white"></i></div>',
            iconSize: [32, 32],
            iconAnchor: [16, 16]
        });
        L.marker([STORE_LAT, STORE_LNG], { icon: storeIcon }).addTo(deliveryMap)
            .bindPopup('<strong>Xazai Açaí Bar</strong><br>Punto de origen');

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

            // Calculate delivery fee from distance
            updateDeliveryFeeFromMarker(e.latlng.lat, e.latlng.lng);

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
            // Calculate delivery fee from distance
            updateDeliveryFeeFromMarker(lat, lng);
        }

        // Local database of known PHs/buildings in Panama City (coordenadas verificadas)
        const LOCAL_PLACES = [
            // === COSTA DEL ESTE ===
            { name: 'PH Vitri Tower, Costa del Este', lat: 9.0108, lng: -79.4637, aliases: ['vitri'] },
            { name: 'PH Pearl at the Sea, Costa del Este', lat: 9.0106, lng: -79.4660, aliases: ['pearl'] },
            { name: 'PH Costa View, Costa del Este', lat: 9.0132, lng: -79.4770, aliases: ['costa view'] },
            { name: 'PH Ocean Two, Costa del Este', lat: 9.0113, lng: -79.4644, aliases: ['ocean two'] },
            { name: 'PH Breeze, Costa del Este', lat: 9.0096, lng: -79.4651, aliases: ['breeze'] },
            { name: 'PH Destiny, Costa del Este', lat: 9.0102, lng: -79.4622, aliases: ['destiny costa'] },
            { name: 'PH Portovita, Costa del Este', lat: 9.0115, lng: -79.4638, aliases: ['portovita'] },
            { name: 'PH Pijao, Costa del Este', lat: 9.0098, lng: -79.4618, aliases: ['pijao'] },
            { name: 'PH Mar del Sur, Bella Vista', lat: 8.9894, lng: -79.5231, aliases: ['mar del sur'] },
            { name: 'PH Green Bay, Costa del Este', lat: 9.0135, lng: -79.4670, aliases: ['green bay'] },
            { name: 'PH Acqua, Costa del Este', lat: 9.0092, lng: -79.4615, aliases: ['acqua'] },
            { name: 'PH Pacific Village, Costa del Este', lat: 9.0140, lng: -79.4675, aliases: ['pacific village'] },
            { name: 'PH Ten Tower, Costa del Este', lat: 9.0110, lng: -79.4643, aliases: ['ten tower'] },
            { name: 'Town Center Costa del Este', lat: 9.0145, lng: -79.4680, aliases: ['town center'] },
            // === SAN FRANCISCO ===
            { name: 'PH South Coast Tower, San Francisco', lat: 8.9938, lng: -79.5051, aliases: ['south coast'] },
            { name: 'PH Oasis Tower, San Francisco', lat: 8.9927, lng: -79.5172, aliases: ['oasis'] },
            { name: 'PH Pacific Star, San Francisco', lat: 8.9900, lng: -79.5050, aliases: ['pacific star'] },
            { name: 'PH Dupont, San Francisco', lat: 8.9910, lng: -79.5040, aliases: ['dupont'] },
            { name: 'PH Midtown, San Francisco', lat: 8.9920, lng: -79.5030, aliases: ['midtown'] },
            { name: 'PH Sky, San Francisco', lat: 8.9905, lng: -79.5045, aliases: ['sky san francisco'] },
            { name: 'PH Element, San Francisco', lat: 8.9915, lng: -79.5035, aliases: ['element'] },
            { name: 'PH Q Tower, San Francisco', lat: 8.9925, lng: -79.5025, aliases: ['q tower'] },
            { name: 'PH Generation Tower, San Francisco', lat: 8.9895, lng: -79.5055, aliases: ['generation'] },
            { name: 'PH Park Loft, San Francisco', lat: 8.9930, lng: -79.5020, aliases: ['park loft'] },
            { name: 'PH Terrazas del Pacífico, San Francisco', lat: 8.9912, lng: -79.5048, aliases: ['terrazas pacifico'] },
            { name: 'PH Green House, San Francisco', lat: 8.9918, lng: -79.5038, aliases: ['green house'] },
            // === PUNTA PACIFICA ===
            { name: 'PH Pacific Point, Punta Pacífica', lat: 8.9820, lng: -79.5200, aliases: ['pacific point'] },
            { name: 'PH The Point, Punta Pacífica', lat: 8.9810, lng: -79.5195, aliases: ['the point'] },
            { name: 'PH Ocean Park, Punta Pacífica', lat: 8.9815, lng: -79.5190, aliases: ['ocean park'] },
            { name: 'PH Grand Tower, Punta Pacífica', lat: 8.9825, lng: -79.5210, aliases: ['grand tower'] },
            { name: 'PH Megapolis, Punta Pacífica', lat: 8.9830, lng: -79.5220, aliases: ['megapolis'] },
            { name: 'JW Marriott, Punta Pacífica', lat: 8.9808, lng: -79.5185, aliases: ['marriott', 'jw marriott'] },
            { name: 'Torres de las Américas, Punta Pacífica', lat: 8.9822, lng: -79.5205, aliases: ['torres americas'] },
            { name: 'Multiplaza Pacific, Punta Pacífica', lat: 8.9835, lng: -79.5230, aliases: ['multiplaza'] },
            { name: 'Soho Mall, Obarrio', lat: 8.9850, lng: -79.5260, aliases: ['soho mall'] },
            // === AV. BALBOA / BELLA VISTA / CINTA COSTERA ===
            { name: 'PH Oasis on the Bay, Av. Balboa', lat: 8.9750, lng: -79.5280, aliases: ['oasis bay', 'oasis on the bay'] },
            { name: 'PH Yoo Panama, Av. Balboa', lat: 8.9755, lng: -79.5275, aliases: ['yoo panama', 'yoo'] },
            { name: 'PH White Tower, Av. Balboa', lat: 8.9760, lng: -79.5260, aliases: ['white tower'] },
            { name: 'PH Rivage, Av. Balboa', lat: 8.9745, lng: -79.5290, aliases: ['rivage'] },
            { name: 'PH Arts Tower, Av. Balboa', lat: 8.9758, lng: -79.5265, aliases: ['arts tower'] },
            { name: 'PH Bay View, Av. Balboa', lat: 8.9748, lng: -79.5285, aliases: ['bay view', 'bayview'] },
            { name: 'Destiny Tower, Calidonia', lat: 8.9677, lng: -79.5331, aliases: ['destiny tower', 'destiny calidonia'] },
            { name: 'Parque Urraca, Bella Vista', lat: 8.9790, lng: -79.5310, aliases: ['parque urracá', 'urraca'] },
            // === EL CANGREJO / OBARRIO ===
            { name: 'PH Scala, El Cangrejo', lat: 8.9830, lng: -79.5350, aliases: ['scala'] },
            { name: 'PH Titanium, Parque Lefevre', lat: 8.9835, lng: -79.5340, aliases: ['titanium'] },
            { name: 'Tower Financial Center, Obarrio', lat: 8.9840, lng: -79.5345, aliases: ['financial center', 'tower financial'] },
            // === MALLS ===
            { name: 'Albrook Mall, Albrook', lat: 9.0060, lng: -79.5540, aliases: ['albrook mall', 'albrook'] },
            { name: 'MetroMall, Vía España', lat: 9.0005, lng: -79.5100, aliases: ['metromall', 'metro mall'] },
            { name: 'Altaplaza Mall, Condado del Rey', lat: 9.0370, lng: -79.5150, aliases: ['altaplaza'] },
            // === OTROS ===
            { name: 'Ciudad del Saber, Clayton', lat: 9.0190, lng: -79.5650, aliases: ['ciudad del saber', 'clayton'] },
            { name: 'Santa María Golf, Brisas del Golf', lat: 9.0370, lng: -79.4710, aliases: ['santa maria golf'] },
            { name: 'Universidad de Panamá, El Cangrejo', lat: 9.0005, lng: -79.5316, aliases: ['universidad panama', 'up'] },
            { name: 'Hospital Nacional, Bella Vista', lat: 8.9842, lng: -79.5268, aliases: ['hospital nacional'] },
            { name: 'Hospital Punta Pacífica', lat: 8.9813, lng: -79.5198, aliases: ['hospital punta pacifica', 'johns hopkins'] },
            { name: 'Aeropuerto Marcos A. Gelabert, Albrook', lat: 9.0060, lng: -79.5560, aliases: ['marcos gelabert', 'aeropuerto albrook'] },
            { name: 'Cinta Costera, Av. Balboa', lat: 8.9700, lng: -79.5350, aliases: ['cinta costera'] },
            { name: 'Corredor Sur, Panamá', lat: 9.0030, lng: -79.4900, aliases: ['corredor sur'] },
        ];

        function searchLocalPlaces(query) {
            const q = query.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s]/g, '');
            const words = q.split(/\s+/).filter(w => w.length > 1);
            if (words.length === 0) return [];
            // Score each place by how many words match + bonus for exact phrase match
            const scored = LOCAL_PLACES.map(p => {
                const name = p.name.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9\s,]/g, '');
                const aliases = (p.aliases || []).map(a => a.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, ''));
                let score = 0;
                const matchCount = words.filter(w => name.includes(w) || aliases.some(a => a.includes(w))).length;
                score = matchCount / words.length;
                // Bonus for exact phrase
                if (name.includes(q)) score += 0.5;
                if (aliases.some(a => a.includes(q))) score += 0.5;
                return { ...p, score };
            }).filter(p => p.score >= 0.5).sort((a, b) => b.score - a.score);
            return scored.slice(0, 5);
        }

        function performSearch(query) {
            if (!query || query.length < 3) { hideSuggestions(); return; }

            const sDiv = createSuggestionsDiv();
            sDiv.innerHTML = '<div class="map-suggestion-item" style="color:var(--text-light);cursor:default;"><i class="fas fa-spinner fa-spin"></i> Buscando...</div>';
            sDiv.classList.remove('hidden');

            // Search with Nominatim (Panama) + Photon fallback (location-biased)
            const nominatimUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(query + ', Panamá')}&limit=5&addressdetails=1&viewbox=-79.62,9.06,-79.40,8.92&bounded=0&countrycodes=pa`;
            const photonUrl = `https://photon.komoot.io/api/?q=${encodeURIComponent(query + ' Panama')}&limit=5&lat=${STORE_LAT}&lon=${STORE_LNG}`;

            // Search local PHs first (instant)
            const localResults = searchLocalPlaces(query).map(p => ({
                lat: p.lat, lng: p.lng, name: p.name, local: true
            }));

            // Try both APIs in parallel and merge results
            Promise.allSettled([
                fetch(nominatimUrl).then(r => r.json()),
                fetch(photonUrl).then(r => r.json())
            ]).then(([nominatimRes, photonRes]) => {
                let results = [...localResults]; // Local results first

                // Parse Nominatim results
                if (nominatimRes.status === 'fulfilled' && nominatimRes.value.length > 0) {
                    nominatimRes.value.forEach(r => {
                        const isDuplicate = results.some(ex => Math.abs(ex.lat - parseFloat(r.lat)) < 0.002 && Math.abs(ex.lng - parseFloat(r.lon)) < 0.002);
                        if (!isDuplicate) {
                            results.push({ lat: parseFloat(r.lat), lng: parseFloat(r.lon), name: r.display_name });
                        }
                    });
                }

                // Parse Photon results and add non-duplicates
                if (photonRes.status === 'fulfilled' && photonRes.value.features) {
                    photonRes.value.features.forEach(f => {
                        const plat = f.geometry.coordinates[1];
                        const plng = f.geometry.coordinates[0];
                        // Only add if not too far from Panama City and not duplicate
                        if (Math.abs(plat - STORE_LAT) < 0.3 && Math.abs(plng - STORE_LNG) < 0.3) {
                            const pname = [f.properties.name, f.properties.street, f.properties.district, f.properties.city].filter(Boolean).join(', ');
                            const isDuplicate = results.some(r => Math.abs(r.lat - plat) < 0.002 && Math.abs(r.lng - plng) < 0.002);
                            if (!isDuplicate && pname) {
                                results.push({ lat: plat, lng: plng, name: pname });
                            }
                        }
                    });
                }

                // Limit to 6 results
                results = results.slice(0, 6);

                if (results.length === 0) {
                    sDiv.innerHTML = '<div class="map-suggestion-item" style="color:var(--text-light);cursor:default;padding:10px 12px;line-height:1.4;"><i class="fas fa-info-circle"></i> Sin resultados. Busca por barrio o calle, o toca directamente en el mapa tu ubicación</div>';
                    sDiv.classList.remove('hidden');
                    return;
                }

                    sDiv.innerHTML = results.map(r => {
                        const shortName = r.name.length > 80 ? r.name.substring(0, 80) + '...' : r.name;
                        const icon = r.local ? 'fa-building' : 'fa-map-marker-alt';
                        return `<div class="map-suggestion-item" data-lat="${r.lat}" data-lng="${r.lng}" data-name="${r.name.replace(/"/g, '&quot;')}">
                            <i class="fas ${icon}"></i>
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
                }).catch(() => hideSuggestions());
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

                    // Calculate delivery fee from user location
                    updateDeliveryFeeFromMarker(latitude, longitude);

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

    // ========================================
    // YAPPY V2 WEB COMPONENT INTEGRATION
    // ========================================
    let yappyCurrentOrderId = null;

    let yappyComponentInitialized = false;
    function setupYappyWebComponent() {
        if (yappyComponentInitialized) return;
        const btnYappy = document.querySelector("btn-yappy");
        if (!btnYappy) {
            console.warn('Yappy web component not found');
            return;
        }
        yappyComponentInitialized = true;

        // Check if Yappy channel is online
        btnYappy.addEventListener('isYappyOnline', (event) => {
            console.log('Yappy online status:', event.detail);
            if (event.detail === false || event.detail === 'false') {
                showToast('Yappy no está disponible en este momento', 'warning');
            }
        });

        // Event: Click on Yappy button
        btnYappy.addEventListener('eventClick', async () => {
            // Validate delivery location on map
            if (!mapMarker || currentDeliveryFee <= 0) {
                showToast('Selecciona tu ubicación de entrega en el mapa', 'error');
                const mapEl = $('map-container');
                if (mapEl) mapEl.scrollIntoView({ behavior: 'smooth' });
                return;
            }
            // Validate delivery address
            const deliveryAddress = $('delivery-address') ? $('delivery-address').value.trim() : '';
            if (!deliveryAddress) {
                showToast('Por favor ingresa tu dirección de entrega', 'error');
                if ($('delivery-address')) $('delivery-address').focus();
                return;
            }

            // Get Yappy phone number (required by API)
            // Strip non-digits and remove Panama country code (+507 or 507)
            let yappyPhone = (currentUser && currentUser.phone) ? currentUser.phone.replace(/\D/g, '') : '';
            if (yappyPhone.startsWith('507') && yappyPhone.length > 8) {
                yappyPhone = yappyPhone.substring(3);
            }
            if (!yappyPhone || yappyPhone.length < 7) {
                showToast('Ingresa tu número de teléfono para pagar con Yappy', 'error');
                return;
            }

            // Prepare order data
            const subtotal = cart.reduce((s, i) => s + i.total, 0);
            const deliveryFee = currentDeliveryFee;
            const total = subtotal + deliveryFee + currentTip;
            orderCounter++;
            localStorage.setItem('xazai_orderCounter', orderCounter);
            const orderId = `XZ-${orderCounter}`;
            yappyCurrentOrderId = orderId;

            // Show loading
            $('yappy-loading').classList.remove('hidden');
            $('yappy-error').classList.add('hidden');
            btnYappy.isButtonLoading = true;

            try {
                // Call our backend which makes the 2 Yappy API calls
                // Yappy validates: subtotal + taxes - discount = total
                // So we send subtotal = total (delivery fee + tip included)
                // aliasYappy (phone) is required by Yappy V2 API
                const response = await fetch('/api/create-payment', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        orderId: orderId,
                        total: total,
                        subtotal: total,
                        taxes: 0,
                        discount: 0,
                        phone: yappyPhone
                    })
                });

                const result = await response.json();
                console.log('Yappy create-payment response:', result);

                if (result.details) console.log('Yappy error details:', result.details);

            if (result.status && result.transactionId && result.token && result.documentName) {
                    // Save pending order
                    localStorage.setItem('xazai_pending_order', JSON.stringify({
                        orderId, cart: [...cart], deliveryAddress, total, subtotal
                    }));

                    // Save order to Firestore as waiting for payment (non-blocking)
                    try {
                        saveOrderToFirestore(orderId, deliveryAddress, 'esperando_pago', total, subtotal, currentTip, deliveryFee);
                    } catch (fsErr) {
                        console.error('Firestore save error (non-blocking):', fsErr);
                    }

                    // Hand off data to the web component — it opens the Yappy payment modal
                    btnYappy.eventPayment({
                        transactionId: result.transactionId,
                        documentName: result.documentName,
                        token: result.token
                    });

                    // Hide XAZAI payment modal so Yappy modal takes full screen
                    $('payment-modal').classList.add('yappy-active');
                    $('yappy-loading').classList.add('hidden');
                } else {
                    // Show error from backend
                    $('yappy-loading').classList.add('hidden');
                    $('yappy-error').classList.remove('hidden');
                    $('yappy-error-msg').textContent = result.error || 'Error al crear orden en Yappy';
                    btnYappy.isButtonLoading = false;
                }
            } catch (err) {
                console.error('Yappy payment error:', err);
                $('yappy-loading').classList.add('hidden');
                $('yappy-error').classList.remove('hidden');
                $('yappy-error-msg').textContent = 'Error de conexión. Verifica tu internet.';
                btnYappy.isButtonLoading = false;
            }
        });

        // Event: Payment successful
        btnYappy.addEventListener("eventSuccess", (event) => {
            console.log("Yappy pago exitoso:", event.detail);
            const orderId = yappyCurrentOrderId || `XZ-${orderCounter}`;

            // Clear cart and reset session state
            cart = [];
            scheduledSlot = null;
            currentTip = 0;
            currentDeliveryFee = 0;
            deliveryDistanceKm = 0;
            if (mapMarker && typeof deliveryMap !== 'undefined' && deliveryMap) { try { deliveryMap.removeLayer(mapMarker); } catch(e){} }
            mapMarker = null;
            const addrInput = $('delivery-address');
            if (addrInput) addrInput.value = '';
            updateCartUI();
            localStorage.removeItem('xazai_pending_order');

            // Restore and close payment modal, show confirmation
            $('payment-modal').classList.remove('yappy-active');
            closePaymentModal();
            orderNumber.textContent = orderId;
            confirmationOverlay.classList.remove('hidden');
            showToast('¡Pago confirmado con Yappy!', 'success');

            // Update Firestore: mark as paid + decrement inventory NOW that payment is confirmed
            updateOrderPaymentStatusAndDecrement(orderId);
            yappyCurrentOrderId = null;
            btnYappy.isButtonLoading = false;
        });

        // Event: Payment failed/error
        btnYappy.addEventListener("eventError", (event) => {
            console.log("Yappy pago fallido:", event.detail);
            $('payment-modal').classList.remove('yappy-active');
            $('yappy-loading').classList.add('hidden');
            $('yappy-error').classList.remove('hidden');
            $('yappy-error-msg').textContent = 'El pago no se completó. Intenta de nuevo.';
            showToast('El pago no se completó. Intenta de nuevo.', 'warning');
            btnYappy.isButtonLoading = false;
            // Cancel the orphaned order to prevent ghost orders
            cancelOrphanedYappyOrder(yappyCurrentOrderId);
            yappyCurrentOrderId = null;
        });

        console.log('Yappy V2 web component initialized');
    }

    function showYappyLoadError() {
        const container = $('yappy-btn-container');
        if (!container) return;
        const btnYappy = document.querySelector('btn-yappy');
        if (btnYappy) btnYappy.style.display = 'none';
        const errorDiv = document.createElement('div');
        errorDiv.className = 'yappy-error';
        errorDiv.innerHTML = `
            <i class="fas fa-exclamation-circle"></i>
            <span>No se pudo cargar Yappy. </span>
            <button onclick="location.reload()" style="
                background:none; border:1px solid #ff6b7a; color:#ff6b7a;
                padding:4px 12px; border-radius:6px; cursor:pointer; font-size:13px; margin-left:8px;
            ">Reintentar</button>
        `;
        container.appendChild(errorDiv);
    }

    function saveOrderToFirestore(orderId, address, status, total, subtotal, tipAmount, deliveryAmount) {
        if (typeof db === 'undefined') return;
        const deliveryFee = deliveryAmount;
        // Sanitize cart items to remove any undefined values
        const sanitizedItems = cart.map(i => ({
            name: i.name || '',
            quantity: i.quantity || 1,
            price: i.basePrice || i.price || 0,
            total: i.total || 0,
            emoji: i.emoji || '',
            size: i.size || '',
            toppings: i.toppings || [],
            note: i.note || '',
            productId: i.productId || null
        }));
        // Clean scheduledSlot — Firestore rejects undefined values
        const cleanSlot = scheduledSlot ? {
            value: scheduledSlot.value || '',
            label: scheduledSlot.label || '',
            time: scheduledSlot.time || ''
        } : null;
        db.collection('orders').add({
            number: orderId,
            items: sanitizedItems,
            subtotal: subtotal || cart.reduce((s, i) => s + i.total, 0),
            delivery: deliveryFee,
            deliveryDistance: deliveryDistanceKm || 0,
            tip: tipAmount || 0,
            total: total || (cart.reduce((s, i) => s + i.total, 0) + deliveryFee + (tipAmount || 0)),
            status: status,
            paymentMethod: 'yappy',
            paymentConfirmed: false,
            customerName: currentUser ? (currentUser.name || 'Invitado') : 'Invitado',
            customerPhone: currentUser ? (currentUser.phone || '') : '',
            address: address || '',
            scheduledSlot: cleanSlot,
            deviceType: detectDeviceType(),
            date: new Date().toLocaleDateString('es-PA'),
            inventoryDecremented: false,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        }).then((docRef) => {
            console.log(`Order ${orderId} saved to Firestore (awaiting payment)`);
            // DO NOT decrement inventory or upsert customer here — wait until payment is confirmed
        }).catch(err => {
            console.error('Error saving order:', err);
        });
    }

    function updateOrderPaymentStatusAndDecrement(orderId) {
        if (typeof db === 'undefined') return;
        db.collection('orders').where('number', '==', orderId).get().then(snap => {
            snap.forEach(doc => {
                const order = doc.data();
                // First update status and payment confirmation (without inventoryDecremented flag yet)
                doc.ref.update({
                    status: 'pendiente',
                    paymentConfirmed: true,
                    paymentDate: new Date()
                });
                // Decrement inventory, then mark flag only on success
                const items = order.items || [];
                decrementInventoryOnSale(items.map(i => ({ name: i.name, productId: i.productId, qty: i.quantity || 1 })));
                // Mark inventoryDecremented after decrement call (best-effort)
                doc.ref.update({ inventoryDecremented: true });
                // Track customer AFTER payment confirmed
                if (order.customerPhone) {
                    upsertCustomer(order.customerPhone, order.customerName, order.total || 0, 'online', order.address || '');
                }
            });
        }).catch(err => console.error('Error updating payment status:', err));
    }

    function cancelOrphanedYappyOrder(orderId) {
        if (typeof db === 'undefined' || !orderId) return;
        db.collection('orders').where('number', '==', orderId).get().then(snap => {
            snap.forEach(doc => {
                doc.ref.update({ status: 'cancelado', cancelReason: 'Pago Yappy fallido/abandonado' });
            });
        }).catch(err => console.error('Error cancelling orphaned Yappy order:', err));
    }

    // Initialize Yappy: wait for custom element registration (up to 15s for slow mobile)
    (function initYappyWithRetry() {
        const MAX_WAIT_MS = 15000;
        const startTime = Date.now();

        if (window.customElements && window.customElements.whenDefined) {
            const timeout = new Promise((_, reject) =>
                setTimeout(() => reject(new Error('timeout')), MAX_WAIT_MS)
            );
            Promise.race([customElements.whenDefined('btn-yappy'), timeout])
                .then(() => {
                    console.log('btn-yappy defined after', Date.now() - startTime, 'ms');
                    setupYappyWebComponent();
                })
                .catch(() => {
                    console.error('Yappy component did not load in', MAX_WAIT_MS, 'ms');
                    showYappyLoadError();
                });
        } else {
            // Fallback: poll every 500ms for browsers without customElements
            let attempts = 0;
            const poll = setInterval(() => {
                attempts++;
                const el = document.querySelector('btn-yappy');
                if (el && typeof el.eventPayment === 'function') {
                    clearInterval(poll);
                    setupYappyWebComponent();
                } else if (attempts >= 30) {
                    clearInterval(poll);
                    showYappyLoadError();
                }
            }, 500);
        }
    })();

    function processOrderDirect() {
        // Process order and save to Firestore
        if (cart.length === 0) return;
        // Validate delivery location on map
        if (!mapMarker || currentDeliveryFee <= 0) {
            showToast('Selecciona tu ubicación de entrega en el mapa', 'error');
            const mapEl = $('map-container');
            if (mapEl) mapEl.scrollIntoView({ behavior: 'smooth' });
            return;
        }
        const deliveryAddress = $('delivery-address') ? $('delivery-address').value.trim() : '';
        if (!deliveryAddress) {
            showToast('Por favor ingresa tu dirección de entrega', 'error');
            if ($('delivery-address')) $('delivery-address').focus();
            return;
        }
        orderCounter++;
        localStorage.setItem('xazai_orderCounter', orderCounter);
        const subtotal = cart.reduce((s, i) => s + i.total, 0);
        const deliveryFee = currentDeliveryFee;
        const orderNum = `XZ-${orderCounter}`;
        const orderData = {
            number: orderNum,
            customerName: currentUser ? currentUser.name : 'Invitado',
            customerPhone: currentUser ? (currentUser.phone || '') : '',
            items: cart.map(i => ({ productId: i.productId || null, name: i.name, emoji: i.emoji, size: i.size, quantity: i.quantity, price: i.basePrice || i.price || 0, toppings: i.toppings || [], note: i.note || '', total: i.total })),
            subtotal, delivery: deliveryFee, deliveryDistance: deliveryDistanceKm, tip: currentTip,
            total: subtotal + deliveryFee + currentTip,
            address: deliveryAddress,
            paymentMethod: 'efectivo',
            scheduledSlot: scheduledSlot ? { value: scheduledSlot.value || '', label: scheduledSlot.label || '', time: scheduledSlot.time || '' } : null,
            date: new Date().toLocaleDateString('es-PA'),
            status: 'pendiente',
            deviceType: detectDeviceType(),
            inventoryDecremented: true,
            createdAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        // Save to Firestore
        if (typeof db !== 'undefined') {
            db.collection('orders').add(orderData).then(() => {
                // FIX #6: Decrement inventory and track customer for direct/cash orders too
                decrementInventoryOnSale(orderData.items.map(i => ({ productId: i.productId, name: i.name, qty: i.quantity || 1 })));
                const custPhone = currentUser ? (currentUser.phone || '') : '';
                const custName = currentUser ? (currentUser.name || 'Invitado') : 'Invitado';
                if (custPhone) {
                    upsertCustomer(custPhone, custName, orderData.total, 'online', deliveryAddress || '');
                }
            }).catch(err => console.error('Error saving order:', err));
        }

        // Also keep local
        orders.push({ id: orderCounter, ...orderData, date: new Date().toLocaleString('es-ES') });

        orderNumber.textContent = orderNum;
        cart = [];
        scheduledSlot = null;
        currentTip = 0;
        currentDeliveryFee = 0;
        deliveryDistanceKm = 0;
        if (mapMarker && typeof deliveryMap !== 'undefined' && deliveryMap) { try { deliveryMap.removeLayer(mapMarker); } catch(e){} }
        mapMarker = null;
        const addrInput = $('delivery-address');
        if (addrInput) addrInput.value = '';
        updateCartUI();
        closePaymentModal();
        if (!cartSidebar.classList.contains('hidden')) toggleCart();
        confirmationOverlay.classList.remove('hidden');
    }

    btnCheckout.addEventListener('click', handleCheckout);
    floatingCheckoutBtn.addEventListener('click', handleCheckout);
    btnConfirmOk.addEventListener('click', () => {
        confirmationOverlay.classList.add('hidden');
        // Navigate to Home after placing order so customer sees the order tracker
        if (currentUser && currentUser.phone && currentUser.role !== 'admin') {
            showMisPedidosTab();
            // Start listener if needed
            if (!customerOrdersUnsubscribe) {
                startCustomerOrdersListener(currentUser.phone);
            }
            // Also reload history for reorder section
            loadCustomerOrderHistory(currentUser.phone);
            // Go to Home (Inicio) to see the order tracker
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            const inicioTab = document.querySelector('.tab[data-category="inicio"]');
            if (inicioTab) inicioTab.classList.add('active');
            renderCategory('inicio');
            // Scroll to top so the tracker is visible
            window.scrollTo({ top: 0, behavior: 'smooth' });
        }
    });

    // Payment modal events (delegated - elements created in HTML)
    // Note: Yappy button is now handled by the web component (setupYappyWebComponent)
    document.addEventListener('click', (e) => {
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
    let mesasUnsubscribe = null;
    let mesasData = [];
    let currentMesa = null;
    let currentDinerIdx = 0;
    let mesaPayTip = 0;
    let mesaPayMethod = 'efectivo';
    let mesaPayDinerIdx = null; // null = pagar toda la mesa
    let mesaPayDiscount = 0; // discount percentage for mesa payment
    // Expenses state (hoisting fix)
    let expenseImageBase64 = '';
    // Dashboard state (hoisting fix)
    let dashRangeMode = 'day';
    let dashRefDate = new Date();
    // RRHH state (hoisting fix)
    let rrhhRoles = [];
    let rrhhCollaborators = [];
    let rrhhEditingRoleId = null;
    let rrhhEditingCollabId = null;
    let rrhhClockInterval = null;
    let rrhhCameraStream = null;
    let rrhhCameraMode = null;
    let rrhhCameraTargetId = null;
    let rrhhReportRange = 'today';
    // Attendance state (hoisting fix)
    let attScanStream = null;
    let attScanType = 'entrada';
    let attClockInterval = null;
    let attScanClockInterval = null;
    // RRHH constants (hoisting fix)
    const RRHH_PERMISSIONS = [
        { key: 'gestionar_usuarios', label: 'Gestionar Usuarios', icon: 'fa-users-cog' },
        { key: 'gestionar_roles', label: 'Gestionar Roles', icon: 'fa-user-shield' },
        { key: 'ver_reportes', label: 'Ver Reportes', icon: 'fa-chart-bar' },
        { key: 'registrar_asistencia', label: 'Registrar Asistencia', icon: 'fa-fingerprint' },
        { key: 'ver_asistencia', label: 'Ver Asistencia', icon: 'fa-clipboard-list' },
        { key: 'editar_colaboradores', label: 'Editar Colaboradores', icon: 'fa-user-edit' }
    ];
    const DEFAULT_ROLES = [
        { name: 'Administrador', color: '#7b2d8e', permissions: ['gestionar_usuarios','gestionar_roles','ver_reportes','registrar_asistencia','ver_asistencia','editar_colaboradores'], isDefault: true },
        { name: 'Supervisor', color: '#5bc0de', permissions: ['gestionar_usuarios','ver_reportes','registrar_asistencia','ver_asistencia'], isDefault: true },
        { name: 'Colaborador', color: '#5cb85c', permissions: ['registrar_asistencia'], isDefault: true }
    ];
    let posCart = [];
    let posPaymentMethod = 'efectivo';
    let posTipAmount = 0;
    let posDiscountPercent = 0;
    let posDeliveryAmount = 0;
    let todaySales = [];
    let posCustomerInfo = null; // { name, phone } asociado a la venta POS
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
        initRRHH();
        initAttendance();
        // Start menu listener early so Firestore products are available for POS/Mesas
        if (!menuUnsubscribe) startMenuListener();
    }

    function exitAdminMode() {
        adminMode = false;
        localStorage.removeItem('xazai_admin_email');
        // Stop listeners
        if (ordersUnsubscribe) { ordersUnsubscribe(); ordersUnsubscribe = null; }
        if (mesasUnsubscribe) { mesasUnsubscribe(); mesasUnsubscribe = null; }
        if (menuUnsubscribe) { menuUnsubscribe(); menuUnsubscribe = null; }
        stopRRHHClock();
        stopAttClock();
        closeAttendanceScan();
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
        if (section === 'comportamiento') loadBehaviorAnalytics();
        if (section === 'rrhh') { loadRRHHRoles(); loadRRHHCollaborators(); }
        if (section === 'asistencia') { startAttClock(); loadRRHHCollaborators(); }
        if (section !== 'asistencia') stopAttClock();
        if (section === 'mesas') initMesas();
        if (section === 'menu') initMenuAdmin();
        if (section === 'usuarios') loadCustomers();
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
        const filtered = filterStatus === 'all'
            ? firestoreOrders.filter(o => !['entregado', 'cancelado'].includes(o.status))
            : firestoreOrders.filter(o => o.status === filterStatus);

        if (!filtered.length) {
            container.innerHTML = '<p class="no-orders">No hay pedidos</p>';
            return;
        }

        const canCancel = (status) => !['entregado', 'cancelado', 'en_camino'].includes(status);

        const adminStatusLabels = {
            esperando_pago: '⏳ Esperando Pago', pendiente: 'Pendiente', preparando: 'Preparando', listo: 'Listo',
            en_camino: 'En Camino', entregado: 'Entregado', cancelado: 'Cancelado'
        };

        container.innerHTML = filtered.map(order => {
            const items = order.items || [];
            const dateStr = order.createdAt ? new Date(order.createdAt.seconds * 1000).toLocaleString('es-PA') : '';
            const isNew = order.status === 'pendiente';
            return `
            <div class="order-card ${isNew ? 'order-new' : ''}">
                <div class="order-header">
                    <div><strong>${order.number || order.id}</strong><span class="order-date">${dateStr}</span></div>
                    <span class="order-status status-${order.status}">${adminStatusLabels[order.status] || order.status}</span>
                </div>
                <div class="order-customer-info">
                    <span class="order-customer-name"><i class="fas fa-user"></i> ${order.customerName || 'Invitado'}</span>
                    ${order.customerPhone ? `<span class="order-customer-phone"><i class="fas fa-phone"></i> ${order.customerPhone}</span>` : ''}
                    ${order.address ? `<span class="order-customer-address"><i class="fas fa-map-marker-alt"></i> ${order.address}</span>` : ''}
                </div>
                <div class="order-items-list">
                    ${items.map(item => `<div class="order-item-line"><span>${item.emoji || ''} ${item.name} x${item.quantity || item.qty || 1} (${item.size || ''})</span><span>$${(item.total || 0).toFixed(2)}</span></div>${item.note ? `<div class="order-item-note"><i class="fas fa-sticky-note"></i> ${item.note}</div>` : ''}`).join('')}
                </div>
                <div class="order-total-line">
                    <span>Total: <strong>$${(order.total || 0).toFixed(2)}</strong></span>
                    <span>${order.paymentMethod || ''}</span>
                </div>
                ${order.status === 'cancelado' && order.cancelReason ? `<div class="order-cancel-reason"><i class="fas fa-ban"></i> ${order.cancelReason}</div>` : ''}
                <div class="order-actions">
                    ${order.status === 'esperando_pago' ? `<span style="color:#ff6b6b;font-size:12px"><i class="fas fa-clock"></i> Pago Yappy no confirmado</span>` : ''}
                    ${order.status === 'pendiente' ? `<button class="order-action-btn btn-preparando" data-order-id="${order.id}">Preparando</button>` : ''}
                    ${order.status === 'preparando' ? `<button class="order-action-btn btn-listo" data-order-id="${order.id}">Listo</button>` : ''}
                    ${order.status === 'listo' ? `<button class="order-action-btn btn-encamino" data-order-id="${order.id}">En Camino</button>` : ''}
                    ${order.status === 'en_camino' ? `<button class="order-action-btn btn-entregado" data-order-id="${order.id}">Entregado</button>` : ''}
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
                else if (btn.classList.contains('btn-encamino')) newStatus = 'en_camino';
                else if (btn.classList.contains('btn-entregado')) newStatus = 'entregado';
                if (newStatus && orderId) {
                    db.collection('orders').doc(orderId).update({ status: newStatus })
                        .then(() => {
                            showToast(`Pedido actualizado: ${newStatus}`, 'success');
                            // FIX #1: When delivered, create a sales record so it counts in dashboard
                            if (newStatus === 'entregado') {
                                convertOrderToSale(orderId);
                            }
                        })
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
                    // FIX #5: Restore inventory on cancel
                    restoreInventoryOnCancel(orderId);
                }).catch(err => showToast('Error cancelando pedido', 'warning'));
            });
        });
    }

    // FIX #1: Convert a delivered online order into a sales record for the dashboard
    function convertOrderToSale(orderId) {
        db.collection('orders').doc(orderId).get().then(doc => {
            if (!doc.exists) return;
            const order = doc.data();
            // Don't duplicate if already converted
            if (order.convertedToSale) return;
            const items = (order.items || []).map(i => ({
                productId: i.productId || null,
                name: i.name || '', emoji: i.emoji || '', qty: i.quantity || i.qty || 1,
                price: i.price || 0, size: i.size || '',
                toppings: i.toppings || [],
                note: i.note || '',
                total: i.total || (i.price || 0) * (i.quantity || i.qty || 1)
            }));
            const subtotal = order.subtotal || items.reduce((s, i) => s + i.total, 0);
            const tip = order.tip || 0;
            const delivery = order.delivery || 0;
            const total = order.total || (subtotal + tip + delivery);
            const sale = {
                items,
                subtotal,
                discount: 0,
                discountAmount: 0,
                tip,
                delivery,
                total,
                paymentMethod: order.paymentMethod || 'efectivo',
                paymentDetails: order.paymentDetails || {},
                source: 'online',
                orderNumber: order.number || '',
                customerName: order.customerName || '',
                customerPhone: order.customerPhone || '',
                address: order.address || '',
                deviceType: order.deviceType || '',
                createdAt: order.createdAt || firebase.firestore.FieldValue.serverTimestamp(),
                date: order.createdAt ? new Date(order.createdAt.seconds * 1000).toLocaleDateString('es-PA') : new Date().toLocaleDateString('es-PA')
            };
            // Use batch to make sale creation + order flag update atomic
            const batch = db.batch();
            const saleRef = db.collection('sales').doc();
            batch.set(saleRef, sale);
            batch.update(db.collection('orders').doc(orderId), { convertedToSale: true });
            batch.commit().then(() => {
                loadTodaySales();
            });
        }).catch(err => console.error('convertOrderToSale error:', err));
    }

    // FIX #5: Restore inventory when an order is cancelled
    function restoreInventoryOnCancel(orderId) {
        db.collection('orders').doc(orderId).get().then(doc => {
            if (!doc.exists) return;
            const order = doc.data();
            // Only restore if inventory was actually decremented for this order
            if (!order.inventoryDecremented) return;
            const items = order.items || [];
            if (!items.length) return;
            const batch = db.batch();
            let hasUpdates = false;
            items.forEach(item => {
                // Skip toppings — they don't have product-level stock
                if (typeof item.productId === 'string' && item.productId.startsWith('t')) return;
                const qty = item.quantity || item.qty || 1;
                // Match by productId first, then fall back to name
                let product = null;
                if (item.productId) {
                    product = getMenuItems().find(p => String(p.id) === String(item.productId));
                }
                if (!product) {
                    product = getMenuItems().find(p => p.name === item.name);
                }
                if (!product) return;
                const invRef = db.collection('inventory').doc(String(product.id));
                const cached = inventoryCache[String(product.id)];
                if (cached && cached.stockQty !== undefined) {
                    const newStock = cached.stockQty + qty;
                    batch.set(invRef, { stockQty: newStock }, { merge: true });
                    inventoryCache[String(product.id)].stockQty = newStock;
                    hasUpdates = true;
                }
            });
            if (hasUpdates) {
                // Mark order so it can't be double-restored
                batch.update(db.collection('orders').doc(orderId), { inventoryDecremented: false });
                batch.commit().catch(err => console.error('restoreInventory error:', err));
            }
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

    function renderInventory(sizeFilter = 'all') {
        const container = $('inventory-list');
        const allItems = getMenuItems();
        // Filtrar por tamaño según selección
        let filteredItems = allItems;
        if (sizeFilter === 'medio') filteredItems = allItems.filter(i => !i.priceGrande && !i.onlyGrande);
        if (sizeFilter === 'both') filteredItems = allItems.filter(i => i.priceGrande && !i.onlyGrande);
        if (sizeFilter === 'grande') filteredItems = allItems.filter(i => i.onlyGrande);
        container.innerHTML = filteredItems.map(item => {
            const inv = inventoryCache[String(item.id)];
            const isActive = inv ? inv.active !== false : true;
            // Use stockQty (auto-decrement field) for display, fallback to qty
            const stockQty = inv && inv.stockQty !== undefined ? inv.stockQty : (inv && inv.qty !== undefined ? inv.qty : null);
            const isDualSize = item.priceGrande && !item.onlyGrande;
            const invM = isDualSize ? (inv ? inv.activeM !== false : true) : true;
            const invG = isDualSize ? (inv ? inv.activeG !== false : true) : true;

            const priceDisplay = isDualSize
                ? `<div class="inventory-prices">
                        <span class="inv-price-tag">M $${item.price.toFixed(2)}</span>
                        <span class="inv-price-tag">G $${item.priceGrande.toFixed(2)}</span>
                   </div>`
                : `<span class="inventory-price">$${item.price.toFixed(2)}</span>`;

            const sizeToggles = isDualSize
                ? `<div class="inventory-size-toggles">
                        <div class="inv-size-toggle-row">
                            <span>M</span>
                            <label class="toggle-switch toggle-sm">
                                <input type="checkbox" data-product-id="${item.id}" data-size="M" ${invM ? 'checked' : ''}>
                                <span class="toggle-slider"></span>
                            </label>
                        </div>
                        <div class="inv-size-toggle-row">
                            <span>G</span>
                            <label class="toggle-switch toggle-sm">
                                <input type="checkbox" data-product-id="${item.id}" data-size="G" ${invG ? 'checked' : ''}>
                                <span class="toggle-slider"></span>
                            </label>
                        </div>
                   </div>`
                : '';

            return `
            <div class="inventory-item ${!isActive ? 'inactive' : ''}">
                ${item.image ? `<img src="${item.image}" class="inventory-img" alt="${item.name}">` : `<span class="inventory-emoji">${item.emoji}</span>`}
                <div class="inventory-info">
                    <div class="inventory-name">${item.name}</div>
                    <div class="inventory-cat">${item.category}${stockQty !== null ? ` · Stock: ${stockQty}` : ''}</div>
                </div>
                ${priceDisplay}
                ${sizeToggles}
                <label class="toggle-switch">
                    <input type="checkbox" data-product-id="${item.id}" ${isActive ? 'checked' : ''}>
                    <span class="toggle-slider"></span>
                </label>
            </div>`;
        }).join('');

        // Bind size toggle events (M / G)
        container.querySelectorAll('.toggle-switch input[data-size]').forEach(toggle => {
            toggle.addEventListener('change', () => {
                const productId = toggle.dataset.productId;
                const size = toggle.dataset.size;
                const field = size === 'M' ? 'activeM' : 'activeG';
                const val = toggle.checked;
                db.collection('inventory').doc(productId).set({ [field]: val }, { merge: true })
                    .then(() => {
                        if (!inventoryCache[productId]) inventoryCache[productId] = {};
                        inventoryCache[productId][field] = val;
                        const name = getMenuItems().find(i => i.id == productId)?.name;
                        showToast(`${name} talla ${size}: ${val ? 'Activo' : 'Inactivo'}`, val ? 'success' : 'warning');
                    })
                    .catch(err => showToast('Error actualizando inventario', 'warning'));
            });
        });

        // Bind main toggle events
        container.querySelectorAll('.toggle-switch input:not([data-size])').forEach(toggle => {
            toggle.addEventListener('change', () => {
                const productId = toggle.dataset.productId;
                const active = toggle.checked;
                const parentItem = toggle.closest('.inventory-item');
                parentItem.classList.toggle('inactive', !active);
                db.collection('inventory').doc(productId).set({ active }, { merge: true })
                    .then(() => {
                        inventoryCache[productId] = { ...inventoryCache[productId], active };
                        showToast(`${active ? 'Activado' : 'Desactivado'}: ${getMenuItems().find(i => i.id == productId)?.name}`, active ? 'success' : 'warning');
                    })
                    .catch(err => showToast('Error actualizando inventario', 'warning'));
            });
        });

        // Size filter buttons
        document.querySelectorAll('.inv-size-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.inv-size-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                renderInventory(btn.dataset.sizeFilter);
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
                if (tab === 'productos') renderInventory('all');
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

            // Bind qty change events (per-input debounced save)
            container.querySelectorAll('.inventory-qty-input').forEach(input => {
                let inputTimeout;
                input.addEventListener('change', () => {
                    const ingId = input.dataset.ingId;
                    const val = parseInt(input.value) || 0;
                    clearTimeout(inputTimeout);
                    inputTimeout = setTimeout(() => {
                        db.collection('ingredients').doc(ingId).set({ qty: val }, { merge: true })
                            .then(() => showToast('Stock actualizado', 'success'))
                            .catch(() => showToast('Error guardando stock', 'warning'));
                    }, 500);
                });
            });
        });
    }

    // Load inventory on app start for client filtering + admin sync
    if (typeof db !== 'undefined') {
        db.collection('inventory').onSnapshot(snapshot => {
            // Rebuild cache from snapshot to clear deleted docs
            const newCache = {};
            snapshot.forEach(doc => {
                newCache[doc.id] = doc.data();
            });
            inventoryCache = newCache;
            if (adminMode) {
                // Re-render admin inventory if visible
                const invSection = $('admin-sec-inventario');
                if (invSection && !invSection.classList.contains('hidden')) {
                    renderInventory();
                }
            } else {
                const activeTab = document.querySelector('.tab.active');
                if (activeTab) renderCategory(activeTab.dataset.category);
            }
        });
    }

    // ========================================
    // AUTO-DECREMENT INVENTORY ON SALE
    // ========================================
    function decrementInventoryOnSale(saleItems) {
        if (typeof db === 'undefined') return;
        // saleItems: array of { name, qty, productId (optional), size (optional) }
        const batch = db.batch();
        let hasUpdates = false;

        saleItems.forEach(item => {
            const qty = item.qty || item.quantity || 1;
            // Find product by productId or by name
            let product = null;
            if (item.productId) {
                if (typeof item.productId === 'string' && item.productId.startsWith('t')) {
                    // Extra topping — no product-level stock to decrement
                    return;
                }
                product = getMenuItems().find(p => String(p.id) === String(item.productId));
            }
            if (!product) {
                product = getMenuItems().find(p => p.name === item.name);
            }
            if (!product) return;

            const invRef = db.collection('inventory').doc(String(product.id));
            const cached = inventoryCache[String(product.id)];
            const currentStock = cached && cached.stockQty !== undefined ? cached.stockQty : null;

            if (currentStock !== null && currentStock > 0) {
                const newStock = Math.max(0, currentStock - qty);
                batch.set(invRef, { stockQty: newStock }, { merge: true });
                // Update local cache immediately
                if (!inventoryCache[String(product.id)]) inventoryCache[String(product.id)] = {};
                inventoryCache[String(product.id)].stockQty = newStock;
                hasUpdates = true;

                // Auto-deactivate if stock reaches 0
                if (newStock === 0) {
                    batch.set(invRef, { active: false }, { merge: true });
                    inventoryCache[String(product.id)].active = false;
                }
            }
        });

        if (hasUpdates) {
            batch.commit().then(() => {
                console.log('Inventario actualizado automáticamente');
            }).catch(err => {
                console.error('Error actualizando inventario:', err);
            });
        }
    }

    // ========================================
    // POS / CAJA
    // ========================================
    function renderPOS() {
        // Render category buttons
        const catsContainer = $('pos-categories');
        const cats = Object.keys(CATEGORIES).filter(k => k !== 'inicio' && k !== 'arma-tu-bowl');
        catsContainer.innerHTML = `<button class="pos-cat-btn active" data-cat="all">Todos</button>` +
            cats.map(catKey => `<button class="pos-cat-btn" data-cat="${catKey}"><i class="fas ${CATEGORIES[catKey].icon}"></i> ${CATEGORIES[catKey].name}</button>`).join('') +
            `<button class="pos-cat-btn" data-cat="extras"><i class="fas fa-plus-circle"></i> Extras</button>` +
            `<button class="pos-cat-btn" data-cat="arma-tu-bowl"><i class="fas fa-wand-magic-sparkles"></i> Arma tu Bowl</button>`;

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
                // Toggle cash change section
                const cashChange = $('pos-cash-change');
                cashChange.style.display = posPaymentMethod === 'efectivo' ? 'block' : 'none';
                // Toggle payment detail fields
                document.querySelectorAll('.pos-payment-details').forEach(d => d.classList.add('hidden'));
                const detailEl = $('pos-payment-details-' + posPaymentMethod);
                if (detailEl) detailEl.classList.remove('hidden');
            });
        });

        // Customer search by phone
        const custSearchBtn = $('pos-customer-search-btn');
        if (custSearchBtn) {
            custSearchBtn.addEventListener('click', searchPOSCustomer);
        }
        const custPhoneInput = $('pos-customer-phone');
        if (custPhoneInput) {
            custPhoneInput.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') searchPOSCustomer();
            });
        }
        const custClearBtn = $('pos-customer-clear');
        if (custClearBtn) {
            custClearBtn.addEventListener('click', () => {
                posCustomerInfo = null;
                $('pos-customer-result').classList.add('hidden');
                $('pos-customer-phone').value = '';
            });
        }

        // Tip type toggle ($ Fijo / % Pct)
        document.querySelectorAll('.pos-tip-type-btn').forEach(typeBtn => {
            typeBtn.addEventListener('click', () => {
                document.querySelectorAll('.pos-tip-type-btn').forEach(b => b.classList.remove('active'));
                typeBtn.classList.add('active');
                const mode = typeBtn.dataset.posTipType;
                if (mode === 'fixed') {
                    $('pos-tip-opts-fixed').classList.remove('hidden');
                    $('pos-tip-opts-percent').classList.add('hidden');
                } else {
                    $('pos-tip-opts-fixed').classList.add('hidden');
                    $('pos-tip-opts-percent').classList.remove('hidden');
                }
                // Reset tip on mode switch
                posTipAmount = 0;
                $('pos-tip-custom').classList.add('hidden');
                document.querySelectorAll('.pos-tip-btn').forEach(b => b.classList.remove('active'));
                const zeroBtn = document.querySelector('.pos-tip-btn[data-tip="0"]');
                if (zeroBtn) zeroBtn.classList.add('active');
                document.querySelectorAll('.pos-tip-pct-btn').forEach(b => b.classList.remove('active'));
                renderPOSInvoice();
            });
        });

        // Tip buttons (fixed amounts)
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

        // Tip percentage buttons
        document.querySelectorAll('.pos-tip-pct-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.pos-tip-pct-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                $('pos-tip-custom').classList.add('hidden');
                const pct = parseFloat(btn.dataset.pct) || 0;
                const subtotal = posCart.reduce((s, i) => s + i.price * i.qty, 0);
                const discountAmt = subtotal * (posDiscountPercent / 100);
                const afterDiscount = subtotal - discountAmt;
                posTipAmount = Math.round(afterDiscount * pct / 100 * 100) / 100;
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

        // Discount buttons
        document.querySelectorAll('.pos-discount-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.pos-discount-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const discVal = btn.dataset.discount;
                if (discVal === 'custom') {
                    $('pos-discount-custom').classList.remove('hidden');
                    posDiscountPercent = parseFloat($('pos-discount-amount').value) || 0;
                } else {
                    $('pos-discount-custom').classList.add('hidden');
                    posDiscountPercent = parseFloat(discVal) || 0;
                }
                renderPOSInvoice();
            });
        });
        const discountCustomInput = $('pos-discount-amount');
        if (discountCustomInput) {
            discountCustomInput.addEventListener('input', () => {
                posDiscountPercent = Math.min(100, Math.max(0, parseFloat(discountCustomInput.value) || 0));
                renderPOSInvoice();
            });
        }

        // Delivery toggle & input
        const posDeliveryToggle = $('pos-delivery-toggle');
        if (posDeliveryToggle) {
            posDeliveryToggle.addEventListener('change', () => {
                const fields = $('pos-delivery-fields');
                if (posDeliveryToggle.checked) {
                    fields.classList.remove('hidden');
                    posDeliveryAmount = parseFloat($('pos-delivery-amount').value) || 0;
                } else {
                    fields.classList.add('hidden');
                    posDeliveryAmount = 0;
                    $('pos-delivery-amount').value = '';
                    $('pos-delivery-note').value = '';
                }
                renderPOSInvoice();
            });
        }
        const posDeliveryInput = $('pos-delivery-amount');
        if (posDeliveryInput) {
            posDeliveryInput.addEventListener('input', () => {
                posDeliveryAmount = parseFloat(posDeliveryInput.value) || 0;
                renderPOSInvoice();
            });
        }

        // Cash received input
        const cashInput = $('pos-cash-received');
        if (cashInput) {
            cashInput.addEventListener('input', () => {
                const received = parseFloat(cashInput.value) || 0;
                const subtotal = posCart.reduce((s, i) => s + i.price * i.qty, 0);
                const discountAmt = subtotal * (posDiscountPercent / 100);
                const total = (subtotal - discountAmt) + posTipAmount + posDeliveryAmount;
                const change = received - total;
                $('pos-change-amount').textContent = change >= 0 ? '$' + change.toFixed(2) : '-$' + Math.abs(change).toFixed(2);
                $('pos-change-amount').style.color = change >= 0 ? '#00e096' : '#ff6b6b';
            });
        }

        // Clear invoice
        $('pos-clear').addEventListener('click', () => {
            posCart = [];
            posTipAmount = 0;
            posDiscountPercent = 0;
            posDeliveryAmount = 0;
            document.querySelectorAll('.pos-tip-btn').forEach(b => b.classList.remove('active'));
            document.querySelector('.pos-tip-btn[data-tip="0"]').classList.add('active');
            $('pos-tip-custom').classList.add('hidden');
            if ($('pos-tip-amount')) $('pos-tip-amount').value = '';
            document.querySelectorAll('.pos-discount-btn').forEach(b => b.classList.remove('active'));
            document.querySelector('.pos-discount-btn[data-discount="0"]').classList.add('active');
            $('pos-discount-custom').classList.add('hidden');
            if ($('pos-discount-amount')) $('pos-discount-amount').value = '';
            // Reset delivery
            if ($('pos-delivery-toggle')) $('pos-delivery-toggle').checked = false;
            $('pos-delivery-fields').classList.add('hidden');
            if ($('pos-delivery-amount')) $('pos-delivery-amount').value = '';
            if ($('pos-delivery-note')) $('pos-delivery-note').value = '';
            renderPOSInvoice();
        });

        // Charge button
        $('pos-charge-btn').addEventListener('click', processPOSSale);
    }

    // ---- POS ARMA TU BOWL ----
    let posBowl = { base: null, protein: null, toppings: [], dressing: null };

    function renderPOSBowlBuilder(container) {
        posBowl = { base: null, protein: null, toppings: [], dressing: null };

        function optBtn(opt, type) {
            return `<button class="mesa-bowl-opt" data-type="${type}" data-id="${opt.id}" data-price="${opt.price}" data-name="${opt.name}">
                <span class="mesa-bowl-opt-emoji">${opt.emoji}</span>
                <span class="mesa-bowl-opt-name">${opt.name}</span>
                <span class="mesa-bowl-opt-price">+$${opt.price.toFixed(2)}</span>
            </button>`;
        }

        container.innerHTML = `
            <div class="mesa-bowl-builder">
                <div class="mesa-bowl-step">
                    <h4><span class="mesa-bowl-step-num">1</span> Base</h4>
                    <div class="mesa-bowl-options" data-step="base">${BUILD_OPTIONS.bases.map(o => optBtn(o, 'base')).join('')}</div>
                </div>
                <div class="mesa-bowl-step">
                    <h4><span class="mesa-bowl-step-num">2</span> Textura</h4>
                    <div class="mesa-bowl-options" data-step="protein">${BUILD_OPTIONS.proteins.map(o => optBtn(o, 'protein')).join('')}</div>
                </div>
                <div class="mesa-bowl-step">
                    <h4><span class="mesa-bowl-step-num">3</span> Toppings <small>(máx 4)</small></h4>
                    <div class="mesa-bowl-options" data-step="topping">${BUILD_OPTIONS.toppings.map(o => optBtn(o, 'topping')).join('')}</div>
                </div>
                <div class="mesa-bowl-step">
                    <h4><span class="mesa-bowl-step-num">4</span> Drizzle</h4>
                    <div class="mesa-bowl-options" data-step="dressing">${BUILD_OPTIONS.dressings.map(o => optBtn(o, 'dressing')).join('')}</div>
                </div>
                <div class="mesa-bowl-summary">
                    <div class="mesa-bowl-summary-lines" id="pos-bowl-summary-lines"><p style="color:var(--text-light);font-size:12px">Selecciona los ingredientes</p></div>
                    <div class="mesa-bowl-summary-total"><span>Total:</span><span id="pos-bowl-total">$0.00</span></div>
                    <button class="mesa-bowl-add-btn" id="pos-bowl-add-btn" disabled><i class="fas fa-plus"></i> Agregar Bowl a Factura</button>
                </div>
            </div>`;

        container.querySelectorAll('.mesa-bowl-opt').forEach(btn => {
            btn.addEventListener('click', () => {
                const { type, id, price, name } = btn.dataset;
                const priceNum = parseFloat(price);

                if (type === 'topping') {
                    if (btn.classList.contains('selected')) {
                        btn.classList.remove('selected');
                        posBowl.toppings = posBowl.toppings.filter(t => t.id !== id);
                    } else if (posBowl.toppings.length < 4) {
                        btn.classList.add('selected');
                        posBowl.toppings.push({ id, name, price: priceNum });
                    } else {
                        showToast('Máximo 4 toppings', 'warning');
                    }
                } else {
                    btn.closest('.mesa-bowl-options').querySelectorAll('.mesa-bowl-opt').forEach(b => b.classList.remove('selected'));
                    btn.classList.add('selected');
                    posBowl[type] = { id, name, price: priceNum };
                }
                updatePOSBowlSummary();
            });
        });

        const addBtn = container.querySelector('#pos-bowl-add-btn');
        if (addBtn) {
            addBtn.addEventListener('click', () => {
                if (!posBowl.base || !posBowl.protein || !posBowl.dressing) return;

                let total = posBowl.base.price + posBowl.protein.price + posBowl.dressing.price;
                total += posBowl.toppings.reduce((s, t) => s + t.price, 0);

                const bowlId = 'custom-' + Date.now();
                posCart.push({
                    productId: bowlId,
                    name: 'Bowl Personalizado',
                    emoji: '🎨',
                    price: total,
                    size: '',
                    qty: 1
                });
                renderPOSInvoice();
                showToast('Bowl personalizado agregado', 'success');

                posBowl = { base: null, protein: null, toppings: [], dressing: null };
                container.querySelectorAll('.mesa-bowl-opt').forEach(b => b.classList.remove('selected'));
                updatePOSBowlSummary();
            });
        }
    }

    function updatePOSBowlSummary() {
        const linesEl = document.getElementById('pos-bowl-summary-lines');
        const totalEl = document.getElementById('pos-bowl-total');
        const addBtn = document.getElementById('pos-bowl-add-btn');
        if (!linesEl) return;

        let total = 0, lines = [];
        if (posBowl.base) { lines.push(`<div class="mesa-bowl-line"><span>Base: ${posBowl.base.name}</span><span>$${posBowl.base.price.toFixed(2)}</span></div>`); total += posBowl.base.price; }
        if (posBowl.protein) { lines.push(`<div class="mesa-bowl-line"><span>Textura: ${posBowl.protein.name}</span><span>$${posBowl.protein.price.toFixed(2)}</span></div>`); total += posBowl.protein.price; }
        posBowl.toppings.forEach(t => { lines.push(`<div class="mesa-bowl-line"><span>Topping: ${t.name}</span><span>$${t.price.toFixed(2)}</span></div>`); total += t.price; });
        if (posBowl.dressing) { lines.push(`<div class="mesa-bowl-line"><span>Drizzle: ${posBowl.dressing.name}</span><span>$${posBowl.dressing.price.toFixed(2)}</span></div>`); total += posBowl.dressing.price; }

        linesEl.innerHTML = lines.length ? lines.join('') : '<p style="color:var(--text-light);font-size:12px">Selecciona los ingredientes</p>';
        if (totalEl) totalEl.textContent = '$' + total.toFixed(2);
        if (addBtn) addBtn.disabled = !(posBowl.base && posBowl.protein && posBowl.dressing);
    }

    function renderPOSProducts(category) {
        const container = $('pos-products-grid');

        // Bowl builder for POS
        if (category === 'arma-tu-bowl') {
            renderPOSBowlBuilder(container);
            return;
        }

        const allItems = getMenuItems();

        // Build list of menu items
        let menuItems = [];
        if (category === 'extras') {
            menuItems = [];
        } else if (category === 'all') {
            menuItems = allItems;
        } else {
            menuItems = allItems.filter(i => i.category === category);
        }

        // Build list of extra toppings
        let extraItems = [];
        if (category === 'extras' || category === 'all') {
            extraItems = EXTRA_TOPPINGS;
        }

        // Render menu items
        let html = menuItems.map(item => {
            const isAvailable = isProductAvailable(item.id);
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

        // Render extras/toppings
        if (extraItems.length > 0) {
            if (menuItems.length > 0) {
                html += `<div class="pos-extras-divider">Extras / Toppings</div>`;
            }
            html += extraItems.map(item => `
                <div class="pos-product-card pos-extra-card" data-extra-id="${item.id}">
                    <span class="pos-product-emoji">${item.emoji}</span>
                    <span class="pos-product-name">${item.name}</span>
                    <span class="pos-product-price">$${item.price.toFixed(2)}</span>
                </div>
            `).join('');
        }

        container.innerHTML = html;

        container.querySelectorAll('.pos-product-card:not(.disabled):not(.pos-extra-card)').forEach(card => {
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
                    const product = getMenuItems().find(i => i.id === productId);
                    addToPOSCart(productId, '', product.price);
                }
            });
        });

        // Extra/topping card click handlers
        container.querySelectorAll('.pos-extra-card').forEach(card => {
            card.addEventListener('click', () => {
                const extraId = card.dataset.extraId;
                const extra = EXTRA_TOPPINGS.find(t => t.id === extraId);
                if (extra) addToPOSCart(extraId, '', extra.price);
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
        // Support both menu items (numeric id) and extras (string id like 't1')
        let product;
        if (typeof productId === 'string' && productId.startsWith('t')) {
            product = EXTRA_TOPPINGS.find(t => t.id === productId);
        } else {
            product = getMenuItems().find(i => i.id === productId);
        }
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
            // Reset discount display
            const discountDisplay = $('pos-discount-display');
            if (discountDisplay) discountDisplay.classList.add('hidden');
            // Reset delivery display
            const deliveryDisplay = $('pos-delivery-display');
            if (deliveryDisplay) deliveryDisplay.classList.add('hidden');
            // Reset cash fields
            const cashInput = $('pos-cash-received');
            if (cashInput) cashInput.value = '';
            const changeDisplay = $('pos-change-amount');
            if (changeDisplay) changeDisplay.textContent = '$0.00';
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
        const discountAmount = subtotal * (posDiscountPercent / 100);
        const subtotalAfterDiscount = subtotal - discountAmount;
        const totalWithTip = subtotalAfterDiscount + posTipAmount + posDeliveryAmount;
        $('pos-subtotal').textContent = '$' + subtotal.toFixed(2);
        $('pos-total').textContent = '$' + totalWithTip.toFixed(2);

        // Update discount display
        const discountDisplay = $('pos-discount-display');
        if (posDiscountPercent > 0) {
            discountDisplay.classList.remove('hidden');
            $('pos-discount-pct').textContent = posDiscountPercent;
            $('pos-discount-value').textContent = '-$' + discountAmount.toFixed(2);
        } else {
            discountDisplay.classList.add('hidden');
        }

        // Update delivery display
        const deliveryDisplay = $('pos-delivery-display');
        if (deliveryDisplay) {
            if (posDeliveryAmount > 0) {
                deliveryDisplay.classList.remove('hidden');
                $('pos-delivery-value').textContent = '$' + posDeliveryAmount.toFixed(2);
            } else {
                deliveryDisplay.classList.add('hidden');
            }
        }

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

    // ========== UPSERT CUSTOMER (Usuarios) ==========
    async function upsertCustomer(phone, name, orderTotal, source, address) {
        if (!phone || typeof db === 'undefined') return;
        const cleanPhone = phone.replace(/[^+\d]/g, '');
        if (cleanPhone.length < 6) return;
        const ref = db.collection('customers').doc(cleanPhone);
        try {
            const snap = await ref.get();
            if (snap.exists) {
                const data = snap.data();
                const updates = {
                    totalOrders: (data.totalOrders || 0) + 1,
                    totalSpent: Math.round(((data.totalSpent || 0) + orderTotal) * 100) / 100,
                    lastOrderDate: firebase.firestore.FieldValue.serverTimestamp()
                };
                if (name && name !== 'Invitado' && name !== data.name) updates.name = name;
                if (address && address !== data.address) updates.address = address;
                if (source && data.source !== source && data.source !== 'both') updates.source = 'both';
                await ref.update(updates);
            } else {
                await ref.set({
                    phone: cleanPhone,
                    name: (name && name !== 'Invitado') ? name : '',
                    address: address || '',
                    totalOrders: 1,
                    totalSpent: Math.round(orderTotal * 100) / 100,
                    lastOrderDate: firebase.firestore.FieldValue.serverTimestamp(),
                    firstSeen: firebase.firestore.FieldValue.serverTimestamp(),
                    source: source || 'pos'
                });
            }
        } catch (e) { console.error('upsertCustomer error:', e); }
    }

    // Busca cliente por teléfono en la colección de pedidos
    function searchPOSCustomer() {
        const phoneInput = $('pos-customer-phone');
        if (!phoneInput) return;
        const phone = phoneInput.value.trim();
        if (!phone || phone.length < 4) { showToast('Ingresa un número de teléfono', 'warning'); return; }

        const tryFind = (phoneQuery) => {
            return db.collection('orders')
                .where('customerPhone', '==', phoneQuery)
                .orderBy('createdAt', 'desc')
                .limit(1)
                .get();
        };

        tryFind(phone).then(snap => {
            if (!snap.empty) {
                const d = snap.docs[0].data();
                posCustomerInfo = { name: d.customerName || '', phone: d.customerPhone || phone };
            } else {
                // Try with +507 prefix
                return tryFind('+507' + phone).then(snap2 => {
                    if (!snap2.empty) {
                        const d = snap2.docs[0].data();
                        posCustomerInfo = { name: d.customerName || '', phone: d.customerPhone || phone };
                    } else {
                        posCustomerInfo = { name: '', phone: phone };
                        showToast('Cliente no encontrado. Se guardará el teléfono.', 'info');
                    }
                });
            }
        }).then(() => {
            if (posCustomerInfo) {
                const label = posCustomerInfo.name ? `${posCustomerInfo.name} (${posCustomerInfo.phone})` : posCustomerInfo.phone;
                $('pos-customer-name-display').textContent = label;
                $('pos-customer-result').classList.remove('hidden');
                if (posCustomerInfo.name) showToast(`Cliente: ${posCustomerInfo.name}`, 'success');
            }
        }).catch(() => showToast('Error buscando cliente', 'warning'));
    }

    // Captura detalles de pago según el método activo en POS
    function getPOSPaymentDetails() {
        const details = {};
        if (posPaymentMethod === 'efectivo') {
            const received = parseFloat($('pos-cash-received') ? $('pos-cash-received').value : '0') || 0;
            const subtotal = posCart.reduce((s, i) => s + i.price * i.qty, 0);
            const discAmount = subtotal * (posDiscountPercent / 100);
            // FIX #4: Include delivery fee in change calculation
            const total = (subtotal - discAmount) + posTipAmount + posDeliveryAmount;
            details.cashReceived = received;
            details.changeGiven = Math.max(0, Math.round((received - total) * 100) / 100);
        } else if (posPaymentMethod === 'tarjeta') {
            details.reference = ($('pos-tarjeta-ref') ? $('pos-tarjeta-ref').value : '').trim();
        } else if (posPaymentMethod === 'ach') {
            details.reference = ($('pos-ach-ref') ? $('pos-ach-ref').value : '').trim();
        } else if (posPaymentMethod === 'yappy') {
            details.reference = ($('pos-yappy-ref') ? $('pos-yappy-ref').value : '').trim();
        }
        return details;
    }

    // Limpia campos de referencia y cliente tras venta
    function resetPOSExtras() {
        posCustomerInfo = null;
        const custResult = $('pos-customer-result');
        if (custResult) custResult.classList.add('hidden');
        const custPhone = $('pos-customer-phone');
        if (custPhone) custPhone.value = '';
        document.querySelectorAll('.pos-payment-details').forEach(d => d.classList.add('hidden'));
        ['pos-tarjeta-ref', 'pos-ach-ref', 'pos-yappy-ref'].forEach(id => {
            const el = $(id); if (el) el.value = '';
        });
    }

    let _posProcessing = false;
    function processPOSSale() {
        if (_posProcessing) return;
        if (posCart.length === 0) return;
        _posProcessing = true;
        const subtotal = posCart.reduce((s, i) => s + i.price * i.qty, 0);
        const discountAmount = subtotal * (posDiscountPercent / 100);
        const subtotalAfterDiscount = subtotal - discountAmount;
        const total = subtotalAfterDiscount + posTipAmount + posDeliveryAmount;

        const deliveryNote = $('pos-delivery-note') ? $('pos-delivery-note').value.trim() : '';
        const sale = {
            items: posCart.map(i => ({ productId: i.productId || null, name: i.name, emoji: i.emoji, qty: i.qty, price: i.price, size: i.size || '', total: i.price * i.qty })),
            subtotal,
            discount: posDiscountPercent,
            discountAmount: discountAmount,
            tip: posTipAmount,
            delivery: posDeliveryAmount,
            deliveryNote: deliveryNote,
            total,
            paymentMethod: posPaymentMethod,
            paymentDetails: getPOSPaymentDetails(),
            source: 'pos',
            customerName: posCustomerInfo ? posCustomerInfo.name : '',
            customerPhone: posCustomerInfo ? posCustomerInfo.phone : '',
            deviceType: detectDeviceType(),
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            date: new Date().toLocaleDateString('es-PA')
        };

        db.collection('sales').add(sale).then(() => {
            // Auto-decrement inventory
            decrementInventoryOnSale(sale.items);
            // Upsert customer record
            if (sale.customerPhone) {
                upsertCustomer(sale.customerPhone, sale.customerName, total, 'pos');
            }
            const discMsg = posDiscountPercent > 0 ? ` -${posDiscountPercent}%` : '';
            const tipMsg = posTipAmount > 0 ? ` + propina $${posTipAmount.toFixed(2)}` : '';
            const delMsg = posDeliveryAmount > 0 ? ` + delivery $${posDeliveryAmount.toFixed(2)}` : '';
            showToast(`Venta registrada: $${total.toFixed(2)} (${posPaymentMethod}${discMsg}${tipMsg}${delMsg})`, 'success');
            playCashRegisterSound();
            posCart = [];
            posTipAmount = 0;
            posDiscountPercent = 0;
            posDeliveryAmount = 0;
            document.querySelectorAll('.pos-tip-btn').forEach(b => b.classList.remove('active'));
            document.querySelector('.pos-tip-btn[data-tip="0"]').classList.add('active');
            $('pos-tip-custom').classList.add('hidden');
            if ($('pos-tip-amount')) $('pos-tip-amount').value = '';
            document.querySelectorAll('.pos-discount-btn').forEach(b => b.classList.remove('active'));
            document.querySelector('.pos-discount-btn[data-discount="0"]').classList.add('active');
            $('pos-discount-custom').classList.add('hidden');
            if ($('pos-discount-amount')) $('pos-discount-amount').value = '';
            // Reset delivery
            if ($('pos-delivery-toggle')) $('pos-delivery-toggle').checked = false;
            $('pos-delivery-fields').classList.add('hidden');
            if ($('pos-delivery-amount')) $('pos-delivery-amount').value = '';
            if ($('pos-delivery-note')) $('pos-delivery-note').value = '';
            renderPOSInvoice();
            const cashInput = $('pos-cash-received');
            if (cashInput) { cashInput.value = ''; $('pos-change-amount').textContent = '$0.00'; }
            resetPOSExtras();
            loadTodaySales();
            _posProcessing = false;
        }).catch(err => { _posProcessing = false; showToast('Error registrando venta', 'warning'); });
    }

    function loadTodaySales() {
        const today = new Date().toLocaleDateString('es-PA');
        db.collection('sales').where('date', '==', today).get().then(snapshot => {
            let count = 0, total = 0;
            snapshot.forEach(doc => {
                const data = doc.data();
                if (data.voided) return; // Exclude voided sales
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

    // Mis Pedidos dropdown item click
    if (tabMisPedidos) {
        tabMisPedidos.addEventListener('click', () => {
            userDropdown.classList.add('hidden');
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
            renderCategory('mis-pedidos');
            if (currentUser && currentUser.phone && !customerOrdersUnsubscribe) {
                startCustomerOrdersListener(currentUser.phone);
            }
        });
    }

    // ========================================
    // ADMIN ACCESS (click logo)
    // ========================================
    (function() {
        // Auto-login si el dispositivo recuerda al admin
        const savedAdminEmail = localStorage.getItem('xazai_admin_email');
        if (savedAdminEmail) {
            const isAdmin = USERS.find(u => u.role === 'admin' && u.email === savedAdminEmail);
            if (isAdmin) {
                currentUser = { username: savedAdminEmail, role: 'admin', name: isAdmin.name || 'Admin', email: savedAdminEmail };
                userName.textContent = isAdmin.name || 'Admin';
                loginTriggerBtn.classList.add('hidden');
                logoutBtn.classList.remove('hidden');
                adminPanelBtn.classList.remove('hidden');
                enterAdminMode();
            } else {
                // Email guardado ya no es válido, limpiar
                localStorage.removeItem('xazai_admin_email');
            }
        }

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
                    localStorage.setItem('xazai_admin_email', email);
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
    // expenseImageBase64 hoisted above (hoisting fix)

    let _expensesInitialized = false;
    function initExpenses() {
        if (_expensesInitialized) { loadExpenses(); return; }
        _expensesInitialized = true;
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

        if (!description || !date || isNaN(amount) || amount <= 0) {
            showToast('Completa todos los campos (monto debe ser positivo)', 'warning');
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
    // dashRangeMode, dashRefDate hoisted above (hoisting fix)

    let _dashboardInitialized = false;
    function initDashboard() {
        if (_dashboardInitialized) { loadDashboard(); return; }
        _dashboardInitialized = true;
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
            // Exclude voided sales from all financial calculations
            const activeSales = sales.filter(s => !s.voided);
            renderDashSummary(activeSales, expenses, orders);
            renderDashPayments(activeSales);
            renderDashTopProducts(activeSales);
            renderDashRecent(orders, expenses);
        });
    }

    function renderDashSummary(sales, expenses, orders) {
        // FIX #2-3: Separate revenue from tips/delivery for accurate profit
        const totalGross = sales.reduce((s, sale) => s + (sale.total || 0), 0);
        const totalTips = sales.reduce((s, sale) => s + (sale.tip || 0), 0);
        const totalDelivery = sales.reduce((s, sale) => s + (sale.delivery || 0), 0);
        const totalExpenses = expenses.reduce((s, exp) => s + (exp.amount || 0), 0);
        // Pure product revenue = gross total minus tips and delivery fees
        const productRevenue = totalGross - totalTips - totalDelivery;
        const netProfit = productRevenue - totalExpenses;
        const txCount = sales.length;

        $('dash-summary').innerHTML = `
            <div class="dash-summary-card">
                <div class="dash-summary-icon green"><i class="fas fa-dollar-sign"></i></div>
                <div class="dash-summary-info">
                    <span>Ventas (${txCount} tx)</span>
                    <div class="dash-summary-value">$${productRevenue.toFixed(2)}</div>
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
        // FIX #11: Include ACH in payment methods
        const allMethods = ['efectivo', 'yappy', 'tarjeta', 'ach'];
        const methodLabels = { 'efectivo': 'Efectivo', 'yappy': 'Yappy', 'tarjeta': 'Tarjeta', 'ach': 'ACH' };
        const methodColors = { 'efectivo': 'cash', 'yappy': 'yappy', 'tarjeta': 'card', 'ach': 'card' };
        const methodIcons = { 'efectivo': 'fa-money-bill-wave', 'yappy': 'fa-mobile-alt', 'tarjeta': 'fa-credit-card', 'ach': 'fa-university' };

        const methods = {};
        const counts = {};
        allMethods.forEach(m => { methods[m] = 0; counts[m] = 0; });
        sales.forEach(sale => {
            let m = (sale.paymentMethod || 'efectivo').toLowerCase();
            if (!allMethods.includes(m)) m = 'efectivo'; // Map unknown methods to efectivo
            // Use product revenue (total minus tip and delivery) to match summary
            const productAmount = (sale.total || 0) - (sale.tip || 0) - (sale.delivery || 0);
            methods[m] = (methods[m] || 0) + productAmount;
            counts[m] = (counts[m] || 0) + 1;
        });

        const grandTotal = Object.values(methods).reduce((s, v) => s + v, 0) || 0;
        const content = $('dash-payments-content');

        content.innerHTML = allMethods.map(method => {
            const amount = methods[method];
            const count = counts[method];
            const pct = grandTotal > 0 ? Math.round((amount / grandTotal) * 100) : 0;
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
                <span>Total Cierre</span><span style="color:var(--accent)">$${grandTotal.toFixed(2)}</span>
            </div>`;
    }

    function renderDashTopProducts(sales) {
        const products = {};
        sales.forEach(sale => {
            (sale.items || []).forEach(item => {
                const key = item.name || 'Desconocido';
                if (!products[key]) products[key] = { name: key, emoji: item.emoji || '', qty: 0, total: 0 };
                const itemQty = item.qty || item.quantity || 1;
                products[key].qty += itemQty;
                products[key].total += item.total || ((item.price || 0) * itemQty);
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
    // RRHH - Recursos Humanos
    // ========================================
    // RRHH_PERMISSIONS, DEFAULT_ROLES & state variables hoisted above (hoisting fix)

    let _rrhhInitialized = false;
    function initRRHH() {
        if (_rrhhInitialized) { loadRRHHRoles(); loadRRHHCollaborators(); return; }
        _rrhhInitialized = true;
        seedDefaultRoles();
        renderRolePermissions();

        // Tab switching
        document.querySelectorAll('.rrhh-tab-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.rrhh-tab-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const tab = btn.dataset.rrhhTab;
                ['roles', 'colaboradores', 'reportes'].forEach(t => {
                    const el = $('rrhh-tab-' + t);
                    if (el) el.classList.toggle('hidden', t !== tab);
                });
                if (tab === 'reportes') loadRRHHReports();
            });
        });

        // Role save
        $('rrhh-role-save-btn').addEventListener('click', saveRole);
        // Collab save
        $('rrhh-collab-save-btn').addEventListener('click', saveCollaborator);

        // Camera modal (for biometric registration)
        $('rrhh-camera-close').addEventListener('click', closeBiometricCamera);
        $('rrhh-capture-btn').addEventListener('click', startBiometricCountdown);

        // Confirmation overlay
        $('rrhh-confirm-ok').addEventListener('click', () => {
            $('rrhh-confirm-overlay').classList.add('hidden');
        });

        // Report range buttons
        document.querySelectorAll('.rrhh-range-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.rrhh-range-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                rrhhReportRange = btn.dataset.rrhhRange;
                if (rrhhReportRange === 'custom') {
                    $('rrhh-report-custom').classList.remove('hidden');
                } else {
                    $('rrhh-report-custom').classList.add('hidden');
                    loadRRHHReports();
                }
            });
        });
        const reportApply = $('rrhh-report-apply');
        if (reportApply) reportApply.addEventListener('click', loadRRHHReports);

        loadRRHHRoles();
        loadRRHHCollaborators();
    }

    // --- Roles ---
    function seedDefaultRoles() {
        db.collection('rrhh_roles').limit(1).get().then(snap => {
            if (snap.empty) {
                DEFAULT_ROLES.forEach(role => {
                    db.collection('rrhh_roles').add({ ...role, createdAt: firebase.firestore.FieldValue.serverTimestamp() });
                });
                setTimeout(() => loadRRHHRoles(), 1500);
            }
        });
    }

    function renderRolePermissions() {
        const container = $('rrhh-role-permissions');
        if (!container) return;
        container.innerHTML = RRHH_PERMISSIONS.map(p => `
            <div class="rrhh-perm-item" data-perm="${p.key}">
                <input type="checkbox" value="${p.key}">
                <i class="fas ${p.icon}"></i>
                <span>${p.label}</span>
            </div>
        `).join('');
        container.querySelectorAll('.rrhh-perm-item').forEach(item => {
            item.addEventListener('click', () => {
                item.classList.toggle('active');
                item.querySelector('input').checked = item.classList.contains('active');
            });
        });
    }

    function loadRRHHRoles() {
        db.collection('rrhh_roles').orderBy('createdAt', 'asc').get().then(snap => {
            rrhhRoles = [];
            snap.forEach(doc => rrhhRoles.push({ id: doc.id, ...doc.data() }));
            renderRoles();
            populateRoleSelects();
        });
    }

    function renderRoles() {
        const container = $('rrhh-roles-list');
        if (!container) return;
        if (!rrhhRoles.length) { container.innerHTML = '<p class="rrhh-empty">No hay roles creados</p>'; return; }
        container.innerHTML = rrhhRoles.map(role => `
            <div class="rrhh-role-card" style="--role-color: ${role.color}">
                <div class="rrhh-role-header">
                    <span class="rrhh-role-name">${role.name}</span>
                    <span class="rrhh-role-badge" style="background: ${role.color}">${role.name}</span>
                </div>
                <div class="rrhh-role-perms">
                    ${(role.permissions || []).map(p => {
                        const perm = RRHH_PERMISSIONS.find(pp => pp.key === p);
                        return perm ? `<span class="rrhh-role-perm-tag">${perm.label}</span>` : '';
                    }).join('')}
                </div>
                <div class="rrhh-role-actions">
                    <button class="rrhh-btn-edit" data-role-edit="${role.id}"><i class="fas fa-edit"></i> Editar</button>
                    ${!role.isDefault ? `<button class="rrhh-btn-delete" data-role-delete="${role.id}"><i class="fas fa-trash"></i> Eliminar</button>` : ''}
                </div>
            </div>
        `).join('');
    }

    function saveRole() {
        const name = $('rrhh-role-name').value.trim();
        const color = $('rrhh-role-color').value;
        const permissions = [];
        $('rrhh-role-permissions').querySelectorAll('.rrhh-perm-item.active').forEach(item => {
            permissions.push(item.dataset.perm);
        });
        if (!name) { showToast('Ingresa el nombre del rol', 'warning'); return; }
        if (!permissions.length) { showToast('Selecciona al menos un permiso', 'warning'); return; }
        const data = { name, color, permissions };
        $('rrhh-role-save-btn').disabled = true;
        if (rrhhEditingRoleId) {
            db.collection('rrhh_roles').doc(rrhhEditingRoleId).update(data).then(() => {
                showToast('Rol actualizado', 'success');
                resetRoleForm(); loadRRHHRoles();
            }).catch(() => { showToast('Error actualizando rol', 'warning'); $('rrhh-role-save-btn').disabled = false; });
        } else {
            data.isDefault = false;
            data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            db.collection('rrhh_roles').add(data).then(() => {
                showToast('Rol creado', 'success');
                resetRoleForm(); loadRRHHRoles();
            }).catch(() => { showToast('Error creando rol', 'warning'); $('rrhh-role-save-btn').disabled = false; });
        }
    }

    function resetRoleForm() {
        rrhhEditingRoleId = null;
        $('rrhh-role-name').value = '';
        $('rrhh-role-color').value = '#7b2d8e';
        $('rrhh-role-permissions').querySelectorAll('.rrhh-perm-item').forEach(item => {
            item.classList.remove('active');
            item.querySelector('input').checked = false;
        });
        $('rrhh-role-save-btn').disabled = false;
        $('rrhh-role-save-btn').innerHTML = '<i class="fas fa-save"></i> Guardar Rol';
        $('rrhh-role-form-title').textContent = 'Nuevo Rol';
    }

    function populateRoleSelects() {
        const options = rrhhRoles.map(r => `<option value="${r.id}" data-color="${r.color}">${r.name}</option>`).join('');
        const collabSelect = $('rrhh-collab-role');
        if (collabSelect) collabSelect.innerHTML = '<option value="">Seleccionar rol...</option>' + options;
    }

    // Delegated: role edit/delete
    document.addEventListener('click', (e) => {
        const editBtn = e.target.closest('[data-role-edit]');
        if (editBtn) {
            const role = rrhhRoles.find(r => r.id === editBtn.dataset.roleEdit);
            if (!role) return;
            rrhhEditingRoleId = role.id;
            $('rrhh-role-name').value = role.name;
            $('rrhh-role-color').value = role.color;
            $('rrhh-role-permissions').querySelectorAll('.rrhh-perm-item').forEach(item => {
                const isActive = (role.permissions || []).includes(item.dataset.perm);
                item.classList.toggle('active', isActive);
                item.querySelector('input').checked = isActive;
            });
            $('rrhh-role-save-btn').innerHTML = '<i class="fas fa-save"></i> Actualizar Rol';
            $('rrhh-role-form-title').textContent = 'Editar Rol';
            $('rrhh-tab-roles').scrollIntoView({ behavior: 'smooth' });
        }
        const deleteBtn = e.target.closest('[data-role-delete]');
        if (deleteBtn) {
            if (!confirm('¿Eliminar este rol?')) return;
            db.collection('rrhh_roles').doc(deleteBtn.dataset.roleDelete).delete().then(() => {
                showToast('Rol eliminado', 'success'); loadRRHHRoles();
            });
        }
    });

    // --- Collaborators ---
    function loadRRHHCollaborators() {
        db.collection('rrhh_collaborators').where('active', '==', true).orderBy('createdAt', 'desc').get().then(snap => {
            rrhhCollaborators = [];
            snap.forEach(doc => rrhhCollaborators.push({ id: doc.id, ...doc.data() }));
            renderCollaborators();
        }).catch(() => {
            // Index might not exist yet, try without ordering
            db.collection('rrhh_collaborators').get().then(snap => {
                rrhhCollaborators = [];
                snap.forEach(doc => { const d = doc.data(); if (d.active !== false) rrhhCollaborators.push({ id: doc.id, ...d }); });
                renderCollaborators();
            });
        });
    }

    function renderCollaborators() {
        const pending = rrhhCollaborators.filter(c => !c.biometricPhoto);
        const registered = rrhhCollaborators.filter(c => c.biometricPhoto);
        const pendSection = $('rrhh-pendientes-section');
        const pendList = $('rrhh-pendientes-list');
        if (pending.length) {
            pendSection.classList.remove('hidden');
            pendList.innerHTML = pending.map(c => renderCollabCard(c, true)).join('');
        } else {
            pendSection.classList.add('hidden');
        }
        const listContainer = $('rrhh-collabs-list');
        if (registered.length) {
            listContainer.innerHTML = registered.map(c => renderCollabCard(c, false)).join('');
        } else {
            listContainer.innerHTML = '<p class="rrhh-empty">No hay colaboradores con biometría registrada</p>';
        }
    }

    function renderCollabCard(collab, isPending) {
        const avatar = collab.biometricPhoto
            ? `<img src="${collab.biometricPhoto}" alt="${collab.name}">`
            : `<i class="fas fa-user"></i>`;
        const bioBtn = isPending
            ? `<button class="rrhh-bio-btn" data-collab-bio="${collab.id}"><i class="fas fa-camera"></i> Registrar Biometría</button>`
            : `<button class="rrhh-bio-btn registered"><i class="fas fa-check-circle"></i> Registrada</button>`;
        return `
            <div class="rrhh-collab-card">
                <div class="rrhh-collab-avatar">${avatar}</div>
                <div class="rrhh-collab-info">
                    <div class="rrhh-collab-name">${collab.name}</div>
                    <div class="rrhh-collab-detail">${collab.cedula || ''} · ${collab.phone || ''}</div>
                    <span class="rrhh-role-badge" style="background:${collab.roleColor};font-size:10px;padding:2px 8px;margin-top:4px;display:inline-block">${collab.roleName}</span>
                </div>
                <div class="rrhh-collab-actions">
                    ${bioBtn}
                    <button class="rrhh-btn-edit" data-collab-edit="${collab.id}" style="font-size:10px;padding:4px 8px"><i class="fas fa-edit"></i></button>
                </div>
            </div>`;
    }

    function saveCollaborator() {
        const name = $('rrhh-collab-name').value.trim();
        const cedula = $('rrhh-collab-cedula').value.trim();
        const phone = $('rrhh-collab-phone').value.trim();
        const roleId = $('rrhh-collab-role').value;
        if (!name || !roleId) { showToast('Completa nombre y rol', 'warning'); return; }
        const role = rrhhRoles.find(r => r.id === roleId);
        if (!role) { showToast('Rol inválido', 'warning'); return; }
        const data = { name, cedula, phone, roleId, roleName: role.name, roleColor: role.color, active: true };
        $('rrhh-collab-save-btn').disabled = true;
        if (rrhhEditingCollabId) {
            db.collection('rrhh_collaborators').doc(rrhhEditingCollabId).update(data).then(() => {
                showToast('Colaborador actualizado', 'success');
                resetCollabForm(); loadRRHHCollaborators();
            }).catch(() => { showToast('Error actualizando', 'warning'); $('rrhh-collab-save-btn').disabled = false; });
        } else {
            data.biometricPhoto = '';
            data.biometricDate = null;
            data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            db.collection('rrhh_collaborators').add(data).then(() => {
                showToast('Colaborador agregado', 'success');
                resetCollabForm(); loadRRHHCollaborators();
            }).catch(() => { showToast('Error agregando', 'warning'); $('rrhh-collab-save-btn').disabled = false; });
        }
    }

    function resetCollabForm() {
        rrhhEditingCollabId = null;
        $('rrhh-collab-name').value = '';
        $('rrhh-collab-cedula').value = '';
        $('rrhh-collab-phone').value = '';
        $('rrhh-collab-role').selectedIndex = 0;
        $('rrhh-collab-save-btn').disabled = false;
        $('rrhh-collab-save-btn').innerHTML = '<i class="fas fa-save"></i> Guardar Colaborador';
        $('rrhh-collab-form-title').textContent = 'Nuevo Colaborador';
    }


    // Delegated: bio register + collab edit
    document.addEventListener('click', (e) => {
        const bioBtn = e.target.closest('[data-collab-bio]');
        if (bioBtn) { openBiometricCapture(bioBtn.dataset.collabBio, 'register'); }

        const editCollabBtn = e.target.closest('[data-collab-edit]');
        if (editCollabBtn) {
            const collab = rrhhCollaborators.find(c => c.id === editCollabBtn.dataset.collabEdit);
            if (!collab) return;
            rrhhEditingCollabId = collab.id;
            $('rrhh-collab-name').value = collab.name;
            $('rrhh-collab-cedula').value = collab.cedula || '';
            $('rrhh-collab-phone').value = collab.phone || '';
            $('rrhh-collab-role').value = collab.roleId;
            $('rrhh-collab-save-btn').innerHTML = '<i class="fas fa-save"></i> Actualizar Colaborador';
            $('rrhh-collab-form-title').textContent = 'Editar Colaborador';
            document.querySelectorAll('.rrhh-tab-btn').forEach(b => b.classList.remove('active'));
            document.querySelector('[data-rrhh-tab="colaboradores"]').classList.add('active');
            ['roles','colaboradores','asistencia','reportes'].forEach(t => {
                const el = $('rrhh-tab-' + t);
                if (el) el.classList.toggle('hidden', t !== 'colaboradores');
            });
        }
    });

    // --- Camera / Biometric Flow ---
    function openBiometricCapture(collaboratorId, mode) {
        rrhhCameraMode = mode;
        rrhhCameraTargetId = collaboratorId;
        const collab = rrhhCollaborators.find(c => c.id === collaboratorId);
        if (!collab) return;
        if (mode === 'register') {
            $('rrhh-camera-title').textContent = 'Registro Biométrico';
            $('rrhh-camera-subtitle').textContent = `Capturando rostro de ${collab.name}`;
            $('rrhh-capture-btn').innerHTML = '<i class="fas fa-camera"></i> Capturar';
        } else {
            $('rrhh-camera-title').textContent = 'Verificación Biométrica';
            $('rrhh-camera-subtitle').textContent = `Verificando ${collab.name} — ${rrhhAttType === 'entrada' ? 'Entrada' : 'Salida'}`;
            $('rrhh-capture-btn').innerHTML = '<i class="fas fa-fingerprint"></i> Verificar';
        }
        $('rrhh-countdown').classList.add('hidden');
        $('rrhh-scan-line').classList.add('hidden');
        $('rrhh-scan-result').classList.add('hidden');
        $('rrhh-capture-btn').disabled = false;
        $('rrhh-camera-modal').classList.remove('hidden');
        navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } }).then(stream => {
            rrhhCameraStream = stream;
            const video = $('rrhh-camera-video');
            video.srcObject = stream;
            video.play();
        }).catch(() => {
            showToast('No se pudo acceder a la cámara', 'warning');
            closeBiometricCamera();
        });
    }

    function closeBiometricCamera() {
        $('rrhh-camera-modal').classList.add('hidden');
        if (rrhhCameraStream) {
            rrhhCameraStream.getTracks().forEach(track => track.stop());
            rrhhCameraStream = null;
        }
        const video = $('rrhh-camera-video');
        if (video) video.srcObject = null;
    }

    function startBiometricCountdown() {
        $('rrhh-capture-btn').disabled = true;
        const countdown = $('rrhh-countdown');
        const numberEl = $('rrhh-countdown-number');
        countdown.classList.remove('hidden');
        let count = 3;
        numberEl.textContent = count;
        const countInterval = setInterval(() => {
            count--;
            if (count > 0) {
                numberEl.textContent = count;
                numberEl.style.animation = 'none';
                void numberEl.offsetHeight;
                numberEl.style.animation = '';
            } else {
                clearInterval(countInterval);
                countdown.classList.add('hidden');
                performBiometricScan();
            }
        }, 1000);
    }

    function performBiometricScan() {
        const scanLine = $('rrhh-scan-line');
        scanLine.classList.remove('hidden');
        scanLine.style.animation = 'none';
        void scanLine.offsetHeight;
        scanLine.style.animation = '';
        setTimeout(() => {
            scanLine.classList.add('hidden');
            const video = $('rrhh-camera-video');
            const canvas = $('rrhh-camera-canvas');
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            canvas.getContext('2d').drawImage(video, 0, 0);
            const maxSize = 800;
            let w = canvas.width, h = canvas.height;
            if (w > maxSize || h > maxSize) {
                if (w > h) { h = Math.round(h * maxSize / w); w = maxSize; }
                else { w = Math.round(w * maxSize / h); h = maxSize; }
            }
            const resized = document.createElement('canvas');
            resized.width = w; resized.height = h;
            resized.getContext('2d').drawImage(canvas, 0, 0, w, h);
            const base64 = resized.toDataURL('image/jpeg', 0.7);
            const result = $('rrhh-scan-result');
            result.classList.remove('hidden');
            if (rrhhCameraMode === 'register') {
                $('rrhh-scan-result-text').textContent = 'Rostro Capturado';
                db.collection('rrhh_collaborators').doc(rrhhCameraTargetId).update({
                    biometricPhoto: base64,
                    biometricDate: firebase.firestore.FieldValue.serverTimestamp()
                }).then(() => {
                    setTimeout(() => {
                        closeBiometricCamera();
                        showToast('Biometría registrada correctamente', 'success');
                        loadRRHHCollaborators();
                    }, 1500);
                });
            } else {
                $('rrhh-scan-result-text').textContent = 'Identidad Verificada';
                setTimeout(() => {
                    closeBiometricCamera();
                    recordAttendance(rrhhCameraTargetId, base64);
                }, 1500);
            }
        }, 2000);
    }

    // --- Attendance ---
    function recordAttendance(collaboratorId, photo, type) {
        type = type || attScanType;
        const collab = rrhhCollaborators.find(c => c.id === collaboratorId);
        if (!collab) return;
        const now = new Date();
        const pad = n => String(n).padStart(2, '0');
        const localTime = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())} ${pad(now.getHours())}:${pad(now.getMinutes())}:${pad(now.getSeconds())}`;
        const localDate = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
        const record = {
            collaboratorId, collaboratorName: collab.name, roleName: collab.roleName, roleColor: collab.roleColor,
            type, photo, timestamp: firebase.firestore.FieldValue.serverTimestamp(), localTime, localDate
        };
        db.collection('rrhh_attendance').add(record).then(() => {
            showAttendanceConfirmation(collab, type, now);
        }).catch(() => { showToast('Error registrando asistencia', 'warning'); });
    }

    function showAttendanceConfirmation(collab, type, time) {
        $('rrhh-confirm-name').textContent = collab.name;
        $('rrhh-confirm-badge').textContent = collab.roleName;
        $('rrhh-confirm-badge').style.background = collab.roleColor;
        const typeEl = $('rrhh-confirm-type');
        typeEl.className = 'rrhh-confirm-type ' + type;
        typeEl.innerHTML = type === 'entrada'
            ? '<i class="fas fa-sign-in-alt"></i> Entrada'
            : '<i class="fas fa-sign-out-alt"></i> Salida';
        $('rrhh-confirm-time').textContent = time.toLocaleTimeString('es-PA', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true });
        const days = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
        const months = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
        $('rrhh-confirm-date').textContent = `${days[time.getDay()]}, ${time.getDate()} de ${months[time.getMonth()]} ${time.getFullYear()}`;
        // Reset checkmark animation
        const svg = document.querySelector('.rrhh-checkmark');
        if (svg) { svg.style.display = 'none'; void svg.offsetHeight; svg.style.display = ''; }
        $('rrhh-confirm-overlay').classList.remove('hidden');
    }

    // --- Clock ---
    function startRRHHClock() {
        updateRRHHClock();
        rrhhClockInterval = setInterval(updateRRHHClock, 1000);
        loadTodayAttendance();
    }

    function stopRRHHClock() {
        if (rrhhClockInterval) { clearInterval(rrhhClockInterval); rrhhClockInterval = null; }
    }

    function updateRRHHClock() {
        const now = new Date();
        const timeEl = $('rrhh-clock-time');
        const dateEl = $('rrhh-clock-date');
        if (timeEl) timeEl.textContent = now.toLocaleTimeString('es-PA', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
        const days = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
        const months = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
        if (dateEl) dateEl.textContent = `${days[now.getDay()]}, ${now.getDate()} de ${months[now.getMonth()]} ${now.getFullYear()}`;
    }

    function loadTodayAttendance() {
        const now = new Date();
        const pad = n => String(n).padStart(2, '0');
        const today = `${now.getFullYear()}-${pad(now.getMonth()+1)}-${pad(now.getDate())}`;
        db.collection('rrhh_attendance').where('localDate', '==', today).orderBy('timestamp', 'desc').get().then(snap => {
            const records = [];
            snap.forEach(doc => records.push({ id: doc.id, ...doc.data() }));
            renderTodayLog(records);
        }).catch(() => {
            // Index might not exist yet
            db.collection('rrhh_attendance').where('localDate', '==', today).get().then(snap => {
                const records = [];
                snap.forEach(doc => records.push({ id: doc.id, ...doc.data() }));
                renderTodayLog(records);
            });
        });
    }

    function renderTodayLog(records) {
        const container = $('rrhh-today-log');
        if (!container) return;
        if (!records.length) { container.innerHTML = '<p class="rrhh-empty">No hay registros para hoy</p>'; return; }
        container.innerHTML = records.map(r => {
            const time = r.localTime ? r.localTime.split(' ')[1] : '--:--:--';
            return `
            <div class="rrhh-log-entry">
                <div class="rrhh-log-type ${r.type}"><i class="fas ${r.type === 'entrada' ? 'fa-sign-in-alt' : 'fa-sign-out-alt'}"></i></div>
                <div class="rrhh-log-info">
                    <div class="rrhh-log-name">${r.collaboratorName}</div>
                    <div class="rrhh-log-time">${time} · <span style="color:${r.roleColor}">${r.roleName}</span></div>
                </div>
                <span class="rrhh-role-badge" style="background:${r.type === 'entrada' ? 'rgba(92,184,92,0.15)' : 'rgba(255,71,87,0.15)'};color:${r.type === 'entrada' ? '#5cb85c' : '#ff4757'};font-size:10px;padding:3px 10px">
                    ${r.type === 'entrada' ? 'Entrada' : 'Salida'}
                </span>
            </div>`;
        }).join('');
    }

    // --- Reports ---
    function getRRHHDateRange() {
        const now = new Date();
        const pad = n => String(n).padStart(2, '0');
        const fmt = d => `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
        if (rrhhReportRange === 'today') {
            return { startDate: fmt(now), endDate: fmt(now) };
        } else if (rrhhReportRange === 'week') {
            const dayOfWeek = now.getDay();
            const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
            const start = new Date(now); start.setDate(start.getDate() - mondayOffset);
            const end = new Date(start); end.setDate(end.getDate() + 6);
            return { startDate: fmt(start), endDate: fmt(end) };
        } else if (rrhhReportRange === 'month') {
            const start = new Date(now.getFullYear(), now.getMonth(), 1);
            const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
            return { startDate: fmt(start), endDate: fmt(end) };
        } else {
            const from = $('rrhh-report-from').value;
            const to = $('rrhh-report-to').value;
            if (!from || !to) { showToast('Selecciona fechas', 'warning'); return null; }
            return { startDate: from, endDate: to };
        }
    }

    function loadRRHHReports() {
        const range = getRRHHDateRange();
        if (!range) return;
        db.collection('rrhh_attendance')
            .where('localDate', '>=', range.startDate)
            .where('localDate', '<=', range.endDate)
            .orderBy('localDate', 'desc')
            .get().then(snap => {
                const records = [];
                snap.forEach(doc => records.push({ id: doc.id, ...doc.data() }));
                renderRRHHStats(records);
                renderRRHHTable(records);
            }).catch(() => {
                // Fallback without ordering
                db.collection('rrhh_attendance')
                    .where('localDate', '>=', range.startDate)
                    .where('localDate', '<=', range.endDate)
                    .get().then(snap => {
                        const records = [];
                        snap.forEach(doc => records.push({ id: doc.id, ...doc.data() }));
                        renderRRHHStats(records);
                        renderRRHHTable(records);
                    });
            });
    }

    function renderRRHHStats(records) {
        const total = records.length;
        const entradas = records.filter(r => r.type === 'entrada').length;
        const salidas = records.filter(r => r.type === 'salida').length;
        const uniqueCollabs = new Set(records.map(r => r.collaboratorId)).size;
        const container = $('rrhh-stats-grid');
        if (!container) return;
        container.innerHTML = `
            <div class="rrhh-stat-card"><div class="rrhh-stat-icon accent"><i class="fas fa-clipboard-list"></i></div><div class="rrhh-stat-info"><span>Total Registros</span><div class="rrhh-stat-value">${total}</div></div></div>
            <div class="rrhh-stat-card"><div class="rrhh-stat-icon green"><i class="fas fa-sign-in-alt"></i></div><div class="rrhh-stat-info"><span>Entradas</span><div class="rrhh-stat-value">${entradas}</div></div></div>
            <div class="rrhh-stat-card"><div class="rrhh-stat-icon red"><i class="fas fa-sign-out-alt"></i></div><div class="rrhh-stat-info"><span>Salidas</span><div class="rrhh-stat-value">${salidas}</div></div></div>
            <div class="rrhh-stat-card"><div class="rrhh-stat-icon blue"><i class="fas fa-users"></i></div><div class="rrhh-stat-info"><span>Colaboradores</span><div class="rrhh-stat-value">${uniqueCollabs}</div></div></div>`;
    }

    function renderRRHHTable(records) {
        const tbody = $('rrhh-report-tbody');
        if (!tbody) return;
        if (!records.length) {
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:var(--text-light);padding:24px">Sin registros en este período</td></tr>';
            return;
        }
        tbody.innerHTML = records.map(r => `
            <tr>
                <td>${r.localTime || '--'}</td>
                <td>${r.collaboratorName}</td>
                <td><span class="rrhh-role-badge" style="background:${r.roleColor};font-size:10px;padding:2px 8px">${r.roleName}</span></td>
                <td class="type-${r.type}">${r.type === 'entrada' ? '<i class="fas fa-sign-in-alt"></i> Entrada' : '<i class="fas fa-sign-out-alt"></i> Salida'}</td>
                <td>${r.photo ? '<img class="rrhh-table-photo" src="' + r.photo + '" alt="foto">' : '-'}</td>
            </tr>`).join('');
    }

    // ========================================
    // ASISTENCIA STANDALONE
    // ========================================
    let _attendanceInitialized = false;
    function initAttendance() {
        if (_attendanceInitialized) return;
        _attendanceInitialized = true;
        document.querySelectorAll('.att-type-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.att-type-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                attScanType = btn.dataset.attType;
            });
        });
        $('att-start-scan-btn').addEventListener('click', openAttendanceScan);
        $('att-scan-close').addEventListener('click', closeAttendanceScan);
    }

    function startAttClock() {
        updateAttClock();
        attClockInterval = setInterval(updateAttClock, 1000);
    }
    function stopAttClock() {
        try {
            if (attClockInterval) { clearInterval(attClockInterval); attClockInterval = null; }
            if (attScanClockInterval) { clearInterval(attScanClockInterval); attScanClockInterval = null; }
        } catch(e) { /* variable not yet initialized */ }
    }
    function updateAttClock() {
        const now = new Date();
        const timeEl = $('att-clock-time');
        const dateEl = $('att-clock-date');
        if (timeEl) timeEl.textContent = now.toLocaleTimeString('es-PA', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
        const days = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado'];
        const months = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];
        if (dateEl) dateEl.textContent = `${days[now.getDay()]}, ${now.getDate()} de ${months[now.getMonth()]} ${now.getFullYear()}`;
    }

    function openAttendanceScan() {
        const overlay = $('att-scan-overlay');
        overlay.classList.remove('hidden');
        // Update type display
        const typeEl = $('att-scan-type');
        typeEl.className = 'att-scan-type ' + attScanType;
        typeEl.innerHTML = attScanType === 'entrada'
            ? '<i class="fas fa-sign-in-alt"></i> Entrada'
            : '<i class="fas fa-sign-out-alt"></i> Salida';
        // Reset UI
        $('att-scan-line').classList.add('hidden');
        $('att-scan-pulse').classList.add('hidden');
        $('att-scan-result').classList.add('hidden');
        $('att-scan-status-text').textContent = 'Posiciona tu rostro en el centro';
        // Start clock in scan modal
        const updateScanClock = () => {
            const now = new Date();
            const el = $('att-scan-clock');
            if (el) el.textContent = now.toLocaleTimeString('es-PA', { hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false });
        };
        updateScanClock();
        attScanClockInterval = setInterval(updateScanClock, 1000);
        // Open camera
        navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } }
        }).then(stream => {
            attScanStream = stream;
            const video = $('att-scan-video');
            video.srcObject = stream;
            video.play();
            // Auto-trigger scan after 2 seconds
            setTimeout(() => { performAttendanceScan(); }, 2000);
        }).catch(() => {
            showToast('No se pudo acceder a la cámara', 'warning');
            closeAttendanceScan();
        });
    }

    function closeAttendanceScan() {
        $('att-scan-overlay').classList.add('hidden');
        if (attScanStream) {
            attScanStream.getTracks().forEach(track => track.stop());
            attScanStream = null;
        }
        const video = $('att-scan-video');
        if (video) video.srcObject = null;
        if (attScanClockInterval) { clearInterval(attScanClockInterval); attScanClockInterval = null; }
    }

    function performAttendanceScan() {
        $('att-scan-status-text').textContent = 'Escaneando rostro...';
        const scanLine = $('att-scan-line');
        const scanPulse = $('att-scan-pulse');
        scanLine.classList.remove('hidden');
        scanLine.style.animation = 'none';
        void scanLine.offsetHeight;
        scanLine.style.animation = '';
        scanPulse.classList.remove('hidden');

        setTimeout(() => {
            scanLine.classList.add('hidden');
            scanPulse.classList.add('hidden');
            // Capture frame
            const video = $('att-scan-video');
            const canvas = $('att-scan-canvas');
            if (!video || video.videoWidth === 0) {
                showAttScanFailure('No se pudo capturar la imagen. Intenta de nuevo.');
                return;
            }
            canvas.width = video.videoWidth;
            canvas.height = video.videoHeight;
            canvas.getContext('2d').drawImage(video, 0, 0);
            const maxSize = 800;
            let w = canvas.width, h = canvas.height;
            if (w > maxSize || h > maxSize) {
                if (w > h) { h = Math.round(h * maxSize / w); w = maxSize; }
                else { w = Math.round(w * maxSize / h); h = maxSize; }
            }
            const resized = document.createElement('canvas');
            resized.width = w; resized.height = h;
            resized.getContext('2d').drawImage(canvas, 0, 0, w, h);
            const capturedPhoto = resized.toDataURL('image/jpeg', 0.7);
            simulateFaceMatch(capturedPhoto);
        }, 2500);
    }

    function simulateFaceMatch(capturedPhoto) {
        $('att-scan-status-text').textContent = 'Comparando con registros biométricos...';
        const registeredCollabs = rrhhCollaborators.filter(c => c.biometricPhoto);
        if (registeredCollabs.length === 0) {
            showAttScanFailure('No hay colaboradores con biometría registrada');
            return;
        }
        // Simulate processing delay
        setTimeout(() => {
            // Always succeed if there are registered collaborators (simulated match)
            const matched = registeredCollabs[Math.floor(Math.random() * registeredCollabs.length)];
            showAttScanSuccess(matched, capturedPhoto);
        }, 1500);
    }

    function showAttScanSuccess(collab, capturedPhoto) {
        const result = $('att-scan-result');
        const icon = $('att-scan-result-icon');
        const text = $('att-scan-result-text');
        icon.className = 'fas fa-check-circle';
        text.textContent = `Identificado: ${collab.name}`;
        result.classList.remove('hidden');
        $('att-scan-status-text').textContent = 'Identidad verificada';
        setTimeout(() => {
            closeAttendanceScan();
            recordAttendance(collab.id, capturedPhoto, attScanType);
        }, 1500);
    }

    function showAttScanFailure(message) {
        const result = $('att-scan-result');
        const icon = $('att-scan-result-icon');
        const text = $('att-scan-result-text');
        icon.className = 'fas fa-times-circle';
        text.textContent = message;
        result.classList.remove('hidden');
        $('att-scan-status-text').textContent = 'Error en verificación';
        setTimeout(() => {
            closeAttendanceScan();
            showToast(message, 'warning');
        }, 2500);
    }

    // ========================================
    // RATING SYSTEM
    // ========================================

    function showRatingModal(order) {
        const overlay = $('rating-overlay');
        const orderRef = $('rating-order-ref');
        const starsContainer = $('rating-stars');
        const commentField = $('rating-comment');
        const submitBtn = $('btn-rating-submit');

        if (!overlay) return;

        currentRatingOrderId = order.id;
        selectedRating = 0;
        orderRef.textContent = order.number || '';
        commentField.value = '';
        submitBtn.disabled = true;

        // Reset stars
        starsContainer.querySelectorAll('i').forEach(s => {
            s.classList.remove('active', 'hovered');
        });

        overlay.classList.remove('hidden');
    }

    function closeRatingModal() {
        const overlay = $('rating-overlay');
        if (overlay) overlay.classList.add('hidden');
        currentRatingOrderId = null;
        selectedRating = 0;
    }

    async function submitRating() {
        if (!selectedRating || !currentRatingOrderId) return;
        const commentField = $('rating-comment');
        const comment = commentField ? commentField.value.trim() : '';

        try {
            await db.collection('orders').doc(currentRatingOrderId).update({
                rating: selectedRating,
                ratingComment: comment,
                ratedAt: firebase.firestore.FieldValue.serverTimestamp()
            });
            showToast('¡Gracias por tu calificación!', 'success');
            closeRatingModal();
        } catch (err) {
            console.error('Error submitting rating:', err);
            showToast('Error al enviar calificación', 'warning');
        }
    }

    // Rating stars interaction (event delegation)
    document.addEventListener('mouseover', (e) => {
        const star = e.target.closest('#rating-stars i[data-star]');
        if (!star) return;
        const val = parseInt(star.dataset.star);
        const container = star.parentElement;
        container.querySelectorAll('i').forEach(s => {
            const sv = parseInt(s.dataset.star);
            s.classList.toggle('hovered', sv <= val && sv > selectedRating);
        });
    });

    document.addEventListener('mouseout', (e) => {
        const star = e.target.closest('#rating-stars i[data-star]');
        if (!star) return;
        star.parentElement.querySelectorAll('i').forEach(s => s.classList.remove('hovered'));
    });

    document.addEventListener('click', (e) => {
        // Star click
        const star = e.target.closest('#rating-stars i[data-star]');
        if (star) {
            selectedRating = parseInt(star.dataset.star);
            const container = star.parentElement;
            container.querySelectorAll('i').forEach(s => {
                s.classList.toggle('active', parseInt(s.dataset.star) <= selectedRating);
                s.classList.remove('hovered');
            });
            const submitBtn = $('btn-rating-submit');
            if (submitBtn) submitBtn.disabled = false;
            return;
        }

        // Submit rating
        if (e.target.closest('#btn-rating-submit')) {
            submitRating();
            return;
        }

        // Skip rating
        if (e.target.closest('#btn-rating-skip')) {
            if (currentRatingOrderId) ratingDismissed.add(currentRatingOrderId);
            closeRatingModal();
            return;
        }

        // Rate button in Mis Pedidos
        const rateBtn = e.target.closest('[data-rate-order]');
        if (rateBtn) {
            const orderId = rateBtn.dataset.rateOrder;
            const orderNum = rateBtn.dataset.rateNumber;
            showRatingModal({ id: orderId, number: orderNum });
            return;
        }
    });

    // ========================================
    // FACTURACION — Invoice System
    // ========================================

    let factInvoices = [];
    let factCurrentRange = 'today';

    let _facturacionInitialized = false;
    function initFacturacion() {
        if (_facturacionInitialized) { loadFacturas(factCurrentRange || 'today'); return; }
        _facturacionInitialized = true;
        // Set default dates
        const today = new Date();
        const fromInput = $('fact-date-from');
        const toInput = $('fact-date-to');
        if (fromInput) fromInput.value = today.toISOString().split('T')[0];
        if (toInput) toInput.value = today.toISOString().split('T')[0];

        // Quick filter buttons
        document.querySelectorAll('.fact-quick-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.fact-quick-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                factCurrentRange = btn.dataset.range;
                loadFacturas(factCurrentRange);
            });
        });

        // Custom date filter
        const filterBtn = $('fact-filter-btn');
        if (filterBtn) {
            filterBtn.addEventListener('click', () => {
                document.querySelectorAll('.fact-quick-btn').forEach(b => b.classList.remove('active'));
                loadFacturasCustomRange();
            });
        }

        // Modal close
        const closeBtn = $('fact-modal-close');
        if (closeBtn) closeBtn.addEventListener('click', () => $('fact-modal').classList.add('hidden'));
        const modal = $('fact-modal');
        if (modal) modal.addEventListener('click', (e) => { if (e.target === modal) modal.classList.add('hidden'); });

        // Print
        const printBtn = $('fact-print-btn');
        if (printBtn) printBtn.addEventListener('click', () => window.print());

        loadFacturas('today');
    }

    function getDateRange(range) {
        const now = new Date();
        const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        let from, to;
        switch (range) {
            case 'today':
                from = today;
                to = new Date(today.getTime() + 86400000);
                break;
            case 'week':
                const dayOfWeek = today.getDay();
                const mondayOffset = dayOfWeek === 0 ? 6 : dayOfWeek - 1;
                from = new Date(today); from.setDate(today.getDate() - mondayOffset);
                to = new Date(today.getTime() + 86400000);
                break;
            case 'month':
                from = new Date(today.getFullYear(), today.getMonth(), 1);
                to = new Date(today.getTime() + 86400000);
                break;
            case 'all':
                from = new Date(2024, 0, 1);
                to = new Date(today.getTime() + 86400000);
                break;
            default:
                from = today;
                to = new Date(today.getTime() + 86400000);
        }
        return { from, to };
    }

    async function loadFacturas(range) {
        const { from, to } = getDateRange(range);
        await fetchInvoices(from, to);
    }

    async function loadFacturasCustomRange() {
        const fromVal = $('fact-date-from').value;
        const toVal = $('fact-date-to').value;
        if (!fromVal || !toVal) { showToast('Selecciona ambas fechas', 'warning'); return; }
        const from = new Date(fromVal + 'T00:00:00');
        const to = new Date(toVal + 'T23:59:59');
        await fetchInvoices(from, to);
    }

    async function fetchInvoices(from, to) {
        try {
            // Fetch orders (paid) and POS sales in parallel
            const [ordersSnap, salesSnap] = await Promise.all([
                db.collection('orders').where('createdAt', '>=', from).where('createdAt', '<=', to).orderBy('createdAt', 'desc').get(),
                db.collection('sales').where('createdAt', '>=', from).where('createdAt', '<=', to).orderBy('createdAt', 'desc').get()
            ]);

            factInvoices = [];

            ordersSnap.forEach(doc => {
                const d = doc.data();
                if (d.status === 'cancelado') return;
                // Skip orders already converted to sales to avoid double-counting
                if (d.convertedToSale) return;
                factInvoices.push({
                    id: doc.id,
                    type: 'order',
                    number: d.number || doc.id,
                    items: d.items || [],
                    subtotal: d.subtotal || 0,
                    delivery: d.delivery || 0,
                    tip: d.tip || 0,
                    discount: 0,
                    total: d.total || 0,
                    customer: d.customerName || 'Cliente',
                    phone: d.customerPhone || '',
                    address: d.address || '',
                    method: d.paymentMethod || 'efectivo',
                    paymentDetails: d.paymentDetails || {},
                    status: d.status || 'pendiente',
                    voided: d.voided || false,
                    voidReason: d.voidReason || '',
                    voidedAt: d.voidedAt ? d.voidedAt.toDate() : null,
                    date: d.createdAt ? d.createdAt.toDate() : new Date()
                });
            });

            salesSnap.forEach(doc => {
                const d = doc.data();
                factInvoices.push({
                    id: doc.id,
                    type: 'sale',
                    number: 'POS-' + doc.id.substring(0, 6).toUpperCase(),
                    items: d.items || [],
                    subtotal: d.subtotal || 0,
                    delivery: d.delivery || 0,
                    deliveryNote: d.deliveryNote || '',
                    tip: d.tip || 0,
                    discount: d.discountAmount || 0,
                    discountPct: d.discount || 0,
                    total: d.total || 0,
                    customer: d.customerName || (d.source === 'mesa' ? `Mesa ${d.tableNumber || ''}` : 'Venta POS'),
                    phone: d.customerPhone || '',
                    method: d.paymentMethod || 'efectivo',
                    paymentDetails: d.paymentDetails || {},
                    status: 'completado',
                    voided: d.voided || false,
                    voidReason: d.voidReason || '',
                    voidedAt: d.voidedAt ? d.voidedAt.toDate() : null,
                    date: d.createdAt ? d.createdAt.toDate() : new Date()
                });
            });

            // Sort by date desc
            factInvoices.sort((a, b) => b.date - a.date);
            renderFacturas();
        } catch (err) {
            console.error('Error loading invoices:', err);
            $('fact-list').innerHTML = '<p class="no-orders">Error cargando facturas</p>';
        }
    }

    function renderFacturas() {
        const container = $('fact-list');
        const countEl = $('fact-count');
        const totalEl = $('fact-total-sales');
        const avgEl = $('fact-avg');

        if (!factInvoices.length) {
            container.innerHTML = '<p class="no-orders">No hay facturas en este período</p>';
            if (countEl) countEl.textContent = '0';
            if (totalEl) totalEl.textContent = '$0.00';
            if (avgEl) avgEl.textContent = '$0.00';
            return;
        }

        // Exclude voided invoices from totals
        const activeInvoices = factInvoices.filter(inv => !inv.voided);
        const totalSales = activeInvoices.reduce((s, inv) => s + inv.total, 0);
        const avg = activeInvoices.length ? totalSales / activeInvoices.length : 0;

        if (countEl) countEl.textContent = activeInvoices.length;
        if (totalEl) totalEl.textContent = '$' + totalSales.toFixed(2);
        if (avgEl) avgEl.textContent = '$' + avg.toFixed(2);

        container.innerHTML = factInvoices.map((inv, idx) => {
            const dateStr = inv.date.toLocaleString('es-PA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
            const itemCount = inv.items.reduce((s, i) => s + (i.qty || i.quantity || 1), 0);
            return `
                <div class="fact-card ${inv.voided ? 'voided' : ''}" data-fact-idx="${idx}">
                    <div class="fact-card-icon ${inv.type}">
                        <i class="fas ${inv.type === 'order' ? 'fa-shopping-bag' : 'fa-cash-register'}"></i>
                    </div>
                    <div class="fact-card-info">
                        <div class="fact-card-title">${inv.number}${inv.voided ? ' <span class="fact-voided-badge">ANULADA</span>' : ''}</div>
                        <div class="fact-card-sub">${inv.customer} · ${itemCount} item${itemCount !== 1 ? 's' : ''}</div>
                    </div>
                    <span class="fact-card-method">${inv.method}</span>
                    <span class="fact-card-amount">$${inv.total.toFixed(2)}</span>
                    <span class="fact-card-date">${dateStr}</span>
                </div>
            `;
        }).join('');

        // Click to open detail
        container.querySelectorAll('.fact-card').forEach(card => {
            card.addEventListener('click', () => {
                const idx = parseInt(card.dataset.factIdx);
                showInvoiceDetail(factInvoices[idx]);
            });
        });
    }

    let currentInvoiceForVoid = null;

    function showInvoiceDetail(inv) {
        const modal = $('fact-modal');
        const titleEl = $('fact-modal-title');
        const bodyEl = $('fact-modal-body');

        currentInvoiceForVoid = inv;
        titleEl.innerHTML = inv.number + (inv.voided ? '<span class="fact-voided-badge">ANULADA</span>' : '');

        const dateStr = inv.date.toLocaleString('es-PA', { year: 'numeric', month: 'long', day: 'numeric', hour: '2-digit', minute: '2-digit' });

        let itemsHtml = inv.items.map(item => {
            const qty = item.qty || item.quantity || 1;
            const price = item.total || (item.price * qty) || 0;
            const size = item.size ? ` (${item.size})` : '';
            return `
                <div class="fact-inv-item">
                    <span class="fact-inv-item-name">${item.emoji || ''} ${item.name}${size}</span>
                    <span class="fact-inv-item-qty">x${qty}</span>
                    <span class="fact-inv-item-total">$${price.toFixed(2)}</span>
                </div>
            `;
        }).join('');

        let totalsHtml = '';
        if (inv.subtotal) totalsHtml += `<div class="fact-inv-total-line"><span>Subtotal</span><span>$${inv.subtotal.toFixed(2)}</span></div>`;
        if (inv.delivery > 0) totalsHtml += `<div class="fact-inv-total-line"><span><i class="fas fa-motorcycle" style="font-size:11px;color:var(--accent)"></i> Delivery${inv.deliveryNote ? ' <small style="color:var(--text-light)">(' + inv.deliveryNote + ')</small>' : ''}</span><span>$${inv.delivery.toFixed(2)}</span></div>`;
        if (inv.discount > 0) totalsHtml += `<div class="fact-inv-total-line"><span>Descuento${inv.discountPct ? ` (${inv.discountPct}%)` : ''}</span><span>-$${inv.discount.toFixed(2)}</span></div>`;
        if (inv.tip > 0) totalsHtml += `<div class="fact-inv-total-line"><span>Propina</span><span>$${inv.tip.toFixed(2)}</span></div>`;
        totalsHtml += `<div class="fact-inv-total-line fact-inv-total-main"><span>Total</span><span>$${inv.total.toFixed(2)}</span></div>`;

        // Build payment detail block based on method
        let paymentDetailsHtml = '';
        const pd = inv.paymentDetails || {};
        if (inv.method === 'efectivo' && pd.cashReceived) {
            paymentDetailsHtml = `
                <div class="fact-payment-details">
                    <div class="fact-pd-line"><span>Efectivo recibido:</span><span>$${Number(pd.cashReceived).toFixed(2)}</span></div>
                    <div class="fact-pd-line"><span>Cambio:</span><span>$${Number(pd.changeGiven || 0).toFixed(2)}</span></div>
                </div>`;
        } else if ((inv.method === 'tarjeta' || inv.method === 'ach' || inv.method === 'yappy') && pd.reference) {
            const labels = { tarjeta: 'Referencia tarjeta', ach: 'Ref. ACH / Transferencia', yappy: 'Ref. Yappy' };
            paymentDetailsHtml = `
                <div class="fact-payment-details">
                    <div class="fact-pd-line"><span>${labels[inv.method] || 'Referencia'}:</span><span>${pd.reference}</span></div>
                </div>`;
        }

        // Voided info block
        let voidedHtml = '';
        if (inv.voided) {
            const voidDate = inv.voidedAt ? inv.voidedAt.toLocaleString('es-PA', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
            voidedHtml = `<div class="fact-void-reason-block"><strong>ANULADA</strong>${voidDate ? ' — ' + voidDate : ''}<br>${inv.voidReason || 'Sin razón especificada'}</div>`;
        }

        bodyEl.innerHTML = `
            <div class="fact-inv-header">
                <div class="fact-inv-logo">XAZAI</div>
                <div class="fact-inv-sub">Açai Bar & Smoothies</div>
                <div class="fact-inv-number">${inv.number}</div>
                <div class="fact-inv-date">${dateStr}</div>
            </div>
            ${inv.customer ? `<div style="font-size:12px;color:var(--text-light);margin-bottom:12px"><strong>Cliente:</strong> ${inv.customer}${inv.phone ? ' · ' + inv.phone : ''}${inv.address ? '<br><strong>Dirección:</strong> ' + inv.address : ''}</div>` : ''}
            <div class="fact-inv-items">${itemsHtml}</div>
            <div class="fact-inv-totals">${totalsHtml}</div>
            <div style="font-size:11px;color:var(--text-light);margin-top:8px"><strong>Método de pago:</strong> ${inv.method}</div>
            ${paymentDetailsHtml}
            ${voidedHtml}
            <div class="fact-inv-footer">¡Gracias por tu compra! 💜<br>XAZAI - Açai Bar & Smoothies</div>
        `;

        // Hide/show void button based on whether already voided
        const voidBtn = $('fact-void-btn');
        if (voidBtn) {
            if (inv.voided) {
                voidBtn.classList.add('disabled');
                voidBtn.innerHTML = '<i class="fas fa-ban"></i> Ya Anulada';
            } else {
                voidBtn.classList.remove('disabled');
                voidBtn.innerHTML = '<i class="fas fa-ban"></i> Anular Factura';
            }
        }

        modal.classList.remove('hidden');
    }

    // Void invoice button handler
    document.addEventListener('click', (e) => {
        // Open void modal
        if (e.target.closest('#fact-void-btn') && currentInvoiceForVoid && !currentInvoiceForVoid.voided) {
            $('fact-void-reason').value = '';
            $('fact-void-error').style.display = 'none';
            $('fact-void-modal').classList.remove('hidden');
        }
        // Close void modal
        if (e.target.closest('#fact-void-modal-close') || e.target.closest('#fact-void-cancel-btn')) {
            $('fact-void-modal').classList.add('hidden');
        }
        // Confirm void
        if (e.target.closest('#fact-void-confirm-btn')) {
            const reason = ($('fact-void-reason').value || '').trim();
            if (!reason) {
                $('fact-void-error').style.display = 'block';
                return;
            }
            $('fact-void-error').style.display = 'none';
            voidInvoice(currentInvoiceForVoid, reason);
        }
    });

    function voidInvoice(inv, reason) {
        if (!inv || !inv.id) return;
        const collection = inv.type === 'order' ? 'orders' : 'sales';
        db.collection(collection).doc(inv.id).update({
            voided: true,
            voidReason: reason,
            voidedAt: firebase.firestore.FieldValue.serverTimestamp()
        }).then(() => {
            inv.voided = true;
            inv.voidReason = reason;
            inv.voidedAt = new Date();
            showToast('Factura anulada correctamente', 'success');
            $('fact-void-modal').classList.add('hidden');
            $('fact-modal').classList.add('hidden');
            renderFacturas();
        }).catch(err => {
            console.error('Error anulando factura:', err);
            showToast('Error al anular factura', 'warning');
        });
    }

    // Wire up facturacion section switching
    document.addEventListener('click', (e) => {
        const navBtn = e.target.closest('.admin-nav-btn[data-section="facturacion"]');
        if (navBtn) {
            initFacturacion();
        }
    });

    // ========================================
    // COMPORTAMIENTO — Analytics Dashboard
    // ========================================

    function detectDeviceType() {
        const ua = navigator.userAgent;
        if (/iPad|Android(?!.*Mobile)|tablet/i.test(ua)) return 'tablet';
        if (/iPhone|Android.*Mobile|webOS|iPod|BlackBerry|IEMobile|Opera Mini/i.test(ua)) return 'mobile';
        return 'desktop';
    }

    function getBehDateRange(range) {
        const now = new Date();
        const end = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
        let start;
        if (range === 'week') start = new Date(end.getTime() - 7 * 86400000);
        else if (range === 'month') start = new Date(end.getTime() - 30 * 86400000);
        else start = new Date(end.getTime() - 90 * 86400000);
        return {
            start: firebase.firestore.Timestamp.fromDate(start),
            end: firebase.firestore.Timestamp.fromDate(end)
        };
    }

    function loadBehaviorAnalytics() {
        const activeBtn = document.querySelector('.beh-range-btn.active');
        const range = activeBtn ? activeBtn.dataset.behRange : 'week';
        const { start, end } = getBehDateRange(range);

        Promise.all([
            db.collection('sales').where('createdAt', '>=', start).where('createdAt', '<', end).get(),
            db.collection('orders').where('createdAt', '>=', start).where('createdAt', '<', end).get()
        ]).then(([salesSnap, ordersSnap]) => {
            const transactions = [];
            salesSnap.forEach(doc => {
                const d = doc.data();
                if (!d.createdAt) return;
                // Skip voided sales
                if (d.voided) return;
                const date = new Date(d.createdAt.seconds * 1000);
                transactions.push({
                    timestamp: date,
                    hour: date.getHours(),
                    dayOfWeek: date.getDay(),
                    items: (d.items || []).map(it => ({ name: it.name, emoji: it.emoji || '', qty: it.qty || it.quantity || 1 })),
                    total: d.total || 0,
                    paymentMethod: d.paymentMethod || 'efectivo',
                    deviceType: d.deviceType || null,
                    customerPhone: d.customerPhone || null,
                    customerName: d.customerName || null,
                    status: 'completed',
                    type: 'sale'
                });
            });
            ordersSnap.forEach(doc => {
                const d = doc.data();
                if (!d.createdAt) return;
                // Skip orders already converted to sales to avoid double-counting
                if (d.convertedToSale) return;
                // Skip cancelled or voided orders — they don't represent real transactions
                if (d.status === 'cancelado') return;
                if (d.voided) return;
                const date = new Date(d.createdAt.seconds * 1000);
                transactions.push({
                    timestamp: date,
                    hour: date.getHours(),
                    dayOfWeek: date.getDay(),
                    items: (d.items || []).map(it => ({ name: it.name, emoji: it.emoji || '', qty: it.quantity || it.qty || 1 })),
                    total: d.total || 0,
                    paymentMethod: d.paymentMethod || 'yappy',
                    deviceType: d.deviceType || null,
                    customerPhone: d.customerPhone || null,
                    customerName: d.customerName || null,
                    status: d.status || 'pendiente',
                    type: 'order'
                });
            });
            renderBehKPIs(transactions);
            renderBehHeatmap(transactions);
            renderBehProductsByTime(transactions);
            renderBehPaymentTrends(transactions);
            renderBehDevices(transactions);
            renderBehCustomerPatterns(transactions);
        }).catch(err => {
            console.error('Error loading behavior analytics:', err);
        });
    }

    // Event listeners for date range buttons
    document.addEventListener('click', (e) => {
        const btn = e.target.closest('.beh-range-btn');
        if (!btn) return;
        document.querySelectorAll('.beh-range-btn').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        loadBehaviorAnalytics();
    });

    function renderBehKPIs(transactions) {
        const container = $('beh-kpi-grid');
        if (!container) return;
        const totalTx = transactions.length;
        const totalRevenue = transactions.reduce((s, t) => s + t.total, 0);
        const avgTicket = totalTx > 0 ? totalRevenue / totalTx : 0;
        const orders = transactions.filter(t => t.type === 'order');
        const completed = orders.filter(t => t.status === 'entregado' || t.status === 'listo');
        const completionRate = orders.length > 0 ? (completed.length / orders.length * 100) : 100;
        // Peak hour
        const hourCounts = {};
        transactions.forEach(t => { hourCounts[t.hour] = (hourCounts[t.hour] || 0) + 1; });
        let peakHour = '--';
        let peakCount = 0;
        Object.entries(hourCounts).forEach(([h, c]) => { if (c > peakCount) { peakCount = c; peakHour = h; } });
        const peakLabel = peakHour !== '--' ? `${peakHour}:00` : '--';

        container.innerHTML = `
            <div class="beh-kpi-card">
                <div class="beh-kpi-icon accent"><i class="fas fa-receipt"></i></div>
                <div class="beh-kpi-info"><span class="beh-kpi-value">${totalTx}</span><span class="beh-kpi-label">Total Transacciones</span></div>
            </div>
            <div class="beh-kpi-card">
                <div class="beh-kpi-icon green"><i class="fas fa-dollar-sign"></i></div>
                <div class="beh-kpi-info"><span class="beh-kpi-value">$${avgTicket.toFixed(2)}</span><span class="beh-kpi-label">Ticket Promedio</span></div>
            </div>
            <div class="beh-kpi-card">
                <div class="beh-kpi-icon blue"><i class="fas fa-check-circle"></i></div>
                <div class="beh-kpi-info"><span class="beh-kpi-value">${completionRate.toFixed(0)}%</span><span class="beh-kpi-label">Tasa Completado</span></div>
            </div>
            <div class="beh-kpi-card">
                <div class="beh-kpi-icon red"><i class="fas fa-fire"></i></div>
                <div class="beh-kpi-info"><span class="beh-kpi-value">${peakLabel}</span><span class="beh-kpi-label">Hora Pico</span></div>
            </div>`;
    }

    function renderBehHeatmap(transactions) {
        const container = $('beh-heatmap');
        if (!container) return;
        const dayNames = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
        const startHour = 7, endHour = 23;
        const cols = endHour - startHour + 1;
        // Build matrix [dayOfWeek 0-6][hour 7-23]
        const matrix = Array.from({ length: 7 }, () => Array(cols).fill(0));
        let maxCount = 0;
        transactions.forEach(t => {
            const h = t.hour;
            if (h >= startHour && h <= endHour) {
                matrix[t.dayOfWeek][h - startHour]++;
                if (matrix[t.dayOfWeek][h - startHour] > maxCount) maxCount = matrix[t.dayOfWeek][h - startHour];
            }
        });
        // Render grid: reorder to start from Lun (1) to Dom (0)
        const dayOrder = [1, 2, 3, 4, 5, 6, 0];
        let html = '<div class="beh-heat-label"></div>';
        for (let h = startHour; h <= endHour; h++) {
            html += `<div class="beh-heat-label beh-heat-header">${h}</div>`;
        }
        dayOrder.forEach(day => {
            html += `<div class="beh-heat-label">${dayNames[day]}</div>`;
            for (let hi = 0; hi < cols; hi++) {
                const count = matrix[day][hi];
                const intensity = maxCount > 0 ? count / maxCount : 0;
                html += `<div class="beh-heat-cell" data-count="${count}" style="background: rgba(233,30,140,${intensity * 0.85 + (count > 0 ? 0.1 : 0)})" title="${count} ventas — ${dayNames[day]} ${startHour + hi}:00">${count || ''}</div>`;
            }
        });
        container.style.gridTemplateColumns = `50px repeat(${cols}, 1fr)`;
        container.innerHTML = html;
    }

    function renderBehProductsByTime(transactions) {
        const container = $('beh-products-by-time');
        if (!container) return;
        const slots = [
            { label: 'Mañana', icon: 'fa-sun', range: [7, 12] },
            { label: 'Tarde', icon: 'fa-cloud-sun', range: [12, 17] },
            { label: 'Noche', icon: 'fa-moon', range: [17, 24] }
        ];
        let html = '<h3><i class="fas fa-clock"></i> Productos por Horario</h3>';
        slots.forEach(slot => {
            const slotTx = transactions.filter(t => t.hour >= slot.range[0] && t.hour < slot.range[1]);
            const itemCounts = {};
            slotTx.forEach(t => {
                t.items.forEach(it => {
                    const key = it.name;
                    if (!itemCounts[key]) itemCounts[key] = { name: it.name, emoji: it.emoji, count: 0 };
                    itemCounts[key].count += it.qty;
                });
            });
            const sorted = Object.values(itemCounts).sort((a, b) => b.count - a.count).slice(0, 3);
            html += `<div class="beh-time-slot">
                <div class="beh-time-header"><i class="fas ${slot.icon}"></i> ${slot.label} (${slot.range[0]}:00 - ${slot.range[1] === 24 ? '00' : slot.range[1]}:00)</div>`;
            if (sorted.length === 0) {
                html += '<div class="beh-time-item" style="color:var(--text-light);font-style:italic">Sin datos</div>';
            } else {
                sorted.forEach((item, i) => {
                    html += `<div class="beh-time-item"><span class="beh-item-rank">${i + 1}</span><span class="beh-item-emoji">${item.emoji}</span><span class="beh-item-name">${item.name}</span><span class="beh-item-count">${item.count}</span></div>`;
                });
            }
            html += '</div>';
        });
        container.innerHTML = html;
    }

    function renderBehPaymentTrends(transactions) {
        const container = $('beh-payment-trends');
        if (!container) return;
        const methods = { efectivo: 0, yappy: 0, tarjeta: 0, ach: 0 };
        transactions.forEach(t => {
            const m = (t.paymentMethod || 'efectivo').toLowerCase();
            if (methods.hasOwnProperty(m)) methods[m]++;
            else methods.efectivo++;
        });
        const total = transactions.length || 1;
        const labels = { efectivo: 'Efectivo', yappy: 'Yappy', tarjeta: 'Tarjeta', ach: 'ACH' };
        let html = '<h3><i class="fas fa-credit-card"></i> Tendencia de Pagos</h3>';
        Object.entries(methods).forEach(([key, count]) => {
            const pct = (count / total * 100).toFixed(0);
            html += `<div class="beh-pay-row">
                <span class="beh-pay-label">${labels[key]}</span>
                <div class="beh-pay-bar-bg"><div class="beh-pay-bar-fill ${key}" style="width:${pct}%"></div></div>
                <span class="beh-pay-value">${count}</span>
                <span class="beh-pay-pct">${pct}%</span>
            </div>`;
        });
        container.innerHTML = html;
    }

    function renderBehDevices(transactions) {
        const container = $('beh-devices');
        if (!container) return;
        const withDevice = transactions.filter(t => t.deviceType);
        const counts = { mobile: 0, desktop: 0, tablet: 0 };
        const icons = { mobile: 'fa-mobile-alt', desktop: 'fa-desktop', tablet: 'fa-tablet-alt' };
        const labels = { mobile: 'Móvil', desktop: 'Escritorio', tablet: 'Tablet' };
        const colors = { mobile: '#5bc0de', desktop: '#e91e8c', tablet: '#f0ad4e' };
        withDevice.forEach(t => { if (counts.hasOwnProperty(t.deviceType)) counts[t.deviceType]++; });
        const total = withDevice.length || 1;
        const currentDevice = detectDeviceType();

        let html = '<h3><i class="fas fa-mobile-alt"></i> Tráfico por Dispositivo</h3>';
        if (withDevice.length === 0) {
            html += `<div class="beh-empty"><i class="fas fa-chart-pie"></i>Recopilando datos de dispositivos...<br><small>Los nuevos pedidos registrarán esta información</small></div>
                <div class="beh-device-row">
                    <div class="beh-device-icon ${currentDevice}"><i class="fas ${icons[currentDevice]}"></i></div>
                    <div class="beh-device-info"><div class="beh-device-name">Tu dispositivo actual</div><div style="font-size:12px;color:var(--text-light)">${labels[currentDevice]}</div></div>
                </div>`;
        } else {
            Object.entries(counts).sort((a, b) => b[1] - a[1]).forEach(([key, count]) => {
                const pct = (count / total * 100).toFixed(0);
                html += `<div class="beh-device-row">
                    <div class="beh-device-icon ${key}"><i class="fas ${icons[key]}"></i></div>
                    <div class="beh-device-info">
                        <div class="beh-device-name">${labels[key]}</div>
                        <div class="beh-device-bar"><div class="beh-device-bar-fill" style="width:${pct}%;background:${colors[key]}"></div></div>
                    </div>
                    <span class="beh-device-pct">${pct}%</span>
                </div>`;
            });
            html += `<div class="beh-device-note">${withDevice.length} transacciones con datos de dispositivo</div>`;
        }
        container.innerHTML = html;
    }

    function renderBehCustomerPatterns(transactions) {
        const container = $('beh-customer-patterns');
        if (!container) return;
        const orders = transactions.filter(t => t.type === 'order' && t.customerPhone);
        const customerMap = {};
        orders.forEach(t => {
            const phone = t.customerPhone;
            if (!customerMap[phone]) customerMap[phone] = { name: t.customerName || 'Cliente', count: 0 };
            customerMap[phone].count++;
        });
        const customers = Object.values(customerMap);
        const newCustomers = customers.filter(c => c.count === 1).length;
        const returningCustomers = customers.filter(c => c.count > 1).length;
        const totalCustomers = customers.length || 1;
        const avgFreq = orders.length > 0 && customers.length > 0 ? (orders.length / customers.length).toFixed(1) : '0';
        const top5 = customers.sort((a, b) => b.count - a.count).slice(0, 5);

        let html = '<h3><i class="fas fa-users"></i> Patrones de Clientes</h3>';
        if (orders.length === 0) {
            html += '<div class="beh-empty"><i class="fas fa-user-friends"></i>Sin datos de clientes en este período</div>';
        } else {
            const newPct = (newCustomers / totalCustomers * 100).toFixed(0);
            const retPct = (returningCustomers / totalCustomers * 100).toFixed(0);
            html += `<div class="beh-cust-bar-container">
                <div class="beh-cust-bar-label"><span>Distribución de clientes</span><span>${customers.length} únicos</span></div>
                <div class="beh-cust-bar"><div class="beh-cust-bar-new" style="width:${newPct}%"></div><div class="beh-cust-bar-returning" style="width:${retPct}%"></div></div>
            </div>
            <div class="beh-cust-legend"><span class="beh-leg-new">Nuevos (${newCustomers})</span><span class="beh-leg-returning">Recurrentes (${returningCustomers})</span></div>
            <div style="font-size:12px;color:var(--text-light);margin-bottom:12px">Frecuencia promedio: <strong style="color:var(--text-white)">${avgFreq} pedidos/cliente</strong></div>`;
            if (top5.length > 0) {
                html += '<div style="font-size:12px;color:var(--text-light);margin-bottom:8px;font-weight:600">Top Clientes</div>';
                top5.forEach((c, i) => {
                    html += `<div class="beh-cust-stat"><span class="beh-cust-rank">${i + 1}</span><span class="beh-cust-name">${c.name}</span><span class="beh-cust-count">${c.count} pedidos</span></div>`;
                });
            }
        }
        container.innerHTML = html;
    }

    // ========================================
    // USUARIOS — Customer Management
    // ========================================
    let customersCache = [];
    let currentCustomerSort = 'recent';

    async function loadCustomers() {
        if (typeof db === 'undefined') return;
        const container = $('usr-list-container');
        if (container) container.innerHTML = '<div class="usr-loading"><i class="fas fa-spinner fa-spin"></i> Cargando clientes...</div>';
        try {
            const snap = await db.collection('customers').orderBy('lastOrderDate', 'desc').get();
            customersCache = [];
            snap.forEach(doc => customersCache.push({ id: doc.id, ...doc.data() }));
            renderCustomerList();
            updateCustomerStats();
        } catch (e) {
            console.error('loadCustomers error:', e);
            if (container) container.innerHTML = '<div class="usr-empty"><i class="fas fa-exclamation-triangle"></i><p>Error cargando clientes</p></div>';
        }
    }

    function updateCustomerStats() {
        const totalEl = $('usr-stat-total');
        const activeEl = $('usr-stat-active');
        const revenueEl = $('usr-stat-revenue');
        if (!totalEl) return;
        totalEl.textContent = customersCache.length;

        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        const active = customersCache.filter(c => {
            if (!c.lastOrderDate) return false;
            const d = c.lastOrderDate.toDate ? c.lastOrderDate.toDate() : new Date(c.lastOrderDate);
            return d >= thirtyDaysAgo;
        }).length;
        activeEl.textContent = active;

        const totalRevenue = customersCache.reduce((s, c) => s + (c.totalSpent || 0), 0);
        revenueEl.textContent = '$' + totalRevenue.toFixed(2);
    }

    function renderCustomerList() {
        const container = $('usr-list-container');
        if (!container) return;
        const searchVal = ($('usr-search') ? $('usr-search').value.trim().toLowerCase() : '');

        let filtered = customersCache;
        if (searchVal) {
            filtered = customersCache.filter(c =>
                (c.name && c.name.toLowerCase().includes(searchVal)) ||
                (c.phone && c.phone.includes(searchVal))
            );
        }

        // Sort
        const sorted = [...filtered];
        if (currentCustomerSort === 'recent') {
            sorted.sort((a, b) => {
                const da = a.lastOrderDate ? (a.lastOrderDate.toDate ? a.lastOrderDate.toDate() : new Date(a.lastOrderDate)) : new Date(0);
                const db2 = b.lastOrderDate ? (b.lastOrderDate.toDate ? b.lastOrderDate.toDate() : new Date(b.lastOrderDate)) : new Date(0);
                return db2 - da;
            });
        } else if (currentCustomerSort === 'spent') {
            sorted.sort((a, b) => (b.totalSpent || 0) - (a.totalSpent || 0));
        } else if (currentCustomerSort === 'orders') {
            sorted.sort((a, b) => (b.totalOrders || 0) - (a.totalOrders || 0));
        }

        if (sorted.length === 0) {
            container.innerHTML = '<div class="usr-empty"><i class="fas fa-user-friends"></i><p>' +
                (searchVal ? 'No se encontraron resultados' : 'No hay clientes registrados aún') + '</p></div>';
            return;
        }

        container.innerHTML = sorted.map(c => {
            const initials = getCustomerInitials(c.name, c.phone);
            const name = c.name || 'Sin nombre';
            const phone = c.phone || '';
            const orders = c.totalOrders || 0;
            const spent = (c.totalSpent || 0).toFixed(2);
            const lastDate = c.lastOrderDate
                ? formatRelativeDate(c.lastOrderDate.toDate ? c.lastOrderDate.toDate() : new Date(c.lastOrderDate))
                : 'N/A';
            const sourceClass = c.source || 'pos';
            const sourceLabel = c.source === 'both' ? 'Ambos' : (c.source === 'online' ? 'Online' : 'POS');
            return `<div class="usr-card" data-phone="${phone}">
                <div class="usr-avatar">${initials}</div>
                <div class="usr-card-info">
                    <div class="usr-card-name">${name} <span class="usr-source-badge ${sourceClass}">${sourceLabel}</span></div>
                    <div class="usr-card-phone"><i class="fas fa-phone"></i> ${phone}</div>
                    <div class="usr-card-meta">
                        <span><i class="fas fa-shopping-bag"></i> ${orders} pedidos</span>
                        <span><i class="fas fa-dollar-sign"></i> $${spent}</span>
                        <span><i class="fas fa-clock"></i> ${lastDate}</span>
                    </div>
                </div>
                <i class="fas fa-chevron-right usr-card-arrow"></i>
            </div>`;
        }).join('');
    }

    function getCustomerInitials(name, phone) {
        if (name && name !== 'Sin nombre') {
            const parts = name.trim().split(/\s+/);
            if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
            return name.substring(0, 2).toUpperCase();
        }
        return phone ? phone.slice(-2) : '??';
    }

    function formatRelativeDate(date) {
        const now = new Date();
        const diff = now - date;
        const mins = Math.floor(diff / 60000);
        const hours = Math.floor(diff / 3600000);
        const days = Math.floor(diff / 86400000);
        if (mins < 60) return 'Hace ' + mins + ' min';
        if (hours < 24) return 'Hace ' + hours + 'h';
        if (days < 7) return 'Hace ' + days + 'd';
        if (days < 30) return 'Hace ' + Math.floor(days / 7) + ' sem';
        return date.toLocaleDateString('es-PA', { day: '2-digit', month: 'short', year: 'numeric' });
    }

    async function openCustomerDetail(phone) {
        if (!phone) return;
        const listView = $('usr-list-view');
        const detailView = $('usr-detail-view');
        if (!listView || !detailView) return;
        listView.classList.add('hidden');
        detailView.classList.remove('hidden');

        // Find customer from cache
        const customer = customersCache.find(c => c.phone === phone || c.id === phone) || { phone, name: '', totalOrders: 0, totalSpent: 0 };

        // Render profile
        const profileEl = $('usr-profile');
        const initials = getCustomerInitials(customer.name, customer.phone);
        const addrHtml = customer.address ? `<div class="usr-profile-address"><i class="fas fa-map-marker-alt"></i> ${customer.address}</div>` : '';
        profileEl.innerHTML = `
            <div class="usr-profile-avatar">${initials}</div>
            <div class="usr-profile-info">
                <div class="usr-profile-name">${customer.name || 'Sin nombre'}</div>
                <div class="usr-profile-phone"><i class="fas fa-phone"></i> ${customer.phone}</div>
                ${addrHtml}
            </div>`;

        // Render stats
        const statsEl = $('usr-detail-stats');
        const avgTicket = customer.totalOrders > 0 ? (customer.totalSpent / customer.totalOrders).toFixed(2) : '0.00';
        const firstSeen = customer.firstSeen
            ? (customer.firstSeen.toDate ? customer.firstSeen.toDate() : new Date(customer.firstSeen)).toLocaleDateString('es-PA', { day: '2-digit', month: 'short', year: 'numeric' })
            : 'N/A';
        statsEl.innerHTML = `
            <div class="usr-d-stat">
                <div class="usr-d-stat-icon orders"><i class="fas fa-shopping-bag"></i></div>
                <span class="usr-d-stat-value">${customer.totalOrders || 0}</span>
                <span class="usr-d-stat-label">Pedidos</span>
            </div>
            <div class="usr-d-stat">
                <div class="usr-d-stat-icon spent"><i class="fas fa-dollar-sign"></i></div>
                <span class="usr-d-stat-value">$${(customer.totalSpent || 0).toFixed(2)}</span>
                <span class="usr-d-stat-label">Gastado</span>
            </div>
            <div class="usr-d-stat">
                <div class="usr-d-stat-icon avg"><i class="fas fa-receipt"></i></div>
                <span class="usr-d-stat-value">$${avgTicket}</span>
                <span class="usr-d-stat-label">Ticket Prom.</span>
            </div>
            <div class="usr-d-stat">
                <div class="usr-d-stat-icon first"><i class="fas fa-calendar-alt"></i></div>
                <span class="usr-d-stat-value" style="font-size:13px">${firstSeen}</span>
                <span class="usr-d-stat-label">Primera Visita</span>
            </div>`;

        // Load transactions (orders + sales)
        const timelineEl = $('usr-timeline');
        timelineEl.innerHTML = '<p class="usr-loading"><i class="fas fa-spinner fa-spin"></i> Cargando historial...</p>';

        try {
            const transactions = [];

            // Fetch from orders
            const ordersSnap = await db.collection('orders')
                .where('customerPhone', '==', phone)
                .limit(50)
                .get();
            ordersSnap.forEach(doc => {
                const d = doc.data();
                transactions.push({
                    id: d.number || doc.id,
                    type: 'online',
                    total: d.total || 0,
                    items: d.items || [],
                    paymentMethod: d.paymentMethod || '',
                    status: d.status || '',
                    createdAt: d.createdAt,
                    tip: d.tip || 0,
                    delivery: d.delivery || 0
                });
            });

            // Fetch from sales
            const salesSnap = await db.collection('sales')
                .where('customerPhone', '==', phone)
                .limit(50)
                .get();
            salesSnap.forEach(doc => {
                const d = doc.data();
                transactions.push({
                    id: 'POS-' + doc.id.substring(0, 5).toUpperCase(),
                    type: 'pos',
                    total: d.total || 0,
                    items: d.items || [],
                    paymentMethod: d.paymentMethod || '',
                    status: 'completado',
                    createdAt: d.createdAt,
                    tip: d.tip || 0,
                    delivery: d.delivery || 0
                });
            });

            // Sort by date desc
            transactions.sort((a, b) => {
                const da = a.createdAt ? (a.createdAt.toDate ? a.createdAt.toDate() : new Date(a.createdAt)) : new Date(0);
                const db2 = b.createdAt ? (b.createdAt.toDate ? b.createdAt.toDate() : new Date(b.createdAt)) : new Date(0);
                return db2 - da;
            });

            renderCustomerTimeline(transactions);
        } catch (e) {
            console.error('Error loading customer transactions:', e);
            timelineEl.innerHTML = '<div class="usr-no-history"><i class="fas fa-exclamation-triangle"></i><p>Error cargando historial</p></div>';
        }
    }

    function renderCustomerTimeline(transactions) {
        const el = $('usr-timeline');
        if (!el) return;
        if (transactions.length === 0) {
            el.innerHTML = '<div class="usr-no-history"><i class="fas fa-inbox"></i><p>No hay transacciones registradas</p></div>';
            return;
        }
        el.innerHTML = transactions.map(t => {
            const date = t.createdAt
                ? (t.createdAt.toDate ? t.createdAt.toDate() : new Date(t.createdAt)).toLocaleDateString('es-PA', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
                : 'Fecha desconocida';
            const icon = t.type === 'online' ? 'fa-globe' : 'fa-cash-register';
            const itemsSummary = t.items.map(i => `${i.emoji || ''} ${i.name}`).join(', ');
            const tipStr = t.tip > 0 ? ` + propina $${t.tip.toFixed(2)}` : '';
            const delStr = t.delivery > 0 ? ` + delivery $${t.delivery.toFixed(2)}` : '';
            return `<div class="usr-timeline-item">
                <div class="usr-tl-icon ${t.type}"><i class="fas ${icon}"></i></div>
                <div class="usr-tl-body">
                    <div class="usr-tl-top">
                        <span class="usr-tl-id">${t.id}</span>
                        <span class="usr-tl-amount">$${t.total.toFixed(2)}</span>
                    </div>
                    <div class="usr-tl-date">${date}${tipStr}${delStr} <span class="usr-tl-method">${t.paymentMethod}</span></div>
                    <div class="usr-tl-items">${itemsSummary || 'Sin detalle'}</div>
                </div>
            </div>`;
        }).join('');
    }

    function closeCustomerDetail() {
        const listView = $('usr-list-view');
        const detailView = $('usr-detail-view');
        if (listView) listView.classList.remove('hidden');
        if (detailView) detailView.classList.add('hidden');
    }

    // Usuarios event listeners
    document.addEventListener('click', (e) => {
        const card = e.target.closest('.usr-card');
        if (card) {
            const phone = card.dataset.phone;
            if (phone) openCustomerDetail(phone);
            return;
        }
        if (e.target.closest('#usr-back-btn')) {
            closeCustomerDetail();
            return;
        }
        const sortBtn = e.target.closest('.usr-sort-btn');
        if (sortBtn) {
            document.querySelectorAll('.usr-sort-btn').forEach(b => b.classList.remove('active'));
            sortBtn.classList.add('active');
            currentCustomerSort = sortBtn.dataset.sort;
            renderCustomerList();
        }
    });

    const usrSearchInput = $('usr-search');
    if (usrSearchInput) {
        let usrSearchTimeout;
        usrSearchInput.addEventListener('input', () => {
            clearTimeout(usrSearchTimeout);
            usrSearchTimeout = setTimeout(() => renderCustomerList(), 250);
        });
    }

    // ========================================
    // MESAS — Table Management
    // ========================================
    // Mesa state variables declared above near ordersUnsubscribe (hoisting fix)

    function initMesas() {
        if (mesasUnsubscribe) {
            renderMesasGrid(); // ya hay listener, solo redibujar
            return;
        }
        startMesasListener();
    }

    function startMesasListener() {
        mesasUnsubscribe = db.collection('tables').orderBy('tableNumber').onSnapshot(snapshot => {
            if (snapshot.empty) {
                // Sembrar 4 mesas iniciales
                for (let i = 1; i <= 4; i++) {
                    db.collection('tables').add({
                        tableNumber: i,
                        tableName: 'Mesa ' + i,
                        maxDiners: 4,
                        status: 'libre',
                        diners: [],
                        createdAt: firebase.firestore.FieldValue.serverTimestamp(),
                        updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
                        openedAt: null,
                        sessionId: ''
                    });
                }
                return;
            }
            mesasData = [];
            snapshot.forEach(doc => mesasData.push({ id: doc.id, ...doc.data() }));
            renderMesasGrid();
            // Si hay detalle abierto, actualizarlo
            if (currentMesa) {
                const updated = mesasData.find(m => m.id === currentMesa.id);
                if (updated) { currentMesa = updated; refreshMesaDetail(); }
            }
        }, err => console.error('Mesas listener error:', err));
    }

    // ---- VISTA MAPA ----
    function renderMesasGrid() {
        const grid = $('mesas-grid');
        if (!grid) return;
        const statusLabels = { libre: 'Libre', ocupada: 'Ocupada', cuenta_pedida: 'Cuenta pedida' };
        const statusIcons = { libre: 'fa-chair', ocupada: 'fa-utensils', cuenta_pedida: 'fa-file-invoice-dollar' };
        grid.innerHTML = mesasData.map(m => {
            const total = (m.diners || []).reduce((s, d) => {
                return s + (d.items || []).reduce((ds, it) => ds + (it.price * it.qty), 0);
            }, 0);
            const dinerCount = (m.diners || []).length;
            return `
            <div class="mesa-card status-${m.status}" data-mesa-id="${m.id}">
                <div class="mesa-card-icon"><i class="fas ${statusIcons[m.status] || 'fa-chair'}"></i></div>
                <div class="mesa-card-name">${m.tableName || 'Mesa ' + m.tableNumber}</div>
                <div class="mesa-card-status">${statusLabels[m.status] || m.status}</div>
                <div class="mesa-card-info">${m.status !== 'libre' ? `${dinerCount} comensal${dinerCount !== 1 ? 'es' : ''}` : `${m.maxDiners || 4} asientos`}</div>
                ${m.status !== 'libre' && total > 0 ? `<div class="mesa-card-total">$${total.toFixed(2)}</div>` : ''}
            </div>`;
        }).join('');

        grid.querySelectorAll('.mesa-card').forEach(card => {
            card.addEventListener('click', () => openMesaDetail(card.dataset.mesaId));
        });
    }

    function openMesaDetail(mesaId) {
        currentMesa = mesasData.find(m => m.id === mesaId);
        if (!currentMesa) return;
        currentDinerIdx = 0;
        $('mesas-map-view').classList.add('hidden');
        const detail = $('mesa-detail');
        detail.classList.remove('hidden');
        refreshMesaDetail();
        renderMesaProducts('all');
        bindMesaDetailEvents();
    }

    function refreshMesaDetail() {
        if (!currentMesa) return;
        $('mesa-detail-title').textContent = currentMesa.tableName || 'Mesa ' + currentMesa.tableNumber;
        const statusEl = $('mesa-detail-status');
        const statusLabels = { libre: 'Libre', ocupada: 'Ocupada', cuenta_pedida: 'Cuenta pedida' };
        statusEl.textContent = statusLabels[currentMesa.status] || currentMesa.status;
        statusEl.className = 'mesa-detail-status badge-' + currentMesa.status;

        // Botones de acción según estado
        const openBtn = $('mesa-open-btn');
        const billBtn = $('mesa-request-bill-btn');
        const closeBtn = $('mesa-close-btn');
        openBtn.classList.toggle('hidden', currentMesa.status !== 'libre');
        billBtn.classList.toggle('hidden', currentMesa.status !== 'ocupada');
        closeBtn.classList.toggle('hidden', currentMesa.status !== 'cuenta_pedida');

        // Panel de pedido: visible si mesa está ocupada/cuenta
        const orderLayout = $('mesa-order-layout');
        orderLayout.classList.toggle('hidden', currentMesa.status === 'libre');

        // Diner count control: solo si libre
        const countCtrl = $('mesa-diner-count-ctrl');
        if (countCtrl) {
            $('mesa-diner-count-display').textContent = currentMesa.maxDiners || 4;
        }

        renderMesaDiners();

        // Sección de cuenta
        const billSection = $('mesa-bill-section');
        billSection.classList.toggle('hidden', currentMesa.status !== 'cuenta_pedida');
        if (currentMesa.status === 'cuenta_pedida') renderMesaBill();
    }

    // ---- COMENSALES ----
    function renderMesaDiners() {
        const container = $('mesa-diners');
        if (!container) return;
        const diners = currentMesa.diners || [];
        if (!diners.length) { container.innerHTML = ''; return; }

        container.innerHTML = diners.map((d, idx) => {
            const itemCount = (d.items || []).reduce((s, it) => s + it.qty, 0);
            const subtotal = (d.items || []).reduce((s, it) => s + it.price * it.qty, 0);
            return `
            <div class="mesa-diner-tab ${idx === currentDinerIdx ? 'active' : ''}" data-diner-idx="${idx}">
                <div class="mesa-diner-tab-name">${d.name || 'Comensal ' + (idx + 1)}</div>
                <div class="mesa-diner-tab-info">${itemCount} item${itemCount !== 1 ? 's' : ''} · $${subtotal.toFixed(2)}</div>
            </div>`;
        }).join('') + `<div class="mesa-diner-tab mesa-diner-tab-add" id="mesa-add-diner-tab" title="Agregar comensal"><i class="fas fa-plus"></i></div>`;

        container.querySelectorAll('.mesa-diner-tab[data-diner-idx]').forEach(tab => {
            tab.addEventListener('click', () => {
                currentDinerIdx = parseInt(tab.dataset.dinerIdx);
                renderMesaDiners();
                renderCurrentDinerItems();
                updateMesaDinerSubtotal();
            });
        });

        const addTab = $('mesa-add-diner-tab');
        if (addTab) addTab.addEventListener('click', addMesaDiner);

        renderCurrentDinerItems();
        updateMesaDinerSubtotal();
        // Sync name input
        const nameInput = $('mesa-diner-name-input');
        if (nameInput && diners[currentDinerIdx]) {
            nameInput.value = diners[currentDinerIdx].name || '';
            nameInput.placeholder = 'Comensal ' + (currentDinerIdx + 1);
        }
    }

    function addMesaDiner() {
        if (!currentMesa) return;
        const diners = currentMesa.diners || [];
        diners.push({ id: diners.length + 1, name: '', items: [] });
        db.collection('tables').doc(currentMesa.id).update({ diners, updatedAt: firebase.firestore.FieldValue.serverTimestamp() })
            .then(() => { currentMesa.diners = diners; currentDinerIdx = diners.length - 1; renderMesaDiners(); });
    }

    function renderCurrentDinerItems() {
        const container = $('mesa-diner-items');
        if (!container) return;
        const diners = currentMesa.diners || [];
        const diner = diners[currentDinerIdx];
        if (!diner || !(diner.items || []).length) {
            container.innerHTML = '<p class="pos-empty">Sin items aún. Toca un producto para agregar.</p>';
            return;
        }
        container.innerHTML = diner.items.map((it, iIdx) => `
            <div class="mesa-diner-item-line">
                <span class="mesa-diner-item-name">${it.emoji || ''} ${it.name}${it.size ? ' (' + it.size + ')' : ''}</span>
                <div class="mesa-diner-item-controls">
                    <button class="mesa-qty-btn" data-item-idx="${iIdx}" data-action="minus">−</button>
                    <span>${it.qty}</span>
                    <button class="mesa-qty-btn" data-item-idx="${iIdx}" data-action="plus">+</button>
                    <button class="mesa-remove-item-btn" data-item-idx="${iIdx}"><i class="fas fa-trash"></i></button>
                </div>
                <span class="mesa-diner-item-price">$${(it.price * it.qty).toFixed(2)}</span>
            </div>`).join('');

        container.querySelectorAll('.mesa-qty-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const iIdx = parseInt(btn.dataset.itemIdx);
                const action = btn.dataset.action;
                const diners = currentMesa.diners || [];
                const diner = diners[currentDinerIdx];
                if (!diner) return;
                if (action === 'plus') diner.items[iIdx].qty++;
                else diner.items[iIdx].qty = Math.max(1, diner.items[iIdx].qty - 1);
                saveMesaDiners(diners);
            });
        });
        container.querySelectorAll('.mesa-remove-item-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const iIdx = parseInt(btn.dataset.itemIdx);
                const diners = currentMesa.diners || [];
                const diner = diners[currentDinerIdx];
                if (!diner) return;
                diner.items.splice(iIdx, 1);
                saveMesaDiners(diners);
            });
        });
    }

    function updateMesaDinerSubtotal() {
        const el = $('mesa-diner-subtotal');
        if (!el || !currentMesa) return;
        const diners = currentMesa.diners || [];
        const diner = diners[currentDinerIdx];
        const subtotal = diner ? (diner.items || []).reduce((s, it) => s + it.price * it.qty, 0) : 0;
        el.textContent = '$' + subtotal.toFixed(2);
    }

    function saveMesaDiners(diners) {
        db.collection('tables').doc(currentMesa.id).update({
            diners,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }).then(() => {
            currentMesa.diners = diners;
            renderMesaDiners();
            renderCurrentDinerItems();
            updateMesaDinerSubtotal();
            if (currentMesa.status === 'cuenta_pedida') renderMesaBill();
        });
    }

    // ---- PRODUCTOS (reutiliza MENU_ITEMS) ----
    function renderMesaProducts(catFilter) {
        const catContainer = $('mesa-categories');
        const grid = $('mesa-products-grid');
        if (!catContainer || !grid) return;

        const cats = Object.keys(CATEGORIES).filter(k => k !== 'inicio' && k !== 'arma-tu-bowl');
        catContainer.innerHTML = `<button class="pos-cat-btn ${catFilter === 'all' ? 'active' : ''}" data-mesa-cat="all">Todos</button>` +
            cats.map(k => `<button class="pos-cat-btn ${catFilter === k ? 'active' : ''}" data-mesa-cat="${k}"><i class="fas ${CATEGORIES[k].icon}"></i> ${CATEGORIES[k].name}</button>`).join('') +
            `<button class="pos-cat-btn ${catFilter === 'extras' ? 'active' : ''}" data-mesa-cat="extras"><i class="fas fa-plus-circle"></i> Extras</button>` +
            `<button class="pos-cat-btn ${catFilter === 'arma-tu-bowl' ? 'active' : ''}" data-mesa-cat="arma-tu-bowl"><i class="fas fa-wand-magic-sparkles"></i> Arma tu Bowl</button>`;

        catContainer.querySelectorAll('.pos-cat-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                catContainer.querySelectorAll('.pos-cat-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                renderMesaProducts(btn.dataset.mesaCat);
            });
        });

        // Bowl builder for mesas
        if (catFilter === 'arma-tu-bowl') {
            renderMesaBowlBuilder(grid);
            return;
        }

        const allMenuItems = getMenuItems().filter(i => isProductAvailable(i.id));
        const items = catFilter === 'extras' ? [] : (catFilter === 'all' ? allMenuItems : allMenuItems.filter(i => i.category === catFilter));
        let html = items.map(item => {
            const hasSizes = item.priceGrande != null && !item.onlyGrande;
            return `
            <div class="pos-product-card" data-mesa-product-id="${item.id}" data-has-sizes="${hasSizes}">
                ${item.image ? `<img src="${item.image}" class="pos-product-img" alt="${item.name}">` : `<span class="pos-product-emoji">${item.emoji}</span>`}
                <span class="pos-product-name">${item.name}</span>
                <span class="pos-product-price">${hasSizes ? `M $${item.price.toFixed(2)} / G $${item.priceGrande.toFixed(2)}` : `$${item.price.toFixed(2)}`}</span>
                ${hasSizes ? `
                <div class="pos-size-picker hidden" data-mesa-product-id="${item.id}">
                    <button class="pos-size-btn" data-size="M" data-price="${item.price}"><span class="size-label">M</span><span>$${item.price.toFixed(2)}</span></button>
                    <button class="pos-size-btn" data-size="G" data-price="${item.priceGrande}"><span class="size-label">G</span><span>$${item.priceGrande.toFixed(2)}</span></button>
                    <button class="pos-size-close"><i class="fas fa-times"></i></button>
                </div>` : ''}
            </div>`;
        }).join('');

        // Add extras/toppings
        const showExtras = catFilter === 'extras' || catFilter === 'all';
        if (showExtras && typeof EXTRA_TOPPINGS !== 'undefined') {
            if (items.length > 0) {
                html += `<div class="pos-extras-divider">Extras / Toppings</div>`;
            }
            html += EXTRA_TOPPINGS.map(item => `
                <div class="pos-product-card pos-extra-card" data-mesa-extra-id="${item.id}">
                    <span class="pos-product-emoji">${item.emoji}</span>
                    <span class="pos-product-name">${item.name}</span>
                    <span class="pos-product-price">$${item.price.toFixed(2)}</span>
                </div>
            `).join('');
        }

        grid.innerHTML = html;

        grid.querySelectorAll('.pos-product-card:not(.pos-extra-card)').forEach(card => {
            card.addEventListener('click', (e) => {
                if (e.target.closest('.pos-size-picker')) return;
                if (!currentMesa || currentMesa.status === 'libre') { showToast('Abre la mesa primero', 'warning'); return; }
                const productId = card.dataset.mesaProductId;
                const hasSizes = card.dataset.hasSizes === 'true';
                if (hasSizes) {
                    grid.querySelectorAll('.pos-size-picker').forEach(p => p.classList.add('hidden'));
                    const picker = card.querySelector('.pos-size-picker');
                    if (picker) picker.classList.remove('hidden');
                } else {
                    const item = getMenuItems().find(i => String(i.id) === String(productId));
                    if (item) addItemToCurrentDiner(item, null, item.price);
                }
            });
        });

        // Extra/topping click handlers for mesas
        grid.querySelectorAll('.pos-extra-card').forEach(card => {
            card.addEventListener('click', () => {
                if (!currentMesa || currentMesa.status === 'libre') { showToast('Abre la mesa primero', 'warning'); return; }
                const extraId = card.dataset.mesaExtraId;
                const extra = EXTRA_TOPPINGS.find(t => t.id === extraId);
                if (extra) {
                    addItemToCurrentDiner({ id: extraId, name: extra.name, emoji: extra.emoji, price: extra.price }, null, extra.price);
                }
            });
        });

        grid.querySelectorAll('.pos-size-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const picker = btn.closest('.pos-size-picker');
                const productId = picker.dataset.mesaProductId;
                const item = getMenuItems().find(i => String(i.id) === String(productId));
                if (item) addItemToCurrentDiner(item, btn.dataset.size, parseFloat(btn.dataset.price));
                picker.classList.add('hidden');
            });
        });

        grid.querySelectorAll('.pos-size-close').forEach(btn => {
            btn.addEventListener('click', (e) => { e.stopPropagation(); btn.closest('.pos-size-picker').classList.add('hidden'); });
        });
    }

    // ---- ARMA TU BOWL EN MESAS ----
    let mesaBowl = { base: null, protein: null, toppings: [], dressing: null };

    function renderMesaBowlBuilder(grid) {
        mesaBowl = { base: null, protein: null, toppings: [], dressing: null };

        function optBtn(opt, type) {
            return `<button class="mesa-bowl-opt" data-type="${type}" data-id="${opt.id}" data-price="${opt.price}" data-name="${opt.name}">
                <span class="mesa-bowl-opt-emoji">${opt.emoji}</span>
                <span class="mesa-bowl-opt-name">${opt.name}</span>
                <span class="mesa-bowl-opt-price">+$${opt.price.toFixed(2)}</span>
            </button>`;
        }

        grid.innerHTML = `
            <div class="mesa-bowl-builder">
                <div class="mesa-bowl-step">
                    <h4><span class="mesa-bowl-step-num">1</span> Base</h4>
                    <div class="mesa-bowl-options" data-step="base">${BUILD_OPTIONS.bases.map(o => optBtn(o, 'base')).join('')}</div>
                </div>
                <div class="mesa-bowl-step">
                    <h4><span class="mesa-bowl-step-num">2</span> Textura</h4>
                    <div class="mesa-bowl-options" data-step="protein">${BUILD_OPTIONS.proteins.map(o => optBtn(o, 'protein')).join('')}</div>
                </div>
                <div class="mesa-bowl-step">
                    <h4><span class="mesa-bowl-step-num">3</span> Toppings <small>(máx 4)</small></h4>
                    <div class="mesa-bowl-options" data-step="topping">${BUILD_OPTIONS.toppings.map(o => optBtn(o, 'topping')).join('')}</div>
                </div>
                <div class="mesa-bowl-step">
                    <h4><span class="mesa-bowl-step-num">4</span> Drizzle</h4>
                    <div class="mesa-bowl-options" data-step="dressing">${BUILD_OPTIONS.dressings.map(o => optBtn(o, 'dressing')).join('')}</div>
                </div>
                <div class="mesa-bowl-summary">
                    <div class="mesa-bowl-summary-lines" id="mesa-bowl-summary-lines"><p style="color:var(--text-light);font-size:12px">Selecciona los ingredientes</p></div>
                    <div class="mesa-bowl-summary-total"><span>Total:</span><span id="mesa-bowl-total">$0.00</span></div>
                    <button class="mesa-bowl-add-btn" id="mesa-bowl-add-btn" disabled><i class="fas fa-plus"></i> Agregar Bowl al Comensal</button>
                </div>
            </div>`;

        // Option click handlers
        grid.querySelectorAll('.mesa-bowl-opt').forEach(btn => {
            btn.addEventListener('click', () => {
                if (!currentMesa || currentMesa.status === 'libre') { showToast('Abre la mesa primero', 'warning'); return; }
                const { type, id, price, name } = btn.dataset;
                const priceNum = parseFloat(price);

                if (type === 'topping') {
                    if (btn.classList.contains('selected')) {
                        btn.classList.remove('selected');
                        mesaBowl.toppings = mesaBowl.toppings.filter(t => t.id !== id);
                    } else if (mesaBowl.toppings.length < 4) {
                        btn.classList.add('selected');
                        mesaBowl.toppings.push({ id, name, price: priceNum });
                    } else {
                        showToast('Máximo 4 toppings', 'warning');
                    }
                } else {
                    btn.closest('.mesa-bowl-options').querySelectorAll('.mesa-bowl-opt').forEach(b => b.classList.remove('selected'));
                    btn.classList.add('selected');
                    mesaBowl[type] = { id, name, price: priceNum };
                }
                updateMesaBowlSummary();
            });
        });

        // Add bowl button
        const addBtn = grid.querySelector('#mesa-bowl-add-btn');
        if (addBtn) {
            addBtn.addEventListener('click', () => {
                if (!mesaBowl.base || !mesaBowl.protein || !mesaBowl.dressing) return;
                if (!currentMesa || currentMesa.status === 'libre') { showToast('Abre la mesa primero', 'warning'); return; }

                let total = mesaBowl.base.price + mesaBowl.protein.price + mesaBowl.dressing.price;
                total += mesaBowl.toppings.reduce((s, t) => s + t.price, 0);

                const bowlItem = {
                    id: 'custom-' + Date.now(),
                    name: 'Bowl Personalizado',
                    emoji: '🎨',
                    price: total
                };
                addItemToCurrentDiner(bowlItem, null, total);
                showToast('Bowl personalizado agregado', 'success');
                // Reset
                mesaBowl = { base: null, protein: null, toppings: [], dressing: null };
                grid.querySelectorAll('.mesa-bowl-opt').forEach(b => b.classList.remove('selected'));
                updateMesaBowlSummary();
            });
        }
    }

    function updateMesaBowlSummary() {
        const linesEl = document.getElementById('mesa-bowl-summary-lines');
        const totalEl = document.getElementById('mesa-bowl-total');
        const addBtn = document.getElementById('mesa-bowl-add-btn');
        if (!linesEl) return;

        let total = 0, lines = [];
        if (mesaBowl.base) { lines.push(`<div class="mesa-bowl-line"><span>Base: ${mesaBowl.base.name}</span><span>$${mesaBowl.base.price.toFixed(2)}</span></div>`); total += mesaBowl.base.price; }
        if (mesaBowl.protein) { lines.push(`<div class="mesa-bowl-line"><span>Textura: ${mesaBowl.protein.name}</span><span>$${mesaBowl.protein.price.toFixed(2)}</span></div>`); total += mesaBowl.protein.price; }
        mesaBowl.toppings.forEach(t => { lines.push(`<div class="mesa-bowl-line"><span>Topping: ${t.name}</span><span>$${t.price.toFixed(2)}</span></div>`); total += t.price; });
        if (mesaBowl.dressing) { lines.push(`<div class="mesa-bowl-line"><span>Drizzle: ${mesaBowl.dressing.name}</span><span>$${mesaBowl.dressing.price.toFixed(2)}</span></div>`); total += mesaBowl.dressing.price; }

        linesEl.innerHTML = lines.length ? lines.join('') : '<p style="color:var(--text-light);font-size:12px">Selecciona los ingredientes</p>';
        if (totalEl) totalEl.textContent = '$' + total.toFixed(2);
        if (addBtn) addBtn.disabled = !(mesaBowl.base && mesaBowl.protein && mesaBowl.dressing);
    }

    function addItemToCurrentDiner(menuItem, size, price) {
        if (!currentMesa) return;
        const diners = currentMesa.diners || [];
        if (!diners[currentDinerIdx]) { showToast('Selecciona un comensal', 'warning'); return; }
        const diner = diners[currentDinerIdx];
        diner.items = diner.items || [];
        // Check if same item+size already exists → increase qty
        const existing = diner.items.find(it => String(it.productId) === String(menuItem.id) && it.size === (size || ''));
        if (existing) {
            existing.qty++;
        } else {
            diner.items.push({
                productId: menuItem.id,
                name: menuItem.name,
                emoji: menuItem.emoji || '',
                size: size || '',
                price,
                qty: 1
            });
        }
        saveMesaDiners(diners);
        showToast(`${menuItem.name} → ${diners[currentDinerIdx].name || 'Comensal ' + (currentDinerIdx + 1)}`, 'success');
    }

    // ---- CUENTA DE LA MESA ----
    function renderMesaBill() {
        const container = $('mesa-bill-diners');
        if (!container || !currentMesa) return;
        const diners = currentMesa.diners || [];
        let mesaTotal = 0;
        container.innerHTML = diners.map((d, idx) => {
            const dTotal = (d.items || []).reduce((s, it) => s + it.price * it.qty, 0);
            mesaTotal += dTotal;
            return `
            <div class="mesa-bill-diner-card">
                <div class="mesa-bill-diner-header">
                    <span>${d.name || 'Comensal ' + (idx + 1)}</span>
                    <span>$${dTotal.toFixed(2)}</span>
                </div>
                <div class="mesa-bill-diner-items">${(d.items || []).map(it => `${it.emoji} ${it.name}${it.size ? ' (' + it.size + ')' : ''} x${it.qty} — $${(it.price * it.qty).toFixed(2)}`).join('<br>')}</div>
                ${dTotal > 0 ? `<button class="mesa-pay-diner-btn" data-diner-idx="${idx}"><i class="fas fa-cash-register"></i> Cobrar este comensal ($${dTotal.toFixed(2)})</button>` : ''}
            </div>`;
        }).join('');

        const totalEl = $('mesa-bill-total');
        if (totalEl) totalEl.textContent = '$' + mesaTotal.toFixed(2);

        container.querySelectorAll('.mesa-pay-diner-btn').forEach(btn => {
            btn.addEventListener('click', () => openMesaPayModal(parseInt(btn.dataset.dinerIdx)));
        });
    }

    // ---- PAGO ----
    function getMesaPayingItems() {
        const diners = currentMesa ? (currentMesa.diners || []) : [];
        let payingItems = [];
        if (mesaPayDinerIdx !== null) {
            const d = diners[mesaPayDinerIdx];
            payingItems = d ? (d.items || []) : [];
        } else {
            diners.forEach(d => payingItems.push(...(d.items || [])));
        }
        return payingItems;
    }

    function openMesaPayModal(dinerIdx) {
        mesaPayDinerIdx = typeof dinerIdx === 'number' ? dinerIdx : null;
        mesaPayTip = 0;
        mesaPayMethod = 'efectivo';
        mesaPayDiscount = 0;

        const diners = currentMesa.diners || [];
        let payTitle = '';
        if (mesaPayDinerIdx !== null) {
            const d = diners[mesaPayDinerIdx];
            payTitle = d ? (d.name || 'Comensal ' + (mesaPayDinerIdx + 1)) : '';
        } else {
            payTitle = 'Mesa completa';
        }

        const payingItems = getMesaPayingItems();
        $('mesa-pay-title').textContent = '— ' + payTitle;
        $('mesa-pay-summary').innerHTML = `<div class="mesa-pay-summary-items">${payingItems.map(it => `<span>${it.emoji} ${it.name}${it.size ? '(' + it.size + ')' : ''} x${it.qty}</span><span>$${(it.price * it.qty).toFixed(2)}</span>`).join('')}</div>`;

        // Reset discount UI
        document.querySelectorAll('.mesa-discount-btn').forEach(b => b.classList.remove('active'));
        const discZero = document.querySelector('.mesa-discount-btn[data-discount="0"]');
        if (discZero) discZero.classList.add('active');
        const discCustom = $('mesa-discount-custom');
        if (discCustom) discCustom.classList.add('hidden');
        const discInput = $('mesa-discount-amount');
        if (discInput) discInput.value = '';

        // Reset tip UI
        document.querySelectorAll('.mesa-tip-type-btn').forEach(b => b.classList.remove('active'));
        const tipFixedBtn = document.querySelector('.mesa-tip-type-btn[data-mesa-tip-type="fixed"]');
        if (tipFixedBtn) tipFixedBtn.classList.add('active');
        const tipFixedOpts = $('mesa-tip-opts-fixed');
        const tipPctOpts = $('mesa-tip-opts-percent');
        if (tipFixedOpts) tipFixedOpts.classList.remove('hidden');
        if (tipPctOpts) tipPctOpts.classList.add('hidden');
        document.querySelectorAll('.mesa-tip-btn').forEach(b => b.classList.remove('active'));
        const tipZero = document.querySelector('.mesa-tip-btn[data-tip="0"]');
        if (tipZero) tipZero.classList.add('active');
        const tipCustom = $('mesa-tip-custom');
        if (tipCustom) tipCustom.classList.add('hidden');
        const tipInput = $('mesa-tip-amount');
        if (tipInput) tipInput.value = '';
        document.querySelectorAll('.mesa-tip-pct-btn').forEach(b => b.classList.remove('active'));

        // Reset payment method UI
        document.querySelectorAll('.mesa-method-btn').forEach(b => b.classList.remove('active'));
        const effBtn = document.querySelector('.mesa-method-btn[data-method="efectivo"]');
        if (effBtn) effBtn.classList.add('active');
        const cashChange = $('mesa-cash-change');
        if (cashChange) cashChange.style.display = 'block';
        document.querySelectorAll('.mesa-payment-details').forEach(d => d.classList.add('hidden'));
        const cashInput = $('mesa-cash-received');
        if (cashInput) cashInput.value = '';
        const changeEl = $('mesa-change-amount');
        if (changeEl) { changeEl.textContent = '$0.00'; changeEl.style.color = '#00e096'; }
        // Clear refs
        ['mesa-tarjeta-ref', 'mesa-ach-ref', 'mesa-yappy-ref'].forEach(id => { const el = $(id); if (el) el.value = ''; });

        updateMesaPayTotal();
        $('mesa-pay-modal').classList.remove('hidden');
    }

    function updateMesaPayTotal() {
        const payingItems = getMesaPayingItems();
        const subtotal = payingItems.reduce((s, it) => s + it.price * it.qty, 0);
        const discountAmt = subtotal * (mesaPayDiscount / 100);
        const afterDiscount = subtotal - discountAmt;
        const total = afterDiscount + mesaPayTip;

        // Update subtotal
        const subEl = $('mesa-pay-subtotal');
        if (subEl) subEl.textContent = '$' + subtotal.toFixed(2);

        // Update discount line
        const discLine = $('mesa-pay-discount-line');
        const discPct = $('mesa-pay-discount-pct');
        const discVal = $('mesa-pay-discount-value');
        if (mesaPayDiscount > 0) {
            if (discLine) discLine.classList.remove('hidden');
            if (discPct) discPct.textContent = mesaPayDiscount;
            if (discVal) discVal.textContent = '-$' + discountAmt.toFixed(2);
        } else {
            if (discLine) discLine.classList.add('hidden');
        }

        // Update tip display
        const tipEl = $('mesa-pay-tip-display');
        if (tipEl) tipEl.textContent = '$' + mesaPayTip.toFixed(2);

        // Update total
        const totalEl = $('mesa-pay-total');
        if (totalEl) totalEl.textContent = '$' + total.toFixed(2);

        // Update cash change if visible
        const cashInput = $('mesa-cash-received');
        if (cashInput && cashInput.value) {
            const received = parseFloat(cashInput.value) || 0;
            const change = received - total;
            const changeEl = $('mesa-change-amount');
            if (changeEl) {
                changeEl.textContent = change >= 0 ? '$' + change.toFixed(2) : '-$' + Math.abs(change).toFixed(2);
                changeEl.style.color = change >= 0 ? '#00e096' : '#ff6b6b';
            }
        }
    }

    let _mesaProcessing = false;
    function processMesaPayment() {
        if (_mesaProcessing) return;
        const diners = currentMesa ? (currentMesa.diners || []) : [];
        const payingItems = getMesaPayingItems();
        if (!payingItems.length) { showToast('No hay items para cobrar', 'warning'); return; }
        _mesaProcessing = true;

        const subtotal = payingItems.reduce((s, it) => s + it.price * it.qty, 0);
        const discountAmt = subtotal * (mesaPayDiscount / 100);
        const afterDiscount = subtotal - discountAmt;
        const total = afterDiscount + mesaPayTip;

        // Collect payment details
        let paymentDetails = {};
        if (mesaPayMethod === 'efectivo') {
            const received = parseFloat(($('mesa-cash-received') || {}).value) || 0;
            paymentDetails = { cashReceived: received, change: Math.max(0, received - total) };
        } else if (mesaPayMethod === 'tarjeta') {
            paymentDetails = { lastDigits: ($('mesa-tarjeta-ref') || {}).value || '' };
        } else if (mesaPayMethod === 'ach') {
            paymentDetails = { reference: ($('mesa-ach-ref') || {}).value || '' };
        } else if (mesaPayMethod === 'yappy') {
            paymentDetails = { reference: ($('mesa-yappy-ref') || {}).value || '' };
        }

        const sale = {
            items: payingItems.map(it => ({ productId: it.productId || null, name: it.name, emoji: it.emoji, qty: it.qty, price: it.price, size: it.size || '', total: it.price * it.qty })),
            subtotal,
            discount: mesaPayDiscount,
            discountAmount: discountAmt,
            tip: mesaPayTip,
            delivery: 0,
            total,
            paymentMethod: mesaPayMethod,
            paymentDetails,
            source: 'mesa',
            tableNumber: currentMesa.tableNumber,
            tableName: currentMesa.tableName || 'Mesa ' + currentMesa.tableNumber,
            customerName: mesaPayDinerIdx !== null ? (diners[mesaPayDinerIdx] ? diners[mesaPayDinerIdx].name || '' : '') : diners.map(d => d.name || '').filter(n => n).join(', '),
            customerPhone: '',
            deviceType: detectDeviceType(),
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            date: new Date().toLocaleDateString('es-PA')
        };

        db.collection('sales').add(sale).then(() => {
            decrementInventoryOnSale(sale.items);
            showToast(`Pago registrado: $${total.toFixed(2)}`, 'success');
            playCashRegisterSound();
            // FIX #9: Track mesa customers if phone is available
            // Mesa diner names are saved as customerName in the sale
            // No phone captured for mesas, but we register by name for future reference
            $('mesa-pay-modal').classList.add('hidden');

            if (mesaPayDinerIdx !== null) {
                diners[mesaPayDinerIdx].items = [];
                saveMesaDiners(diners);
                const allEmpty = diners.every(d => !(d.items || []).length);
                if (allEmpty) closeMesa();
            } else {
                closeMesa();
            }
            loadTodaySales();
            _mesaProcessing = false;
        }).catch(() => { _mesaProcessing = false; showToast('Error registrando pago', 'warning'); });
    }

    // ---- ESTADO DE MESA ----
    function openMesa() {
        if (!currentMesa) return;
        const maxDiners = currentMesa.maxDiners || 4;
        const diners = [];
        for (let i = 0; i < maxDiners; i++) {
            diners.push({ id: i + 1, name: '', items: [] });
        }
        db.collection('tables').doc(currentMesa.id).update({
            status: 'ocupada',
            diners,
            openedAt: firebase.firestore.FieldValue.serverTimestamp(),
            sessionId: Date.now().toString(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }).then(() => {
            currentMesa.status = 'ocupada';
            currentMesa.diners = diners;
            currentDinerIdx = 0;
            refreshMesaDetail();
            showToast('Mesa abierta', 'success');
        });
    }

    function requestMesaBill() {
        if (!currentMesa) return;
        db.collection('tables').doc(currentMesa.id).update({
            status: 'cuenta_pedida',
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }).then(() => {
            currentMesa.status = 'cuenta_pedida';
            refreshMesaDetail();
            showToast('Cuenta solicitada', 'info');
        });
    }

    function closeMesa() {
        if (!currentMesa) return;
        db.collection('tables').doc(currentMesa.id).update({
            status: 'libre',
            diners: [],
            openedAt: null,
            sessionId: '',
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }).then(() => {
            showToast('Mesa cerrada ✓', 'success');
            backToMesasMap();
        });
    }

    function backToMesasMap() {
        currentMesa = null;
        $('mesa-detail').classList.add('hidden');
        $('mesas-map-view').classList.remove('hidden');
    }

    // ---- DINER COUNT (cuando mesa está libre) ----
    function updateMesaDinerCount(delta) {
        if (!currentMesa || currentMesa.status !== 'libre') return;
        const newCount = Math.max(1, Math.min(20, (currentMesa.maxDiners || 4) + delta));
        db.collection('tables').doc(currentMesa.id).update({
            maxDiners: newCount,
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        }).then(() => {
            currentMesa.maxDiners = newCount;
            $('mesa-diner-count-display').textContent = newCount;
        });
    }

    function addMesaTable() {
        const nextNum = mesasData.length > 0 ? Math.max(...mesasData.map(m => m.tableNumber || 0)) + 1 : 1;
        db.collection('tables').add({
            tableNumber: nextNum,
            tableName: 'Mesa ' + nextNum,
            maxDiners: 4,
            status: 'libre',
            diners: [],
            createdAt: firebase.firestore.FieldValue.serverTimestamp(),
            updatedAt: firebase.firestore.FieldValue.serverTimestamp(),
            openedAt: null,
            sessionId: ''
        }).then(() => showToast('Mesa ' + nextNum + ' agregada', 'success'));
    }

    // ---- BIND EVENTOS DETALLE (solo una vez) ----
    let mesaDetailEventsBound = false;
    function bindMesaDetailEvents() {
        if (mesaDetailEventsBound) return;
        mesaDetailEventsBound = true;

        // Back button
        const backBtn = $('mesa-back-btn');
        if (backBtn) backBtn.addEventListener('click', backToMesasMap);

        // Open table
        const openBtn = $('mesa-open-btn');
        if (openBtn) openBtn.addEventListener('click', openMesa);

        // Request bill
        const billBtn = $('mesa-request-bill-btn');
        if (billBtn) billBtn.addEventListener('click', requestMesaBill);

        // Close table
        const closeBtn = $('mesa-close-btn');
        if (closeBtn) closeBtn.addEventListener('click', () => { if (confirm('¿Cerrar la mesa sin cobrar?')) closeMesa(); });

        // Pay all button
        const payAllBtn = $('mesa-bill-pay-all');
        if (payAllBtn) payAllBtn.addEventListener('click', () => openMesaPayModal(null));

        // Add table button (in map view)
        const addTableBtn = $('mesas-add-table');
        if (addTableBtn) addTableBtn.addEventListener('click', addMesaTable);

        // Diner count controls
        const minusBtn = $('mesa-diner-minus');
        const plusBtn = $('mesa-diner-plus');
        if (minusBtn) minusBtn.addEventListener('click', () => updateMesaDinerCount(-1));
        if (plusBtn) plusBtn.addEventListener('click', () => updateMesaDinerCount(1));

        // Save diner name
        const saveNameBtn = $('mesa-save-name-btn');
        const nameInput = $('mesa-diner-name-input');
        if (saveNameBtn && nameInput) {
            saveNameBtn.addEventListener('click', () => {
                const diners = currentMesa ? (currentMesa.diners || []) : [];
                if (!diners[currentDinerIdx]) return;
                diners[currentDinerIdx].name = nameInput.value.trim();
                saveMesaDiners(diners);
                showToast('Nombre guardado', 'success');
            });
            nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') saveNameBtn.click(); });
        }

        // Payment modal events
        const payClose = $('mesa-pay-close');
        if (payClose) payClose.addEventListener('click', () => $('mesa-pay-modal').classList.add('hidden'));
        const payModal = $('mesa-pay-modal');
        if (payModal) payModal.addEventListener('click', (e) => { if (e.target === payModal) payModal.classList.add('hidden'); });

        // Payment method buttons
        document.querySelectorAll('.mesa-method-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.mesa-method-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                mesaPayMethod = btn.dataset.method;
                // Toggle cash change section
                const cashChange = $('mesa-cash-change');
                if (cashChange) cashChange.style.display = mesaPayMethod === 'efectivo' ? 'block' : 'none';
                // Toggle payment detail fields
                document.querySelectorAll('.mesa-payment-details').forEach(d => d.classList.add('hidden'));
                const detailEl = $('mesa-payment-details-' + mesaPayMethod);
                if (detailEl) detailEl.classList.remove('hidden');
            });
        });

        // Discount buttons
        document.querySelectorAll('.mesa-discount-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.mesa-discount-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const discVal = btn.dataset.discount;
                if (discVal === 'custom') {
                    $('mesa-discount-custom').classList.remove('hidden');
                    mesaPayDiscount = parseFloat(($('mesa-discount-amount') || {}).value) || 0;
                } else {
                    $('mesa-discount-custom').classList.add('hidden');
                    mesaPayDiscount = parseFloat(discVal) || 0;
                }
                updateMesaPayTotal();
            });
        });
        const mesaDiscInput = $('mesa-discount-amount');
        if (mesaDiscInput) {
            mesaDiscInput.addEventListener('input', () => {
                mesaPayDiscount = Math.min(100, Math.max(0, parseFloat(mesaDiscInput.value) || 0));
                updateMesaPayTotal();
            });
        }

        // Tip type toggle ($ Fijo / % Pct)
        document.querySelectorAll('.mesa-tip-type-btn').forEach(typeBtn => {
            typeBtn.addEventListener('click', () => {
                document.querySelectorAll('.mesa-tip-type-btn').forEach(b => b.classList.remove('active'));
                typeBtn.classList.add('active');
                const mode = typeBtn.dataset.mesaTipType;
                if (mode === 'fixed') {
                    $('mesa-tip-opts-fixed').classList.remove('hidden');
                    $('mesa-tip-opts-percent').classList.add('hidden');
                } else {
                    $('mesa-tip-opts-fixed').classList.add('hidden');
                    $('mesa-tip-opts-percent').classList.remove('hidden');
                }
                mesaPayTip = 0;
                $('mesa-tip-custom').classList.add('hidden');
                document.querySelectorAll('.mesa-tip-btn').forEach(b => b.classList.remove('active'));
                const zeroBtn = document.querySelector('.mesa-tip-btn[data-tip="0"]');
                if (zeroBtn) zeroBtn.classList.add('active');
                document.querySelectorAll('.mesa-tip-pct-btn').forEach(b => b.classList.remove('active'));
                updateMesaPayTotal();
            });
        });

        // Tip buttons (fixed amounts)
        document.querySelectorAll('.mesa-tip-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.mesa-tip-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                const tipVal = btn.dataset.tip;
                if (tipVal === 'custom') {
                    $('mesa-tip-custom').classList.remove('hidden');
                    mesaPayTip = parseFloat(($('mesa-tip-amount') || {}).value) || 0;
                } else {
                    $('mesa-tip-custom').classList.add('hidden');
                    mesaPayTip = parseFloat(tipVal) || 0;
                }
                updateMesaPayTotal();
            });
        });

        // Tip percentage buttons
        document.querySelectorAll('.mesa-tip-pct-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                document.querySelectorAll('.mesa-tip-pct-btn').forEach(b => b.classList.remove('active'));
                btn.classList.add('active');
                $('mesa-tip-custom').classList.add('hidden');
                const pct = parseFloat(btn.dataset.pct) || 0;
                const payingItems = getMesaPayingItems();
                const subtotal = payingItems.reduce((s, it) => s + it.price * it.qty, 0);
                const discountAmt = subtotal * (mesaPayDiscount / 100);
                const afterDiscount = subtotal - discountAmt;
                mesaPayTip = Math.round(afterDiscount * pct / 100 * 100) / 100;
                updateMesaPayTotal();
            });
        });

        // Tip custom input
        const mesaTipInput = $('mesa-tip-amount');
        if (mesaTipInput) {
            mesaTipInput.addEventListener('input', () => {
                mesaPayTip = parseFloat(mesaTipInput.value) || 0;
                updateMesaPayTotal();
            });
        }

        // Cash received input
        const mesaCashInput = $('mesa-cash-received');
        if (mesaCashInput) {
            mesaCashInput.addEventListener('input', () => {
                updateMesaPayTotal();
            });
        }

        const confirmPayBtn = $('mesa-confirm-pay');
        if (confirmPayBtn) confirmPayBtn.addEventListener('click', processMesaPayment);
    }

    // ========================================
    // MENU ADMIN — CRUD de Productos
    // ========================================

    function getMenuItems() {
        // Returns Firestore items if loaded, otherwise fallback to data.js
        if (menuItemsLoaded && menuFirestoreItems.length > 0) return menuFirestoreItems;
        return MENU_ITEMS;
    }

    function initMenuAdmin() {
        if (menuUnsubscribe) {
            renderMenuAdmin();
            return;
        }
        startMenuListener();
    }

    function startMenuListener() {
        menuUnsubscribe = db.collection('menu_items').orderBy('id', 'asc').onSnapshot(snapshot => {
            if (snapshot.empty && !menuItemsLoaded) {
                // First time: migrate from data.js
                migrateMenuToFirestore();
                return;
            }
            menuFirestoreItems = [];
            snapshot.forEach(doc => {
                menuFirestoreItems.push({ _docId: doc.id, ...doc.data() });
            });
            menuItemsLoaded = true;
            // Re-render admin menu if in admin mode
            if (adminMode) renderMenuAdmin();
            // Re-render customer menu if not in admin mode
            if (!adminMode) {
                const activeTab = document.querySelector('.tab.active');
                if (activeTab) renderCategory(activeTab.dataset.category);
            }
        }, (err) => {
            console.error('Menu listener error:', err);
            menuItemsLoaded = true;
            menuFirestoreItems = [];
            if (adminMode) renderMenuAdmin();
        });
    }

    function migrateMenuToFirestore() {
        const batch = db.batch();
        MENU_ITEMS.forEach(item => {
            const docRef = db.collection('menu_items').doc();
            batch.set(docRef, {
                id: item.id,
                name: item.name,
                category: item.category,
                tagline: item.tagline || '',
                description: item.description || '',
                ingredients: item.ingredients || [],
                toppings: item.toppings || [],
                price: item.price,
                priceGrande: item.priceGrande,
                image: item.image || '',
                emoji: item.emoji || '',
                badge: item.badge || '',
                onlyGrande: item.onlyGrande || false,
                active: true,
                createdAt: firebase.firestore.FieldValue.serverTimestamp()
            });
        });
        batch.commit().then(() => {
            showToast('Menú migrado a la base de datos', 'success');
        }).catch(err => {
            console.error('Migration error:', err);
            showToast('Error migrando menú', 'warning');
        });
    }

    function initMenuFilterArrows(filtersContainer) {
        const leftArrow = $('menu-filters-left');
        const rightArrow = $('menu-filters-right');
        if (!leftArrow || !rightArrow || !filtersContainer) return;

        function updateArrows() {
            const sl = filtersContainer.scrollLeft;
            const maxScroll = filtersContainer.scrollWidth - filtersContainer.clientWidth;
            if (maxScroll <= 2) {
                // Everything fits, hide both arrows
                leftArrow.classList.add('hidden-arrow');
                rightArrow.classList.add('hidden-arrow');
            } else {
                leftArrow.classList.toggle('hidden-arrow', sl <= 2);
                rightArrow.classList.toggle('hidden-arrow', sl >= maxScroll - 2);
            }
        }

        leftArrow.onclick = () => {
            filtersContainer.scrollBy({ left: -120, behavior: 'smooth' });
        };
        rightArrow.onclick = () => {
            filtersContainer.scrollBy({ left: 120, behavior: 'smooth' });
        };

        filtersContainer.addEventListener('scroll', updateArrows, { passive: true });
        // Run on next frame to get accurate measurements after render
        requestAnimationFrame(() => {
            updateArrows();
        });
    }

    function renderMenuAdmin(catFilter) {
        catFilter = catFilter || 'all';
        const filtersContainer = $('menu-admin-filters');
        const grid = $('menu-admin-grid');
        if (!filtersContainer || !grid) return;

        const items = getMenuItems();
        const cats = Object.keys(CATEGORIES).filter(k => k !== 'inicio' && k !== 'arma-tu-bowl');

        // Render filter buttons
        filtersContainer.innerHTML = `<button class="menu-filter-btn ${catFilter === 'all' ? 'active' : ''}" data-menu-cat="all">Todos</button>` +
            cats.map(k => `<button class="menu-filter-btn ${catFilter === k ? 'active' : ''}" data-menu-cat="${k}"><i class="fas ${CATEGORIES[k].icon}"></i> ${CATEGORIES[k].name}</button>`).join('');

        filtersContainer.querySelectorAll('.menu-filter-btn').forEach(btn => {
            btn.addEventListener('click', () => renderMenuAdmin(btn.dataset.menuCat));
        });

        // Arrow scroll for filters
        initMenuFilterArrows(filtersContainer);

        const filtered = catFilter === 'all' ? items : items.filter(i => i.category === catFilter);

        if (!filtered.length) {
            grid.innerHTML = '<p class="no-orders">No hay productos en esta categoría</p>';
            return;
        }

        grid.innerHTML = filtered.map(item => `
            <div class="menu-admin-card" data-menu-doc-id="${item._docId || ''}">
                <div class="menu-admin-card-img">
                    ${item.image ? `<img src="${item.image}" alt="${item.name}">` : `<span class="menu-admin-card-emoji">${item.emoji || '🍽️'}</span>`}
                </div>
                <div class="menu-admin-card-body">
                    <div class="menu-admin-card-title">${item.emoji || ''} ${item.name}</div>
                    <div class="menu-admin-card-cat">${(CATEGORIES[item.category] || {}).name || item.category}</div>
                    <div class="menu-admin-card-price">
                        ${item.onlyGrande || item.priceGrande == null ? '$' + (item.price || 0).toFixed(2) : 'M $' + (item.price || 0).toFixed(2) + ' / G $' + (item.priceGrande || 0).toFixed(2)}
                    </div>
                </div>
                <button class="menu-admin-edit-btn" data-edit-doc="${item._docId || ''}"><i class="fas fa-pen"></i></button>
            </div>
        `).join('');

        grid.querySelectorAll('.menu-admin-edit-btn').forEach(btn => {
            btn.addEventListener('click', () => openMenuItemForm(btn.dataset.editDoc));
        });
    }

    function openMenuItemForm(docId) {
        editingMenuItemId = docId || null;
        menuImageBase64 = '';
        menuFormIngredients = [];
        menuFormToppings = [];

        const title = $('menu-form-title');
        const deleteBtn = $('menu-form-delete');

        if (editingMenuItemId) {
            // Editing existing item
            const item = menuFirestoreItems.find(i => i._docId === editingMenuItemId);
            if (!item) { showToast('Producto no encontrado', 'warning'); return; }

            title.innerHTML = '<i class="fas fa-pen"></i> Editar Producto';
            deleteBtn.classList.remove('hidden');

            $('menu-item-name').value = item.name || '';
            $('menu-item-category').value = item.category || 'bowls';
            $('menu-item-tagline').value = item.tagline || '';
            $('menu-item-description').value = item.description || '';
            $('menu-item-emoji').value = item.emoji || '';
            $('menu-item-badge').value = item.badge || '';
            $('menu-item-price').value = item.price || '';
            $('menu-item-price-grande').value = item.priceGrande != null ? item.priceGrande : '';
            $('menu-item-only-grande').checked = !!item.onlyGrande;
            menuFormIngredients = [...(item.ingredients || [])];
            menuFormToppings = [...(item.toppings || [])];

            // Show image preview if exists
            const preview = $('menu-img-preview');
            const placeholder = $('menu-img-placeholder');
            if (item.image) {
                preview.src = item.image;
                preview.style.display = 'block';
                placeholder.style.display = 'none';
                menuImageBase64 = item.image;
            } else {
                preview.style.display = 'none';
                placeholder.style.display = 'flex';
            }
        } else {
            // New item
            title.innerHTML = '<i class="fas fa-plus-circle"></i> Nuevo Producto';
            deleteBtn.classList.add('hidden');

            $('menu-item-name').value = '';
            $('menu-item-category').value = 'bowls';
            $('menu-item-tagline').value = '';
            $('menu-item-description').value = '';
            $('menu-item-emoji').value = '';
            $('menu-item-badge').value = '';
            $('menu-item-price').value = '';
            $('menu-item-price-grande').value = '';
            $('menu-item-only-grande').checked = true;
            const preview = $('menu-img-preview');
            const placeholder = $('menu-img-placeholder');
            preview.style.display = 'none';
            placeholder.style.display = 'flex';
        }

        renderMenuTags();
        $('menu-form-overlay').classList.remove('hidden');
    }

    function renderMenuTags() {
        const ingContainer = $('menu-ingredients-tags');
        const topContainer = $('menu-toppings-tags');
        if (ingContainer) {
            ingContainer.innerHTML = menuFormIngredients.map((ing, i) =>
                `<span class="menu-tag">${ing}<button class="menu-tag-remove" data-type="ingredient" data-idx="${i}"><i class="fas fa-times"></i></button></span>`
            ).join('');
            ingContainer.querySelectorAll('.menu-tag-remove').forEach(btn => {
                btn.addEventListener('click', () => {
                    menuFormIngredients.splice(parseInt(btn.dataset.idx), 1);
                    renderMenuTags();
                });
            });
        }
        if (topContainer) {
            topContainer.innerHTML = menuFormToppings.map((top, i) =>
                `<span class="menu-tag">${top}<button class="menu-tag-remove" data-type="topping" data-idx="${i}"><i class="fas fa-times"></i></button></span>`
            ).join('');
            topContainer.querySelectorAll('.menu-tag-remove').forEach(btn => {
                btn.addEventListener('click', () => {
                    menuFormToppings.splice(parseInt(btn.dataset.idx), 1);
                    renderMenuTags();
                });
            });
        }
    }

    function saveMenuItem() {
        const name = ($('menu-item-name') || {}).value.trim();
        const category = ($('menu-item-category') || {}).value;
        const price = parseFloat(($('menu-item-price') || {}).value);

        if (!name) { showToast('El nombre es obligatorio', 'warning'); return; }
        if (!price || price <= 0) { showToast('El precio es obligatorio', 'warning'); return; }

        const onlyGrande = ($('menu-item-only-grande') || {}).checked;
        const priceGrandeVal = parseFloat(($('menu-item-price-grande') || {}).value);
        const priceGrande = (!onlyGrande && priceGrandeVal > 0) ? priceGrandeVal : null;

        const data = {
            name,
            category,
            tagline: ($('menu-item-tagline') || {}).value.trim(),
            description: ($('menu-item-description') || {}).value.trim(),
            emoji: ($('menu-item-emoji') || {}).value.trim(),
            badge: ($('menu-item-badge') || {}).value.trim(),
            price,
            priceGrande,
            onlyGrande,
            ingredients: menuFormIngredients,
            toppings: menuFormToppings,
            image: menuImageBase64 || '',
            updatedAt: firebase.firestore.FieldValue.serverTimestamp()
        };

        if (editingMenuItemId) {
            // Update existing — don't override active state
            db.collection('menu_items').doc(editingMenuItemId).update(data).then(() => {
                showToast('Producto actualizado', 'success');
                $('menu-form-overlay').classList.add('hidden');
            }).catch(() => showToast('Error actualizando', 'warning'));
        } else {
            // Create new - generate next ID
            data.active = true;
            const maxId = menuFirestoreItems.reduce((max, i) => Math.max(max, i.id || 0), 0);
            data.id = maxId + 1;
            data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
            db.collection('menu_items').add(data).then(() => {
                showToast('Producto creado', 'success');
                $('menu-form-overlay').classList.add('hidden');
            }).catch(() => showToast('Error creando producto', 'warning'));
        }
    }

    function deleteMenuItem() {
        if (!editingMenuItemId) return;
        if (!confirm('¿Eliminar este producto del menú?')) return;
        db.collection('menu_items').doc(editingMenuItemId).delete().then(() => {
            showToast('Producto eliminado', 'success');
            $('menu-form-overlay').classList.add('hidden');
        }).catch(() => showToast('Error eliminando', 'warning'));
    }

    // Menu admin event listeners
    (function bindMenuAdminEvents() {
        const addBtn = $('menu-add-btn');
        if (addBtn) addBtn.addEventListener('click', () => openMenuItemForm(null));

        const saveBtn = $('menu-form-save');
        if (saveBtn) saveBtn.addEventListener('click', saveMenuItem);

        const delBtn = $('menu-form-delete');
        if (delBtn) delBtn.addEventListener('click', deleteMenuItem);

        const closeBtn = $('menu-form-close');
        if (closeBtn) closeBtn.addEventListener('click', () => $('menu-form-overlay').classList.add('hidden'));

        const cancelBtn = $('menu-form-cancel');
        if (cancelBtn) cancelBtn.addEventListener('click', () => $('menu-form-overlay').classList.add('hidden'));

        const overlay = $('menu-form-overlay');
        if (overlay) overlay.addEventListener('click', (e) => { if (e.target === overlay) overlay.classList.add('hidden'); });

        // Image upload
        const imgUpload = $('menu-img-upload');
        const imgInput = $('menu-img-input');
        if (imgUpload && imgInput) {
            imgUpload.addEventListener('click', () => imgInput.click());
            imgInput.addEventListener('change', (e) => {
                const file = e.target.files[0];
                if (!file) return;
                if (file.size > 1048576) { showToast('Imagen muy grande (máx 1MB)', 'warning'); return; }
                const reader = new FileReader();
                reader.onload = (ev) => {
                    menuImageBase64 = ev.target.result;
                    const preview = $('menu-img-preview');
                    const placeholder = $('menu-img-placeholder');
                    if (preview) { preview.src = menuImageBase64; preview.style.display = 'block'; }
                    if (placeholder) placeholder.style.display = 'none';
                };
                reader.readAsDataURL(file);
            });
        }

        // Ingredient add
        const ingAddBtn = $('menu-ingredient-add');
        const ingInput = $('menu-ingredient-input');
        if (ingAddBtn && ingInput) {
            const addIng = () => {
                const val = ingInput.value.trim();
                if (val) { menuFormIngredients.push(val); ingInput.value = ''; renderMenuTags(); }
            };
            ingAddBtn.addEventListener('click', addIng);
            ingInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addIng(); } });
        }

        // Topping add
        const topAddBtn = $('menu-topping-add');
        const topInput = $('menu-topping-input');
        if (topAddBtn && topInput) {
            const addTop = () => {
                const val = topInput.value.trim();
                if (val) { menuFormToppings.push(val); topInput.value = ''; renderMenuTags(); }
            };
            topAddBtn.addEventListener('click', addTop);
            topInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); addTop(); } });
        }
    })();

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
