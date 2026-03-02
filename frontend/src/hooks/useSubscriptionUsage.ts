import { useState, useEffect, useCallback, useMemo } from 'react';
import { apiService } from '../services/api';
import { httpClient } from '../services/httpClient';
import { hasStoredSession } from '../services/authService';

export interface SubscriptionUsage {
    plan: string;
    used: number;
    limit: number | string;
    remaining: number | string;
    cycle_start: string;
}

export const useSubscriptionUsage = () => {
    const [subscriptionUsage, setSubscriptionUsage] = useState<SubscriptionUsage | null>(null);
    const [isLoading, setIsLoading] = useState(false);

    const fetchUsage = useCallback(async () => {
        setIsLoading(true);
        try {
            const usage = await apiService.getSubscriptionUsage();
            setSubscriptionUsage(usage);
        } catch (e) {
            console.error("Failed to fetch subscription usage");
            // Fallback default for disconnected state
            setSubscriptionUsage({
                plan: 'FREE',
                used: 0,
                limit: 5,
                remaining: 5,
                cycle_start: new Date().toISOString()
            } as SubscriptionUsage);
        } finally {
            setIsLoading(false);
        }
    }, []);

    const incrementUsage = useCallback((amount: number = 1) => {
        // Optimistically update the UI while waiting for the next poll
        // The backend handles the actual increment during the API call.
        if (subscriptionUsage) {
            setSubscriptionUsage(prev => {
                if (!prev) return null;
                const newUsed = (prev.used || 0) + amount;
                const limitNum = typeof prev.limit === 'string' ? parseFloat(prev.limit) : prev.limit;
                return {
                    ...prev,
                    used: newUsed,
                    remaining: typeof limitNum === 'number' ? limitNum - newUsed : prev.remaining
                };
            });
        }
    }, [subscriptionUsage]);

    useEffect(() => {
        // Only fetch if we have a session (refresh token exists)
        // Note: httpClient.get will handle automatic access token refresh if needed.
        const hasSession = hasStoredSession();
        if (!hasSession) return;

        fetchUsage();
        // Poll every minute to stay in sync with backend
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
