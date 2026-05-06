/**
 * ============================================================================
 * GEMINI AI SERVICE (geminiService.ts)
 * ============================================================================
 * This service handles all AI-powered features using Google Gemini AI.
 * Communicates with the Django backend which interfaces with Gemini API.
 * 
 * KEY FEATURES:
 * 1. Invoice Data Extraction - Extract structured data from invoice images/PDFs
 * 2. AI Agent (Kiki) - Answer accounting questions using company data
 * 3. Web-Grounded Search - Answer questions using real-time web search
 * 
 * ARCHITECTURE:
 * - Frontend → Django Backend → Google Gemini API
 * - Uses fetch() directly (not httpClient) for file uploads
 * - Implements retry logic for rate limiting
 * - Handles queue status for busy AI service
 * - Uses HttpOnly cookies for authentication
 * 
 * ERROR HANDLING:
 * - Automatic retries with exponential backoff
 * - Rate limit detection (429 errors)
 * - Queue position tracking
 * - Circuit breaker for service overload
 * 
 * FOR NEW DEVELOPERS:
 * - Invoice extraction: extractInvoiceDataWithRetry()
 * - AI Agent (internal data): getAgentResponse()
 * - AI Agent (web search): getGroundedAgentResponse()
 * - All functions return Promises with typed responses
 */

import { httpClient } from './httpClient';

// Import TypeScript types
import type { ExtractedInvoiceData } from '../types';

// ============================================================================
// INVOICE DATA EXTRACTION
// ============================================================================

/**
 * Extract structured data from invoice images/PDFs using AI
 * Implements automatic retry logic with exponential backoff
 * 
 * WHAT IT EXTRACTS:
 * - Seller name
 * - Invoice number and date
 * - Line items (description, quantity, rate, HSN code)
 * - Tax amounts (CGST, SGST, IGST)
 * - Total amount
 * 
 * USAGE:
 * ```typescript
 * const file = event.target.files[0]; // User-selected file
 * const data = await extractInvoiceDataWithRetry(file);
 * // data contains: { sellerName, invoiceNumber, lineItems, totalAmount, ... }
 * ```
 * 
 * @param file - Invoice file (image or PDF)
 * @param maxRetries - Maximum number of retry attempts (default: 3)
 * @param initialDelay - Initial delay between retries in ms (default: 5000)
 * @returns Extracted invoice data
 * @throws Error if extraction fails after all retries
 */
export const extractInvoiceDataWithRetry = async (
  file: File,
  maxRetries = 3,
  initialDelay = 5000
): Promise<ExtractedInvoiceData> => {
  // Prepare file for upload
  const formData = new FormData();
  formData.append('file', file);

  let attempt = 0;
  let delay = initialDelay;

  // Retry loop
  while (attempt < maxRetries) {
    try {
      // Wait before retry (skip on first attempt)
      if (attempt > 0) {
        await new Promise((r) => setTimeout(r, delay));
      }

      // Use httpClient for authenticated request with automatic token refresh
      formData.append('save', 'false');
      const response: any = await httpClient.postFormData('/api/ai/extract-invoice/', formData);

      // Backend returns { reply: "stringified json" }
      // We need to parse it to get the actual object
      if (response && response.reply) {
        let cleanJson = response.reply.replace(/```json\n?|```/g, '').trim();
        let parsedData: any = JSON.parse(cleanJson);

        // API might return an array [ { invoice... } ]
        if (Array.isArray(parsedData) && parsedData.length > 0) {
          parsedData = parsedData[0];
        }

        // MAP BACKEND KEYS TO FRONTEND INTERFACE
        // Backend now returns STRICT snake_case: supplier_invoice_no, vendor_name, etc.
        const mappedData: ExtractedInvoiceData = {
          sellerName: parsedData.vendor_name || '',
          invoiceNumber: parsedData.supplier_invoice_no || '',
          invoiceDate: parsedData.invoice_date || new Date().toISOString().split('T')[0],
          dueDate: parsedData.due_date || '',
          subtotal: parseFloat(parsedData.total_taxable_value || '0'),
          cgstAmount: parseFloat(parsedData.total_cgst || '0'),
          sgstAmount: parseFloat(parsedData.total_sgst || '0'),
          igstAmount: parseFloat(parsedData.total_igst || '0'),
          totalAmount: parseFloat(parsedData.total_invoice_value || '0'),
          lineItems: []
        };

        // Standardized line_items from backend
        const rawItems = parsedData.line_items || parsedData.items || [];
        if (Array.isArray(rawItems)) {
          mappedData.lineItems = rawItems.map((item: any) => ({
            itemDescription: item.description || item.item_name || 'Item',
            quantity: parseFloat(item.quantity || '0'),
            rate: parseFloat(item.rate || '0'),
            amount: parseFloat(item.amount || '0'),
            hsnCode: item.hsn_sac || item.hsn_code || ''
          }));
        }

        return mappedData;
      }
    } catch (error: any) {
      attempt++;

      // If all retries exhausted, throw error
      if (attempt >= maxRetries) {
        throw new Error(`❌ Failed to extract invoice data after ${maxRetries} attempts. ${error.message || error}`);
      }

      // Adjust delay based on error type
      const errMsg = error.message || JSON.stringify(error);
      if (errMsg.includes('429') || errMsg.includes('overloaded') || errMsg.includes('rate limit')) {
        // Rate limiting - increase delay more aggressively
        delay = Math.min(delay * 3, 30000); // Max 30 seconds
      } else {
        // Other errors - standard exponential backoff
        delay = Math.min(delay * 2, 10000); // Max 10 seconds
      }
    }
  }
  throw new Error('Unexpected retry termination.');
};

/**
 * AI AGENT (KIKI) - INTERNAL DATA
 */
export const getAgentResponse = async (
  contextData: string,
  userQuery: string,
  history: { role: string; text: string }[] = []
): Promise<{ reply: string; code?: string; retryAfter?: number; queuePosition?: number; estimatedWaitSeconds?: number }> => {
  try {
    // Use httpClient for automatic token management and refresh
    const response: any = await httpClient.post('/api/agent/message/', {
      message: userQuery,
      history: history,
      contextData,
      useGrounding: false
    });

    // Success - return AI's response
    if (response.status === 'queued') {
        const jobId = response.job_id;
        // Start polling for result
        return await pollAiTaskStatus(jobId);
    }

    return { reply: response.reply || "I couldn't generate a response at this time." };

  } catch (error: any) {
    // Handle error responses from httpClient
    const status = error.status;
    const data = error.data || {};

    if (status === 401) {
      return { reply: "Please log in to use the AI Agent.", code: 'AUTH_ERROR' };
    }

    if (status === 429) {
      if (data.code === 'RATE_LIMIT' && data.retryAfter) {
        return {
          reply: `Rate limit exceeded. Please wait ${data.retryAfter} seconds before trying again.`,
          code: 'RATE_LIMIT',
          retryAfter: data.retryAfter
        };
      }
      if (data.code === 'QUEUED' && data.queuePosition) {
        return {
          reply: `Your request is queued (position ${data.queuePosition}). Estimated wait: ${data.estimatedWaitSeconds || 'unknown'} seconds.`,
          code: 'QUEUED',
          queuePosition: data.queuePosition,
          estimatedWaitSeconds: data.estimatedWaitSeconds
        };
      }
      if (data.code === 'CIRCUIT_BREAKER') {
        return { reply: "AI service is temporarily unavailable. Please try again later.", code: 'CIRCUIT_BREAKER' };
      }
      return { reply: data.error || "AI service is busy. Please wait a moment and try again.", code: 'SERVICE_BUSY' };
    }

    return { reply: data.error || "Sorry, I encountered an error while processing your request.", code: 'NETWORK_ERROR' };
  }
};

/**
 * AI AGENT (KIKI) - WEB SEARCH
 */
export const getGroundedAgentResponse = async (
  userQuery: string
): Promise<{ text: string; sources: { uri: string; title: string; }[] }> => {
  try {
    const response: any = await httpClient.post('/api/agent/message/', {
      message: userQuery,
      contextData: '',
      useGrounding: true
    });

    return {
      text: response.reply || "I couldn't generate a response at this time.",
      sources: response.sources || []
    };
  } catch (error: any) {
    const status = error.status;
    if (status === 401) {
      return { text: "Please log in to use the AI Agent.", sources: [] };
    }
    if (status === 429) {
      return { text: "AI service is busy. Please wait a moment and try again.", sources: [] };
    }
    return {
      text: "Sorry, I encountered an error while processing your request with web search.",
      sources: []
    };
  }
};

/**
 * Poll for AI task status until completed or timed out
 */
const pollAiTaskStatus = async (jobId: string): Promise<{ reply: string }> => {
    const maxAttempts = 120; // 1 minute at 500ms intervals
    let attempts = 0;

    while (attempts < maxAttempts) {
        try {
            const response: any = await httpClient.get(`/api/ai/job-status/${jobId}/`);
            if (response.reply) {
                return { reply: response.reply };
            }
            // If status is 202 (processing), it will fall through to wait
        } catch (error: any) {
            // Check if it's still processing (202)
            if (error.status !== 202) {
                throw error;
            }
        }
        
        attempts++;
        await new Promise(r => setTimeout(r, 500));
    }
    
    throw new Error("AI request timed out. Please try again.");
};
