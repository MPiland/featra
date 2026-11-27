import { useState } from "react";
import { BROWSER_COPY } from "../../browser.ts";
import {
  DEVICE_PRESETS,
  VIEWPORT,
  addDevice,
  clampViewport,
  deviceOfChoice,
  removeDevice,
  type BrowserDevices,
  type DeviceChoice,
} from "../../browser-devices.ts";
import { AddDeviceForm } from "./AddDeviceForm.tsx";

const valueOf = (choice: DeviceChoice) => (typeof choice === "string" ? choice : `device:${choice.device}`);
const choiceOf = (value: string): DeviceChoice =>
  value === "fit" || value === "responsive" ? value : { device: value.slice("device:".length) };

/** A width or height field: what is typed counts once it is a size a viewport can be. */
function SizeField(props: { label: string; value: number; onChange: (n: number) => void }) {
  const { label, value, onChange } = props;
  const [text, setText] = useState<string | null>(null);
  return (
    <input
      type="number"
      className="browser-size"
      aria-label={label}
      min={VIEWPORT.min}
      max={VIEWPORT.max}
      value={text ?? String(value)}
      onChange={(e) => {
        setText(e.target.value);
        const n = Number(e.target.value);
        if (e.target.value && n >= VIEWPORT.min && n <= VIEWPORT.max) onChange(clampViewport(n));
      }}
      onBlur={() => setText(null)}
    />
  );
}

/**
 * The device toolbar (STORY-74), as Chrome's: fit the pane, Responsive with its width and height, a current phone,
 * tablet or computer, or a device the user added. Adding one chooses it; removing the chosen one fits the pane again.
 */
export function DeviceToolbar({
  devices,
  onChange,
}: {
  devices: BrowserDevices;
  onChange: (d: BrowserDevices) => void;
}) {
  const [adding, setAdding] = useState(false);
  const device = deviceOfChoice(devices);
  const { choice, custom, responsive } = devices;
  const customChosen = typeof choice === "object" && custom.some((d) => d.name === choice.device);
  const presets = DEVICE_PRESETS.filter((p) => !custom.some((d) => d.name === p.name));
  return (
    <div className="browser-devices">
      <select
        className="browser-device"
        aria-label={BROWSER_COPY.device}
        value={device || choice === "fit" ? valueOf(choice) : "fit"}
        onChange={(e) => onChange({ ...devices, choice: choiceOf(e.target.value) })}
      >
        <option value="fit">{BROWSER_COPY.fit}</option>
        <option value="responsive">{BROWSER_COPY.responsive}</option>
        {custom.length > 0 && (
          <optgroup label={BROWSER_COPY.custom}>
            {custom.map((d) => (
              <option key={d.name} value={`device:${d.name}`}>
                {d.name}
              </option>
            ))}
          </optgroup>
        )}
        <optgroup label={BROWSER_COPY.presets}>
          {presets.map((d) => (
            <option key={d.name} value={`device:${d.name}`}>
              {d.name}
            </option>
          ))}
        </optgroup>
      </select>
      {choice === "responsive" ? (
        <span className="browser-sizes">
          <SizeField
            label={BROWSER_COPY.width}
            value={responsive.width}
            onChange={(width) => onChange({ ...devices, responsive: { ...responsive, width } })}
          />
          <span aria-hidden="true">×</span>
          <SizeField
            label={BROWSER_COPY.height}
            value={responsive.height}
            onChange={(height) => onChange({ ...devices, responsive: { ...responsive, height } })}
          />
        </span>
      ) : (
        device && (
          <span className="meta browser-size-text">
            {device.width} × {device.height}
          </span>
        )
      )}
      {customChosen && typeof choice === "object" && (
        <button type="button" className="review-draft" onClick={() => onChange(removeDevice(devices, choice.device))}>
          {BROWSER_COPY.removeDevice}
        </button>
      )}
      {!adding && (
        <button type="button" className="review-draft" onClick={() => setAdding(true)}>
          {BROWSER_COPY.addDevice}
        </button>
      )}
      {adding && (
        <AddDeviceForm
          from={device ?? { ...responsive, dpr: 1, mobile: false }}
          onAdd={(d) => {
            setAdding(false);
            onChange(addDevice(devices, d));
          }}
          onCancel={() => setAdding(false)}
        />
      )}
    </div>
  );
}
