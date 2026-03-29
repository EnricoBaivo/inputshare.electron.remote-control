import React from 'react';

interface FormGroupProps {
  label: string;
  children: React.ReactNode;
}

export function FormGroup({ label, children }: FormGroupProps) {
  return (
    <div className="form-group">
      <label>{label}</label>
      {children}
    </div>
  );
}
