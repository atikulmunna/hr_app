import 'package:flutter/material.dart';
import '../theme/app_colors.dart';
import '../theme/app_dimens.dart';
import '../theme/app_typography.dart';
import '../widgets/app_card.dart';
import '../widgets/check_in_hero.dart';
import '../widgets/section_header.dart';
import '../widgets/stat_tile.dart';
import '../widgets/status_pill.dart';

/// Employee home (ESS). Renders entirely from the design system to prove it.
class HomeScreen extends StatefulWidget {
  const HomeScreen({super.key});

  @override
  State<HomeScreen> createState() => _HomeScreenState();
}

class _HomeScreenState extends State<HomeScreen> {
  bool _checkedIn = true;

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
        _greeting(),
        const SizedBox(height: 20),
        CheckInHero(
          checkedIn: _checkedIn,
          elapsed: _checkedIn ? '7h 32m' : '0h 00m',
          subtitle: _checkedIn
              ? 'Checked in - 09:02 AM - auto-detected'
              : 'Tap to start your day',
          onToggle: () => setState(() => _checkedIn = !_checkedIn),
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

  Widget _greeting() {
    return Row(
      children: [
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Good morning', style: AppText.label),
              const SizedBox(height: 2),
              Text('Ayesha Rahman', style: AppText.screenTitle),
            ],
          ),
        ),
        _circleIcon(Icons.notifications_none_rounded, dot: true),
        const SizedBox(width: 10),
        Container(
          width: 44,
          height: 44,
          alignment: Alignment.center,
          decoration: const BoxDecoration(
            color: AppColors.ink,
            shape: BoxShape.circle,
          ),
          child: Text(
            'AR',
            style: AppText.pill.copyWith(color: AppColors.surface),
          ),
        ),
      ],
    );
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
