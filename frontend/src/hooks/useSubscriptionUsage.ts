import { useState, useEffect, useCallback, useMemo } from 'react';
import { apiService } from '../services/api';
import { httpClient } from '../services/httpClient';
import { hasStoredSession } from '../services/authService';
import { getUserTypeFromToken } from '../services/jwtUtils';

export interface SubscriptionUsage {
    plan: string;
    used: number;
    limit: number | string;
    remaining: number | string;
    cycle_start: string;
}

// [PHASE 6 FIX] GLOBAL STATE FOR SUBSCRIPTION USAGE DEDUPLICATION
let globalUsageCache: SubscriptionUsage | null = null;
let lastFetchTime = 0;
const FETCH_THRESHOLD = 5000; // 5s gate to prevent storms

let isFetching = false;
let fetchPromise: Promise<SubscriptionUsage> | null = null;

export const useSubscriptionUsage = () => {
    const [subscriptionUsage, setSubscriptionUsage] = useState<SubscriptionUsage | null>(globalUsageCache);
    const [isLoading, setIsLoading] = useState(false);

    const fetchUsage = useCallback(async () => {
        const now = Date.now();
        
        // 1. Return cache if fresh
        if (now - lastFetchTime < FETCH_THRESHOLD && globalUsageCache) {
            setSubscriptionUsage(globalUsageCache);
            return globalUsageCache;
        }

        // 2. Coalesce concurrent requests (API Storm Protection)
        if (isFetching && fetchPromise) {
            const usage = await fetchPromise;
            setSubscriptionUsage(usage);
            return usage;
        }

        setIsLoading(true);
        isFetching = true;
        
        fetchPromise = apiService.getSubscriptionUsage()
            .then(usage => {
                globalUsageCache = usage;
                lastFetchTime = Date.now();
                return usage;
            })
            .finally(() => {
                isFetching = false;
                fetchPromise = null;
            });

        try {
            const usage = await fetchPromise;
            setSubscriptionUsage(usage);
            return usage;
        } catch (e) {
            console.error("Failed to fetch subscription usage");
            if (!globalUsageCache) {
                setSubscriptionUsage({
                    plan: 'FREE',
                    used: 0,
                    limit: 5,
                    remaining: 5,
                    cycle_start: new Date().toISOString()
                } as SubscriptionUsage);
            }
            return globalUsageCache;
        } finally {
            setIsLoading(false);
        }
    }, []);

    const incrementUsage = useCallback((amount: number = 1) => {
        if (subscriptionUsage) {
            setSubscriptionUsage(prev => {
                if (!prev) return null;
                const newUsed = (prev.used || 0) + amount;
                const limitNum = typeof prev.limit === 'string' ? parseFloat(prev.limit) : prev.limit;
                const updated = {
                    ...prev,
                    used: newUsed,
                    remaining: typeof limitNum === 'number' ? limitNum - newUsed : prev.remaining
                };
                globalUsageCache = updated;
                return updated;
            });
        }
    }, [subscriptionUsage]);

    useEffect(() => {
        const hasSession = hasStoredSession();
        if (!hasSession) return;

        const token = httpClient.getToken();
        const userType = getUserTypeFromToken(token);
        if (userType === 'master') return;

        fetchUsage();
        
        // [PHASE 6 FIX] Conservative 1-minute interval for global sync
        const interval = setInterval(() => {
            if (hasStoredSession()) {
                fetchUsage();
            }
        }, 60000);

        return () => clearInterval(interval);
    }, [fetchUsage]);

    const isLimitReached = useMemo(() => {
        if (!subscriptionUsage) return false;
        if (subscriptionUsage.limit === 'Unlimited') return false;
        const limitNum = typeof subscriptionUsage.limit === 'string' ? parseFloat(subscriptionUsage.limit) : subscriptionUsage.limit;
        if (isNaN(limitNum)) return false;
        return (subscriptionUsage.used || 0) >= limitNum;
    }, [subscriptionUsage]);

    return {
        subscriptionUsage,
        isLimitReached,
        isLoading,
        refetch: fetchUsage,
        incrementUsage
    };
};
