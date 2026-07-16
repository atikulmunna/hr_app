import 'package:flutter/material.dart';
import '../attendance/attendance_controller.dart';
import '../attendance/attendance_scope.dart';
import '../theme/app_colors.dart';
import '../theme/app_dimens.dart';
import '../theme/app_typography.dart';
import '../widgets/app_card.dart';
import '../widgets/section_header.dart';
import 'corrections_section.dart';
import 'schedule_section.dart';

/// Attendance (ESS): the manual check-in and check-out surface, driven by the
/// server-authoritative state from GET /me/attendance/today.
class AttendanceScreen extends StatefulWidget {
  const AttendanceScreen({super.key});

  @override
  State<AttendanceScreen> createState() => _AttendanceScreenState();
}

class _AttendanceScreenState extends State<AttendanceScreen> {
  // Bumped on pull-to-refresh so the self-contained sections (schedule,
  // corrections) reload alongside today's attendance.
  final ValueNotifier<int> _refresh = ValueNotifier<int>(0);

  @override
  void dispose() {
    _refresh.dispose();
    super.dispose();
  }

  Future<void> _refreshAll(AttendanceController controller) async {
    await controller.load();
    _refresh.value++;
  }

  @override
  Widget build(BuildContext context) {
    final controller = AttendanceScope.of(context);
    return ListenableBuilder(
      listenable: controller,
      builder: (context, _) {
        return RefreshIndicator(
          onRefresh: () => _refreshAll(controller),
          child: ListView(
            padding: const EdgeInsets.fromLTRB(
              AppSpacing.screenHPad,
              AppSpacing.screenTopPad,
              AppSpacing.screenHPad,
              AppSpacing.screenBottomPad,
            ),
            children: [
              Text('Attendance', style: AppText.screenTitle),
              const SizedBox(height: 24),
              Center(child: _Dial(controller: controller)),
              const SizedBox(height: 12),
              if (controller.state == AttendanceState.checkedIn)
                Center(child: _breakButton(context, controller)),
              if (controller.pendingSync > 0) _pendingSyncBanner(controller),
              if (controller.needsRebind) _rebindCard(context, controller),
              const SizedBox(height: 8),
              const SectionHeader("Today's timeline"),
              _timeline(controller),
              const SizedBox(height: 8),
              ScheduleSection(refreshSignal: _refresh),
              const SizedBox(height: 8),
              CorrectionsSection(refreshSignal: _refresh),
            ],
          ),
        );
      },
    );
  }

  Widget _breakButton(BuildContext context, AttendanceController controller) {
    return TextButton.icon(
      onPressed: controller.marking
          ? null
          : () => _mark(context, controller, 'break_start'),
      icon: const Icon(Icons.free_breakfast_outlined, size: 18),
      label: const Text('Start break'),
    );
  }

  Widget _pendingSyncBanner(AttendanceController controller) {
    final n = controller.pendingSync;
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: AppCard(
        child: Row(
          children: [
            const Icon(
              Icons.cloud_off_outlined,
              size: 20,
              color: AppColors.mutedLight,
            ),
            const SizedBox(width: 10),
            Expanded(
              child: Text(
                '$n mark${n == 1 ? '' : 's'} saved offline, waiting to sync.',
                style: AppText.label.copyWith(color: AppColors.inkSecondary),
              ),
            ),
            TextButton(
              onPressed: controller.loading ? null : controller.load,
              child: const Text('Sync now'),
            ),
          ],
        ),
      ),
    );
  }

  Widget _rebindCard(BuildContext context, AttendanceController controller) {
    return Padding(
      padding: const EdgeInsets.only(top: 8),
      child: AppCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('This device is not registered', style: AppText.rowTitle),
            const SizedBox(height: 6),
            Text(
              'Attendance is locked to your registered device. Request a device '
              'change and HR will review it.',
              style: AppText.label.copyWith(color: AppColors.mutedLight),
            ),
            const SizedBox(height: 12),
            Align(
              alignment: Alignment.centerLeft,
              child: FilledButton.icon(
                onPressed: () => _startRebind(context, controller),
                icon: const Icon(Icons.phonelink_setup_outlined, size: 18),
                label: const Text('Request device change'),
              ),
            ),
          ],
        ),
      ),
    );
  }

  Widget _timeline(AttendanceController controller) {
    if (controller.events.isEmpty) {
      return AppCard(
        child: Text(
          'No activity yet today.',
          style: AppText.label.copyWith(color: AppColors.mutedLight),
        ),
      );
    }
    final rows = <Widget>[];
    for (var i = 0; i < controller.events.length; i++) {
      if (i > 0) {
        rows.add(const Divider(height: 20, color: AppColors.hairline));
      }
      rows.add(_timelineRow(controller.events[i]));
    }
    return AppCard(child: Column(children: rows));
  }

  Widget _timelineRow(Map<String, dynamic> event) {
    final type = event['eventType'] as String?;
    final (color, label) = switch (type) {
      'check_in' => (AppColors.successText, 'Checked in'),
      'break_start' => (AppColors.warningText, 'Break started'),
      'break_end' => (AppColors.warningText, 'Break ended'),
      'check_out' => (AppColors.mutedLight, 'Checked out'),
      _ => (AppColors.mutedLight, type ?? 'Event'),
    };
    return Row(
      children: [
        Container(
          width: 10,
          height: 10,
          decoration: BoxDecoration(color: color, shape: BoxShape.circle),
        ),
        const SizedBox(width: 12),
        Expanded(child: Text(label, style: AppText.rowTitle)),
        Text(_formatTime(event['serverTs'] as String?), style: AppText.label),
      ],
    );
  }
}

class _Dial extends StatelessWidget {
  const _Dial({required this.controller});

  final AttendanceController controller;

  @override
  Widget build(BuildContext context) {
    final isCheckedIn = controller.isCheckedIn;
    final closed = controller.state == AttendanceState.checkedOut;
    final fill = isCheckedIn ? AppColors.accent : AppColors.ink;
    final onFill = isCheckedIn ? AppColors.accentTextOnLime : AppColors.surface;

    return GestureDetector(
      onTap: (closed || controller.marking)
          ? null
          : () => _mark(context, controller, controller.primaryEvent!),
      child: Container(
        width: 200,
        height: 200,
        decoration: BoxDecoration(
          color: fill,
          shape: BoxShape.circle,
          border: Border.all(
            color: AppColors.surface.withValues(alpha: 0.6),
            width: 10,
          ),
          boxShadow: isCheckedIn ? AppShadows.limeButton : AppShadows.heroDark,
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            if (controller.marking)
              SizedBox(
                width: 32,
                height: 32,
                child: CircularProgressIndicator(color: onFill, strokeWidth: 3),
              )
            else if (isCheckedIn)
              Text(
                _formatShortTime(controller.checkInAt),
                style: AppText.hero.copyWith(color: onFill),
              )
            else
              Icon(Icons.power_settings_new_rounded, size: 44, color: onFill),
            const SizedBox(height: 6),
            Text(
              _dialLabel(controller),
              style: AppText.label.copyWith(color: onFill),
            ),
          ],
        ),
      ),
    );
  }

  String _dialLabel(AttendanceController controller) {
    switch (controller.state) {
      case AttendanceState.notCheckedIn:
        return 'Tap to check in';
      case AttendanceState.checkedIn:
        return 'Tap to check out';
      case AttendanceState.onBreak:
        return 'Tap to end break';
      case AttendanceState.checkedOut:
        return 'Checked out';
    }
  }
}

/// The device-change reasons offered to the employee, mapped to backend codes.
const _rebindReasons = <(String, String)>[
  ('upgraded', 'New or upgraded phone'),
  ('replaced', 'Replaced or repaired'),
  ('lost', 'Lost device'),
  ('stolen', 'Stolen device'),
  ('other', 'Other'),
];

/// Opens the reason picker and, once a reason is chosen, submits the re-bind
/// request and reports the outcome via a snackbar.
Future<void> _startRebind(
  BuildContext context,
  AttendanceController controller,
) async {
  final reason = await showModalBottomSheet<String>(
    context: context,
    builder: (sheetContext) => SafeArea(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          const Padding(
            padding: EdgeInsets.all(16),
            child: SectionHeader('Reason for device change'),
          ),
          for (final (code, label) in _rebindReasons)
            ListTile(
              title: Text(label),
              onTap: () => Navigator.of(sheetContext).pop(code),
            ),
        ],
      ),
    ),
  );
  if (reason == null || !context.mounted) return;

  final messenger = ScaffoldMessenger.of(context);
  final error = await controller.requestRebind(reason);
  messenger.showSnackBar(
    SnackBar(
      content: Text(error ?? 'Device-change request sent. HR will review it.'),
    ),
  );
}

/// Marks an event and reports the outcome via a snackbar.
Future<void> _mark(
  BuildContext context,
  AttendanceController controller,
  String eventType,
) async {
  final messenger = ScaffoldMessenger.of(context);
  final error = await controller.mark(eventType);
  if (!context.mounted) return;
  messenger.showSnackBar(
    SnackBar(content: Text(error ?? _successText(eventType))),
  );
}

String _successText(String eventType) {
  switch (eventType) {
    case 'check_in':
      return 'Checked in.';
    case 'check_out':
      return 'Checked out.';
    case 'break_start':
      return 'Break started.';
    case 'break_end':
      return 'Break ended.';
    default:
      return 'Done.';
  }
}

String _formatShortTime(DateTime? dt) {
  if (dt == null) return '--:--';
  final h = dt.hour % 12 == 0 ? 12 : dt.hour % 12;
  final m = dt.minute.toString().padLeft(2, '0');
  return '$h:$m';
}

String _formatTime(String? iso) {
  if (iso == null) return '--:--';
  final dt = DateTime.tryParse(iso)?.toLocal();
  if (dt == null) return '--:--';
  final h = dt.hour % 12 == 0 ? 12 : dt.hour % 12;
  final m = dt.minute.toString().padLeft(2, '0');
  final period = dt.hour < 12 ? 'AM' : 'PM';
  return '$h:$m $period';
}
