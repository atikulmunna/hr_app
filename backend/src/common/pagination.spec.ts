import { BadRequestException } from '@nestjs/common';
import { pageOf, parsePage } from './pagination';

describe('parsePage', () => {
  it('defaults to the first page when nothing is asked for', () => {
    expect(parsePage({})).toEqual({ limit: 50, offset: 0 });
    expect(parsePage({ limit: '', offset: '' })).toEqual({
      limit: 50,
      offset: 0,
    });
  });

  it('reads a limit and offset from the query string', () => {
    expect(parsePage({ limit: '25', offset: '100' })).toEqual({
      limit: 25,
      offset: 100,
    });
  });

  it('clamps an oversized limit instead of refusing it', () => {
    // The cap is what stops a growing collection being returned whole; a caller
    // asking for more is given the maximum, and the response says what it got.
    expect(parsePage({ limit: '5000' }).limit).toBe(200);
    expect(parsePage({ limit: '5000' }, { max: 500 }).limit).toBe(500);
  });

  it('honours a per-endpoint default', () => {
    expect(parsePage({}, { limit: 10 })).toEqual({ limit: 10, offset: 0 });
    expect(parsePage({ limit: '30' }, { limit: 10 }).limit).toBe(30);
  });

  it('treats a blank value as absent rather than as zero', () => {
    // Number(' ') is 0, which would silently return an empty page.
    expect(parsePage({ limit: '  ', offset: '  ' })).toEqual({
      limit: 50,
      offset: 0,
    });
  });

  it('accepts an explicit zero for either value', () => {
    expect(parsePage({ limit: '0', offset: '0' })).toEqual({
      limit: 0,
      offset: 0,
    });
  });

  it.each(['-1', 'abc', '1.5', 'Infinity'])(
    'rejects %p with the field named',
    (bad) => {
      expect(() => parsePage({ limit: bad })).toThrow(BadRequestException);
      expect(() => parsePage({ limit: bad })).toThrow(
        'limit must be a whole number of zero or more.',
      );
      expect(() => parsePage({ offset: bad })).toThrow(
        'offset must be a whole number of zero or more.',
      );
    },
  );
});

describe('pageOf', () => {
  it('echoes the applied window alongside the rows and the total', () => {
    expect(pageOf(['a', 'b'], 57, { limit: 2, offset: 10 })).toEqual({
      items: ['a', 'b'],
      total: 57,
      limit: 2,
      offset: 10,
    });
  });

  it('reports a total larger than the page, so a caller knows more remains', () => {
    const page = pageOf([1], 99, { limit: 1, offset: 0 });
    expect(page.items).toHaveLength(1);
    expect(page.total).toBe(99);
    expect(page.offset + page.items.length).toBeLessThan(page.total);
  });
});
