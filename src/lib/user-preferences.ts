import { getFirebaseAuth } from "@/lib/firebase";
import type { Language } from "@/lib/i18n";

/**
 * Persists the customer's language choice through an authenticated API route.
 * Firestore rules intentionally keep user documents read-only for customers.
 */
export async function saveLanguagePreference(
  language: Language
): Promise<boolean> {
  try {
    const user = getFirebaseAuth().currentUser;

    if (!user) return false;

    const token = await user.getIdToken();
    const response = await fetch("/api/preferences/language", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify({ language }),
    });

    return response.ok;
  } catch (error) {
    console.error("Failed to save the language preference:", error);
    return false;
  }
}
