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
  getAdditionalUserInfo,
  GoogleAuthProvider,
  signOut as firebaseSignOut,
  sendPasswordResetEmail,
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
import { useLanguage } from "@/context/LanguageContext";

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
  preferredLanguage?: "ar" | "en";
  languageChosen?: boolean;
}

interface AuthContextType {
  user: User | null;
  userProfile: UserProfile | null;
  loading: boolean;
  error: string | null;
  signUp: (email: string, password: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<{ isNewUser: boolean }>;
  resetPassword: (email: string) => Promise<void>;
  logout: () => Promise<void>;
  clearError: () => void;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// ============================================================
// Provider
// ============================================================

const googleProvider = new GoogleAuthProvider();

export function AuthProvider({ children }: { children: ReactNode }) {
  const { language, setLanguage } = useLanguage();
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
          languageChosen: false,
        };
        await setDoc(userRef, newProfile, { merge: true });
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

  // Apply the saved language preference once per browser session. A manual
  // toggle in the same session is never overwritten.
  useEffect(() => {
    const preferred = userProfile?.preferredLanguage;

    if (!preferred || !user?.uid || preferred === language) return;

    const key = `smm:language-synced:${user.uid}`;

    try {
      if (window.sessionStorage.getItem(key)) return;
      window.sessionStorage.setItem(key, "1");
    } catch {
      // sessionStorage can be unavailable in locked-down browsers.
    }

    setLanguage(preferred);
  }, [user?.uid, userProfile?.preferredLanguage, language, setLanguage]);

  // ---- Auth Methods ----

  // These methods do not toggle the global `loading` flag: the auth listener
  // owns that state, and flipping it here would unmount the form mid-request.
  const signUp = useCallback(async (email: string, password: string) => {
    try {
      const auth = getFirebaseAuth();
      setError(null);
      await createUserWithEmailAndPassword(auth, email, password);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Sign up failed");
      throw err;
    }
  }, []);

  const signIn = useCallback(async (email: string, password: string) => {
    try {
      const auth = getFirebaseAuth();
      setError(null);
      await signInWithEmailAndPassword(auth, email, password);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Sign in failed");
      throw err;
    }
  }, []);

  const signInWithGoogle = useCallback(async () => {
    try {
      const auth = getFirebaseAuth();
      setError(null);
      const credential = await signInWithPopup(auth, googleProvider);
      const additional = getAdditionalUserInfo(credential);

      return { isNewUser: Boolean(additional?.isNewUser) };
    } catch (err: unknown) {
      const message =
        err instanceof Error ? err.message : "Google sign in failed";
      if (message.includes("unauthorized-domain")) {
        setError(
          "This domain is not authorized in Firebase. Add it in Firebase Console → Authentication → Settings → Authorized domains."
        );
      } else if (!message.includes("popup-closed")) {
        setError(message);
      }
      throw err;
    }
  }, []);

  const resetPassword = useCallback(async (email: string) => {
    try {
      const auth = getFirebaseAuth();
      setError(null);
      await sendPasswordResetEmail(auth, email);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Password reset failed");
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
        resetPassword,
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
