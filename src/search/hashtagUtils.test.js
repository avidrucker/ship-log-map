import { extractHashtagsFromText, normalizeTag, tokenizeQuery } from './hashtagUtils.js';

// ---------------------------------------------------------------------------
// extractHashtagsFromText — behavioral safety net
// These tests remain GREEN before and after moving HASHTAG_RE inside the function.
// ---------------------------------------------------------------------------
describe('extractHashtagsFromText', () => {
  test('returns all hashtags found in a string', () => {
    expect(extractHashtagsFromText('Hello #world and #foo')).toEqual(
      expect.arrayContaining(['world', 'foo'])
    );
  });

  test('returns empty array when text has no hashtags', () => {
    expect(extractHashtagsFromText('no tags here')).toEqual([]);
  });

  test('returns empty array for empty string', () => {
    expect(extractHashtagsFromText('')).toEqual([]);
  });

  test('returns empty array for null/undefined input', () => {
    expect(extractHashtagsFromText(null)).toEqual([]);
    expect(extractHashtagsFromText(undefined)).toEqual([]);
  });

  test('deduplicates repeated hashtags', () => {
    const result = extractHashtagsFromText('#alpha text #alpha more #alpha');
    expect(result.filter(t => t === 'alpha')).toHaveLength(1);
  });

  test('called multiple times in sequence, each call returns independent correct results', () => {
    const first  = extractHashtagsFromText('note one #exploration');
    const second = extractHashtagsFromText('note two #mystery');
    const third  = extractHashtagsFromText('note three #ghost and #exploration');

    expect(first).toContain('exploration');
    expect(second).toContain('mystery');
    expect(third).toContain('ghost');
    expect(third).toContain('exploration');
  });

  test('normalizes tags to lowercase', () => {
    expect(extractHashtagsFromText('#UPPER #MixedCase')).toEqual(
      expect.arrayContaining(['upper', 'mixedcase'])
    );
  });
});

// ---------------------------------------------------------------------------
// normalizeTag
// ---------------------------------------------------------------------------
describe('normalizeTag', () => {
  test('strips leading # and lowercases', () => {
    expect(normalizeTag('#FooBar')).toBe('foobar');
  });

  test('lowercases without # prefix', () => {
    expect(normalizeTag('FooBar')).toBe('foobar');
  });
});

// ---------------------------------------------------------------------------
// tokenizeQuery
// ---------------------------------------------------------------------------
describe('tokenizeQuery', () => {
  test('splits on whitespace', () => {
    expect(tokenizeQuery('foo bar baz')).toEqual(['foo', 'bar', 'baz']);
  });

  test('preserves # on hashtag tokens', () => {
    expect(tokenizeQuery('#tag1 #tag2')).toEqual(['#tag1', '#tag2']);
  });

  test('preserves single-word quoted tokens', () => {
    // Note: multi-word quoted strings like "Ash Twin" are split on the internal
    // space by tokenizeQuery. That is a known limitation, not tested here.
    expect(tokenizeQuery('"singleton" #mystery')).toEqual(['"singleton"', '#mystery']);
  });

  test('returns empty array for empty / null input', () => {
    expect(tokenizeQuery('')).toEqual([]);
    expect(tokenizeQuery(null)).toEqual([]);
  });
});
