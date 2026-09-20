import 'package:flutter/material.dart';
import '../api/api_client.dart';
import '../auth/auth_scope.dart';
import '../theme/app_colors.dart';
import '../theme/app_dimens.dart';
import '../theme/app_typography.dart';
import '../util/format.dart';

/// HR Console (admin), the dark-themed org-wide surface. Reached from Team by
/// users who can read analytics. Each panel loads independently, so a section
/// the caller may not read (payroll, recruitment) is simply left out rather
/// than failing the whole screen.
class HrConsoleScreen extends StatefulWidget {
  const HrConsoleScreen({super.key});

  @override
  State<HrConsoleScreen> createState() => _HrConsoleScreenState();
}

class _HrConsoleScreenState extends State<HrConsoleScreen> {
  ApiClient? _api;
  bool _loading = true;
  String? _error;

  Map<String, dynamic>? _headcount;
  Map<String, dynamic>? _overtime;
  Map<String, dynamic>? _attrition;
  List<Map<String, dynamic>>? _approvals;
  List<Map<String, dynamic>>? _runs;
  List<Map<String, dynamic>>? _requisitions;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_api == null) {
      _api = AuthScope.of(context).api;
      _load();
    }
  }

  // Headcount is the one call that must succeed (it is what analytics:read
  // grants); the rest are optional and null when unavailable.
  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final headcount = await _api!.getHeadcount();
      final optional = await Future.wait<Object?>([
        _optional(() => _api!.getOvertimeAnalytics(months: 1)),
        _optional(() => _api!.getAttrition(months: 12)),
        _optional(() => _api!.getPendingApprovals()),
        _optional(() => _api!.getPayrollRuns()),
        _optional(() => _api!.getRequisitions()),
      ]);
      if (!mounted) return;
      setState(() {
        _headcount = headcount;
        _overtime = optional[0] as Map<String, dynamic>?;
        _attrition = optional[1] as Map<String, dynamic>?;
        _approvals = optional[2] as List<Map<String, dynamic>>?;
        _runs = optional[3] as List<Map<String, dynamic>>?;
        _requisitions = optional[4] as List<Map<String, dynamic>>?;
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

  Future<T?> _optional<T>(Future<T> Function() call) async {
    try {
      return await call();
    } catch (_) {
      return null;
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.adminBg,
      body: RefreshIndicator(
        onRefresh: _load,
        child: ListView(
          padding: const EdgeInsets.fromLTRB(
            AppSpacing.screenHPad,
            AppSpacing.screenTopPad,
            AppSpacing.screenHPad,
            40,
          ),
          children: [
            _header(context),
            const SizedBox(height: 20),
            if (_loading)
              const Padding(
                padding: EdgeInsets.symmetric(vertical: 48),
                child: Center(
                  child: CircularProgressIndicator(color: AppColors.accent),
                ),
              )
            else if (_error != null)
              _errorCard()
            else ...[
              _headcountHero(),
              const SizedBox(height: AppSpacing.cardGap),
              _kpiGrid(),
              if (_overtime != null) ...[
                _sectionHeader('Overtime by entity, this month'),
                _overtimeBars(),
              ],
              if (_runs != null) ...[
                _sectionHeader('Payroll'),
                _payrollCard(),
              ],
            ],
          ],
        ),
      ),
    );
  }

  Widget _header(BuildContext context) {
    final entities = (_headcount?['byEntity'] as List?)?.length;
    return Row(
      children: [
        GestureDetector(
          onTap: () => Navigator.of(context).pop(),
          child: Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: AppColors.adminCard,
              borderRadius: BorderRadius.circular(AppRadii.iconTile),
            ),
            child: const Icon(Icons.chevron_left_rounded,
                color: AppColors.adminText),
          ),
        ),
        const SizedBox(width: 12),
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'HR Console',
              style: AppText.screenTitle.copyWith(color: AppColors.adminText),
            ),
            Text(
              entities == null
                  ? 'Organisation overview'
                  : '$entities ${entities == 1 ? 'entity' : 'entities'}',
              style: AppText.label.copyWith(color: AppColors.adminTextMuted),
            ),
          ],
        ),
      ],
    );
  }

  Widget _errorCard() {
    return _darkCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Could not load the console',
              style: AppText.rowTitle.copyWith(color: AppColors.adminText)),
          const SizedBox(height: 6),
          Text(_error!,
              style: AppText.label.copyWith(color: AppColors.adminTextMuted)),
          const SizedBox(height: 12),
          Align(
            alignment: Alignment.centerLeft,
            child: FilledButton(onPressed: _load, child: const Text('Retry')),
          ),
        ],
      ),
    );
  }

  Widget _darkCard({required Widget child, Color? color, Gradient? gradient}) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: color ?? AppColors.adminCard,
        gradient: gradient,
        borderRadius: BorderRadius.circular(AppRadii.card),
        border: Border.all(color: AppColors.adminCardBorder),
      ),
      child: child,
    );
  }

  Widget _headcountHero() {
    final total = _headcount?['total'] ?? 0;
    final byEntity =
        (_headcount?['byEntity'] as List? ?? const []).cast<Map<String, dynamic>>();
    final joiners = _attrition?['joiners'];
    return _darkCard(
      gradient: const LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [Color(0xFF1C1C16), Color(0xFF26261C)],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Total headcount',
              style: AppText.label.copyWith(color: AppColors.adminTextMuted)),
          const SizedBox(height: 8),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text('$total',
                  style: AppText.hero.copyWith(color: AppColors.adminText)),
              if (joiners != null && joiners != 0) ...[
                const SizedBox(width: 10),
                Padding(
                  padding: const EdgeInsets.only(bottom: 8),
                  child: Text('+$joiners joined, 12 months',
                      style: AppText.label.copyWith(color: AppColors.accent)),
                ),
              ],
            ],
          ),
          const SizedBox(height: 6),
          Text(
            byEntity.map((e) => '${e['name']} ${e['headcount']}').join(' - '),
            style: AppText.label.copyWith(color: AppColors.adminTextMuted),
          ),
        ],
      ),
    );
  }

  Widget _kpiGrid() {
    final overtimeHours = _overtime?['totalHours'] as num?;
    final overtimeByEntity =
        (_overtime?['byEntity'] as List? ?? const []).cast<Map<String, dynamic>>();
    final overtimeCost = overtimeByEntity
        .where((e) => ((e['amount'] as num?) ?? 0) > 0)
        .map((e) => formatMoney(e['amount'] as num?, e['currencyCode'] as String?))
        .join(' - ');
    final pending = _approvals?.length;
    final escalated = _approvals?.where((a) => a['escalatable'] == true).length ?? 0;
    final rate = _attrition?['rate'];
    final leavers = _attrition?['leavers'];
    final openRoles = _requisitions?.where((r) => r['status'] == 'approved').length;
    final awaitingSignOff =
        _requisitions?.where((r) => r['status'] == 'pending').length ?? 0;

    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: AppSpacing.cardGap,
      crossAxisSpacing: AppSpacing.cardGap,
      childAspectRatio: 1.4,
      children: [
        _kpi(
          overtimeHours == null ? '--' : formatHours(overtimeHours),
          'Overtime this month',
          sub: overtimeCost.isEmpty ? null : '$overtimeCost payable',
          lime: true,
        ),
        _kpi(
          pending == null ? '--' : '$pending',
          'Pending approvals',
          sub: escalated > 0 ? '$escalated escalated' : null,
        ),
        _kpi(
          rate == null ? '--' : '$rate%',
          'Attrition, 12 months',
          sub: leavers == null ? null : '$leavers left',
        ),
        _kpi(
          openRoles == null ? '--' : '$openRoles',
          'Open roles',
          sub: awaitingSignOff > 0 ? '$awaitingSignOff awaiting sign-off' : null,
        ),
      ],
    );
  }

  Widget _kpi(String value, String label, {String? sub, bool lime = false}) {
    final onColor = lime ? AppColors.accentTextOnLime : AppColors.adminText;
    final subColor =
        lime ? AppColors.accentTextOnLime : AppColors.adminTextMuted;
    return _darkCard(
      color: lime ? AppColors.accent : AppColors.adminCard,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(value, style: AppText.statNumber.copyWith(color: onColor)),
          const SizedBox(height: 4),
          Text(label, style: AppText.label.copyWith(color: subColor)),
          if (sub != null) ...[
            const SizedBox(height: 2),
            Text(sub,
                style: AppText.label.copyWith(color: subColor, fontSize: 12),
                maxLines: 1,
                overflow: TextOverflow.ellipsis),
          ],
        ],
      ),
    );
  }

  Widget _overtimeBars() {
    final byEntity =
        (_overtime?['byEntity'] as List? ?? const []).cast<Map<String, dynamic>>();
    if (byEntity.isEmpty) {
      return _darkCard(
        child: Text('No overtime was paid this month.',
            style: AppText.label.copyWith(color: AppColors.adminTextMuted)),
      );
    }
    final max = byEntity
        .map((e) => ((e['hours'] as num?) ?? 0).toDouble())
        .fold<double>(0, (a, b) => a > b ? a : b);
    return _darkCard(
      child: Column(
        children: byEntity.map((e) {
          final hours = ((e['hours'] as num?) ?? 0).toDouble();
          return Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text('${e['name']}',
                        style: AppText.label
                            .copyWith(color: AppColors.adminText)),
                    Text(formatHours(hours),
                        style: AppText.label
                            .copyWith(color: AppColors.adminTextMuted)),
                  ],
                ),
                const SizedBox(height: 6),
                ClipRRect(
                  borderRadius: BorderRadius.circular(6),
                  child: LinearProgressIndicator(
                    value: max == 0 ? 0 : hours / max,
                    minHeight: 8,
                    backgroundColor: AppColors.adminCardBorder,
                    valueColor:
                        const AlwaysStoppedAnimation(AppColors.accent),
                  ),
                ),
              ],
            ),
          );
        }).toList(),
      ),
    );
  }

  Widget _payrollCard() {
    final runs = _runs ?? const [];
    if (runs.isEmpty) {
      return _darkCard(
        child: Text('No payroll runs yet.',
            style: AppText.label.copyWith(color: AppColors.adminTextMuted)),
      );
    }
    final run = runs.first;
    final status = run['status'] as String? ?? 'draft';
    final blocking = (run['issues'] as List? ?? const [])
        .where((i) => i['severity'] == 'blocking')
        .length;
    final (pillBg, pillFg) = switch (status) {
      'approved' => (AppColors.successBg, AppColors.successTextStrong),
      'locked' => (AppColors.infoBg, AppColors.infoText),
      _ => (AppColors.warningBg, AppColors.warningText),
    };
    return _darkCard(
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: AppColors.adminBg,
              borderRadius: BorderRadius.circular(AppRadii.iconTile),
            ),
            child: const Icon(Icons.schedule_rounded,
                color: AppColors.accent),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  '${formatMonth(run['periodStart'] as String?)} run',
                  style: AppText.rowTitle.copyWith(color: AppColors.adminText),
                ),
                const SizedBox(height: 2),
                Text(
                  status == 'draft' && blocking > 0
                      ? '$blocking blocking issue${blocking == 1 ? '' : 's'} before lock'
                      : 'Cut-off ${formatDayMonth(run['cutoffDate'] as String?)} - '
                          '${run['currencyCode'] ?? ''}',
                  style: AppText.label.copyWith(color: AppColors.adminTextMuted),
                ),
              ],
            ),
          ),
          Container(
            padding:
                const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
            decoration: BoxDecoration(
              color: pillBg,
              borderRadius: BorderRadius.circular(AppRadii.pill),
            ),
            child: Text(
              status[0].toUpperCase() + status.substring(1),
              style: AppText.pill.copyWith(color: pillFg),
            ),
          ),
        ],
      ),
    );
  }

  Widget _sectionHeader(String text) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 24, 4, 12),
      child: Text(text,
          style: AppText.sectionHeader.copyWith(color: AppColors.adminTextMuted)),
    );
  }
}
