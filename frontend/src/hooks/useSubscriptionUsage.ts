import { useState, useEffect, useCallback, useMemo } from 'react';
import { apiService } from '../services/api';
import { httpClient } from '../services/httpClient';

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
        } finally {
            setIsLoading(false);
        }
    }, []);

    useEffect(() => {
        // Only fetch if we have a token (baseline check)
        const token = httpClient.getToken();
        if (!token) return;

        fetchUsage();
        // Poll every minute
        const interval = setInterval(() => {
            const currentToken = httpClient.getToken();
            if (currentToken) {
                fetchUsage();
            }
        }, 60000);

        return () => clearInterval(interval);
    }, [fetchUsage]);

    const isLimitReached = useMemo(() => {
        if (!subscriptionUsage) return false;
        if (subscriptionUsage.limit === 'Unlimited') return false;
        // Ensure limit is treated as number for comparison
        const limitNum = typeof subscriptionUsage.limit === 'string' ? parseFloat(subscriptionUsage.limit) : subscriptionUsage.limit;
        if (isNaN(limitNum)) return false;
        return subscriptionUsage.used >= limitNum;
    }, [subscriptionUsage]);

    return {
        subscriptionUsage,
        isLimitReached,
        isLoading,
        refetch: fetchUsage
    };
};
