import React, { useState, useEffect } from 'react';
import { httpClient } from '../services/httpClient';

interface Question {
    id: number;
    sub_group_1_1: string;
    sub_group_1_2: string;
    question: string;
    field_type: string;
    required: boolean;
    options: string[];
    placeholder: string;
    condition_rule: string;
}

interface LedgerQuestionsProps {
    selectedLedgerType: string; // e.g., "Secured Loans", "Bank", etc.
    onAnswersChange?: (answers: Record<number, any>) => void;
    className?: string;
}

export const LedgerQuestions: React.FC<LedgerQuestionsProps> = ({
    selectedLedgerType,
    onAnswersChange,
    className = ''
}) => {
    const [questions, setQuestions] = useState<Question[]>([]);
    const [answers, setAnswers] = useState<Record<number, any>>({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!selectedLedgerType) {
            setQuestions([]);
            setAnswers({});
            return;
        }

        fetchQuestions();
    }, [selectedLedgerType]);

    const fetchQuestions = async () => {
        setLoading(true);
        setError(null);

        try {
            const params = new URLSearchParams({ sub_group_1_1: selectedLedgerType });
            const response: any = await httpClient.get(`/api/questions/by_subgroup/?${params.toString()}`);

            const fetchedQuestions = response.questions || [];
            setQuestions(fetchedQuestions);
            setAnswers({}); // Reset answers when questions change

            console.log(`Loaded ${fetchedQuestions.length} questions for ${selectedLedgerType}`);
        } catch (err: any) {
            setError(err.message || 'Failed to fetch questions');
            console.error('Error fetching questions:', err);
        } finally {
            setLoading(false);
        }
    };

    const handleAnswerChange = (questionId: number, value: any) => {
        // Validation Logic
        const question = questions.find(q => q.id === questionId);
        if (question && typeof value === 'string') {
            // Check for Alpha Numeric constraint
            if (question.condition_rule && question.condition_rule.includes('Alpha Numeric')) {
                // Allow Alphanumeric + Space + specific special chars (-, & @) as per user requirement
                const regex = /^[a-zA-Z0-9\s\-\&@]*$/;
                if (!regex.test(value)) {
                    // Invalid character entered - ignore change
                    return;
                }
            }
        }

        const newAnswers = {
            ...answers,
            [questionId]: value
        };
        setAnswers(newAnswers);

        if (onAnswersChange) {
            onAnswersChange(newAnswers);
        }
    };

    const renderField = (question: Question) => {
        const value = answers[question.id] || '';
        const inputId = `question_${question.id}`;

        switch (question.field_type) {
            case 'number':
                return (
                    <input
                        id={inputId}
                        type="number"
                        className="question-input"
                        placeholder={question.placeholder || 'Enter number'}
                        value={value}
                        required={question.required}
                        onChange={(e) => handleAnswerChange(question.id, e.target.value)}
                    />
                );

            case 'radio':
                return (
                    <div className="radio-group">
                        {question.options.map((option) => (
                            <label key={option} className="radio-option">
                                <input
                                    type="radio"
                                    name={inputId}
                                    value={option}
                                    checked={value === option}
                                    required={question.required}
                                    onChange={(e) => handleAnswerChange(question.id, e.target.value)}
                                />
                                <span className="radio-label">{option}</span>
                            </label>
                        ))}
                    </div>
                );

            case 'checkbox':
                return (
                    <label className="checkbox-option">
                        <input
                            id={inputId}
                            type="checkbox"
                            checked={value === true || value === 'true'}
                            onChange={(e) => handleAnswerChange(question.id, e.target.checked)}
                        />
                        <span className="checkbox-label">Yes</span>
                    </label>
                );

            case 'dropdown':
            case 'select':
                return (
                    <select
                        id={inputId}
                        className="question-select"
                        value={value}
                        required={question.required}
                        onChange={(e) => handleAnswerChange(question.id, e.target.value)}
                    >
                        <option value="">Select an option...</option>
                        {question.options.map((option) => (
                            <option key={option} value={option}>
                                {option}
                            </option>
                        ))}
                    </select>
                );

            case 'date':
                return (
                    <input
                        id={inputId}
                        type="date"
                        className="question-input"
                        value={value}
                        required={question.required}
                        onChange={(e) => handleAnswerChange(question.id, e.target.value)}
                    />
                );

            case 'email':
                return (
                    <input
                        id={inputId}
                        type="email"
                        className="question-input"
                        placeholder={question.placeholder || 'email@example.com'}
                        value={value}
                        required={question.required}
                        onChange={(e) => handleAnswerChange(question.id, e.target.value)}
                    />
                );

            case 'tel':
            case 'phone':
                return (
                    <input
                        id={inputId}
                        type="tel"
                        className="question-input"
                        placeholder={question.placeholder || '1234567890'}
                        value={value}
                        required={question.required}
                        onChange={(e) => handleAnswerChange(question.id, e.target.value)}
                    />
                );

            case 'textarea':
                return (
                    <textarea
                        id={inputId}
                        className="question-textarea"
                        placeholder={question.placeholder}
                        value={value}
                        required={question.required}
                        rows={3}
                        onChange={(e) => handleAnswerChange(question.id, e.target.value)}
                    />
                );

            case 'text':
            default:
                return (
                    <input
                        id={inputId}
                        type="text"
                        className="question-input"
                        placeholder={question.placeholder || 'Enter text'}
                        value={value}
                        required={question.required}
                        onChange={(e) => handleAnswerChange(question.id, e.target.value)}
                    />
                );
        }
    };

    // Don't render anything if no ledger type is selected
    if (!selectedLedgerType) {
        return null;
    }

    // Loading state
    if (loading) {
        return (
            <div className={`ledger-questions ${className}`}>
                <div className="questions-loading">
                    <div className="spinner"></div>
                    <p>Loading questions for {selectedLedgerType}...</p>
                </div>
            </div>
        );
    }

    // Error state
    if (error) {
        return (
            <div className={`ledger-questions ${className}`}>
                <div className="questions-error">
                    <p>⚠️ {error}</p>
                    <button onClick={fetchQuestions} className="retry-button">
                        Retry
                    </button>
                </div>
            </div>
        );
    }

    // No questions available
    if (questions.length === 0) {
        return (
            <div className={`ledger-questions ${className}`}>
                <div className="questions-empty">
                    <p>ℹ️ No additional questions required for {selectedLedgerType}</p>
                </div>
            </div>
        );
    }

    // Render questions
    return (
        <div className={`ledger-questions ${className}`}>
            <div className="questions-header">
                <h3>Additional Information</h3>
                <p className="questions-subtitle">
                    Please provide the following details for <strong>{selectedLedgerType}</strong>
                </p>
            </div>

            <div className="questions-list">
                {questions.map((question, index) => (
                    <div key={question.id} className="question-item">
                        <label htmlFor={`question_${question.id}`} className="question-label">
                            <span className="question-number">{index + 1}.</span>
                            <span className="question-text">{question.question}</span>
                            {question.required && <span className="required-mark">*</span>}
                        </label>

                        <div className="question-field">
                            {renderField(question)}
                        </div>

                        {/* Condition Rule Text Hidden as per request */}
                    </div>
                ))}
            </div>

            <style jsx="true">{`
        .ledger-questions {
          margin-top: 1.5rem;
          padding: 1.5rem;
          background: #ffffff;
          border: 1px solid #e0e0e0;
          border-radius: 8px;
        }

        .questions-header {
          margin-bottom: 1.5rem;
          padding-bottom: 1rem;
          border-bottom: 2px solid #f0f0f0;
        }

        .questions-header h3 {
          margin: 0 0 0.5rem 0;
          font-size: 1.25rem;
          color: #333;
          font-weight: 600;
        }

        .questions-subtitle {
          margin: 0;
          font-size: 0.9rem;
          color: #666;
        }

        .questions-subtitle strong {
          color: #2563eb;
        }

        .questions-list {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .question-item {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .question-label {
          display: flex;
          align-items: baseline;
          gap: 0.5rem;
          font-weight: 500;
          color: #333;
          font-size: 0.95rem;
        }

        .question-number {
          color: #666;
          font-weight: 600;
          min-width: 1.5rem;
        }

        .question-text {
          flex: 1;
        }

        .required-mark {
          color: #dc2626;
          font-weight: bold;
        }

        .question-field {
          margin-left: 2rem;
        }

        .question-input,
        .question-select,
        .question-textarea {
          width: 100%;
          max-width: 500px;
          padding: 0.625rem 0.875rem;
          border: 1px solid #d1d5db;
          border-radius: 6px;
          font-size: 0.95rem;
          transition: all 0.2s;
        }

        .question-input:focus,
        .question-select:focus,
        .question-textarea:focus {
          outline: none;
          border-color: #2563eb;
          box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.1);
        }

        .radio-group {
          display: flex;
          gap: 1.5rem;
          flex-wrap: wrap;
        }

        .radio-option,
        .checkbox-option {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          cursor: pointer;
          padding: 0.5rem 0.75rem;
          border-radius: 6px;
          transition: background-color 0.2s;
        }

        .radio-option:hover,
        .checkbox-option:hover {
          background-color: #f9fafb;
        }

        .radio-option input[type="radio"],
        .checkbox-option input[type="checkbox"] {
          width: 1.125rem;
          height: 1.125rem;
          cursor: pointer;
        }

        .radio-label,
        .checkbox-label {
          font-weight: 400;
          color: #374151;
        }

        .question-hint {
          margin-left: 2rem;
          color: #6b7280;
          font-size: 0.85rem;
        }

        .questions-loading,
        .questions-error,
        .questions-empty {
          padding: 2rem;
          text-align: center;
          border-radius: 6px;
        }

        .questions-loading {
          background: #eff6ff;
          color: #1e40af;
        }

        .questions-error {
          background: #fef2f2;
          color: #991b1b;
        }

        .questions-empty {
          background: #f0fdf4;
          color: #166534;
        }

        .spinner {
          width: 40px;
          height: 40px;
          margin: 0 auto 1rem;
          border: 4px solid #e5e7eb;
          border-top-color: #2563eb;
          border-radius: 50%;
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          to {
            transform: rotate(360deg);
          }
        }

        .retry-button {
          margin-top: 1rem;
          padding: 0.5rem 1rem;
          background: #dc2626;
          color: white;
          border: none;
          border-radius: 6px;
          cursor: pointer;
          font-weight: 500;
        }

        .retry-button:hover {
          background: #b91c1c;
        }
      `}</style>
        </div>
    );
};

export default LedgerQuestions;

