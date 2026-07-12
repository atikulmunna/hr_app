import 'package:flutter/material.dart';
import '../theme/app_colors.dart';
import '../theme/app_typography.dart';

/// Stub for tabs not yet built (Leave, Team, Pay, Attendance). Styled with the
/// design system so the shell reads as one product. Real screens land in T-1E.
class PlaceholderScreen extends StatelessWidget {
  const PlaceholderScreen({super.key, required this.title, required this.icon});

  final String title;
  final IconData icon;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Column(
        mainAxisSize: MainAxisSize.min,
        children: [
          Icon(icon, size: 40, color: AppColors.mutedLight),
          const SizedBox(height: 12),
          Text(title, style: AppText.screenTitle),
          const SizedBox(height: 4),
          Text('Coming soon', style: AppText.label),
        ],
      ),
    );
  }
}
