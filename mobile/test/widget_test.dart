import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:hris/api/api_client.dart';
import 'package:hris/attendance/attendance_controller.dart';
import 'package:hris/attendance/attendance_scope.dart';
import 'package:hris/auth/auth_controller.dart';
import 'package:hris/auth/auth_scope.dart';
import 'package:hris/screens/home_screen.dart';
import 'package:hris/widgets/check_in_hero.dart';

void main() {
  testWidgets('Home renders the check-in hero from attendance state',
      (tester) async {
    // A fresh controller stays in the default not-checked-in state without any
    // network or plugin calls (load() is what would touch them).
    final attendance = AttendanceController(ApiClient(() async => null));

    await tester.pumpWidget(
      AuthScope(
        controller: AuthController(),
        child: AttendanceScope(
          controller: attendance,
          child: const MaterialApp(home: Scaffold(body: HomeScreen())),
        ),
      ),
    );
    await tester.pump();

    // The hero renders and, not checked in, offers a Check in action.
    expect(find.byType(CheckInHero), findsOneWidget);
    expect(find.text('Check in'), findsOneWidget);
  });
}
