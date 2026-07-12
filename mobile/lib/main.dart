import 'package:flutter/material.dart';
import 'auth/auth_controller.dart';
import 'auth/auth_scope.dart';
import 'screens/app_shell.dart';
import 'screens/login_screen.dart';
import 'theme/app_colors.dart';
import 'theme/app_theme.dart';

void main() {
  runApp(const HrisApp());
}

class HrisApp extends StatefulWidget {
  const HrisApp({super.key});

  @override
  State<HrisApp> createState() => _HrisAppState();
}

class _HrisAppState extends State<HrisApp> {
  final AuthController _auth = AuthController();

  @override
  void initState() {
    super.initState();
    _auth.init();
  }

  @override
  void dispose() {
    _auth.dispose();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return AuthScope(
      controller: _auth,
      child: MaterialApp(
        title: 'HRIS',
        debugShowCheckedModeBanner: false,
        theme: AppTheme.light,
        home: ListenableBuilder(
          listenable: _auth,
          builder: (context, _) {
            switch (_auth.status) {
              case AuthStatus.unknown:
                return const _Splash();
              case AuthStatus.authenticated:
                return const AppShell();
              case AuthStatus.unauthenticated:
                return const LoginScreen();
            }
          },
        ),
      ),
    );
  }
}

class _Splash extends StatelessWidget {
  const _Splash();

  @override
  Widget build(BuildContext context) {
    return const Scaffold(
      backgroundColor: AppColors.screenBg,
      body: Center(child: CircularProgressIndicator()),
    );
  }
}
