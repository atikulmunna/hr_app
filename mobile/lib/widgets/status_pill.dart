import 'package:flutter/material.dart';
import '../theme/app_colors.dart';
import '../theme/app_dimens.dart';
import '../theme/app_typography.dart';

enum PillStatus { approved, pending, rejected, remote, neutral }

/// Small status tag (Approved / Pending / Rejected / Remote).
class StatusPill extends StatelessWidget {
  const StatusPill(this.label, {super.key, this.status = PillStatus.neutral});

  final String label;
  final PillStatus status;

  (Color, Color) _palette() {
    switch (status) {
      case PillStatus.approved:
        return (AppColors.successBg, AppColors.successTextStrong);
      case PillStatus.pending:
        return (AppColors.warningBg, AppColors.warningText);
      case PillStatus.rejected:
        return (AppColors.dangerBg, AppColors.dangerText);
      case PillStatus.remote:
        return (AppColors.infoBg, AppColors.infoText);
      case PillStatus.neutral:
        return (AppColors.subtleFill, AppColors.inkSecondary);
    }
  }

  @override
  Widget build(BuildContext context) {
    final (bg, fg) = _palette();
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
      decoration: BoxDecoration(
        color: bg,
        borderRadius: BorderRadius.circular(AppRadii.pill),
      ),
      child: Text(label, style: AppText.pill.copyWith(color: fg)),
    );
  }
}
