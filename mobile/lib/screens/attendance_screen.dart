import 'package:flutter/material.dart';
import '../theme/app_colors.dart';
import '../theme/app_dimens.dart';
import '../theme/app_typography.dart';
import '../widgets/app_card.dart';
import '../widgets/section_header.dart';

/// Attendance (ESS): the manual check-in and check-out surface.
class AttendanceScreen extends StatefulWidget {
  const AttendanceScreen({super.key});

  @override
  State<AttendanceScreen> createState() => _AttendanceScreenState();
}

class _AttendanceScreenState extends State<AttendanceScreen> {
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
        Text('Attendance', style: AppText.screenTitle),
        const SizedBox(height: 24),
        Center(child: _dial()),
        const SizedBox(height: 8),
        _geofenceCard(),
        const SectionHeader("Today's timeline"),
        _timeline(),
        const SectionHeader('This week'),
        _weekBars(),
      ],
    );
  }

  Widget _dial() {
    final fill = _checkedIn ? AppColors.accent : AppColors.ink;
    final onFill = _checkedIn ? AppColors.accentTextOnLime : AppColors.surface;
    return GestureDetector(
      onTap: () => setState(() => _checkedIn = !_checkedIn),
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
          boxShadow: _checkedIn ? AppShadows.limeButton : AppShadows.heroDark,
        ),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            if (_checkedIn)
              Text(
                '7:32',
                style: AppText.hero.copyWith(color: onFill),
              )
            else
              Icon(Icons.power_settings_new_rounded, size: 44, color: onFill),
            const SizedBox(height: 6),
            Text(
              _checkedIn ? 'Tap to check out' : 'Tap to check in',
              style: AppText.label.copyWith(color: onFill),
            ),
          ],
        ),
      ),
    );
  }

  Widget _geofenceCard() {
    return AppCard(
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: AppColors.subtleFill,
              borderRadius: BorderRadius.circular(AppRadii.iconTile),
            ),
            child: const Icon(Icons.location_on_rounded, color: AppColors.ink),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Example Corp - Head office', style: AppText.rowTitle),
                const SizedBox(height: 2),
                Text(
                  'Inside office radius - Wi-Fi verified',
                  style: AppText.label.copyWith(color: AppColors.successText),
                ),
              ],
            ),
          ),
          const Icon(Icons.verified_rounded, color: AppColors.successText),
        ],
      ),
    );
  }

  Widget _timeline() {
    return AppCard(
      child: Column(
        children: [
          _timelineRow(AppColors.successText, 'Checked in', '09:02 AM'),
          const Divider(height: 20, color: AppColors.hairline),
          _timelineRow(AppColors.warningText, 'Break', '1:10 - 1:42 PM'),
          const Divider(height: 20, color: AppColors.hairline),
          _timelineRow(AppColors.mutedLight, 'Check out', 'Pending'),
        ],
      ),
    );
  }

  Widget _timelineRow(Color dot, String label, String value) {
    return Row(
      children: [
        Container(
          width: 10,
          height: 10,
          decoration: BoxDecoration(color: dot, shape: BoxShape.circle),
        ),
        const SizedBox(width: 12),
        Expanded(child: Text(label, style: AppText.rowTitle)),
        Text(value, style: AppText.label),
      ],
    );
  }

  Widget _weekBars() {
    const days = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri'];
    const heights = [70.0, 90.0, 60.0, 100.0, 40.0];
    const todayIndex = 3;
    return AppCard(
      child: SizedBox(
        height: 130,
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.end,
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: List.generate(days.length, (i) {
            final isToday = i == todayIndex;
            final isFuture = i > todayIndex;
            return Column(
              mainAxisAlignment: MainAxisAlignment.end,
              children: [
                Container(
                  width: 26,
                  height: heights[i],
                  decoration: BoxDecoration(
                    color: isToday
                        ? AppColors.accent
                        : isFuture
                            ? AppColors.subtleFill
                            : AppColors.ink,
                    borderRadius: BorderRadius.circular(10),
                  ),
                ),
                const SizedBox(height: 8),
                Text(days[i], style: AppText.label.copyWith(fontSize: 12)),
              ],
            );
          }),
        ),
      ),
    );
  }
}
