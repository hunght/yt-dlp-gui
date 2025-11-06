import { addNumbers, getString } from '../test-hook';

describe('test-hook', () => {
  test('addNumbers should add two numbers', () => {
    const result = addNumbers(2, 3);
    // This test will FAIL
    expect(result).toBe(5);
  });

  test('getString should return a string', () => {
    const result = getString();
    // This test will FAIL
    expect(result).toBe('hello');
  });
});

