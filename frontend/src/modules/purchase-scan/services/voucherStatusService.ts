import { httpClient } from '../../../services/httpClient';

export interface VoucherValidationPayload {
    supplier_invoice_no: string;
    gstin: string;
    branch: string;
    vendor_name: string;
}

export type VoucherStatus = 'Duplicate Voucher' | 'Unique Voucher';

export const voucherStatusService = {
    async validateVoucher(payload: VoucherValidationPayload): Promise<{
        status: VoucherStatus;
        message?: string;
    }> {
        try {
            const res: any = await httpClient.post('/api/vouchers/purchase/validate-voucher/', {
                supplier_invoice_no: payload.supplier_invoice_no,
                gstin: payload.gstin,
                branch: payload.branch,
                vendor_name: payload.vendor_name
            });

            if (res.status === 'DUPLICATE') {
                return {
                    status: 'Duplicate Voucher',
                    message: res.voucher_status || 'Duplicate Voucher found'
                };
            } else {
                return {
                    status: 'Unique Voucher',
                    message: res.voucher_status || 'Unique Voucher'
                };
            }
        } catch (error) {
            console.error('Error validating voucher status:', error);
            return {
                status: 'Unique Voucher',
                message: 'Failed to validate duplicate voucher'
            };
        }
    }
};
