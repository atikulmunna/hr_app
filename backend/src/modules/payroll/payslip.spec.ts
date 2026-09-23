import { inflateSync } from 'node:zlib';
import { RunEmployeeView, RunView } from './payroll-run.service';
import { render } from './payslip.service';

// The payslip is rendered with pdfkit, whose 0.x releases can change behaviour
// in a minor bump. These tests render a real document and assert the bytes are
// a valid PDF carrying the expected text, so a dependency bump cannot silently
// break payslips.

function row(overrides: Partial<RunEmployeeView> = {}): RunEmployeeView {
  return {
    employeeId: 'e1',
    employeeCode: 'EMP-006',
    name: 'Karim Hasan',
    currencyCode: 'BDT',
    payableDays: 31,
    periodDays: 31,
    prorationFactor: 1,
    presentDays: 21,
    absentDays: 0,
    leaveDays: 0,
    workedHours: 168,
    overtimeHours: 0,
    overtimeAmount: 0,
    gross: 60000,
    deductions: 9062.5,
    adjustments: 0,
    net: 50937.5,
    employerContributions: 0,
    lines: [
      {
        code: 'BASIC',
        name: 'Basic salary',
        componentType: 'basic',
        source: 'structure',
        baseAmount: 60000,
        prorationFactor: 1,
        amount: 60000,
      },
      {
        code: 'TAX',
        name: 'Income tax',
        componentType: 'deduction',
        source: 'statutory',
        baseAmount: 3062.5,
        prorationFactor: 1,
        amount: 3062.5,
      },
    ],
    adjustmentLines: [],
    ...overrides,
  };
}

function run(overrides: Partial<RunView> = {}): RunView {
  return {
    id: 'r1',
    periodStart: '2026-07-01',
    periodEnd: '2026-07-31',
    currencyCode: 'BDT',
    status: 'approved',
    prorationBasis: 'calendar_days',
    legalEntityId: 'le1',
    ...overrides,
  } as RunView;
}

const CR = String.fromCharCode(13);
const LF = String.fromCharCode(10);

// Recovers the text drawn into a pdfkit document, so these tests assert on
// content rather than byte count. Two layers have to be undone: the content
// streams are Flate-compressed, and within them pdfkit writes text as hex
// strings inside TJ arrays, split wherever it applies kerning
// (`[<50> 40 <61> 30 <79736c6970>] TJ` is "Payslip"). Inflating with node:zlib
// and decoding the hex runs keeps this free of a PDF-parsing dependency.
function pdfText(buffer: Buffer): string {
  const raw = buffer.toString('latin1');
  let streams = '';
  let from = 0;
  for (;;) {
    const start = raw.indexOf('stream', from);
    if (start === -1) break;
    const end = raw.indexOf('endstream', start);
    if (end === -1) break;
    // Skip past "stream" and the end-of-line that must follow it.
    let body = start + 'stream'.length;
    if (raw[body] === CR) body += 1;
    if (raw[body] === LF) body += 1;
    try {
      streams += inflateSync(buffer.subarray(body, end)).toString('latin1');
    } catch {
      // Not a Flate stream (an embedded font, say); nothing to read here.
    }
    from = end + 'endstream'.length;
  }
  // Each `[...] TJ` array is one run of text; concatenate just its hex pieces
  // so the kerning offsets between them do not break up the words.
  const runs: string[] = [];
  for (const [, body] of streams.matchAll(/\[([^\]]*)\]\s*TJ/g)) {
    let line = '';
    for (const [, hex] of body.matchAll(/<([0-9a-fA-F]*)>/g)) {
      line += Buffer.from(hex, 'hex').toString('latin1');
    }
    runs.push(line);
  }
  return runs.join('\n');
}

describe('payslip render', () => {
  it('produces a well-formed PDF', async () => {
    const pdf = await render(
      run(),
      row(),
      'Oasis Corp Bangladesh',
      'Operations Lead',
    );
    expect(Buffer.isBuffer(pdf)).toBe(true);
    expect(pdf.length).toBeGreaterThan(800);
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(pdf.subarray(-1024).toString('latin1')).toContain('%%EOF');
  });

  it('carries the employee, period, and entity onto the page', async () => {
    const text = pdfText(
      await render(run(), row(), 'Oasis Corp Bangladesh', 'Operations Lead'),
    );
    expect(text).toContain('Payslip');
    expect(text).toContain('Karim Hasan');
    expect(text).toContain('EMP-006');
    expect(text).toContain('Oasis Corp Bangladesh');
    expect(text).toContain('2026-07-01');
  });

  it('marks an unapproved run as provisional', async () => {
    const approved = pdfText(await render(run(), row(), 'Entity', ''));
    expect(approved).not.toContain('Provisional');
    const locked = pdfText(
      await render(run({ status: 'locked' }), row(), 'Entity', ''),
    );
    expect(locked).toContain('Provisional');
  });

  it('notes proration when the employee did not work the whole period', async () => {
    const full = pdfText(await render(run(), row(), 'Entity', ''));
    expect(full).not.toContain('Prorated');
    const partial = pdfText(
      await render(
        run(),
        row({ prorationFactor: 0.5, payableDays: 15 }),
        'Entity',
        '',
      ),
    );
    expect(partial).toContain('Prorated for 15 of 31 days');
  });

  it('renders overtime, adjustments, and employer contributions only when present', async () => {
    const plain = pdfText(await render(run(), row(), 'Entity', ''));
    expect(plain).not.toContain('Overtime');
    expect(plain).not.toContain('Adjustments');

    const rich = pdfText(
      await render(
        run(),
        row({
          overtimeHours: 6.5,
          overtimeAmount: 2500,
          employerContributions: 6000,
          adjustmentLines: [
            { reason: 'June underpayment', amount: 1200, sourceRunId: null },
            { reason: 'Advance recovery', amount: -500, sourceRunId: null },
          ],
        }),
        'Entity',
        '',
      ),
    );
    expect(rich).toContain('Overtime');
    expect(rich).toContain('Adjustments');
    expect(rich).toContain('June underpayment');
    expect(rich).toContain('Advance recovery');
    expect(rich).toContain('Employer contributions');
  });

  it('says None when there are no deductions', async () => {
    const text = pdfText(
      await render(run(), row({ lines: [], deductions: 0 }), 'Entity', ''),
    );
    expect(text).toContain('None');
  });
});
