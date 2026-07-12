import 'package:flutter/foundation.dart';
import '../api/api_client.dart';
import 'attendance_signals.dart';

/// The server-authoritative attendance state for today. Mirrors the backend
/// state machine (SRS 5.1.1).
enum AttendanceState {
  notCheckedIn,
  checkedIn,
  onBreak,
  checkedOut;

  static AttendanceState parse(String? raw) {
    switch (raw) {
      case 'checked_in':
        return AttendanceState.checkedIn;
      case 'on_break':
        return AttendanceState.onBreak;
      case 'checked_out':
        return AttendanceState.checkedOut;
      default:
        return AttendanceState.notCheckedIn;
    }
  }
}

/// Owns today's attendance for the signed-in employee. Shared by the Home hero
/// and the Attendance dial so both stay in sync after an event is marked.
class AttendanceController extends ChangeNotifier {
  AttendanceController(this._api);

  final ApiClient _api;

  AttendanceState state = AttendanceState.notCheckedIn;
  List<Map<String, dynamic>> events = const [];
  bool loading = false;
  bool marking = false;
  String? error;

  bool get isCheckedIn =>
      state == AttendanceState.checkedIn || state == AttendanceState.onBreak;

  /// The first check-in time today, if any (drives the elapsed display).
  DateTime? get checkInAt {
    for (final e in events) {
      if (e['eventType'] == 'check_in') {
        final ts = e['serverTs'] as String?;
        if (ts != null) return DateTime.tryParse(ts)?.toLocal();
      }
    }
    return null;
  }

  /// The event the primary dial action should post, or null when the day is
  /// closed (checked out).
  String? get primaryEvent {
    switch (state) {
      case AttendanceState.notCheckedIn:
        return 'check_in';
      case AttendanceState.checkedIn:
        return 'check_out';
      case AttendanceState.onBreak:
        return 'break_end';
      case AttendanceState.checkedOut:
        return null;
    }
  }

  Future<void> load() async {
    loading = true;
    error = null;
    notifyListeners();
    try {
      _apply(await _api.getAttendanceToday());
    } on ApiException catch (e) {
      error = e.message;
    } catch (e) {
      error = e.toString();
    } finally {
      loading = false;
      notifyListeners();
    }
  }

  /// Captures location plus device signals and posts the event, then refreshes
  /// from the server. Returns null on success, or a user-facing error message.
  Future<String?> mark(String eventType) async {
    if (marking) return null;
    marking = true;
    error = null;
    notifyListeners();
    try {
      final signals = await captureAttendanceSignals();
      await _api.markAttendance({'eventType': eventType, ...signals});
      _apply(await _api.getAttendanceToday());
      return null;
    } on LocationUnavailable catch (e) {
      error = e.message;
      return e.message;
    } on ApiException catch (e) {
      error = e.message;
      return e.message;
    } catch (e) {
      error = e.toString();
      return error;
    } finally {
      marking = false;
      notifyListeners();
    }
  }

  void _apply(Map<String, dynamic> today) {
    state = AttendanceState.parse(today['state'] as String?);
    final raw = today['events'];
    events = raw is List ? raw.cast<Map<String, dynamic>>() : const [];
  }
}
