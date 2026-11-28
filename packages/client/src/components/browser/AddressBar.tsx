import { useId, useState, type FormEvent, type KeyboardEvent, type ReactNode } from "react";
import { BROWSER_COPY, type BrowserBridge, type BrowserState } from "../../browser.ts";
import { addressToUrl } from "../../browser-devices.ts";
import { BackIcon, ForwardIcon, ReloadIcon } from "../icons.tsx";

export interface AddressBarProps {
  host: Pick<BrowserBridge, "navigate" | "back" | "forward" | "reload">;
  pageKey: string;
  state: BrowserState;
}

function BarButton(props: { label: string; enabled: boolean; onClick: () => void; children: ReactNode }) {
  const { label, enabled, onClick, children } = props;
  return (
    <button
      type="button"
      className="browser-button"
      aria-label={label}
      title={label}
      disabled={!enabled}
      onClick={onClick}
    >
      {children}
    </button>
  );
}

/**
 * Back, Forward, Reload and the address (STORY-74). The address shows the page's URL; what the user types loads on
 * Enter: any web address (`addressToUrl`), and Escape puts the page's URL back.
 */
export function AddressBar({ host, pageKey, state }: AddressBarProps) {
  // What the user is typing; null shows the page's URL.
  const [typed, setTyped] = useState<string | null>(null);
  const [bad, setBad] = useState(false);
  const hintId = useId();
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const url = addressToUrl(typed ?? state.url);
    setBad(url === null);
    if (url === null) return;
    setTyped(null);
    host.navigate(pageKey, url);
  };
  const onKey = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Escape" || typed === null) return;
    e.preventDefault();
    setTyped(null);
    setBad(false);
  };
  return (
    <form className="browser-bar" onSubmit={submit}>
      <BarButton label={BROWSER_COPY.back} enabled={state.canGoBack} onClick={() => host.back(pageKey)}>
        <BackIcon />
      </BarButton>
      <BarButton label={BROWSER_COPY.forward} enabled={state.canGoForward} onClick={() => host.forward(pageKey)}>
        <ForwardIcon />
      </BarButton>
      <BarButton label={BROWSER_COPY.reload} enabled={state.url !== ""} onClick={() => host.reload(pageKey)}>
        <ReloadIcon />
      </BarButton>
      <input
        className="browser-address"
        aria-label={BROWSER_COPY.address}
        aria-invalid={bad}
        aria-describedby={bad ? hintId : undefined}
        spellCheck={false}
        autoComplete="off"
        value={typed ?? state.url}
        onChange={(e) => {
          setTyped(e.target.value);
          setBad(false);
        }}
        onKeyDown={onKey}
      />
      {bad && (
        <p id={hintId} className="card-error browser-hint" role="alert">
          {BROWSER_COPY.badAddress}
        </p>
      )}
    </form>
  );
}
