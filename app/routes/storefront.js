const express = require('express');
const mongoose = require('mongoose');
const { Timer } = require('../models');

const router = express.Router();

/**
 * PUBLIC API - No authentication required
 * These endpoints are called from the customer-facing storefront
 */

/**
 * GET /api/storefront/timer - Get active timer for a product/page
 * Query params:
 *   - shop: Shop domain (required)
 *   - productId: Shopify product GID (optional)
 *   - collectionIds: Comma-separated collection GIDs (optional)
 */
router.get('/timer', async (req, res) => {
    try {
        const { shop, productId, collectionIds } = req.query;

        // Validate shop parameter
        if (!shop) {
            return res.status(400).json({
                success: false,
                error: 'Shop parameter is required'
            });
        }

        const normalizedShop = shop.toLowerCase().trim();
        const collectionIdArray = collectionIds
            ? collectionIds.split(',').map(id => id.trim()).filter(Boolean)
            : [];

        const now = new Date();

        // Build query for active timers
        const query = {
            shop: normalizedShop,
            isActive: true,
            $or: [
                // Evergreen timers are always active
                { type: 'evergreen' },
                // Fixed timers within date range
                {
                    type: 'fixed',
                    startDate: { $lte: now },
                    endDate: { $gte: now }
                }
            ]
        };

        // Find all matching timers, sorted by newest first
        const timers = await Timer.find(query)
            .sort({ createdAt: -1 })
            .lean();

        // Filter by targeting rules
        const matchingTimers = timers.filter(timer => {
            const scope = timer.targeting?.scope || 'all';

            // 'all' scope matches everything
            if (scope === 'all') {
                return true;
            }

            // 'products' scope - check if productId matches
            if (scope === 'products' && productId) {
                return timer.targeting.productIds?.some(id =>
                    id === productId ||
                    id.includes(productId) ||
                    productId.includes(id)
                );
            }

            // 'collections' scope - check if any collection matches
            if (scope === 'collections' && collectionIdArray.length > 0) {
                return timer.targeting.collectionIds?.some(id =>
                    collectionIdArray.some(cid =>
                        cid === id ||
                        cid.includes(id) ||
                        id.includes(cid)
                    )
                );
            }

            return false;
        });

        // Return the most recently created matching timer
        const timer = matchingTimers[0];

        if (!timer) {
            // Set cache header even for 404
            res.set('Cache-Control', 'public, max-age=60');
            return res.status(404).json({
                success: false,
                error: 'No active timer found'
            });
        }

        // Build minimal response for security and performance
        const response = {
            id: timer._id,
            type: timer.type,
            appearance: {
                backgroundColor: timer.appearance?.backgroundColor || '#000000',
                textColor: timer.appearance?.textColor || '#FFFFFF',
                position: timer.appearance?.position || 'above-cart',
                headline: timer.appearance?.headline || '',
                supportingText: timer.appearance?.supportingText || ''
            }
        };

        // Add type-specific fields
        if (timer.type === 'fixed') {
            response.endDate = timer.endDate;
            response.startDate = timer.startDate;
        } else if (timer.type === 'evergreen') {
            response.durationMinutes = timer.durationMinutes;
        }

        // Set cache header (1 minute)
        res.set('Cache-Control', 'public, max-age=60');

        res.json({
            success: true,
            data: response
        });
    } catch (error) {
        console.error('Storefront timer error:', error);
        // Fail gracefully - don't break the storefront
        res.set('Cache-Control', 'public, max-age=30');
        res.status(500).json({
            success: false,
            error: 'Unable to fetch timer'
        });
    }
});

/**
 * POST /api/storefront/timer/:id/impression - Record timer impression
 * This endpoint increments the impression count for analytics
 */
router.post('/timer/:id/impression', async (req, res) => {
    try {
        const { id } = req.params;
        const { shop } = req.body;

        // Validate ObjectId format
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid timer ID'
            });
        }

        // Find and increment impression count atomically
        const timer = await Timer.findOneAndUpdate(
            {
                _id: id,
                ...(shop ? { shop: shop.toLowerCase().trim() } : {})
            },
            { $inc: { impressions: 1 } },
            { new: false } // Don't need updated doc back
        );

        if (!timer) {
            return res.status(404).json({
                success: false,
                error: 'Timer not found'
            });
        }

        // No cache for POST requests
        res.json({
            success: true,
            message: 'Impression recorded'
        });
    } catch (error) {
        console.error('Impression tracking error:', error);
        // Fail silently for analytics - don't break the storefront
        res.json({
            success: true,
            message: 'Impression recorded'
        });
    }
});

/**
 * GET /api/storefront/health - Health check for storefront API
 */
router.get('/health', (req, res) => {
    res.set('Cache-Control', 'public, max-age=30');
    res.json({
        success: true,
        status: 'healthy',
        timestamp: new Date().toISOString()
    });
});

module.exports = router;
