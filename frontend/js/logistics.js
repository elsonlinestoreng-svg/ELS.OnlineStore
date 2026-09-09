/**
 * JovAli market Platform — Advanced Escrow Logistics System (Core UI & State Controller Layer)
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

    // Default map center (Lagos)
    const DEFAULT_MAP_CENTER = { lat: 6.5244, lng: 3.3792 };

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
                            <button onclick="JAS_Engine.requestLogisticsPickup('${order.order_id}')" class="px-2.5 py-1 rounded bg-indigo-600 text-white text-[10px] font-bold hover:bg-indigo-700 shadow-sm transition">
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
                    <div class="bg-emerald-50/50 border border-emerald-200 rounded-xl p-3 flex flex-col justify-between gap-3">
                        <div class="flex justify-between items-start gap-2">
                            <div>
                                <p class="font-bold text-xs text-slate-800">${order.order_id}</p>
                                <p class="text-[10px] text-slate-500">${order.buyer_name || 'Client'} → ${order.delivery_method || 'Hub Delivery'}</p>
                            </div>
                            <button onclick="JAS_Engine.acceptShipment('${order.order_id}')" class="px-2.5 py-1 rounded bg-emerald-600 text-white text-[10px] font-bold hover:bg-emerald-700 shadow-sm transition">
                                Accept Route
                            </button>
                        </div>
                        <p class="text-[10px] font-bold text-emerald-600">Logistics Earning: $${(order.logistics_fee || 0).toFixed(2)}</p>
                        <div class="flex flex-wrap gap-2">
                            <button type="button" onclick="openOrderChat('${order.order_id}')" class="text-[10px] px-2.5 py-1 rounded bg-slate-900 text-white hover:bg-slate-800 transition">Message Buyer</button>
                            <button type="button" onclick="callBuyer('${String(order.phone || order.shipping_phone || order.billing_phone || order.buyer_phone || '')}')" class="text-[10px] px-2.5 py-1 rounded bg-slate-100 text-slate-700 hover:bg-slate-200 transition">Call Buyer</button>
                        </div>
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
                            <button onclick="JAS_Engine.completeDelivery('${order.order_id}')" class="px-2.5 py-1 rounded bg-indigo-600 text-white text-[10px] font-bold hover:bg-indigo-700 shadow-sm transition">
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
            if (typeof window.showToast === 'function') window.showToast('✓ Shipment routing initialized via JAS Escrow Engine.');
            renderLogisticsView();
        }
    }

    /**
     * Locks Transit Contracts to a Delivery Operator
     */
    function acceptShipment(orderId) {
        const targetOrder = (window.allOrders || []).find(o => o.order_id === orderId);
        const activeUser = window.currentUser || { name: 'JAS Courier Node' };

        if (targetOrder) {
            targetOrder.order_status = 'In Transit';
            targetOrder.logistics_provider = activeUser.name;
            // Generate a delivery verification code in the format JAS-<6digits>-NG
            function generateDeliveryCode() {
                const digits = Math.floor(100000 + Math.random() * 900000);
                return `JAS-${digits}-NG`;
            }

            targetOrder.tracking_number = generateDeliveryCode();
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

    function resolveOrderDestination(order) {
        if (!order || typeof order !== 'object') return null;

        const addressPieces = [];
        const shippingObject = order.shipping_address || order.delivery_address || order.destination || order.address;

        if (shippingObject && typeof shippingObject === 'object') {
            ['street','line1','city','state','region','postal_code','country'].forEach(key => {
                if (shippingObject[key]) addressPieces.push(String(shippingObject[key]).trim());
            });
        } else if (typeof shippingObject === 'string' && shippingObject.trim()) {
            addressPieces.push(shippingObject.trim());
        }

        ['shipping_street','shipping_city','shipping_state','shipping_country','shipping_address','billing_address','delivery_address','destination','address'].forEach(key => {
            if (order[key] && typeof order[key] === 'string') {
                addressPieces.push(order[key].trim());
            }
        });

        ['city','state','region','country'].forEach(key => {
            if (order[key] && typeof order[key] === 'string') {
                addressPieces.push(order[key].trim());
            }
        });

        return Array.from(new Set(addressPieces.filter(Boolean))).join(', ') || null;
    }

    function findCurrentLogisticsOrder() {
        const orders = window.allOrders || [];
        const activeUser = window.currentUser || {};
        const activeName = String(activeUser.name || '').trim().toLowerCase();

        let order = orders.find(o => String((o.logistics_provider || '')).trim().toLowerCase() === activeName && String(o.order_status || '').trim().toLowerCase() === 'in transit');
        if (order) return order;

        order = orders.find(o => ['pending logistics','awaiting pickup','in transit'].includes(String(o.order_status || '').trim().toLowerCase()));
        return order || null;
    }

    function startDeliveryGuide() {
        const order = findCurrentLogisticsOrder();
        const useDefaultCenter = !order;
        const destination = useDefaultCenter ? null : resolveOrderDestination(order);

        const nextStop = document.getElementById('gpsNextStop');
        const distance = document.getElementById('gpsDistance');
        const eta = document.getElementById('gpsEta');
        const speed = document.getElementById('tel-speed');
        const telEta = document.getElementById('tel-eta');
        const mapPlaceholder = document.getElementById('mapPlaceholder');

        if (nextStop) nextStop.textContent = destination;
        if (distance) distance.textContent = `${Math.floor(Math.random() * 12) + 3} km`;
        if (eta) eta.textContent = `${Math.floor(Math.random() * 20) + 5} mins`;
        if (speed) speed.textContent = `${Math.floor(Math.random() * 25) + 35} km/h`;
        if (telEta) telEta.textContent = `${Math.floor(Math.random() * 12) + 4} mins`;
        // Prefer interactive Leaflet map in-page when available
        if (mapPlaceholder) {
            try {
                // If destination is a string address, fall back to embed to avoid geocoding
                if (destination && typeof destination === 'string') {
                    const embedUrl = `https://maps.google.com/maps?q=${encodeURIComponent(destination)}&output=embed&z=15`;
                    mapPlaceholder.innerHTML = `<iframe src="${embedUrl}" class="w-full h-full rounded-xl border-0" allowfullscreen loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>`;
                } else {
                    // Use Leaflet interactive map centered on order loc or default Lagos
                    const center = (order && order.loc && order.loc.lat && order.loc.lng) ? [order.loc.lat, order.loc.lng] : [DEFAULT_MAP_CENTER.lat, DEFAULT_MAP_CENTER.lng];
                    // Ensure map container exists
                    const mapNode = document.getElementById('map');
                    if (mapNode) {
                        // initialize or update existing map
                        if (!window._logisticsMap) {
                            window._logisticsMap = L.map('map', { attributionControl: false }).setView(center, 12);
                            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(window._logisticsMap);
                            window._logisticsMarker = L.marker(center).addTo(window._logisticsMap).bindPopup('Courier');
                        } else {
                            window._logisticsMap.setView(center, 12);
                            if (window._logisticsMarker) window._logisticsMarker.setLatLng(center);
                            else window._logisticsMarker = L.marker(center).addTo(window._logisticsMap).bindPopup('Courier');
                        }
                    } else {
                        // fallback to embed if no map node
                        const embedUrl = `https://maps.google.com/maps?q=${DEFAULT_MAP_CENTER.lat},${DEFAULT_MAP_CENTER.lng}&output=embed&z=13`;
                        mapPlaceholder.innerHTML = `<iframe src="${embedUrl}" class="w-full h-full rounded-xl border-0" allowfullscreen loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>`;
                    }
                }
            } catch (err) {
                console.warn('Map init failed, falling back to embed', err);
                const embedUrl = `https://maps.google.com/maps?q=${DEFAULT_MAP_CENTER.lat},${DEFAULT_MAP_CENTER.lng}&output=embed&z=13`;
                mapPlaceholder.innerHTML = `<iframe src="${embedUrl}" class="w-full h-full rounded-xl border-0" allowfullscreen loading="lazy" referrerpolicy="no-referrer-when-downgrade"></iframe>`;
            }
        }

        if (typeof showToast === 'function') {
            showToast(`GPS route launched for ${order.order_id || 'current delivery'}`);
        }

        // Also open Google Maps directions/search for quick external navigation access
        try {
            let googleUrl = null;
            if (order && order.loc && order.loc.lat && order.loc.lng) {
                // Use Google Maps directions to destination (origin optional for user)
                googleUrl = `https://www.google.com/maps/dir/?api=1&destination=${order.loc.lat},${order.loc.lng}&travelmode=driving`;
            } else if (destination && typeof destination === 'string') {
                googleUrl = `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(destination)}`;
            }

            if (googleUrl) {
                // Open in a new tab so the user can choose turn-by-turn directions
                window.open(googleUrl, '_blank');
            }
        } catch (err) {
            console.warn('Failed to open Google Maps', err);
        }
    }

    function getStoredLogisticsPartners() {
        try {
            const raw = localStorage.getItem('els_logistics_partners');
            const arr = raw ? JSON.parse(raw) : [];
            return Array.isArray(arr) ? arr : [];
        } catch (err) {
            console.warn('Failed to load logistics partners', err);
            return [];
        }
    }

    function saveLogisticsPartners(partners) {
        try {
            localStorage.setItem('els_logistics_partners', JSON.stringify(Array.isArray(partners) ? partners : []));
        } catch (err) {
            console.warn('Failed to save logistics partners', err);
        }
    }

    function getStoredLogisticsAlerts() {
        try {
            const raw = localStorage.getItem('els_logistics_alerts');
            const arr = raw ? JSON.parse(raw) : [];
            return Array.isArray(arr) ? arr : [];
        } catch (err) {
            console.warn('Failed to load logistics alerts', err);
            return [];
        }
    }

    function saveLogisticsAlerts(alerts) {
        try {
            localStorage.setItem('els_logistics_alerts', JSON.stringify(Array.isArray(alerts) ? alerts : []));
        } catch (err) {
            console.warn('Failed to save logistics alerts', err);
        }
    }

    function renderLogisticsAlerts() {
        const list = document.getElementById('logisticsAlertsList');
        const status = document.getElementById('logisticsLiveStreamStatus');
        if (!list) return;

        const alerts = getStoredLogisticsAlerts();
        if (!alerts.length) {
            list.innerHTML = '<div class="rounded-xl border border-dashed border-slate-700/70 p-3 text-[11px] text-slate-400">No carrier notifications yet. Contact submissions will appear here instantly.</div>';
            if (status) status.textContent = 'Awaiting carrier alert...';
            return;
        }

        const latest = alerts[0];
        if (status) {
            status.textContent = `Live carrier alert • ${latest.name || 'Customer request'}`;
        }

        list.innerHTML = alerts.slice(0, 5).map(alert => {
            const createdAt = alert.createdAt ? new Date(alert.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Now';
            return `
                <div class="rounded-xl border border-slate-800/70 bg-slate-950/60 p-3">
                    <div class="flex items-start justify-between gap-2">
                        <div>
                            <p class="text-[11px] font-bold text-white">${(alert.name || 'Customer').slice(0, 24)}</p>
                            <p class="text-[10px] text-slate-400">${(alert.message || 'Logistics request').slice(0, 80)}</p>
                        </div>
                        <span class="text-[10px] text-emerald-400">${createdAt}</span>
                    </div>
                </div>`;
        }).join('');
    }

    function startLogisticsLiveStream(alert) {
        const status = document.getElementById('logisticsLiveStreamStatus');
        const routeStop = document.getElementById('gpsNextStop');
        const distance = document.getElementById('gpsDistance');
        const eta = document.getElementById('gpsEta');
        const speed = document.getElementById('tel-speed');
        const telEta = document.getElementById('tel-eta');
        const mapNode = document.getElementById('map');

        if (status) {
            status.textContent = `Live carrier alert • ${alert?.name || 'Customer request'}`;
        }
        if (routeStop) {
            routeStop.textContent = `${alert?.name || 'Customer'} • ${alert?.message?.slice(0, 28) || 'Dispatch request'}`;
        }
        if (distance) distance.textContent = '12 km';
        if (eta) eta.textContent = '8 mins';
        if (speed) speed.textContent = '42 km/h';
        if (telEta) telEta.textContent = '6 mins';

        if (!mapNode) return;

        try {
            const route = [
                [6.5244, 3.3792],
                [6.5285, 3.3921],
                [6.5363, 3.4082],
                [6.5452, 3.4217]
            ];

            if (!window._logisticsMap) {
                window._logisticsMap = L.map('map', { attributionControl: false }).setView(route[0], 13);
                L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19 }).addTo(window._logisticsMap);
            } else {
                window._logisticsMap.setView(route[0], 13);
            }

            if (window._logisticsRouteLayer) {
                window._logisticsMap.removeLayer(window._logisticsRouteLayer);
            }
            if (window._logisticsMarker) {
                window._logisticsMap.removeLayer(window._logisticsMarker);
            }

            window._logisticsRouteLayer = L.polyline(route, { color: '#4f46e5', weight: 5, opacity: 0.85 }).addTo(window._logisticsMap);
            window._logisticsMarker = L.marker(route[0], { title: 'Carrier live stream' }).addTo(window._logisticsMap).bindPopup('Carrier is en route');
            window._logisticsMap.fitBounds(window._logisticsRouteLayer.getBounds(), { padding: [24, 24] });

            let index = 0;
            if (window._logisticsStreamInterval) clearInterval(window._logisticsStreamInterval);
            window._logisticsStreamInterval = setInterval(() => {
                index = (index + 1) % route.length;
                const point = route[index];
                if (window._logisticsMarker) {
                    window._logisticsMarker.setLatLng(point);
                }
                window._logisticsMap.panTo(point, { animate: true });
                if (distance) distance.textContent = `${Math.max(2, 12 - index)} km`;
                if (eta) eta.textContent = `${Math.max(2, 8 - index)} mins`;
                if (speed) speed.textContent = `${38 + index * 3} km/h`;
                if (telEta) telEta.textContent = `${Math.max(2, 6 - index)} mins`;
            }, 1400);
        } catch (err) {
            console.warn('Live logistics stream setup failed', err);
        }
    }

    function dispatchContactToLogistics(alert) {
        const alerts = getStoredLogisticsAlerts();
        const normalized = {
            id: alert?.id || `contact-${Date.now()}`,
            name: alert?.name || 'Customer',
            email: alert?.email || '',
            subject: alert?.subject || 'Carrier logistics notification',
            message: alert?.message || '',
            createdAt: alert?.createdAt || new Date().toISOString(),
            source: 'contact'
        };
        alerts.unshift(normalized);
        saveLogisticsAlerts(alerts.slice(0, 20));
        localStorage.setItem('els_latest_logistics_alert', JSON.stringify(normalized));
        renderLogisticsAlerts();
        startLogisticsLiveStream(normalized);
    }

    function renderLogisticsPartners() {
        const list = document.getElementById('logisticsPartnersList');
        if (!list) return;
        const partners = getStoredLogisticsPartners();
        if (!partners.length) {
            list.innerHTML = `<div class="rounded-2xl border border-dashed border-slate-200 p-6 text-center text-slate-500 text-xs">No network partners have registered yet. Use the Courier Sign In or Register buttons to onboard a delivery partner.</div>`;
            return;
        }

        list.innerHTML = partners.map(partner => `
            <div class="bg-white border border-slate-200 rounded-2xl p-4 shadow-sm flex flex-col gap-3">
                <div class="flex items-start justify-between gap-3">
                    <div>
                        <p class="text-sm font-bold text-slate-900">${partner.name}</p>
                        <p class="text-[10px] text-slate-500">${partner.region || 'Delivery Hub'}</p>
                    </div>
                    <span class="text-[10px] font-semibold uppercase tracking-[0.15em] text-slate-600 bg-slate-100 px-2.5 py-1 rounded-full">${partner.logistics_id}</span>
                </div>
                <div class="grid grid-cols-2 gap-2 text-[10px] text-slate-500">
                    <span>Email: ${partner.email}</span>
                    <span>Phone: ${partner.phone || 'N/A'}</span>
                </div>
                <div class="flex flex-wrap gap-2">
                    <button type="button" onclick="logisticsLoadPartner('${partner.email}')" class="text-[10px] px-2.5 py-2 rounded-xl bg-indigo-600 text-white hover:bg-indigo-700 transition">Use this Partner</button>
                    <button type="button" onclick="callBuyer('${partner.phone || ''}')" class="text-[10px] px-2.5 py-2 rounded-xl bg-slate-100 text-slate-700 hover:bg-slate-200 transition">Call Partner</button>
                </div>
            </div>`).join('');
    }

    function updateLogisticsUserInfo() {
        const info = document.getElementById('logisticsUserInfo');
        if (!info) return;
        const user = window.currentUser || JSON.parse(localStorage.getItem('els_user') || '{}') || {};
        if (user.name && user.logistics_id) {
            info.textContent = `${user.name} • ${user.logistics_id}`;
        } else if (user.name) {
            info.textContent = `${user.name} • Hub Guest`;
        } else {
            info.textContent = 'Guest Hub';
        }
    }

    function openDeliveryPartnerLogin() {
        const modal = document.getElementById('deliveryPartnerModal');
        const loginForm = document.getElementById('delivery-partner-login-form');
        const registerForm = document.getElementById('delivery-partner-register-form');
        if (!modal || !loginForm || !registerForm) return;
        modal.classList.remove('hidden');
        loginForm.classList.remove('hidden');
        registerForm.classList.add('hidden');
    }

    function openDeliveryPartnerRegister() {
        const modal = document.getElementById('deliveryPartnerModal');
        const loginForm = document.getElementById('delivery-partner-login-form');
        const registerForm = document.getElementById('delivery-partner-register-form');
        if (!modal || !loginForm || !registerForm) return;
        modal.classList.remove('hidden');
        loginForm.classList.add('hidden');
        registerForm.classList.remove('hidden');
    }

    function closeDeliveryPartnerModal() {
        const modal = document.getElementById('deliveryPartnerModal');
        if (modal) modal.classList.add('hidden');
    }

    function logisticsToggleAuthForm(type) {
        const loginForm = document.getElementById('delivery-partner-login-form');
        const registerForm = document.getElementById('delivery-partner-register-form');
        if (!loginForm || !registerForm) return;
        if (type === 'register') {
            loginForm.classList.add('hidden');
            registerForm.classList.remove('hidden');
        } else {
            loginForm.classList.remove('hidden');
            registerForm.classList.add('hidden');
        }
    }

    function logisticsCreateUserSession(user) {
        window.currentUser = window.currentUser || {};
        window.currentUser.name = user.name;
        window.currentUser.email = user.email;
        window.currentUser.phone = user.phone || window.currentUser.phone || '';
        window.currentUser.region = user.region || window.currentUser.region || '';
        window.currentUser.logistics_id = user.logistics_id;
        window.currentUser.role = 'delivery';
        try { localStorage.setItem('jas_user', JSON.stringify(window.currentUser)); } catch (e) {}
        updateLogisticsUserInfo();
        if (typeof renderProfile === 'function') renderProfile();
    }

    function logisticsHandleLogin(event) {
        if (event) event.preventDefault();
        const email = document.getElementById('logistics-login-email')?.value.trim();
        const password = document.getElementById('logistics-login-pass')?.value;
        if (!email || !password) {
            return showToast('Enter email and password to continue');
        }
        const partners = getStoredLogisticsPartners();
        const partner = partners.find(p => String(p.email).toLowerCase() === email.toLowerCase());
        if (!partner) {
            return showToast('This partner is not registered yet. Please register first.');
        }
        logisticsCreateUserSession(partner);
        closeDeliveryPartnerModal();
        renderLogisticsPartners();
        if (typeof goTo === 'function') goTo('logistics');
        showToast('Courier signed in. Your Logistics ID is ' + partner.logistics_id);
    }

    function logisticsHandleRegister(event) {
        if (event) event.preventDefault();
        const name = document.getElementById('logistics-register-name')?.value.trim();
        const email = document.getElementById('logistics-register-email')?.value.trim();
        const password = document.getElementById('logistics-register-pass')?.value;
        const phone = document.getElementById('logistics-register-phone')?.value.trim();
        const region = document.getElementById('logistics-register-region')?.value || 'delivery-hub';
        if (!name || !email || !password) {
            return showToast('Please complete all required registration fields');
        }
        const logisticsId = `JAS-LG-${Math.random().toString(36).substring(2, 10).toUpperCase()}`;
        const newPartner = {
            name,
            email,
            phone: phone || '',
            region,
            logistics_id: logisticsId,
            role: 'delivery'
        };
        const partners = getStoredLogisticsPartners();
        const exists = partners.some(p => String(p.email).toLowerCase() === email.toLowerCase());
        if (exists) {
            return showToast('Partner with this email already exists');
        }
        partners.push(newPartner);
        saveLogisticsPartners(partners);
        logisticsCreateUserSession(newPartner);
        renderLogisticsPartners();
        closeDeliveryPartnerModal();
        if (typeof goTo === 'function') goTo('logistics');
        showToast('Courier partner registered. Your Logistics ID is ' + logisticsId);
    }

    function callBuyer(phone) {
        if (!phone) {
            return showToast('Phone number is not available');
        }
        window.location.href = `tel:${phone}`;
    }

    function logisticsLoadPartner(email) {
        const partners = getStoredLogisticsPartners();
        const partner = partners.find(p => String(p.email).toLowerCase() === String(email).toLowerCase());
        if (!partner) {
            return showToast('Partner not found');
        }
        logisticsCreateUserSession(partner);
        renderLogisticsPartners();
        showToast(`Loaded partner ${partner.name}`);
    }

    function trackOrderInLogistics() {
        const orderId = document.getElementById('logisticsTrackOrderId')?.value.trim();
        if (!orderId) {
            return showToast('Enter an order reference to track');
        }
        const order = (window.allOrders || []).find(o => String(o.order_id).toLowerCase() === orderId.toLowerCase());
        if (!order) {
            return showToast('Order not found');
        }
        if (typeof openOrderChat === 'function') {
            openOrderChat(order.order_id);
        }
        if (typeof goTo === 'function') goTo('messages');
        showToast(`Tracking order ${order.order_id}`);
    }

    // Module Setup Initialization
    document.addEventListener('DOMContentLoaded', () => {
        const loginForm = document.getElementById('login-form');
        if (loginForm) {
            loginForm.addEventListener('submit', handleLoginEnhanced);
        }

        updateLogisticsUserInfo();
        renderLogisticsPartners();
        renderLogisticsAlerts();
        const latestAlert = localStorage.getItem('jas_latest_logistics_alert');
        if (latestAlert) {
            try {
                startLogisticsLiveStream(JSON.parse(latestAlert));
            } catch (err) {
                console.warn('Failed to restore latest logistics alert', err);
            }
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
    window.JAS_Engine = {
        renderOrders,
        renderLogisticsView,
        toggleLogisticsRole,
        requestLogisticsPickup,
        acceptShipment,
        completeDelivery,
        togglePasswordVisibility,
        calculateTotals,
        openPaymentChooser,
        simulateLogistics,
        startDeliveryGuide
    };

    window.openDeliveryPartnerLogin = openDeliveryPartnerLogin;
    window.openDeliveryPartnerRegister = openDeliveryPartnerRegister;
    window.closeDeliveryPartnerModal = closeDeliveryPartnerModal;
    window.logisticsToggleAuthForm = logisticsToggleAuthForm;
    window.logisticsHandleLogin = logisticsHandleLogin;
    window.logisticsHandleRegister = logisticsHandleRegister;
    window.logisticsLoadPartner = logisticsLoadPartner;
    window.renderLogisticsPartners = renderLogisticsPartners;
    window.getStoredLogisticsPartners = getStoredLogisticsPartners;
    window.saveLogisticsPartners = saveLogisticsPartners;
    window.renderLogisticsAlerts = renderLogisticsAlerts;
    window.dispatchContactToLogistics = dispatchContactToLogistics;
    window.startLogisticsLiveStream = startLogisticsLiveStream;
    window.callBuyer = callBuyer;
    window.trackOrderInLogistics = trackOrderInLogistics;

})();