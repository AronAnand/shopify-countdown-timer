const express = require('express');
const mongoose = require('mongoose');
const { Timer } = require('../models');
const { verifyShopifySession, rateLimit } = require('../middleware');

const router = express.Router();

// Apply authentication to all routes
router.use(verifyShopifySession);
router.use(rateLimit);

/**
 * Validation helper functions
 */
const validateTimerInput = (data, isUpdate = false) => {
    const errors = [];

    // Required fields for creation
    if (!isUpdate) {
        if (!data.name?.trim()) {
            errors.push({ field: 'name', message: 'Timer name is required' });
        }
        if (!data.type || !['fixed', 'evergreen'].includes(data.type)) {
            errors.push({ field: 'type', message: 'Timer type must be "fixed" or "evergreen"' });
        }
    }

    // Name validation
    if (data.name && data.name.length > 100) {
        errors.push({ field: 'name', message: 'Name cannot exceed 100 characters' });
    }

    // Type-specific validation
    if (data.type === 'fixed') {
        if (!data.startDate) {
            errors.push({ field: 'startDate', message: 'Start date is required for fixed timers' });
        }
        if (!data.endDate) {
            errors.push({ field: 'endDate', message: 'End date is required for fixed timers' });
        }
        if (data.startDate && data.endDate) {
            const start = new Date(data.startDate);
            const end = new Date(data.endDate);
            if (isNaN(start.getTime())) {
                errors.push({ field: 'startDate', message: 'Invalid start date format' });
            }
            if (isNaN(end.getTime())) {
                errors.push({ field: 'endDate', message: 'Invalid end date format' });
            }
            if (end <= start) {
                errors.push({ field: 'endDate', message: 'End date must be after start date' });
            }
        }
    }

    if (data.type === 'evergreen') {
        if (!data.durationMinutes || data.durationMinutes < 1) {
            errors.push({ field: 'durationMinutes', message: 'Duration must be at least 1 minute' });
        }
        if (data.durationMinutes > 10080) {
            errors.push({ field: 'durationMinutes', message: 'Duration cannot exceed 7 days' });
        }
    }

    // Appearance validation
    if (data.appearance) {
        const hexColorRegex = /^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/;
        if (data.appearance.backgroundColor && !hexColorRegex.test(data.appearance.backgroundColor)) {
            errors.push({ field: 'appearance.backgroundColor', message: 'Invalid hex color format' });
        }
        if (data.appearance.textColor && !hexColorRegex.test(data.appearance.textColor)) {
            errors.push({ field: 'appearance.textColor', message: 'Invalid hex color format' });
        }
        if (data.appearance.headline && data.appearance.headline.length > 50) {
            errors.push({ field: 'appearance.headline', message: 'Headline cannot exceed 50 characters' });
        }
        if (data.appearance.supportingText && data.appearance.supportingText.length > 100) {
            errors.push({ field: 'appearance.supportingText', message: 'Supporting text cannot exceed 100 characters' });
        }
    }

    // Targeting validation
    if (data.targeting) {
        if (data.targeting.scope && !['all', 'products', 'collections'].includes(data.targeting.scope)) {
            errors.push({ field: 'targeting.scope', message: 'Invalid targeting scope' });
        }
        if (data.targeting.scope === 'products' && (!data.targeting.productIds || !data.targeting.productIds.length)) {
            errors.push({ field: 'targeting.productIds', message: 'At least one product must be selected' });
        }
        if (data.targeting.scope === 'collections' && (!data.targeting.collectionIds || !data.targeting.collectionIds.length)) {
            errors.push({ field: 'targeting.collectionIds', message: 'At least one collection must be selected' });
        }
    }

    return errors;
};

/**
 * Sanitize user input
 */
const sanitizeInput = (data) => {
    const sanitized = { ...data };

    if (sanitized.name) {
        sanitized.name = sanitized.name.trim().slice(0, 100);
    }
    if (sanitized.appearance?.headline) {
        sanitized.appearance.headline = sanitized.appearance.headline.trim().slice(0, 50);
    }
    if (sanitized.appearance?.supportingText) {
        sanitized.appearance.supportingText = sanitized.appearance.supportingText.trim().slice(0, 100);
    }

    return sanitized;
};

/**
 * GET /api/timers - List all timers for authenticated shop
 */
router.get('/', async (req, res) => {
    try {
        const { status, type, page = 1, limit = 20 } = req.query;
        const shop = req.shop;

        // Build query
        const query = { shop };

        if (type && ['fixed', 'evergreen'].includes(type)) {
            query.type = type;
        }

        // Calculate pagination
        const skip = (parseInt(page) - 1) * parseInt(limit);
        const limitNum = Math.min(parseInt(limit), 100);

        // Execute query with sorting
        const [timers, total] = await Promise.all([
            Timer.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limitNum)
                .lean(),
            Timer.countDocuments(query)
        ]);

        // Calculate status for each timer (since virtual fields don't work with lean)
        const now = new Date();
        const timersWithStatus = timers.map(timer => {
            let timerStatus = 'active';

            if (!timer.isActive) {
                timerStatus = 'inactive';
            } else if (timer.type === 'fixed') {
                if (new Date(timer.startDate) > now) {
                    timerStatus = 'scheduled';
                } else if (new Date(timer.endDate) < now) {
                    timerStatus = 'expired';
                }
            }

            return { ...timer, status: timerStatus };
        });

        // Filter by status if provided
        let filteredTimers = timersWithStatus;
        if (status && ['active', 'scheduled', 'expired', 'inactive'].includes(status)) {
            filteredTimers = timersWithStatus.filter(t => t.status === status);
        }

        res.json({
            success: true,
            data: filteredTimers,
            pagination: {
                page: parseInt(page),
                limit: limitNum,
                total,
                pages: Math.ceil(total / limitNum)
            }
        });
    } catch (error) {
        console.error('Error fetching timers:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch timers',
            message: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * POST /api/timers - Create a new timer
 */
router.post('/', async (req, res) => {
    try {
        const shop = req.shop;
        const data = sanitizeInput(req.body);

        // Validate input
        const errors = validateTimerInput(data);
        if (errors.length > 0) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                errors
            });
        }

        // Create timer with shop association
        const timerData = {
            ...data,
            shop,
            targeting: data.targeting || { scope: 'all' },
            appearance: {
                backgroundColor: data.appearance?.backgroundColor || '#000000',
                textColor: data.appearance?.textColor || '#FFFFFF',
                position: data.appearance?.position || 'above-cart',
                headline: data.appearance?.headline || 'Hurry! Offer ends soon',
                supportingText: data.appearance?.supportingText || ''
            }
        };

        const timer = new Timer(timerData);
        await timer.save();

        // Update onboarding if first timer
        if (req.shopRecord) {
            await req.shopRecord.completeOnboardingStep('createdFirstTimer');
        }

        res.status(201).json({
            success: true,
            data: timer,
            message: 'Timer created successfully'
        });
    } catch (error) {
        console.error('Error creating timer:', error);

        // Handle Mongoose validation errors
        if (error.name === 'ValidationError') {
            const errors = Object.values(error.errors).map(e => ({
                field: e.path,
                message: e.message
            }));
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                errors
            });
        }

        res.status(500).json({
            success: false,
            error: 'Failed to create timer',
            message: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * GET /api/timers/:id - Get a single timer
 */
router.get('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const shop = req.shop;

        // Validate ObjectId format
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid timer ID format'
            });
        }

        const timer = await Timer.findOne({ _id: id, shop });

        if (!timer) {
            return res.status(404).json({
                success: false,
                error: 'Timer not found'
            });
        }

        res.json({
            success: true,
            data: timer
        });
    } catch (error) {
        console.error('Error fetching timer:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to fetch timer',
            message: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * PUT /api/timers/:id - Update a timer
 */
router.put('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const shop = req.shop;
        const data = sanitizeInput(req.body);

        // Validate ObjectId format
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid timer ID format'
            });
        }

        // Find existing timer to get current type for validation
        const existingTimer = await Timer.findOne({ _id: id, shop });

        if (!existingTimer) {
            return res.status(404).json({
                success: false,
                error: 'Timer not found'
            });
        }

        // Use existing type if not provided in update
        const timerType = data.type || existingTimer.type;
        const validationData = { ...data, type: timerType };

        // Validate input
        const errors = validateTimerInput(validationData, true);
        if (errors.length > 0) {
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                errors
            });
        }

        // Update timer
        Object.assign(existingTimer, data);
        await existingTimer.save();

        res.json({
            success: true,
            data: existingTimer,
            message: 'Timer updated successfully'
        });
    } catch (error) {
        console.error('Error updating timer:', error);

        if (error.name === 'ValidationError') {
            const errors = Object.values(error.errors).map(e => ({
                field: e.path,
                message: e.message
            }));
            return res.status(400).json({
                success: false,
                error: 'Validation failed',
                errors
            });
        }

        res.status(500).json({
            success: false,
            error: 'Failed to update timer',
            message: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * DELETE /api/timers/:id - Delete a timer
 */
router.delete('/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const shop = req.shop;

        // Validate ObjectId format
        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid timer ID format'
            });
        }

        const timer = await Timer.findOneAndDelete({ _id: id, shop });

        if (!timer) {
            return res.status(404).json({
                success: false,
                error: 'Timer not found'
            });
        }

        res.json({
            success: true,
            message: 'Timer deleted successfully'
        });
    } catch (error) {
        console.error('Error deleting timer:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to delete timer',
            message: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

/**
 * PATCH /api/timers/:id/toggle - Toggle timer active status
 */
router.patch('/:id/toggle', async (req, res) => {
    try {
        const { id } = req.params;
        const shop = req.shop;

        if (!mongoose.Types.ObjectId.isValid(id)) {
            return res.status(400).json({
                success: false,
                error: 'Invalid timer ID format'
            });
        }

        const timer = await Timer.findOne({ _id: id, shop });

        if (!timer) {
            return res.status(404).json({
                success: false,
                error: 'Timer not found'
            });
        }

        timer.isActive = !timer.isActive;
        await timer.save();

        res.json({
            success: true,
            data: timer,
            message: `Timer ${timer.isActive ? 'activated' : 'deactivated'} successfully`
        });
    } catch (error) {
        console.error('Error toggling timer:', error);
        res.status(500).json({
            success: false,
            error: 'Failed to toggle timer',
            message: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }
});

module.exports = router;
