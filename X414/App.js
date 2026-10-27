// D:\Dev\X414\App.js
// Main Application Entry for X414 on Google Pixel (Android)
import React, { useState, useEffect, useRef, useCallback } from 'react';
import {
    SafeAreaView,
    StyleSheet,
    View,
    Text,
    TouchableOpacity,
    BackHandler,
    AppState as RNAppState,
    Linking,
    Platform
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { WebView } from 'react-native-webview';
import AsyncStorage from '@react-native-async-storage/async-storage';

import { XHostCoordinator } from './src/bridge/XHostCoordinator.js';
import { VideoDownloader } from './src/services/VideoDownloader.js';
import {
    dispatchLocalNotifications,
    ensureAndroidNotificationChannels,
    ensureNotificationPermissions,
    registerBackgroundSyncTask
} from './src/services/BackgroundSyncTask.js';
import { buildWebViewInjectionScript } from './src/shared/webviewInjectedBundle.js';
import SettingsBottomSheet from './src/components/SettingsBottomSheet.js';

// Clean Pixel 9 Pro Android Chrome User-Agent (without "; wv" WebView marker so X/Google passkey & login flows work natively)
export const PIXEL_CHROME_USER_AGENT =
    'Mozilla/5.0 (Linux; Android 15; Pixel 9 Pro) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36';

export function isInternalXUrl(rawUrl) {
    if (!rawUrl || typeof rawUrl !== 'string') return false;
    try {
        const parsed = new URL(rawUrl);
        const host = parsed.hostname.toLowerCase();
        if (
            host === 'x.com' ||
            host.endsWith('.x.com') ||
            host === 'twitter.com' ||
            host.endsWith('.twitter.com') ||
            host === 't.co' ||
            host.endsWith('.twimg.com') ||
            host.endsWith('.google.com') ||
            host.endsWith('.apple.com')
        ) {
            return true;
        }
        return false;
    } catch (e) {
        return true;
    }
}

export function normalizeIncomingDeepLink(url) {
    if (!url || typeof url !== 'string') return 'https://x.com/home';
    try {
        const parsed = new URL(url);
        if (parsed.hostname.endsWith('twitter.com')) {
            parsed.hostname = 'x.com';
        }
        if (parsed.hostname.endsWith('x.com')) {
            return parsed.href;
        }
    } catch (e) {}
    return 'https://x.com/home';
}

let sharedCoordinatorInstance = null;

export default function App() {
    const webViewRef = useRef(null);
    const [canGoBack, setCanGoBack] = useState(false);
    const [currentUri, setCurrentUri] = useState('https://x.com/home');
    const [isReady, setIsReady] = useState(false);
    const [initialStorageSnapshot, setInitialStorageSnapshot] = useState({});
    const [pendingInvitesCount, setPendingInvitesCount] = useState(0);
    const [settingsVisible, setSettingsVisible] = useState(false);
    const [downloadToast, setDownloadToast] = useState(null);

    const videoDownloaderRef = useRef(new VideoDownloader());
    const coordinatorRef = useRef(null);

    const sendToWebView = useCallback((packet) => {
        if (!webViewRef.current) return;
        const js = `if (window.__X414_HANDLE_HOST_MESSAGE__) { window.__X414_HANDLE_HOST_MESSAGE__(${JSON.stringify(packet)}); } true;`;
        webViewRef.current.injectJavaScript(js);
    }, []);

    useEffect(() => {
        let mounted = true;
        const coordinator = new XHostCoordinator({
            asyncStorage: AsyncStorage,
            videoDownloader: videoDownloaderRef.current,
            sendToWebView,
            onOpenSettings: () => {
                if (mounted) setSettingsVisible(true);
            },
            onDownloadResult: (res) => {
                if (!mounted) return;
                if (res && res.success) {
                    setDownloadToast({
                        ok: true,
                        message: `Saved to Movies/${res.albumName || 'X414'}`,
                        fileUri: res.fileUri
                    });
                } else {
                    setDownloadToast({
                        ok: false,
                        message: res?.error || 'Video download failed'
                    });
                }
                setTimeout(() => {
                    if (mounted) setDownloadToast(null);
                }, 5000);
            },
            onNotification: async (syncDiff) => {
                await dispatchLocalNotifications(syncDiff);
                if (mounted && coordinatorRef.current) {
                    const pub = coordinatorRef.current.friendsSync.getPublicState();
                    setPendingInvitesCount(pub.pendingIncomingCount || 0);
                }
            }
        });

        coordinatorRef.current = coordinator;
        sharedCoordinatorInstance = coordinator;

        (async () => {
            await ensureAndroidNotificationChannels();
            await ensureNotificationPermissions();
            await coordinator.init();
            const snap = coordinator.storageAdapter.getSnapshot();
            const pub = coordinator.friendsSync.getPublicState();
            if (mounted) {
                setInitialStorageSnapshot(snap);
                setPendingInvitesCount(pub.pendingIncomingCount || 0);
                setIsReady(true);
            }
            // Start initial Nostr sync in background
            coordinator.friendsSync.syncWithRelays().then((updatedPub) => {
                if (mounted && updatedPub) {
                    setPendingInvitesCount(updatedPub.pendingIncomingCount || 0);
                }
            }).catch(() => {});

            // Register Android periodic background fetch task
            registerBackgroundSyncTask(async () => sharedCoordinatorInstance);
        })();

        // Periodic active sync loop (every 20s) for both Nostr Forced/Invite notifications and Regular X notifications
        const syncInterval = setInterval(() => {
            if (!mounted) return;
            if (coordinatorRef.current && !coordinatorRef.current.friendsSync.isSyncing) {
                coordinatorRef.current.friendsSync.syncWithRelays().then((pub) => {
                    if (mounted && pub) {
                        setPendingInvitesCount(pub.pendingIncomingCount || 0);
                    }
                }).catch(() => {});
            }
            if (webViewRef.current) {
                webViewRef.current.injectJavaScript(
                    `if (window.__X414_POLL_X_NOTIFICATIONS__) { window.__X414_POLL_X_NOTIFICATIONS__(); } true;`
                );
            }
        }, 20000);

        return () => {
            mounted = false;
            clearInterval(syncInterval);
        };
    }, [sendToWebView]);

    // Handle Android Pixel hardware/gesture Back navigation inside WebView
    useEffect(() => {
        if (Platform.OS !== 'android') return undefined;
        const sub = BackHandler.addEventListener('hardwareBackPress', () => {
            if (settingsVisible) {
                setSettingsVisible(false);
                return true;
            }
            if (canGoBack && webViewRef.current) {
                webViewRef.current.goBack();
                return true;
            }
            return false;
        });
        return () => sub.remove();
    }, [canGoBack, settingsVisible]);

    // Foreground resume Nostr relay sync & X badge check
    useEffect(() => {
        const sub = RNAppState.addEventListener('change', (nextState) => {
            if (nextState === 'active') {
                if (coordinatorRef.current) {
                    coordinatorRef.current.friendsSync.syncWithRelays().then((pub) => {
                        if (pub) setPendingInvitesCount(pub.pendingIncomingCount || 0);
                    }).catch(() => {});
                }
                if (webViewRef.current) {
                    webViewRef.current.injectJavaScript(
                        `if (window.__X414_POLL_X_NOTIFICATIONS__) { window.__X414_POLL_X_NOTIFICATIONS__(); } true;`
                    );
                }
            }
        });
        return () => sub.remove();
    }, []);

    // Handle incoming x.com / twitter.com deep links
    useEffect(() => {
        Linking.getInitialURL().then((initialUrl) => {
            if (initialUrl) {
                setCurrentUri(normalizeIncomingDeepLink(initialUrl));
            }
        }).catch(() => {});

        const sub = Linking.addEventListener('url', (event) => {
            if (event && event.url) {
                setCurrentUri(normalizeIncomingDeepLink(event.url));
            }
        });
        return () => sub.remove();
    }, []);

    // Handle tapping on local push notifications (forced post -> open tweet URL; X notif -> open /notifications; friend invite -> open SettingsBottomSheet)
    useEffect(() => {
        let sub = null;
        try {
            // eslint-disable-next-line global-require
            const Notifications = require('expo-notifications');
            const handleResponse = (response) => {
                const data = response?.notification?.request?.content?.data;
                if (!data) return;
                if (data.openSettings || data.type === 'friend_invite') {
                    setSettingsVisible(true);
                    return;
                }
                if (data.url) {
                    const target = normalizeIncomingDeepLink(data.url);
                    setCurrentUri(target);
                    if (webViewRef.current) {
                        webViewRef.current.injectJavaScript(`window.location.href = ${JSON.stringify(target)}; true;`);
                    }
                }
            };
            if (Notifications && typeof Notifications.getLastNotificationResponseAsync === 'function') {
                Notifications.getLastNotificationResponseAsync().then((res) => {
                    if (res) handleResponse(res);
                }).catch(() => {});
            }
            if (Notifications && typeof Notifications.addNotificationResponseReceivedListener === 'function') {
                sub = Notifications.addNotificationResponseReceivedListener(handleResponse);
            }
        } catch (e) {}
        return () => {
            if (sub && typeof sub.remove === 'function') sub.remove();
        };
    }, []);

    // Keep WebView's pending invite badge updated
    useEffect(() => {
        if (!webViewRef.current || !isReady) return;
        webViewRef.current.injectJavaScript(
            `if (window.__X414_UPDATE_PENDING_INVITES__) { window.__X414_UPDATE_PENDING_INVITES__(${Number(pendingInvitesCount || 0)}); } true;`
        );
    }, [pendingInvitesCount, isReady]);

    const injectedScript = buildWebViewInjectionScript(initialStorageSnapshot, {
        pendingIncomingCount: pendingInvitesCount
    });

    return (
        <SafeAreaView style={styles.container}>
            <StatusBar style="light" backgroundColor="#000000" />

            {isReady && (
                <WebView
                    ref={webViewRef}
                    source={{ uri: currentUri }}
                    style={styles.webview}
                    userAgent={PIXEL_CHROME_USER_AGENT}
                    javaScriptEnabled
                    domStorageEnabled
                    sharedCookiesEnabled
                    thirdPartyCookiesEnabled
                    allowsInlineMediaPlayback
                    mediaPlaybackRequiresUserAction={false}
                    allowsFullscreenVideo
                    pullToRefreshEnabled
                    forceDarkOn
                    setSupportMultipleWindows={false}
                    injectedJavaScriptBeforeContentLoaded={injectedScript}
                    injectedJavaScript={injectedScript}
                    onNavigationStateChange={(navState) => {
                        setCanGoBack(Boolean(navState.canGoBack));
                    }}
                    onShouldStartLoadWithRequest={(request) => {
                        const targetUrl = request?.url || '';
                        if (!targetUrl || targetUrl.startsWith('about:') || targetUrl.startsWith('blob:') || targetUrl.startsWith('data:')) {
                            return true;
                        }
                        if (isInternalXUrl(targetUrl)) {
                            return true;
                        }
                        Linking.openURL(targetUrl).catch(() => {});
                        return false;
                    }}
                    onMessage={(event) => {
                        const dataStr = event?.nativeEvent?.data;
                        if (dataStr && coordinatorRef.current) {
                            coordinatorRef.current.handleWebViewPacket(dataStr);
                        }
                    }}
                />
            )}

            {/* Video Download Toast with Quick Share Action */}
            {downloadToast && (
                <View style={[styles.toastBar, !downloadToast.ok && styles.toastBarError]}>
                    <Text style={styles.toastText} numberOfLines={1}>
                        {downloadToast.ok ? '✓ ' : '⚠ '}
                        {downloadToast.message}
                    </Text>
                    {downloadToast.ok && downloadToast.fileUri ? (
                        <TouchableOpacity
                            style={styles.toastShareBtn}
                            onPress={() => videoDownloaderRef.current.shareVideo(downloadToast.fileUri)}
                        >
                            <Text style={styles.toastShareText}>Share</Text>
                        </TouchableOpacity>
                    ) : null}
                </View>
            )}

            {/* Slide-Up Native Settings & Friends Sync Bottom Sheet */}
            <SettingsBottomSheet
                visible={settingsVisible}
                onClose={() => {
                    setSettingsVisible(false);
                    if (coordinatorRef.current) {
                        const pub = coordinatorRef.current.friendsSync.getPublicState();
                        setPendingInvitesCount(pub.pendingIncomingCount || 0);
                    }
                }}
                coordinator={coordinatorRef.current}
            />
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    container: {
        flex: 1,
        backgroundColor: '#000000'
    },
    webview: {
        flex: 1,
        backgroundColor: '#000000'
    },
    toastBar: {
        position: 'absolute',
        left: 16,
        right: 16,
        bottom: 72,
        backgroundColor: 'rgba(15, 20, 25, 0.96)',
        borderWidth: 1,
        borderColor: '#10b981',
        borderRadius: 14,
        paddingHorizontal: 14,
        paddingVertical: 11,
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        elevation: 8
    },
    toastBarError: {
        borderColor: '#ef4444'
    },
    toastText: {
        color: '#e7e9ea',
        fontSize: 13.5,
        fontWeight: '700',
        flex: 1,
        marginRight: 10
    },
    toastShareBtn: {
        backgroundColor: '#1d9bf0',
        paddingHorizontal: 12,
        paddingVertical: 6,
        borderRadius: 999
    },
    toastShareText: {
        color: '#ffffff',
        fontWeight: '800',
        fontSize: 12.5
    }
});
