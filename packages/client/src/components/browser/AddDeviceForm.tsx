import { useEffect, useRef, useState, type FormEvent } from "react";
import { BROWSER_COPY } from "../../browser.ts";
import { VIEWPORT, clampViewport, type Device } from "../../browser-devices.ts";
import type { DeviceMetrics } from "../../browser.ts";

function SizeInput(props: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <label className="browser-field">
      {props.label}
      <input
        type="number"
        required
        min={VIEWPORT.min}
        max={VIEWPORT.max}
        value={props.value}
        onChange={(e) => props.onChange(e.target.value)}
      />
    </label>
  );
}

/** Add device (STORY-74): a name, a viewport and a pixel ratio, and whether it is a touch device; from what shows now. */
export function AddDeviceForm(props: { from: DeviceMetrics; onAdd: (d: Device) => void; onCancel: () => void }) {
  const { from, onAdd, onCancel } = props;
  const [name, setName] = useState("");
  const [width, setWidth] = useState(String(from.width));
  const [height, setHeight] = useState(String(from.height));
  const [dpr, setDpr] = useState(String(from.dpr));
  const [mobile, setMobile] = useState(from.mobile);
  const nameRef = useRef<HTMLInputElement>(null);
  useEffect(() => nameRef.current?.focus(), []);
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const ratio = Number(dpr);
    onAdd({
      name: name.trim(),
      width: clampViewport(Number(width)),
      height: clampViewport(Number(height)),
      dpr: ratio > 0 && ratio <= 5 ? ratio : 1,
      mobile,
    });
  };
  return (
    // Escape in a field cancels the form, not the pane; the fields and buttons inside take the keys.
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-element-interactions
    <form
      className="browser-add"
      aria-label={BROWSER_COPY.addDevice}
      onSubmit={submit}
      onKeyDown={(e) => {
        if (e.key !== "Escape") return;
        e.preventDefault();
        onCancel();
      }}
    >
      <label className="browser-field">
        {BROWSER_COPY.name}
        <input ref={nameRef} required maxLength={60} value={name} onChange={(e) => setName(e.target.value)} />
      </label>
      <SizeInput label={BROWSER_COPY.width} value={width} onChange={setWidth} />
      <SizeInput label={BROWSER_COPY.height} value={height} onChange={setHeight} />
      <label className="browser-field">
        {BROWSER_COPY.dpr}
        <input
          type="number"
          required
          min={0.5}
          max={5}
          step={0.25}
          value={dpr}
          onChange={(e) => setDpr(e.target.value)}
        />
      </label>
      <label className="browser-check">
        <input type="checkbox" checked={mobile} onChange={(e) => setMobile(e.target.checked)} />
        {BROWSER_COPY.mobile}
      </label>
      <button type="submit" className="review-draft" disabled={!name.trim()}>
        {BROWSER_COPY.add}
      </button>
      <button type="button" className="review-draft" onClick={onCancel}>
        {BROWSER_COPY.cancel}
      </button>
    </form>
  );
}
