import 'package:flutter/material.dart';
import '../theme/app_colors.dart';
import '../theme/app_typography.dart';
import 'dark_hero_card.dart';
import 'lime_button.dart';

/// The dark check-in hero with a lime radial glow. Attendance is a check-in and
/// check-out model, so the action toggles between the two.
class CheckInHero extends StatelessWidget {
  const CheckInHero({
    super.key,
    required this.checkedIn,
    required this.elapsed,
    required this.subtitle,
    required this.actionLabel,
    this.busy = false,
    this.onToggle,
  });

  final bool checkedIn;
  final String elapsed;
  final String subtitle;
  final String actionLabel;
  final bool busy;
  final VoidCallback? onToggle;

  @override
  Widget build(BuildContext context) {
    return DarkHeroCard(
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                width: 8,
                height: 8,
                decoration: const BoxDecoration(
                  color: AppColors.accent,
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: 8),
              Text(
                checkedIn ? 'On the clock' : 'Off the clock',
                style: AppText.label.copyWith(color: AppColors.adminTextMuted),
              ),
            ],
          ),
          const SizedBox(height: 14),
          Text(elapsed, style: AppText.hero),
          const SizedBox(height: 6),
          Text(
            subtitle,
            style: AppText.label.copyWith(color: AppColors.adminTextMuted),
          ),
          const SizedBox(height: 18),
          LimeButton(
            label: busy ? 'Working...' : actionLabel,
            icon: Icons.power_settings_new_rounded,
            onPressed: busy ? null : onToggle,
          ),
        ],
      ),
    );
  }
}
