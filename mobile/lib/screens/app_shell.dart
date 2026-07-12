import 'package:flutter/material.dart';
import '../theme/app_colors.dart';
import '../widgets/floating_nav_bar.dart';
import 'home_screen.dart';
import 'placeholder_screen.dart';

/// Top-level navigation shell: a screen body with the floating pill nav.
class AppShell extends StatefulWidget {
  const AppShell({super.key});

  @override
  State<AppShell> createState() => _AppShellState();
}

class _AppShellState extends State<AppShell> {
  int _index = 0;

  static const _screens = <Widget>[
    HomeScreen(),
    PlaceholderScreen(title: 'Leave', icon: Icons.beach_access_rounded),
    PlaceholderScreen(title: 'Attendance', icon: Icons.fingerprint_rounded),
    PlaceholderScreen(title: 'Team', icon: Icons.groups_rounded),
    PlaceholderScreen(title: 'Pay', icon: Icons.payments_rounded),
  ];

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.screenBg,
      body: Stack(
        children: [
          AnimatedSwitcher(
            duration: const Duration(milliseconds: 320),
            child: KeyedSubtree(
              key: ValueKey(_index),
              child: _screens[_index],
            ),
          ),
          Positioned(
            left: 16,
            right: 16,
            bottom: 16,
            child: FloatingNavBar(
              index: _index,
              onSelect: (i) => setState(() => _index = i),
            ),
          ),
        ],
      ),
    );
  }
}
