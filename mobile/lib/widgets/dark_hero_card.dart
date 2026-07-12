import 'package:flutter/material.dart';
import '../theme/app_colors.dart';
import '../theme/app_dimens.dart';

/// The dark hero surface: an opaque ink card with a soft lime corner glow.
/// Built as layers (not a single gradient) because a BoxDecoration ignores
/// `color` when a `gradient` is set, which would let the background show through.
class DarkHeroCard extends StatelessWidget {
  const DarkHeroCard({
    super.key,
    required this.child,
    this.padding = const EdgeInsets.all(22),
    this.radius = AppRadii.hero,
  });

  final Widget child;
  final EdgeInsetsGeometry padding;
  final double radius;

  @override
  Widget build(BuildContext context) {
    return DecoratedBox(
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(radius),
        boxShadow: AppShadows.heroDark,
      ),
      child: ClipRRect(
        borderRadius: BorderRadius.circular(radius),
        child: Stack(
          children: [
            const Positioned.fill(
              child: ColoredBox(color: AppColors.ink),
            ),
            Positioned(
              right: -50,
              top: -50,
              child: Container(
                width: 220,
                height: 220,
                decoration: const BoxDecoration(
                  shape: BoxShape.circle,
                  gradient: RadialGradient(
                    colors: [Color(0x55C6F24A), Color(0x00C6F24A)],
                  ),
                ),
              ),
            ),
            Padding(padding: padding, child: child),
          ],
        ),
      ),
    );
  }
}
