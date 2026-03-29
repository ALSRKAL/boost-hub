import 'dart:convert';
import 'dart:io';

import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:flutter_localizations/flutter_localizations.dart';
import 'package:http/http.dart' as http;
import 'package:intl/intl.dart' hide TextDirection;
import 'package:webview_flutter/webview_flutter.dart';

import 'firebase_options.dart';

const AndroidNotificationChannel _adminAlertsChannel =
    AndroidNotificationChannel(
      'admin_alerts',
      'Admin Alerts',
      description: 'Notifications for pending deposits and admin actions.',
      importance: Importance.high,
    );

final FlutterLocalNotificationsPlugin _localNotifications =
    FlutterLocalNotificationsPlugin();

@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
  await NotificationService.ensureInitialized();
  await NotificationService.showRemoteMessage(message);
}

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();
  await Firebase.initializeApp(options: DefaultFirebaseOptions.currentPlatform);
  FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);
  await NotificationService.ensureInitialized();

  runApp(const HajzyAdminApp());
}

class ApiConfig {
  static const String _envBaseUrl = String.fromEnvironment('API_BASE_URL');

  static String get baseUrl {
    if (_envBaseUrl.isNotEmpty) {
      return _envBaseUrl;
    }

    if (Platform.isAndroid) {
      return 'http://10.0.2.2:3000';
    }

    return 'http://localhost:3000';
  }
}

class NotificationService {
  static bool _initialized = false;

  static Future<void> ensureInitialized() async {
    if (_initialized) return;

    const androidSettings = AndroidInitializationSettings(
      '@mipmap/ic_launcher',
    );
    const iosSettings = DarwinInitializationSettings();

    await _localNotifications.initialize(
      settings: const InitializationSettings(
        android: androidSettings,
        iOS: iosSettings,
      ),
    );

    await _localNotifications
        .resolvePlatformSpecificImplementation<
          AndroidFlutterLocalNotificationsPlugin
        >()
        ?.createNotificationChannel(_adminAlertsChannel);

    await FirebaseMessaging.instance
        .setForegroundNotificationPresentationOptions(
          alert: true,
          badge: true,
          sound: true,
        );

    FirebaseMessaging.onMessage.listen(showRemoteMessage);

    _initialized = true;
  }

  static Future<void> requestPermissions() async {
    await FirebaseMessaging.instance.requestPermission(
      alert: true,
      badge: true,
      sound: true,
      provisional: false,
    );
  }

  static Future<void> syncAdminTopic(bool isAdmin) async {
    if (isAdmin) {
      await FirebaseMessaging.instance.subscribeToTopic('admins');
      return;
    }

    await FirebaseMessaging.instance.unsubscribeFromTopic('admins');
  }

  static Future<void> showRemoteMessage(RemoteMessage message) async {
    final notification = message.notification;

    if (notification == null) {
      return;
    }

    await _localNotifications.show(
      id: notification.hashCode,
      title: notification.title,
      body: notification.body,
      notificationDetails: NotificationDetails(
        android: AndroidNotificationDetails(
          _adminAlertsChannel.id,
          _adminAlertsChannel.name,
          channelDescription: _adminAlertsChannel.description,
          importance: Importance.high,
          priority: Priority.high,
        ),
        iOS: const DarwinNotificationDetails(),
      ),
      payload: message.data['type'],
    );
  }
}

class HajzyAdminApp extends StatelessWidget {
  const HajzyAdminApp({super.key});

  @override
  Widget build(BuildContext context) {
    final baseTheme = ThemeData.dark(useMaterial3: true);

    return MaterialApp(
      debugShowCheckedModeBanner: false,
      title: 'إدارة Hajzy',
      locale: const Locale('ar'),
      supportedLocales: const [Locale('ar'), Locale('en')],
      localizationsDelegates: const [
        GlobalMaterialLocalizations.delegate,
        GlobalWidgetsLocalizations.delegate,
        GlobalCupertinoLocalizations.delegate,
      ],
      theme: baseTheme.copyWith(
        scaffoldBackgroundColor: const Color(0xFF081120),
        colorScheme: baseTheme.colorScheme.copyWith(
          primary: const Color(0xFF3B82F6),
          secondary: const Color(0xFF22C55E),
          surface: const Color(0xFF101B2D),
        ),
        appBarTheme: const AppBarTheme(
          backgroundColor: Color(0xFF081120),
          foregroundColor: Colors.white,
          elevation: 0,
        ),
        cardTheme: CardThemeData(
          color: const Color(0xFF101B2D),
          elevation: 0,
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(24),
            side: const BorderSide(color: Color(0xFF1E293B)),
          ),
        ),
        inputDecorationTheme: InputDecorationTheme(
          filled: true,
          fillColor: const Color(0xFF111C30),
          border: OutlineInputBorder(
            borderRadius: BorderRadius.circular(18),
            borderSide: const BorderSide(color: Color(0xFF334155)),
          ),
          enabledBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(18),
            borderSide: const BorderSide(color: Color(0xFF334155)),
          ),
          focusedBorder: OutlineInputBorder(
            borderRadius: BorderRadius.circular(18),
            borderSide: const BorderSide(color: Color(0xFF3B82F6)),
          ),
        ),
      ),
      builder: (context, child) =>
          Directionality(textDirection: TextDirection.rtl, child: child!),
      home: const AuthGate(),
    );
  }
}

class AuthGate extends StatelessWidget {
  const AuthGate({super.key});

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<User?>(
      stream: FirebaseAuth.instance.authStateChanges(),
      builder: (context, authSnapshot) {
        if (authSnapshot.connectionState == ConnectionState.waiting) {
          return const SplashScreen();
        }

        final user = authSnapshot.data;

        if (user == null) {
          return const SignInPage();
        }

        return StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
          stream: FirebaseFirestore.instance
              .collection('users')
              .doc(user.uid)
              .snapshots(),
          builder: (context, profileSnapshot) {
            if (profileSnapshot.connectionState == ConnectionState.waiting) {
              return const SplashScreen();
            }

            final profile = profileSnapshot.data?.data();
            final isAdmin = profile?['role'] == 'admin';
            NotificationService.syncAdminTopic(isAdmin);

            if (!isAdmin) {
              return UnauthorizedPage(email: user.email ?? '');
            }

            return AdminHomePage(user: user, profile: profile ?? const {});
          },
        );
      },
    );
  }
}

class SignInPage extends StatefulWidget {
  const SignInPage({super.key});

  @override
  State<SignInPage> createState() => _SignInPageState();
}

class _SignInPageState extends State<SignInPage> {
  final _formKey = GlobalKey<FormState>();
  final _emailController = TextEditingController();
  final _passwordController = TextEditingController();
  bool _submitting = false;

  @override
  void dispose() {
    _emailController.dispose();
    _passwordController.dispose();
    super.dispose();
  }

  Future<void> _signIn() async {
    if (!_formKey.currentState!.validate()) {
      return;
    }

    try {
      setState(() => _submitting = true);
      await FirebaseAuth.instance.signInWithEmailAndPassword(
        email: _emailController.text.trim(),
        password: _passwordController.text.trim(),
      );
      await NotificationService.requestPermissions();
    } on FirebaseAuthException catch (error) {
      if (!mounted) return;
      showAppSnackBar(context, error.message ?? 'فشل تسجيل الدخول.');
    } finally {
      if (mounted) {
        setState(() => _submitting = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 460),
          child: Padding(
            padding: const EdgeInsets.all(24),
            child: Card(
              child: Padding(
                padding: const EdgeInsets.all(24),
                child: Form(
                  key: _formKey,
                  child: Column(
                    mainAxisSize: MainAxisSize.min,
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      const Text(
                        'تسجيل دخول الإدارة',
                        style: TextStyle(
                          fontSize: 28,
                          fontWeight: FontWeight.bold,
                        ),
                        textAlign: TextAlign.center,
                      ),
                      const SizedBox(height: 12),
                      const Text(
                        'ادخل بحساب الأدمن نفسه المستخدم في لوحة الويب.',
                        textAlign: TextAlign.center,
                        style: TextStyle(color: Colors.white70),
                      ),
                      const SizedBox(height: 24),
                      TextFormField(
                        controller: _emailController,
                        keyboardType: TextInputType.emailAddress,
                        decoration: const InputDecoration(
                          labelText: 'البريد الإلكتروني',
                        ),
                        validator: (value) {
                          if (value == null || value.trim().isEmpty) {
                            return 'البريد الإلكتروني مطلوب';
                          }
                          return null;
                        },
                      ),
                      const SizedBox(height: 16),
                      TextFormField(
                        controller: _passwordController,
                        obscureText: true,
                        decoration: const InputDecoration(
                          labelText: 'كلمة المرور',
                        ),
                        validator: (value) {
                          if (value == null || value.trim().isEmpty) {
                            return 'كلمة المرور مطلوبة';
                          }
                          return null;
                        },
                      ),
                      const SizedBox(height: 24),
                      FilledButton(
                        onPressed: _submitting ? null : _signIn,
                        style: FilledButton.styleFrom(
                          padding: const EdgeInsets.symmetric(vertical: 16),
                        ),
                        child: Text(_submitting ? 'جاري الدخول...' : 'دخول'),
                      ),
                    ],
                  ),
                ),
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class UnauthorizedPage extends StatelessWidget {
  const UnauthorizedPage({super.key, required this.email});

  final String email;

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      body: Center(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Card(
            child: Padding(
              padding: const EdgeInsets.all(24),
              child: Column(
                mainAxisSize: MainAxisSize.min,
                children: [
                  const Icon(
                    Icons.lock_outline,
                    size: 52,
                    color: Colors.orange,
                  ),
                  const SizedBox(height: 16),
                  const Text(
                    'هذا الحساب ليس أدمن',
                    style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
                  ),
                  const SizedBox(height: 8),
                  Text(
                    email,
                    style: const TextStyle(color: Colors.white70),
                    textAlign: TextAlign.center,
                  ),
                  const SizedBox(height: 20),
                  OutlinedButton(
                    onPressed: () => FirebaseAuth.instance.signOut(),
                    child: const Text('تسجيل الخروج'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ),
    );
  }
}

class AdminHomePage extends StatefulWidget {
  const AdminHomePage({super.key, required this.user, required this.profile});

  final User user;
  final Map<String, dynamic> profile;

  @override
  State<AdminHomePage> createState() => _AdminHomePageState();
}

class _AdminHomePageState extends State<AdminHomePage> {
  int _currentIndex = 0;

  @override
  void initState() {
    super.initState();
    NotificationService.requestPermissions();
    FirebaseMessaging.instance.getInitialMessage().then(_handleOpenMessage);
    FirebaseMessaging.onMessageOpenedApp.listen(_handleOpenMessage);
  }

  void _handleOpenMessage(RemoteMessage? message) {
    if (message == null) return;

    if (message.data['type'] == 'deposit_created') {
      setState(() => _currentIndex = 1);
    }
  }

  @override
  Widget build(BuildContext context) {
    final pages = [
      DashboardTab(user: widget.user, profile: widget.profile),
      DepositsTab(user: widget.user),
      const UsersTab(),
      const ProviderPortalTab(),
    ];

    return Scaffold(
      appBar: AppBar(
        title: const Text('إدارة Hajzy'),
        actions: [
          IconButton(
            tooltip: 'تسجيل الخروج',
            onPressed: () => FirebaseAuth.instance.signOut(),
            icon: const Icon(Icons.logout),
          ),
        ],
      ),
      body: SafeArea(child: pages[_currentIndex]),
      bottomNavigationBar: NavigationBar(
        selectedIndex: _currentIndex,
        onDestinationSelected: (index) {
          setState(() => _currentIndex = index);
        },
        destinations: const [
          NavigationDestination(
            icon: Icon(Icons.dashboard_outlined),
            selectedIcon: Icon(Icons.dashboard),
            label: 'الرئيسية',
          ),
          NavigationDestination(
            icon: Icon(Icons.account_balance_wallet_outlined),
            selectedIcon: Icon(Icons.account_balance_wallet),
            label: 'الإيداعات',
          ),
          NavigationDestination(
            icon: Icon(Icons.people_outline),
            selectedIcon: Icon(Icons.people),
            label: 'المستخدمون',
          ),
          NavigationDestination(
            icon: Icon(Icons.language_outlined),
            selectedIcon: Icon(Icons.language),
            label: 'المزود',
          ),
        ],
      ),
    );
  }
}

class DashboardTab extends StatelessWidget {
  const DashboardTab({super.key, required this.user, required this.profile});

  final User user;
  final Map<String, dynamic> profile;

  @override
  Widget build(BuildContext context) {
    final ordersStream = FirebaseFirestore.instance
        .collection('orders')
        .orderBy('createdAt', descending: true)
        .snapshots();
    final depositsStream = FirebaseFirestore.instance
        .collection('deposits')
        .orderBy('createdAt', descending: true)
        .snapshots();
    final syncStateStream = FirebaseFirestore.instance
        .collection('system_metrics')
        .doc('order_sync')
        .snapshots();

    return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
      stream: ordersStream,
      builder: (context, ordersSnapshot) {
        return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
          stream: depositsStream,
          builder: (context, depositsSnapshot) {
            return StreamBuilder<DocumentSnapshot<Map<String, dynamic>>>(
              stream: syncStateStream,
              builder: (context, syncSnapshot) {
                if (!ordersSnapshot.hasData || !depositsSnapshot.hasData) {
                  return const SplashScreen();
                }

                final orders = ordersSnapshot.data!.docs;
                final deposits = depositsSnapshot.data!.docs;
                final syncState = syncSnapshot.data?.data() ?? const {};
                final revenueStatuses = {
                  'completed',
                  'processing',
                  'in_progress',
                };
                final revenueOrders = orders.where(
                  (doc) => revenueStatuses.contains(doc.data()['status']),
                );

                final totalRevenue = revenueOrders.fold<double>(
                  0,
                  (total, doc) =>
                      total + ((doc.data()['charge'] ?? 0) as num).toDouble(),
                );
                final totalProviderCost = revenueOrders.fold<double>(
                  0,
                  (total, doc) =>
                      total +
                      ((doc.data()['providerCharge'] ?? 0) as num).toDouble(),
                );
                final pendingDeposits = deposits.where(
                  (doc) => doc.data()['status'] == 'pending',
                );
                final netProfit = totalRevenue - totalProviderCost;

                return ListView(
                  padding: const EdgeInsets.all(16),
                  children: [
                    Text(
                      'مرحبًا ${firstName(profile['displayName'] as String?) ?? user.email ?? ''}',
                      style: const TextStyle(
                        fontSize: 26,
                        fontWeight: FontWeight.bold,
                      ),
                    ),
                    const SizedBox(height: 8),
                    const Text(
                      'هذه لوحة الأرباح والإشراف المباشر على النظام.',
                      style: TextStyle(color: Colors.white70),
                    ),
                    const SizedBox(height: 20),
                    GridView.count(
                      crossAxisCount: MediaQuery.of(context).size.width > 900
                          ? 4
                          : 2,
                      childAspectRatio: MediaQuery.of(context).size.width > 900
                          ? 1.3
                          : 1.05,
                      shrinkWrap: true,
                      physics: const NeverScrollableScrollPhysics(),
                      crossAxisSpacing: 12,
                      mainAxisSpacing: 12,
                      children: [
                        StatCard(
                          title: 'إجمالي الإيراد',
                          value: formatCurrency(totalRevenue),
                          note: 'الطلبات المكتملة وتحت المعالجة',
                          color: const Color(0xFF2563EB),
                        ),
                        StatCard(
                          title: 'تكلفة المزود',
                          value: formatCurrency(totalProviderCost),
                          note: 'الكلفة الحقيقية لدى المزود',
                          color: const Color(0xFF7C3AED),
                        ),
                        StatCard(
                          title: 'صافي الربح',
                          value: formatCurrency(netProfit),
                          note: 'الإيراد ناقص تكلفة المزود',
                          color: const Color(0xFF16A34A),
                        ),
                        StatCard(
                          title: 'الإيداعات المعلقة',
                          value: pendingDeposits.length.toString(),
                          note: 'تحتاج موافقة الأدمن',
                          color: const Color(0xFFF59E0B),
                        ),
                      ],
                    ),
                    const SizedBox(height: 20),
                    ProviderSyncCard(syncState: syncState),
                    const SizedBox(height: 20),
                    Card(
                      child: Padding(
                        padding: const EdgeInsets.all(20),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.start,
                          children: [
                            const Text(
                              'آخر الطلبات',
                              style: TextStyle(
                                fontSize: 20,
                                fontWeight: FontWeight.w700,
                              ),
                            ),
                            const SizedBox(height: 12),
                            ...orders
                                .take(6)
                                .map((doc) => OrderTile(data: doc.data())),
                          ],
                        ),
                      ),
                    ),
                  ],
                );
              },
            );
          },
        );
      },
    );
  }
}

class DepositsTab extends StatefulWidget {
  const DepositsTab({super.key, required this.user});

  final User user;

  @override
  State<DepositsTab> createState() => _DepositsTabState();
}

class _DepositsTabState extends State<DepositsTab> {
  String _filter = 'pending';
  String? _processingDepositId;
  bool _syncing = false;

  Future<void> _approveDeposit(
    String depositId,
    Map<String, dynamic> deposit,
  ) async {
    try {
      setState(() => _processingDepositId = depositId);
      final batch = FirebaseFirestore.instance.batch();
      final depositRef = FirebaseFirestore.instance
          .collection('deposits')
          .doc(depositId);
      final userRef = FirebaseFirestore.instance
          .collection('users')
          .doc(deposit['userId'] as String);

      batch.update(depositRef, {
        'status': 'approved',
        'reviewedAt': Timestamp.now(),
        'reviewedBy': widget.user.uid,
      });
      batch.update(userRef, {
        'balance': FieldValue.increment((deposit['amount'] as num).toDouble()),
      });

      await batch.commit();
      if (!mounted) return;
      showAppSnackBar(context, 'تمت الموافقة على الإيداع.');
    } catch (error) {
      if (!mounted) return;
      showAppSnackBar(context, 'فشل قبول الإيداع: $error');
    } finally {
      if (mounted) {
        setState(() => _processingDepositId = null);
      }
    }
  }

  Future<void> _rejectDeposit(String depositId) async {
    try {
      setState(() => _processingDepositId = depositId);
      await FirebaseFirestore.instance
          .collection('deposits')
          .doc(depositId)
          .update({
            'status': 'rejected',
            'reviewedAt': Timestamp.now(),
            'reviewedBy': widget.user.uid,
            'notes': 'Rejected by admin mobile app',
          });
      if (!mounted) return;
      showAppSnackBar(context, 'تم رفض الإيداع.');
    } catch (error) {
      if (!mounted) return;
      showAppSnackBar(context, 'فشل رفض الإيداع: $error');
    } finally {
      if (mounted) {
        setState(() => _processingDepositId = null);
      }
    }
  }

  Future<void> _syncOrders() async {
    try {
      setState(() => _syncing = true);
      final token = await widget.user.getIdToken();
      final response = await http.get(
        Uri.parse('${ApiConfig.baseUrl}/api/cron/sync-orders'),
        headers: {'Authorization': 'Bearer $token'},
      );

      final payload = jsonDecode(response.body) as Map<String, dynamic>;

      if (response.statusCode >= 400) {
        throw Exception(payload['error'] ?? response.body);
      }

      if (!mounted) return;
      final summary = payload['summary'];
      if (summary is Map<String, dynamic>) {
        final checked = summary['checked'] ?? 0;
        final updated = summary['updated'] ?? 0;
        final refunded = summary['refunded'] ?? 0;
        final awaitingRefund = summary['awaitingProviderRefund'] ?? 0;
        final providerBalanceAfter = summary['providerBalanceAfter'];
        final balanceText = providerBalanceAfter is num
            ? ' | رصيد المزود: ${formatCurrency(providerBalanceAfter.toDouble())}'
            : '';

        showAppSnackBar(
          context,
          'تمت المزامنة. تم فحص $checked، تحديث $updated، استرداد $refunded، وبانتظار تأكيد المزود $awaitingRefund$balanceText',
        );
        return;
      }

      showAppSnackBar(context, 'تمت مزامنة الطلبات مع المزود.');
    } catch (error) {
      if (!mounted) return;
      showAppSnackBar(context, 'فشل مزامنة الطلبات: $error');
    } finally {
      if (mounted) {
        setState(() => _syncing = false);
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
      stream: FirebaseFirestore.instance
          .collection('deposits')
          .orderBy('createdAt', descending: true)
          .snapshots(),
      builder: (context, snapshot) {
        if (!snapshot.hasData) {
          return const SplashScreen();
        }

        final deposits = snapshot.data!.docs;
        final filteredDeposits = deposits.where((doc) {
          final status = doc.data()['status'];
          if (_filter == 'pending') return status == 'pending';
          return status != 'pending';
        }).toList();

        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            Row(
              children: [
                const Expanded(
                  child: Text(
                    'الإيداعات',
                    style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
                  ),
                ),
                FilledButton.icon(
                  onPressed: _syncing ? null : _syncOrders,
                  icon: const Icon(Icons.sync),
                  label: Text(_syncing ? 'جاري المزامنة...' : 'مزامنة الطلبات'),
                ),
              ],
            ),
            const SizedBox(height: 16),
            Wrap(
              spacing: 8,
              children: [
                FilterChip(
                  selected: _filter == 'pending',
                  label: const Text('بانتظار الموافقة'),
                  onSelected: (_) => setState(() => _filter = 'pending'),
                ),
                FilterChip(
                  selected: _filter == 'history',
                  label: const Text('السجل'),
                  onSelected: (_) => setState(() => _filter = 'history'),
                ),
              ],
            ),
            const SizedBox(height: 16),
            if (filteredDeposits.isEmpty)
              const EmptyCard(message: 'لا توجد عناصر في هذا القسم حاليًا.')
            else
              ...filteredDeposits.map((doc) {
                final data = doc.data();
                final isPending = data['status'] == 'pending';

                return Card(
                  margin: const EdgeInsets.only(bottom: 12),
                  child: Padding(
                    padding: const EdgeInsets.all(16),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Row(
                          children: [
                            Expanded(
                              child: Text(
                                data['userEmail'] as String? ?? 'بدون بريد',
                                style: const TextStyle(
                                  fontSize: 16,
                                  fontWeight: FontWeight.w700,
                                ),
                              ),
                            ),
                            StatusChip(
                              status: data['status'] as String? ?? 'pending',
                            ),
                          ],
                        ),
                        const SizedBox(height: 10),
                        Text(
                          'المبلغ: ${formatCurrency((data['amount'] ?? 0) as num)}',
                        ),
                        Text('UTR: ${data['utr'] ?? '—'}'),
                        Text('التاريخ: ${formatDateTime(data['createdAt'])}'),
                        if (isPending) ...[
                          const SizedBox(height: 14),
                          Row(
                            children: [
                              Expanded(
                                child: FilledButton(
                                  onPressed: _processingDepositId == doc.id
                                      ? null
                                      : () => _approveDeposit(doc.id, data),
                                  child: const Text('قبول'),
                                ),
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: OutlinedButton(
                                  onPressed: _processingDepositId == doc.id
                                      ? null
                                      : () => _rejectDeposit(doc.id),
                                  child: const Text('رفض'),
                                ),
                              ),
                            ],
                          ),
                        ],
                      ],
                    ),
                  ),
                );
              }),
          ],
        );
      },
    );
  }
}

class UsersTab extends StatefulWidget {
  const UsersTab({super.key});

  @override
  State<UsersTab> createState() => _UsersTabState();
}

class _UsersTabState extends State<UsersTab> {
  String _query = '';

  @override
  Widget build(BuildContext context) {
    return StreamBuilder<QuerySnapshot<Map<String, dynamic>>>(
      stream: FirebaseFirestore.instance
          .collection('users')
          .orderBy('createdAt', descending: true)
          .snapshots(),
      builder: (context, snapshot) {
        if (!snapshot.hasData) {
          return const SplashScreen();
        }

        final users = snapshot.data!.docs.where((doc) {
          final email = (doc.data()['email'] ?? '').toString().toLowerCase();
          return email.contains(_query.toLowerCase());
        }).toList();

        return ListView(
          padding: const EdgeInsets.all(16),
          children: [
            const Text(
              'المستخدمون',
              style: TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
            ),
            const SizedBox(height: 16),
            TextField(
              decoration: const InputDecoration(
                hintText: 'ابحث بالبريد الإلكتروني...',
                prefixIcon: Icon(Icons.search),
              ),
              onChanged: (value) => setState(() => _query = value),
            ),
            const SizedBox(height: 16),
            if (users.isEmpty)
              const EmptyCard(message: 'لا يوجد مستخدمون مطابقون للبحث.')
            else
              ...users.map((doc) {
                final data = doc.data();
                final isAdmin = data['role'] == 'admin';

                return Card(
                  margin: const EdgeInsets.only(bottom: 12),
                  child: ListTile(
                    contentPadding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 8,
                    ),
                    title: Text(data['email'] as String? ?? 'بدون بريد'),
                    subtitle: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        const SizedBox(height: 4),
                        Text(data['displayName'] as String? ?? 'بدون اسم عرض'),
                        Text(
                          'الرصيد: ${formatCurrency((data['balance'] ?? 0) as num)}',
                        ),
                        Text(
                          'تاريخ الانضمام: ${formatDateTime(data['createdAt'])}',
                        ),
                      ],
                    ),
                    trailing: Container(
                      padding: const EdgeInsets.symmetric(
                        horizontal: 10,
                        vertical: 6,
                      ),
                      decoration: BoxDecoration(
                        color: isAdmin
                            ? const Color(0xFF7C3AED).withValues(alpha: 0.2)
                            : const Color(0xFF1E293B),
                        borderRadius: BorderRadius.circular(999),
                      ),
                      child: Text(
                        isAdmin ? 'أدمن' : 'مستخدم',
                        style: TextStyle(
                          color: isAdmin
                              ? Colors.deepPurple[100]
                              : Colors.white70,
                          fontWeight: FontWeight.w700,
                        ),
                      ),
                    ),
                  ),
                );
              }),
          ],
        );
      },
    );
  }
}

class ProviderPortalTab extends StatefulWidget {
  const ProviderPortalTab({super.key});

  @override
  State<ProviderPortalTab> createState() => _ProviderPortalTabState();
}

class _ProviderPortalTabState extends State<ProviderPortalTab> {
  static const String _providerUrl = 'https://smmbin.com/';
  late final WebViewController _controller;
  int _progress = 0;
  String _currentUrl = _providerUrl;

  @override
  void initState() {
    super.initState();
    _controller = WebViewController()
      ..setJavaScriptMode(JavaScriptMode.unrestricted)
      ..setBackgroundColor(const Color(0xFF081120))
      ..setNavigationDelegate(
        NavigationDelegate(
          onPageStarted: (url) {
            if (!mounted) return;
            setState(() {
              _currentUrl = url;
              _progress = 0;
            });
          },
          onProgress: (progress) {
            if (!mounted) return;
            setState(() => _progress = progress);
          },
          onPageFinished: (url) {
            if (!mounted) return;
            setState(() {
              _currentUrl = url;
              _progress = 100;
            });
          },
        ),
      )
      ..loadRequest(Uri.parse(_providerUrl));
  }

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        if (_progress < 100)
          LinearProgressIndicator(
            value: _progress == 0 ? null : _progress / 100,
            minHeight: 2,
            backgroundColor: Colors.white12,
          ),
        Padding(
          padding: const EdgeInsets.fromLTRB(16, 16, 16, 10),
          child: Card(
            child: Padding(
              padding: const EdgeInsets.all(16),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Row(
                    children: [
                      const Expanded(
                        child: Text(
                          'بوابة المزود',
                          style: TextStyle(
                            fontSize: 20,
                            fontWeight: FontWeight.w700,
                          ),
                        ),
                      ),
                      IconButton(
                        tooltip: 'الرئيسية',
                        onPressed: () =>
                            _controller.loadRequest(Uri.parse(_providerUrl)),
                        icon: const Icon(Icons.home_outlined),
                      ),
                      IconButton(
                        tooltip: 'تحديث',
                        onPressed: _controller.reload,
                        icon: const Icon(Icons.refresh),
                      ),
                    ],
                  ),
                  const SizedBox(height: 8),
                  const Text(
                    'سجّل الدخول مرة واحدة، وسيحتفظ التطبيق بجلسة المزود داخل الشاشة نفسها.',
                    style: TextStyle(color: Colors.white70),
                  ),
                  const SizedBox(height: 12),
                  Container(
                    width: double.infinity,
                    padding: const EdgeInsets.symmetric(
                      horizontal: 12,
                      vertical: 10,
                    ),
                    decoration: BoxDecoration(
                      color: const Color(0xFF0C1528),
                      borderRadius: BorderRadius.circular(14),
                      border: Border.all(color: const Color(0xFF1E293B)),
                    ),
                    child: Text(
                      _currentUrl,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: const TextStyle(
                        color: Colors.white60,
                        fontSize: 12,
                      ),
                    ),
                  ),
                ],
              ),
            ),
          ),
        ),
        Expanded(
          child: Padding(
            padding: const EdgeInsets.fromLTRB(16, 0, 16, 16),
            child: ClipRRect(
              borderRadius: BorderRadius.circular(24),
              child: Container(
                decoration: BoxDecoration(
                  border: Border.all(color: const Color(0xFF1E293B)),
                  borderRadius: BorderRadius.circular(24),
                ),
                child: WebViewWidget(controller: _controller),
              ),
            ),
          ),
        ),
      ],
    );
  }
}

class ProviderSyncCard extends StatelessWidget {
  const ProviderSyncCard({super.key, required this.syncState});

  final Map<String, dynamic> syncState;

  @override
  Widget build(BuildContext context) {
    final providerBalance = syncState['providerBalanceAfter'];
    final awaitingProviderRefund = syncState['awaitingProviderRefund'];
    final refunded = syncState['refunded'];
    final lastRunAt = syncState['lastRunAt'];

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            const Text(
              'حالة المزامنة مع المزود',
              style: TextStyle(fontSize: 18, fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 8),
            const Text(
              'يعرض آخر قراءة لرصيد المزود والطلبات التي ما زالت بانتظار تأكيد الاسترداد منه.',
              style: TextStyle(color: Colors.white70),
            ),
            const SizedBox(height: 16),
            Wrap(
              spacing: 12,
              runSpacing: 12,
              children: [
                _SyncInfoChip(
                  label: 'رصيد المزود',
                  value: providerBalance is num
                      ? formatCurrency(providerBalance.toDouble())
                      : 'غير متاح',
                ),
                _SyncInfoChip(
                  label: 'بانتظار استرداد المزود',
                  value: '${awaitingProviderRefund ?? 0}',
                ),
                _SyncInfoChip(
                  label: 'المبالغ المرجعة',
                  value: '${refunded ?? 0}',
                ),
                _SyncInfoChip(
                  label: 'آخر مزامنة',
                  value: formatDateTime(lastRunAt),
                ),
              ],
            ),
          ],
        ),
      ),
    );
  }
}

class _SyncInfoChip extends StatelessWidget {
  const _SyncInfoChip({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: 180,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFF0C1528),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: const Color(0xFF1E293B)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: const TextStyle(color: Colors.white60, fontSize: 12),
          ),
          const SizedBox(height: 6),
          Text(
            value,
            maxLines: 2,
            overflow: TextOverflow.ellipsis,
            style: const TextStyle(fontWeight: FontWeight.w700),
          ),
        ],
      ),
    );
  }
}

class StatCard extends StatelessWidget {
  const StatCard({
    super.key,
    required this.title,
    required this.value,
    required this.note,
    required this.color,
  });

  final String title;
  final String value;
  final String note;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Container(
        decoration: BoxDecoration(
          borderRadius: BorderRadius.circular(24),
          gradient: LinearGradient(
            colors: [
              color.withValues(alpha: 0.30),
              color.withValues(alpha: 0.12),
            ],
            begin: Alignment.topRight,
            end: Alignment.bottomLeft,
          ),
        ),
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisAlignment: MainAxisAlignment.spaceBetween,
          children: [
            Text(
              title,
              style: const TextStyle(
                color: Colors.white70,
                fontWeight: FontWeight.w600,
              ),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 14),
            Text(
              value,
              style: const TextStyle(fontSize: 24, fontWeight: FontWeight.bold),
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
            ),
            const SizedBox(height: 6),
            Text(
              note,
              style: const TextStyle(color: Colors.white60, fontSize: 12),
              maxLines: 2,
              overflow: TextOverflow.ellipsis,
            ),
          ],
        ),
      ),
    );
  }
}

class OrderTile extends StatelessWidget {
  const OrderTile({super.key, required this.data});

  final Map<String, dynamic> data;

  @override
  Widget build(BuildContext context) {
    final refillStatus = data['refillStatus'] as String?;
    final refundState = data['refundState'] as String?;
    final supportsRefill = data['supportsRefill'] as bool? ?? false;

    return Container(
      margin: const EdgeInsets.only(bottom: 10),
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: const Color(0xFF0C1528),
        borderRadius: BorderRadius.circular(18),
        border: Border.all(color: const Color(0xFF1E293B)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      (data['serviceName'] ?? data['serviceId'] ?? 'طلب')
                          .toString(),
                      style: const TextStyle(fontWeight: FontWeight.w700),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      formatDateTime(data['createdAt']),
                      style:
                          const TextStyle(color: Colors.white60, fontSize: 12),
                    ),
                  ],
                ),
              ),
              StatusChip(status: (data['status'] ?? 'pending').toString()),
            ],
          ),
          if (refillStatus != null || refundState == 'refunded_to_user' || refundState == 'awaiting_provider_refund') ...[
            const SizedBox(height: 8),
            Wrap(
              spacing: 6,
              runSpacing: 4,
              children: [
                if (refillStatus != null)
                  _MiniTag(
                    text: 'إعادة: ${refillStatus == "requested" ? "مطلوب" : refillStatus == "completed" ? "مكتمل" : refillStatus}',
                    color: Colors.blue,
                  ),
                if (refundState == 'refunded_to_user')
                  const _MiniTag(text: 'مُسترد للمستخدم', color: Colors.green),
                if (refundState == 'awaiting_provider_refund')
                  const _MiniTag(
                      text: 'بانتظار استرداد المزود', color: Colors.orange),
                if (supportsRefill && refillStatus == null)
                  const _MiniTag(text: '♻ يدعم الإعادة', color: Colors.cyan),
              ],
            ),
          ],
        ],
      ),
    );
  }
}

class _MiniTag extends StatelessWidget {
  const _MiniTag({required this.text, required this.color});

  final String text;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(8),
        border: Border.all(color: color.withValues(alpha: 0.25)),
      ),
      child: Text(
        text,
        style: TextStyle(
          color: color.withValues(alpha: 0.9),
          fontSize: 11,
          fontWeight: FontWeight.w600,
        ),
      ),
    );
  }
}

class StatusChip extends StatelessWidget {
  const StatusChip({super.key, required this.status});

  final String status;

  @override
  Widget build(BuildContext context) {
    final normalized = status.toLowerCase();
    Color color = Colors.blue;

    if (normalized == 'approved' || normalized == 'completed') {
      color = Colors.green;
    } else if (normalized == 'rejected' || normalized == 'cancelled') {
      color = Colors.red;
    } else if (normalized == 'partial') {
      color = Colors.orange;
    } else if (normalized == 'pending') {
      color = Colors.amber;
    }

    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 6),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.18),
        borderRadius: BorderRadius.circular(999),
        border: Border.all(color: color.withValues(alpha: 0.35)),
      ),
      child: Text(
        status.replaceAll('_', ' '),
        style: TextStyle(
          color: Colors.white,
          fontWeight: FontWeight.w700,
          fontSize: 12,
        ),
      ),
    );
  }
}

class EmptyCard extends StatelessWidget {
  const EmptyCard({super.key, required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(24),
        child: Text(
          message,
          style: const TextStyle(color: Colors.white70),
          textAlign: TextAlign.center,
        ),
      ),
    );
  }
}

class SplashScreen extends StatelessWidget {
  const SplashScreen({super.key});

  @override
  Widget build(BuildContext context) {
    return const Scaffold(body: Center(child: CircularProgressIndicator()));
  }
}

String formatCurrency(num amount) {
  final formatter = NumberFormat.currency(
    locale: 'en_IN',
    symbol: '₹',
    decimalDigits: 2,
  );
  return formatter.format(amount);
}

String formatDateTime(dynamic value) {
  if (value == null) {
    return '—';
  }

  DateTime? dateTime;

  if (value is Timestamp) {
    dateTime = value.toDate();
  } else if (value is DateTime) {
    dateTime = value;
  }

  if (dateTime == null) {
    return '—';
  }

  return DateFormat('dd MMM yyyy - hh:mm a', 'ar').format(dateTime);
}

String? firstName(String? displayName) {
  if (displayName == null || displayName.trim().isEmpty) {
    return null;
  }

  return displayName.trim().split(' ').first;
}

void showAppSnackBar(BuildContext context, String message) {
  ScaffoldMessenger.of(context)
    ..hideCurrentSnackBar()
    ..showSnackBar(SnackBar(content: Text(message)));
}
