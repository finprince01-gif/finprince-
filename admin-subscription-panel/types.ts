
export interface Subscription {
  id: number;
  username: string;
  companyName: string;
  registrationDate: string;
  subscriptionPlan: 'Basic' | 'Pro' | 'Enterprise';
  subscriptionStartDate: string;
  subscriptionEndDate: string;
  totalUploads: number;
  uploadsUsed: number;
  isActive: boolean;
  tenantId: string;
  lastLogin: string;  // ISO date string or 'Never'
}

export interface Payment {
  id: number;
  status: 'Success' | 'Pending' | 'Failed' | 'Refunded' | 'Chargeback';
  amountPaid: number;
  username: string;
  company: string;
  method: 'Card' | 'PayPal' | 'UPI' | 'Netbanking' | 'Credit';
  gatewayId: string;
  orderId: string;
  dateTime: string;
}
