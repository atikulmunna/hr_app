import 'package:flutter/widgets.dart';
import 'auth_controller.dart';

/// Exposes the AuthController to the widget tree and rebuilds dependents when
/// the auth state or profile changes.
class AuthScope extends InheritedNotifier<AuthController> {
  const AuthScope({
    super.key,
    required AuthController controller,
    required super.child,
  }) : super(notifier: controller);

  static AuthController of(BuildContext context) {
    final scope =
        context.dependOnInheritedWidgetOfExactType<AuthScope>();
    assert(scope != null, 'AuthScope not found in the widget tree');
    return scope!.notifier!;
  }
}
