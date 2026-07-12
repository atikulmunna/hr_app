import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hris/auth/auth_controller.dart';
import 'package:hris/auth/auth_scope.dart';
import 'package:hris/screens/home_screen.dart';
import 'package:hris/widgets/check_in_hero.dart';

void main() {
  testWidgets('Home renders the check-in hero and toggles', (tester) async {
    await tester.pumpWidget(
      AuthScope(
        controller: AuthController(),
        child: const MaterialApp(home: Scaffold(body: HomeScreen())),
      ),
    );
    await tester.pump();

    // The check-in hero shows a Check out action while checked in.
    expect(find.byType(CheckInHero), findsOneWidget);
    expect(find.text('Check out'), findsOneWidget);

    // Tapping toggles to the checked-out state.
    await tester.tap(find.text('Check out'));
    await tester.pump();
    expect(find.text('Check in'), findsOneWidget);
  });
}
