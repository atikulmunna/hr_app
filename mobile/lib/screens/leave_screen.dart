import 'package:flutter/material.dart';
import '../theme/app_colors.dart';
import '../theme/app_dimens.dart';
import '../theme/app_typography.dart';
import '../widgets/app_card.dart';
import '../widgets/lime_button.dart';
import '../widgets/section_header.dart';
import '../widgets/status_pill.dart';

class LeaveRequest {
  const LeaveRequest(this.type, this.dates, this.days, this.status);
  final String type;
  final String dates;
  final String days;
  final PillStatus status;
}

class LeaveScreen extends StatefulWidget {
  const LeaveScreen({super.key});

  @override
  State<LeaveScreen> createState() => _LeaveScreenState();
}

class _LeaveScreenState extends State<LeaveScreen> {
  final List<LeaveRequest> _recent = [
    const LeaveRequest('Annual', 'Jun 24 - Jun 25', '2 days', PillStatus.approved),
    const LeaveRequest('Sick', 'Jun 10', '1 day', PillStatus.approved),
    const LeaveRequest('Casual', 'May 30', '1 day', PillStatus.rejected),
  ];

  Future<void> _openSheet() async {
    final created = await showModalBottomSheet<LeaveRequest>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => const _LeaveRequestSheet(),
    );
    if (created != null) {
      setState(() => _recent.insert(0, created));
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListView(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenHPad,
        AppSpacing.screenTopPad,
        AppSpacing.screenHPad,
        AppSpacing.screenBottomPad,
      ),
      children: [
        Text('Leave', style: AppText.screenTitle),
        const SizedBox(height: 20),
        Row(
          children: const [
            Expanded(child: _BalanceCard('12.5', 'Annual', highlight: true)),
            SizedBox(width: AppSpacing.cardGap),
            Expanded(child: _BalanceCard('8', 'Sick')),
            SizedBox(width: AppSpacing.cardGap),
            Expanded(child: _BalanceCard('3', 'Casual')),
          ],
        ),
        const SizedBox(height: 20),
        _requestButton(),
        const SectionHeader('Recent requests'),
        ..._recent.map(_requestRow),
      ],
    );
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

  Widget _requestRow(LeaveRequest r) {
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
                  Text('${r.type} leave', style: AppText.rowTitle),
                  const SizedBox(height: 2),
                  Text('${r.dates} - ${r.days}', style: AppText.label),
                ],
              ),
            ),
            StatusPill(_statusLabel(r.status), status: r.status),
          ],
        ),
      ),
    );
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
        return '';
    }
  }
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
  const _LeaveRequestSheet();

  @override
  State<_LeaveRequestSheet> createState() => _LeaveRequestSheetState();
}

class _LeaveRequestSheetState extends State<_LeaveRequestSheet> {
  String _type = 'Annual';
  DateTime? _from;
  DateTime? _to;

  int get _days {
    if (_from == null || _to == null) return 1;
    return _to!.difference(_from!).inDays.abs() + 1;
  }

  Future<void> _pick(bool isFrom) async {
    final now = DateTime.now();
    final picked = await showDatePicker(
      context: context,
      initialDate: now,
      firstDate: now.subtract(const Duration(days: 30)),
      lastDate: now.add(const Duration(days: 365)),
    );
    if (picked != null) {
      setState(() {
        if (isFrom) {
          _from = picked;
        } else {
          _to = picked;
        }
      });
    }
  }

  String _fmt(DateTime? d) =>
      d == null ? 'Select' : '${d.day}/${d.month}/${d.year}';

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
            Row(
              children: ['Annual', 'Sick', 'Casual'].map((t) {
                final selected = t == _type;
                return Padding(
                  padding: const EdgeInsets.only(right: 8),
                  child: GestureDetector(
                    onTap: () => setState(() => _type = t),
                    child: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 16,
                        vertical: 10,
                      ),
                      decoration: BoxDecoration(
                        color:
                            selected ? AppColors.accent : AppColors.subtleFill,
                        borderRadius: BorderRadius.circular(AppRadii.pill),
                      ),
                      child: Text(
                        t,
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
            Row(
              children: [
                Expanded(child: _dateField('From', _from, () => _pick(true))),
                const SizedBox(width: 12),
                Expanded(child: _dateField('To', _to, () => _pick(false))),
              ],
            ),
            const SizedBox(height: 12),
            _reasonField(),
            const SizedBox(height: 20),
            LimeButton(
              label: 'Submit - $_days ${_days == 1 ? 'day' : 'days'}',
              expand: true,
              onPressed: () {
                Navigator.of(context).pop(
                  LeaveRequest(
                    _type,
                    '${_fmt(_from)} - ${_fmt(_to)}',
                    '$_days ${_days == 1 ? 'day' : 'days'}',
                    PillStatus.pending,
                  ),
                );
              },
            ),
          ],
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
