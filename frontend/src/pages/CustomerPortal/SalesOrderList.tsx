import React, { useState, useEffect } from 'react';
import { Eye, Pencil, Trash2, ArrowLeft, Clock, CheckCircle } from 'lucide-react';
import { httpClient } from '../../services/httpClient';
import { confirm as toastConfirm } from '../../utils/toast';

interface SalesOrderListProps {
    onCreateOrder: () => void;
    onEditOrder: (id: string) => void;
    onViewOrder: (id: string) => void;
    onCancelOrder: (id: string) => void;
}

type SalesOrderSubTab = 'Pending & Cancelled' | 'Executed';

interface SalesOrderItem {
    id: number;
    item_code: string;
    item_name: string;
    quantity: number;
    price: number;
    taxable_value: number;
    gst: number;
    net_value: number;
}

interface SalesOrder {
    id: string;
    so_number: string;
    date: string;
    customer_name: string;
    items: SalesOrderItem[];
    delivery_terms?: {
        delivery_date: string;
    };
    is_active: boolean;
    is_deleted: boolean;
}

const SalesOrderList: React.FC<SalesOrderListProps> = ({ onCreateOrder, onEditOrder, onViewOrder, onCancelOrder }) => {
    const [viewMode, setViewMode] = useState<'dashboard' | 'list'>('dashboard');
    const [activeTab, setActiveTab] = useState<SalesOrderSubTab>('Pending & Cancelled');
    const [orders, setOrders] = useState<SalesOrder[]>([]);
    const [loading, setLoading] = useState(true);

    const fetchOrders = async () => {
        setLoading(true);
        try {
            const response = await httpClient.get<any>('/api/customerportal/sales-orders/');
            const data = Array.isArray(response) ? response : (response as any).results || [];

            // Map data to our interface
            const mappedOrders: SalesOrder[] = data.map((order: any) => ({
                id: order.id.toString(),
                so_number: order.so_number,
                date: order.date,
                customer_name: order.customer_name,
                items: order.items || [],
                delivery_terms: order.delivery_terms,
                is_active: order.is_active,
                is_deleted: order.is_deleted
            }));

            setOrders(mappedOrders);
        } catch (error) {
            console.error('Error fetching sales orders:', error);
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        // Only fetch if we are in list view
        if (viewMode === 'list') {
            fetchOrders();
        }
    }, [viewMode]);

    const calculateTotal = (items: SalesOrderItem[]) => {
        const total = items.reduce((sum, item) => sum + (parseFloat(item.net_value as any) || 0), 0);
        return `₹${total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
    };

    const filteredOrders = orders.filter(order => {
        if (activeTab === 'Pending & Cancelled') {
            return !order.is_deleted && order.is_active;
        } else {
            return false;
        }
    });

    const handleCardClick = (tab: SalesOrderSubTab) => {
        setActiveTab(tab);
        setViewMode('list');
    };

    return (
        <div className="bg-white rounded-[4px] shadow-none border border-slate-200-none border border-slate-200 border border-gray-100 p-6">
            {viewMode === 'dashboard' ? (
                <div>
                    <div className="flex justify-between items-center mb-6">
                        <h2 className="text-xl font-bold text-gray-900">Sales Order</h2>
                        <button
                            onClick={onCreateOrder}
                            className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-[4px] shadow-none border border-slate-200-none border border-slate-200 text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                        >
                            Create Sales Order
                        </button>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {/* Pending & Cancelled Card */}
                        <div
                            onClick={() => handleCardClick('Pending & Cancelled')}
                            className="bg-white p-6 rounded-[4px] border border-gray-200 hover:border-indigo-500 hover:shadow-md cursor-pointer transition-all group"
                        >
                            <div className="flex items-center justify-between mb-4">
                                <div className="p-3 rounded-[4px] bg-indigo-50 text-indigo-600">
                                    <Clock className="w-6 h-6" />
                                </div>
                                <ArrowLeft className="w-5 h-5 text-gray-300 group-hover:text-indigo-500 transform rotate-180 transition-all opacity-0 group-hover:opacity-100" />
                            </div>
                            <h3 className="text-lg font-bold text-gray-900 group-hover:text-indigo-600 transition-colors">Pending & Cancelled</h3>
                            <p className="text-sm text-gray-500 mt-2">View pending and cancelled orders.</p>
                        </div>
                        {/* Executed Card */}
                        <div
                            onClick={() => handleCardClick('Executed')}
                            className="bg-white p-6 rounded-[4px] border border-gray-200 hover:border-indigo-500 hover:shadow-md cursor-pointer transition-all group"
                        >
                            <div className="flex items-center justify-between mb-4">
                                <div className="p-3 rounded-[4px] bg-indigo-50 text-indigo-600">
                                    <CheckCircle className="w-6 h-6" />
                                </div>
                                <ArrowLeft className="w-5 h-5 text-gray-300 group-hover:text-indigo-500 transform rotate-180 transition-all opacity-0 group-hover:opacity-100" />
                            </div>
                            <h3 className="text-lg font-bold text-gray-900 group-hover:text-indigo-600 transition-colors">Executed</h3>
                            <p className="text-sm text-gray-500 mt-2">View executed orders history.</p>
                        </div>
                    </div>
                </div>
            ) : (
                <>
                    {/* Header Section */}
                    <div className="flex flex-col md:flex-row md:items-center justify-between mb-6 gap-4">
                        <div className="flex items-center gap-4">
                            <button
                                onClick={() => setViewMode('dashboard')}
                                className="p-2 hover:bg-gray-100 rounded-[4px] transition-colors"
                                title="Back to Dashboard"
                            >
                                <ArrowLeft className="w-5 h-5 text-gray-600" />
                            </button>
                            <h2 className="text-xl font-bold text-gray-900">Sales Order - {activeTab}</h2>
                        </div>

                        <div className="flex items-center">
                            <button
                                onClick={onCreateOrder}
                                className="inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-[4px] shadow-none border border-slate-200-none border border-slate-200 text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500"
                            >
                                Create Sales Order
                            </button>
                        </div>
                    </div>

                    <div className="overflow-hidden ring-1 ring-black ring-opacity-5 rounded-[4px]">
                        <div className="overflow-x-auto">
                            <table className="min-w-full divide-y divide-gray-200">
                                <thead className="bg-gray-50">
                                    <tr>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Sales Order #
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Sales Order Date
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Customer Reference Name
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Delivery Date
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Amount
                                        </th>
                                        <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Status
                                        </th>
                                        <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                                            Actions
                                        </th>
                                    </tr>
                                </thead>
                                <tbody className="bg-white divide-y divide-gray-200">
                                    {loading ? (
                                        <tr>
                                            <td colSpan={7} className="px-6 py-4 text-center text-sm text-gray-500">
                                                <div className="flex items-center justify-center gap-2">
                                                    <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-[4px] animate-spin"></div>
                                                    Fetching orders...
                                                </div>
                                            </td>
                                        </tr>
                                    ) : filteredOrders.length === 0 ? (
                                        <tr>
                                            <td colSpan={7} className="px-6 py-4 text-center text-sm text-gray-500">
                                                No orders found for this tab.
                                            </td>
                                        </tr>
                                    ) : (
                                        filteredOrders.map((order) => (
                                            <tr key={order.id} className="hover:bg-gray-50">
                                                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-indigo-600 hover:text-indigo-900 cursor-pointer" onClick={() => onViewOrder(order.id)}>
                                                    {order.so_number}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                    {order.date}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                                    {order.customer_name}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500">
                                                    {order.delivery_terms?.delivery_date || '-'}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 font-medium">
                                                    {calculateTotal(order.items)}
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap">
                                                    <span className={`px-2 inline-flex text-xs leading-5 font-semibold rounded-full ${!order.is_active ? 'bg-red-100 text-red-800' : 'bg-yellow-100 text-yellow-800'
                                                        }`}>
                                                        {!order.is_active ? 'Cancelled' : 'Pending'}
                                                    </span>
                                                </td>
                                                <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                                                    <div className="flex justify-end gap-2">
                                                        <button
                                                            onClick={() => onViewOrder(order.id)}
                                                            className="text-gray-400 hover:text-gray-500"
                                                            title="View"
                                                        >
                                                            <Eye className="w-4 h-4" />
                                                        </button>
                                                        {order.is_active && (
                                                            <>
                                                                <button
                                                                    onClick={() => onEditOrder(order.id)}
                                                                    className="text-gray-400 hover:text-indigo-600"
                                                                    title="Edit"
                                                                >
                                                                    <Pencil className="w-4 h-4" />
                                                                </button>
                                                                <button
                                                                    onClick={() => onCancelOrder(order.id)}
                                                                    className="text-gray-400 hover:text-red-600"
                                                                    title="Cancel"
                                                                >
                                                                    <Trash2 className="w-4 h-4" />
                                                                </button>
                                                            </>
                                                        )}
                                                    </div>
                                                </td>
                                            </tr>
                                        ))
                                    )}
                                </tbody>
                            </table>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
};

export default SalesOrderList;
