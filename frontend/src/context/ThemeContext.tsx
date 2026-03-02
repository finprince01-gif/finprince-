import React, { createContext, useContext, useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

interface ThemeContextType {
    theme: Theme;
    toggleTheme: () => void;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
    const [theme, setTheme] = useState<Theme>(() => {
        // Check session storage first, then fallback to local storage for migration
        const sessionTheme = sessionStorage.getItem('theme');
        if (sessionTheme === 'dark' || sessionTheme === 'light') {
            return sessionTheme;
        }

        const localTheme = localStorage.getItem('theme');
        if (localTheme === 'dark' || localTheme === 'light') {
            // Migrate to session storage and will clear local in useEffect
            return localTheme;
        }

        // Always default to light mode unless the user explicitly chooses dark mode
        return 'light';
    });

    useEffect(() => {
        const root = window.document.documentElement;
        if (theme === 'dark') {
            root.classList.add('dark');
            document.body.classList.add('dark');
        } else {
            root.classList.remove('dark');
            document.body.classList.remove('dark');
        }
        sessionStorage.setItem('theme', theme);
        // Clean up legacy localStorage item
        localStorage.removeItem('theme');
    }, [theme]);

    const toggleTheme = () => {
        setTheme(prev => (prev === 'light' ? 'dark' : 'light'));
    };

    return (
        <ThemeContext.Provider value={{ theme, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
};

export const useTheme = () => {
    const context = useContext(ThemeContext);
    if (context === undefined) {
        throw new Error('useTheme must be used within a ThemeProvider');
    }
    return context;
};
