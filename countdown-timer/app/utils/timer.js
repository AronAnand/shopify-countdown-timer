/**
 * Timer Utilities - Shared helper functions
 */

/**
 * Calculate remaining time in milliseconds
 */
export const calculateTimeRemaining = (endDate) => {
    const end = new Date(endDate).getTime();
    const now = Date.now();
    return Math.max(0, end - now);
};

/**
 * Parse milliseconds into time components
 */
export const parseTimeRemaining = (ms) => {
    if (ms <= 0) {
        return { days: 0, hours: 0, minutes: 0, seconds: 0, expired: true };
    }

    const totalSeconds = Math.floor(ms / 1000);
    const days = Math.floor(totalSeconds / 86400);
    const hours = Math.floor((totalSeconds % 86400) / 3600);
    const minutes = Math.floor((totalSeconds % 3600) / 60);
    const seconds = totalSeconds % 60;

    return { days, hours, minutes, seconds, expired: false };
};

/**
 * Format time component with leading zero
 */
export const padTime = (num) => String(num).padStart(2, '0');

/**
 * Format countdown display string
 */
export const formatCountdown = (time) => {
    const { days, hours, minutes, seconds } = time;

    if (days > 0) {
        return `${days}d ${padTime(hours)}:${padTime(minutes)}:${padTime(seconds)}`;
    }

    return `${padTime(hours)}:${padTime(minutes)}:${padTime(seconds)}`;
};

/**
 * Validate hex color format
 */
export const isValidHexColor = (color) => {
    return /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/.test(color);
};

/**
 * Sanitize user input string
 */
export const sanitizeString = (str, maxLength = 100) => {
    if (!str || typeof str !== 'string') return '';

    return str
        .trim()
        .replace(/\s+/g, ' ')
        .replace(/[<>{}[\]]/g, '')
        .slice(0, maxLength);
};

/**
 * Calculate timer status
 */
export const calculateTimerStatus = (timer) => {
    if (!timer) return 'unknown';
    if (!timer.isActive) return 'inactive';

    if (timer.type === 'evergreen') {
        return 'active';
    }

    const now = new Date();
    const start = new Date(timer.startDate);
    const end = new Date(timer.endDate);

    if (now < start) return 'scheduled';
    if (now > end) return 'expired';
    return 'active';
};

/**
 * Check if timer matches product targeting
 */
export const matchesTargeting = (timer, productId, collectionIds = []) => {
    const scope = timer.targeting?.scope || 'all';

    if (scope === 'all') return true;

    if (scope === 'products' && productId) {
        return timer.targeting.productIds?.some(id =>
            id === productId || id.includes(productId) || productId.includes(id)
        );
    }

    if (scope === 'collections' && collectionIds.length > 0) {
        return timer.targeting.collectionIds?.some(id =>
            collectionIds.some(cid => cid === id || cid.includes(id) || id.includes(cid))
        );
    }

    return false;
};

/**
 * Generate localStorage key for evergreen timer
 */
export const getEvergreenStorageKey = (timerId) => `countdown_timer_${timerId}`;

export default {
    calculateTimeRemaining,
    parseTimeRemaining,
    padTime,
    formatCountdown,
    isValidHexColor,
    sanitizeString,
    calculateTimerStatus,
    matchesTargeting,
    getEvergreenStorageKey
};
