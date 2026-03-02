import { create } from 'zustand';

export interface Widget {
    id: string;
    type: string;
    title: string;
    x: number;
    y: number;
    width: number;
    height: number;
    dataset: string;
    xField?: string;
    yField?: string;
    legendField?: string;
    aggregation: 'sum' | 'avg' | 'count';
    properties: {
        showLegend: boolean;
        showGridlines: boolean;
        colorTheme: string;
        numberFormat: 'Currency' | 'Number' | 'Percentage';
    };
    settings?: Record<string, any>;
}

interface GlobalFilters {
    dateRange: string | null;
    customer: string | null;
    vendor: string | null;
}

interface DashboardStore {
    widgets: Widget[];
    selectedWidgetId: string | null;
    globalFilters: GlobalFilters;
    datasetSchema: Record<string, string[]>;

    // Actions
    setWidgets: (widgets: Widget[]) => void;
    addWidget: (type: string) => void;
    updateWidget: (id: string, updates: Partial<Widget>) => void;
    deleteWidget: (id: string) => void;
    selectWidget: (id: string | null) => void;
    setGlobalFilters: (filters: Partial<GlobalFilters>) => void;
}

export const useDashboardStore = create<DashboardStore>((set) => ({
    widgets: [],
    selectedWidgetId: null,
    globalFilters: {
        dateRange: null,
        customer: null,
        vendor: null,
    },
    datasetSchema: {
        'Sales': ['Date', 'Customer', 'Product', 'City', 'Amount', 'Quantity'],
        'Expenses': ['Date', 'Vendor', 'Category', 'Payment Method', 'Amount'],
        'Profitability': ['Period', 'Revenue', 'Cost', 'Profit', 'Margin'],
        'Inventory': ['Product', 'Warehouse', 'Stock Level', 'Reorder Point'],
    },

    setWidgets: (widgets) => set({ widgets }),

    addWidget: (type) => set((state) => {
        const newWidget: Widget = {
            id: Math.random().toString(36).substr(2, 9),
            type,
            title: `New ${type.charAt(0).toUpperCase() + type.slice(1)}`,
            x: 100,
            y: 100,
            width: 400,
            height: 300,
            dataset: 'Sales',
            xField: 'Date',
            yField: 'Amount',
            aggregation: 'sum',
            properties: {
                showLegend: true,
                showGridlines: true,
                colorTheme: '#4f46e5',
                numberFormat: 'Currency',
            },
            settings: {},
        };
        return { widgets: [...state.widgets, newWidget], selectedWidgetId: newWidget.id };
    }),

    updateWidget: (id, updates) => set((state) => ({
        widgets: state.widgets.map((w) => (w.id === id ? { ...w, ...updates } : w)),
    })),

    deleteWidget: (id) => set((state) => ({
        widgets: state.widgets.filter((w) => w.id !== id),
        selectedWidgetId: state.selectedWidgetId === id ? null : state.selectedWidgetId,
    })),

    selectWidget: (id) => set({ selectedWidgetId: id }),

    setGlobalFilters: (filters) => set((state) => ({
        globalFilters: { ...state.globalFilters, ...filters },
    })),
}));
