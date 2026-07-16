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

/// Leave (ESS): balances and requests bound to the real leave API. Balances
/// double as the type source for the request sheet, so the picker only offers
/// leave types that apply to the employee's entity.
class LeaveScreen extends StatefulWidget {
  const LeaveScreen({super.key});

  @override
  State<LeaveScreen> createState() => _LeaveScreenState();
}

class _LeaveScreenState extends State<LeaveScreen> {
  ApiClient? _api;
  bool _loading = true;
  String? _error;
  List<Map<String, dynamic>> _balances = const [];
  List<Map<String, dynamic>> _requests = const [];

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_api == null) {
      _api = AuthScope.of(context).api;
      _load();
    }
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final results = await Future.wait([
        _api!.getLeaveBalances(),
        _api!.getLeaveRequests(),
      ]);
      if (!mounted) return;
      setState(() {
        _balances = results[0];
        _requests = results[1];
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
    if (_balances.isEmpty) return;
    final submitted = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _LeaveRequestSheet(api: _api!, types: _balances),
    );
    if (submitted == true) {
      await _load();
    }
  }

  @override
  Widget build(BuildContext context) {
    return RefreshIndicator(
      onRefresh: _load,
      child: ListView(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.screenHPad,
          AppSpacing.screenTopPad,
          AppSpacing.screenHPad,
          AppSpacing.screenBottomPad,
        ),
        children: [
          Text('Leave', style: AppText.screenTitle),
          const SizedBox(height: 20),
          if (_loading)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 48),
              child: Center(child: CircularProgressIndicator()),
            )
          else if (_error != null)
            _errorCard()
          else ...[
            _balanceRow(),
            const SizedBox(height: 20),
            _requestButton(),
            const SectionHeader('Recent requests'),
            if (_requests.isEmpty)
              _emptyRequests()
            else
              ..._requests.map(_requestRow),
          ],
        ],
      ),
    );
  }

  Widget _errorCard() {
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Could not load leave', style: AppText.rowTitle),
          const SizedBox(height: 6),
          Text(
            _error!,
            style: AppText.label.copyWith(color: AppColors.mutedLight),
          ),
          const SizedBox(height: 12),
          Align(
            alignment: Alignment.centerLeft,
            child: FilledButton(onPressed: _load, child: const Text('Retry')),
          ),
        ],
      ),
    );
  }

  Widget _balanceRow() {
    if (_balances.isEmpty) {
      return AppCard(
        child: Text(
          'No leave types are configured for your entity.',
          style: AppText.label.copyWith(color: AppColors.mutedLight),
        ),
      );
    }
    final cards = <Widget>[];
    for (var i = 0; i < _balances.length; i++) {
      if (i > 0) cards.add(const SizedBox(width: AppSpacing.cardGap));
      final b = _balances[i];
      cards.add(
        Expanded(
          child: _BalanceCard(
            _num(b['remaining']),
            (b['name'] as String?) ?? '',
            highlight: i == 0,
          ),
        ),
      );
    }
    return Row(children: cards);
  }

  Widget _requestButton() {
    return GestureDetector(
      onTap: _openSheet,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 16),
        decoration: BoxDecoration(
          color: AppColors.ink,
          borderRadius: BorderRadius.circular(AppRadii.compact),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 22,
              height: 22,
              alignment: Alignment.center,
              decoration: const BoxDecoration(
                color: AppColors.accent,
                shape: BoxShape.circle,
              ),
              child: const Icon(Icons.add, size: 16, color: AppColors.ink),
            ),
            const SizedBox(width: 10),
            Text(
              'Request leave',
              style: AppText.rowTitle.copyWith(color: AppColors.surface),
            ),
          ],
        ),
      ),
    );
  }

  Widget _emptyRequests() {
    return AppCard(
      child: Text(
        'No leave requests yet.',
        style: AppText.label.copyWith(color: AppColors.mutedLight),
      ),
    );
  }

  Widget _requestRow(Map<String, dynamic> r) {
    final status = _pillStatus(r['status'] as String?);
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.cardGap),
      child: AppCard(
        child: Row(
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: AppColors.subtleFill,
                borderRadius: BorderRadius.circular(AppRadii.iconTile),
              ),
              child: const Icon(Icons.event_rounded, color: AppColors.ink),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '${r['typeName'] ?? 'Leave'} leave',
                    style: AppText.rowTitle,
                  ),
                  const SizedBox(height: 2),
                  Text('${_range(r)} - ${_days(r)}', style: AppText.label),
                ],
              ),
            ),
            StatusPill(_statusLabel(status), status: status),
          ],
        ),
      ),
    );
  }

  String _range(Map<String, dynamic> r) {
    final from = _fmtIso(r['startDate'] as String?);
    final to = _fmtIso(r['endDate'] as String?);
    return from == to ? from : '$from - $to';
  }

  String _days(Map<String, dynamic> r) {
    final d = _num(r['workingDays']);
    return '$d ${d == '1' ? 'day' : 'days'}';
  }

  String _statusLabel(PillStatus s) {
    switch (s) {
      case PillStatus.approved:
        return 'Approved';
      case PillStatus.pending:
        return 'Pending';
      case PillStatus.rejected:
        return 'Rejected';
      default:
        return 'Pending';
    }
  }
}

PillStatus _pillStatus(String? raw) {
  switch (raw) {
    case 'approved':
      return PillStatus.approved;
    case 'rejected':
      return PillStatus.rejected;
    default:
      return PillStatus.pending;
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

/// Formats a YYYY-MM-DD string as "Jun 24". Falls back to the raw value.
String _fmtIso(String? iso) {
  if (iso == null || iso.length < 10) return iso ?? '';
  final month = int.tryParse(iso.substring(5, 7));
  final day = int.tryParse(iso.substring(8, 10));
  if (month == null || day == null || month < 1 || month > 12) return iso;
  return '${_months[month - 1]} $day';
}

/// Renders a numeric field (int or double from the API) without a trailing .0.
String _num(dynamic value) {
  if (value is num) {
    return value == value.roundToDouble()
        ? value.toInt().toString()
        : value.toString();
  }
  return value?.toString() ?? '0';
}

class _BalanceCard extends StatelessWidget {
  const _BalanceCard(this.value, this.label, {this.highlight = false});
  final String value;
  final String label;
  final bool highlight;

  @override
  Widget build(BuildContext context) {
    final on = highlight ? AppColors.accentTextOnLime : AppColors.ink;
    return AppCard(
      color: highlight ? AppColors.accent : AppColors.surface,
      shadow: highlight ? AppShadows.limeButton : AppShadows.card,
      padding: const EdgeInsets.symmetric(vertical: 18, horizontal: 14),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(value, style: AppText.statNumber.copyWith(color: on)),
          const SizedBox(height: 4),
          Text(
            label,
            style: AppText.label.copyWith(
              color: highlight ? AppColors.accentTextOnLime : AppColors.muted,
            ),
          ),
        ],
      ),
    );
  }
}

class _LeaveRequestSheet extends StatefulWidget {
  const _LeaveRequestSheet({required this.api, required this.types});
  final ApiClient api;
  final List<Map<String, dynamic>> types;

  @override
  State<_LeaveRequestSheet> createState() => _LeaveRequestSheetState();
}

class _LeaveRequestSheetState extends State<_LeaveRequestSheet> {
  late String _typeId = widget.types.first['leaveTypeId'] as String;
  final TextEditingController _reason = TextEditingController();
  DateTime? _from;
  DateTime? _to;
  bool _submitting = false;
  String? _submitError;

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  int get _days {
    if (_from == null || _to == null) return 1;
    return _to!.difference(_from!).inDays.abs() + 1;
  }

  Future<void> _pick(bool isFrom) async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: isFrom ? (_from ?? now) : (_to ?? _from ?? now),
      firstDate: now.subtract(const Duration(days: 30)),
      lastDate: now.add(const Duration(days: 365)),
    );
    if (picked != null) {
      setState(() {
        if (isFrom) {
          _from = picked;
          if (_to != null && _to!.isBefore(picked)) _to = picked;
        } else {
          _to = picked;
        }
      });
    }
  }

  String _fmt(DateTime? d) =>
      d == null ? 'Select' : '${d.day}/${d.month}/${d.year}';

  String _iso(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-'
      '${d.month.toString().padLeft(2, '0')}-'
      '${d.day.toString().padLeft(2, '0')}';

  Future<void> _submit() async {
    if (_from == null || _to == null) {
      setState(() => _submitError = 'Select both start and end dates.');
      return;
    }
    setState(() {
      _submitting = true;
      _submitError = null;
    });
    final messenger = ScaffoldMessenger.of(context);
    try {
      final result = await widget.api.applyLeave({
        'leaveTypeId': _typeId,
        'startDate': _iso(_from!),
        'endDate': _iso(_to!),
        if (_reason.text.trim().isNotEmpty) 'reason': _reason.text.trim(),
      });
      if (!mounted) return;
      final conflicts = result['teamConflicts'];
      final warning = conflicts is List && conflicts.isNotEmpty
          ? ' Note: ${conflicts.length} teammate(s) are also off then.'
          : '';
      Navigator.of(context).pop(true);
      messenger.showSnackBar(
        SnackBar(content: Text('Leave request sent for approval.$warning')),
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _submitting = false;
        _submitError = e.message;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _submitting = false;
        _submitError = e.toString();
      });
    }
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
              Text('Request leave', style: AppText.screenTitle),
              const SizedBox(height: 16),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: widget.types.map((t) {
                  final id = t['leaveTypeId'] as String;
                  final selected = id == _typeId;
                  return GestureDetector(
                    onTap: () => setState(() => _typeId = id),
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
                        (t['name'] as String?) ?? '',
                        style: AppText.pill.copyWith(
                          color: selected
                              ? AppColors.accentTextOnLime
                              : AppColors.inkSecondary,
                        ),
                      ),
                    ),
                  );
                }).toList(),
              ),
              const SizedBox(height: 16),
              Row(
                children: [
                  Expanded(child: _dateField('From', _from, () => _pick(true))),
                  const SizedBox(width: 12),
                  Expanded(child: _dateField('To', _to, () => _pick(false))),
                ],
              ),
              const SizedBox(height: 12),
              _reasonField(),
              if (_submitError != null) ...[
                const SizedBox(height: 12),
                Text(
                  _submitError!,
                  style: AppText.label.copyWith(color: AppColors.dangerText),
                ),
              ],
              const SizedBox(height: 20),
              LimeButton(
                label: _submitting
                    ? 'Submitting...'
                    : 'Submit - $_days ${_days == 1 ? 'day' : 'days'}',
                expand: true,
                onPressed: _submitting ? null : _submit,
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _dateField(String label, DateTime? value, VoidCallback onTap) {
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
                Text(_fmt(value), style: AppText.rowTitle),
              ],
            ),
            const Icon(Icons.calendar_today_rounded, size: 18),
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
          hintText: 'Reason (optional)',
          hintStyle: AppText.label,
        ),
      ),
    );
  }
}
