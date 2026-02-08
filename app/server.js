require('dotenv').config();

const express = require('express');
const mongoose = require('mongoose');
const helmet = require('helmet');
const cors = require('cors');

const { timersRouter, storefrontRouter } = require('./routes');
const { Timer, Shop } = require('./models');

const app = express();
const PORT = process.env.PORT || 3000;

/**
 * MongoDB Connection
 */
const connectDB = async () => {
    try {
        const mongoUri = process.env.MONGODB_URI;

        if (!mongoUri) {
            console.error('❌ MONGODB_URI environment variable is not set');
            process.exit(1);
        }

        await mongoose.connect(mongoUri, {
            // Modern mongoose doesn't need these options, but keeping for compatibility
        });

        console.log('✅ MongoDB connected successfully');
    } catch (error) {
        console.error('❌ MongoDB connection error:', error.message);
        process.exit(1);
    }
};

// Handle MongoDB connection events
mongoose.connection.on('disconnected', () => {
    console.warn('⚠️ MongoDB disconnected. Attempting to reconnect...');
});

mongoose.connection.on('reconnected', () => {
    console.log('✅ MongoDB reconnected');
});

/**
 * Security Middleware
 */
app.use(helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "https://cdn.shopify.com"],
            scriptSrcAttr: ["'unsafe-inline'"],  // Allow onclick handlers
            styleSrc: ["'self'", "'unsafe-inline'", "https://cdn.shopify.com", "https://unpkg.com"],
            imgSrc: ["'self'", "data:", "https:"],
            connectSrc: ["'self'", "https://*.shopify.com", "https://*.myshopify.com"],
            frameSrc: ["'self'", "https://*.shopify.com", "https://*.myshopify.com"],
            frameAncestors: ["'self'", "https://*.shopify.com", "https://*.myshopify.com", "https://admin.shopify.com"]
        }
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" }
}));

/**
 * CORS Configuration for Shopify
 */
const corsOptions = {
    origin: (origin, callback) => {
        // Allow requests with no origin (like mobile apps or Postman)
        if (!origin) return callback(null, true);

        // Allow Shopify domains
        const allowedPatterns = [
            /^https:\/\/.*\.myshopify\.com$/,
            /^https:\/\/.*\.shopify\.com$/,
            /^https:\/\/admin\.shopify\.com$/,
            /^http:\/\/localhost(:\d+)?$/,
            /^https:\/\/localhost(:\d+)?$/
        ];

        const isAllowed = allowedPatterns.some(pattern => pattern.test(origin));

        if (isAllowed) {
            callback(null, true);
        } else {
            console.warn(`CORS blocked origin: ${origin}`);
            callback(null, true); // Allow anyway for development - tighten in production
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With']
};

app.use(cors(corsOptions));

/**
 * Body Parsing Middleware
 */
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ extended: true, limit: '10kb' }));

/**
 * Request Logging (development)
 */
if (process.env.NODE_ENV === 'development') {
    app.use((req, res, next) => {
        const start = Date.now();
        res.on('finish', () => {
            const duration = Date.now() - start;
            console.log(`${req.method} ${req.path} ${res.statusCode} - ${duration}ms`);
        });
        next();
    });
}

/**
 * Health Check Endpoint
 */
app.get('/api/health', async (req, res) => {
    try {
        // Check MongoDB connection
        const dbStatus = mongoose.connection.readyState === 1 ? 'connected' : 'disconnected';

        res.json({
            success: true,
            status: 'healthy',
            timestamp: new Date().toISOString(),
            version: process.env.npm_package_version || '1.0.0',
            database: dbStatus,
            environment: process.env.NODE_ENV || 'development'
        });
    } catch (error) {
        res.status(500).json({
            success: false,
            status: 'unhealthy',
            error: error.message
        });
    }
});

/**
 * API Routes
 */
// Protected routes (require authentication)
app.use('/api/timers', timersRouter);

// Public routes (no authentication)
app.use('/api/storefront', storefrontRouter);

/**
 * Root Route - Embedded App HTML
 */
app.get('/', (req, res) => {
    const shop = req.query.shop || '';
    const host = req.query.host || '';

    res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Countdown Timer</title>
    <meta name="shopify-api-key" content="${process.env.SHOPIFY_API_KEY}" />
    <script src="https://cdn.shopify.com/shopifycloud/app-bridge.js"></script>
    <style>
        * { box-sizing: border-box; margin: 0; padding: 0; }
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; background: #f6f6f7; }
        .app-container { max-width: 1200px; margin: 0 auto; padding: 20px; }
        .card { background: white; border-radius: 8px; padding: 24px; margin-bottom: 16px; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 24px; }
        h1 { font-size: 20px; font-weight: 600; color: #202223; }
        .btn { background: #008060; color: white; border: none; padding: 10px 20px; border-radius: 6px; cursor: pointer; font-size: 14px; font-weight: 500; }
        .btn:hover { background: #006e52; }
        .btn:disabled { background: #8c9196; cursor: not-allowed; }
        .btn-secondary { background: #e1e3e5; color: #202223; }
        .btn-secondary:hover { background: #c9cccf; }
        .btn-danger { background: #d82c0d; }
        .btn-danger:hover { background: #bc2200; }
        .stats { display: grid; grid-template-columns: repeat(3, 1fr); gap: 16px; margin-bottom: 24px; }
        .stat-card { background: white; border-radius: 8px; padding: 20px; text-align: center; box-shadow: 0 1px 3px rgba(0,0,0,0.1); }
        .stat-value { font-size: 32px; font-weight: 700; color: #008060; }
        .stat-label { font-size: 14px; color: #6d7175; margin-top: 4px; }
        .timer-list { background: white; border-radius: 8px; overflow: hidden; }
        .timer-item { padding: 16px 20px; border-bottom: 1px solid #e1e3e5; display: flex; justify-content: space-between; align-items: center; }
        .timer-item:last-child { border-bottom: none; }
        .timer-name { font-weight: 500; color: #202223; }
        .timer-status { padding: 4px 12px; border-radius: 12px; font-size: 12px; }
        .status-active { background: #aee9d1; color: #006e52; }
        .status-inactive { background: #ffd8d8; color: #d82c0d; }
        .empty-state { text-align: center; padding: 60px 20px; color: #6d7175; }
        .empty-state h2 { font-size: 16px; margin-bottom: 8px; color: #202223; }
        
        /* Modal Styles */
        .modal-overlay { display: none; position: fixed; top: 0; left: 0; right: 0; bottom: 0; background: rgba(0,0,0,0.5); z-index: 1000; align-items: center; justify-content: center; }
        .modal-overlay.active { display: flex; }
        .modal { background: white; border-radius: 12px; width: 100%; max-width: 600px; max-height: 90vh; overflow-y: auto; }
        .modal-header { padding: 20px 24px; border-bottom: 1px solid #e1e3e5; display: flex; justify-content: space-between; align-items: center; }
        .modal-header h2 { font-size: 18px; font-weight: 600; color: #202223; }
        .modal-close { background: none; border: none; font-size: 24px; cursor: pointer; color: #6d7175; }
        .modal-body { padding: 24px; }
        .modal-footer { padding: 16px 24px; border-top: 1px solid #e1e3e5; display: flex; justify-content: flex-end; gap: 12px; }
        
        /* Form Styles */
        .form-group { margin-bottom: 16px; }
        .form-label { display: block; font-size: 14px; font-weight: 500; color: #202223; margin-bottom: 6px; }
        .form-hint { font-size: 12px; color: #6d7175; margin-top: 4px; }
        .form-input { width: 100%; padding: 10px 12px; border: 1px solid #c9cccf; border-radius: 6px; font-size: 14px; color: #202223; }
        .form-input:focus { outline: none; border-color: #008060; box-shadow: 0 0 0 2px rgba(0,128,96,0.2); }
        .form-row { display: grid; grid-template-columns: 1fr 1fr; gap: 16px; }
        .color-preview { width: 40px; height: 40px; border-radius: 6px; border: 1px solid #c9cccf; cursor: pointer; }
        .color-row { display: flex; gap: 12px; align-items: center; }
        .hidden { display: none !important; }
        .form-section { border-top: 1px solid #e1e3e5; padding-top: 16px; margin-top: 16px; }
        .form-section-title { font-size: 14px; font-weight: 600; color: #202223; margin-bottom: 12px; }
        
        /* Toast */
        .toast { position: fixed; bottom: 20px; right: 20px; background: #202223; color: white; padding: 12px 20px; border-radius: 8px; font-size: 14px; z-index: 2000; display: none; }
        .toast.success { background: #008060; }
        .toast.error { background: #d82c0d; }
        .toast.show { display: block; animation: slideIn 0.3s ease; }
        @keyframes slideIn { from { transform: translateY(20px); opacity: 0; } to { transform: translateY(0); opacity: 1; } }
        
        .timer-actions { display: flex; gap: 8px; }
        .btn-sm { padding: 6px 12px; font-size: 12px; }
        .badge { display: inline-block; padding: 2px 8px; border-radius: 4px; font-size: 11px; font-weight: 500; margin-left: 8px; }
        .badge-fixed { background: #e3f1ff; color: #0066cc; }
        .badge-evergreen { background: #e9f5e9; color: #008060; }
    </style>
</head>
<body>
    <div class="app-container">
        <div class="header">
            <h1>⏰ Countdown Timer Dashboard</h1>
            <button class="btn" onclick="openModal()">+ Create Timer</button>
        </div>
        
        <div class="stats">
            <div class="stat-card">
                <div class="stat-value" id="total-timers">0</div>
                <div class="stat-label">Total Timers</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" id="active-timers">0</div>
                <div class="stat-label">Active</div>
            </div>
            <div class="stat-card">
                <div class="stat-value" id="views">0</div>
                <div class="stat-label">Total Views</div>
            </div>
        </div>
        
        <div class="card">
            <h2 style="margin-bottom: 16px; font-size: 16px;">Your Timers</h2>
            <div id="timer-list" class="timer-list">
                <div class="empty-state">
                    <h2>No timers yet</h2>
                    <p>Create your first countdown timer to boost urgency and sales!</p>
                </div>
            </div>
        </div>
    </div>
    
    <!-- Create/Edit Timer Modal -->
    <div class="modal-overlay" id="modal">
        <div class="modal">
            <div class="modal-header">
                <h2 id="modal-title">Create New Timer</h2>
                <button class="modal-close" onclick="closeModal()">&times;</button>
            </div>
            <div class="modal-body">
                <form id="timer-form">
                    <input type="hidden" id="timer-id">
                    
                    <div class="form-group">
                        <label class="form-label">Timer Name *</label>
                        <input type="text" class="form-input" id="timer-name" placeholder="e.g., Flash Sale Countdown" required>
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label">Headline (displayed on storefront) *</label>
                        <input type="text" class="form-input" id="timer-title" placeholder="e.g., Hurry! Offer ends soon" required maxlength="50">
                        <div class="form-hint">Max 50 characters</div>
                    </div>
                    
                    <div class="form-group">
                        <label class="form-label">Timer Type *</label>
                        <select class="form-input" id="timer-type" onchange="toggleTimerTypeFields()">
                            <option value="fixed">Fixed - Ends at specific date/time (same for all visitors)</option>
                            <option value="evergreen">Evergreen - Per-visitor countdown (resets per session)</option>
                        </select>
                    </div>
                    
                    <!-- Fixed Timer Fields -->
                    <div id="fixed-fields">
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label">Start Date</label>
                                <input type="datetime-local" class="form-input" id="timer-start">
                            </div>
                            <div class="form-group">
                                <label class="form-label">End Date *</label>
                                <input type="datetime-local" class="form-input" id="timer-end">
                            </div>
                        </div>
                    </div>
                    
                    <!-- Evergreen Timer Fields -->
                    <div id="evergreen-fields" class="hidden">
                        <div class="form-group">
                            <label class="form-label">Duration (minutes) *</label>
                            <input type="number" class="form-input" id="timer-duration" min="1" max="10080" value="60" placeholder="e.g., 60">
                            <div class="form-hint">Timer resets for each new visitor. Max: 10080 min (7 days)</div>
                        </div>
                    </div>
                    
                    <!-- Targeting Section -->
                    <div class="form-section">
                        <div class="form-section-title">Targeting</div>
                        <div class="form-group">
                            <label class="form-label">Apply Timer To</label>
                            <select class="form-input" id="timer-scope" onchange="toggleTargetingFields()">
                                <option value="all">All Products</option>
                                <option value="products">Specific Products</option>
                                <option value="collections">Specific Collections</option>
                            </select>
                        </div>
                        
                        <div id="product-ids-field" class="form-group hidden">
                            <label class="form-label">Product IDs</label>
                            <textarea class="form-input" id="timer-product-ids" rows="2" placeholder="Enter Shopify Product IDs, one per line\ne.g., gid://shopify/Product/123456"></textarea>
                            <div class="form-hint">Enter full Shopify GIDs or numeric IDs, one per line</div>
                        </div>
                        
                        <div id="collection-ids-field" class="form-group hidden">
                            <label class="form-label">Collection IDs</label>
                            <textarea class="form-input" id="timer-collection-ids" rows="2" placeholder="Enter Shopify Collection IDs, one per line\ne.g., gid://shopify/Collection/789"></textarea>
                            <div class="form-hint">Enter full Shopify GIDs or numeric IDs, one per line</div>
                        </div>
                    </div>
                    
                    <!-- Appearance Section -->
                    <div class="form-section">
                        <div class="form-section-title">Appearance</div>
                        <div class="form-row">
                            <div class="form-group">
                                <label class="form-label">Background Color</label>
                                <div class="color-row">
                                    <input type="color" class="color-preview" id="timer-bg" value="#000000">
                                    <input type="text" class="form-input" id="timer-bg-text" value="#000000" style="flex:1">
                                </div>
                            </div>
                            <div class="form-group">
                                <label class="form-label">Text Color</label>
                                <div class="color-row">
                                    <input type="color" class="color-preview" id="timer-text" value="#FFFFFF">
                                    <input type="text" class="form-input" id="timer-text-text" value="#FFFFFF" style="flex:1">
                                </div>
                            </div>
                        </div>
                        
                        <div class="form-group">
                            <label class="form-label">Expired Message</label>
                            <input type="text" class="form-input" id="timer-expired" placeholder="e.g., This offer has ended">
                        </div>
                    </div>
                </form>
            </div>
            <div class="modal-footer">
                <button class="btn btn-secondary" onclick="closeModal()">Cancel</button>
                <button class="btn" id="save-btn" onclick="saveTimer()">Create Timer</button>
            </div>
        </div>
    </div>
    
    <div class="toast" id="toast"></div>
    
    <script>
        const shop = '${shop}';
        let editingTimerId = null;
        
        // Color picker sync
        document.getElementById('timer-bg').addEventListener('input', e => {
            document.getElementById('timer-bg-text').value = e.target.value;
        });
        document.getElementById('timer-bg-text').addEventListener('input', e => {
            document.getElementById('timer-bg').value = e.target.value;
        });
        document.getElementById('timer-text').addEventListener('input', e => {
            document.getElementById('timer-text-text').value = e.target.value;
        });
        document.getElementById('timer-text-text').addEventListener('input', e => {
            document.getElementById('timer-text').value = e.target.value;
        });
        
        // Format date to local datetime-local format
        function formatLocalDateTime(date) {
            const year = date.getFullYear();
            const month = String(date.getMonth() + 1).padStart(2, '0');
            const day = String(date.getDate()).padStart(2, '0');
            const hours = String(date.getHours()).padStart(2, '0');
            const minutes = String(date.getMinutes()).padStart(2, '0');
            return year + '-' + month + '-' + day + 'T' + hours + ':' + minutes;
        }
        
        // Set default dates
        function setDefaultDates() {
            const now = new Date();
            const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
            document.getElementById('timer-start').value = formatLocalDateTime(now);
            document.getElementById('timer-end').value = formatLocalDateTime(tomorrow);
        }
        setDefaultDates();
        
        // Toggle timer type fields
        function toggleTimerTypeFields() {
            const type = document.getElementById('timer-type').value;
            const fixedFields = document.getElementById('fixed-fields');
            const evergreenFields = document.getElementById('evergreen-fields');
            
            if (type === 'fixed') {
                fixedFields.classList.remove('hidden');
                evergreenFields.classList.add('hidden');
            } else {
                fixedFields.classList.add('hidden');
                evergreenFields.classList.remove('hidden');
            }
        }
        
        // Toggle targeting fields
        function toggleTargetingFields() {
            const scope = document.getElementById('timer-scope').value;
            const productField = document.getElementById('product-ids-field');
            const collectionField = document.getElementById('collection-ids-field');
            
            productField.classList.add('hidden');
            collectionField.classList.add('hidden');
            
            if (scope === 'products') {
                productField.classList.remove('hidden');
            } else if (scope === 'collections') {
                collectionField.classList.remove('hidden');
            }
        }
        
        function openModal(timer = null) {
            editingTimerId = timer ? timer._id : null;
            document.getElementById('modal-title').textContent = timer ? 'Edit Timer' : 'Create New Timer';
            document.getElementById('save-btn').textContent = timer ? 'Save Changes' : 'Create Timer';
            
            if (timer) {
                // Populate form with timer data
                document.getElementById('timer-id').value = timer._id;
                document.getElementById('timer-name').value = timer.name || '';
                document.getElementById('timer-title').value = timer.appearance?.headline || timer.title || '';
                document.getElementById('timer-type').value = timer.type || 'fixed';
                
                if (timer.type === 'fixed') {
                    if (timer.startDate) {
                        const start = new Date(timer.startDate);
                        document.getElementById('timer-start').value = formatLocalDateTime(start);
                    }
                    if (timer.endDate) {
                        const end = new Date(timer.endDate);
                        document.getElementById('timer-end').value = formatLocalDateTime(end);
                    }
                } else {
                    document.getElementById('timer-duration').value = timer.durationMinutes || 60;
                }
                
                document.getElementById('timer-scope').value = timer.targeting?.scope || 'all';
                document.getElementById('timer-product-ids').value = (timer.targeting?.productIds || []).join('\\n');
                document.getElementById('timer-collection-ids').value = (timer.targeting?.collectionIds || []).join('\\n');
                
                const bgColor = timer.appearance?.backgroundColor || timer.style?.backgroundColor || '#000000';
                const textColor = timer.appearance?.textColor || timer.style?.textColor || '#FFFFFF';
                document.getElementById('timer-bg').value = bgColor;
                document.getElementById('timer-bg-text').value = bgColor;
                document.getElementById('timer-text').value = textColor;
                document.getElementById('timer-text-text').value = textColor;
                document.getElementById('timer-expired').value = timer.expiredMessage || '';
                
                toggleTimerTypeFields();
                toggleTargetingFields();
            } else {
                resetForm();
            }
            
            document.getElementById('modal').classList.add('active');
        }
        
        function closeModal() {
            document.getElementById('modal').classList.remove('active');
            editingTimerId = null;
            resetForm();
        }
        
        function resetForm() {
            document.getElementById('timer-form').reset();
            document.getElementById('timer-id').value = '';
            setDefaultDates();
            document.getElementById('timer-bg').value = '#000000';
            document.getElementById('timer-bg-text').value = '#000000';
            document.getElementById('timer-text').value = '#FFFFFF';
            document.getElementById('timer-text-text').value = '#FFFFFF';
            document.getElementById('timer-type').value = 'fixed';
            document.getElementById('timer-scope').value = 'all';
            document.getElementById('timer-duration').value = 60;
            toggleTimerTypeFields();
            toggleTargetingFields();
        }
        
        function showToast(message, type = 'success') {
            const toast = document.getElementById('toast');
            toast.textContent = message;
            toast.className = 'toast ' + type + ' show';
            setTimeout(() => toast.classList.remove('show'), 3000);
        }
        
        async function getSessionToken() {
            if (window.shopify && window.shopify.idToken) {
                return await window.shopify.idToken();
            }
            return '';
        }
        
        function parseIds(text) {
            return text.split('\\n').map(id => id.trim()).filter(id => id.length > 0);
        }
        
        async function saveTimer() {
            const btn = document.getElementById('save-btn');
            const isEditing = !!editingTimerId;
            btn.disabled = true;
            btn.textContent = isEditing ? 'Saving...' : 'Creating...';
            
            try {
                const timerType = document.getElementById('timer-type').value;
                const scope = document.getElementById('timer-scope').value;
                
                const timerData = {
                    name: document.getElementById('timer-name').value,
                    type: timerType,
                    targeting: {
                        scope: scope
                    },
                    appearance: {
                        backgroundColor: document.getElementById('timer-bg').value,
                        textColor: document.getElementById('timer-text').value,
                        headline: document.getElementById('timer-title').value
                    },
                    isActive: true
                };
                
                // Add type-specific fields
                if (timerType === 'fixed') {
                    timerData.startDate = new Date(document.getElementById('timer-start').value).toISOString();
                    timerData.endDate = new Date(document.getElementById('timer-end').value).toISOString();
                } else {
                    timerData.durationMinutes = parseInt(document.getElementById('timer-duration').value) || 60;
                }
                
                // Add targeting IDs
                if (scope === 'products') {
                    timerData.targeting.productIds = parseIds(document.getElementById('timer-product-ids').value);
                } else if (scope === 'collections') {
                    timerData.targeting.collectionIds = parseIds(document.getElementById('timer-collection-ids').value);
                }
                
                // Add expired message
                const expiredMsg = document.getElementById('timer-expired').value;
                if (expiredMsg) timerData.expiredMessage = expiredMsg;
                
                const token = await getSessionToken();
                const url = isEditing ? '/api/timers/' + editingTimerId : '/api/timers';
                const method = isEditing ? 'PUT' : 'POST';
                
                const res = await fetch(url, {
                    method: method,
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + token
                    },
                    body: JSON.stringify(timerData)
                });
                
                const data = await res.json();
                
                if (data.success) {
                    showToast(isEditing ? 'Timer updated!' : 'Timer created!', 'success');
                    closeModal();
                    loadTimers();
                } else {
                    showToast(data.error || 'Failed to save timer', 'error');
                }
            } catch (err) {
                console.error('Error saving timer:', err);
                showToast('Failed to save: ' + err.message, 'error');
            } finally {
                btn.disabled = false;
                btn.textContent = isEditing ? 'Save Changes' : 'Create Timer';
            }
        }
        
        async function deleteTimer(id) {
            if (!confirm('Are you sure you want to delete this timer?')) return;
            
            try {
                const token = await getSessionToken();
                const res = await fetch('/api/timers/' + id, {
                    method: 'DELETE',
                    headers: { 'Authorization': 'Bearer ' + token }
                });
                const data = await res.json();
                if (data.success) {
                    showToast('Timer deleted', 'success');
                    loadTimers();
                } else {
                    showToast(data.error || 'Failed to delete', 'error');
                }
            } catch (err) {
                showToast('Failed to delete timer', 'error');
            }
        }
        
        async function toggleTimer(id, currentStatus) {
            try {
                const token = await getSessionToken();
                const res = await fetch('/api/timers/' + id, {
                    method: 'PUT',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': 'Bearer ' + token
                    },
                    body: JSON.stringify({ isActive: !currentStatus })
                });
                const data = await res.json();
                if (data.success) {
                    showToast('Timer ' + (!currentStatus ? 'activated' : 'deactivated'), 'success');
                    loadTimers();
                }
            } catch (err) {
                showToast('Failed to update timer', 'error');
            }
        }
        
        // Store timers for edit functionality
        let allTimers = [];
        
        async function loadTimers() {
            try {
                const token = await getSessionToken();
                const res = await fetch('/api/timers', {
                    headers: { 'Authorization': 'Bearer ' + token }
                });
                const data = await res.json();
                if (data.success && data.data) {
                    allTimers = data.data;
                    renderTimers(data.data);
                }
            } catch (err) {
                console.log('Loading timers...', err);
            }
        }
        
        function editTimer(id) {
            const timer = allTimers.find(t => t._id === id);
            if (timer) openModal(timer);
        }
        
        function renderTimers(timers) {
            const list = document.getElementById('timer-list');
            const totalEl = document.getElementById('total-timers');
            const activeEl = document.getElementById('active-timers');
            const viewsEl = document.getElementById('views');
            
            totalEl.textContent = timers.length;
            activeEl.textContent = timers.filter(t => t.isActive).length;
            viewsEl.textContent = timers.reduce((sum, t) => sum + (t.impressions || 0), 0);
            
            if (timers.length === 0) {
                list.innerHTML = '<div class="empty-state"><h2>No timers yet</h2><p>Create your first countdown timer to boost urgency!</p></div>';
                return;
            }
            
            list.innerHTML = timers.map(t => {
                const typeBadge = t.type === 'evergreen' 
                    ? '<span class="badge badge-evergreen">Evergreen</span>' 
                    : '<span class="badge badge-fixed">Fixed</span>';
                const endInfo = t.type === 'fixed' 
                    ? 'Ends: ' + new Date(t.endDate).toLocaleString() 
                    : 'Duration: ' + t.durationMinutes + ' minutes';
                
                return \`
                <div class="timer-item">
                    <div>
                        <div class="timer-name">\${t.name}\${typeBadge}</div>
                        <div style="font-size: 12px; color: #6d7175;">\${endInfo} | Impressions: \${t.impressions || 0}</div>
                    </div>
                    <div class="timer-actions">
                        <button class="btn btn-sm btn-secondary" onclick="editTimer('\${t._id}')">Edit</button>
                        <button class="btn btn-sm \${t.isActive ? 'btn-secondary' : ''}" onclick="toggleTimer('\${t._id}', \${t.isActive})">
                            \${t.isActive ? 'Deactivate' : 'Activate'}
                        </button>
                        <button class="btn btn-sm btn-danger" onclick="deleteTimer('\${t._id}')">Delete</button>
                    </div>
                </div>
            \`}).join('');
        }
        
        // Load timers on page load
        setTimeout(loadTimers, 500);
    </script>
</body>
</html>
    `);
});

/**
 * 404 Handler
 */
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        path: req.path
    });
});

/**
 * Global Error Handler
 */
app.use((err, req, res, next) => {
    console.error('Unhandled error:', err);

    // Don't leak error details in production
    const isDev = process.env.NODE_ENV === 'development';

    res.status(err.status || 500).json({
        success: false,
        error: isDev ? err.message : 'Internal server error',
        stack: isDev ? err.stack : undefined
    });
});

/**
 * Start Server
 */
const startServer = async () => {
    await connectDB();

    app.listen(PORT, () => {
        console.log(`
🚀 Countdown Timer App Server
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📍 Port: ${PORT}
🌍 Environment: ${process.env.NODE_ENV || 'development'}
📊 Health: http://localhost:${PORT}/api/health
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    `);
    });
};

// Handle graceful shutdown
process.on('SIGTERM', async () => {
    console.log('SIGTERM received. Shutting down gracefully...');
    await mongoose.connection.close();
    process.exit(0);
});

process.on('SIGINT', async () => {
    console.log('SIGINT received. Shutting down gracefully...');
    await mongoose.connection.close();
    process.exit(0);
});

// Export for testing
module.exports = { app, startServer };

// Start if run directly
if (require.main === module) {
    startServer();
}
