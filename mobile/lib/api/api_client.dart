import 'dart:convert';
import 'package:http/http.dart' as http;
import '../config/app_config.dart';

class ApiException implements Exception {
  ApiException(this.status, this.message);
  final int status;
  final String message;

  @override
  String toString() => 'ApiException($status): $message';
}

/// Thin backend client. Attaches the bearer token from the provided callback.
class ApiClient {
  ApiClient(this._token);

  final Future<String?> Function() _token;

  // A request that does not answer within this window fails, rather than leaving
  // a screen stuck on a spinner when connectivity drops mid-request.
  static const _timeout = Duration(seconds: 20);

  Future<Map<String, dynamic>> getProfile() => _getJson('/me/profile');

  /// The caller's identity as the backend sees it: roles and permissions.
  Future<Map<String, dynamic>> getMe() => _getJson('/auth/me');

  /// The employee's own payslips (locked or approved runs), newest first.
  Future<List<Map<String, dynamic>>> getPayslips() =>
      _getList('/me/payslips');

  /// One payslip as data: period, totals, and every pay line.
  Future<Map<String, dynamic>> getPayslipDetail(String runId) =>
      _getJson('/me/payslips/$runId/detail');

  /// The caller's direct reports with each one's status today. Empty for a
  /// non-manager.
  Future<List<Map<String, dynamic>>> getTeam() => _getList('/me/team');

  /// Requests whose current step the caller's roles may decide.
  Future<List<Map<String, dynamic>>> getPendingApprovals() =>
      _getList('/approvals/pending');

  /// Approves or rejects a request at its current step.
  Future<Map<String, dynamic>> decideApproval(
    String id,
    String decision, {
    String? comment,
  }) => _postJson('/approvals/$id/decide', {
    'decision': decision,
    'comment': ?comment,
  });

  /// HR analytics (analytics:read). Each returns the dashboard's summary shape.
  Future<Map<String, dynamic>> getHeadcount() => _getJson('/analytics/headcount');
  Future<Map<String, dynamic>> getOvertimeAnalytics({int months = 1}) =>
      _getJson('/analytics/overtime?months=$months');
  Future<Map<String, dynamic>> getAttrition({int months = 12}) =>
      _getJson('/analytics/attrition?months=$months');

  /// Payroll runs, newest period first (payroll:read).
  Future<List<Map<String, dynamic>>> getPayrollRuns() =>
      _getList('/payroll/runs');

  /// Job requisitions (recruitment:read).
  Future<List<Map<String, dynamic>>> getRequisitions() =>
      _getList('/recruitment/requisitions');

  /// Directly edits the caller's non-sensitive contact fields (phone, emergency
  /// contact). Body: phone, emergencyContactName, emergencyContactPhone.
  Future<Map<String, dynamic>> updateProfileContact(
    Map<String, dynamic> body,
  ) => _patchJson('/me/profile', body);

  /// Submits a sensitive profile change (name) for HR approval. Body:
  /// firstName, lastName.
  Future<Map<String, dynamic>> requestProfileChange(
    Map<String, dynamic> body,
  ) => _postJson('/me/profile/change-requests', body);

  /// The caller's own profile change requests, newest first.
  Future<List<Map<String, dynamic>>> getProfileChangeRequests() =>
      _getList('/me/profile/change-requests');

  Future<Map<String, dynamic>> getAttendanceToday() =>
      _getJson('/me/attendance/today');

  /// The employee's leave balances per applicable leave type.
  Future<List<Map<String, dynamic>>> getLeaveBalances() =>
      _getList('/me/leave/balances');

  /// The employee's own leave requests, newest first.
  Future<List<Map<String, dynamic>>> getLeaveRequests() =>
      _getList('/me/leave/requests');

  /// Applies for leave. Body: leaveTypeId, startDate, endDate (YYYY-MM-DD),
  /// optional reason.
  Future<Map<String, dynamic>> applyLeave(Map<String, dynamic> body) =>
      _postJson('/me/leave/requests', body);

  /// The employee's own attendance correction (regularization) requests.
  Future<List<Map<String, dynamic>>> getRegularizations() =>
      _getList('/me/attendance/regularizations');

  /// Submits an attendance correction. Body: targetDate, correctionType,
  /// requestedCheckIn/requestedCheckOut (ISO), reason.
  Future<Map<String, dynamic>> submitRegularization(
    Map<String, dynamic> body,
  ) => _postJson('/me/attendance/regularizations', body);

  /// The employee's own roster (per-date shifts) in a date range.
  Future<List<Map<String, dynamic>>> getRoster(String from, String to) =>
      _getList('/me/roster?from=$from&to=$to');

  /// Upcoming roster days of the employee's peers, to pick a swap counterparty.
  Future<List<Map<String, dynamic>>> getSwappable(String from, String to) =>
      _getList('/me/roster/swappable?from=$from&to=$to');

  /// The employee's shift-swap requests (as requester or counterparty).
  Future<List<Map<String, dynamic>>> getShiftSwaps() =>
      _getList('/me/attendance/shift-swaps');

  /// Requests a shift swap. Body: requesterEntryId, counterpartyEntryId, reason.
  Future<Map<String, dynamic>> requestShiftSwap(Map<String, dynamic> body) =>
      _postJson('/me/attendance/shift-swaps', body);

  /// Posts one attendance event (check_in/check_out/break_start/break_end)
  /// with the captured location and device signals.
  Future<Map<String, dynamic>> markAttendance(Map<String, dynamic> body) =>
      _postJson('/me/attendance/events', body);

  /// Raises an approval-gated device-change request for the current device.
  Future<Map<String, dynamic>> requestDeviceRebind(Map<String, dynamic> body) =>
      _postJson('/me/devices/rebind-requests', body);

  /// Syncs a batch of offline-captured marks. Returns a per-event result
  /// ({ clientId, status: accepted|duplicate|rejected, ... }).
  Future<List<Map<String, dynamic>>> syncOfflineMarks(
    List<Map<String, dynamic>> events,
  ) async {
    final token = await _token();
    final res = await http
        .post(
          Uri.parse('${AppConfig.apiBase}/me/attendance/events/sync'),
          headers: {
            'Content-Type': 'application/json',
            if (token != null) 'Authorization': 'Bearer $token',
          },
          body: json.encode({'events': events}),
        )
        .timeout(_timeout);
    return _decodeList(res);
  }

  Future<Map<String, dynamic>> _getJson(String path) async {
    final token = await _token();
    final res = await http
        .get(
          Uri.parse('${AppConfig.apiBase}$path'),
          headers: {if (token != null) 'Authorization': 'Bearer $token'},
        )
        .timeout(_timeout);
    return _decode(res);
  }

  Future<Map<String, dynamic>> _patchJson(
    String path,
    Map<String, dynamic> body,
  ) async {
    final token = await _token();
    final res = await http
        .patch(
          Uri.parse('${AppConfig.apiBase}$path'),
          headers: {
            'Content-Type': 'application/json',
            if (token != null) 'Authorization': 'Bearer $token',
          },
          body: json.encode(body),
        )
        .timeout(_timeout);
    return _decode(res);
  }

  Future<List<Map<String, dynamic>>> _getList(String path) async {
    final token = await _token();
    final res = await http
        .get(
          Uri.parse('${AppConfig.apiBase}$path'),
          headers: {if (token != null) 'Authorization': 'Bearer $token'},
        )
        .timeout(_timeout);
    return _decodeList(res);
  }

  Future<Map<String, dynamic>> _postJson(
    String path,
    Map<String, dynamic> body,
  ) async {
    final token = await _token();
    final res = await http
        .post(
          Uri.parse('${AppConfig.apiBase}$path'),
          headers: {
            'Content-Type': 'application/json',
            if (token != null) 'Authorization': 'Bearer $token',
          },
          body: json.encode(body),
        )
        .timeout(_timeout);
    return _decode(res);
  }

  Map<String, dynamic> _decode(http.Response res) {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      return json.decode(res.body) as Map<String, dynamic>;
    }
    throw _error(res);
  }

  List<Map<String, dynamic>> _decodeList(http.Response res) {
    if (res.statusCode >= 200 && res.statusCode < 300) {
      final decoded = json.decode(res.body);
      return decoded is List ? decoded.cast<Map<String, dynamic>>() : const [];
    }
    throw _error(res);
  }

  // The backend returns Nest error envelopes: { message, ... }. Surface the
  // human-readable message when present, else the raw body.
  ApiException _error(http.Response res) {
    String message = res.body;
    try {
      final decoded = json.decode(res.body);
      if (decoded is Map && decoded['message'] != null) {
        final m = decoded['message'];
        message = m is List ? m.join(', ') : m.toString();
      }
    } catch (_) {
      // Non-JSON body; keep the raw text.
    }
    return ApiException(res.statusCode, message);
  }
}
