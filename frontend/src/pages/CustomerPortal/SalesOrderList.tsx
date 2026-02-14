import React, { useState, useEffect } from 'react';
import { Eye, Pencil, Trash2, Mail, Filter } from 'lucide-react';
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
        fetchOrders();
    }, []);

    const calculateTotal = (items: SalesOrderItem[]) => {
        const total = items.reduce((sum, item) => sum + (parseFloat(item.net_value as any) || 0), 0);
        return `₹${total.toLocaleString('en-IN', { minimumFractionDigits: 2 })}`;
    };

    const filteredOrders = orders.filter(order => {
        if (activeTab === 'Pending & Cancelled') {
            return !order.is_deleted && order.is_active; // Placeholder logic
        } else {
            return false; // 'Executed' logic placeholder
        }
    });

    return (
        <div className="text-left">
            <div className="flex justify-between items-center mb-6">
                <h3 className="text-lg font-medium text-gray-900">Sales Order</h3>
                <button
                    className="px-4 py-2 bg-indigo-600 text-white text-sm font-medium rounded-[4px] hover:bg-indigo-700 transition-colors"
                    onClick={onCreateOrder}
                >
                    Create Sales Order
                </button>
            </div>

            {/* Sales Order Sub-tabs */}
            <div className="border-b border-gray-200 mb-6">
                <nav className="flex gap-8">
                    {['Pending & Cancelled', 'Executed'].map((tab) => (
                        <button
                            key={tab}
                            onClick={() => setActiveTab(tab as SalesOrderSubTab)}
                            className={`py-3 px-1 text-sm font-medium border-b-2 transition-colors ${activeTab === tab
                                ? 'border-indigo-500 text-indigo-600'
                                : 'border-transparent text-gray-500 hover:text-gray-700'
                                }`}
                        >
                            {tab.toUpperCase()}
                        </button>
                    ))}
                </nav>
            </div>

            <div className="bg-white border border-gray-200 rounded-[4px] overflow-hidden">
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
                                <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                                    Actions
                                </th>
                            </tr>
                        </thead>
                        <tbody className="bg-white divide-y divide-gray-200">
                            {loading ? (
                                <tr>
                                    <td colSpan={7} className="px-6 py-12 text-center text-sm text-gray-500">
                                        <div className="flex items-center justify-center gap-2">
                                            <div className="w-4 h-4 border-2 border-indigo-600 border-t-transparent rounded-[4px] animate-spin"></div>
                                            Fetching orders...
                                        </div>
                                    </td>
                                </tr>
                            ) : filteredOrders.length > 0 ? (
                                filteredOrders.map((order) => (
                                    <tr key={order.id} className="hover:bg-gray-50">
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-indigo-600 cursor-pointer hover:underline" onClick={() => onViewOrder(order.id)}>
                                            {order.so_number}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                            {order.date}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                            {order.customer_name}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                            {order.delivery_terms?.delivery_date || 'N/A'}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                                            {calculateTotal(order.items)}
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <span className={`px-3 py-1 inline-flex text-xs leading-5 font-semibold rounded-[4px] ${order.is_active ? 'bg-yellow-100 text-yellow-800' : 'bg-red-100 text-red-800'
                                                }`}>
                                                {order.is_active ? 'Pending' : 'Inactive'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                            <div className="flex items-center space-x-3">
                                                <button
                                                    onClick={() => onViewOrder(order.id)}
                                                    className="text-gray-400 hover:text-indigo-600 transition-colors"
                                                    title="View"
                                                >
                                                    <Eye size={18} />
                                                </button>
                                                <button
                                                    onClick={() => onEditOrder(order.id)}
                                                    className="text-gray-400 hover:text-indigo-600 transition-colors"
                                                    title="Edit"
                                                >
                                                    <Pencil size={18} />
                                                </button>
                                                <button
                                                    onClick={async () => {
                                                        if (await toastConfirm('Are you sure you want to cancel this Sales Order?')) {
                                                            onCancelOrder(order.id);
                                                        }
                                                    }}
                                                    className="text-gray-400 hover:text-red-600 transition-colors"
                                                    title="Cancel"
                                                >
                                                    <Trash2 size={18} />
                                                </button>
                                            </div>
                                        </td>
                                    </tr>
                                ))
                            ) : (
                                <tr>
                                    <td colSpan={7} className="px-6 py-12 text-center text-sm text-gray-500">
                                        No sales orders found for this tab.
                                    </td>
                                </tr>
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div >
    );
};

export default SalesOrderList;
