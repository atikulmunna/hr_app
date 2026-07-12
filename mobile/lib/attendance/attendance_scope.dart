import 'package:flutter/widgets.dart';
import 'attendance_controller.dart';

/// Exposes the AttendanceController to the widget tree and rebuilds dependents
/// when today's attendance changes.
class AttendanceScope extends InheritedNotifier<AttendanceController> {
  const AttendanceScope({
    super.key,
    required AttendanceController controller,
    required super.child,
  }) : super(notifier: controller);

  static AttendanceController of(BuildContext context) {
    final scope = context.dependOnInheritedWidgetOfExactType<AttendanceScope>();
    assert(scope != null, 'AttendanceScope not found in the widget tree');
    return scope!.notifier!;
  }
}
