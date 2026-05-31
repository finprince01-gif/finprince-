import { httpClient } from '../../../services/httpClient';

export interface VendorValidationPayload {
    gstin: string;
    vendor_name: string;
    branch: string;
    address?: string;
    state?: string;
}

export type VendorStatus = 'Already Exists' | 'Create Vendor' | 'GSTIN Conflict';

export const vendorStatusService = {
    async validateVendor(payload: VendorValidationPayload): Promise<{
        status: VendorStatus;
        vendorId?: number;
        message?: string;
    }> {
        try {
            const res: any = await httpClient.post('/api/purchase/vendors/validate/', {
                vendor_name: payload.vendor_name,
                gstin: payload.gstin,
                branch: payload.branch,
                address: payload.address || '',
                state: payload.state || ''
            });

            if (res.status === 'EXISTING_VENDOR' || res.status === 'FOUND') {
                return {
                    status: 'Already Exists',
                    vendorId: res.vendor_id,
                    message: res.message
                };
            } else if (res.status === 'GSTIN_CONFLICT') {
                return {
                    status: 'GSTIN Conflict',
                    vendorId: res.vendor_id,
                    message: res.message
                };
            } else {
                return {
                    status: 'Create Vendor',
                    message: res.message
                };
            }
        } catch (error) {
            console.error('Error validating vendor status:', error);
            return {
                status: 'Create Vendor',
                message: 'Failed to validate vendor'
            };
        }
    }
};
