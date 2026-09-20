// Small display formatters shared by the screens. No intl dependency: the app
// shows one locale and the backend already sends ISO dates and plain numbers.

const _months = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/// "BDT 145,000" or "SGD 4,250.50". Whole amounts drop the decimals.
String formatMoney(num? amount, String? currency) {
  final value = (amount ?? 0).toDouble();
  final abs = value.abs();
  final whole = abs.truncate();
  final cents = ((abs - whole) * 100).round();
  final digits = whole.toString();
  final buffer = StringBuffer();
  for (var i = 0; i < digits.length; i++) {
    if (i > 0 && (digits.length - i) % 3 == 0) buffer.write(',');
    buffer.write(digits[i]);
  }
  final number = cents == 0
      ? buffer.toString()
      : '$buffer.${cents.toString().padLeft(2, '0')}';
  final sign = value < 0 ? '-' : '';
  return currency == null || currency.isEmpty
      ? '$sign$number'
      : '$sign$currency $number';
}

/// "June 2026" from an ISO date.
String formatMonth(String? iso) {
  final d = iso == null ? null : DateTime.tryParse(iso);
  if (d == null) return '';
  return '${_monthName(d.month)} ${d.year}';
}

/// "28 Jun" from an ISO date.
String formatDayMonth(String? iso) {
  final d = iso == null ? null : DateTime.tryParse(iso);
  if (d == null) return '';
  return '${d.day} ${_months[d.month - 1]}';
}

String _monthName(int month) {
  const names = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];
  return names[month - 1];
}

/// "12h" or "6.5h" for a decimal hours figure.
String formatHours(num? hours) {
  final h = (hours ?? 0).toDouble();
  return h == h.roundToDouble() ? '${h.round()}h' : '${h.toStringAsFixed(1)}h';
}
