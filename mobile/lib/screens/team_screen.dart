import 'package:flutter/material.dart';
import '../theme/app_colors.dart';
import '../theme/app_dimens.dart';
import '../theme/app_typography.dart';
import '../widgets/app_card.dart';
import '../widgets/section_header.dart';
import '../widgets/status_pill.dart';
import 'hr_console_screen.dart';

class _Approval {
  const _Approval(this.name, this.role, this.type, this.detail, this.color);
  final String name;
  final String role;
  final String type;
  final String detail;
  final Color color;
}

class TeamScreen extends StatefulWidget {
  const TeamScreen({super.key});

  @override
  State<TeamScreen> createState() => _TeamScreenState();
}

class _TeamScreenState extends State<TeamScreen> {
  final List<_Approval> _approvals = [
    _Approval('Karim Hasan', 'Engineer', 'Leave', 'Annual - 2 days',
        AppColors.avatarAccents[0]),
    _Approval('Nadia Islam', 'Designer', 'Expense', 'BDT 4,200 - travel',
        AppColors.avatarAccents[1]),
    _Approval('Rafi Ahmed', 'Analyst', 'Regularize', 'Missed check-in Jun 21',
        AppColors.avatarAccents[2]),
  ];

  void _decide(_Approval a) => setState(() => _approvals.remove(a));

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
        Row(
          children: [
            Expanded(child: Text('Team', style: AppText.screenTitle)),
            _pendingPill(),
          ],
        ),
        const SizedBox(height: 20),
        _hrConsoleButton(),
        const SizedBox(height: 20),
        _statRow(),
        const SectionHeader('Pending approvals'),
        if (_approvals.isEmpty) _allClear() else ..._approvals.map(_card),
        const SectionHeader('Team today'),
        _rosterRow('Sadia Karim', 'In office', PillStatus.approved),
        _rosterRow('Tanvir Alam', 'Remote', PillStatus.remote),
        _rosterRow('Mira Chowdhury', 'On leave', PillStatus.pending),
      ],
    );
  }

  Widget _pendingPill() {
    final count = _approvals.length;
    final clear = count == 0;
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 6),
      decoration: BoxDecoration(
        color: clear ? AppColors.successBg : AppColors.ink,
        borderRadius: BorderRadius.circular(AppRadii.pill),
      ),
      child: Text(
        clear ? 'All clear' : '$count pending',
        style: AppText.pill.copyWith(
          color: clear ? AppColors.successTextStrong : AppColors.accent,
        ),
      ),
    );
  }

  Widget _hrConsoleButton() {
    return GestureDetector(
      onTap: () => Navigator.of(context).push(
        MaterialPageRoute(builder: (_) => const HrConsoleScreen()),
      ),
      child: Container(
        padding: const EdgeInsets.all(16),
        decoration: BoxDecoration(
          color: AppColors.ink,
          borderRadius: BorderRadius.circular(AppRadii.compact),
        ),
        child: Row(
          children: [
            Container(
              width: 40,
              height: 40,
              alignment: Alignment.center,
              decoration: BoxDecoration(
                color: AppColors.accent,
                borderRadius: BorderRadius.circular(AppRadii.iconTile),
              ),
              child: const Icon(Icons.bar_chart_rounded, color: AppColors.ink),
            ),
            const SizedBox(width: 12),
            Expanded(
              child: Text(
                'HR Console',
                style: AppText.rowTitle.copyWith(color: AppColors.surface),
              ),
            ),
            const Icon(Icons.chevron_right_rounded, color: AppColors.mutedLight),
          ],
        ),
      ),
    );
  }

  Widget _statRow() {
    return Row(
      children: const [
        Expanded(child: _MiniStat('9', 'Present')),
        SizedBox(width: AppSpacing.cardGap),
        Expanded(child: _MiniStat('2', 'On leave')),
        SizedBox(width: AppSpacing.cardGap),
        Expanded(child: _MiniStat('3', 'Remote')),
      ],
    );
  }

  Widget _card(_Approval a) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.cardGap),
      child: AppCard(
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Row(
              children: [
                _avatar(a.name, a.color),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(a.name, style: AppText.rowTitle),
                      const SizedBox(height: 2),
                      Text(a.role, style: AppText.label),
                    ],
                  ),
                ),
                StatusPill(a.type),
              ],
            ),
            const SizedBox(height: 10),
            Text(a.detail, style: AppText.body),
            const SizedBox(height: 14),
            Row(
              children: [
                Expanded(
                  child: GestureDetector(
                    onTap: () => _decide(a),
                    child: Container(
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: AppColors.subtleFill,
                        borderRadius: BorderRadius.circular(AppRadii.pill),
                      ),
                      child: Text('Decline', style: AppText.pill),
                    ),
                  ),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: GestureDetector(
                    onTap: () => _decide(a),
                    child: Container(
                      padding: const EdgeInsets.symmetric(vertical: 12),
                      alignment: Alignment.center,
                      decoration: BoxDecoration(
                        color: AppColors.accent,
                        borderRadius: BorderRadius.circular(AppRadii.pill),
                      ),
                      child: Text(
                        'Approve',
                        style: AppText.pill
                            .copyWith(color: AppColors.accentTextOnLime),
                      ),
                    ),
                  ),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }

  Widget _allClear() {
    return AppCard(
      child: Column(
        children: [
          Container(
            width: 44,
            height: 44,
            decoration: const BoxDecoration(
              color: AppColors.successBg,
              shape: BoxShape.circle,
            ),
            child: const Icon(Icons.check_rounded,
                color: AppColors.successTextStrong),
          ),
          const SizedBox(height: 10),
          Text('All caught up', style: AppText.rowTitle),
        ],
      ),
    );
  }

  Widget _rosterRow(String name, String status, PillStatus s) {
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.cardGap),
      child: AppCard(
        child: Row(
          children: [
            _avatar(name, AppColors.avatarAccents[3]),
            const SizedBox(width: 12),
            Expanded(child: Text(name, style: AppText.rowTitle)),
            StatusPill(status, status: s),
          ],
        ),
      ),
    );
  }

  Widget _avatar(String name, Color color) {
    final initials = name
        .split(' ')
        .take(2)
        .map((p) => p.isEmpty ? '' : p[0])
        .join();
    return Container(
      width: 44,
      height: 44,
      alignment: Alignment.center,
      decoration: BoxDecoration(color: color, shape: BoxShape.circle),
      child: Text(
        initials,
        style: AppText.pill.copyWith(color: AppColors.surface),
      ),
    );
  }
}

class _MiniStat extends StatelessWidget {
  const _MiniStat(this.value, this.label);
  final String value;
  final String label;

  @override
  Widget build(BuildContext context) {
    return AppCard(
      padding: const EdgeInsets.symmetric(vertical: 16, horizontal: 12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(value, style: AppText.statNumber),
          const SizedBox(height: 4),
          Text(label, style: AppText.label.copyWith(fontSize: 12)),
        ],
      ),
    );
  }
}
