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

/// Schedule and shift-swap (T-1E.3). Shows the employee's upcoming roster days
/// and lets them request a swap with a teammate, routed to the manager.
class ScheduleSection extends StatefulWidget {
  const ScheduleSection({super.key, this.refreshSignal});

  /// Fires when the parent screen is pulled to refresh, so the section reloads.
  final Listenable? refreshSignal;

  @override
  State<ScheduleSection> createState() => _ScheduleSectionState();
}

class _ScheduleSectionState extends State<ScheduleSection> {
  ApiClient? _api;
  bool _loading = true;
  String? _error;
  List<Map<String, dynamic>> _roster = const [];
  List<Map<String, dynamic>> _swaps = const [];

  // Window for upcoming roster and swap candidates: today to +31 days.
  static String _iso(DateTime d) =>
      '${d.year.toString().padLeft(4, '0')}-'
      '${d.month.toString().padLeft(2, '0')}-'
      '${d.day.toString().padLeft(2, '0')}';
  String get _from => _iso(DateTime.now());
  String get _to => _iso(DateTime.now().add(const Duration(days: 31)));

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
      final results = await Future.wait([
        _api!.getRoster(_from, _to),
        _api!.getShiftSwaps(),
      ]);
      if (!mounted) return;
      setState(() {
        _roster = results[0];
        _swaps = results[1];
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

  Future<void> _openSwapSheet() async {
    if (_roster.isEmpty) return;
    final submitted = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) =>
          _SwapSheet(api: _api!, myEntries: _roster, from: _from, to: _to),
    );
    if (submitted == true) await _load();
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        const SectionHeader('Upcoming schedule'),
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
        else ...[
          if (_roster.isEmpty)
            AppCard(
              child: Text(
                'No upcoming shifts rostered. Your standing shift still applies.',
                style: AppText.label.copyWith(color: AppColors.mutedLight),
              ),
            )
          else
            ..._roster.map(_rosterRow),
          const SizedBox(height: 4),
          _swapButton(),
          if (_swaps.isNotEmpty) ...[
            const SectionHeader('Swap requests'),
            ..._swaps.map(_swapRow),
          ],
        ],
      ],
    );
  }

  Widget _rosterRow(Map<String, dynamic> r) {
    final swapped = r['source'] == 'swap';
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.cardGap),
      child: AppCard(
        child: Row(
          children: [
            Container(
              width: 44,
              height: 44,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: AppColors.subtleFill,
                borderRadius: BorderRadius.circular(AppRadii.iconTile),
              ),
              child: const Icon(Icons.schedule_rounded, color: AppColors.ink),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(
                    '${_fmtIso(r['workDate'] as String?)} - '
                    '${r['shiftName'] ?? 'Shift'}',
                    style: AppText.rowTitle,
                  ),
                  const SizedBox(height: 2),
                  Text(
                    '${_fmtTime(r['startTime'] as String?)} to '
                    '${_fmtTime(r['endTime'] as String?)}',
                    style: AppText.label,
                  ),
                ],
              ),
            ),
            if (swapped) const StatusPill('Swapped', status: PillStatus.remote),
          ],
        ),
      ),
    );
  }

  Widget _swapButton() {
    final enabled = _roster.isNotEmpty;
    return GestureDetector(
      onTap: enabled ? _openSwapSheet : null,
      child: Opacity(
        opacity: enabled ? 1 : 0.5,
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
                Icons.swap_horiz_rounded,
                size: 18,
                color: AppColors.ink,
              ),
              const SizedBox(width: 8),
              Text('Request shift swap', style: AppText.rowTitle),
            ],
          ),
        ),
      ),
    );
  }

  Widget _swapRow(Map<String, dynamic> s) {
    final status = _pillStatus(s['status'] as String?, s['appliedAt']);
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
                    '${s['requesterName']} (${_fmtIso(s['requesterDate'] as String?)})',
                    style: AppText.rowTitle,
                  ),
                  const SizedBox(height: 2),
                  Text(
                    'with ${s['counterpartyName']} '
                    '(${_fmtIso(s['counterpartyDate'] as String?)})',
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
}

PillStatus _pillStatus(String? raw, dynamic appliedAt) {
  if (appliedAt != null) return PillStatus.approved;
  switch (raw) {
    case 'approved':
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
      return 'Approved';
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

// Formats an HH:MM:SS time string as a short 12-hour label.
String _fmtTime(String? t) {
  if (t == null || t.length < 5) return t ?? '';
  final h = int.tryParse(t.substring(0, 2));
  final m = t.substring(3, 5);
  if (h == null) return t;
  final hour = h % 12 == 0 ? 12 : h % 12;
  final period = h < 12 ? 'AM' : 'PM';
  return '$hour:$m $period';
}

class _SwapSheet extends StatefulWidget {
  const _SwapSheet({
    required this.api,
    required this.myEntries,
    required this.from,
    required this.to,
  });
  final ApiClient api;
  final List<Map<String, dynamic>> myEntries;
  final String from;
  final String to;

  @override
  State<_SwapSheet> createState() => _SwapSheetState();
}

class _SwapSheetState extends State<_SwapSheet> {
  bool _loadingPeers = true;
  String? _peerError;
  List<Map<String, dynamic>> _peers = const [];
  String? _myEntryId;
  String? _peerEntryId;
  final TextEditingController _reason = TextEditingController();
  bool _submitting = false;
  String? _submitError;

  @override
  void initState() {
    super.initState();
    _myEntryId = widget.myEntries.first['id'] as String?;
    _loadPeers();
  }

  @override
  void dispose() {
    _reason.dispose();
    super.dispose();
  }

  Future<void> _loadPeers() async {
    try {
      final peers = await widget.api.getSwappable(widget.from, widget.to);
      if (!mounted) return;
      setState(() {
        _peers = peers;
        _loadingPeers = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _peerError = e.message;
        _loadingPeers = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _peerError = e.toString();
        _loadingPeers = false;
      });
    }
  }

  Future<void> _submit() async {
    if (_myEntryId == null || _peerEntryId == null) {
      setState(
        () => _submitError = 'Pick one of your days and a teammate day.',
      );
      return;
    }
    setState(() {
      _submitting = true;
      _submitError = null;
    });
    final messenger = ScaffoldMessenger.of(context);
    try {
      await widget.api.requestShiftSwap({
        'requesterEntryId': _myEntryId,
        'counterpartyEntryId': _peerEntryId,
        if (_reason.text.trim().isNotEmpty) 'reason': _reason.text.trim(),
      });
      if (!mounted) return;
      Navigator.of(context).pop(true);
      messenger.showSnackBar(
        const SnackBar(content: Text('Swap request sent to your manager.')),
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
              Text('Request shift swap', style: AppText.screenTitle),
              const SizedBox(height: 16),
              Text('Your day to give up', style: AppText.label),
              const SizedBox(height: 8),
              ...widget.myEntries.map(
                (e) => _option(
                  label:
                      '${_fmtIso(e['workDate'] as String?)} - '
                      '${e['shiftName'] ?? 'Shift'}',
                  selected: e['id'] == _myEntryId,
                  onTap: () => setState(() => _myEntryId = e['id'] as String?),
                ),
              ),
              const SizedBox(height: 16),
              Text('Teammate day to take', style: AppText.label),
              const SizedBox(height: 8),
              _peerList(),
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
                label: _submitting ? 'Submitting...' : 'Request swap',
                expand: true,
                onPressed: _submitting ? null : _submit,
              ),
            ],
          ),
        ),
      ),
    );
  }

  Widget _peerList() {
    if (_loadingPeers) {
      return const Padding(
        padding: EdgeInsets.symmetric(vertical: 12),
        child: Center(child: CircularProgressIndicator()),
      );
    }
    if (_peerError != null) {
      return Text(
        _peerError!,
        style: AppText.label.copyWith(color: AppColors.dangerText),
      );
    }
    if (_peers.isEmpty) {
      return Text(
        'No teammate shifts are available to swap.',
        style: AppText.label.copyWith(color: AppColors.mutedLight),
      );
    }
    return Column(
      children: _peers
          .map(
            (p) => _option(
              label:
                  '${p['employeeName']} - '
                  '${_fmtIso(p['workDate'] as String?)} '
                  '(${p['shiftName']})',
              selected: p['id'] == _peerEntryId,
              onTap: () => setState(() => _peerEntryId = p['id'] as String?),
            ),
          )
          .toList(),
    );
  }

  Widget _option({
    required String label,
    required bool selected,
    required VoidCallback onTap,
  }) {
    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: GestureDetector(
        onTap: onTap,
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
          decoration: BoxDecoration(
            color: selected ? AppColors.accent : AppColors.surface,
            borderRadius: BorderRadius.circular(AppRadii.compact),
          ),
          child: Row(
            children: [
              Icon(
                selected ? Icons.radio_button_checked : Icons.radio_button_off,
                size: 18,
                color: selected
                    ? AppColors.accentTextOnLime
                    : AppColors.mutedLight,
              ),
              const SizedBox(width: 10),
              Expanded(
                child: Text(
                  label,
                  style: AppText.rowTitle.copyWith(
                    color: selected
                        ? AppColors.accentTextOnLime
                        : AppColors.ink,
                  ),
                ),
              ),
            ],
          ),
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
