import 'package:flutter/material.dart';

/// Design tokens: color palette from ui_design/README.md.
/// These are the single source of colour truth for the app.
abstract final class AppColors {
  // Light surfaces
  static const ground = Color(0xFFDFDDD6); // outside phone / page
  static const screenBg = Color(0xFFE9E7E1); // employee app canvas
  static const surface = Color(0xFFFFFFFF); // cards, sheets, rows
  static const subtleFill = Color(0xFFF4F2EC); // inset fields, chips (off)
  static const hairline = Color(0xFFF0EEE8); // row separators

  // Text
  static const ink = Color(0xFF141410); // headings, dark hero, nav active
  static const inkSecondary = Color(0xFF5A5A52); // body on cards
  static const muted = Color(0xFF8A8A80); // labels, captions
  static const mutedLight = Color(0xFFB4B4AB); // inactive nav

  // Accent (lime)
  static const accent = Color(0xFFC6F24A); // primary actions, active states
  static const accentTextOnLime = Color(0xFF4A5A12); // text over lime

  // Status
  static const successText = Color(0xFF2E9E5B);
  static const successBg = Color(0xFFEBFBD6);
  static const successTextStrong = Color(0xFF3D6B0F);
  static const warningText = Color(0xFF8A6D1A);
  static const warningBg = Color(0xFFF4EEDB);
  static const dangerText = Color(0xFFC0392B);
  static const dangerBg = Color(0xFFFBE4E1);
  static const infoText = Color(0xFF2F6BB0);
  static const infoBg = Color(0xFFEAF2FB);

  // Admin (dark) surfaces
  static const adminBg = Color(0xFF16160F);
  static const adminCard = Color(0xFF26261C);
  static const adminCardBorder = Color(0xFF33332A);
  static const adminText = Color(0xFFFFFFFF);
  static const adminTextMuted = Color(0xFF9C9C93);

  // Avatar accent set (initials chips)
  static const avatarAccents = <Color>[
    Color(0xFFE0913A),
    Color(0xFF7B5EC9),
    Color(0xFF3A9AD0),
    Color(0xFFC95E8E),
  ];
}
