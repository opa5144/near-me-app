import { useRef, useState } from 'react';
import { TextInput } from 'react-native';
import type { TextInputProps } from 'react-native';

export type AccountInputMask = 'phone' | 'dob';

export type AccountMaskedInputProps = Omit<
  TextInputProps,
  'value' | 'onChangeText' | 'maxLength' | 'selection'
> & {
  mask: AccountInputMask;
  value: string;
  onChangeText: (value: string) => void;
};

type Selection = { start: number; end: number };
type Replacement = { start: number; end: number; inserted: string };
type PendingSelection = { value: string; selection: Selection };

const digitsOnly = (value: string) => value.replace(/\D/g, '');
const digitCount = (value: string) => digitsOnly(value).length;
const digitLimit = (mask: AccountInputMask) => mask === 'phone' ? 11 : 8;

function formatGroups(value: string, sizes: number[], separators: string[]): string {
  let offset = 0;
  let result = '';
  sizes.forEach((size, index) => {
    const group = value.slice(offset, offset + size);
    if (group) result += (index ? separators[index - 1] : '') + group;
    offset += size;
  });
  return result;
}

// These formatters cap digits. Validate legacy stored values before normalizing them.
export function formatPhoneNumber(value: string): string {
  return formatGroups(digitsOnly(value).slice(0, 11), [1, 3, 3, 4], [' ', '-', '-']);
}

export function formatDateOfBirth(value: string): string {
  return formatGroups(digitsOnly(value).slice(0, 8), [4, 2, 2], ['-', '-']);
}

function formatValue(mask: AccountInputMask, value: string): string {
  return mask === 'phone' ? formatPhoneNumber(value) : formatDateOfBirth(value);
}

// Prefer the known selection so repeated digits do not move the inferred edit.
// Fall back to a common-prefix/suffix diff for native edits without a key event.
function findReplacement(
  previous: string,
  next: string,
  selection: Selection,
  key: string | null,
): Replacement {
  const atRange = (start: number, end: number): Replacement | null => {
    if (start < 0 || end > previous.length) return null;
    const insertedLength = next.length - previous.length + end - start;
    if (insertedLength < 0) return null;
    const inserted = next.slice(start, start + insertedLength);
    return previous.slice(0, start) + inserted + previous.slice(end) === next
      ? { start, end, inserted }
      : null;
  };
  const selectedEdit = atRange(selection.start, selection.end);
  if (selectedEdit) return selectedEdit;
  const removedLength = previous.length - next.length;
  if (removedLength > 0 && selection.start === selection.end) {
    const backward = () => atRange(selection.start - removedLength, selection.start);
    const forward = () => atRange(selection.start, selection.start + removedLength);
    const deletion = key === 'Delete' ? forward() || backward() : backward() || forward();
    if (deletion) return deletion;
  }
  let start = 0;
  while (start < previous.length && start < next.length && previous[start] === next[start]) start += 1;
  let end = previous.length;
  let nextEnd = next.length;
  while (end > start && nextEnd > start && previous[end - 1] === next[nextEnd - 1]) {
    end -= 1;
    nextEnd -= 1;
  }
  return { start, end, inserted: next.slice(start, nextEnd) };
}

// Convert a raw-digit caret to a displayed offset, skipping mask separators.
function displayedOffset(formatted: string, rawOffset: number): number {
  let offset = 0;
  let seen = 0;
  while (offset < formatted.length && seen < rawOffset) {
    if (/\d/.test(formatted[offset])) seen += 1;
    offset += 1;
  }
  while (offset < formatted.length && /\D/.test(formatted[offset])) offset += 1;
  return offset;
}

export function AccountMaskedInput({
  mask, value, onChangeText, onSelectionChange, onKeyPress, onTouchStart, onBlur, ...inputProps
}: AccountMaskedInputProps) {
  const textRef = useRef(value);
  const selectionRef = useRef<Selection>({ start: value.length, end: value.length });
  const keyRef = useRef<{ key: string; selection: Selection } | null>(null);
  const pendingRef = useRef<PendingSelection | null>(null);
  const [selection, setSelection] = useState<Selection | undefined>();

  // Accept parent loads/resets as supplied, including invalid legacy values.
  // Normalization is triggered by editing, not by rendering the controlled value.
  if (textRef.current !== value) {
    textRef.current = value;
    keyRef.current = null;
    pendingRef.current = null;
    selectionRef.current = {
      start: Math.min(selectionRef.current.start, value.length),
      end: Math.min(selectionRef.current.end, value.length),
    };
  }

  const releaseCaret = () => {
    pendingRef.current = null;
    setSelection(undefined);
  };

  const handleChangeText = (nativeText: string) => {
    const previous = textRef.current;
    const key = keyRef.current;
    const oldSelection = key?.selection || selectionRef.current;
    keyRef.current = null;
    const edit = findReplacement(previous, nativeText, oldSelection, key?.key || null);
    const oldDigits = digitsOnly(previous);
    let rawStart = digitCount(previous.slice(0, edit.start));
    let rawEnd = digitCount(previous.slice(0, edit.end));
    const insertedDigits = digitsOnly(edit.inserted);

    // Removing just a separator would otherwise put it straight back. For a
    // collapsed caret, remove the adjacent digit in the deletion direction.
    const separatorOnlyDeletion = edit.end > edit.start && !edit.inserted && rawStart === rawEnd;
    if (separatorOnlyDeletion && oldSelection.start === oldSelection.end) {
      const backward = key?.key === 'Backspace' || (key?.key !== 'Delete' && edit.end <= oldSelection.start);
      if (backward && rawStart > 0) rawStart -= 1;
      else if (!backward && rawEnd < oldDigits.length) rawEnd += 1;
    }

    // Limit the inserted part first, preserving existing digits after the caret.
    const limit = digitLimit(mask);
    const available = Math.max(0, limit - (oldDigits.length - (rawEnd - rawStart)));
    const accepted = insertedDigits.slice(0, available);
    const nextDigits = (oldDigits.slice(0, rawStart) + accepted + oldDigits.slice(rawEnd)).slice(0, limit);
    const formatted = formatValue(mask, nextDigits);
    const caret = displayedOffset(formatted, Math.min(rawStart + accepted.length, nextDigits.length));
    const nextSelection = { start: caret, end: caret };
    textRef.current = formatted;
    selectionRef.current = nextSelection;
    pendingRef.current = { value: formatted, selection: nextSelection };
    setSelection(nextSelection);
    onChangeText(formatted);
  };

  return (
    <TextInput
      {...inputProps}
      value={value}
      onChangeText={handleChangeText}
      selection={pendingRef.current?.value === value ? selection : undefined}
      onSelectionChange={event => {
        const actual = event.nativeEvent.selection;
        const pending = pendingRef.current;
        // Ignore the native pre-format cursor event until our mapped caret is
        // acknowledged, then release control so user selection remains natural.
        if (!pending) selectionRef.current = actual;
        else if (actual.start === pending.selection.start && actual.end === pending.selection.end) {
          selectionRef.current = actual;
          releaseCaret();
        }
        onSelectionChange?.(event);
      }}
      onKeyPress={event => {
        const key = event.nativeEvent.key;
        keyRef.current = { key, selection: { ...selectionRef.current } };
        releaseCaret();
        onKeyPress?.(event);
      }}
      onTouchStart={event => {
        releaseCaret();
        keyRef.current = null;
        onTouchStart?.(event);
      }}
      onBlur={event => {
        releaseCaret();
        keyRef.current = null;
        onBlur?.(event);
      }}
    />
  );
}
