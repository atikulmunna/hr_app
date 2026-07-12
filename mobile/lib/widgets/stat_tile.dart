import 'package:flutter/material.dart';
import '../theme/app_colors.dart';
import '../theme/app_dimens.dart';
import '../theme/app_typography.dart';
import 'app_card.dart';

/// A stat card: big number, label, optional positive delta. Can be lime.
class StatTile extends StatelessWidget {
  const StatTile({
    super.key,
    required this.value,
    required this.label,
    this.delta,
    this.highlight = false,
  });

  final String value;
  final String label;
  final String? delta;
  final bool highlight;

  @override
  Widget build(BuildContext context) {
    final numberColor =
        highlight ? AppColors.accentTextOnLime : AppColors.ink;
    final labelColor =
        highlight ? AppColors.accentTextOnLime : AppColors.muted;
    return AppCard(
      color: highlight ? AppColors.accent : AppColors.surface,
      shadow: highlight ? AppShadows.limeButton : AppShadows.card,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisSize: MainAxisSize.min,
        children: [
          Text(value, style: AppText.statNumber.copyWith(color: numberColor)),
          const SizedBox(height: 6),
          Text(label, style: AppText.label.copyWith(color: labelColor)),
          if (delta != null) ...[
            const SizedBox(height: 4),
            Text(
              delta!,
              style: AppText.label.copyWith(
                color: AppColors.successText,
                fontWeight: FontWeight.w700,
              ),
            ),
          ],
        ],
      ),
    );
  }
}
