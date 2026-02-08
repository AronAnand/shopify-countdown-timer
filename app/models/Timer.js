const mongoose = require('mongoose');

/**
 * Timer Schema - Countdown timer configuration for Shopify stores
 * Supports two timer types:
 * - Fixed: Specific start/end datetime (same countdown for all users)
 * - Evergreen: Session-based, duration in minutes (resets per visitor)
 */
const timerSchema = new mongoose.Schema({
    // Multi-tenant: Each timer belongs to a specific shop
    shop: {
        type: String,
        required: [true, 'Shop domain is required'],
        index: true,
        trim: true,
        lowercase: true
    },

    // Timer name for merchant identification
    name: {
        type: String,
        required: [true, 'Timer name is required'],
        maxlength: [100, 'Name cannot exceed 100 characters'],
        trim: true
    },

    // Timer type: fixed or evergreen
    type: {
        type: String,
        enum: {
            values: ['fixed', 'evergreen'],
            message: 'Type must be either "fixed" or "evergreen"'
        },
        required: [true, 'Timer type is required']
    },

    // For fixed timers: specific start and end dates
    startDate: {
        type: Date,
        required: function () {
            return this.type === 'fixed';
        }
    },
    endDate: {
        type: Date,
        required: function () {
            return this.type === 'fixed';
        },
        validate: {
            validator: function (value) {
                if (this.type === 'fixed' && this.startDate) {
                    return value > this.startDate;
                }
                return true;
            },
            message: 'End date must be after start date'
        }
    },

    // For evergreen timers: duration in minutes
    durationMinutes: {
        type: Number,
        required: function () {
            return this.type === 'evergreen';
        },
        min: [1, 'Duration must be at least 1 minute'],
        max: [10080, 'Duration cannot exceed 7 days (10080 minutes)']
    },

    // Targeting configuration
    targeting: {
        scope: {
            type: String,
            enum: {
                values: ['all', 'products', 'collections'],
                message: 'Scope must be "all", "products", or "collections"'
            },
            default: 'all'
        },
        // Array of Shopify product GIDs (for products scope)
        productIds: [{
            type: String,
            trim: true
        }],
        // Array of Shopify collection GIDs (for collections scope)
        collectionIds: [{
            type: String,
            trim: true
        }]
    },

    // Appearance customization
    appearance: {
        backgroundColor: {
            type: String,
            default: '#000000',
            match: [/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'Invalid hex color']
        },
        textColor: {
            type: String,
            default: '#FFFFFF',
            match: [/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/, 'Invalid hex color']
        },
        position: {
            type: String,
            enum: ['top', 'above-cart', 'below-cart', 'bottom'],
            default: 'above-cart'
        },
        headline: {
            type: String,
            maxlength: [50, 'Headline cannot exceed 50 characters'],
            default: 'Hurry! Offer ends soon'
        },
        supportingText: {
            type: String,
            maxlength: [100, 'Supporting text cannot exceed 100 characters']
        }
    },

    // Analytics
    impressions: {
        type: Number,
        default: 0,
        min: 0
    },

    // Active status (can be toggled by merchant)
    isActive: {
        type: Boolean,
        default: true,
        index: true
    },

    // AI-generated flag
    isAiGenerated: {
        type: Boolean,
        default: false
    }
}, {
    timestamps: true, // Adds createdAt and updatedAt
    toJSON: { virtuals: true },
    toObject: { virtuals: true }
});

/**
 * Virtual field: Calculate timer status based on dates
 * - active: Timer is currently running (for fixed: between start and end)
 * - scheduled: Timer will start in the future (for fixed only)
 * - expired: Timer has ended (for fixed only)
 * - evergreen: Always active for evergreen timers
 */
timerSchema.virtual('status').get(function () {
    if (!this.isActive) {
        return 'inactive';
    }

    if (this.type === 'evergreen') {
        return 'active';
    }

    const now = new Date();

    if (this.startDate > now) {
        return 'scheduled';
    }

    if (this.endDate < now) {
        return 'expired';
    }

    return 'active';
});

// Compound indexes for optimized queries
timerSchema.index({ shop: 1, isActive: 1 });
timerSchema.index({ shop: 1, 'targeting.scope': 1 });
timerSchema.index({ shop: 1, 'targeting.productIds': 1 });
timerSchema.index({ shop: 1, 'targeting.collectionIds': 1 });
timerSchema.index({ shop: 1, createdAt: -1 });

// Index for finding active fixed timers by date range
timerSchema.index({
    shop: 1,
    isActive: 1,
    type: 1,
    startDate: 1,
    endDate: 1
});

/**
 * Static method: Find active timers for a shop that match product/collection
 */
timerSchema.statics.findActiveForProduct = async function (shop, productId, collectionIds = []) {
    const now = new Date();

    const query = {
        shop,
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

    const timers = await this.find(query).sort({ createdAt: -1 });

    // Filter by targeting
    return timers.filter(timer => {
        const scope = timer.targeting?.scope || 'all';

        if (scope === 'all') {
            return true;
        }

        if (scope === 'products' && productId) {
            return timer.targeting.productIds?.includes(productId);
        }

        if (scope === 'collections' && collectionIds.length > 0) {
            return timer.targeting.collectionIds?.some(id =>
                collectionIds.includes(id)
            );
        }

        return false;
    });
};

/**
 * Instance method: Check if timer applies to a product
 */
timerSchema.methods.appliesToProduct = function (productId, collectionIds = []) {
    const scope = this.targeting?.scope || 'all';

    if (scope === 'all') return true;

    if (scope === 'products') {
        return this.targeting.productIds?.includes(productId);
    }

    if (scope === 'collections') {
        return this.targeting.collectionIds?.some(id =>
            collectionIds.includes(id)
        );
    }

    return false;
};

/**
 * Instance method: Increment impression count
 */
timerSchema.methods.incrementImpressions = async function () {
    this.impressions += 1;
    return this.save();
};

const Timer = mongoose.model('Timer', timerSchema);

module.exports = Timer;
