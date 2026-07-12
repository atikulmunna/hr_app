import 'package:flutter/material.dart';
import '../theme/app_typography.dart';

/// Muted section label with the handoff's 24/12 vertical rhythm.
class SectionHeader extends StatelessWidget {
  const SectionHeader(this.text, {super.key});

  final String text;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 24, 4, 12),
      child: Text(text, style: AppText.sectionHeader),
    );
  }
}
