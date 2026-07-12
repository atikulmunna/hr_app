import 'package:flutter/material.dart';
import '../theme/app_colors.dart';
import '../theme/app_dimens.dart';
import '../theme/app_typography.dart';
import '../widgets/app_card.dart';
import '../widgets/section_header.dart';

class PayScreen extends StatefulWidget {
  const PayScreen({super.key});

  @override
  State<PayScreen> createState() => _PayScreenState();
}

class _PayScreenState extends State<PayScreen> {
  bool _open = false;

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
        Text('Pay', style: AppText.screenTitle),
        const SizedBox(height: 20),
        _hero(),
        if (_open) ...[
          const SizedBox(height: AppSpacing.cardGap),
          _breakdown(),
        ],
        const SectionHeader('History'),
        _historyRow('May 2026', 'Paid 28 May', 'BDT 145,000'),
        _historyRow('April 2026', 'Paid 28 Apr', 'BDT 142,000'),
        _historyRow('March 2026', 'Paid 28 Mar', 'BDT 142,000'),
      ],
    );
  }

  Widget _hero() {
    return Container(
      padding: const EdgeInsets.all(22),
      decoration: BoxDecoration(
        color: AppColors.ink,
        borderRadius: BorderRadius.circular(AppRadii.hero),
        boxShadow: AppShadows.heroDark,
        gradient: const RadialGradient(
          center: Alignment(1.1, -1.1),
          radius: 1.2,
          colors: [Color(0x33C6F24A), Color(0x00141410)],
          stops: [0, 0.6],
        ),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Net pay - June 2026',
            style: AppText.label.copyWith(color: AppColors.adminTextMuted),
          ),
          const SizedBox(height: 10),
          Text('BDT 145,000', style: AppText.hero),
          const SizedBox(height: 6),
          Text(
            'Paid on 28 Jun - City Bank ....4021',
            style: AppText.label.copyWith(color: AppColors.adminTextMuted),
          ),
          const SizedBox(height: 18),
          GestureDetector(
            onTap: () => setState(() => _open = !_open),
            child: Row(
              children: [
                Text(
                  _open ? 'Hide breakdown' : 'View breakdown',
                  style: AppText.pill.copyWith(color: AppColors.accent),
                ),
                Icon(
                  _open ? Icons.expand_less_rounded : Icons.expand_more_rounded,
                  color: AppColors.accent,
                  size: 18,
                ),
              ],
            ),
          ),
        ],
      ),
    );
  }

  Widget _breakdown() {
    return AppCard(
      child: Column(
        children: [
          _line('Basic', 'BDT 90,000'),
          _line('House & allowances', 'BDT 52,000'),
          _line('Overtime (6.5h)', '+BDT 6,500', color: AppColors.successText),
          _line('Tax & PF', '-BDT 3,500', color: AppColors.dangerText),
          const Divider(height: 20, color: AppColors.hairline),
          _line('Net pay', 'BDT 145,000', bold: true),
        ],
      ),
    );
  }

  Widget _line(String label, String value, {Color? color, bool bold = false}) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 6),
      child: Row(
        mainAxisAlignment: MainAxisAlignment.spaceBetween,
        children: [
          Text(label, style: bold ? AppText.rowTitle : AppText.body),
          Text(
            value,
            style: (bold ? AppText.rowTitle : AppText.body)
                .copyWith(color: color ?? AppColors.ink),
          ),
        ],
      ),
    );
  }

  Widget _historyRow(String month, String paid, String amount) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.cardGap),
      child: AppCard(
        child: Row(
          children: [
            Container(
              width: 44,
              height: 44,
              decoration: BoxDecoration(
                color: AppColors.subtleFill,
                borderRadius: BorderRadius.circular(AppRadii.iconTile),
              ),
              child: const Icon(Icons.description_rounded, color: AppColors.ink),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(month, style: AppText.rowTitle),
                  const SizedBox(height: 2),
                  Text(paid, style: AppText.label),
                ],
              ),
            ),
            Text(amount, style: AppText.rowTitle),
          ],
        ),
      ),
    );
  }
}
