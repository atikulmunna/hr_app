import 'package:flutter/material.dart';
import '../api/api_client.dart';
import '../auth/auth_scope.dart';
import '../theme/app_colors.dart';
import '../theme/app_dimens.dart';
import '../theme/app_typography.dart';
import '../widgets/app_card.dart';
import '../widgets/lime_button.dart';
import '../widgets/section_header.dart';
import '../widgets/status_pill.dart';

/// Profile (ESS): view and edit the employee's own record (T-1E.1, FR-M9-01).
/// Contact fields are edited directly; a name change is submitted for HR
/// approval. Also hosts the sign-out action.
class ProfileScreen extends StatefulWidget {
  const ProfileScreen({super.key});

  @override
  State<ProfileScreen> createState() => _ProfileScreenState();
}

class _ProfileScreenState extends State<ProfileScreen> {
  ApiClient? _api;
  bool _loading = true;
  String? _error;
  Map<String, dynamic> _profile = const {};
  List<Map<String, dynamic>> _changes = const [];

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_api == null) {
      _api = AuthScope.of(context).api;
      _load();
    }
  }

  Future<void> _load() async {
    setState(() {
      _loading = true;
      _error = null;
    });
    try {
      final results = await Future.wait([
        _api!.getProfile(),
        _api!.getProfileChangeRequests(),
      ]);
      if (!mounted) return;
      setState(() {
        _profile = results[0] as Map<String, dynamic>;
        _changes = results[1] as List<Map<String, dynamic>>;
        _loading = false;
      });
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.message;
        _loading = false;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _error = e.toString();
        _loading = false;
      });
    }
  }

  Future<void> _editContact() async {
    final saved = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _EditContactSheet(api: _api!, profile: _profile),
    );
    if (saved == true) await _load();
  }

  Future<void> _requestNameChange() async {
    final submitted = await showModalBottomSheet<bool>(
      context: context,
      isScrollControlled: true,
      backgroundColor: Colors.transparent,
      builder: (_) => _NameChangeSheet(api: _api!, profile: _profile),
    );
    if (submitted == true) await _load();
  }

  String get _name {
    final first = (_profile['firstName'] as String?)?.trim() ?? '';
    final last = (_profile['lastName'] as String?)?.trim() ?? '';
    final full = '$first $last'.trim();
    return full.isEmpty ? 'Employee' : full;
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: AppColors.screenBg,
      appBar: AppBar(
        backgroundColor: AppColors.screenBg,
        elevation: 0,
        foregroundColor: AppColors.ink,
        title: Text('Profile', style: AppText.rowTitle),
      ),
      body: _loading
          ? const Center(child: CircularProgressIndicator())
          : _error != null
          ? _errorView()
          : RefreshIndicator(onRefresh: _load, child: _content()),
    );
  }

  Widget _errorView() {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(_error!, textAlign: TextAlign.center, style: AppText.label),
            const SizedBox(height: 12),
            FilledButton(onPressed: _load, child: const Text('Retry')),
          ],
        ),
      ),
    );
  }

  Widget _content() {
    return ListView(
      padding: const EdgeInsets.fromLTRB(
        AppSpacing.screenHPad,
        16,
        AppSpacing.screenHPad,
        AppSpacing.screenBottomPad,
      ),
      children: [
        _header(),
        const SectionHeader('Details'),
        AppCard(
          child: Column(
            children: [
              _row('Employee code', _profile['employeeCode'] as String?),
              _divider(),
              _row('Email', _profile['email'] as String?),
              _divider(),
              _row('Job title', _profile['jobTitle'] as String?),
            ],
          ),
        ),
        Row(
          children: [
            Expanded(child: const SectionHeader('Contact')),
            TextButton.icon(
              onPressed: _editContact,
              style: TextButton.styleFrom(
                foregroundColor: AppColors.inkSecondary,
              ),
              icon: const Icon(Icons.edit_outlined, size: 16),
              label: const Text('Edit'),
            ),
          ],
        ),
        AppCard(
          child: Column(
            children: [
              _row('Phone', _profile['phone'] as String?),
              _divider(),
              _row(
                'Emergency contact',
                _profile['emergencyContactName'] as String?,
              ),
              _divider(),
              _row(
                'Emergency phone',
                _profile['emergencyContactPhone'] as String?,
              ),
            ],
          ),
        ),
        const SizedBox(height: 8),
        _nameChangeButton(),
        if (_changes.isNotEmpty) ...[
          const SectionHeader('Name change requests'),
          ..._changes.map(_changeRow),
        ],
        const SizedBox(height: 24),
        _signOutButton(),
      ],
    );
  }

  Widget _header() {
    final first = (_profile['firstName'] as String?)?.trim() ?? '';
    final last = (_profile['lastName'] as String?)?.trim() ?? '';
    final initials =
        ((first.isNotEmpty ? first[0] : '') + (last.isNotEmpty ? last[0] : ''))
            .toUpperCase();
    return Row(
      children: [
        Container(
          width: 60,
          height: 60,
          alignment: Alignment.center,
          decoration: const BoxDecoration(
            color: AppColors.ink,
            shape: BoxShape.circle,
          ),
          child: Text(
            initials.isEmpty ? '-' : initials,
            style: AppText.screenTitle.copyWith(color: AppColors.surface),
          ),
        ),
        const SizedBox(width: 14),
        Expanded(child: Text(_name, style: AppText.screenTitle)),
      ],
    );
  }

  Widget _nameChangeButton() {
    return GestureDetector(
      onTap: _requestNameChange,
      child: Container(
        padding: const EdgeInsets.symmetric(vertical: 14),
        decoration: BoxDecoration(
          color: AppColors.subtleFill,
          borderRadius: BorderRadius.circular(AppRadii.compact),
        ),
        child: Row(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const Icon(Icons.badge_outlined, size: 18, color: AppColors.ink),
            const SizedBox(width: 8),
            Text('Request a name change', style: AppText.rowTitle),
          ],
        ),
      ),
    );
  }

  Widget _changeRow(Map<String, dynamic> c) {
    final status = _pillStatus(c['status'] as String?, c['appliedAt']);
    final changes = (c['changes'] as Map?)?.cast<String, dynamic>() ?? const {};
    final parts = <String>[
      if (changes['firstName'] != null) 'First: ${changes['firstName']}',
      if (changes['lastName'] != null) 'Last: ${changes['lastName']}',
    ];
    return Padding(
      padding: const EdgeInsets.only(bottom: AppSpacing.cardGap),
      child: AppCard(
        child: Row(
          children: [
            Expanded(child: Text(parts.join(', '), style: AppText.rowTitle)),
            StatusPill(_statusLabel(status), status: status),
          ],
        ),
      ),
    );
  }

  Widget _signOutButton() {
    return Center(
      child: TextButton.icon(
        onPressed: _confirmSignOut,
        icon: const Icon(
          Icons.logout_rounded,
          size: 18,
          color: AppColors.dangerText,
        ),
        label: Text(
          'Sign out',
          style: AppText.rowTitle.copyWith(color: AppColors.dangerText),
        ),
      ),
    );
  }

  Future<void> _confirmSignOut() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (dialogContext) => AlertDialog(
        title: const Text('Sign out?'),
        actions: [
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(false),
            child: const Text('Cancel'),
          ),
          TextButton(
            onPressed: () => Navigator.of(dialogContext).pop(true),
            child: const Text('Sign out'),
          ),
        ],
      ),
    );
    if (confirmed == true && mounted) {
      await AuthScope.of(context).signOut();
    }
  }

  Widget _row(String label, String? value) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: Row(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SizedBox(width: 130, child: Text(label, style: AppText.label)),
          Expanded(
            child: Text(
              (value == null || value.isEmpty) ? 'Not set' : value,
              style: AppText.rowTitle.copyWith(
                color: (value == null || value.isEmpty)
                    ? AppColors.mutedLight
                    : AppColors.ink,
              ),
            ),
          ),
        ],
      ),
    );
  }

  Widget _divider() => const Divider(height: 18, color: AppColors.hairline);
}

PillStatus _pillStatus(String? raw, dynamic appliedAt) {
  if (appliedAt != null) return PillStatus.approved;
  switch (raw) {
    case 'approved':
      return PillStatus.approved;
    case 'rejected':
      return PillStatus.rejected;
    default:
      return PillStatus.pending;
  }
}

String _statusLabel(PillStatus s) {
  switch (s) {
    case PillStatus.approved:
      return 'Applied';
    case PillStatus.rejected:
      return 'Rejected';
    default:
      return 'Pending';
  }
}

class _EditContactSheet extends StatefulWidget {
  const _EditContactSheet({required this.api, required this.profile});
  final ApiClient api;
  final Map<String, dynamic> profile;

  @override
  State<_EditContactSheet> createState() => _EditContactSheetState();
}

class _EditContactSheetState extends State<_EditContactSheet> {
  late final TextEditingController _phone = TextEditingController(
    text: widget.profile['phone'] as String? ?? '',
  );
  late final TextEditingController _ecName = TextEditingController(
    text: widget.profile['emergencyContactName'] as String? ?? '',
  );
  late final TextEditingController _ecPhone = TextEditingController(
    text: widget.profile['emergencyContactPhone'] as String? ?? '',
  );
  bool _saving = false;
  String? _error;

  @override
  void dispose() {
    _phone.dispose();
    _ecName.dispose();
    _ecPhone.dispose();
    super.dispose();
  }

  Future<void> _save() async {
    setState(() {
      _saving = true;
      _error = null;
    });
    final messenger = ScaffoldMessenger.of(context);
    try {
      await widget.api.updateProfileContact({
        'phone': _phone.text.trim(),
        'emergencyContactName': _ecName.text.trim(),
        'emergencyContactPhone': _ecPhone.text.trim(),
      });
      if (!mounted) return;
      Navigator.of(context).pop(true);
      messenger.showSnackBar(
        const SnackBar(content: Text('Contact details updated.')),
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _error = e.message;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _saving = false;
        _error = e.toString();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return _SheetShell(
      title: 'Edit contact',
      children: [
        _field('Phone', _phone),
        const SizedBox(height: 12),
        _field('Emergency contact name', _ecName),
        const SizedBox(height: 12),
        _field('Emergency contact phone', _ecPhone),
        if (_error != null) ...[
          const SizedBox(height: 12),
          Text(
            _error!,
            style: AppText.label.copyWith(color: AppColors.dangerText),
          ),
        ],
        const SizedBox(height: 20),
        LimeButton(
          label: _saving ? 'Saving...' : 'Save',
          expand: true,
          onPressed: _saving ? null : _save,
        ),
      ],
    );
  }
}

class _NameChangeSheet extends StatefulWidget {
  const _NameChangeSheet({required this.api, required this.profile});
  final ApiClient api;
  final Map<String, dynamic> profile;

  @override
  State<_NameChangeSheet> createState() => _NameChangeSheetState();
}

class _NameChangeSheetState extends State<_NameChangeSheet> {
  late final TextEditingController _first = TextEditingController(
    text: widget.profile['firstName'] as String? ?? '',
  );
  late final TextEditingController _last = TextEditingController(
    text: widget.profile['lastName'] as String? ?? '',
  );
  bool _submitting = false;
  String? _error;

  @override
  void dispose() {
    _first.dispose();
    _last.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    setState(() {
      _submitting = true;
      _error = null;
    });
    final messenger = ScaffoldMessenger.of(context);
    try {
      await widget.api.requestProfileChange({
        'firstName': _first.text.trim(),
        'lastName': _last.text.trim(),
      });
      if (!mounted) return;
      Navigator.of(context).pop(true);
      messenger.showSnackBar(
        const SnackBar(content: Text('Name change sent to HR for approval.')),
      );
    } on ApiException catch (e) {
      if (!mounted) return;
      setState(() {
        _submitting = false;
        _error = e.message;
      });
    } catch (e) {
      if (!mounted) return;
      setState(() {
        _submitting = false;
        _error = e.toString();
      });
    }
  }

  @override
  Widget build(BuildContext context) {
    return _SheetShell(
      title: 'Request a name change',
      children: [
        Text(
          'A name change needs HR approval before it takes effect.',
          style: AppText.label.copyWith(color: AppColors.mutedLight),
        ),
        const SizedBox(height: 16),
        _field('First name', _first),
        const SizedBox(height: 12),
        _field('Last name', _last),
        if (_error != null) ...[
          const SizedBox(height: 12),
          Text(
            _error!,
            style: AppText.label.copyWith(color: AppColors.dangerText),
          ),
        ],
        const SizedBox(height: 20),
        LimeButton(
          label: _submitting ? 'Submitting...' : 'Submit for approval',
          expand: true,
          onPressed: _submitting ? null : _submit,
        ),
      ],
    );
  }
}

// Shared bottom-sheet chrome (grab handle, title, keyboard-safe scroll).
class _SheetShell extends StatelessWidget {
  const _SheetShell({required this.title, required this.children});
  final String title;
  final List<Widget> children;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: EdgeInsets.only(
        bottom: MediaQuery.of(context).viewInsets.bottom,
      ),
      child: Container(
        decoration: const BoxDecoration(
          color: AppColors.screenBg,
          borderRadius: BorderRadius.vertical(top: Radius.circular(28)),
        ),
        padding: const EdgeInsets.fromLTRB(18, 12, 18, 24),
        child: SingleChildScrollView(
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Center(
                child: Container(
                  width: 42,
                  height: 5,
                  decoration: BoxDecoration(
                    color: AppColors.mutedLight,
                    borderRadius: BorderRadius.circular(3),
                  ),
                ),
              ),
              const SizedBox(height: 16),
              Text(title, style: AppText.screenTitle),
              const SizedBox(height: 16),
              ...children,
            ],
          ),
        ),
      ),
    );
  }
}

Widget _field(String label, TextEditingController controller) {
  return Container(
    padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 4),
    decoration: BoxDecoration(
      color: AppColors.surface,
      borderRadius: BorderRadius.circular(AppRadii.compact),
    ),
    child: TextField(
      controller: controller,
      style: AppText.body.copyWith(color: AppColors.ink),
      decoration: InputDecoration(
        border: InputBorder.none,
        labelText: label,
        labelStyle: AppText.label,
      ),
    ),
  );
}
