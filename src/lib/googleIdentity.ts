// Minimal typings and loader for Google Identity Services (accounts.google.com/gsi/client).

interface GoogleCredentialResponse {
  credential?: string;
}

export interface GoogleAccountsId {
  initialize(config: {
    client_id: string;
    callback: (response: GoogleCredentialResponse) => void;
    auto_select?: boolean;
    cancel_on_tap_outside?: boolean;
  }): void;
  renderButton(parent: HTMLElement, options: Record<string, unknown>): void;
  disableAutoSelect(): void;
}

declare global {
  interface Window {
    google?: { accounts?: { id?: GoogleAccountsId } };
  }
}

const SCRIPT_URL = "https://accounts.google.com/gsi/client";
let loader: Promise<GoogleAccountsId> | null = null;

export function loadGoogleIdentity(): Promise<GoogleAccountsId> {
  const existing = window.google?.accounts?.id;
  if (existing) return Promise.resolve(existing);

  loader ??= new Promise<GoogleAccountsId>((resolve, reject) => {
    const script = document.createElement("script");
    script.src = SCRIPT_URL;
    script.async = true;
    script.onload = () => {
      const accountsId = window.google?.accounts?.id;
      if (accountsId) resolve(accountsId);
      else reject(new Error("Google Identity Services did not initialize."));
    };
    script.onerror = () => {
      loader = null;
      script.remove();
      reject(new Error("Google Identity Services could not be loaded."));
    };
    document.head.appendChild(script);
  });
  return loader;
}

export function disableGoogleAutoSelect(): void {
  window.google?.accounts?.id?.disableAutoSelect();
}
