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

  // The cap matches firestore.rules (#7).
  it('accepts 254 characters and rejects 255', () => {
    const address = (length) => `${'a'.repeat(length - '@example.com'.length)}@example.com`;
    expect(validateEmail(address(254))).toEqual({ success: true });
    expect(validateEmail(address(255))).toMatchObject({
      success: false,
      error: 'Email must be at most 254 characters',
      field: 'email',
    });
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

  it('accepts 200 characters and rejects 201', () => {
    expect(validateName('a'.repeat(200))).toEqual({ success: true });
    expect(validateName('a'.repeat(201))).toMatchObject({
      success: false,
      error: 'Name must be at most 200 characters',
      field: 'name',
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

  it('accepts 100 characters and rejects 101', () => {
    expect(validateGroupId('g'.repeat(100))).toEqual({ success: true });
    expect(validateGroupId('g'.repeat(101))).toMatchObject({
      success: false,
      error: 'Group ID must be at most 100 characters',
      field: 'groupId',
    });
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
