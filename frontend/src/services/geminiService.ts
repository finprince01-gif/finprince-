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
        // Backend returns: "Voucher Date", "Invoice Number", "Supplier Name", "Invoice Value", etc.
        const mappedData: ExtractedInvoiceData = {
          sellerName: parsedData["Supplier Name"] || parsedData["Party Name"] || parsedData["sellerName"] || '',
          invoiceNumber: parsedData["Invoice Number"] || parsedData["invoiceNumber"] || '',
          invoiceDate: parsedData["Voucher Date"] || parsedData["invoiceDate"] || new Date().toISOString().split('T')[0],
          dueDate: parsedData["Due Date"] || parsedData["dueDate"] || '',
          subtotal: parseFloat(parsedData["Taxable Value"] || parsedData["subtotal"] || '0'),
          cgstAmount: parseFloat(parsedData["CGST Amount"] || parsedData["cgstAmount"] || '0'),
          sgstAmount: parseFloat(parsedData["SGST/UTGST Amount"] || parsedData["sgstAmount"] || '0'),
          totalAmount: parseFloat(parsedData["Invoice Value"] || parsedData["totalAmount"] || '0'),
          lineItems: []
        };

        // If backend provided "lineItems" array directly (old format):
        if (Array.isArray(parsedData.lineItems)) {
          mappedData.lineItems = parsedData.lineItems;
        } else {
          // Construct line item from flat fields ("Item/Description", "Quantity", "Item Rate")
          // The backend prompt aggregates them into strings.
          const desc = parsedData["Item/Description"] || 'Item';
          const qty = parseFloat(parsedData["Quantity"] || '1');
          const rate = parseFloat(parsedData["Item Rate"] || '0');
          // If totalAmount is present but rate is 0, infer rate
          const finalRate = rate === 0 && qty > 0 && mappedData.subtotal > 0 ? (mappedData.subtotal / qty) : rate;

          mappedData.lineItems = [{
            itemDescription: desc,
            quantity: qty,
            rate: finalRate,
            hsnCode: parsedData["HSN/SAC Details"] || ''
          }];
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

// ============================================================================
// AI AGENT (KIKI) - INTERNAL DATA
// ============================================================================

/**
 * Get AI agent response based on company's internal data
 * The AI (Kiki) answers questions using vouchers, ledgers, and stock data
 * 
 * HOW IT WORKS:
 * 1. Frontend sends user question + company data (JSON)
 * 2. Backend formats data and sends to Gemini AI
 * 3. Gemini analyzes data and generates answer
 * 4. Response returned to frontend
 * 
 * FEATURES:
 * - Answers accounting questions
 * - Analyzes company financial data
 * - Handles rate limiting gracefully
 * - Shows queue position when busy
 * 
 * USAGE:
 * ```typescript
 * const contextData = JSON.stringify({ vouchers, ledgers, stockItems });
 * const response = await getAgentResponse(contextData, "What are my total sales?");
 *  // AI's answer
 * ```
 * 
 * @param contextData - JSON string of company data (vouchers, ledgers, etc.)
 * @param userQuery - User's question
 * @returns Object with reply and optional queue/rate limit info
 */
export const getAgentResponse = async (
  contextData: string,
  userQuery: string,
  history: { role: string; text: string }[] = []
): Promise<{ reply: string; code?: string; retryAfter?: number; queuePosition?: number; estimatedWaitSeconds?: number }> => {
  try {
    // Get API configuration
    const baseUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8000';
    const token = localStorage.getItem('token');

    // Make API request to AI agent endpoint
    const response = await fetch(`${baseUrl}/api/agent/message/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // Authorization via HttpOnly cookies
      },
      credentials: 'include', // Send cookies for authentication
      body: JSON.stringify({
        message: userQuery,
        history: history, // Send conversation history
        contextData,
        useGrounding: false  // Use internal data, not web search
      }),
    });

    // Check if response is JSON or HTML error page
    const contentType = response.headers.get('content-type');
    if (contentType && contentType.includes('application/json')) {
      const data = await response.json();

      // Handle error responses
      if (!response.ok) {

        // Authentication error
        if (response.status === 401) {
          return { reply: data.error || "Please log in to use the AI Agent.", code: 'AUTH_ERROR' };
        }
        // Rate limiting or queue
        else if (response.status === 429) {
          // Rate limit - user needs to wait
          if (data.code === 'RATE_LIMIT' && data.retryAfter) {
            return {
              reply: `Rate limit exceeded. Please wait ${data.retryAfter} seconds before trying again.`,
              code: 'RATE_LIMIT',
              retryAfter: data.retryAfter
            };
          }
          // Queued - request is waiting in line
          else if (data.code === 'QUEUED' && data.queuePosition) {
            return {
              reply: `Your request is queued (position ${data.queuePosition}). Estimated wait: ${data.estimatedWaitSeconds || 'unknown'} seconds.`,
              code: 'QUEUED',
              queuePosition: data.queuePosition,
              estimatedWaitSeconds: data.estimatedWaitSeconds
            };
          }
          // Circuit breaker - service is down
          else if (data.code === 'CIRCUIT_BREAKER') {
            return { reply: "AI service is temporarily unavailable. Please try again later.", code: 'CIRCUIT_BREAKER' };
          }
          return { reply: data.error || "AI service is busy. Please wait a moment and try again.", code: 'SERVICE_BUSY' };
        }

        return { reply: data.error || "Sorry, I encountered an error while processing your request.", code: 'UNKNOWN_ERROR' };
      }

      // Success - return AI's response
      return { reply: data.reply || "I couldn't generate a response at this time." };
    } else {
      // HTML error page returned (server error)
      const text = await response.text();
      return { reply: "Server error occurred. Please check the backend logs.", code: 'SERVER_ERROR' };
    }

  } catch (err: any) {
    // Network error or other exception
    return { reply: "Sorry, I encountered an error while processing your request.", code: 'NETWORK_ERROR' };
  }
};

// ============================================================================
// AI AGENT (KIKI) - WEB SEARCH
// ============================================================================

/**
 * Get AI agent response using real-time web search
 * The AI searches the internet for up-to-date information
 * 
 * HOW IT WORKS:
 * 1. Frontend sends user question
 * 2. Backend uses Gemini with Google Search grounding
 * 3. Gemini searches web and generates answer with sources
 * 4. Response includes answer + source URLs
 * 
 * USE CASES:
 * - Latest tax rates
 * - Current accounting standards
 * - Recent regulatory changes
 * - General accounting questions
 * 
 * USAGE:
 * ```typescript
 * const response = await getGroundedAgentResponse("What is the current GST rate for electronics?");
 *     // AI's answer
 *  // Array of source URLs
 * ```
 * 
 * @param userQuery - User's question
 * @returns Object with text answer and source URLs
 */
export const getGroundedAgentResponse = async (
  userQuery: string
): Promise<{ text: string; sources: { uri: string; title: string; }[] }> => {
  try {
    const baseUrl = (import.meta as any).env?.VITE_API_URL || 'http://localhost:8000';
    const token = localStorage.getItem('token');

    const response = await fetch(`${baseUrl}/api/agent/message/`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      credentials: 'include',
      body: JSON.stringify({
        message: userQuery,
        contextData: '',
        useGrounding: true
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();

      if (response.status === 401) {
        return {
          text: "Please log in to use the AI Agent.",
          sources: []
        };
      } else if (response.status === 429) {
        return {
          text: "AI service is busy. Please wait a moment and try again.",
          sources: []
        };
      }

      return {
        text: "Sorry, I encountered an error while processing your request with web search.",
        sources: []
      };
    }

    const data = await response.json();
    return {
      text: data.reply || "I couldn't generate a response at this time.",
      sources: data.sources || []
    };
  } catch (err: any) {
    return {
      text: "Sorry, I encountered an error while processing your request with web search.",
      sources: []
    };
  }
};
