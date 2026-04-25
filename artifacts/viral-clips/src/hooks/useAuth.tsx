import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from "react";
import {
  apiLogin,
  apiLogout,
  apiRegister,
  getToken,
  type AuthUser,
} from "@/lib/apiClient";

interface AuthContextValue {
  user: AuthUser | null;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  // On mount, try to restore user from token via refresh
  useEffect(() => {
    const token = getToken();
    if (token) {
      // Decode payload to restore user info without a round trip
      try {
        const payload = JSON.parse(atob(token.split(".")[1]!)) as {
          userId: string;
          email: string;
          plan: string;
          exp: number;
        };
        if (payload.exp * 1000 > Date.now()) {
          setUser({ id: payload.userId, email: payload.email, plan: payload.plan });
        }
      } catch {}
    }
    setIsLoading(false);
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const { user: u } = await apiLogin(email, password);
    setUser(u);
  }, []);

  const register = useCallback(async (email: string, password: string) => {
    const { user: u } = await apiRegister(email, password);
    setUser(u);
  }, []);

  const logout = useCallback(async () => {
    await apiLogout();
    setUser(null);
  }, []);

  return (
    <AuthContext.Provider value={{ user, isLoading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
