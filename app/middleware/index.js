/**
 * Middleware Index - Export all middleware functions
 */
const {
    shopify,
    verifyShopifySession,
    optionalShopifySession,
    verifyShopOwnership,
    rateLimit
} = require('./auth');

module.exports = {
    shopify,
    verifyShopifySession,
    optionalShopifySession,
    verifyShopOwnership,
    rateLimit
};
