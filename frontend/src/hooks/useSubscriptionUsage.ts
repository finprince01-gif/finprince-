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
    const [localUsedCount, setLocalUsedCount] = useState<number>(() => {
        const saved = localStorage.getItem('ai_extraction_usage_count');
        return saved ? parseInt(saved, 10) : 0;
    });
    const [isLoading, setIsLoading] = useState(false);

    const fetchUsage = useCallback(async () => {
        setIsLoading(true);
        try {
            const usage = await apiService.getSubscriptionUsage();
            // Merge with local count
            setSubscriptionUsage({
                ...usage,
                used: (usage.used || 0) + localUsedCount
            });
        } catch (e) {
            console.error("Failed to fetch subscription usage");
            // Fallback to local only
            setSubscriptionUsage({
                plan: 'FREE',
                used: localUsedCount,
                limit: 5,
                remaining: 5 - localUsedCount,
                cycle_start: new Date().toISOString()
            } as SubscriptionUsage);
        } finally {
            setIsLoading(false);
        }
    }, [localUsedCount]);

    const incrementUsage = useCallback((amount: number = 1) => {
        const newCount = localUsedCount + amount;
        setLocalUsedCount(newCount);
        localStorage.setItem('ai_extraction_usage_count', newCount.toString());

        // Optimistically update the UI
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
    }, [localUsedCount, subscriptionUsage]);

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
        refetch: fetchUsage,
        incrementUsage
    };
};
