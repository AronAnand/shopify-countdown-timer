/**
 * Countdown Timer Widget - Lightweight Preact Component
 * Target: <30KB gzipped
 * 
 * This widget is loaded on Shopify storefronts to display countdown timers.
 * Uses vanilla Preact for minimal bundle size.
 */

// Mini Preact implementation for smallest possible bundle
// In production, use CDN: https://esm.sh/preact
const { h, render, Component } = window.preact || (function () {
    // Minimal Preact-like implementation if not loaded from CDN
    const createElement = (type, props, ...children) => ({ type, props: { ...props, children } });

    class Component {
        constructor(props) {
            this.props = props;
            this.state = {};
        }
        setState(partial) {
            this.state = { ...this.state, ...(typeof partial === 'function' ? partial(this.state) : partial) };
            this._render();
        }
        _render() {
            if (this._container) {
                render(this.render(), this._container);
            }
        }
    }

    const render = (vnode, container) => {
        if (!vnode) return;

        if (typeof vnode === 'string' || typeof vnode === 'number') {
            container.textContent = vnode;
            return;
        }

        const el = document.createElement(vnode.type);

        for (const [key, value] of Object.entries(vnode.props || {})) {
            if (key === 'children') continue;
            if (key === 'style' && typeof value === 'object') {
                Object.assign(el.style, value);
            } else if (key.startsWith('on')) {
                el.addEventListener(key.slice(2).toLowerCase(), value);
            } else {
                el.setAttribute(key, value);
            }
        }

        const children = vnode.props?.children || [];
        for (const child of [].concat(children)) {
            if (child) {
                const childContainer = document.createElement('span');
                render(child, childContainer);
                el.appendChild(childContainer.firstChild || childContainer);
            }
        }

        container.innerHTML = '';
        container.appendChild(el);
    };

    return { h: createElement, render, Component };
})();

/**
 * Storage key generator for evergreen timers
 */
const getStorageKey = (timerId) => `countdown_timer_${timerId}`;

/**
 * Parse time remaining into components
 */
const parseTimeRemaining = (ms) => {
    if (ms <= 0) return { hours: 0, minutes: 0, seconds: 0, expired: true };

    const totalSeconds = Math.floor(ms / 1000);
    const hours = Math.floor(totalSeconds / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return { hours, minutes, seconds, expired: false };
};

/**
 * Pad number with leading zero
 */
const pad = (num) => String(num).padStart(2, '0');

/**
 * Main CountdownTimer component
 */
class CountdownTimer {
    constructor(container, config) {
        this.container = container;
        this.config = config;
        this.timer = null;
        this.intervalId = null;
        this.impressionSent = false;

        this.init();
    }

    async init() {
        try {
            await this.fetchTimer();

            if (this.timer) {
                this.render();
                this.startCountdown();
                this.trackImpression();
            }
        } catch (error) {
            console.error('[CountdownTimer] Init error:', error);
            // Fail silently - don't break the page
        }
    }

    async fetchTimer() {
        const { shop, productId, collectionIds, apiUrl } = this.config;

        const params = new URLSearchParams({ shop });
        if (productId) params.append('productId', productId);
        if (collectionIds) params.append('collectionIds', collectionIds);

        const url = `${apiUrl}/api/storefront/timer?${params}`;

        try {
            const response = await fetch(url, {
                method: 'GET',
                headers: { 'Accept': 'application/json' },
                cache: 'default'
            });

            if (!response.ok) {
                if (response.status === 404) {
                    // No timer found - this is expected
                    return;
                }
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();

            if (data.success && data.data) {
                this.timer = data.data;
                this.setupTimerEndpoint();
            }
        } catch (error) {
            console.error('[CountdownTimer] Fetch error:', error);
        }
    }

    setupTimerEndpoint() {
        const timer = this.timer;

        if (timer.type === 'fixed') {
            // Fixed timer - use endDate directly
            this.endTime = new Date(timer.endDate).getTime();
        } else if (timer.type === 'evergreen') {
            // Evergreen timer - check localStorage for start time
            const storageKey = getStorageKey(timer.id);
            let startTime;

            try {
                const stored = localStorage.getItem(storageKey);

                if (stored) {
                    startTime = parseInt(stored, 10);
                    const elapsed = Date.now() - startTime;
                    const durationMs = timer.durationMinutes * 60 * 1000;

                    // Check if timer has expired
                    if (elapsed >= durationMs) {
                        // Timer expired - restart it
                        localStorage.removeItem(storageKey);
                        startTime = Date.now();
                        localStorage.setItem(storageKey, String(startTime));
                    }
                } else {
                    // First visit - start timer now
                    startTime = Date.now();
                    localStorage.setItem(storageKey, String(startTime));
                }
            } catch (e) {
                // localStorage not available - start fresh
                startTime = Date.now();
            }

            this.endTime = startTime + (timer.durationMinutes * 60 * 1000);
        }
    }

    startCountdown() {
        this.updateCountdown();
        this.intervalId = setInterval(() => this.updateCountdown(), 1000);
    }

    updateCountdown() {
        const remaining = this.endTime - Date.now();
        const time = parseTimeRemaining(remaining);

        if (time.expired) {
            this.handleExpired();
            return;
        }

        // Update DOM efficiently
        const timeDisplay = this.container.querySelector('.countdown-time');
        if (timeDisplay) {
            timeDisplay.textContent = `${pad(time.hours)}:${pad(time.minutes)}:${pad(time.seconds)}`;
        }
    }

    handleExpired() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }

        // For evergreen timers, restart
        if (this.timer.type === 'evergreen') {
            const storageKey = getStorageKey(this.timer.id);
            try {
                localStorage.removeItem(storageKey);
            } catch (e) { }

            // Restart after a brief delay
            setTimeout(() => {
                this.setupTimerEndpoint();
                this.startCountdown();
            }, 100);
        } else {
            // Fixed timer - hide widget
            this.container.style.display = 'none';
        }
    }

    async trackImpression() {
        if (this.impressionSent) return;

        // Debounce - wait 2 seconds before tracking
        setTimeout(async () => {
            if (this.impressionSent) return;
            this.impressionSent = true;

            const { apiUrl, shop } = this.config;

            try {
                await fetch(`${apiUrl}/api/storefront/timer/${this.timer.id}/impression`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ shop })
                });
            } catch (e) {
                // Fail silently
            }
        }, 2000);
    }

    render() {
        const timer = this.timer;
        const appearance = timer.appearance || {};

        // Create element with inline styles
        const html = `
      <div class="countdown-widget" style="
        background-color: ${appearance.backgroundColor || '#000000'};
        color: ${appearance.textColor || '#FFFFFF'};
        padding: 16px;
        border-radiusor: 8px;
        text-align: center;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
        margin: 16px 0;
        box-sizing: border-box;
      ">
        ${appearance.headline ? `
          <div class="countdown-headline" style="
            font-size: 14px;
            font-weight: 600;
            margin-bottom: 8px;
            letter-spacing: 0.5px;
          ">${this.escapeHtml(appearance.headline)}</div>
        ` : ''}
        
        <div class="countdown-time" style="
          font-size: 32px;
          font-weight: 700;
          font-variant-numeric: tabular-nums;
          font-family: 'SF Mono', SFMono-Regular, Consolas, 'Liberation Mono', monospace;
          letter-spacing: 2px;
        ">00:00:00</div>
        
        ${appearance.supportingText ? `
          <div class="countdown-supporting" style="
            font-size: 12px;
            margin-top: 8px;
            opacity: 0.85;
          ">${this.escapeHtml(appearance.supportingText)}</div>
        ` : ''}
      </div>
    `;

        this.container.innerHTML = html;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    destroy() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
        this.container.innerHTML = '';
    }
}

/**
 * Initialize widget on page load
 */
(function initCountdownWidget() {
    // Find all widget containers on the page
    const containers = document.querySelectorAll('[data-countdown-timer]');

    if (containers.length === 0) {
        return;
    }

    containers.forEach(container => {
        const config = {
            shop: container.dataset.shop,
            productId: container.dataset.productId,
            collectionIds: container.dataset.collectionIds,
            apiUrl: container.dataset.apiUrl || ''
        };

        // Validate required config
        if (!config.shop) {
            console.warn('[CountdownTimer] Missing shop domain');
            return;
        }

        // Initialize widget
        new CountdownTimer(container, config);
    });
})();

// Export for testing
if (typeof window !== 'undefined') {
    window.CountdownTimer = CountdownTimer;
}
