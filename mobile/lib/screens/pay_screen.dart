import 'package:flutter/material.dart';
import '../api/api_client.dart';
import '../auth/auth_scope.dart';
import '../theme/app_colors.dart';
import '../theme/app_dimens.dart';
import '../theme/app_typography.dart';
import '../util/format.dart';
import '../widgets/app_card.dart';
import '../widgets/dark_hero_card.dart';
import '../widgets/section_header.dart';

/// Pay (ESS, FR-M9-02): the employee's payslips from locked or approved runs.
/// The hero shows the latest one; its breakdown is fetched on demand.
class PayScreen extends StatefulWidget {
  const PayScreen({super.key});

  @override
  State<PayScreen> createState() => _PayScreenState();
}

class _PayScreenState extends State<PayScreen> {
  ApiClient? _api;
  bool _loading = true;
  String? _error;
  List<Map<String, dynamic>> _payslips = const [];

  // The breakdown of the payslip currently expanded, keyed by run id.
  String? _openRunId;
  Map<String, dynamic>? _detail;
  bool _detailLoading = false;
  String? _detailError;

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
      final payslips = await _api!.getPayslips();
      if (!mounted) return;
      setState(() {
        _payslips = payslips;
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

  Future<void> _toggleBreakdown(String runId) async {
    if (_openRunId == runId) {
      setState(() => _openRunId = null);
      return;
    }
    setState(() {
      _openRunId = runId;
      _detail = null;
      _detailError = null;
      _detailLoading = true;
    });
    try {
      final detail = await _api!.getPayslipDetail(runId);
      if (!mounted || _openRunId != runId) return;
      setState(() {
        _detail = detail;
        _detailLoading = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _detailError = e.message;
        _detailLoading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _detailError = e.toString();
        _detailLoading = false;
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    final latest = _payslips.isEmpty ? null : _payslips.first;
    final history = _payslips.skip(1).toList();
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
          Text('Pay', style: AppText.screenTitle),
          const SizedBox(height: 20),
          if (_loading)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 48),
              child: Center(child: CircularProgressIndicator()),
            )
          else if (_error != null)
            _errorCard()
          else if (latest == null)
            _empty()
          else ...[
            _hero(latest),
            if (_openRunId == latest['runId']) ...[
              const SizedBox(height: AppSpacing.cardGap),
              _breakdown(),
            ],
            if (history.isNotEmpty) ...[
              const SectionHeader('History'),
              ...history.map(_historyRow),
            ],
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
          Text('Could not load pay', style: AppText.rowTitle),
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

  Widget _empty() {
    return AppCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('No payslips yet', style: AppText.rowTitle),
          const SizedBox(height: 6),
          Text(
            'Your payslip appears here once a payroll run that includes you '
            'is locked.',
            style: AppText.label.copyWith(color: AppColors.mutedLight),
          ),
        ],
      ),
    );
  }

  Widget _hero(Map<String, dynamic> slip) {
    final runId = slip['runId'] as String;
    final open = _openRunId == runId;
    final currency = slip['currencyCode'] as String?;
    return DarkHeroCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Net pay - ${formatMonth(slip['periodStart'] as String?)}',
            style: AppText.label.copyWith(color: AppColors.adminTextMuted),
          ),
          const SizedBox(height: 10),
          Text(formatMoney(slip['net'] as num?, currency), style: AppText.hero),
          const SizedBox(height: 6),
          Text(
            'Gross ${formatMoney(slip['gross'] as num?, currency)} - '
            'Deductions ${formatMoney(slip['deductions'] as num?, currency)}',
            style: AppText.label.copyWith(color: AppColors.adminTextMuted),
          ),
          const SizedBox(height: 18),
          GestureDetector(
            onTap: () => _toggleBreakdown(runId),
            child: Row(
              children: [
                Text(
                  open ? 'Hide breakdown' : 'View breakdown',
                  style: AppText.pill.copyWith(color: AppColors.accent),
                ),
                Icon(
                  open ? Icons.expand_less_rounded : Icons.expand_more_rounded,
                  color: AppColors.accent,
                  size: 18,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _breakdown() {
    if (_detailLoading) {
      return const AppCard(
        child: Center(
          child: Padding(
            padding: EdgeInsets.all(12),
            child: CircularProgressIndicator(),
          ),
        ),
      );
    }
    if (_detailError != null) {
      return AppCard(
        child: Text(
          _detailError!,
          style: AppText.label.copyWith(color: AppColors.dangerText),
        ),
      );
    }
    final d = _detail;
    if (d == null) return const SizedBox.shrink();
    final currency = d['currencyCode'] as String?;
    final lines = (d['lines'] as List? ?? const []).cast<Map<String, dynamic>>();
    final earnings = lines.where((l) => l['componentType'] != 'deduction');
    final deductions = lines.where((l) => l['componentType'] == 'deduction');
    final overtimeAmount = (d['overtimeAmount'] as num?) ?? 0;
    final adjustments = (d['adjustments'] as num?) ?? 0;
    return AppCard(
      child: Column(
        children: [
          for (final l in earnings)
            _line(l['name'] as String? ?? '', formatMoney(l['amount'] as num?, currency)),
          if (overtimeAmount > 0)
            _line(
              'Overtime (${formatHours(d['overtimeHours'] as num?)})',
              '+${formatMoney(overtimeAmount, currency)}',
              color: AppColors.successText,
            ),
          for (final l in deductions)
            _line(
              l['name'] as String? ?? '',
              '-${formatMoney(l['amount'] as num?, currency)}',
              color: AppColors.dangerText,
            ),
          if (adjustments != 0)
            _line(
              'Adjustments',
              formatMoney(adjustments, currency),
              color: adjustments > 0 ? AppColors.successText : AppColors.dangerText,
            ),
          const Divider(height: 20, color: AppColors.hairline),
          _line('Net pay', formatMoney(d['net'] as num?, currency), bold: true),
        ],
      ),
    );
  }

  Widget _line(String label, String value, {Color? color, bool bold = false}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Expanded(
            child: Text(label, style: bold ? AppText.rowTitle : AppText.body),
          ),
          Text(
            value,
            style: (bold ? AppText.rowTitle : AppText.body)
                .copyWith(color: color ?? AppColors.ink),
          ),
        ],
      ),
    );
  }

  Widget _historyRow(Map<String, dynamic> slip) {
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
              child: const Icon(Icons.description_rounded, color: AppColors.ink),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    formatMonth(slip['periodStart'] as String?),
                    style: AppText.rowTitle,
                  ),
                  const SizedBox(height: 2),
                  Text(
                    '${formatDayMonth(slip['periodStart'] as String?)} to '
                    '${formatDayMonth(slip['periodEnd'] as String?)}',
                    style: AppText.label,
                  ),
                ],
              ),
            ),
            Text(
              formatMoney(slip['net'] as num?, slip['currencyCode'] as String?),
              style: AppText.rowTitle,
            ),
          ],
        ),
      ),
    );
  }
}
