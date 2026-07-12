import 'package:flutter/material.dart';
import '../auth/auth_controller.dart';
import '../auth/auth_scope.dart';
import '../theme/app_colors.dart';
import '../theme/app_typography.dart';
import '../widgets/lime_button.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});

  @override
  State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  bool _busy = false;

  Future<void> _signIn() async {
    setState(() => _busy = true);
    await AuthScope.of(context).signIn();
    if (mounted) {
      setState(() => _busy = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final auth = AuthScope.of(context);
    return Scaffold(
      backgroundColor: AppColors.screenBg,
      body: Padding(
        padding: const EdgeInsets.all(28),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Container(
              width: 56,
              height: 56,
              alignment: Alignment.center,
              decoration: const BoxDecoration(
                color: AppColors.accent,
                shape: BoxShape.circle,
              ),
              child: const Icon(Icons.fingerprint_rounded,
                  color: AppColors.ink, size: 30),
            ),
            const SizedBox(height: 24),
            Text('Example Corp', style: AppText.screenTitle),
            const SizedBox(height: 4),
            Text('Sign in to your HRIS account', style: AppText.body),
            const SizedBox(height: 32),
            if (_busy)
              const Center(child: CircularProgressIndicator())
            else
              LimeButton(
                label: 'Sign in',
                icon: Icons.login_rounded,
                expand: true,
                onPressed: _signIn,
              ),
            if (auth.status == AuthStatus.unauthenticated &&
                auth.error != null) ...[
              const SizedBox(height: 16),
              Text(
                'Sign-in failed:',
                style: AppText.label.copyWith(color: AppColors.dangerText),
              ),
              const SizedBox(height: 4),
              Text(
                auth.error!,
                style: AppText.label.copyWith(
                  color: AppColors.dangerText,
                  fontSize: 11,
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
