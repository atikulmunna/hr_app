import 'dart:convert';
import 'dart:math';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// An encrypted on-device queue of attendance marks captured while offline
/// (T-1C.7, NFR-S-05). Backed by flutter_secure_storage (Keystore-backed on
/// Android), it holds a JSON list of pending marks, each with a client-generated
/// idempotency key so a re-sync never double-counts.
class OfflineQueue {
  OfflineQueue([FlutterSecureStorage? storage])
      : _storage = storage ?? const FlutterSecureStorage();

  static const _key = 'offline_marks';
  final FlutterSecureStorage _storage;

  /// Adds a captured mark to the queue. The caller supplies the signal payload;
  /// this stamps a client id and capture time.
  Future<Map<String, dynamic>> add(Map<String, dynamic> signals, String eventType) async {
    final items = await all();
    final mark = <String, dynamic>{
      'clientId': _newClientId(),
      'eventType': eventType,
      'capturedAt': DateTime.now().toUtc().toIso8601String(),
      ...signals,
    };
    items.add(mark);
    await _save(items);
    return mark;
  }

  Future<List<Map<String, dynamic>>> all() async {
    final raw = await _storage.read(key: _key);
    if (raw == null || raw.isEmpty) return [];
    final decoded = json.decode(raw);
    return decoded is List ? decoded.cast<Map<String, dynamic>>() : [];
  }

  Future<int> count() async => (await all()).length;

  /// Removes the marks whose client ids the server has processed (accepted,
  /// duplicate, or permanently rejected), leaving any it did not answer for.
  Future<void> remove(Set<String> clientIds) async {
    if (clientIds.isEmpty) return;
    final items = await all();
    items.removeWhere((m) => clientIds.contains(m['clientId']));
    await _save(items);
  }

  Future<void> _save(List<Map<String, dynamic>> items) async {
    if (items.isEmpty) {
      await _storage.delete(key: _key);
    } else {
      await _storage.write(key: _key, value: json.encode(items));
    }
  }

  // A unique idempotency key without adding a UUID dependency: microsecond
  // timestamp plus cryptographically strong randomness.
  String _newClientId() {
    final rand = Random.secure();
    final a = rand.nextInt(1 << 32).toRadixString(16).padLeft(8, '0');
    final b = rand.nextInt(1 << 32).toRadixString(16).padLeft(8, '0');
    return '${DateTime.now().microsecondsSinceEpoch.toRadixString(16)}-$a$b';
  }
}
