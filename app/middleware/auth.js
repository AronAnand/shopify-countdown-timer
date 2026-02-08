require('@shopify/shopify-api/adapters/node');
const { shopifyApi, ApiVersion } = require('@shopify/shopify-api');
const { Shop } = require('../models');

/**
 * Initialize Shopify API context
 */
const shopify = shopifyApi({
    apiKey: process.env.SHOPIFY_API_KEY,
    apiSecretKey: process.env.SHOPIFY_API_SECRET,
    scopes: (process.env.SCOPES || 'write_products,read_products').split(','),
    hostName: (process.env.HOST || '').replace(/https?:\/\//, ''),
    apiVersion: ApiVersion.January26,
    isEmbeddedApp: true
});

/**
 * Verify Shopify session token from App Bridge
 * This middleware validates the JWT sent by the embedded app
 * and attaches shop and accessToken to the request object
 */
async function verifyShopifySession(req, res, next) {
    try {
        // Development mode bypass for local testing
        if (process.env.NODE_ENV === 'development') {
            const authHeader = req.headers.authorization;
            // If no auth header or empty token in dev mode, use a test shop
            if (!authHeader || authHeader === 'Bearer ' || authHeader === 'Bearer') {
                req.shop = process.env.TEST_SHOP || 'test-shop.myshopify.com';
                req.accessToken = 'dev-mode-token';
                console.log('[DEV MODE] Bypassing auth for shop:', req.shop);
                return next();
            }
        }

        // Get the Authorization header
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return res.status(401).json({
                success: false,
                error: 'Missing or invalid authorization header',
                code: 'MISSING_AUTH_HEADER'
            });
        }

        const token = authHeader.replace('Bearer ', '');

        // Verify the session token
        let payload;
        try {
            payload = await shopify.session.decodeSessionToken(token);
        } catch (tokenError) {
            console.error('Session token verification failed:', tokenError.message);
            return res.status(401).json({
                success: false,
                error: 'Invalid session token',
                code: 'INVALID_TOKEN'
            });
        }

        // Extract shop domain from payload
        const shopDomain = payload.dest.replace('https://', '');

        if (!shopDomain) {
            return res.status(401).json({
                success: false,
                error: 'Could not extract shop from token',
                code: 'MISSING_SHOP'
            });
        }

        // Get shop record with access token from database
        const shopRecord = await Shop.getWithAccessToken(shopDomain);

        if (!shopRecord) {
            return res.status(401).json({
                success: false,
                error: 'Shop not found or not installed',
                code: 'SHOP_NOT_FOUND'
            });
        }

        if (!shopRecord.accessToken) {
            return res.status(401).json({
                success: false,
                error: 'Shop access token not available',
                code: 'MISSING_ACCESS_TOKEN'
            });
        }

        // Attach shop info to request for use in routes
        req.shop = shopDomain;
        req.shopRecord = shopRecord;
        req.accessToken = shopRecord.accessToken;
        req.sessionPayload = payload;

        // Update last active timestamp
        shopRecord.lastActiveAt = new Date();
        await shopRecord.save();

        next();
    } catch (error) {
        console.error('Authentication error:', error);
        return res.status(500).json({
            success: false,
            error: 'Authentication failed',
            code: 'AUTH_ERROR',
            message: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
}

/**
 * Optional authentication - doesn't fail, just doesn't attach shop
 * Useful for routes that work with or without authentication
 */
async function optionalShopifySession(req, res, next) {
    try {
        const authHeader = req.headers.authorization;

        if (!authHeader || !authHeader.startsWith('Bearer ')) {
            return next();
        }

        const token = authHeader.replace('Bearer ', '');
        const payload = await shopify.session.decodeSessionToken(token);
        const shopDomain = payload.dest.replace('https://', '');

        const shopRecord = await Shop.getWithAccessToken(shopDomain);

        if (shopRecord && shopRecord.accessToken) {
            req.shop = shopDomain;
            req.shopRecord = shopRecord;
            req.accessToken = shopRecord.accessToken;
            req.sessionPayload = payload;
        }

        next();
    } catch (error) {
        // Silently continue without authentication
        next();
    }
}

/**
 * Verify shop ownership for a resource
 * Use after verifyShopifySession to ensure user owns the resource
 */
function verifyShopOwnership(shopField = 'shop') {
    return (req, res, next) => {
        const resourceShop = req.params[shopField] || req.body[shopField];

        if (resourceShop && resourceShop !== req.shop) {
            return res.status(403).json({
                success: false,
                error: 'Access denied to this resource',
                code: 'FORBIDDEN'
            });
        }

        next();
    };
}

/**
 * Rate limiting middleware (simple in-memory implementation)
 * For production, use Redis-based rate limiting
 */
const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000; // 1 minute
const RATE_LIMIT_MAX = 100; // requests per window

function rateLimit(req, res, next) {
    const identifier = req.shop || req.ip;
    const now = Date.now();

    if (!rateLimitMap.has(identifier)) {
        rateLimitMap.set(identifier, { count: 1, windowStart: now });
        return next();
    }

    const record = rateLimitMap.get(identifier);

    if (now - record.windowStart > RATE_LIMIT_WINDOW) {
        // Reset window
        record.count = 1;
        record.windowStart = now;
        return next();
    }

    record.count++;

    if (record.count > RATE_LIMIT_MAX) {
        return res.status(429).json({
            success: false,
            error: 'Too many requests',
            code: 'RATE_LIMITED',
            retryAfter: Math.ceil((RATE_LIMIT_WINDOW - (now - record.windowStart)) / 1000)
        });
    }

    next();
}

// Clean up rate limit map periodically
setInterval(() => {
    const now = Date.now();
    for (const [key, record] of rateLimitMap.entries()) {
        if (now - record.windowStart > RATE_LIMIT_WINDOW * 2) {
            rateLimitMap.delete(key);
        }
    }
}, RATE_LIMIT_WINDOW);

module.exports = {
    shopify,
    verifyShopifySession,
    optionalShopifySession,
    verifyShopOwnership,
    rateLimit
};
