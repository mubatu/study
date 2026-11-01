import { useEffect, useRef } from "react";
import { loadGoogleIdentity } from "../lib/googleIdentity";

interface GoogleSignInButtonProps {
  clientId: string;
  onCredential: (credential: string) => void;
  onLoadError: () => void;
}

export function GoogleSignInButton({
  clientId,
  onCredential,
  onLoadError,
}: GoogleSignInButtonProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const onCredentialRef = useRef(onCredential);
  const onLoadErrorRef = useRef(onLoadError);
  onCredentialRef.current = onCredential;
  onLoadErrorRef.current = onLoadError;

  useEffect(() => {
    let cancelled = false;

    loadGoogleIdentity()
      .then((accountsId) => {
        const container = containerRef.current;
        if (cancelled || !container) return;

        accountsId.initialize({
          client_id: clientId,
          callback: (response) => {
            if (response.credential) onCredentialRef.current(response.credential);
          },
        });
        accountsId.renderButton(container, {
          type: "standard",
          theme: "outline",
          size: "large",
          text: "continue_with",
          shape: "pill",
          width: Math.min(400, container.offsetWidth || 320),
        });
      })
      .catch(() => {
        if (!cancelled) onLoadErrorRef.current();
      });

    return () => {
      cancelled = true;
    };
  }, [clientId]);

  return <div ref={containerRef} className="google-button" />;
}
