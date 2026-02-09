/**
 * ============================================================================
 * AI AGENT COMPONENT (AIAgent.tsx)
 * ============================================================================
 * AI Agent interface (Kiki) for answering accounting questions.
 * 
 * FEATURES:
 * - Chat interface with message history
 * - Two modes: Internal data analysis & Web search
 * - Debounced message sending (prevents spam)
 * - Queue status display (when AI is busy)
 * - Rate limit handling
 * - Auto-scroll to latest message
 * - Typing indicator
 * - Source citations (for web search mode)
 * 
 * HOW IT WORKS:
 * 1. User types question in input field
 * 2. Clicks send or presses Enter
 * 3. Message sent to parent component (App.tsx)
 * 4. Parent calls geminiService to get AI response
 * 5. Response displayed in chat
 * 
 * TWO MODES:
 * - **Internal Data** (default): Analyzes company's vouchers, ledgers, stock
 * - **Web Search** (toggle on): Searches internet for latest info
 * 
 * USAGE:
 * ```tsx
 * <AIAgent
 *   isOpen={showAIAgent}
 *   onClose={() => setShowAIAgent(false)}
 *   messages={chatMessages}
 *   onSendMessage={handleSendMessage}
 *   isLoading={isAILoading}
 *   queueStatus={aiQueueStatus}
 * />
 * ```
 * 
 * FOR NEW DEVELOPERS:
 * - Messages array contains conversation history
 * - onSendMessage callback handles sending to AI
 * - isLoading shows typing indicator
 * - queueStatus shows queue position when AI is busy
 * - Debounce prevents rapid-fire requests (500ms delay)
 */

// Import React and hooks
import React, { useState, useEffect, useRef, useCallback } from 'react';

// Import AgentMessage type for chat messages
import type { AgentMessage } from '../types';

// Import Icon component for UI icons
import Icon from './Icon';

/**
 * Props for AIAgent component
 */
interface AIAgentProps {
  isOpen: boolean;              // Whether AI agent is visible
  onClose: () => void;          // Callback to close AI agent
  messages: AgentMessage[];     // Chat message history
  onSendMessage: (message: string, useGrounding: boolean) => void;  // Callback to send message
  isLoading: boolean;           // Whether AI is processing
  queueStatus?: {               // Optional queue status (when AI is busy)
    queuePosition?: number;
    estimatedWaitSeconds?: number;
    code?: string;
  };
}

/**
 * AIAgent Component - AI Agent interface (Kiki)
 */
const AIAgent: React.FC<AIAgentProps> = ({ isOpen, onClose, messages, onSendMessage, isLoading, queueStatus }) => {
  // ============================================================================
  // STATE - User input and settings
  // ============================================================================
  const [input, setInput] = useState('');                    // Current message input
  const [useGrounding, setUseGrounding] = useState(false);   // Web search toggle

  // ============================================================================
  // REFS - DOM references and timers
  // ============================================================================
  const messagesEndRef = useRef<HTMLDivElement>(null);       // Reference to bottom of messages
  const debounceTimeoutRef = useRef<NodeJS.Timeout>();       // Debounce timer

  /**
   * Scroll to bottom of messages
   * Called when new messages arrive or loading state changes
   */
  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Auto-scroll when messages change
  useEffect(scrollToBottom, [messages, isLoading]);

  /**
   * Debounced send function
   * Prevents rapid-fire requests by waiting 500ms after last input
   */
  const debouncedSend = useCallback(() => {
    // Clear existing timeout
    if (debounceTimeoutRef.current) {
      clearTimeout(debounceTimeoutRef.current);
    }

    // Set new timeout
    debounceTimeoutRef.current = setTimeout(() => {
      if (input.trim() && !isLoading) {
        onSendMessage(input.trim(), useGrounding);
        setInput('');  // Clear input after sending
      }
    }, 500); // 500ms debounce delay
  }, [input, useGrounding, isLoading, onSendMessage]);

  // Cleanup debounce timer on unmount
  useEffect(() => {
    return () => {
      if (debounceTimeoutRef.current) {
        clearTimeout(debounceTimeoutRef.current);
      }
    };
  }, []);

  /**
   * Handle send button click
   */
  const handleSend = () => {
    if (input.trim() && !isLoading) {
      debouncedSend();
    }
  };

  /**
   * Handle Enter key press
   * Shift+Enter = new line, Enter = send
   */
  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  /**
   * Handle input text change
   */
  const handleInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
  };

  // Don't render if AI agent is closed
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black bg-opacity-30 z-50 flex items-end justify-end">
      <div className="bg-white w-full max-w-md h-[70vh] m-8 rounded-[4px] shadow-none border border-slate-200-2xl flex flex-col transform transition-transform duration-300 ease-out animate-slide-in">
        <div className="flex items-center justify-between p-4 border-b border-gray-200">
          <div className="flex items-center space-x-3">
            <div className="w-20 h-20 flex items-center justify-center">
              <img src="/src/assets/fox-logo-transparent.png" alt="Kiki" className="w-full h-full object-contain" />
            </div>
            <h3 className="text-lg font-semibold text-gray-800">Kiki Agent</h3>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <Icon name="close" className="w-6 h-6" />
          </button>
        </div>

        {/* Messages Area */}
        <div className="flex-1 p-4 overflow-y-auto space-y-4">
          {messages.map((msg, index) => (
            <div key={index}>
              <div className={`flex items-end gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'model' && <div className="w-10 h-10 flex items-center justify-center flex-shrink-0"><img src="/src/assets/fox-logo-transparent.png" alt="Kiki" className="w-full h-full object-contain filter drop-shadow-none border border-slate-200-none border border-slate-200" /></div>}
                <div className={`max-w-xs md:max-w-sm rounded-[4px] px-4 py-2 text-sm ${msg.role === 'user' ? 'bg-indigo-50/500 text-white rounded-br-none' : 'bg-gray-100 text-gray-800 rounded-bl-none'}`}>
                  {msg.text}
                </div>
              </div>
              {msg.sources && msg.sources.length > 0 && (
                <div className="mt-2 ml-10 text-xs text-gray-500">
                  <p className="font-semibold mb-1">Sources:</p>
                  <ul className="space-y-1">
                    {msg.sources.map((source, i) => (
                      <li key={i} className="truncate">
                        <a href={source.uri} target="_blank" rel="noopener noreferrer" className="text-indigo-600 hover:underline">
                          {i + 1}. {source.title}
                        </a>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </div>
          ))}
          {isLoading && (
            <div className="flex items-end gap-2 justify-start">
              <div className="w-10 h-10 flex items-center justify-center flex-shrink-0"><img src="/src/assets/fox-logo-transparent.png" alt="Kiki" className="w-full h-full object-contain filter drop-shadow-none border border-slate-200-none border border-slate-200" /></div>
              <div className="max-w-xs rounded-[4px] px-4 py-2 bg-gray-100 text-gray-800 rounded-bl-none">
                <div className="flex items-center justify-center space-x-1">
                  <div className="w-1.5 h-1.5 bg-gray-400 rounded-[4px] animate-bounce"></div>
                  <div className="w-1.5 h-1.5 bg-gray-400 rounded-[4px] animate-bounce delay-75"></div>
                  <div className="w-1.5 h-1.5 bg-gray-400 rounded-[4px] animate-bounce delay-150"></div>
                </div>
              </div>
            </div>
          )}
          <div ref={messagesEndRef} />
        </div>

        {/* Queue Status */}
        {queueStatus && queueStatus.code === 'QUEUED' && (
          <div className="px-4 py-2 bg-indigo-50/50 border-t border-slate-200">
            <div className="text-xs text-indigo-800 text-center">
              <Icon name="clock" className="w-3 h-3 inline mr-1" />
              Request queued (position {queueStatus.queuePosition})
              {queueStatus.estimatedWaitSeconds && (
                <> • ~{Math.ceil(queueStatus.estimatedWaitSeconds / 60)} min wait</>
              )}
            </div>
          </div>
        )}

        {queueStatus && queueStatus.code === 'RATE_LIMIT' && queueStatus.retryAfter && (
          <div className="px-4 py-2 bg-red-50 border-t border-red-200">
            <div className="text-xs text-red-800 text-center">
              <Icon name="exclamation-triangle" className="w-3 h-3 inline mr-1" />
              Too many requests. Try again in {queueStatus.retryAfter} seconds.
            </div>
          </div>
        )}

        {/* Input Area */}
        <div className="p-4 border-t border-gray-200">
          <div className="relative">
            <textarea
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyPress}
              placeholder="Ask about your data..."
              rows={1}
              disabled={isLoading}
              className="w-full pl-4 pr-12 py-2 border border-gray-300 rounded-[4px] resize-none focus:outline-none focus:ring-2 focus:ring-indigo-500 disabled:bg-gray-100"
            />
            <button onClick={handleSend} disabled={isLoading || !input.trim()} className="absolute right-2 top-1/2 -translate-y-1/2 bg-indigo-600 text-white rounded-[4px] p-2 disabled:bg-gray-300 hover:bg-indigo-700">
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5"><path d="M3.105 3.105a.75.75 0 01.053 1.053L6.37 8.25H13.5a.75.75 0 010 1.5H6.37l-3.212 4.092a.75.75 0 01-1.106-.998l3.75-4.75a.75.75 0 010-.998l-3.75-4.75a.75.75 0 011.053-.053z"></path></svg>
            </button>
          </div>
          <div className="flex items-center justify-center mt-2">
            <label htmlFor="grounding-toggle" className="flex items-center cursor-pointer">
              <div className="relative">
                <input type="checkbox" id="grounding-toggle" className="sr-only" checked={useGrounding} onChange={() => setUseGrounding(!useGrounding)} />
                <div className="block bg-gray-200 w-10 h-6 rounded-[4px]"></div>
                <div className={`dot absolute left-1 top-1 bg-white w-4 h-4 rounded-[4px] transition-transform ${useGrounding ? 'translate-x-full bg-indigo-600' : ''}`}></div>
              </div>
              <div className="ml-3 text-xs text-gray-600">Search the web</div>
            </label>
          </div>
        </div>
        <style>{`
          @keyframes slide-in {
              from { transform: translateY(20px); opacity: 0; }
              to { transform: translateY(0); opacity: 1; }
          }
          .animate-slide-in { animation: slide-in 0.3s ease-out forwards; }
          .animate-bounce { animation: bounce 1s infinite; }
          @keyframes bounce { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-4px); } }
          .delay-75 { animation-delay: 0.075s; }
          .delay-150 { animation-delay: 0.150s; }
        `}</style>
      </div>
    </div>
  );
};

export default AIAgent;


