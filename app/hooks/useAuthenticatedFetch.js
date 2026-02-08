import { useCallback } from 'react';
import { useAppBridge } from '@shopify/app-bridge-react';
import { authenticatedFetch } from '@shopify/app-bridge/utilities';

/**
 * Custom hook for making authenticated API requests
 * Uses Shopify App Bridge to automatically include session tokens
 */
export function useAuthenticatedFetch() {
    const app = useAppBridge();

    return useCallback(
        async (url, options = {}) => {
            const fetchWithAuth = authenticatedFetch(app);

            // Prepend API base URL if relative
            const fullUrl = url.startsWith('http') ? url : url;

            try {
                const response = await fetchWithAuth(fullUrl, {
                    ...options,
                    headers: {
                        ...options.headers,
                        'Content-Type': options.headers?.['Content-Type'] || 'application/json'
                    }
                });

                return response;
            } catch (error) {
                console.error('Authenticated fetch error:', error);
                throw error;
            }
        },
        [app]
    );
}

export default useAuthenticatedFetch;
