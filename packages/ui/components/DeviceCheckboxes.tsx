import React from 'react';

interface DeviceCheckboxesProps {
  kbChecked: boolean;
  gpChecked: boolean;
  kbDisabled?: boolean;
  gpDisabled?: boolean;
  onKbChange: (checked: boolean) => void;
  onGpChange: (checked: boolean) => void;
  hint?: string;
}

export function DeviceCheckboxes({
  kbChecked, gpChecked, kbDisabled, gpDisabled,
  onKbChange, onGpChange, hint,
}: DeviceCheckboxesProps) {
  return (
    <>
      <div className="device-checks">
        <label className="check-label">
          <input type="checkbox" checked={kbChecked} disabled={kbDisabled} onChange={e => onKbChange(e.target.checked)} />
          Keyboard + Mouse
        </label>
        <label className="check-label">
          <input type="checkbox" checked={gpChecked} disabled={gpDisabled} onChange={e => onGpChange(e.target.checked)} />
          Gamepad
        </label>
      </div>
      {hint && <div className="device-hint">{hint}</div>}
    </>
  );
}
