import React, { createContext, useContext, useState, useMemo, ReactNode } from 'react';

type AuthCtx = {
    isAuthed: boolean;
    loginWithPin: (pin: string) => boolean;
    logout: () => void;
};

const AuthContext = createContext<AuthCtx | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
    const [isAuthed, setIsAuthed] = useState(false);

    const loginWithPin = (pin: string) => {
        const ok = pin === '1234';
        setIsAuthed(ok);
        return ok;
    };

    const logout = () => setIsAuthed(false);

    const value = useMemo(() => ({ isAuthed, loginWithPin, logout }), [isAuthed]);
    return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
    const ctx = useContext(AuthContext);
    if (!ctx) throw new Error('useAuth must be used within AuthProvider');
    return ctx;
}
