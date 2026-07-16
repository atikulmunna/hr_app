import 'package:flutter/foundation.dart';
import '../api/api_client.dart';
import 'attendance_signals.dart';
import 'device_identity.dart';
import 'offline_queue.dart';

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
  AttendanceController(this._api, [OfflineQueue? queue])
      : _queue = queue ?? OfflineQueue();

  final ApiClient _api;
  final OfflineQueue _queue;

  AttendanceState state = AttendanceState.notCheckedIn;
  List<Map<String, dynamic>> events = const [];
  bool loading = false;
  bool marking = false;
  String? error;

  /// Number of marks captured offline that are waiting to sync.
  int pendingSync = 0;

  /// True when the last mark was hard-blocked because this device is not the
  /// employee's bound device, so the UI can offer a device-change request.
  bool needsRebind = false;

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
    pendingSync = await _queue.count();
    notifyListeners();
    try {
      // Flush anything captured offline first, so synced marks show on refresh.
      await flushQueue();
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

  /// Sends any queued offline marks and drops the ones the server has processed
  /// (accepted, duplicate, or rejected). Silent no-op while still offline.
  Future<void> flushQueue() async {
    final items = await _queue.all();
    if (items.isEmpty) {
      pendingSync = 0;
      return;
    }
    try {
      final results = await _api.syncOfflineMarks(items);
      final processed = <String>{
        for (final r in results)
          if (r['clientId'] is String) r['clientId'] as String,
      };
      await _queue.remove(processed);
      pendingSync = await _queue.count();
      notifyListeners();
    } catch (_) {
      // Still offline; keep the queue for the next attempt.
    }
  }

  /// Captures location plus device signals and posts the event, then refreshes
  /// from the server. Returns null on success, or a user-facing error message.
  Future<String?> mark(String eventType) async {
    if (marking) return null;
    marking = true;
    error = null;
    needsRebind = false;
    notifyListeners();
    try {
      final Map<String, dynamic> signals;
      try {
        signals = await captureAttendanceSignals();
      } on LocationUnavailable catch (e) {
        error = e.message;
        return e.message;
      }

      try {
        await _api.markAttendance({'eventType': eventType, ...signals});
      } on ApiException catch (e) {
        error = e.message;
        // The device-binding gate is the one block an employee can act on, by
        // requesting an approved re-bind (FR-DB-04).
        needsRebind = e.status == 400 && e.message.contains('not registered');
        return e.message;
      } catch (_) {
        // No server response (offline): queue the mark for later sync. Only the
        // failed POST is queued, so a mark that reached the server is never
        // duplicated.
        await _queue.add(signals, eventType);
        pendingSync = await _queue.count();
        return 'Saved offline. It will sync when you are back online.';
      }

      // The mark reached the server. Flush any backlog and refresh, best effort.
      try {
        await flushQueue();
        _apply(await _api.getAttendanceToday());
      } catch (_) {
        // Refresh can wait for the next load.
      }
      return null;
    } finally {
      marking = false;
      notifyListeners();
    }
  }

  /// Submits an approval-gated device-change request for this device with the
  /// reason the employee picked. Returns null on success, or an error message.
  Future<String?> requestRebind(String reasonCode) async {
    try {
      await _api.requestDeviceRebind({
        'reasonCode': reasonCode,
        'deviceFingerprint': await DeviceIdentity.fingerprint(),
        'platform': DeviceIdentity.platform,
      });
      needsRebind = false;
      notifyListeners();
      return null;
    } on ApiException catch (e) {
      return e.message;
    } catch (e) {
      return e.toString();
    }
  }

  void _apply(Map<String, dynamic> today) {
    state = AttendanceState.parse(today['state'] as String?);
    final raw = today['events'];
    events = raw is List ? raw.cast<Map<String, dynamic>>() : const [];
  }
}
