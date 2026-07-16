import 'package:flutter/material.dart';
import '../attendance/attendance_controller.dart';
import '../attendance/attendance_scope.dart';
import '../auth/auth_scope.dart';
import '../theme/app_colors.dart';
import '../theme/app_dimens.dart';
import '../theme/app_typography.dart';
import '../widgets/app_card.dart';
import '../widgets/check_in_hero.dart';
import '../widgets/section_header.dart';
import '../widgets/stat_tile.dart';
import '../widgets/status_pill.dart';
import 'profile_screen.dart';

/// Employee home (ESS). Renders entirely from the design system to prove it.
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  @override
  Widget build(BuildContext context) {
    final attendance = AttendanceScope.of(context);
    return ListView(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenHPad,
        AppSpacing.screenTopPad,
        AppSpacing.screenHPad,
        AppSpacing.screenBottomPad,
      ),
      children: [
        _greeting(),
        const SizedBox(height: 20),
        CheckInHero(
          checkedIn: attendance.isCheckedIn,
          elapsed: _elapsed(attendance),
          subtitle: _subtitle(attendance),
          actionLabel: _actionLabel(attendance.state),
          busy: attendance.marking,
          onToggle: attendance.primaryEvent == null
              ? null
              : () => _mark(attendance, attendance.primaryEvent!),
        ),
        const SectionHeader('This month'),
        _statGrid(),
        const SectionHeader('Quick actions'),
        _quickActions(),
        const SectionHeader('Coming up'),
        _comingUp(),
      ],
    );
  }

  String _actionLabel(AttendanceState state) {
    switch (state) {
      case AttendanceState.notCheckedIn:
        return 'Check in';
      case AttendanceState.checkedIn:
        return 'Check out';
      case AttendanceState.onBreak:
        return 'End break';
      case AttendanceState.checkedOut:
        return 'Checked out';
    }
  }

  String _subtitle(AttendanceController a) {
    switch (a.state) {
      case AttendanceState.notCheckedIn:
        return 'Tap to start your day';
      case AttendanceState.checkedIn:
        final at = a.checkInAt;
        return at == null ? 'On the clock' : 'Checked in at ${_clock(at)}';
      case AttendanceState.onBreak:
        return 'On a break';
      case AttendanceState.checkedOut:
        return 'Checked out for today';
    }
  }

  String _elapsed(AttendanceController a) {
    final start = a.checkInAt;
    if (start == null) return '0h 00m';
    final end = a.isCheckedIn ? DateTime.now() : _lastEventTime(a) ?? start;
    final d = end.difference(start);
    final h = d.inHours;
    final m = (d.inMinutes % 60).toString().padLeft(2, '0');
    return '${h}h ${m}m';
  }

  DateTime? _lastEventTime(AttendanceController a) {
    if (a.events.isEmpty) return null;
    final ts = a.events.last['serverTs'] as String?;
    return ts == null ? null : DateTime.tryParse(ts)?.toLocal();
  }

  String _clock(DateTime dt) {
    final h = dt.hour % 12 == 0 ? 12 : dt.hour % 12;
    final m = dt.minute.toString().padLeft(2, '0');
    final period = dt.hour < 12 ? 'AM' : 'PM';
    return '$h:$m $period';
  }

  Future<void> _mark(AttendanceController a, String eventType) async {
    final messenger = ScaffoldMessenger.of(context);
    final error = await a.mark(eventType);
    if (!mounted) return;
    messenger.showSnackBar(SnackBar(content: Text(error ?? 'Done.')));
  }

  Widget _greeting() {
    final profile = AuthScope.of(context).profile;
    final first = (profile?['firstName'] as String?)?.trim() ?? '';
    final last = (profile?['lastName'] as String?)?.trim() ?? '';
    final name = '$first $last'.trim().isEmpty ? 'Employee' : '$first $last';
    final initials =
        ((first.isNotEmpty ? first[0] : '') + (last.isNotEmpty ? last[0] : ''))
            .toUpperCase();
    return Row(
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Good morning', style: AppText.label),
              const SizedBox(height: 2),
              Text(name, style: AppText.screenTitle),
            ],
          ),
        ),
        _circleIcon(Icons.notifications_none_rounded, dot: true),
        const SizedBox(width: 10),
        GestureDetector(
          onTap: _openProfile,
          child: Container(
            width: 44,
            height: 44,
            alignment: Alignment.center,
            decoration: const BoxDecoration(
              color: AppColors.ink,
              shape: BoxShape.circle,
            ),
            child: Text(
              initials.isEmpty ? '-' : initials,
              style: AppText.pill.copyWith(color: AppColors.surface),
            ),
          ),
        ),
      ],
    );
  }

  Future<void> _openProfile() async {
    final auth = AuthScope.of(context);
    await Navigator.of(
      context,
    ).push(MaterialPageRoute(builder: (_) => const ProfileScreen()));
    // Reflect any profile edit (e.g. an approved name change) in the greeting.
    if (mounted) await auth.refreshProfile();
  }

  Widget _circleIcon(IconData icon, {bool dot = false}) {
    return Stack(
      clipBehavior: Clip.none,
      children: [
        Container(
          width: 44,
          height: 44,
          decoration: BoxDecoration(
            color: AppColors.surface,
            borderRadius: BorderRadius.circular(AppRadii.iconTile),
            boxShadow: AppShadows.card,
          ),
          child: const Icon(Icons.notifications_none_rounded, size: 20),
        ),
        if (dot)
          Positioned(
            right: 10,
            top: 10,
            child: Container(
              width: 8,
              height: 8,
              decoration: const BoxDecoration(
                color: AppColors.accent,
                shape: BoxShape.circle,
              ),
            ),
          ),
      ],
    );
  }

  Widget _statGrid() {
    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: AppSpacing.cardGap,
      crossAxisSpacing: AppSpacing.cardGap,
      childAspectRatio: 1.35,
      children: const [
        StatTile(value: '21/22', label: 'Present days', delta: '+2 on time'),
        StatTile(value: '12.5', label: 'Leave balance', highlight: true),
        StatTile(value: '8:58', label: 'Avg in-time'),
        StatTile(value: '6.5h', label: 'Overtime'),
      ],
    );
  }

  Widget _quickActions() {
    const actions = [
      (Icons.beach_access_rounded, 'Apply leave'),
      (Icons.event_available_rounded, 'Regularize'),
      (Icons.receipt_long_rounded, 'Payslip'),
      (Icons.account_balance_wallet_rounded, 'Expense'),
    ];
    return SizedBox(
      height: 96,
      child: ListView.separated(
        scrollDirection: Axis.horizontal,
        itemCount: actions.length,
        separatorBuilder: (_, _) => const SizedBox(width: AppSpacing.railGap),
        itemBuilder: (context, i) {
          final (icon, label) = actions[i];
          return AppCard(
            padding: const EdgeInsets.all(14),
            child: SizedBox(
              width: 68,
              child: Column(
                mainAxisAlignment: MainAxisAlignment.center,
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Icon(icon, size: 22, color: AppColors.ink),
                  const Spacer(),
                  Text(label, style: AppText.label.copyWith(fontSize: 12)),
                ],
              ),
            ),
          );
        },
      ),
    );
  }

  Widget _comingUp() {
    return AppCard(
      child: Column(
        children: [
          _comingRow('Eid holiday', 'Public holiday', 'Jun 17', null),
          const Divider(height: 24, color: AppColors.hairline),
          _comingRow(
            'Karim on leave',
            'Annual leave',
            'Jun 20',
            const StatusPill('Team', status: PillStatus.remote),
          ),
        ],
      ),
    );
  }

  Widget _comingRow(String title, String sub, String date, Widget? trailing) {
    return Row(
      children: [
        Container(
          width: 44,
          height: 44,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: AppColors.subtleFill,
            borderRadius: BorderRadius.circular(AppRadii.iconTile),
          ),
          child: Text(date, style: AppText.pill.copyWith(fontSize: 11)),
        ),
        const SizedBox(width: 12),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(title, style: AppText.rowTitle),
              const SizedBox(height: 2),
              Text(sub, style: AppText.label),
            ],
          ),
        ),
        ?trailing,
      ],
    );
  }
}
