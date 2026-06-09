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

interface DynamicQuestionsProps {
    selectedSubGroup: string;
    onAnswersChange?: (answers: Record<number, any>) => void;
}

export const DynamicQuestions: React.FC<DynamicQuestionsProps> = ({
    selectedSubGroup,
    onAnswersChange
}) => {
    const [questions, setQuestions] = useState<Question[]>([]);
    const [answers, setAnswers] = useState<Record<number, any>>({});
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState<string | null>(null);

    useEffect(() => {
        if (!selectedSubGroup) {
            setQuestions([]);
            return;
        }

        fetchQuestions();
    }, [selectedSubGroup]);

    const fetchQuestions = async () => {
        setLoading(true);
        setError(null);

        try {
            const params = new URLSearchParams({ sub_group_1_1: selectedSubGroup });
            const response: any = await httpClient.get(`/api/questions/by_subgroup/?${params.toString()}`);

            setQuestions(response.questions || []);
            setAnswers({}); // Reset answers when questions change
        } catch (err: any) {
            setError(err.message || 'Failed to fetch questions');
            console.error('Error fetching questions:');
        } finally {
            setLoading(false);
        }
    };

    const handleAnswerChange = (questionId: number, value: any) => {
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

        switch (question.field_type) {
            case 'number':
                return (
                    <input
                        type="number"
                        className="form-control"
                        placeholder={question.placeholder}
                        value={value}
                        required={question.required}
                        onChange={(e) => handleAnswerChange(question.id, e.target.value)}
                    />
                );

            case 'radio':
                return (
                    <div className="radio-group">
                        {question.options.map((option) => (
                            <label key={option} className="radio-label">
                                <input
                                    type="radio"
                                    name={`question_${question.id}`}
                                    value={option}
                                    checked={value === option}
                                    required={question.required}
                                    onChange={(e) => handleAnswerChange(question.id, e.target.value)}
                                />
                                <span>{option}</span>
                            </label>
                        ))}
                    </div>
                );

            case 'checkbox':
                return (
                    <label className="checkbox-label">
                        <input
                            type="checkbox"
                            checked={value === true}
                            onChange={(e) => handleAnswerChange(question.id, e.target.checked)}
                        />
                        <span>Enable</span>
                    </label>
                );

            case 'dropdown':
                return (
                    <select
                        className="form-control"
                        value={value}
                        required={question.required}
                        onChange={(e) => handleAnswerChange(question.id, e.target.value)}
                    >
                        <option value="">Select...</option>
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
                        type="date"
                        className="form-control"
                        value={value}
                        required={question.required}
                        onChange={(e) => handleAnswerChange(question.id, e.target.value)}
                    />
                );

            case 'email':
                return (
                    <input
                        type="email"
                        className="form-control"
                        placeholder={question.placeholder || 'email@example.com'}
                        value={value}
                        required={question.required}
                        onChange={(e) => handleAnswerChange(question.id, e.target.value)}
                    />
                );

            case 'tel':
                return (
                    <input
                        type="tel"
                        className="form-control"
                        placeholder={question.placeholder || '1234567890'}
                        value={value}
                        required={question.required}
                        onChange={(e) => handleAnswerChange(question.id, e.target.value)}
                    />
                );

            case 'text':
            default:
                return (
                    <input
                        type="text"
                        className="form-control"
                        placeholder={question.placeholder}
                        value={value}
                        required={question.required}
                        onChange={(e) => handleAnswerChange(question.id, e.target.value)}
                    />
                );
        }
    };

    if (loading) {
        return <div className="loading">Loading questions...</div>;
    }

    if (error) {
        return <div className="error">Error: {error}</div>;
    }

    if (!selectedSubGroup) {
        return <div className="info">Please select a ledger type to see questions</div>;
    }

    if (questions.length === 0) {
        return <div className="info">No questions available for this ledger type</div>;
    }

    return (
        <div className="dynamic-questions">
            <h3>Additional Information</h3>
            <p className="subtitle">Please answer the following questions for {selectedSubGroup}</p>

            <div className="questions-container">
                {questions.map((question) => (
                    <div key={question.id} className="question-field">
                        <label className="question-label">
                            {question.question}
                            {question.required && <span className="required">*</span>}
                        </label>
                        {renderField(question)}
                        {question.condition_rule && (
                            <small className="help-text">{question.condition_rule}</small>
                        )}
                    </div>
                ))}
            </div>

            <style>{`
        .dynamic-questions {
          margin-top: 2rem;
          padding: 1.5rem;
          background: #f8f9fa;
          border-radius: 8px;
        }

        h3 {
          margin: 0 0 0.5rem 0;
          color: #333;
        }

        .subtitle {
          color: #666;
          margin-bottom: 1.5rem;
        }

        .questions-container {
          display: flex;
          flex-direction: column;
          gap: 1.5rem;
        }

        .question-field {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }

        .question-label {
          font-weight: 500;
          color: #333;
        }

        .required {
          color: #dc3545;
          margin-left: 0.25rem;
        }

        .form-control {
          padding: 0.5rem;
          border: 1px solid #ced4da;
          border-radius: 4px;
          font-size: 1rem;
        }

        .form-control:focus {
          outline: none;
          border-color: #80bdff;
          box-shadow-none border border-slate-200: 0 0 0 0.2rem rgba(0, 123, 255, 0.25);
        }

        .radio-group {
          display: flex;
          gap: 1rem;
        }

        .radio-label,
        .checkbox-label {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          cursor: pointer;
        }

        .help-text {
          color: #6c757d;
          font-size: 0.875rem;
        }

        .loading,
        .error,
        .info {
          padding: 1rem;
          text-align: center;
          border-radius: 4px;
        }

        .loading {
          background: #e7f3ff;
          color: #004085;
        }

        .error {
          background: #f8d7da;
          color: #721c24;
        }

        .info {
          background: #d1ecf1;
          color: #0c5460;
        }
      `}</style>
        </div>
    );
};

export default DynamicQuestions;


