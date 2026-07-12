import 'package:flutter_test/flutter_test.dart';
import 'package:hris/main.dart';
import 'package:hris/widgets/check_in_hero.dart';

void main() {
  testWidgets('Home renders the check-in hero and toggles', (tester) async {
    await tester.pumpWidget(const HrisApp());
    await tester.pump();

    // The check-in hero shows the elapsed time and a Check out action.
    expect(find.byType(CheckInHero), findsOneWidget);
    expect(find.text('Check out'), findsOneWidget);

    // Tapping toggles to the checked-out state.
    await tester.tap(find.text('Check out'));
    await tester.pump();
    expect(find.text('Check in'), findsOneWidget);
  });
}
