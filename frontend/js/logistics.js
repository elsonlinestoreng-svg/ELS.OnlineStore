/**
 * ELS Platform — Advanced Escrow Logistics System (Core UI & State Controller Layer)
 * Implementation: Defensive Data Mutation, UI Scoping & Dynamic State Tracking
 */

(function () {
    'use strict';

    // Application Configuration Registry / Visual Identity Design System Tokens
    const CORE_THEME = {
        statusColors: {
            'Delivered': 'bg-emerald-50 text-emerald-600 border-emerald-500',
            'In Transit': 'bg-indigo-50 text-indigo-600 border-indigo-500',
            'Awaiting Pickup': 'bg-amber-50 text-amber-600 border-amber-500',
            'Pending Logistics': 'bg-rose-50 text-rose-600 border-rose-500'
        },
        fallbackShippingFee: 9.99,
        taxMultiplier: 0.08
    };

    // Private Module State
    let isLogisticsProviderMode = false;

    /**
     * Safe Utility DOM Element Mutator Wrapper
     */
    function updateTextContent(elementId, content) {
        const el = document.getElementById(elementId);
        if (el) el.textContent = String(content);
    }

    /**
     * Renders Customer-Facing Personal Purchased Order History Cards
     */
    function renderOrders() {
        const container = document.getElementById('orders-list');
        if (!container) return;

        // Ensure upstream data arrays are parsed cleanly
        const ordersArray = window.allOrders || [];
        const activeUser = window.currentUser || { name: '' };

        const userOrders = ordersArray.filter(order => order.buyer === activeUser.name);

        if (!userOrders.length) {
            container.innerHTML = `
                <div class="text-center py-10 bg-slate-50 border border-dashed border-slate-200 rounded-2xl">
                    <p class="text-slate-400 text-sm mb-3">No orders placed under this identity profile yet.</p>
                    <button onclick="if(typeof goTo==='function') goTo('shop')" class="px-4 py-1.5 bg-rose-500 text-white rounded-lg text-xs font-semibold shadow-sm hover:bg-rose-600 transition">
                        Start Shopping
                    </button>
                </div>`;
            updateTextContent('total-orders', '0');
            updateTextContent('in-transit-count', '0');
            updateTextContent('delivered-count', '0');
            return;
        }

        // Compute Operational Activity Counters
        updateTextContent('total-orders', userOrders.length);
        updateTextContent('in-transit-count', userOrders.filter(o => o.order_status === 'In Transit').length);
        updateTextContent('delivered-count', userOrders.filter(o => o.order_status === 'Delivered').length);

        // Generate Component Element Fragment Map Rows
        container.innerHTML = userOrders.map(order => {
            const statusClass = CORE_THEME.statusColors[order.order_status] || 'bg-slate-50 text-slate-600 border-slate-500';
            const orderDate = order.created_at ? new Date(order.created_at).toLocaleDateString() : '—';
            const itemNames = Array.isArray(order.items) ? order.items.map(i => i.name).join(', ') : 'Platform Logistics Assignment';
            const displayTotal = typeof order.total_amount === 'number' ? order.total_amount.toFixed(2) : '0.00';

            return `
                <div class="bg-white rounded-xl p-4 border-l-4 ${statusClass.split(' ').pop()} shadow-sm hover:shadow-md transition mb-3">
                    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 mb-3">
                        <div>
                            <p class="font-bold text-slate-800 text-sm">${order.order_id}</p>
                            <p class="text-[11px] text-slate-400 font-medium">${orderDate}</p>
                        </div>
                        <span class="px-2.5 py-0.5 rounded-full text-[10px] font-bold tracking-wide uppercase ${statusClass}">
                            ${order.order_status}
                        </span>
                    </div>
                    <div class="mb-3 text-xs text-slate-600">
                        <p class="font-medium text-slate-700 mb-1">${itemNames}</p>
                        <p class="text-slate-400 font-medium">Method: ${order.delivery_method || 'Standard'} • Total: <span class="font-bold text-rose-500">$${displayTotal}</span></p>
                    </div>
                    <div class="pt-2 border-t border-slate-100 flex items-center justify-between">
                        ${order.tracking_number 
                            ? `<p class="text-[10px] font-mono text-slate-500 bg-slate-50 px-2 py-0.5 rounded">Track: ${order.tracking_number}</p>` 
                            : `<p class="text-[10px] text-amber-500 font-medium flex items-center gap-1">🕒 Awaiting logistics node routing...</p>`
                        }
                    </div>
                </div>`;
        }).join('');
    }

    /**
     * Renders Multi-Tenant Escrow Views (Sellers vs. Courier Providers)
     */
    function renderLogisticsView() {
        const ordersArray = window.allOrders || [];
        const activeUser = window.currentUser || { name: '' };

        // --- PART 1: SELLER PERSPECTIVE CORE ---
        const sellerOrders = ordersArray.filter(o => Array.isArray(o.items) && o.items.some(i => i.seller === activeUser.name));
        const pendingPickups = sellerOrders.filter(o => o.order_status === 'Pending Logistics');
        const completedSells = sellerOrders.filter(o => o.order_status === 'Delivered');

        // Derived Accounting Logic rather than random numbers
        const calculatedSellerBalance = completedSells.reduce((sum, o) => sum + (o.total_amount || 0), 0);
        updateTextContent('seller-balance', `$${calculatedSellerBalance.toFixed(2)}`);
        updateTextContent('pending-shipments', pendingPickups.length);
        updateTextContent('completed-seller-orders', completedSells.length);

        const sellerContainer = document.getElementById('seller-pending-orders');
        if (sellerContainer) {
            if (!pendingPickups.length) {
                sellerContainer.innerHTML = `<p class="text-slate-400 text-center text-xs py-6">No merchant packages awaiting dispatch.</p>`;
            } else {
                sellerContainer.innerHTML = pendingPickups.map(order => `
                    <div class="bg-white rounded-xl p-3 border border-slate-200 shadow-sm flex flex-col justify-between gap-2">
                        <div class="flex justify-between items-start">
                            <div>
                                <p class="font-bold text-xs text-slate-800">${order.order_id}</p>
                                <p class="text-[10px] text-slate-400 font-medium">To: ${order.buyer_name || 'Verified Buyer'}</p>
                            </div>
                            <button onclick="ELS_Engine.requestLogisticsPickup('${order.order_id}')" class="px-2.5 py-1 rounded bg-indigo-600 text-white text-[10px] font-bold hover:bg-indigo-700 shadow-sm transition">
                                Book Pickup
                            </button>
                        </div>
                        <p class="text-[10px] font-medium text-slate-500">${order.delivery_method || 'Standard'} • $${(order.total_amount || 0).toFixed(2)}</p>
                    </div>`).join('');
            }
        }

        // --- PART 2: COURIER OPERATIONS PERSPECTIVE ---
        const genericAvailableOrders = ordersArray.filter(o => o.order_status === 'Pending Logistics');
        const courierActiveDeliveries = ordersArray.filter(o => o.order_status === 'In Transit' && o.logistics_provider === activeUser.name);
        const courierCompletedDeliveries = ordersArray.filter(o => o.order_status === 'Delivered' && o.logistics_provider === activeUser.name);

        const calculationLogisticsBalance = courierCompletedDeliveries.reduce((sum, o) => sum + (o.logistics_fee || 0), 0);
        updateTextContent('logistics-balance', `$${calculationLogisticsBalance.toFixed(2)}`);
        updateTextContent('active-shipments', courierActiveDeliveries.length);
        updateTextContent('completed-deliveries', courierCompletedDeliveries.length);

        // Render Available Shipments Pool
        const availableContainer = document.getElementById('available-shipments');
        if (availableContainer) {
            if (!genericAvailableOrders.length) {
                availableContainer.innerHTML = `<p class="text-slate-400 text-center text-xs py-6">All logistics dispatch lanes currently clear.</p>`;
            } else {
                availableContainer.innerHTML = genericAvailableOrders.map(order => `
                    <div class="bg-emerald-50/50 border border-emerald-200 rounded-xl p-3 flex flex-col justify-between gap-2">
                        <div class="flex justify-between items-start">
                            <div>
                                <p class="font-bold text-xs text-slate-800">${order.order_id}</p>
                                <p class="text-[10px] text-slate-500">${order.buyer_name || 'Client'} → ${order.delivery_method || 'Hub Delivery'}</p>
                            </div>
                            <button onclick="ELS_Engine.acceptShipment('${order.order_id}')" class="px-2.5 py-1 rounded bg-emerald-600 text-white text-[10px] font-bold hover:bg-emerald-700 shadow-sm transition">
                                Accept Route
                            </button>
                        </div>
                        <p class="text-[10px] font-bold text-emerald-600">Logistics Earning: $${(order.logistics_fee || 0).toFixed(2)}</p>
                    </div>`).join('');
            }
        }

        // Render Active Shipments Process Pipeline
        const deliveriesContainer = document.getElementById('active-deliveries');
        if (deliveriesContainer) {
            if (!courierActiveDeliveries.length) {
                deliveriesContainer.innerHTML = `<p class="text-slate-400 text-center text-xs py-6">No transit manifests assigned to your vehicle node.</p>`;
            } else {
                deliveriesContainer.innerHTML = courierActiveDeliveries.map(order => `
                    <div class="bg-indigo-50/40 border border-indigo-200 rounded-xl p-3 flex flex-col justify-between gap-2">
                        <div class="flex justify-between items-start">
                            <div>
                                <p class="font-bold text-xs text-slate-800">${order.order_id}</p>
                                <p class="text-[10px] font-mono text-indigo-500 font-semibold">${order.tracking_number || 'TRK-GEN'}</p>
                            </div>
                            <button onclick="ELS_Engine.completeDelivery('${order.order_id}')" class="px-2.5 py-1 rounded bg-indigo-600 text-white text-[10px] font-bold hover:bg-indigo-700 shadow-sm transition">
                                Deliver Package
                            </button>
                        </div>
                        <p class="text-[10px] text-slate-500 font-medium">Recipient Target: ${order.buyer_name || 'Client'} via ${order.delivery_method || 'Priority'}</p>
                    </div>`).join('');
            }
        }
    }

    /**
     * Toggles Interface Scoping Controls Between Merchant Accounts and Dispatch Networks
     */
    function toggleLogisticsRole() {
        isLogisticsProviderMode = !isLogisticsProviderMode;
        
        const sellerViewNode = document.getElementById('seller-logistics-view');
        const providerViewNode = document.getElementById('logistics-provider-view');
        const toggleButton = document.getElementById('logistics-role-btn');

        if (sellerViewNode) sellerViewNode.classList.toggle('hidden', isLogisticsProviderMode);
        if (providerViewNode) providerViewNode.classList.toggle('hidden', !isLogisticsProviderMode);
        
        if (toggleButton) {
            toggleButton.textContent = isLogisticsProviderMode ? 'Switch to Merchant Desk' : 'Switch to Courier Terminal';
        }
        renderLogisticsView();
    }

    /**
     * Triggers Dispatch Route Allocations
     */
    function requestLogisticsPickup(orderId) {
        const targetOrder = (window.allOrders || []).find(o => o.order_id === orderId);
        if (targetOrder) {
            targetOrder.order_status = 'Awaiting Pickup';
            if (typeof window.showToast === 'function') window.showToast('✓ Shipment routing initialized via ELS Escrow Engine.');
            renderLogisticsView();
        }
    }

    /**
     * Locks Transit Contracts to a Delivery Operator
     */
    function acceptShipment(orderId) {
        const targetOrder = (window.allOrders || []).find(o => o.order_id === orderId);
        const activeUser = window.currentUser || { name: 'ELS Courier Node' };

        if (targetOrder) {
            targetOrder.order_status = 'In Transit';
            targetOrder.logistics_provider = activeUser.name;
            targetOrder.tracking_number = `ELS-TRK-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
            targetOrder.estimated_delivery = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toLocaleDateString();

            if (typeof window.showToast === 'function') {
                window.showToast(`✓ manifest secured. Escrow lock fee active: $${(targetOrder.logistics_fee || 0).toFixed(2)}`);
            }

            // Sync structural arrays downstream safely
            renderLogisticsView();
            renderOrders();

            // Safe dynamic notification thread orchestration channel creation
            try {
                if (window.conversations) {
                    const trackingChannelId = `order-${orderId}`;
                    let channelsObj = window.conversations.find(c => c.id === trackingChannelId);
                    if (!channelsObj) {
                        channelsObj = {
                            id: trackingChannelId,
                            title: `Order Manifest ${orderId}`,
                            orderId: orderId,
                            participants: [targetOrder.buyer_name, activeUser.name],
                            messages: []
                        };
                        window.conversations.push(channelsObj);
                    }
                    channelsObj.messages.push({
                        sender: activeUser.name,
                        text: `Automated System Alert: Manifest secured. Courier transit initiated. Tracking sequence: ${targetOrder.tracking_number}. Expected handover window within 72 hours.`,
                        time: new Date().toISOString()
                    });
                }
            } catch (err) {
                console.warn('Escrow communications pipeline allocation skipped:', err);
            }
        }
    }

    /**
     * Executes Final Escrow Release Clearances Upon Delivery Handover Confirmation
     */
    function completeDelivery(orderId) {
        const targetOrder = (window.allOrders || []).find(o => o.order_id === orderId);
        if (targetOrder) {
            targetOrder.order_status = 'Delivered';
            if (typeof window.showToast === 'function') {
                window.showToast(`✓ Secure handover completed. Escrow payouts released to merchant asset values.`);
            }
            renderLogisticsView();
            renderOrders();
        }
    }

    /**
     * Clean Account Setup Input Visibility Toggler
     */
    function togglePasswordVisibility(fieldId, executionButton) {
        const passwordInputField = document.getElementById(fieldId);
        if (!passwordInputField) return;

        const isCurrentlyHidden = passwordInputField.type === 'password';
        passwordInputField.type = isCurrentlyHidden ? 'text' : 'password';
        
        if (executionButton) {
            executionButton.setAttribute('aria-pressed', isCurrentlyHidden ? 'true' : 'false');
        }
        
        try {
            if (window.lucide && typeof window.lucide.createIcons === 'function') {
                window.lucide.createIcons();
            }
        } catch (_) {}
    }

    /**
     * Mathematical Total Aggregators
     */
    function calculateTotals(cartArray) {
        const normalizedCart = Array.isArray(cartArray) ? cartArray : [];
        const subtotal = normalizedCart.reduce((acc, item) => acc + ((item.price || 0) * (item.quantity || 1)), 0);
        const shipping = subtotal > 0 ? CORE_THEME.fallbackShippingFee : 0;
        const tax = (subtotal + shipping) * CORE_THEME.taxMultiplier;
        const total = parseFloat((subtotal + shipping + tax).toFixed(2));

        return { subtotal, shipping, tax, total };
    }

    /**
     * Controls Open Checkout Multi-option Payment Routing Elements Overlay Frames
     */
    function openPaymentChooser() {
        const activeAppInstance = window.els2App || {};
        const activeCartItems = activeAppInstance._cart || [];
        const checkoutTotals = calculateTotals(activeCartItems);

        const modalContainer = document.getElementById('qrModal');
        if (!modalContainer) return;

        const modalAmountLabel = document.getElementById('qrModalAmount');
        if (modalAmountLabel) modalAmountLabel.textContent = `$${checkoutTotals.total.toFixed(2)}`;

        let optionsWrapper = modalContainer.querySelector('.qr-modal-instructions');
        if (optionsWrapper && !optionsWrapper.querySelector('.payment-options-group')) {
            const dynamicButtonsBox = document.createElement('div');
            dynamicButtonsBox.className = "payment-options-group flex flex-wrap gap-2 justify-center mt-4";
            dynamicButtonsBox.innerHTML = `
                <button class="px-3 py-1.5 bg-rose-500 text-white rounded-lg text-xs font-semibold shadow-sm hover:bg-rose-600 transition" id="pay-qr-trigger">Scan QR Engine</button>
                <button class="px-3 py-1.5 bg-slate-800 text-white rounded-lg text-xs font-semibold shadow-sm hover:bg-slate-900 transition" id="pay-card-trigger">Card Processing</button>
                <button class="px-3 py-1.5 bg-slate-100 text-slate-700 rounded-lg text-xs font-semibold shadow-sm hover:bg-slate-200 transition" id="pay-split-trigger">Split Escrow Balance</button>
            `;
            optionsWrapper.appendChild(dynamicButtonsBox);
        }

        modalContainer.classList.add('active');

        // Clean Intercept Click Handling Attachments Loop
        setTimeout(() => {
            const qrBtn = document.getElementById('pay-qr-trigger');
            const cardBtn = document.getElementById('pay-card-trigger');
            const splitBtn = document.getElementById('pay-split-trigger');

            if (qrBtn) qrBtn.onclick = () => { if (activeAppInstance.openQRModal) activeAppInstance.openQRModal(); };
            if (cardBtn) cardBtn.onclick = () => { alert('Secure payment simulated successfully.'); if (activeAppInstance.completeOrder) activeAppInstance.completeOrder(); };
            if (splitBtn) splitBtn.onclick = () => { alert('Multi-tenant balance split transaction pipeline configured.'); if (activeAppInstance.completeOrder) activeAppInstance.completeOrder(); };
        }, 150);
    }

    /**
     * Smooth Spatial Timeline Interface Step Advancer Simulation
     */
    function simulateLogistics(orderId) {
        const trackingMilestoneSteps = ['step-Pending', 'step-Paid', 'step-Processing', 'step-Shipped', 'step-Delivered'];
        let currentStepIndex = 0;

        function advancePipelineStep() {
            if (currentStepIndex > 0) {
                const completedNode = document.getElementById(trackingMilestoneSteps[currentStepIndex - 1]);
                if (completedNode) {
                    completedNode.classList.remove('current', 'border-indigo-500');
                    completedNode.classList.add('completed', 'border-emerald-500');
                }
            }

            const activeStepNode = document.getElementById(trackingMilestoneSteps[currentStepIndex]);
            if (activeStepNode) activeStepNode.classList.add('current', 'border-indigo-500');

            // Dynamic Progress Speed Vector Content Generation
            const speedIndicator = document.getElementById('tel-speed');
            const etaIndicator = document.getElementById('tel-eta');
            
            if (speedIndicator) speedIndicator.textContent = `${Math.floor(Math.random() * (55 - 40 + 1)) + 40} km/h`;
            if (etaIndicator) etaIndicator.textContent = `${Math.max(2, 30 - (currentStepIndex * 7))} mins`;

            currentStepIndex++;
            if (currentStepIndex < trackingMilestoneSteps.length) {
                setTimeout(advancePipelineStep, 4000);
            }
        }
        advancePipelineStep();
    }

    /**
     * Enhanced Verification Authentication Submission Gate Handler
     */
    function handleLoginEnhanced(event) {
        if (event) event.preventDefault();

        const emailElement = document.getElementById('login-email');
        const passwordElement = document.getElementById('login-pass');
        const regionElement = document.getElementById('login-region');

        const email = emailElement ? emailElement.value.trim() : '';
        const password = passwordElement ? passwordElement.value : '';
        const region = regionElement ? regionElement.value : 'global';

        if (!email || !password) {
            alert('Security access parameter rejection: Credentials cannot be null.');
            return;
        }

        // Initialize session parameters cleanly
        window.__ELS_USER = {
            email: email,
            region: region,
            role: (region && region.toLowerCase().includes('driver')) ? 'delivery' : 'buyer'
        };

        // UI view swap
        const authScreen = document.getElementById('auth-screen');
        const mainAppScreen = document.getElementById('main-app');
        if (authScreen) authScreen.classList.add('hidden');
        if (mainAppScreen) mainAppScreen.classList.remove('hidden');

        // Dynamic Avatar Component Initial Generation
        const avatarBox = document.getElementById('user-avatar-initial');
        if (avatarBox) avatarBox.textContent = email.charAt(0).toUpperCase();

        // Check if user is a courier driver to route them accordingly
        if (window.__ELS_USER.role === 'delivery' && typeof window.goTo === 'function') {
            window.goTo('logistics');
        }
    }

    // Module Setup Initialization
    document.addEventListener('DOMContentLoaded', () => {
        const loginForm = document.getElementById('login-form');
        if (loginForm) {
            loginForm.addEventListener('submit', handleLoginEnhanced);
        }

        // Dynamic Injection of Region/Operational Role Configuration Node Options
        if (!document.getElementById('login-region')) {
            const selectElement = document.createElement('select');
            selectElement.id = 'login-region';
            selectElement.className = 'w-full px-4 py-2.5 mt-2 rounded-xl bg-slate-800 text-white border border-slate-700 text-xs font-semibold focus:outline-none focus:border-rose-500 transition';
            selectElement.innerHTML = `
                <option value="global">Market Area: Global Routing Network</option>
                <option value="lagos">Market Area: West Africa Hub (Lagos)</option>
                <option value="abuja">Market Area: North Central Hub (Abuja)</option>
                <option value="driver-lagos">Courier Node Role: Driver (Lagos Core)</option>
            `;
            if (loginForm) loginForm.appendChild(selectElement);
        }
    });

    // Explicit Context Namespace Binding Export
    window.ELS_Engine = {
        renderOrders,
        renderLogisticsView,
        toggleLogisticsRole,
        requestLogisticsPickup,
        acceptShipment,
        completeDelivery,
        togglePasswordVisibility,
        calculateTotals,
        openPaymentChooser,
        simulateLogistics
    };

})();