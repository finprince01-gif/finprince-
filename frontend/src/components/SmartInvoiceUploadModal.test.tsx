// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup } from '@testing-library/react';
import React from 'react';
import BulkInvoiceUploadModal from './SmartInvoiceUploadModal';
import { useOcrWorkflowStore } from '../store/ocrWorkflowStore';

// Mock HttpClient and ApiService
vi.mock('../services/httpClient', () => ({
    httpClient: {
        postFormData: vi.fn().mockImplementation(() => new Promise(() => {})), // Never-resolving promise to simulate active scanning
        get: vi.fn().mockResolvedValue([]),
        patch: vi.fn().mockResolvedValue({}),
        delete: vi.fn().mockResolvedValue({}),
    }
}));

vi.mock('../services/api', () => ({
    apiService: {
        getExtractionAverageTime: vi.fn().mockResolvedValue({ average_time_per_invoice: 3.5 })
    }
}));

// Mock window.scrollTo
window.scrollTo = vi.fn();

// Mock EventSource
class MockEventSource {
    close = vi.fn();
    addEventListener = vi.fn();
    removeEventListener = vi.fn();
}
global.EventSource = MockEventSource as any;

describe('SmartInvoiceUploadModal Closure Regression Tests', () => {
    beforeEach(() => {
        vi.clearAllMocks();
        // Reset the store to default state
        useOcrWorkflowStore.getState().clearWorkflow();
    });

    afterEach(() => {
        cleanup();
    });

    it('should allow immediately closing the modal with X button during scanning', async () => {
        const onCloseMock = vi.fn();
        const { container } = render(
            <BulkInvoiceUploadModal
                onClose={onCloseMock}
                onFinalized={vi.fn()}
                voucherType="Purchase"
                isLimitReached={false}
                onEditRow={vi.fn()}
            />
        );

        // 1. Select a file to scan
        const file = new File(['dummy content'], 'invoice.pdf', { type: 'application/pdf' });
        const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
        expect(fileInput).toBeTruthy();
        
        Object.defineProperty(fileInput, 'files', {
            value: [file],
            writable: true
        });
        fireEvent.change(fileInput);

        // 2. Start scan upload (this sets step to 'scanning')
        const scanButton = screen.getByRole('button', { name: /Scan 1 File/i });
        fireEvent.click(scanButton);

        // Verify we are now in scanning step
        expect(useOcrWorkflowStore.getState().step).toBe('scanning');

        // 3. Find and click the X (close) button in the header
        const closeBtn = container.querySelector('header button, div.flex.items-center.justify-between button');
        expect(closeBtn).toBeTruthy();
        expect(closeBtn?.hasAttribute('disabled')).toBe(false);

        fireEvent.click(closeBtn!);

        // 4. Verify that onClose was called immediately and workflow state is reset
        expect(onCloseMock).toHaveBeenCalledTimes(1);
        expect(useOcrWorkflowStore.getState().step).toBe('upload');
    });

    it('should allow immediately closing the modal with Cancel button during scanning', async () => {
        const onCloseMock = vi.fn();
        const { container } = render(
            <BulkInvoiceUploadModal
                onClose={onCloseMock}
                onFinalized={vi.fn()}
                voucherType="Purchase"
                isLimitReached={false}
                onEditRow={vi.fn()}
            />
        );

        // 1. Select a file to scan
        const file = new File(['dummy content'], 'invoice.pdf', { type: 'application/pdf' });
        const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
        expect(fileInput).toBeTruthy();
        
        Object.defineProperty(fileInput, 'files', {
            value: [file],
            writable: true
        });
        fireEvent.change(fileInput);

        // 2. Start scan upload
        const scanButton = screen.getByRole('button', { name: /Scan 1 File/i });
        fireEvent.click(scanButton);

        expect(useOcrWorkflowStore.getState().step).toBe('scanning');

        // 3. Find and click the Cancel button in the footer
        const cancelBtn = screen.getByRole('button', { name: /cancel/i });
        expect(cancelBtn).toBeTruthy();
        expect(cancelBtn.hasAttribute('disabled')).toBe(false);

        fireEvent.click(cancelBtn);

        // 4. Verify that onClose was called immediately and workflow state is reset
        expect(onCloseMock).toHaveBeenCalledTimes(1);
        expect(useOcrWorkflowStore.getState().step).toBe('upload');
    });
});
