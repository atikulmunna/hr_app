import { BadRequestException } from '@nestjs/common';
import { CustomFieldDefinition } from '../../entities/custom-field-definition.entity';

// Pure validation for employee custom-field values against the tenant's
// definitions. Kept free of I/O so it is straightforward to reason about and
// test. Returns the merged, normalized value map to store.
export function validateCustomFields(
  input: Record<string, unknown> | undefined,
  definitions: CustomFieldDefinition[],
  existing: Record<string, unknown> = {},
): Record<string, unknown> {
  const byKey = new Map(definitions.map((d) => [d.fieldKey, d]));
  const merged: Record<string, unknown> = { ...existing };

  for (const [key, raw] of Object.entries(input ?? {})) {
    const def = byKey.get(key);
    if (!def) {
      throw new BadRequestException(`Unknown custom field "${key}".`);
    }
    if (!def.active) {
      throw new BadRequestException(
        `Custom field "${def.label}" is not active.`,
      );
    }
    // Null or empty clears a value; required is re-checked below.
    if (raw === null || raw === '') {
      delete merged[key];
      continue;
    }
    merged[key] = coerceValue(def, raw);
  }

  for (const def of definitions) {
    if (def.active && def.required && merged[def.fieldKey] === undefined) {
      throw new BadRequestException(
        `Custom field "${def.label}" is required.`,
      );
    }
  }

  return merged;
}

function coerceValue(def: CustomFieldDefinition, raw: unknown): unknown {
  switch (def.fieldType) {
    case 'text':
      return asString(def, raw);
    case 'select': {
      const value = asString(def, raw);
      const options = def.options ?? [];
      if (!options.includes(value)) {
        throw new BadRequestException(
          `"${value}" is not a valid option for "${def.label}".`,
        );
      }
      return value;
    }
    case 'number': {
      const value = typeof raw === 'number' ? raw : Number(raw);
      if (typeof raw === 'boolean' || Number.isNaN(value)) {
        throw invalid(def, 'a number');
      }
      return value;
    }
    case 'boolean': {
      if (typeof raw === 'boolean') return raw;
      if (raw === 'true') return true;
      if (raw === 'false') return false;
      throw invalid(def, 'a boolean');
    }
    case 'date': {
      if (typeof raw !== 'string' || Number.isNaN(Date.parse(raw))) {
        throw invalid(def, 'an ISO date');
      }
      return raw;
    }
  }
}

function asString(def: CustomFieldDefinition, raw: unknown): string {
  if (typeof raw !== 'string') {
    throw invalid(def, 'a text value');
  }
  return raw;
}

function invalid(def: CustomFieldDefinition, expected: string): BadRequestException {
  return new BadRequestException(
    `Custom field "${def.label}" must be ${expected}.`,
  );
}
