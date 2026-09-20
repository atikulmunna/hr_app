import 'package:flutter_test/flutter_test.dart';
import 'package:hris/util/format.dart';

void main() {
  group('formatMoney', () {
    test('groups thousands and drops zero cents', () {
      expect(formatMoney(145000, 'BDT'), 'BDT 145,000');
      expect(formatMoney(999, 'SGD'), 'SGD 999');
      expect(formatMoney(1000, 'SGD'), 'SGD 1,000');
      expect(formatMoney(1234567.0, 'BDT'), 'BDT 1,234,567');
    });

    test('keeps two decimals when there are cents', () {
      expect(formatMoney(4250.5, 'SGD'), 'SGD 4,250.50');
      expect(formatMoney(0.07, 'SGD'), 'SGD 0.07');
    });

    test('handles negatives, nulls, and a missing currency', () {
      expect(formatMoney(-3500, 'BDT'), '-BDT 3,500');
      expect(formatMoney(null, 'BDT'), 'BDT 0');
      expect(formatMoney(12, null), '12');
      expect(formatMoney(12, ''), '12');
    });
  });

  group('dates', () {
    test('formatMonth and formatDayMonth read ISO dates', () {
      expect(formatMonth('2026-06-01'), 'June 2026');
      expect(formatDayMonth('2026-06-28'), '28 Jun');
    });

    test('tolerate null and garbage', () {
      expect(formatMonth(null), '');
      expect(formatMonth('not a date'), '');
      expect(formatDayMonth(null), '');
    });
  });

  test('formatHours shows whole hours plainly and fractions to one place', () {
    expect(formatHours(12), '12h');
    expect(formatHours(6.5), '6.5h');
    expect(formatHours(6.25), '6.3h');
    expect(formatHours(null), '0h');
  });
}
