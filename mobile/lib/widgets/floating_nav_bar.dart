import 'dart:ui';
import 'package:flutter/material.dart';
import '../theme/app_colors.dart';
import '../theme/app_dimens.dart';

class NavItem {
  const NavItem(this.icon, this.label);
  final IconData icon;
  final String label;
}

/// The floating, blurred pill navigation with a raised lime centre action.
class FloatingNavBar extends StatelessWidget {
  const FloatingNavBar({
    super.key,
    required this.index,
    required this.onSelect,
  });

  final int index;
  final ValueChanged<int> onSelect;

  static const items = <NavItem>[
    NavItem(Icons.home_rounded, 'Home'),
    NavItem(Icons.beach_access_rounded, 'Leave'),
    NavItem(Icons.fingerprint_rounded, 'Attendance'),
    NavItem(Icons.groups_rounded, 'Team'),
    NavItem(Icons.payments_rounded, 'Pay'),
  ];

  @override
  Widget build(BuildContext context) {
    return ClipRRect(
      borderRadius: BorderRadius.circular(AppRadii.nav),
      child: BackdropFilter(
        filter: ImageFilter.blur(sigmaX: 18, sigmaY: 18),
        child: Container(
          height: 70,
          padding: const EdgeInsets.symmetric(horizontal: 20),
          decoration: BoxDecoration(
            color: AppColors.surface.withValues(alpha: 0.82),
            borderRadius: BorderRadius.circular(AppRadii.nav),
            boxShadow: AppShadows.nav,
          ),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceBetween,
            children: List.generate(items.length, (i) {
              if (i == 2) {
                return GestureDetector(
                  onTap: () => onSelect(i),
                  child: Container(
                    width: 56,
                    height: 56,
                    decoration: const BoxDecoration(
                      color: AppColors.accent,
                      shape: BoxShape.circle,
                      boxShadow: AppShadows.limeButton,
                    ),
                    child: const Icon(
                      Icons.fingerprint_rounded,
                      color: AppColors.ink,
                    ),
                  ),
                );
              }
              final active = i == index;
              return GestureDetector(
                onTap: () => onSelect(i),
                behavior: HitTestBehavior.opaque,
                child: SizedBox(
                  width: 44,
                  child: Icon(
                    items[i].icon,
                    color: active ? AppColors.ink : AppColors.mutedLight,
                  ),
                ),
              );
            }),
          ),
        ),
      ),
    );
  }
}
