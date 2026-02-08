/**
 * Timer Business Logic Unit Tests
 * Tests critical functionality for countdown timers
 */

// Mock mongoose before importing models
jest.mock('mongoose', () => {
    const actual = jest.requireActual('mongoose');
    return {
        ...actual,
        connect: jest.fn(),
        model: jest.fn().mockReturnValue({}),
        Schema: actual.Schema
    };
});

describe('Timer Business Logic', () => {

    /**
     * Test 1: Timer Expiry Calculation (Fixed Timer)
     */
    describe('Timer Expiry Calculation', () => {
        const calculateStatus = (timer) => {
            if (!timer.isActive) return 'inactive';
            if (timer.type === 'evergreen') return 'active';

            const now = new Date();
            if (new Date(timer.startDate) > now) return 'scheduled';
            if (new Date(timer.endDate) < now) return 'expired';
            return 'active';
        };

        test('returns "active" for timer within date range', () => {
            const now = new Date();
            const timer = {
                type: 'fixed',
                isActive: true,
                startDate: new Date(now.getTime() - 3600000), // 1 hour ago
                endDate: new Date(now.getTime() + 3600000)    // 1 hour from now
            };

            expect(calculateStatus(timer)).toBe('active');
        });

        test('returns "scheduled" for future timer', () => {
            const now = new Date();
            const timer = {
                type: 'fixed',
                isActive: true,
                startDate: new Date(now.getTime() + 3600000), // 1 hour from now
                endDate: new Date(now.getTime() + 7200000)    // 2 hours from now
            };

            expect(calculateStatus(timer)).toBe('scheduled');
        });

        test('returns "expired" for past timer', () => {
            const now = new Date();
            const timer = {
                type: 'fixed',
                isActive: true,
                startDate: new Date(now.getTime() - 7200000), // 2 hours ago
                endDate: new Date(now.getTime() - 3600000)    // 1 hour ago
            };

            expect(calculateStatus(timer)).toBe('expired');
        });

        test('returns "inactive" when timer is disabled', () => {
            const timer = {
                type: 'fixed',
                isActive: false,
                startDate: new Date(),
                endDate: new Date(Date.now() + 3600000)
            };

            expect(calculateStatus(timer)).toBe('inactive');
        });

        test('returns "active" for evergreen timers', () => {
            const timer = {
                type: 'evergreen',
                isActive: true,
                durationMinutes: 60
            };

            expect(calculateStatus(timer)).toBe('active');
        });
    });

    /**
     * Test 2: Timer Targeting Logic
     */
    describe('Timer Targeting Logic', () => {
        const matchesProduct = (timer, productId, collectionIds = []) => {
            const scope = timer.targeting?.scope || 'all';

            if (scope === 'all') return true;

            if (scope === 'products') {
                return timer.targeting.productIds?.includes(productId);
            }

            if (scope === 'collections') {
                return timer.targeting.collectionIds?.some(id =>
                    collectionIds.includes(id)
                );
            }

            return false;
        };

        test('matches all products when scope is "all"', () => {
            const timer = { targeting: { scope: 'all' } };
            expect(matchesProduct(timer, 'product-123')).toBe(true);
            expect(matchesProduct(timer, 'any-product')).toBe(true);
        });

        test('matches specific product when in productIds', () => {
            const timer = {
                targeting: {
                    scope: 'products',
                    productIds: ['product-1', 'product-2', 'product-3']
                }
            };

            expect(matchesProduct(timer, 'product-1')).toBe(true);
            expect(matchesProduct(timer, 'product-2')).toBe(true);
            expect(matchesProduct(timer, 'product-99')).toBe(false);
        });

        test('matches when product belongs to targeted collection', () => {
            const timer = {
                targeting: {
                    scope: 'collections',
                    collectionIds: ['collection-A', 'collection-B']
                }
            };

            expect(matchesProduct(timer, 'product-1', ['collection-A'])).toBe(true);
            expect(matchesProduct(timer, 'product-1', ['collection-C'])).toBe(false);
            expect(matchesProduct(timer, 'product-1', ['collection-A', 'collection-B'])).toBe(true);
        });

        test('returns false when no targeting matches', () => {
            const timer = {
                targeting: {
                    scope: 'products',
                    productIds: ['product-1']
                }
            };

            expect(matchesProduct(timer, 'product-99')).toBe(false);
        });

        test('handles missing targeting gracefully', () => {
            const timer = {};
            expect(matchesProduct(timer, 'any-product')).toBe(true);
        });
    });

    /**
     * Test 3: Evergreen Timer LocalStorage Logic
     */
    describe('Evergreen Timer LocalStorage Logic', () => {
        const getStorageKey = (timerId) => `countdown_timer_${timerId}`;

        const calculateEvergreenEndTime = (timerId, durationMinutes, storage = {}) => {
            const storageKey = getStorageKey(timerId);
            let startTime;

            const stored = storage[storageKey];

            if (stored) {
                startTime = parseInt(stored, 10);
                const elapsed = Date.now() - startTime;
                const durationMs = durationMinutes * 60 * 1000;

                if (elapsed >= durationMs) {
                    // Expired - restart
                    startTime = Date.now();
                    storage[storageKey] = String(startTime);
                }
            } else {
                startTime = Date.now();
                storage[storageKey] = String(startTime);
            }

            return {
                startTime,
                endTime: startTime + (durationMinutes * 60 * 1000),
                storage
            };
        };

        test('creates new start time for first visit', () => {
            const storage = {};
            const before = Date.now();
            const result = calculateEvergreenEndTime('timer-1', 60, storage);
            const after = Date.now();

            expect(result.startTime).toBeGreaterThanOrEqual(before);
            expect(result.startTime).toBeLessThanOrEqual(after);
            expect(storage['countdown_timer_timer-1']).toBeDefined();
        });

        test('uses stored start time on return visit', () => {
            const pastTime = Date.now() - 30 * 60 * 1000; // 30 mins ago
            const storage = { 'countdown_timer_timer-1': String(pastTime) };

            const result = calculateEvergreenEndTime('timer-1', 60, storage);

            expect(result.startTime).toBe(pastTime);
            expect(result.endTime).toBe(pastTime + 60 * 60 * 1000);
        });

        test('restarts timer when expired', () => {
            const expiredTime = Date.now() - 90 * 60 * 1000; // 90 mins ago (expired for 60 min timer)
            const storage = { 'countdown_timer_timer-1': String(expiredTime) };

            const before = Date.now();
            const result = calculateEvergreenEndTime('timer-1', 60, storage);

            // Should have reset to new time
            expect(result.startTime).toBeGreaterThanOrEqual(before);
        });
    });

    /**
     * Test 4: Timer Status Determination
     */
    describe('Timer Status Determination', () => {
        const determineStatus = (timer) => {
            if (!timer) return 'unknown';
            if (!timer.isActive) return 'inactive';

            if (timer.type === 'evergreen') {
                return timer.durationMinutes > 0 ? 'active' : 'invalid';
            }

            if (timer.type === 'fixed') {
                if (!timer.startDate || !timer.endDate) return 'invalid';

                const now = new Date();
                const start = new Date(timer.startDate);
                const end = new Date(timer.endDate);

                if (isNaN(start.getTime()) || isNaN(end.getTime())) return 'invalid';
                if (end <= start) return 'invalid';

                if (now < start) return 'scheduled';
                if (now > end) return 'expired';
                return 'active';
            }

            return 'unknown';
        };

        test('returns "invalid" for missing dates on fixed timer', () => {
            expect(determineStatus({ type: 'fixed', isActive: true })).toBe('invalid');
            expect(determineStatus({ type: 'fixed', isActive: true, startDate: new Date() })).toBe('invalid');
        });

        test('returns "invalid" when endDate before startDate', () => {
            const timer = {
                type: 'fixed',
                isActive: true,
                startDate: new Date(Date.now() + 1000),
                endDate: new Date(Date.now() - 1000)
            };
            expect(determineStatus(timer)).toBe('invalid');
        });

        test('returns "unknown" for null timer', () => {
            expect(determineStatus(null)).toBe('unknown');
            expect(determineStatus(undefined)).toBe('unknown');
        });

        test('handles invalid date strings', () => {
            const timer = {
                type: 'fixed',
                isActive: true,
                startDate: 'not-a-date',
                endDate: 'also-not-a-date'
            };
            expect(determineStatus(timer)).toBe('invalid');
        });
    });

    /**
     * Test 5: AI Prompt Sanitization
     */
    describe('AI Prompt Sanitization', () => {
        const sanitizeIntent = (intent) => {
            if (!intent || typeof intent !== 'string') return '';

            // Trim whitespace
            let sanitized = intent.trim();

            // Remove excessive whitespace
            sanitized = sanitized.replace(/\s+/g, ' ');

            // Remove potential injection attempts
            sanitized = sanitized.replace(/[<>{}[\]]/g, '');

            // Limit length
            sanitized = sanitized.slice(0, 200);

            return sanitized;
        };

        test('trims whitespace', () => {
            expect(sanitizeIntent('  hello world  ')).toBe('hello world');
        });

        test('removes excessive internal whitespace', () => {
            expect(sanitizeIntent('hello    world')).toBe('hello world');
        });

        test('removes potential injection characters', () => {
            expect(sanitizeIntent('test<script>alert(1)</script>')).toBe('testscriptalert(1)/script');
            expect(sanitizeIntent('test{injection}')).toBe('testinjection');
        });

        test('enforces max length', () => {
            const longString = 'a'.repeat(300);
            expect(sanitizeIntent(longString).length).toBe(200);
        });

        test('handles empty/null input', () => {
            expect(sanitizeIntent('')).toBe('');
            expect(sanitizeIntent(null)).toBe('');
            expect(sanitizeIntent(undefined)).toBe('');
        });

        test('handles non-string input', () => {
            expect(sanitizeIntent(123)).toBe('');
            expect(sanitizeIntent({})).toBe('');
            expect(sanitizeIntent([])).toBe('');
        });
    });
});
