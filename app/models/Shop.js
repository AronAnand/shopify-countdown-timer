const mongoose = require('mongoose');

/**
 * Shop Schema - Stores Shopify shop OAuth data and settings
 * This is the main tenant record for multi-tenant isolation
 */
const shopSchema = new mongoose.Schema({
    // Shopify shop domain (e.g., mystore.myshopify.com)
    shop: {
        type: String,
        required: [true, 'Shop domain is required'],
        unique: true,
        index: true,
        trim: true,
        lowercase: true,
        match: [
            /^[a-zA-Z0-9][a-zA-Z0-9-]*\.myshopify\.com$/,
            'Invalid Shopify shop domain format'
        ]
    },

    // OAuth access token for Shopify API
    accessToken: {
        type: String,
        required: [true, 'Access token is required'],
        select: false // Don't include by default in queries for security
    },

    // Shopify API scopes granted
    scopes: {
        type: [String],
        default: []
    },

    // App installation status
    isInstalled: {
        type: Boolean,
        default: true,
        index: true
    },

    // Shop information from Shopify
    shopInfo: {
        name: String,
        email: String,
        domain: String,
        currency: String,
        timezone: String,
        country: String,
        planName: String
    },

    // App settings (per-shop customization)
    settings: {
        // Default appearance settings for new timers
        defaultAppearance: {
            backgroundColor: {
                type: String,
                default: '#000000'
            },
            textColor: {
                type: String,
                default: '#FFFFFF'
            },
            position: {
                type: String,
                default: 'above-cart'
            }
        },
        // Feature flags
        features: {
            aiGenerationEnabled: {
                type: Boolean,
                default: true
            }
        }
    },

    // Subscription/billing info
    billing: {
        plan: {
            type: String,
            enum: ['free', 'basic', 'pro', 'enterprise'],
            default: 'free'
        },
        chargeId: String,
        trialEndsAt: Date,
        billingOn: Date
    },

    // Onboarding tracking
    onboarding: {
        completedAt: Date,
        steps: {
            installedApp: { type: Boolean, default: true },
            createdFirstTimer: { type: Boolean, default: false },
            viewedAnalytics: { type: Boolean, default: false }
        }
    },

    // Metadata
    installedAt: {
        type: Date,
        default: Date.now
    },
    uninstalledAt: Date,
    lastActiveAt: {
        type: Date,
        default: Date.now
    }
}, {
    timestamps: true
});

// Indexes for common queries
shopSchema.index({ isInstalled: 1 });
shopSchema.index({ 'billing.plan': 1 });
shopSchema.index({ createdAt: -1 });

/**
 * Static method: Find or create shop record during OAuth
 */
shopSchema.statics.findOrCreateByShop = async function (shopDomain, accessToken, scopes = []) {
    const normalizedShop = shopDomain.toLowerCase().trim();

    let shop = await this.findOne({ shop: normalizedShop });

    if (shop) {
        // Update existing shop
        shop.accessToken = accessToken;
        shop.scopes = scopes;
        shop.isInstalled = true;
        shop.uninstalledAt = null;
        shop.lastActiveAt = new Date();
        await shop.save();
    } else {
        // Create new shop
        shop = await this.create({
            shop: normalizedShop,
            accessToken,
            scopes,
            isInstalled: true
        });
    }

    return shop;
};

/**
 * Static method: Get shop with access token
 */
shopSchema.statics.getWithAccessToken = async function (shopDomain) {
    return this.findOne({
        shop: shopDomain.toLowerCase().trim(),
        isInstalled: true
    }).select('+accessToken');
};

/**
 * Static method: Mark shop as uninstalled
 */
shopSchema.statics.markUninstalled = async function (shopDomain) {
    return this.findOneAndUpdate(
        { shop: shopDomain.toLowerCase().trim() },
        {
            isInstalled: false,
            uninstalledAt: new Date(),
            accessToken: null
        },
        { new: true }
    );
};

/**
 * Instance method: Update shop info from Shopify API
 */
shopSchema.methods.updateShopInfo = async function (shopData) {
    this.shopInfo = {
        name: shopData.name,
        email: shopData.email,
        domain: shopData.domain,
        currency: shopData.currency,
        timezone: shopData.iana_timezone,
        country: shopData.country_code,
        planName: shopData.plan_name
    };
    this.lastActiveAt = new Date();
    return this.save();
};

/**
 * Instance method: Check if shop has specific scope
 */
shopSchema.methods.hasScope = function (scope) {
    return this.scopes.includes(scope);
};

/**
 * Instance method: Update onboarding step
 */
shopSchema.methods.completeOnboardingStep = async function (step) {
    if (this.onboarding.steps[step] !== undefined) {
        this.onboarding.steps[step] = true;

        // Check if all steps completed
        const allCompleted = Object.values(this.onboarding.steps).every(v => v === true);
        if (allCompleted && !this.onboarding.completedAt) {
            this.onboarding.completedAt = new Date();
        }

        return this.save();
    }
    return this;
};

const Shop = mongoose.model('Shop', shopSchema);

module.exports = Shop;
