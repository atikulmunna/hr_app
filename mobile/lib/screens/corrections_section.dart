import 'package:flutter/material.dart';
import '../api/api_client.dart';
import '../auth/auth_scope.dart';
import '../theme/app_colors.dart';
import '../theme/app_dimens.dart';
import '../theme/app_typography.dart';
import '../widgets/app_card.dart';
import '../widgets/lime_button.dart';
import '../widgets/section_header.dart';
import '../widgets/status_pill.dart';

/// Attendance corrections (ESS regularization, T-1E.3). A self-contained
/// section for the Attendance screen: it lists the employee's own correction
/// requests and opens a sheet to raise a new one against the real backend.
class CorrectionsSection extends StatefulWidget {
  const CorrectionsSection({super.key, this.refreshSignal});

  /// Fires when the parent screen is pulled to refresh, so the section reloads.
  final Listenable? refreshSignal;

  @override
  State<CorrectionsSection> createState() => _CorrectionsSectionState();
}

class _CorrectionsSectionState extends State<CorrectionsSection> {
  ApiClient? _api;
  bool _loading = true;
  String? _error;
  List<Map<String, dynamic>> _requests = const [];

  void _onRefresh() => _load();

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_api == null) {
      _api = AuthScope.of(context).api;
      widget.refreshSignal?.addListener(_onRefresh);
      _load();
    }
  }

  @override
  void dispose() {
    widget.refreshSignal?.removeListener(_onRefresh);
    super.dispose();
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final list = await _api!.getRegularizations();
      if (!mounted) return;
      setState(() {
        _requests = list;
        _loading = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  Future<void> _openSheet() async {
    final submitted = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _CorrectionSheet(api: _api!),
    );
    if (submitted == true) await _load();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SectionHeader('Corrections'),
        _requestButton(),
        const SizedBox(height: AppSpacing.cardGap),
        if (_loading)
          const Padding(
            padding: EdgeInsets.symmetric(vertical: 16),
            child: Center(child: CircularProgressIndicator()),
          )
        else if (_error != null)
          AppCard(
            child: Text(
              _error!,
              style: AppText.label.copyWith(color: AppColors.mutedLight),
            ),
          )
        else if (_requests.isEmpty)
          AppCard(
            child: Text(
              'No correction requests. If you missed a check-in or check-out, '
              'request a correction for HR review.',
              style: AppText.label.copyWith(color: AppColors.mutedLight),
            ),
          )
        else
          ..._requests.map(_row),
      ],
    );
  }

  Widget _requestButton() {
    return GestureDetector(
      onTap: _openSheet,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 14),
        decoration: BoxDecoration(
          color: AppColors.subtleFill,
          borderRadius: BorderRadius.circular(AppRadii.compact),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(
              Icons.edit_calendar_outlined,
              size: 18,
              color: AppColors.ink,
            ),
            const SizedBox(width: 8),
            Text('Request a correction', style: AppText.rowTitle),
          ],
        ),
      ),
    );
  }

  Widget _row(Map<String, dynamic> r) {
    final status = _pillStatus(r['status'] as String?);
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.cardGap),
      child: AppCard(
        child: Row(
          children: [
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    _typeLabel(r['correctionType'] as String?),
                    style: AppText.rowTitle,
                  ),
                  const SizedBox(height: 2),
                  Text(
                    '${_fmtIso(r['targetDate'] as String?)}'
                    '${_origin(r['origin'] as String?)}',
                    style: AppText.label,
                  ),
                ],
              ),
            ),
            StatusPill(_statusLabel(status), status: status),
          ],
        ),
      ),
    );
  }

  String _origin(String? origin) => origin == 'admin' ? ' - by HR' : '';
}

String _typeLabel(String? type) {
  switch (type) {
    case 'missing_check_in':
      return 'Missing check-in';
    case 'missing_check_out':
      return 'Missing check-out';
    case 'both':
      return 'Missing check-in and check-out';
    default:
      return 'Correction';
  }
}

PillStatus _pillStatus(String? raw) {
  switch (raw) {
    case 'approved':
    case 'applied':
      return PillStatus.approved;
    case 'rejected':
      return PillStatus.rejected;
    default:
      return PillStatus.pending;
  }
}

String _statusLabel(PillStatus s) {
  switch (s) {
    case PillStatus.approved:
      return 'Applied';
    case PillStatus.rejected:
      return 'Rejected';
    default:
      return 'Pending';
  }
}

const _months = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

String _fmtIso(String? iso) {
  if (iso == null || iso.length < 10) return iso ?? '';
  final month = int.tryParse(iso.substring(5, 7));
  final day = int.tryParse(iso.substring(8, 10));
  if (month == null || day == null || month < 1 || month > 12) return iso;
  return '${_months[month - 1]} $day';
}

class _CorrectionSheet extends StatefulWidget {
  const _CorrectionSheet({required this.api});
  final ApiClient api;

  @override
  State<_CorrectionSheet> createState() => _CorrectionSheetState();
}

class _CorrectionSheetState extends State<_CorrectionSheet> {
  // Backend correction types.
  static const _types = <(String, String)>[
    ('missing_check_in', 'Check-in'),
    ('missing_check_out', 'Check-out'),
    ('both', 'Both'),
  ];

  String _type = 'missing_check_in';
  DateTime? _date;
  TimeOfDay? _checkIn;
  TimeOfDay? _checkOut;
  final TextEditingController _reason = TextEditingController();
  bool _submitting = false;

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  bool get _needsIn => _type != 'missing_check_out';
  bool get _needsOut => _type != 'missing_check_in';

  Future<void> _pickDate() async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: _date ?? now.subtract(const Duration(days: 1)),
      firstDate: now.subtract(const Duration(days: 90)),
      lastDate: now,
    );
    if (picked != null) setState(() => _date = picked);
  }

  Future<void> _pickTime(bool isIn) async {
    final picked = await showTimePicker(
      context: context,
      initialTime:
          (isIn ? _checkIn : _checkOut) ??
          TimeOfDay(hour: isIn ? 9 : 18, minute: 0),
    );
    if (picked != null) {
      setState(() {
        if (isIn) {
          _checkIn = picked;
        } else {
          _checkOut = picked;
        }
      });
    }
  }

  // Builds an ISO instant on the target date in UTC, so its UTC calendar day
  // matches targetDate exactly (the backend validates times against the UTC
  // day of targetDate).
  String _isoOnDate(DateTime date, TimeOfDay time) {
    final d =
        '${date.year.toString().padLeft(4, '0')}-'
        '${date.month.toString().padLeft(2, '0')}-'
        '${date.day.toString().padLeft(2, '0')}';
    final t =
        '${time.hour.toString().padLeft(2, '0')}:'
        '${time.minute.toString().padLeft(2, '0')}:00.000Z';
    return '${d}T$t';
  }

  String _dateIso(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-'
      '${d.month.toString().padLeft(2, '0')}-'
      '${d.day.toString().padLeft(2, '0')}';

  Future<void> _submit() async {
    if (_date == null) {
      _snack('Select the day to correct.');
      return;
    }
    if (_needsIn && _checkIn == null) {
      _snack('Enter the check-in time.');
      return;
    }
    if (_needsOut && _checkOut == null) {
      _snack('Enter the check-out time.');
      return;
    }
    if (_reason.text.trim().isEmpty) {
      _snack('A reason is required.');
      return;
    }
    setState(() => _submitting = true);
    final messenger = ScaffoldMessenger.of(context);
    try {
      await widget.api.submitRegularization({
        'targetDate': _dateIso(_date!),
        'correctionType': _type,
        if (_needsIn) 'requestedCheckIn': _isoOnDate(_date!, _checkIn!),
        if (_needsOut) 'requestedCheckOut': _isoOnDate(_date!, _checkOut!),
        'reason': _reason.text.trim(),
      });
      if (!mounted) return;
      Navigator.of(context).pop(true);
      messenger.showSnackBar(
        const SnackBar(
          content: Text('Correction sent to your manager for approval.'),
        ),
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() => _submitting = false);
      _snack(e.message);
    } catch (e) {
      if (!mounted) return;
      setState(() => _submitting = false);
      _snack(e.toString());
    }
  }

  void _snack(String message) {
    ScaffoldMessenger.of(
      context,
    ).showSnackBar(SnackBar(content: Text(message)));
  }

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
      ),
      child: Container(
        decoration: const BoxDecoration(
          color: AppColors.screenBg,
          borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
        ),
        padding: const EdgeInsets.fromLTRB(18, 12, 18, 24),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 42,
                  height: 5,
                  decoration: BoxDecoration(
                    color: AppColors.mutedLight,
                    borderRadius: BorderRadius.circular(3),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Text('Request a correction', style: AppText.screenTitle),
              const SizedBox(height: 8),
              Text(
                'For a past day you forgot to mark. Your manager reviews it.',
                style: AppText.label.copyWith(color: AppColors.mutedLight),
              ),
              const SizedBox(height: 16),
              Row(
                children: _types.map((t) {
                  final selected = t.$1 == _type;
                  return Padding(
                    padding: const EdgeInsets.only(right: 8),
                    child: GestureDetector(
                      onTap: () => setState(() => _type = t.$1),
                      child: Container(
                        padding: const EdgeInsets.symmetric(
                          horizontal: 16,
                          vertical: 10,
                        ),
                        decoration: BoxDecoration(
                          color: selected
                              ? AppColors.accent
                              : AppColors.subtleFill,
                          borderRadius: BorderRadius.circular(AppRadii.pill),
                        ),
                        child: Text(
                          t.$2,
                          style: AppText.pill.copyWith(
                            color: selected
                                ? AppColors.accentTextOnLime
                                : AppColors.inkSecondary,
                          ),
                        ),
                      ),
                    ),
                  );
                }).toList(),
              ),
              const SizedBox(height: 16),
              _field(
                'Day',
                _date == null ? 'Select' : _fmtIso(_dateIso(_date!)),
                Icons.calendar_today_rounded,
                _pickDate,
              ),
              if (_needsIn) ...[
                const SizedBox(height: 12),
                _field(
                  'Check-in time',
                  _fmtTime(_checkIn),
                  Icons.login_rounded,
                  () => _pickTime(true),
                ),
              ],
              if (_needsOut) ...[
                const SizedBox(height: 12),
                _field(
                  'Check-out time',
                  _fmtTime(_checkOut),
                  Icons.logout_rounded,
                  () => _pickTime(false),
                ),
              ],
              const SizedBox(height: 12),
              _reasonField(),
              const SizedBox(height: 20),
              LimeButton(
                label: _submitting ? 'Submitting...' : 'Submit correction',
                expand: true,
                onPressed: _submitting ? null : _submit,
              ),
            ],
          ),
        ),
      ),
    );
  }

  String _fmtTime(TimeOfDay? t) {
    if (t == null) return 'Select';
    final h = t.hour % 12 == 0 ? 12 : t.hour % 12;
    final m = t.minute.toString().padLeft(2, '0');
    final period = t.hour < 12 ? 'AM' : 'PM';
    return '$h:$m $period';
  }

  Widget _field(String label, String value, IconData icon, VoidCallback onTap) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 14),
        decoration: BoxDecoration(
          color: AppColors.surface,
          borderRadius: BorderRadius.circular(AppRadii.compact),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(label, style: AppText.label.copyWith(fontSize: 12)),
                const SizedBox(height: 2),
                Text(value, style: AppText.rowTitle),
              ],
            ),
            Icon(icon, size: 18),
          ],
        ),
      ),
    );
  }

  Widget _reasonField() {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(AppRadii.compact),
      ),
      child: TextField(
        controller: _reason,
        maxLines: 2,
        style: AppText.body.copyWith(color: AppColors.ink),
        decoration: InputDecoration(
          border: InputBorder.none,
          hintText: 'Reason (required)',
          hintStyle: AppText.label,
        ),
      ),
    );
  }
}
