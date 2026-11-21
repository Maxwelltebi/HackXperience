import { describe, expect, it } from 'vitest';
import { toCsv } from './csv';

describe('toCsv', () => {
  it('writes rows with CRLF and quotes only where needed', () => {
    expect(
      toCsv([
        ['section', 'item', 'count'],
        ['overview', 'applicants', 12],
        ['school', null, 3],
      ]),
    ).toBe('section,item,count\r\noverview,applicants,12\r\nschool,,3\r\n');
  });

  it('quotes commas, quotes and line breaks', () => {
    expect(toCsv([['Accra, Ghana', 'He said "hi"', 'two\nlines']])).toBe(
      '"Accra, Ghana","He said ""hi""","two\nlines"\r\n',
    );
  });

  it('defuses spreadsheet formulas', () => {
    expect(toCsv([['=HYPERLINK("http://x")', '+1', '-2', '@SUM(A1)', 'safe']])).toBe(
      `"'=HYPERLINK(""http://x"")",'+1,'-2,'@SUM(A1),safe\r\n`,
    );
  });

  it('keeps negative numbers as numbers', () => {
    expect(toCsv([[-1.5, Number.NaN]])).toBe('-1.5,\r\n');
  });
});
