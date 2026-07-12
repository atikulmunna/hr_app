import 'package:flutter/material.dart';
import 'app_colors.dart';

/// Spacing, radii, and shadow tokens from ui_design/README.md.
abstract final class AppRadii {
  static const card = 26.0;
  static const hero = 30.0;
  static const compact = 22.0;
  static const iconTile = 14.0;
  static const pill = 14.0;
  static const nav = 34.0;
}

abstract final class AppSpacing {
  static const cardGap = 12.0;
  static const railGap = 10.0;
  static const screenHPad = 18.0;
  static const screenTopPad = 60.0;
  static const screenBottomPad = 128.0; // clears the floating nav
}

abstract final class AppShadows {
  static const card = <BoxShadow>[
    BoxShadow(
      color: Color(0x0A000000), // rgba(0,0,0,.04)
      blurRadius: 18,
      offset: Offset(0, 6),
    ),
  ];

  static const heroDark = <BoxShadow>[
    BoxShadow(
      color: Color(0x66000000), // rgba(0,0,0,.4)
      blurRadius: 30,
      spreadRadius: -12,
      offset: Offset(0, 14),
    ),
  ];

  static const limeButton = <BoxShadow>[
    BoxShadow(
      color: Color(0x6696B428), // rgba(150,180,40,.4)
      blurRadius: 18,
      offset: Offset(0, 8),
    ),
  ];

  static const nav = <BoxShadow>[
    BoxShadow(
      color: Color(0x2E000000), // rgba(0,0,0,.18)
      blurRadius: 30,
      spreadRadius: -8,
      offset: Offset(0, 12),
    ),
    BoxShadow(
      color: Color(0x0D000000), // rgba(0,0,0,.05)
      blurRadius: 6,
      offset: Offset(0, 2),
    ),
  ];
}

/// Squircle (continuous) corners to match the handoff's superellipse cards.
ShapeBorder squircle(double radius) =>
    ContinuousRectangleBorder(
      // Continuous corners read larger than circular; scale up to match.
      borderRadius: BorderRadius.circular(radius * 1.7),
    );

BorderRadius squircleRadius(double radius) =>
    BorderRadius.circular(radius * 1.2);

/// Subtle fill used for icon tiles and inset chips.
const iconTileColor = AppColors.subtleFill;
