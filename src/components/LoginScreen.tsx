import { FormEvent, useState } from "react";
import type {
  ProfileSetupMode,
  UserProfile,
} from "../../shared/contracts";
import { isUnauthorized, signInWithGoogle } from "../lib/api";
import { GoogleSignInButton } from "./GoogleSignInButton";
import { BookMark } from "./Icons";

interface LoginScreenProps {
  googleClientId: string | null;
  onSignedIn: (user: UserProfile) => void;
}

function errorMessage(error: unknown, fallback: string): string {
  return error instanceof Error ? error.message : fallback;
}

export function LoginScreen({ googleClientId, onSignedIn }: LoginScreenProps) {
  const [credential, setCredential] = useState<string | null>(null);
  const [setupMode, setSetupMode] = useState<ProfileSetupMode | null>(null);
  const [suggestedName, setSuggestedName] = useState("");
  const [name, setName] = useState("");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resetSetup() {
    setCredential(null);
    setSetupMode(null);
    setName("");
  }

  async function handleCredential(nextCredential: string) {
    setPending(true);
    setError(null);

    try {
      const result = await signInWithGoogle({ credential: nextCredential });
      if (result.status === "signed_in") {
        onSignedIn(result.user);
        return;
      }
      setCredential(nextCredential);
      setSuggestedName(result.suggestedName);
    } catch (requestError) {
      setError(errorMessage(requestError, "Could not sign in with Google."));
    } finally {
      setPending(false);
    }
  }

  function chooseMode(mode: ProfileSetupMode) {
    setSetupMode(mode);
    setName(mode === "create" ? suggestedName : "");
    setError(null);
  }

  async function handleSetup(event: FormEvent) {
    event.preventDefault();
    const cleanName = name.trim();
    if (!credential || !setupMode || !cleanName) return;

    setPending(true);
    setError(null);

    try {
      const result = await signInWithGoogle({
        credential,
        profile: { mode: setupMode, name: cleanName },
      });
      if (result.status === "signed_in") onSignedIn(result.user);
    } catch (requestError) {
      if (isUnauthorized(requestError)) resetSetup();
      setError(errorMessage(requestError, "Could not set up your profile."));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="app-shell app-shell--login">
      <header className="brand">
        <BookMark />
        <span>Study</span>
      </header>
      <main className="login-panel">
        <div>
          <h1>Make the hours count.</h1>
          <p>One button to track focused study time, day after day.</p>
        </div>

        {!credential ? (
          googleClientId ? (
            <div className="google-sign-in" aria-busy={pending}>
              <GoogleSignInButton
                clientId={googleClientId}
                onCredential={(next) => void handleCredential(next)}
                onLoadError={() =>
                  setError("Google sign-in could not be loaded. Check your connection.")
                }
              />
              {pending ? <p className="privacy-note">Signing in...</p> : null}
            </div>
          ) : (
            <p className="error-message">Google sign-in is not configured yet.</p>
          )
        ) : setupMode === null ? (
          <div className="profile-setup">
            <h2>Have you used Study with a name before?</h2>
            <div className="setup-choices">
              <button type="button" onClick={() => chooseMode("claim")}>
                Yes, link my old profile
              </button>
              <button type="button" onClick={() => chooseMode("create")}>
                No, I'm new here
              </button>
            </div>
          </div>
        ) : (
          <form className="profile-setup" onSubmit={handleSetup}>
            <label htmlFor="profile-name">
              {setupMode === "claim" ? "The name you used before" : "Your name"}
            </label>
            <div className="name-field">
              <input
                id="profile-name"
                name="name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                maxLength={40}
                autoComplete="name"
                autoFocus
                placeholder="Enter your name"
              />
              <button type="submit" disabled={pending || !name.trim()}>
                {pending ? "Saving..." : "Continue"}
              </button>
            </div>
            <p className="privacy-note">
              {setupMode === "claim"
                ? "Your study history moves to this Google account. Each name can be linked only once."
                : "This name appears on the shared leaderboard."}
            </p>
            <button
              className="text-button"
              type="button"
              onClick={() => chooseMode(setupMode === "claim" ? "create" : "claim")}
            >
              {setupMode === "claim"
                ? "I'm new here instead"
                : "I used Study with a name before"}
            </button>
          </form>
        )}

        {error ? (
          <p className="error-message" role="alert">
            {error}
          </p>
        ) : null}

        {!credential ? (
          <p className="privacy-note">
            Only you can change your study history. Your name and hours appear
            on the shared leaderboard. <a href="/privacy">Privacy policy</a>
          </p>
        ) : (
          <button className="text-button" type="button" onClick={resetSetup}>
            Use a different Google account
          </button>
        )}
      </main>
    </div>
  );
}
