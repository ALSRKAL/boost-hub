"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import {
  onAuthStateChanged,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  signInWithPopup,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  type User,
} from "firebase/auth";
import {
  doc,
  getDoc,
  setDoc,
  onSnapshot,
  serverTimestamp,
} from "firebase/firestore";
import {
  getFirebaseAuth,
  getFirebaseDb,
  isFirebaseConfigured,
} from "@/lib/firebase";
import { COLLECTIONS, USER_ROLES, type UserRole } from "@/lib/constants";

// ============================================================
// Types
// ============================================================

export interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  balance: number;
  role: UserRole;
  createdAt: unknown;
}

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  error: string | null;
  signUp: (email: string, password: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ============================================================
// Provider
// ============================================================

const googleProvider = new GoogleAuthProvider();

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(isFirebaseConfigured);
  const [error, setError] = useState<string | null>(null);

  // Create or fetch user profile in Firestore
  const ensureUserProfile = useCallback(async (firebaseUser: User) => {
    try {
      const db = getFirebaseDb();
      const userRef = doc(db, COLLECTIONS.users, firebaseUser.uid);
      const userSnap = await getDoc(userRef);

      if (!userSnap.exists()) {
        // New user — create profile
        const newProfile: Omit<UserProfile, "uid"> = {
          email: firebaseUser.email || "",
          displayName: firebaseUser.displayName || firebaseUser.email || "",
          balance: 0,
          role: USER_ROLES.user,
          createdAt: serverTimestamp(),
        };
        await setDoc(userRef, newProfile);
      }
    } catch (err) {
      console.error("Error ensuring user profile:", err);
    }
  }, []);

  // Listen to auth state + realtime Firestore profile
  useEffect(() => {
    if (!isFirebaseConfigured) {
      return;
    }

    let unsubProfile: (() => void) | null = null;
    const auth = getFirebaseAuth();
    const db = getFirebaseDb();

    const unsubAuth = onAuthStateChanged(auth, async (firebaseUser) => {
      setUser(firebaseUser);

      // Clean up previous profile listener
      if (unsubProfile) {
        unsubProfile();
        unsubProfile = null;
      }

      if (firebaseUser) {
        await ensureUserProfile(firebaseUser);

        // Realtime listener for profile (balance updates etc.)
        const userRef = doc(db, COLLECTIONS.users, firebaseUser.uid);
        unsubProfile = onSnapshot(userRef, (snap) => {
          if (snap.exists()) {
            setUserProfile({
              uid: firebaseUser.uid,
              ...(snap.data() as Omit<UserProfile, "uid">),
            });
          }
        });
      } else {
        setUserProfile(null);
      }

      setLoading(false);
    });

    return () => {
      unsubAuth();
      if (unsubProfile) unsubProfile();
    };
  }, [ensureUserProfile]);

  // ---- Auth Methods ----

  const signUp = useCallback(async (email: string, password: string) => {
    try {
      const auth = getFirebaseAuth();
      setError(null);
      setLoading(true);
      await createUserWithEmailAndPassword(auth, email, password);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Sign up failed";
      setError(message);
      setLoading(false);
      throw err;
    }
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const auth = getFirebaseAuth();
      setError(null);
      setLoading(true);
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Sign in failed";
      setError(message);
      setLoading(false);
      throw err;
    }
  }, []);

  const signInWithGoogle = useCallback(async () => {
    try {
      const auth = getFirebaseAuth();
      setError(null);
      setLoading(true);
      await signInWithPopup(auth, googleProvider);
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Google sign in failed";
      setError(message);
      setLoading(false);
      throw err;
    }
  }, []);

  const logout = useCallback(async () => {
    try {
      const auth = getFirebaseAuth();
      setError(null);
      await firebaseSignOut(auth);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Sign out failed";
      setError(message);
      throw err;
    }
  }, []);

  const clearError = useCallback(() => setError(null), []);

  return (
    <AuthContext.Provider
      value={{
        user,
        userProfile,
        loading,
        error,
        signUp,
        signIn,
        signInWithGoogle,
        logout,
        clearError,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

// ============================================================
// Hook
// ============================================================

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
