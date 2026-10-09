import React, { useState, useEffect } from 'react';

import * as TextFieldsOutlinedModule from '@mui/icons-material/TextFieldsOutlined';
import { InputLabel, Stack } from '@mui/material';

import RawSliderInput from './raw/RawSliderInput';

import { resolveMuiIcon } from '../../../../../../utils/resolveMuiIcon';

const TextFieldsOutlined = resolveMuiIcon(TextFieldsOutlinedModule);

type Props = {
  label: string;
  defaultValue: number | null;
  onChange: (v: number) => void;
};
export default function FontSizeInput({ label, defaultValue, onChange }: Props) {
  // Fall back to 14 when defaultValue is null or undefined
  const defaultFontSize = defaultValue ?? 14;
  const [value, setValue] = useState(defaultFontSize);

  // Sync internal state when defaultValue changes externally
  useEffect(() => {
    const newDefaultFontSize = defaultValue ?? 14;
    setValue(newDefaultFontSize);
  }, [defaultValue]);

  const handleChange = (value: number) => {
    setValue(value);
    onChange(value);
  };
  return (
    <Stack spacing={1} alignItems="flex-start">
      <InputLabel shrink>{label}</InputLabel>
      <RawSliderInput
        iconLabel={<TextFieldsOutlined sx={{ fontSize: 16 }} />}
        value={value}
        setValue={handleChange}
        units="px"
        step={1}
        min={10}
        max={48}
      />
    </Stack>
  );
}
