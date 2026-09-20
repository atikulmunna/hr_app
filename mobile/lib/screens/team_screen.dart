import 'package:flutter/material.dart';
import '../api/api_client.dart';
import '../auth/auth_scope.dart';
import '../theme/app_colors.dart';
import '../theme/app_dimens.dart';
import '../theme/app_typography.dart';
import '../util/format.dart';
import '../widgets/app_card.dart';
import '../widgets/section_header.dart';
import '../widgets/status_pill.dart';
import 'hr_console_screen.dart';

// Plain-language names for the request types the workflow engine routes.
const _requestLabels = <String, String>{
  'leave_request': 'Leave',
  'regularization': 'Correction',
  'overtime': 'Overtime',
  'shift_swap': 'Shift swap',
  'profile_change': 'Name change',
  'device_rebind': 'Device change',
  'expense_claim': 'Expense',
  'payroll_adjustment': 'Pay adjustment',
  'payroll_run': 'Payroll run',
  'requisition': 'Requisition',
};

// Payload fields that are internal identifiers, not something to read.
const _hiddenPayloadKeys = {
  'employeeId',
  'leaveTypeId',
  'legalEntityId',
  'newFingerprint',
  'requesterEmployeeId',
  'counterpartyEmployeeId',
};

/// Team (MSS, FR-M9-06): the caller's direct reports with today's status, and
/// the approvals their roles can decide. A non-manager simply sees an empty
/// team; the HR Console entry appears only for users who can read analytics.
class TeamScreen extends StatefulWidget {
  const TeamScreen({super.key});

  @override
  State<TeamScreen> createState() => _TeamScreenState();
}

class _TeamScreenState extends State<TeamScreen> {
  ApiClient? _api;
  bool _loading = true;
  String? _error;
  List<Map<String, dynamic>> _reports = const [];
  List<Map<String, dynamic>> _approvals = const [];
  bool _canOpenConsole = false;
  String? _busyId;

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
        _api!.getTeam(),
        _api!.getPendingApprovals(),
        _api!.getMe(),
      ]);
      if (!mounted) return;
      final me = results[2] as Map<String, dynamic>;
      final permissions =
          (me['permissions'] as List? ?? const []).cast<String>();
      setState(() {
        _reports = results[0] as List<Map<String, dynamic>>;
        _approvals = results[1] as List<Map<String, dynamic>>;
        _canOpenConsole =
            permissions.contains('*') || permissions.contains('analytics:read');
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

  Future<void> _decide(String id, String decision) async {
    setState(() => _busyId = id);
    try {
      await _api!.decideApproval(id, decision);
      if (!mounted) return;
      setState(() => _approvals = _approvals.where((a) => a['id'] != id).toList());
    } on ApiException catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(e.message)));
    } catch (e) {
      if (!mounted) return;
      ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text('$e')));
    } finally {
      if (mounted) setState(() => _busyId = null);
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
          Row(
            children: [
              Expanded(child: Text('Team', style: AppText.screenTitle)),
              if (!_loading && _error == null) _pendingPill(),
            ],
          ),
          const SizedBox(height: 20),
          if (_loading)
            const Padding(
              padding: EdgeInsets.symmetric(vertical: 48),
              child: Center(child: CircularProgressIndicator()),
            )
          else if (_error != null)
            _errorCard()
          else ...[
            if (_canOpenConsole) ...[
              _hrConsoleButton(),
              const SizedBox(height: 20),
            ],
            _statRow(),
            const SectionHeader('Pending approvals'),
            if (_approvals.isEmpty) _allClear() else ..._approvals.map(_card),
            const SectionHeader('Team today'),
            if (_reports.isEmpty) _noReports() else ..._reports.map(_reportRow),
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
          Text('Could not load your team', style: AppText.rowTitle),
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

  Widget _pendingPill() {
    final count = _approvals.length;
    final clear = count == 0;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: clear ? AppColors.successBg : AppColors.ink,
        borderRadius: BorderRadius.circular(AppRadii.pill),
      ),
      child: Text(
        clear ? 'All clear' : '$count pending',
        style: AppText.pill.copyWith(
          color: clear ? AppColors.successTextStrong : AppColors.accent,
        ),
      ),
    );
  }

  Widget _hrConsoleButton() {
    return GestureDetector(
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute(builder: (_) => const HrConsoleScreen()),
      ),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.ink,
          borderRadius: BorderRadius.circular(AppRadii.compact),
        ),
        child: Row(
          children: [
            Container(
              width: 40,
              height: 40,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: AppColors.accent,
                borderRadius: BorderRadius.circular(AppRadii.iconTile),
              ),
              child: const Icon(Icons.bar_chart_rounded, color: AppColors.ink),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                'HR Console',
                style: AppText.rowTitle.copyWith(color: AppColors.surface),
              ),
            ),
            const Icon(Icons.chevron_right_rounded, color: AppColors.mutedLight),
          ],
        ),
      ),
    );
  }

  Widget _statRow() {
    var present = 0;
    var onLeave = 0;
    var notIn = 0;
    for (final r in _reports) {
      switch (r['todayStatus']) {
        case 'checked_in':
        case 'checked_out':
          present++;
        case 'leave':
          onLeave++;
        default:
          notIn++;
      }
    }
    return Row(
      children: [
        Expanded(child: _MiniStat('$present', 'Present')),
        const SizedBox(width: AppSpacing.cardGap),
        Expanded(child: _MiniStat('$onLeave', 'On leave')),
        const SizedBox(width: AppSpacing.cardGap),
        Expanded(child: _MiniStat('$notIn', 'Not in')),
      ],
    );
  }

  Widget _card(Map<String, dynamic> a) {
    final id = a['id'] as String;
    final type = a['requestType'] as String? ?? '';
    final label = _requestLabels[type] ?? type;
    final busy = _busyId == id;
    final raised = a['createdAt'] as String?;
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.cardGap),
      child: AppCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(label, style: AppText.rowTitle),
                      const SizedBox(height: 2),
                      Text(
                        'Raised ${formatDayMonth(raised)}'
                        '${a['currentStep'] != null && a['currentStep'] != 1 ? ' - step ${a['currentStep']}' : ''}',
                        style: AppText.label,
                      ),
                    ],
                  ),
                ),
                if (a['escalatable'] == true)
                  const StatusPill('Escalated', status: PillStatus.pending),
              ],
            ),
            const SizedBox(height: 10),
            Text(_summarize(a['payload']), style: AppText.body),
            const SizedBox(height: 14),
            Row(
              children: [
                Expanded(
                  child: _actionButton(
                    'Decline',
                    filled: false,
                    onTap: busy ? null : () => _decide(id, 'reject'),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: _actionButton(
                    busy ? 'Working...' : 'Approve',
                    filled: true,
                    onTap: busy ? null : () => _decide(id, 'approve'),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _actionButton(String label, {required bool filled, VoidCallback? onTap}) {
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 12),
        alignment: Alignment.center,
        decoration: BoxDecoration(
          color: filled ? AppColors.accent : AppColors.subtleFill,
          borderRadius: BorderRadius.circular(AppRadii.pill),
        ),
        child: Text(
          label,
          style: AppText.pill.copyWith(
            color: filled ? AppColors.accentTextOnLime : AppColors.ink,
          ),
        ),
      ),
    );
  }

  // The human-relevant payload fields as "key: value" lines, in the same spirit
  // as the web queue; nested values are flattened one level.
  String _summarize(Object? payload) {
    if (payload is! Map) return '';
    final parts = <String>[];
    for (final entry in payload.entries) {
      final key = entry.key.toString();
      if (_hiddenPayloadKeys.contains(key)) continue;
      final value = entry.value;
      if (value == null) continue;
      final text = value is Map
          ? value.entries.map((e) => '${e.key} ${e.value}').join(', ')
          : value is List
              ? value.join(', ')
              : value.toString();
      parts.add('${_humanize(key)}: $text');
    }
    return parts.join('\n');
  }

  String _humanize(String key) {
    final spaced = key.replaceAllMapped(
      RegExp(r'([A-Z])'),
      (m) => ' ${m[1]!.toLowerCase()}',
    );
    return spaced.isEmpty
        ? spaced
        : spaced[0].toUpperCase() + spaced.substring(1);
  }

  Widget _allClear() {
    return AppCard(
      child: Column(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: const BoxDecoration(
              color: AppColors.successBg,
              shape: BoxShape.circle,
            ),
            child: const Icon(Icons.check_rounded,
                color: AppColors.successTextStrong),
          ),
          const SizedBox(height: 10),
          Text('All caught up', style: AppText.rowTitle),
        ],
      ),
    );
  }

  Widget _noReports() {
    return AppCard(
      child: Text(
        'No one reports to you yet.',
        style: AppText.label.copyWith(color: AppColors.mutedLight),
      ),
    );
  }

  Widget _reportRow(Map<String, dynamic> r) {
    final name = '${r['firstName'] ?? ''} ${r['lastName'] ?? ''}'.trim();
    final (label, status) = _todayPill(r['todayStatus'] as String?);
    final index = name.isEmpty ? 0 : name.codeUnitAt(0);
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.cardGap),
      child: AppCard(
        child: Row(
          children: [
            _avatar(name, AppColors.avatarAccents[index % AppColors.avatarAccents.length]),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(name, style: AppText.rowTitle),
                  if ((r['jobTitle'] as String?)?.isNotEmpty == true) ...[
                    const SizedBox(height: 2),
                    Text(r['jobTitle'] as String, style: AppText.label),
                  ],
                ],
              ),
            ),
            StatusPill(label, status: status),
          ],
        ),
      ),
    );
  }

  (String, PillStatus) _todayPill(String? status) {
    switch (status) {
      case 'checked_in':
        return ('In', PillStatus.approved);
      case 'checked_out':
        return ('Checked out', PillStatus.neutral);
      case 'leave':
        return ('On leave', PillStatus.pending);
      case 'absent':
        return ('Absent', PillStatus.rejected);
      default:
        return ('Not in yet', PillStatus.neutral);
    }
  }

  Widget _avatar(String name, Color color) {
    final initials = name
        .split(' ')
        .take(2)
        .map((p) => p.isEmpty ? '' : p[0])
        .join();
    return Container(
      width: 44,
      height: 44,
      alignment: Alignment.center,
      decoration: BoxDecoration(color: color, shape: BoxShape.circle),
      child: Text(
        initials,
        style: AppText.pill.copyWith(color: AppColors.surface),
      ),
    );
  }
}

class _MiniStat extends StatelessWidget {
  const _MiniStat(this.value, this.label);
  final String value;
  final String label;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(value, style: AppText.statNumber),
          const SizedBox(height: 4),
          Text(label, style: AppText.label.copyWith(fontSize: 12)),
        ],
      ),
    );
  }
}
