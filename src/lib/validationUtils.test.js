import { describe, it, expect } from 'vitest';
import {
  validateEmail,
  validateName,
  validateGroupId,
  validateNotes,
  validateBookingForm,
} from './validationUtils';

describe('validateEmail', () => {
  it('accepts a well-formed address', () => {
    expect(validateEmail('user@example.com')).toEqual({ success: true });
  });

  it('requires a value', () => {
    expect(validateEmail('   ')).toEqual({
      success: false,
      error: 'Email is required',
      field: 'email',
    });
  });

  it('rejects an address without a domain', () => {
    expect(validateEmail('user@')).toMatchObject({ success: false, field: 'email' });
  });
});

describe('validateName', () => {
  it('accepts letters, spaces, hyphens and apostrophes', () => {
    expect(validateName("Anne-Marie O'Neil")).toEqual({ success: true });
  });

  it('rejects names shorter than 2 characters', () => {
    expect(validateName(' a ')).toMatchObject({
      success: false,
      error: 'Name must be at least 2 characters',
    });
  });

  it('rejects digits and symbols', () => {
    expect(validateName('R2-D2')).toMatchObject({
      success: false,
      error: 'Name contains invalid characters',
    });
  });
});

describe('validateGroupId', () => {
  it('treats an empty group ID as valid because it is optional', () => {
    expect(validateGroupId('')).toEqual({ success: true });
  });

  it('rejects characters outside letters, digits, hyphen and underscore', () => {
    expect(validateGroupId('group 1')).toMatchObject({ success: false, field: 'groupId' });
  });
});

describe('validateNotes', () => {
  it('accepts notes of exactly 500 characters', () => {
    expect(validateNotes('a'.repeat(500))).toEqual({ success: true });
  });

  it('rejects notes longer than 500 characters', () => {
    expect(validateNotes('a'.repeat(501))).toMatchObject({ success: false, field: 'notes' });
  });
});

describe('validateBookingForm', () => {
  const valid = { email: 'user@example.com', name: 'Jane Doe', groupId: 'team_1', notes: '' };

  it('accepts a complete, valid form', () => {
    expect(validateBookingForm(valid)).toEqual({ success: true });
  });

  it('reports the first invalid field', () => {
    expect(validateBookingForm({ ...valid, email: 'bad', name: '' })).toMatchObject({
      field: 'email',
    });
    expect(validateBookingForm({ ...valid, name: 'J' })).toMatchObject({ field: 'name' });
  });
});
