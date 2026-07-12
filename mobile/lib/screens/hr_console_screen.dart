import 'package:flutter/material.dart';
import '../theme/app_colors.dart';
import '../theme/app_dimens.dart';
import '../theme/app_typography.dart';

/// HR Console (admin), the dark-themed org-wide surface. Reached from Team.
class HrConsoleScreen extends StatelessWidget {
  const HrConsoleScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.adminBg,
      body: ListView(
        padding: const EdgeInsets.fromLTRB(
          AppSpacing.screenHPad,
          AppSpacing.screenTopPad,
          AppSpacing.screenHPad,
          40,
        ),
        children: [
          _header(context),
          const SizedBox(height: 20),
          _headcountHero(),
          const SizedBox(height: AppSpacing.cardGap),
          _kpiGrid(),
          _sectionHeader('Overtime by team'),
          _overtimeBars(),
          _sectionHeader('Payroll - July 2026'),
          _payrollCard(),
        ],
      ),
    );
  }

  Widget _header(BuildContext context) {
    return Row(
      children: [
        GestureDetector(
          onTap: () => Navigator.of(context).pop(),
          child: Container(
            width: 40,
            height: 40,
            decoration: BoxDecoration(
              color: AppColors.adminCard,
              borderRadius: BorderRadius.circular(AppRadii.iconTile),
            ),
            child: const Icon(Icons.chevron_left_rounded,
                color: AppColors.adminText),
          ),
        ),
        const SizedBox(width: 12),
        Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'HR Console',
              style: AppText.screenTitle.copyWith(color: AppColors.adminText),
            ),
            Text(
              'Example Corp - 3 entities',
              style: AppText.label.copyWith(color: AppColors.adminTextMuted),
            ),
          ],
        ),
      ],
    );
  }

  Widget _darkCard({required Widget child, Color? color, Gradient? gradient}) {
    return Container(
      padding: const EdgeInsets.all(18),
      decoration: BoxDecoration(
        color: color ?? AppColors.adminCard,
        gradient: gradient,
        borderRadius: BorderRadius.circular(AppRadii.card),
        border: Border.all(color: AppColors.adminCardBorder),
      ),
      child: child,
    );
  }

  Widget _headcountHero() {
    return _darkCard(
      gradient: const LinearGradient(
        begin: Alignment.topLeft,
        end: Alignment.bottomRight,
        colors: [Color(0xFF1C1C16), Color(0xFF26261C)],
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text('Total headcount',
              style: AppText.label.copyWith(color: AppColors.adminTextMuted)),
          const SizedBox(height: 8),
          Row(
            crossAxisAlignment: CrossAxisAlignment.end,
            children: [
              Text('248',
                  style: AppText.hero.copyWith(color: AppColors.adminText)),
              const SizedBox(width: 10),
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Text('+12 this quarter',
                    style: AppText.label.copyWith(color: AppColors.accent)),
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text('Present today 231 - 93% - 17 on leave',
              style: AppText.label.copyWith(color: AppColors.adminTextMuted)),
        ],
      ),
    );
  }

  Widget _kpiGrid() {
    return GridView.count(
      crossAxisCount: 2,
      shrinkWrap: true,
      physics: const NeverScrollableScrollPhysics(),
      mainAxisSpacing: AppSpacing.cardGap,
      crossAxisSpacing: AppSpacing.cardGap,
      childAspectRatio: 1.4,
      children: [
        _kpi('1,284 h', 'Overtime this month', sub: '~ BDT 6.4L payable',
            lime: true),
        _kpi('37', 'Pending approvals', sub: '8 escalated'),
        _kpi('4.2%', 'Attrition YTD'),
        _kpi('14', 'Open roles'),
      ],
    );
  }

  Widget _kpi(String value, String label, {String? sub, bool lime = false}) {
    final onColor = lime ? AppColors.accentTextOnLime : AppColors.adminText;
    final subColor =
        lime ? AppColors.accentTextOnLime : AppColors.adminTextMuted;
    return _darkCard(
      color: lime ? AppColors.accent : AppColors.adminCard,
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        mainAxisAlignment: MainAxisAlignment.center,
        children: [
          Text(value, style: AppText.statNumber.copyWith(color: onColor)),
          const SizedBox(height: 4),
          Text(label, style: AppText.label.copyWith(color: subColor)),
          if (sub != null) ...[
            const SizedBox(height: 2),
            Text(sub,
                style: AppText.label.copyWith(color: subColor, fontSize: 12)),
          ],
        ],
      ),
    );
  }

  Widget _overtimeBars() {
    const teams = [
      ('Doc Intelligence', 412, 1.0),
      ('Platform', 318, 0.77),
      ('Design', 210, 0.51),
      ('Ops', 144, 0.35),
    ];
    return _darkCard(
      child: Column(
        children: teams.map((t) {
          final (name, hours, frac) = t;
          return Padding(
            padding: const EdgeInsets.symmetric(vertical: 8),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  mainAxisAlignment: MainAxisAlignment.spaceBetween,
                  children: [
                    Text(name,
                        style: AppText.label
                            .copyWith(color: AppColors.adminText)),
                    Text('${hours}h',
                        style: AppText.label
                            .copyWith(color: AppColors.adminTextMuted)),
                  ],
                ),
                const SizedBox(height: 6),
                ClipRRect(
                  borderRadius: BorderRadius.circular(6),
                  child: LinearProgressIndicator(
                    value: frac,
                    minHeight: 8,
                    backgroundColor: AppColors.adminCardBorder,
                    valueColor:
                        const AlwaysStoppedAnimation(AppColors.accent),
                  ),
                ),
              ],
            ),
          );
        }).toList(),
      ),
    );
  }

  Widget _payrollCard() {
    return _darkCard(
      child: Row(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: BoxDecoration(
              color: AppColors.adminBg,
              borderRadius: BorderRadius.circular(AppRadii.iconTile),
            ),
            child: const Icon(Icons.schedule_rounded,
                color: AppColors.accent),
          ),
          const SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text('Run scheduled - 28 Jul',
                    style:
                        AppText.rowTitle.copyWith(color: AppColors.adminText)),
                const SizedBox(height: 2),
                Text('248 employees - BDT 3.6 Cr gross',
                    style: AppText.label
                        .copyWith(color: AppColors.adminTextMuted)),
              ],
            ),
          ),
          Container(
            padding:
                const EdgeInsets.symmetric(horizontal: 10, vertical: 5),
            decoration: BoxDecoration(
              color: AppColors.warningBg,
              borderRadius: BorderRadius.circular(AppRadii.pill),
            ),
            child: Text('Draft',
                style: AppText.pill.copyWith(color: AppColors.warningText)),
          ),
        ],
      ),
    );
  }

  Widget _sectionHeader(String text) {
    return Padding(
      padding: const EdgeInsets.fromLTRB(4, 24, 4, 12),
      child: Text(text,
          style: AppText.sectionHeader.copyWith(color: AppColors.adminTextMuted)),
    );
  }
}
