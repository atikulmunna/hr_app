import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'app_colors.dart';

/// Typography scale from ui_design/README.md, built on Hanken Grotesk.
abstract final class AppText {
  static TextStyle _base(
    double size,
    FontWeight weight, {
    Color color = AppColors.ink,
    double letterSpacing = 0,
    double? height,
  }) =>
      GoogleFonts.hankenGrotesk(
        fontSize: size,
        fontWeight: weight,
        color: color,
        letterSpacing: letterSpacing,
        height: height,
      );

  static TextStyle get screenTitle =>
      _base(24, FontWeight.w700, letterSpacing: -0.48);

  static TextStyle get hero =>
      _base(40, FontWeight.w800, letterSpacing: -1.2, color: AppColors.surface);

  static TextStyle get statNumber =>
      _base(28, FontWeight.w800, letterSpacing: -0.84);

  static TextStyle get rowTitle => _base(15, FontWeight.w700);

  static TextStyle get body =>
      _base(14, FontWeight.w500, color: AppColors.inkSecondary);

  static TextStyle get label =>
      _base(13, FontWeight.w600, color: AppColors.muted);

  static TextStyle get sectionHeader =>
      _base(14, FontWeight.w600, color: AppColors.muted);

  static TextStyle get pill =>
      _base(12, FontWeight.w700, color: AppColors.ink);
}
