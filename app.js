// ========================================
// XAZAI - Açai Bar & Smoothies App
// ========================================

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
    const adminOverlay = $('admin-overlay');
    const adminClose = $('admin-close');
    const ordersList = $('orders-list');
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
            return { open: false, text: 'Cerrado · Miércoles' };
        }

        if (currentHour >= hours.open && currentHour < hours.close) {
            const closeHour = hours.close > 12 ? (hours.close - 12) + ':00 PM' : hours.close + ':00 AM';
            return { open: true, text: `Abierto · Hasta las ${closeHour}` };
        }

        if (currentHour < hours.open) {
            return { open: false, text: `Cerrado · Abrimos a las ${hours.open}:00 AM` };
        }

        // After closing, find next open day
        return { open: false, text: getNextOpenText(now) };
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
            const items = MENU_ITEMS.filter(i => i.category === catKey);
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

    function bindAllCardEvents() {
        // Only listen for clicks on the MAIN part of the card (not the expand area)
        productsGrid.querySelectorAll('.card-h-main').forEach(main => {
            main.addEventListener('click', (e) => {
                if (e.target.closest('.btn-card-add')) return;
                const card = main.closest('.product-card-h');
                toggleExpand(parseInt(card.dataset.id));
            });
        });
        productsGrid.querySelectorAll('.btn-card-add').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.stopPropagation();
                const card = btn.closest('.product-card-h');
                toggleExpand(parseInt(card.dataset.id));
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
        const items = MENU_ITEMS.filter(i => i.category === category);
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

        return `
            <div class="expand-inner">
                ${hasIngredients ? `
                <div class="expand-section">
                    <p class="expand-text-line"><strong>Ingredientes:</strong> ${product.ingredients.join(', ')}</p>
                    ${hasToppingsIncluded ? `<p class="expand-text-line"><strong>Toppings incluidos:</strong> ${product.toppings.join(', ')}</p>` : ''}
                </div>` : ''}
                ${sizeSection}
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
        let size = isOnlyGrande ? 'único' : 'mediano';
        let currentPrice = product.price;
        let qty = 1, selectedToppings = [];

        function updateTotal() {
            const extras = selectedToppings.reduce((s, tid) => {
                const t = EXTRA_TOPPINGS.find(tp => tp.id === tid);
                return s + (t ? t.price : 0);
            }, 0);
            const total = (currentPrice + extras) * qty;
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

            cart.push({
                id: Date.now(),
                productId: product.id,
                name: product.name,
                emoji: product.emoji,
                size: size,
                sizeMultiplier: 1,
                toppings: toppingNames,
                toppingsPrice: toppingsPrice,
                basePrice: currentPrice,
                quantity: qty,
                note: note,
                total: (currentPrice + toppingsPrice) * qty
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
                    id: orderCounter, number: orderId, user: currentUser.name,
                    items: [...cart], subtotal, tax, total,
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
        // Fallback: process order without Yappy (for testing/cash orders)
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
        orders.push({
            id: orderCounter, number: `XZ-${orderCounter}`, user: currentUser.name,
            items: [...cart], subtotal, delivery: deliveryFee, tip: currentTip,
            total: subtotal + deliveryFee + currentTip,
            address: deliveryAddress,
            scheduled: scheduledSlot ? `${scheduledSlot.label} ${scheduledSlot.time}` : null,
            status: 'pendiente', date: new Date().toLocaleString('es-ES')
        });
        orderNumber.textContent = `XZ-${orderCounter}`;
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
    // ADMIN
    // ========================================
    adminPanelBtn.addEventListener('click', () => { userDropdown.classList.add('hidden'); adminOverlay.classList.remove('hidden'); renderOrders(); });
    adminClose.addEventListener('click', () => adminOverlay.classList.add('hidden'));

    document.querySelectorAll('.admin-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.admin-tab').forEach(t => t.classList.remove('active'));
            tab.classList.add('active');
            $('admin-orders').classList.toggle('hidden', tab.dataset.adminTab !== 'orders');
            $('admin-products').classList.toggle('hidden', tab.dataset.adminTab !== 'products');
        });
    });

    document.querySelectorAll('.filter-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            document.querySelectorAll('.filter-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            renderOrders(btn.dataset.status);
        });
    });

    function renderOrders(filterStatus = 'all') {
        const filtered = filterStatus === 'all' ? orders : orders.filter(o => o.status === filterStatus);
        if (!filtered.length) { ordersList.innerHTML = '<p class="no-orders">No hay pedidos</p>'; return; }

        ordersList.innerHTML = filtered.map(order => `
            <div class="order-card">
                <div class="order-header">
                    <div><strong>${order.number}</strong><span class="order-date">${order.date}</span></div>
                    <span class="order-status status-${order.status}">${order.status}</span>
                </div>
                <div class="order-items-list">
                    ${order.items.map(item => `<div class="order-item-line"><span>${item.emoji} ${item.name} x${item.quantity} (${item.size})</span><span>$${item.total.toFixed(2)}</span></div>`).join('')}
                </div>
                <div class="order-total-line"><span>Total: <strong>$${order.total.toFixed(2)}</strong></span><span>Cliente: ${order.user}</span></div>
                <div class="order-actions">
                    ${order.status === 'pendiente' ? `<button class="order-action-btn btn-preparando" data-id="${order.id}">Preparando</button>` : ''}
                    ${order.status === 'preparando' ? `<button class="order-action-btn btn-listo" data-id="${order.id}">Listo</button>` : ''}
                    ${order.status === 'listo' ? `<button class="order-action-btn btn-entregado" data-id="${order.id}">Entregado</button>` : ''}
                </div>
            </div>
        `).join('');

        ordersList.querySelectorAll('.order-action-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const order = orders.find(o => o.id === parseInt(btn.dataset.id));
                if (!order) return;
                if (btn.classList.contains('btn-preparando')) order.status = 'preparando';
                else if (btn.classList.contains('btn-listo')) order.status = 'listo';
                else if (btn.classList.contains('btn-entregado')) order.status = 'entregado';
                renderOrders(document.querySelector('.filter-btn.active').dataset.status);
                showToast(`Pedido ${order.number}: ${order.status}`, 'info');
            });
        });
    }

    // ========================================
    // SECRET ADMIN ACCESS (long-press logo)
    // ========================================
    (function() {
        const logoEl = document.querySelector('.logo-img-nav') || document.querySelector('.logo-small');
        if (!logoEl) return;

        let pressTimer = null;
        let pressStart = 0;
        const LONG_PRESS_MS = 3000; // 3 seconds

        function startPress(e) {
            pressStart = Date.now();
            pressTimer = setTimeout(() => {
                // Open admin login modal
                $('admin-login-modal').classList.remove('hidden');
                document.body.style.overflow = 'hidden';
                const adminPhone = $('admin-login-phone');
                if (adminPhone) adminPhone.focus();
            }, LONG_PRESS_MS);
        }

        function cancelPress() {
            if (pressTimer) {
                clearTimeout(pressTimer);
                pressTimer = null;
            }
        }

        // Mouse events
        logoEl.addEventListener('mousedown', startPress);
        logoEl.addEventListener('mouseup', cancelPress);
        logoEl.addEventListener('mouseleave', cancelPress);

        // Touch events (mobile)
        logoEl.addEventListener('touchstart', (e) => {
            startPress(e);
        }, { passive: true });
        logoEl.addEventListener('touchend', cancelPress);
        logoEl.addEventListener('touchcancel', cancelPress);
        logoEl.addEventListener('touchmove', cancelPress);

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
                const phone = $('admin-login-phone').value.trim().replace(/\D/g, '');
                const code = $('admin-country-code').value;

                if (!phone || phone.length < 6) {
                    const errEl = $('admin-login-error');
                    errEl.textContent = 'Número inválido';
                    errEl.classList.add('show');
                    setTimeout(() => errEl.classList.remove('show'), 3000);
                    return;
                }

                const fullPhone = code + phone;
                const isAdmin = USERS.find(u => u.role === 'admin' && u.phone === fullPhone);

                if (isAdmin) {
                    currentUser = {
                        username: fullPhone,
                        role: 'admin',
                        name: isAdmin.name || 'Admin',
                        phone: fullPhone
                    };
                    userName.textContent = isAdmin.name || 'Admin';
                    loginTriggerBtn.classList.add('hidden');
                    logoutBtn.classList.remove('hidden');
                    adminPanelBtn.classList.remove('hidden');

                    $('admin-login-modal').classList.add('hidden');
                    document.body.style.overflow = '';
                    $('admin-login-phone').value = '';
                    showToast('Bienvenido, Administrador', 'success');

                    // Auto-open admin panel
                    adminOverlay.classList.remove('hidden');
                    renderOrders();
                } else {
                    const errEl = $('admin-login-error');
                    errEl.textContent = 'Acceso denegado. Número no autorizado.';
                    errEl.classList.add('show');
                    setTimeout(() => errEl.classList.remove('show'), 3000);
                }
            });
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
